"""Order operations and the stock movements they cause (plan §3.8; spec stories 28 to 37).

Everything runs inside the calling Restaurant's schema, so an id from another Restaurant is not
there and answers 404 (plan §3.9, item 7). Stock is checked and taken in one transaction with the
Inventory rows locked, so two Cashiers cannot oversell the last unit (spec story 29).
"""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from typing import NamedTuple, Optional

from django.db import connection, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from core import messages
from inventory.models import InventoryItem, RecipeIngredient
from menu.models import MenuItem
from orders.models import CancellationLog, Order

ZERO = Decimal("0")
FRAUD_CANCELLATIONS = 3  # by one Cashier ...
FRAUD_WINDOW = timedelta(hours=1)  # ... within this window trips the Fraud rule (spec story 48)
CUSTOMER_CASHIER = "QR"  # what a Customer order records as its cashier


class InsufficientStock(ValidationError):
    """400 naming the Menu items that could not be covered, in the order they were asked for."""

    def __init__(self, names: list):
        super().__init__(messages.INSUFFICIENT_STOCK.format(names=", ".join(names)))


def orders():
    return Order.objects.all()


def open_orders():
    return Order.objects.filter(status__in=Order.OPEN)


def order_or_404(order_id: int, message: str = messages.ORDER_NOT_FOUND) -> Order:
    """The legacy API had two spellings of "order not found"; each route keeps its own."""
    try:
        return Order.objects.get(pk=order_id)
    except Order.DoesNotExist:
        raise NotFound(message) from None


def _locked_order_or_404(order_id: int, message: str) -> Order:
    try:
        return Order.objects.select_for_update().get(pk=order_id)
    except Order.DoesNotExist:
        raise NotFound(message) from None


# --- creation ---------------------------------------------------------------------------------


def order_lines(items: list) -> list:
    """The JSON stored on the Order: the legacy shape with prices as numbers."""
    return [
        {
            "name": line["name"],
            "price": float(line["price"]),
            "category": line.get("category") or "",
            "modifiers": [
                {
                    "name": modifier["name"],
                    "price_delta": float(modifier.get("price_delta") or 0),
                    "inventory_item_id": modifier.get("inventory_item_id"),
                    "quantity_delta": float(modifier.get("quantity_delta") or 0),
                }
                for modifier in line.get("modifiers") or []
            ],
        }
        for line in items
    ]


def order_total(items: list) -> Decimal:
    """The legacy total: the sum of the line prices, one line per unit. The order drawer folds the
    chosen options' price deltas into each line's price before sending it."""
    return sum((Decimal(str(line["price"])) for line in items), ZERO)


@transaction.atomic
def create_order(
    *,
    items: list,
    table_number: int,
    cashier: str,
    notes: str,
    payment_method: Optional[str],
    client_id: Optional[str],
) -> Order:
    """Create an Order in one transaction: stock is checked and taken with the Inventory rows
    locked; a repeated Idempotency key returns the original Order without touching stock."""
    if client_id:
        _serialize_on(client_id)  # a concurrent replay waits here, then finds the original
        existing = Order.objects.filter(client_id=client_id).first()
        if existing is not None:
            return existing
    take_stock(items)
    return Order.objects.create(
        table_number=table_number,
        total_price=order_total(items),
        items=order_lines(items),
        cashier=cashier or "",
        notes=notes or "",
        payment_method=payment_method or None,
        client_id=client_id or None,
    )


def _serialize_on(key: str) -> None:
    """A transaction-scoped advisory lock on the Idempotency key, so two replays of one offline
    Order cannot both pass the "does it exist yet" check (spec story 30)."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [key])


def expand_quantity_lines(items: list) -> list:
    """Turn ``[{name, quantity}]`` into the legacy one-line-per-unit shape at the Restaurant's own
    menu prices; a name that is not on the menu is refused (spec: proposals never set prices)."""
    lines = []
    for item in items:
        menu_item = MenuItem.objects.filter(name=item["name"]).order_by("id").first()
        if menu_item is None:
            raise NotFound(messages.ORDER_ITEM_NOT_ON_MENU.format(name=item["name"]))
        lines.extend(
            {
                "name": menu_item.name,
                "price": menu_item.price,
                "category": menu_item.category,
                "modifiers": [],
            }
            for _ in range(item["quantity"])
        )
    return lines


# --- stock ------------------------------------------------------------------------------------


class StockDemand(NamedTuple):
    amounts: dict  # Inventory item id -> Decimal needed
    consumers: dict  # Inventory item id -> Menu item names that need it, in order asked


def stock_demand(items: list) -> StockDemand:
    """What a set of Order lines takes from stock: each line's Recipe (its own, or its parent's
    for a Variant without one), plus or minus its options' quantity deltas, floored at zero per
    line (grilling Q9). Lines match Menu items by name, as the payload carries names."""
    amounts: dict = defaultdict(Decimal)
    consumers: dict = defaultdict(list)
    recipes: dict = {}
    for line in items:
        per_line: dict = defaultdict(Decimal)
        for inventory_id, amount in _recipe_for(line["name"], recipes):
            per_line[inventory_id] += amount
        for modifier in line.get("modifiers") or []:
            inventory_id = modifier.get("inventory_item_id")
            delta = Decimal(str(modifier.get("quantity_delta") or 0))
            if inventory_id is not None and delta:
                per_line[inventory_id] += delta
        for inventory_id, amount in per_line.items():
            if amount > ZERO:
                amounts[inventory_id] += amount
                if line["name"] not in consumers[inventory_id]:
                    consumers[inventory_id].append(line["name"])
    return StockDemand(dict(amounts), dict(consumers))


def _recipe_for(name: str, cache: dict) -> list:
    if name not in cache:
        cache[name] = _recipe_lines(MenuItem.objects.filter(name=name).order_by("id").first())
    return cache[name]


def _recipe_lines(menu_item: Optional[MenuItem]) -> list:
    if menu_item is None:
        return []  # not on the menu (renamed since, or a free-text line): nothing to take
    lines = list(
        RecipeIngredient.objects.filter(menu_item=menu_item).values_list(
            "inventory_item_id", "amount"
        )
    )
    if not lines and menu_item.parent_id is not None:  # a Variant inherits (spec story 13)
        return _recipe_lines(MenuItem.objects.filter(pk=menu_item.parent_id).first())
    return lines


def take_stock(items: list) -> None:
    """Lock the Inventory rows the lines need, refuse if any is short, deduct otherwise. Must run
    inside a transaction; a refusal rolls the caller back."""
    demand = stock_demand(items)
    if not demand.amounts:
        return
    locked = {
        item.pk: item
        for item in InventoryItem.objects.select_for_update().filter(pk__in=demand.amounts)
    }
    short: list = []
    for inventory_id, needed in demand.amounts.items():
        item = locked.get(inventory_id)  # an unknown id (not this Restaurant's) takes nothing
        if item is not None and item.quantity < needed:
            short.extend(n for n in demand.consumers[inventory_id] if n not in short)
    if short:
        raise InsufficientStock(short)
    for inventory_id, needed in demand.amounts.items():
        item = locked.get(inventory_id)
        if item is not None:
            item.quantity = max(ZERO, item.quantity - needed)
            item.save(update_fields=["quantity"])


def return_stock(items: list) -> None:
    """Put back what ``take_stock`` took for these lines (a cancelled or edited Order)."""
    demand = stock_demand(items)
    for item in InventoryItem.objects.select_for_update().filter(pk__in=demand.amounts):
        item.quantity += demand.amounts[item.pk]
        item.save(update_fields=["quantity"])


# --- changes ----------------------------------------------------------------------------------


@transaction.atomic
def edit_order(order_id: int, *, items: list, table_number: int, notes: str) -> Order:
    """Rewrite an Order's lines while it is preparing, rebalancing stock: the old lines' stock
    comes back, the new lines' stock is taken, and a shortage undoes both (spec story 32)."""
    order = _locked_order_or_404(order_id, messages.ORDER_NOT_FOUND)
    if order.status != Order.Status.PREPARING:
        raise ValidationError(messages.ORDER_NOT_EDITABLE)
    return_stock(order.items)
    take_stock(items)
    order.items = order_lines(items)
    order.total_price = order_total(items)
    order.table_number = table_number
    order.notes = notes or ""
    order.save(update_fields=["items", "total_price", "table_number", "notes"])
    return order


def set_status(order_id: int, status: str, *, not_found: str = messages.ORDER_NOT_FOUND) -> Order:
    """Move an Open order between preparing, ready, served and done. Done and cancelled are
    final (spec)."""
    order = order_or_404(order_id, not_found)
    if not order.is_open:
        raise ValidationError(messages.ORDER_CLOSED)
    order.status = status
    order.save(update_fields=["status"])
    return order


def record_payment(order_id: int, payment_method: str) -> Order:
    """Record how an Order was paid: a plain row update, safe under the frontend's parallel calls
    for one Table (plan §3.8). A cancelled Order cannot be paid."""
    order = order_or_404(order_id)
    if order.status == Order.Status.CANCELLED:
        raise ValidationError(messages.ORDER_CLOSED)
    Order.objects.filter(pk=order_id).update(payment_method=payment_method)
    order.payment_method = payment_method
    return order


class Cancellation(NamedTuple):
    order: Order
    cashier: str
    fraud_alert: bool  # the rule tripped; ticket 10 dispatches the alert


@transaction.atomic
def cancel_order(order_id: int, *, cashier: str, not_found: str) -> Cancellation:
    """Cancel an Open order from either cancel route, returning stock only while it was still
    preparing (grilling Q8), and log who did it for the Fraud rule (spec stories 33, 34, 48)."""
    order = _locked_order_or_404(order_id, not_found)
    if order.status == Order.Status.CANCELLED:
        raise ValidationError(messages.ORDER_ALREADY_CANCELLED)
    if order.status == Order.Status.DONE:
        raise ValidationError(messages.ORDER_CLOSED)
    if order.status == Order.Status.PREPARING:
        return_stock(order.items)
    order.status = Order.Status.CANCELLED
    order.save(update_fields=["status"])
    CancellationLog.objects.create(order=order, cashier=cashier)
    return Cancellation(order, cashier, fraud_rule_tripped(cashier))


def fraud_rule_tripped(cashier: str) -> bool:
    """Three or more cancellations by one Cashier within an hour, this one included."""
    since = timezone.now() - FRAUD_WINDOW
    recent = CancellationLog.objects.filter(cashier=cashier, cancelled_at__gte=since).count()
    return recent >= FRAUD_CANCELLATIONS

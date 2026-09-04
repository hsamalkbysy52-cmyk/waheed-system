"""Inventory and Recipe operations, plus the stock arithmetic the menu and the orders share.

Everything runs inside the calling Restaurant's schema: an id from another Restaurant is simply
not there and answers 404 (plan §3.9, item 7).
"""

from collections.abc import Iterable
from decimal import Decimal
from typing import NamedTuple, Optional

from django.db import transaction
from django.db.models import F, Prefetch
from rest_framework.exceptions import NotFound

from core import messages
from inventory.models import InventoryItem, RecipeIngredient
from menu import services as menu_services


def inventory_items():
    return InventoryItem.objects.all()


def low_stock_items():
    """Inventory items at or below their minimum (spec story 17; the Report agent's tool)."""
    return InventoryItem.objects.filter(quantity__lte=F("min_quantity"))


def inventory_item_or_404(item_id: int) -> InventoryItem:
    try:
        return InventoryItem.objects.get(pk=item_id)
    except InventoryItem.DoesNotExist:
        raise NotFound(messages.INVENTORY_ITEM_NOT_FOUND) from None


def linked_inventory_item_or_404(item_id: int) -> InventoryItem:
    """The same lookup when a Recipe or a Modifier option names the Inventory item: the legacy
    API had its own message for that case, and the frontend shows it."""
    try:
        return InventoryItem.objects.get(pk=item_id)
    except InventoryItem.DoesNotExist:
        raise NotFound(messages.LINKED_INVENTORY_ITEM_NOT_FOUND) from None


def add_item(*, name: str, unit: str, quantity: Decimal, min_quantity: Decimal) -> InventoryItem:
    return InventoryItem.objects.create(
        name=name, unit=unit, quantity=quantity, min_quantity=min_quantity
    )


def edit_item(
    item_id: int, *, name: str, unit: str, quantity: Decimal, min_quantity: Decimal
) -> InventoryItem:
    edited = inventory_item_or_404(item_id)
    edited.name, edited.unit, edited.quantity, edited.min_quantity = (
        name,
        unit,
        quantity,
        min_quantity,
    )
    edited.save(update_fields=["name", "unit", "quantity", "min_quantity"])
    return edited


def delete_item(item_id: int) -> None:
    """Delete an Inventory item; its Recipe lines go with it and Modifier options that consumed
    it keep working without a stock effect (SET_NULL)."""
    inventory_item_or_404(item_id).delete()


def recipe_of(menu_item_id: int):
    """A Menu item's own Recipe lines with their Inventory items. A Variant's inherited Recipe is
    materialised on the menu, not here, where it would look editable in its own right."""
    menu_services.item_or_404(menu_item_id)
    return RecipeIngredient.objects.filter(menu_item_id=menu_item_id).select_related(
        "inventory_item"
    )


@transaction.atomic
def save_recipe(menu_item_id: int, ingredients: list) -> None:
    """Replace a Menu item's whole Recipe (route 34). Every Inventory item must be this
    Restaurant's; an empty list clears the Recipe."""
    menu_item = menu_services.item_or_404(menu_item_id)
    wanted = {ingredient["inventory_item_id"] for ingredient in ingredients}
    owned = set(InventoryItem.objects.filter(pk__in=wanted).values_list("pk", flat=True))
    if wanted - owned:
        raise NotFound(messages.LINKED_INVENTORY_ITEM_NOT_FOUND)
    RecipeIngredient.objects.filter(menu_item=menu_item).delete()
    RecipeIngredient.objects.bulk_create(
        RecipeIngredient(
            menu_item=menu_item,
            inventory_item_id=ingredient["inventory_item_id"],
            amount=ingredient["amount"],
        )
        for ingredient in ingredients
    )


def recipe_prefetch() -> Prefetch:
    """Prefetch a queryset's Recipes with their Inventory items in one query (plan §4)."""
    return Prefetch("recipe", queryset=RecipeIngredient.objects.select_related("inventory_item"))


class StockStatus(NamedTuple):
    out_of_stock: bool
    max_qty: Optional[int]


NO_RECIPE = StockStatus(out_of_stock=False, max_qty=None)


def stock_status(recipe: Iterable[RecipeIngredient]) -> StockStatus:
    """What the menu says about a Recipe (spec story 18), computed in memory from prefetched lines.

    Out of stock when any ingredient cannot cover one serving; ``max_qty`` is the fewest servings
    any ingredient allows. Both follow the legacy arithmetic: a line whose amount is zero never
    limits the servings, and a Menu item without a Recipe is never Out of stock.
    """
    lines = list(recipe)
    if not lines:
        return NO_RECIPE
    out_of_stock = any(line.inventory_item.quantity < line.amount for line in lines)
    servings = [
        int(line.inventory_item.quantity / line.amount) for line in lines if line.amount > 0
    ]
    return StockStatus(out_of_stock, min(servings) if servings else None)

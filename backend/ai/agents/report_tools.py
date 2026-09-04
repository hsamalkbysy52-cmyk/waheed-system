"""What the Report agent may look up (spec story 21): a handful of read-only queries over the
Restaurant's own Orders, Inventory and Cancellation log, "today" in the Restaurant's timezone.

Every tool returns plain JSON-friendly data; the model turns it into Arabic prose.
"""

from collections import Counter, defaultdict
from datetime import timedelta
from decimal import Decimal
from typing import NamedTuple, Optional
from zoneinfo import ZoneInfo

from django.utils import timezone

from ai.providers.base import ToolSpec
from inventory.services import low_stock_items
from orders.models import CancellationLog, Order
from tenants.models import Restaurant

PERIODS = ("today", "yesterday", "week", "month", "all")
PERIOD_SCHEMA = {
    "type": "string",
    "enum": list(PERIODS),
    "description": "today, yesterday, the last 7 days (week), the last 30 days (month), or all",
}


class Period(NamedTuple):
    start: Optional[object]  # aware datetime, or None for "all"
    end: Optional[object]


def period_bounds(restaurant: Restaurant, period: str) -> Period:
    """Local-day boundaries in the Restaurant's timezone (grilling Q11)."""
    tz = ZoneInfo(restaurant.timezone)
    today = timezone.now().astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "today":
        return Period(today, today + timedelta(days=1))
    if period == "yesterday":
        return Period(today - timedelta(days=1), today)
    if period == "week":
        return Period(today - timedelta(days=6), today + timedelta(days=1))
    if period == "month":
        return Period(today - timedelta(days=29), today + timedelta(days=1))
    return Period(None, None)


def _orders_in(restaurant: Restaurant, period: str):
    bounds = period_bounds(restaurant, period)
    orders = Order.objects.all()
    if bounds.start is not None:
        orders = orders.filter(created_at__gte=bounds.start, created_at__lt=bounds.end)
    return orders


def _money(amount) -> float:
    return float(amount or 0)


class ReportTools:
    """The tool set bound to one Restaurant; ``run(name, arguments)`` dispatches a model's call."""

    def __init__(self, restaurant: Restaurant):
        self.restaurant = restaurant

    def specs(self) -> list:
        period = {"type": "object", "properties": {"period": PERIOD_SCHEMA}, "required": ["period"]}
        return [
            ToolSpec(
                "sales_summary",
                "Revenue and order counts for a period. Revenue counts paid, non-cancelled orders.",
                period,
            ),
            ToolSpec(
                "top_items",
                "Best-selling menu items for a period, by units sold.",
                {
                    "type": "object",
                    "properties": {
                        "period": PERIOD_SCHEMA,
                        "limit": {"type": "integer", "minimum": 1, "maximum": 20},
                    },
                    "required": ["period"],
                },
            ),
            ToolSpec(
                "low_stock",
                "Inventory items at or below their minimum quantity, right now.",
                {"type": "object", "properties": {}},
            ),
            ToolSpec("cancellations", "Cancelled orders for a period, by cashier.", period),
            ToolSpec(
                "order_status_counts",
                "How many orders are in each status for a period.",
                period,
            ),
        ]

    def run(self, name: str, arguments: dict):
        tool = getattr(self, name, None)
        if tool is None or name.startswith("_") or name in ("specs", "run"):
            return {"error": f"unknown tool {name}"}
        arguments = dict(arguments or {})
        if "period" in arguments and arguments["period"] not in PERIODS:
            arguments["period"] = "today"
        return tool(**arguments)

    # --- the tools ---------------------------------------------------------------------------

    def sales_summary(self, period: str = "today") -> dict:
        orders = list(_orders_in(self.restaurant, period))
        paid = [o for o in orders if o.is_paid and o.status != Order.Status.CANCELLED]
        revenue = sum((o.total_price for o in paid), Decimal("0"))
        return {
            "period": period,
            "currency": self.restaurant.currency,
            "revenue": _money(revenue),
            "paid_orders": len(paid),
            "orders": len(orders),
            "cancelled_orders": sum(o.status == Order.Status.CANCELLED for o in orders),
            "average_ticket": _money(revenue / len(paid)) if paid else 0.0,
        }

    def top_items(self, period: str = "today", limit: int = 5) -> dict:
        units: Counter = Counter()
        revenue: dict = defaultdict(Decimal)
        for order in _orders_in(self.restaurant, period).exclude(status=Order.Status.CANCELLED):
            for line in order.items or []:
                units[line.get("name", "?")] += 1
                revenue[line.get("name", "?")] += Decimal(str(line.get("price") or 0))
        rows = [
            {"name": name, "units": count, "revenue": _money(revenue[name])}
            for name, count in units.most_common(max(1, min(int(limit), 20)))
        ]
        return {"period": period, "items": rows}

    def low_stock(self) -> dict:
        rows = [
            {
                "name": item.name,
                "quantity": _money(item.quantity),
                "min_quantity": _money(item.min_quantity),
                "unit": item.unit,
            }
            for item in low_stock_items()
        ]
        return {"items": rows}

    def cancellations(self, period: str = "today") -> dict:
        bounds = period_bounds(self.restaurant, period)
        logs = CancellationLog.objects.all()
        if bounds.start is not None:
            logs = logs.filter(cancelled_at__gte=bounds.start, cancelled_at__lt=bounds.end)
        by_cashier = Counter(logs.values_list("cashier", flat=True))
        return {
            "period": period,
            "count": sum(by_cashier.values()),
            "by_cashier": [{"cashier": c, "count": n} for c, n in by_cashier.most_common()],
        }

    def order_status_counts(self, period: str = "today") -> dict:
        counts = Counter(_orders_in(self.restaurant, period).values_list("status", flat=True))
        return {
            "period": period,
            **{status: counts.get(status, 0) for status in Order.Status.values},
        }

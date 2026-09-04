"""Orders of one Restaurant and the log of their cancellations (CONTEXT.md).

An Order keeps its lines as JSON in the legacy shape, one entry per unit sold, with the name and
price captured at order time (spec). Lives in the Restaurant's schema (ADR-0001, plan §3.7).
"""

from django.db import models
from django.utils import timezone

from core.money import amount_field


class Order(models.Model):
    class Status(models.TextChoices):
        PREPARING = "preparing"
        READY = "ready"
        SERVED = "served"
        DONE = "done"
        CANCELLED = "cancelled"

    class PaymentMethod(models.TextChoices):
        CASH = "cash"
        CARD = "card"
        QR = "qr"

    # Open orders are on the kanban; done is closed, cancelled is void (spec: pending is retired).
    OPEN = (Status.PREPARING, Status.READY, Status.SERVED)

    table_number = models.IntegerField(default=1)
    total_price = amount_field(default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PREPARING)
    created_at = models.DateTimeField(default=timezone.now)
    # [{name, price, category, modifiers: [{name, price_delta, inventory_item_id, quantity_delta}]}]
    items = models.JSONField(default=list)
    cashier = models.CharField(max_length=100, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    # Paid means a method is recorded; NULL is "unpaid", independent of status (grilling Q7).
    payment_method = models.CharField(  # noqa: DJ001
        max_length=10, choices=PaymentMethod.choices, null=True, blank=True
    )
    # The Idempotency key the offline queue replays with; unique inside the schema, so two
    # Restaurants may use the same UUID.
    # NULL rather than "" so Orders without a key never collide on the unique index.
    client_id = models.CharField(max_length=36, null=True, blank=True, unique=True)  # noqa: DJ001

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"Order {self.pk} ({self.status})"

    @property
    def is_open(self) -> bool:
        return self.status in self.OPEN

    @property
    def is_paid(self) -> bool:
        return self.payment_method is not None


class CancellationLog(models.Model):
    """Who cancelled which Order and when; the Fraud rule counts these (spec stories 34, 48)."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="cancellations")
    cashier = models.CharField(max_length=100)
    cancelled_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.cashier} cancelled order {self.order_id}"

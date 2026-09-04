"""The menu of one Restaurant: it lives in that Restaurant's schema, so nothing here carries a
Restaurant marker — isolation is the schema itself (ADR-0001, plan §3.7)."""

from django.db import models


class MenuItem(models.Model):
    """A dish, or a Variant of one when ``parent`` is set (CONTEXT.md).

    Deleting a dish takes its Variants with it, as the legacy API did explicitly. Money is Decimal
    with three decimals: JOD is a three-decimal currency (plan §3.7).
    """

    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=12, decimal_places=3)
    category = models.CharField(max_length=50)
    is_available = models.BooleanField(default=True)
    description = models.TextField(blank=True, default="")
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="variants"
    )

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return self.name


class ModifierGroup(models.Model):
    """A set of choices offered with a Menu item ("الإضافات"), shown in the saved order."""

    menu_item = models.ForeignKey(
        MenuItem, on_delete=models.CASCADE, related_name="modifier_groups"
    )
    name = models.CharField(max_length=100)
    max_selections = models.PositiveSmallIntegerField(default=1)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return self.name


class ModifierOption(models.Model):
    """One choice inside a Modifier group, with its price delta and its effect on stock."""

    group = models.ForeignKey(ModifierGroup, on_delete=models.CASCADE, related_name="options")
    name = models.CharField(max_length=100)
    price_delta = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    # Ticket 06 replaces this with a FK to inventory.InventoryItem (SET_NULL) and refuses an id
    # that belongs to no Inventory item; the Inventory app does not exist yet (plan §3.7).
    inventory_item_id = models.IntegerField(null=True, blank=True)
    quantity_delta = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return self.name

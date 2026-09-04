"""Stock of one Restaurant: Inventory items and the Recipes that consume them (CONTEXT.md).

Lives in the Restaurant's schema like the menu, so nothing here carries a Restaurant marker
(ADR-0001, plan §3.7).
"""

from django.db import models

from core.money import amount_field

DEFAULT_UNIT = "قطعة"


class InventoryItem(models.Model):
    """Something the kitchen keeps in stock, counted in its own unit.

    Quantities are Decimal(12, 3) like money: a Recipe takes 0.2 kg of meat per burger, and stock
    is deducted per Order line in ticket 08.
    """

    name = models.CharField(max_length=100)
    unit = models.CharField(max_length=50, default=DEFAULT_UNIT)
    quantity = amount_field(default=0)
    min_quantity = amount_field(default=5)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return self.name

    @property
    def is_low_stock(self) -> bool:
        """Low stock: at or below the minimum (spec story 17)."""
        return self.quantity <= self.min_quantity


class RecipeIngredient(models.Model):
    """One line of a Menu item's Recipe: how much of one Inventory item a serving consumes.

    Deleting the Menu item or the Inventory item removes the line (plan §3.7); a Menu item names
    each Inventory item at most once.
    """

    menu_item = models.ForeignKey("menu.MenuItem", on_delete=models.CASCADE, related_name="recipe")
    inventory_item = models.ForeignKey(
        InventoryItem, on_delete=models.CASCADE, related_name="recipe_lines"
    )
    amount = amount_field()

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["menu_item", "inventory_item"], name="one_line_per_ingredient"
            )
        ]

    def __str__(self) -> str:
        return f"{self.amount} {self.inventory_item.unit} {self.inventory_item.name}"

"""Input validation and output shaping for the inventory routes (plan §1.3, routes 29 to 34).

Payloads are the legacy ones: the inventory form always sends all four fields, the recipe editor
sends ``{ingredients: [{inventory_item_id, amount}]}`` and replaces the whole Recipe.
"""

from decimal import Decimal

from rest_framework import serializers

from core import messages
from core.money import amount_payload_field
from inventory.models import DEFAULT_UNIT, InventoryItem, RecipeIngredient


class InventoryItemPayloadSerializer(serializers.Serializer):
    """``POST /inventory/add`` and ``PUT /inventory/{id}``, with the legacy defaults."""

    name = serializers.CharField(max_length=100)
    unit = serializers.CharField(max_length=50, required=False, default=DEFAULT_UNIT)
    quantity = amount_payload_field(required=False, default=Decimal("0"))
    min_quantity = amount_payload_field(required=False, default=Decimal("5"))


class IngredientSerializer(serializers.Serializer):
    inventory_item_id = serializers.IntegerField()
    amount = amount_payload_field(min_value=Decimal("0"))


class RecipePayloadSerializer(serializers.Serializer):
    ingredients = IngredientSerializer(many=True)

    def validate_ingredients(self, ingredients: list) -> list:
        """The database allows one line per Inventory item; refuse a duplicate before it becomes
        a 500 (the legacy API stored both lines)."""
        ids = [ingredient["inventory_item_id"] for ingredient in ingredients]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError(messages.RECIPE_DUPLICATE_INGREDIENT)
        return ingredients


def serialize_inventory_item(item: InventoryItem) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "unit": item.unit,
        "quantity": item.quantity,
        "min_quantity": item.min_quantity,
    }


def serialize_recipe_line(line: RecipeIngredient) -> dict:
    """The legacy shape: ``inventory_name`` and ``unit`` are denormalised for the editor."""
    return {
        "id": line.id,
        "inventory_item_id": line.inventory_item_id,
        "amount": line.amount,
        "inventory_name": line.inventory_item.name,
        "unit": line.inventory_item.unit,
    }

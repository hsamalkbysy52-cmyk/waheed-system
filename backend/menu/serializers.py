"""Input validation and output shaping for the menu routes.

The payloads are the legacy ones, field for field, because the frontend still sends them: the edit
form omits ``description`` when it is empty and never sends ``parent_id``, and the variant form
sends ``parent_id`` without a description.
"""

from rest_framework import serializers

from core.money import amount_payload_field
from menu.models import MenuItem, ModifierGroup, ModifierOption


class MenuItemEditSerializer(serializers.Serializer):
    """What ``PUT /menu/{id}`` changes. A Variant keeps its parent: the legacy API ignored
    ``parent_id`` here, and the frontend's edit form does not send it."""

    name = serializers.CharField(max_length=100)
    price = amount_payload_field()
    category = serializers.CharField(max_length=50)
    # Omitted means empty, as in the legacy API: the edit form drops the field when it is cleared.
    description = serializers.CharField(required=False, allow_blank=True, default="")


class MenuItemPayloadSerializer(MenuItemEditSerializer):
    """``POST /menu/add``: the same, plus the dish a Variant hangs under."""

    parent_id = serializers.IntegerField(required=False, allow_null=True, default=None)


class ModifierGroupPayloadSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    # The legacy default; one selection is the smallest group that means anything.
    max_selections = serializers.IntegerField(required=False, min_value=1, default=1)


class ModifierOptionEditSerializer(serializers.Serializer):
    """The legacy edit payload: name and price only, never the inventory link."""

    name = serializers.CharField(max_length=100)
    price_delta = amount_payload_field(required=False, default=0)


class ModifierOptionPayloadSerializer(ModifierOptionEditSerializer):
    """Creating an option adds what it does to stock (ticket 06 checks the Inventory item)."""

    inventory_item_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    quantity_delta = amount_payload_field(required=False, default=0)


class ReorderSerializer(serializers.Serializer):
    order = serializers.ListField(child=serializers.IntegerField())


def serialize_menu(items) -> list:
    """The whole menu: dishes in id order, each with its Variants nested (plan §1.3, route 2).

    A Variant shows its parent's Modifier groups when it defines none of its own (spec story 13),
    so the frontend renders the same choices without repeating the setup.
    """
    variants_by_parent: dict = {}
    dishes = []
    for item in items:
        if item.parent_id is None:
            dishes.append(item)
        else:
            variants_by_parent.setdefault(item.parent_id, []).append(item)
    return [
        {
            **serialize_item(dish, dish.modifier_groups.all()),
            "variants": [
                serialize_item(variant, _groups_of(variant, dish))
                for variant in variants_by_parent.get(dish.id, [])
            ],
        }
        for dish in dishes
    ]


def serialize_item(item: MenuItem, groups) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "price": item.price,
        "category": item.category,
        "is_available": item.is_available,
        "description": item.description,
        "parent_id": item.parent_id,
        # Both are computed from Recipes, which arrive with ticket 06.
        "out_of_stock": False,
        "max_qty": None,
        "modifiers": [serialize_group(group) for group in groups],
    }


def serialize_group(group: ModifierGroup) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "max_selections": group.max_selections,
        "options": [serialize_option(option) for option in group.options.all()],
    }


def serialize_option(option: ModifierOption) -> dict:
    return {
        "id": option.id,
        "name": option.name,
        "price_delta": option.price_delta,
        "inventory_item_id": option.inventory_item_id,
        "quantity_delta": option.quantity_delta,
    }


def _groups_of(variant: MenuItem, dish: MenuItem):
    own = variant.modifier_groups.all()
    return own if own else dish.modifier_groups.all()

"""Inventory and Recipe routes (plan §1.3, routes 29 to 34).

Staff read stock and Recipes; only the Restaurant's Admin changes them (plan §3.4). Route 35,
``POST /inventory/deduct/{order_id}``, is gone on purpose: stock is taken when an Order is created
(grilling Q12).
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core import messages
from core.decorators import admin_only_for, tenant_required
from core.permissions import IsRestaurantAdmin
from core.responses import ok
from inventory import services
from inventory.serializers import (
    InventoryItemPayloadSerializer,
    RecipePayloadSerializer,
    serialize_inventory_item,
    serialize_recipe_line,
)

ADMIN_ONLY = [IsAuthenticated, IsRestaurantAdmin]


def _validated(serializer_class, request) -> dict:
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@tenant_required
def inventory_list(request):
    return ok({"items": [serialize_inventory_item(item) for item in services.inventory_items()]})


@api_view(["POST"])
@permission_classes(ADMIN_ONLY)
@tenant_required
def inventory_add(request):
    item = services.add_item(**_validated(InventoryItemPayloadSerializer, request))
    return ok({"message": messages.INVENTORY_ITEM_ADDED.format(name=item.name), "id": item.id})


@api_view(["PUT", "DELETE"])
@permission_classes(ADMIN_ONLY)
@tenant_required
def inventory_edit_or_delete(request, item_id: int):
    if request.method == "DELETE":
        services.delete_item(item_id)  # its Recipe lines go with it
        return ok({"message": messages.INVENTORY_ITEM_DELETED})
    services.edit_item(item_id, **_validated(InventoryItemPayloadSerializer, request))
    return ok({"message": messages.INVENTORY_ITEM_EDITED})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@admin_only_for("POST")
@tenant_required
def menu_item_recipe(request, menu_item_id: int):
    if request.method == "POST":
        services.save_recipe(menu_item_id, **_validated(RecipePayloadSerializer, request))
        return ok({"message": messages.RECIPE_SAVED})
    lines = services.recipe_of(menu_item_id)
    return ok({"recipe": [serialize_recipe_line(line) for line in lines]})

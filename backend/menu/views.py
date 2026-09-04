"""Menu, Variant and Modifier routes (plan §1.3, routes 2 to 15).

``GET /menu`` is the one route customers reach with a Slug; the rest need a token, and every
mutation needs the Restaurant's Admin (plan §3.4). The legacy paths carry two methods each in
places, so those views dispatch on the method rather than inventing new paths.
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated

from core import messages
from core.decorators import public_tenant_allowed, tenant_required
from core.permissions import IsRestaurantAdmin
from core.responses import ok
from menu import services
from menu.serializers import (
    MenuItemPayloadSerializer,
    ModifierGroupPayloadSerializer,
    ModifierOptionEditSerializer,
    ModifierOptionPayloadSerializer,
    ReorderSerializer,
    serialize_group,
    serialize_menu,
)

ADMIN_ONLY = [IsAuthenticated, IsRestaurantAdmin]


def validated(serializer_class, request) -> dict:
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


@api_view(["GET"])
@permission_classes([AllowAny])
@public_tenant_allowed
@tenant_required
def menu_list(request):
    return ok({"menu": serialize_menu(services.menu_items())})


@api_view(["POST"])
@permission_classes(ADMIN_ONLY)
@tenant_required
def menu_add(request):
    item = services.add_item(**validated(MenuItemPayloadSerializer, request))
    return ok({"message": messages.MENU_ITEM_ADDED.format(name=item.name), "id": item.id})


@api_view(["PUT", "DELETE"])
@permission_classes(ADMIN_ONLY)
@tenant_required
def menu_edit_or_delete(request, item_id: int):
    if request.method == "DELETE":
        services.delete_item(item_id)  # its Variants, groups and options go with it
        return ok({"message": messages.MENU_ITEM_DELETED})
    payload = validated(MenuItemPayloadSerializer, request)
    payload.pop("parent_id")  # a Variant keeps its parent; the legacy API ignored it here too
    services.edit_item(item_id, **payload)
    return ok({"message": messages.MENU_ITEM_EDITED})


@api_view(["PUT"])
@permission_classes(ADMIN_ONLY)
@tenant_required
def menu_toggle(request, item_id: int):
    item = services.toggle_item(item_id)
    return ok({"message": messages.MENU_ITEM_TOGGLED, "is_available": item.is_available})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@tenant_required
def item_modifier_groups(request, item_id: int):
    """A Menu item's own groups. A Variant's inherited groups are materialised on the menu, not
    here, where they would look editable in their own right (spec story 13)."""
    if request.method == "POST":
        require_admin(request)
        group = services.create_group(item_id, **validated(ModifierGroupPayloadSerializer, request))
        return ok({"message": messages.MODIFIER_GROUP_CREATED, "id": group.id})
    groups = services.item(item_id).modifier_groups.all()
    return ok({"groups": [serialize_group(group) for group in groups]})


@api_view(["PUT", "DELETE"])
@permission_classes(ADMIN_ONLY)
@tenant_required
def modifier_group_edit_or_delete(request, group_id: int):
    if request.method == "DELETE":
        services.delete_group(group_id)  # its options go with it
        return ok({"message": messages.MODIFIER_GROUP_DELETED})
    services.edit_group(group_id, **validated(ModifierGroupPayloadSerializer, request))
    return ok({"message": messages.MODIFIER_GROUP_EDITED})


@api_view(["POST"])
@permission_classes(ADMIN_ONLY)
@tenant_required
def modifier_option_create(request, group_id: int):
    option = services.create_option(group_id, **validated(ModifierOptionPayloadSerializer, request))
    return ok({"message": messages.MODIFIER_OPTION_ADDED, "id": option.id})


@api_view(["PUT", "DELETE"])
@permission_classes(ADMIN_ONLY)
@tenant_required
def modifier_option_edit_or_delete(request, option_id: int):
    if request.method == "DELETE":
        services.delete_option(option_id)
        return ok({"message": messages.MODIFIER_OPTION_DELETED})
    services.edit_option(option_id, **validated(ModifierOptionEditSerializer, request))
    return ok({"message": messages.MODIFIER_OPTION_EDITED})


@api_view(["PUT"])
@permission_classes(ADMIN_ONLY)
@tenant_required
def modifier_groups_reorder(request, item_id: int):
    services.reorder_groups(item_id, **validated(ReorderSerializer, request))
    return ok({"message": messages.MODIFIER_GROUPS_REORDERED})


@api_view(["PUT"])
@permission_classes(ADMIN_ONLY)
@tenant_required
def modifier_options_reorder(request, group_id: int):
    services.reorder_options(group_id, **validated(ReorderSerializer, request))
    return ok({"message": messages.MODIFIER_OPTIONS_REORDERED})


def require_admin(request) -> None:
    """The Admin-only half of a path whose other method any staff member may call (plan §3.4)."""
    permission = IsRestaurantAdmin()
    if not permission.has_permission(request, None):
        raise PermissionDenied(permission.message)

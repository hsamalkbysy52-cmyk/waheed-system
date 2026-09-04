"""Menu operations. Everything here runs inside the calling Restaurant's schema, so a row that
belongs to another Restaurant is simply not there: cross-Restaurant ids answer 404 by construction
(plan §3.9, item 7)."""

from decimal import Decimal
from typing import Optional

from rest_framework.exceptions import NotFound

from core import messages
from inventory import services as inventory_services  # module import: the two import each other
from menu.models import MenuItem, ModifierGroup, ModifierOption


def menu_items():
    """Every Menu item with its groups, options and Recipe lines, in four queries (plan §4)."""
    return MenuItem.objects.prefetch_related(
        "modifier_groups__options", inventory_services.recipe_prefetch()
    )


def item_or_404(item_id: int) -> MenuItem:
    try:
        return MenuItem.objects.get(pk=item_id)
    except MenuItem.DoesNotExist:
        raise NotFound(messages.MENU_ITEM_NOT_FOUND) from None


def group_or_404(group_id: int) -> ModifierGroup:
    try:
        return ModifierGroup.objects.get(pk=group_id)
    except ModifierGroup.DoesNotExist:
        raise NotFound(messages.MODIFIER_GROUP_NOT_FOUND) from None


def option_or_404(option_id: int) -> ModifierOption:
    try:
        return ModifierOption.objects.get(pk=option_id)
    except ModifierOption.DoesNotExist:
        raise NotFound(messages.MODIFIER_OPTION_NOT_FOUND) from None


def add_item(
    *, name: str, price: Decimal, category: str, description: str, parent_id: Optional[int]
) -> MenuItem:
    """Add a dish, or a Variant when ``parent_id`` names one of this Restaurant's dishes."""
    parent = item_or_404(parent_id) if parent_id is not None else None
    return MenuItem.objects.create(
        name=name, price=price, category=category, description=description, parent=parent
    )


def edit_item(
    item_id: int, *, name: str, price: Decimal, category: str, description: str
) -> MenuItem:
    """Rename, reprice and recategorise a Menu item. A Variant keeps its parent: the legacy API
    ignored ``parent_id`` here too, and the frontend's edit form does not send it."""
    edited = item_or_404(item_id)
    edited.name, edited.price, edited.category, edited.description = (
        name,
        price,
        category,
        description,
    )
    edited.save(update_fields=["name", "price", "category", "description"])
    return edited


def delete_item(item_id: int) -> None:
    """Delete a Menu item; its Variants, Modifier groups and their options go with it (cascade)."""
    item_or_404(item_id).delete()


def toggle_item(item_id: int) -> MenuItem:
    toggled = item_or_404(item_id)
    toggled.is_available = not toggled.is_available
    toggled.save(update_fields=["is_available"])
    return toggled


def create_group(item_id: int, *, name: str, max_selections: int) -> ModifierGroup:
    return ModifierGroup.objects.create(
        menu_item=item_or_404(item_id), name=name, max_selections=max_selections
    )


def edit_group(group_id: int, *, name: str, max_selections: int) -> ModifierGroup:
    edited = group_or_404(group_id)
    edited.name, edited.max_selections = name, max_selections
    edited.save(update_fields=["name", "max_selections"])
    return edited


def delete_group(group_id: int) -> None:
    group_or_404(group_id).delete()  # the group's options go with it (cascade)


def create_option(
    group_id: int,
    *,
    name: str,
    price_delta: Decimal,
    inventory_item_id: Optional[int],
    quantity_delta: Decimal,
) -> ModifierOption:
    """Add an option; its Inventory item, when named, must be this Restaurant's (404 otherwise)."""
    group = group_or_404(group_id)
    inventory_item = (
        inventory_services.linked_inventory_item_or_404(inventory_item_id)
        if inventory_item_id is not None
        else None
    )
    return ModifierOption.objects.create(
        group=group,
        name=name,
        price_delta=price_delta,
        inventory_item=inventory_item,
        quantity_delta=quantity_delta,
    )


def edit_option(option_id: int, *, name: str, price_delta: Decimal) -> ModifierOption:
    edited = option_or_404(option_id)
    edited.name, edited.price_delta = name, price_delta
    edited.save(update_fields=["name", "price_delta"])
    return edited


def delete_option(option_id: int) -> None:
    option_or_404(option_id).delete()


def reorder_groups(item_id: int, order: list) -> None:
    """Put this Menu item's groups in the given order; ids of another item's groups are ignored."""
    _apply_order(item_or_404(item_id).modifier_groups, order)


def reorder_options(group_id: int, order: list) -> None:
    _apply_order(group_or_404(group_id).options, order)


def _apply_order(related, order: list) -> None:
    for position, pk in enumerate(order):
        related.filter(pk=pk).update(sort_order=position)

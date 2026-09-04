# 06: Inventory and recipes

**What to build:** Admins track Inventory items and Recipes; the menu shows what is Out of stock and how many units can still be sold; Modifier options may consume inventory.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Models: Inventory item (unit, quantity, minimum quantity) and Recipe ingredient (unique per Menu item and Inventory item, Decimal amount); deleting an Inventory item removes its recipe rows
- [ ] Routes 29 to 34 match the goldens; the legacy deduct route is gone and its removal noted in the contract table
- [ ] `out_of_stock` and `max_qty` are computed from Recipes with Variant inheritance; Low stock is derivable (quantity at or below minimum)
- [ ] A Modifier option's inventory link must belong to the same Restaurant (404 otherwise)
- [ ] HTTP tests including inheritance and cross-Restaurant inventory ids

## Comments


- 2026-09-04 (from ticket 04) — extend `manage.py bootstrap_dev` with a few Inventory items and the
  Recipes for the demo menu, so the frontend's inventory and menu pages have data on a fresh
  machine (plan §7). Idempotent like the rest of the command; assert it in
  `tests/test_bootstrap_dev.py`.

- 2026-09-04 (from ticket 05) — the menu is in place:
  - `menu.models.ModifierOption.inventory_item_id` is a plain nullable integer. Replace it with
    `FK(inventory.InventoryItem, on_delete=SET_NULL)` and make `POST /modifiers/groups/{id}/options`
    answer 404 `مادة المخزون غير موجودة` for an id this Restaurant does not own — golden
    `09-post-modifiers-groups-group_id-options--inventory-item-not-found.json` is still unasserted,
    and it is this ticket's to cover.
  - `menu/serializers.py::serialize_item` hard-codes `out_of_stock=False` and `max_qty=None`.
    Compute both from Recipes there, with a Variant falling back to its parent's Recipe the way it
    already falls back to the parent's Modifier groups (`_groups_of`).
  - `tests/test_menu.py::test_the_menu_is_read_without_an_n_plus_one` caps `GET /menu` at five
    queries; prefetch the recipes rather than querying per item (plan §4).
  - Extend `bootstrap_dev` with Inventory items and the Recipes for the demo menu, and link the two
    `الإضافات` options to Inventory items.

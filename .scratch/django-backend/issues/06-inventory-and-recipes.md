# 06: Inventory and recipes

**What to build:** Admins track Inventory items and Recipes; the menu shows what is Out of stock and how many units can still be sold; Modifier options may consume inventory.

**Blocked by:** 05

**Status:** implemented (2026-09-04), fast track without a separate code review

- [x] Models: Inventory item (unit, quantity, minimum quantity) and Recipe ingredient (unique per Menu item and Inventory item, Decimal amount); deleting an Inventory item removes its recipe rows
- [x] Routes 29 to 34 match the goldens; the legacy deduct route is gone and its removal noted in the contract table
- [x] `out_of_stock` and `max_qty` are computed from Recipes with Variant inheritance; Low stock is derivable (quantity at or below minimum)
- [x] A Modifier option's inventory link must belong to the same Restaurant (404 otherwise)
- [x] HTTP tests including inheritance and cross-Restaurant inventory ids

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

- 2026-09-04 — implemented. **App `inventory`** (TENANT): `InventoryItem` (`unit` default `قطعة`,
  `quantity` and `min_quantity` as `Decimal(12, 3)`, `is_low_stock` = quantity at or below the
  minimum) and `RecipeIngredient` (FK to `menu.MenuItem` as `recipe`, FK to `InventoryItem`, both
  CASCADE, one line per ingredient by `UniqueConstraint`). `menu.ModifierOption.inventory_item` is
  now `FK(SET_NULL)`; `POST /modifiers/groups/{id}/options` answers 404 `مادة المخزون غير موجودة`
  for an id this Restaurant does not own (golden 09 failure asserted). Routes 29 to 34 in
  `inventory/views.py`; reads need a token, mutations need the Admin; route 35 is gone and answers
  404 (`tests/test_inventory.py::test_the_legacy_deduct_route_is_gone`), noted in plan §1.3.
- 2026-09-04 — **stock on the menu**: `inventory.services.stock_status(lines)` computes
  `out_of_stock` (any ingredient short of one serving) and `max_qty` (fewest servings any
  ingredient allows, `None` without a Recipe) in memory; `menu/serializers.py` applies it with a
  Variant falling back to its parent's Recipe like the Modifier groups. `GET /menu` now costs six
  queries (two for auth, then items, groups, options and the Recipe lines joined with their
  Inventory items via `Prefetch(select_related)`); the cap in `tests/test_menu.py` moved from five
  to six with the reason in its docstring.
- 2026-09-04 — **deviations**: a Recipe that names the same Inventory item twice is 400
  `مادة المخزون مكررة في الوصفة` (new message; the legacy stored both lines, the database now
  keeps one); a Recipe naming an unknown or foreign Inventory item is 404 and saves nothing (the
  legacy checked before writing too); `amount` must be at least 0.
- 2026-09-04 — **seed**: `bootstrap_dev` creates four Inventory items (`جبن` Low stock on purpose),
  Recipes for `برجر`, `بيتزا` and `باستا`, and links the two `الإضافات` options to `خبز` and `جبن`;
  each step is idempotent on its own. Verified on the local dev database after `migrate_schemas`.
- 2026-09-04 — tests: 304 → 355 (`tests/test_inventory.py` 43, plus additions in
  `tests/test_modifiers.py`, `tests/test_menu.py`, `tests/test_bootstrap_dev.py`). The `demo_menu`
  fixture now builds the four Inventory items and the Recipes the goldens were recorded with.
- 2026-09-04 — **handoffs**: ticket 08 takes stock with `select_for_update()` on
  `InventoryItem` rows; the Recipe lines come from `inventory.services.recipe_prefetch()` and a
  line's deduction is `amount × units` plus the option's `quantity_delta` floored at zero (Q9);
  a Variant without Recipe lines uses its parent's. Ticket 11's low-stock tool is
  `inventory.services.low_stock_items()`.


# 08: Orders, stock and payments

**What to build:** Cashiers create, edit, move, cancel, pay and close Orders with stock handled atomically and offline replays deduplicated; the kitchen and payments pages work; Heartbeats keep the Restaurant Online.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Order model: Decimal totals, JSON Order lines with captured names and prices, statuses preparing/ready/served/done/cancelled, Payment method, Idempotency key unique per schema, cashier, notes, creation time; Cancellation log model
- [ ] Order service: one atomic pass with row locks; a shortage answers 400 naming the short Menu items; a repeated Idempotency key returns the original Order; positive and negative modifier quantity deltas (floored at zero); editing only while preparing with stock rebalanced; cancelling through either route restores stock only while preparing; the state machine is enforced (done terminal, cancelled reachable from preparing, ready, served)
- [ ] Routes 16, 17, 18 and 21 to 28 match the goldens; creation time keeps the legacy format; recording payment is idempotent under concurrent calls; cancel writes the Cancellation log and returns the fraud flag when three or more cancellations by the same cashier fall within 60 minutes (dispatch is ticket 10)
- [ ] Heartbeat updates the Restaurant's last Heartbeat; Online means within 90 seconds; only token callers may send Heartbeats
- [ ] Tests: every route; two Orders competing for the last unit of stock; idempotent replay; the full status transition matrix; revenue-relevant data (Paid, non-cancelled) visible in responses

## Comments

- 2026-09-04 (from ticket 02): the legacy `PUT /orders/{order_id}` rewrote the Order lines without their `modifiers` (see order 9 in fixture `16-get-orders.json`), while `POST /orders/create` stored them. Decide whether edited lines keep their Modifier options; the golden for route 23 only fixes the `{message, order_id}` response shape.

- 2026-09-04 (from ticket 05) — `tests/probe_urls.py` is down to a single `/_probe/staff` route
  standing in for `IsCashierOrAdmin`, exercised by `tests/test_view_guards.py`. Once the order and
  heartbeat routes carry that permission, re-assert those four cases on them and delete both files.

- 2026-09-04 (from ticket 06) — the Inventory app is in place: `inventory.models.InventoryItem`
  (`quantity` Decimal) and `RecipeIngredient` (`menu_item.recipe`, `amount`);
  `inventory.services.recipe_prefetch()` loads lines with their Inventory items,
  `stock_status(lines)` gives `out_of_stock`/`max_qty`. `menu.ModifierOption.inventory_item` is a
  nullable FK (SET_NULL). Deduct inside `transaction.atomic()` with
  `InventoryItem.objects.select_for_update()` on the ids the Order touches; a Variant without lines
  uses its parent's Recipe; an option's `quantity_delta` adds to the line's deduction, floored at
  zero (grilling Q9). Route 35 is gone, so this ticket owns every stock movement.


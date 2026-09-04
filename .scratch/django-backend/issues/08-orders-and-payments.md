# 08: Orders, stock and payments

**What to build:** Cashiers create, edit, move, cancel, pay and close Orders with stock handled atomically and offline replays deduplicated; the kitchen and payments pages work; Heartbeats keep the Restaurant Online.

**Blocked by:** 06

**Status:** implemented (2026-09-04), fast track without a separate code review

- [x] Order model: Decimal totals, JSON Order lines with captured names and prices, statuses preparing/ready/served/done/cancelled, Payment method, Idempotency key unique per schema, cashier, notes, creation time; Cancellation log model
- [x] Order service: one atomic pass with row locks; a shortage answers 400 naming the short Menu items; a repeated Idempotency key returns the original Order; positive and negative modifier quantity deltas (floored at zero); editing only while preparing with stock rebalanced; cancelling through either route restores stock only while preparing; the state machine is enforced (done terminal, cancelled reachable from preparing, ready, served)
- [x] Routes 16, 17, 18 and 21 to 28 match the goldens; creation time keeps the legacy format; recording payment is idempotent under concurrent calls; cancel writes the Cancellation log and returns the fraud flag when three or more cancellations by the same cashier fall within 60 minutes (dispatch is ticket 10)
- [x] Heartbeat updates the Restaurant's last Heartbeat; Online means within 90 seconds; only token callers may send Heartbeats
- [x] Tests: every route; two Orders competing for the last unit of stock; idempotent replay; the full status transition matrix; revenue-relevant data (Paid, non-cancelled) visible in responses

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

- 2026-09-04 — implemented. **App `orders`** (TENANT): `Order` (`items` JSON in the legacy
  line shape with numbers, `total_price` Decimal, `status` TextChoices preparing/ready/served/
  done/cancelled, `payment_method` cash/card/qr or null, `client_id` unique per schema as the
  Idempotency key, `cashier`, `notes`, `created_at`) and `CancellationLog`. `orders/services.py`
  holds the stock arithmetic: `stock_demand()` matches lines to Menu items by name (the payload
  carries names), a Variant without Recipe lines uses its parent's, an option's `quantity_delta`
  adds to the line's demand floored at zero per line (Q9); `take_stock()` locks the Inventory rows
  with `select_for_update()`, refuses with `مخزون غير كافٍ: <names>` (400) and deducts;
  `return_stock()` reverses it. Creation takes a transaction-scoped advisory lock on the
  Idempotency key so a concurrent replay finds the original instead of racing the unique index.
  Editing (preparing only) returns the old lines' stock and takes the new lines' in one
  transaction; cancelling from either route returns stock only while preparing (Q8), logs the
  token's username and answers `fraud_alert` when that Cashier has three or more cancellations
  within the hour (`fraud_rule_tripped`; ticket 10 dispatches). Payment is a plain row update.
- 2026-09-04 — **heartbeat and status** live in `tenants/views.py`: `POST /heartbeat` needs a
  Cashier's or Admin's token and stamps the token's Restaurant (`tenants.services.record_heartbeat`);
  `Restaurant.is_online` is a Heartbeat within 90 s (`tenants.models.ONLINE_WINDOW`).
  `GET /restaurant/status` is wired too, for ticket 09 to assert. `core/timestamps.py` now holds
  `ISO_UTC`/`iso_utc()` (lifted from `platform_admin/serializers.py`), used for `created_at` and
  the heartbeat moment (the legacy heartbeat emitted a naive `isoformat()`; the frontend appends
  `Z` when missing, so the `Z` form is compatible, plan §3.7).
- 2026-09-04 — **deviations**: done and cancelled are final: every transition, payment or cancel
  on them answers 400 `الطلب مغلق ولا يمكن تغييره` (new message), except cancelling a cancelled
  Order, which keeps the legacy `الطلب ملغي مسبقاً` (golden). Moves among preparing, ready and served
  are allowed in any direction (the kanban drags both ways) and done is reachable from any Open
  status, as the legacy allowed. The `?cashier=` query parameter on the cancel route is accepted but
  ignored: the log and the alert name the token's username (spec story 34). `DELETE /orders/{id}`
  also logs the cancellation and may carry `fraud_alert` (spec: "either route"). An Order without
  lines is 400. Edited lines keep whatever `modifiers` the payload sends (the frontend sends
  none), always stored under the key (ticket 02's question, resolved). The two legacy spellings of
  "order not found" are kept per route (`الطلب مو موجود` on ready, done and cancel).
- 2026-09-04 — **customer channel is wired now** (ticket 09's content, asserted there):
  `GET /orders` and `POST /orders/create` are `AllowAny + @public_tenant_allowed` and branch on
  `request.tenant_source`; a token caller passes `core.permissions.require_staff`; a Slug caller
  gets the redacted Open orders, or files a Customer order (cashier `QR`, payment ignored, 503
  `core.exceptions.ServiceUnavailable` while offline). `/orders/qr-create` is an alias.
- 2026-09-04 — **probes gone**: `tests/probe_urls.py` and `tests/test_view_guards.py` are deleted;
  the staff guard runs on `POST /heartbeat` (`tests/test_heartbeat.py`) and `GET /orders`, the
  register-is-a-platform-route case moved to `tests/test_register.py`.
- 2026-09-04 — tests: 374 → 443 (`tests/test_orders.py` 61, `tests/test_heartbeat.py` 8), among
  them a real two-thread race for the last serving under `django_db(transaction=True)`.


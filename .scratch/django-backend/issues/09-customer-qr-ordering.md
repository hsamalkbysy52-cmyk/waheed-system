# 09: Customer QR ordering and the quantity-based order route

**What to build:** A customer with a table QR sees the menu, learns whether the table has Open orders and nothing more, and places a Customer order only while the Restaurant is Online; staff can create quantity-based orders at menu prices.

**Blocked by:** 08

**Status:** implemented (2026-09-04), fast track without a separate code review

- [x] Slug-resolved `GET /orders` returns only id, table number and status of Open orders
- [x] Slug-resolved `POST /orders/create` follows Customer-order rules: 503 while the Restaurant is offline, cashier recorded as "QR", Payment method ignored; `POST /orders/qr-create` behaves as an alias; `GET /restaurant/status` answers per Restaurant
- [x] Slug-only callers get 401 on every other Restaurant route; a missing Slug on a customer route answers 400; a Suspended Restaurant answers 403 with the Arabic message
- [x] `POST /orders` accepts quantity-based lines, expands them into Order lines at the Restaurant's menu prices, requires a JWT and returns the order id under both `order_id` and `id`
- [x] Tests including isolation item 4 for orders and the offline gate

## Comments

- 2026-09-04 — implemented on top of ticket 08's orders app. `GET /orders` and `POST /orders/create`
  (alias `/orders/qr-create`) branch on `request.tenant_source`: a Slug caller gets
  `orders.serializers.serialize_order_for_customer` (id, table number, status of Open orders only)
  or files a Customer order with cashier `QR`, no payment, 503 `core.exceptions.ServiceUnavailable`
  while `Restaurant.is_online` is false; a token caller passes `core.permissions.require_staff`.
  `GET /restaurant/status` answers per Restaurant from the Slug. `POST /orders` (same path as the
  list, method-dispatched in `orders_collection`) takes `{table_number, items: [{name, quantity,
  price?}], notes?, client_id?}`, expands the lines at the Restaurant's menu prices
  (`orders.services.expand_quantity_lines`; the payload's price is ignored), needs a staff token,
  takes stock like any Order and answers the id under both `order_id` and `id`.
- 2026-09-04 — **new messages**: `الصنف غير موجود في القائمة: <name>` (404) for a proposal naming
  something not on the menu, `الكمية يجب أن تكون 1 أو أكثر` (400) for a quantity below one.
- 2026-09-04 — tests: 443 → 482 (`tests/test_customer_orders.py` 39): redacted customer list
  against the golden's element with the other keys removed, both creation paths online and
  offline, `QR` cashier and ignored payment, status per Restaurant, the missing-Slug 400, the
  Suspended 403 on the four customer routes, the Slug-only 401 on nine other routes (isolation
  matrix items 3 and 4), and the quantity route's expansion, stock, refusals and replay.


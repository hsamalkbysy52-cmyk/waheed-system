# 09: Customer QR ordering and the quantity-based order route

**What to build:** A customer with a table QR sees the menu, learns whether the table has Open orders and nothing more, and places a Customer order only while the Restaurant is Online; staff can create quantity-based orders at menu prices.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] Slug-resolved `GET /orders` returns only id, table number and status of Open orders
- [ ] Slug-resolved `POST /orders/create` follows Customer-order rules: 503 while the Restaurant is offline, cashier recorded as "QR", Payment method ignored; `POST /orders/qr-create` behaves as an alias; `GET /restaurant/status` answers per Restaurant
- [ ] Slug-only callers get 401 on every other Restaurant route; a missing Slug on a customer route answers 400; a Suspended Restaurant answers 403 with the Arabic message
- [ ] `POST /orders` accepts quantity-based lines, expands them into Order lines at the Restaurant's menu prices, requires a JWT and returns the order id under both `order_id` and `id`
- [ ] Tests including isolation item 4 for orders and the offline gate

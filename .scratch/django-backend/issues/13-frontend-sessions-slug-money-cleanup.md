# 13: Frontend: sessions, Slug, money and cleanup

**What to build:** The existing UI works against the new API for every role; QR links identify the Restaurant; sessions refresh and expire cleanly; money shows the Restaurant's currency; dead and unsafe code is gone.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] Table QR links include the Slug obtained from `/me`; the customer page and its proxies forward the Slug header; offline and unavailable messages are shown to the customer
- [ ] The dashboard sends the question in the request body and has no key input
- [ ] The authenticated fetch helper refreshes once on 401 and otherwise clears the session and redirects to login; Heartbeats fire only when a token exists; the offline sync treats 401 as retry after login
- [ ] A single money formatter uses currency and decimals from `/me` and replaces every hard-coded dinar label; the old orders page shows Open orders instead of pending and computes revenue from Paid, non-cancelled Orders
- [ ] The debug route, the QR-create proxy, the unused chat proxy method, the unused store order fetch and the public OpenAI key fallback are removed; every call imports the base URL from one module
- [ ] Type check and production build pass; the parity checklist (contract table and page list from the plan) is walked and recorded in this ticket's comments

## Comments

- 2026-09-04 (from ticket 03) — handoffs: `POST /auth/refresh` takes `{refresh}` and answers `{token, refresh}`; call it, and `POST /login`, **without** an `Authorization` header: the tenant middleware refuses an expired access token with 401 `توكن غير صالح` before any view runs, and a valid one makes `/login` and `/register` answer 400 `هذا المسار للمنصة فقط`. `GET /me` answers `{username, role, restaurant_id, restaurant: {name, slug, currency, timezone}}`, with `restaurant_id` and `restaurant` null for a Super admin; derive decimals from `currency` (JOD → 3). Every refusal is `{error, detail}` with the same Arabic message and a real status code (400/401/403/404).

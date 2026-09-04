# 13: Frontend: sessions, Slug, money and cleanup

**What to build:** The existing UI works against the new API for every role; QR links identify the Restaurant; sessions refresh and expire cleanly; money shows the Restaurant's currency; dead and unsafe code is gone.

**Blocked by:** 09

**Status:** implemented (2026-09-05) by a Sonnet subagent on the fast track; type check and production build pass; the parity walk is recorded below

- [x] Table QR links include the Slug obtained from `/me`; the customer page and its proxies forward the Slug header; offline and unavailable messages are shown to the customer
- [x] The dashboard sends the question in the request body and has no key input
- [x] The authenticated fetch helper refreshes once on 401 and otherwise clears the session and redirects to login; Heartbeats fire only when a token exists; the offline sync treats 401 as retry after login
- [x] A single money formatter uses currency and decimals from `/me` and replaces every hard-coded dinar label; the old orders page shows Open orders instead of pending and computes revenue from Paid, non-cancelled Orders
- [x] The debug route, the QR-create proxy, the unused chat proxy method, the unused store order fetch and the public OpenAI key fallback are removed; every call imports the base URL from one module
- [x] Type check and production build pass; the parity checklist (contract table and page list from the plan) is walked and recorded in this ticket's comments

## Comments

- 2026-09-04 (from ticket 03) — handoffs: `POST /auth/refresh` takes `{refresh}` and answers `{token, refresh}`; call it, and `POST /login`, **without** an `Authorization` header: the tenant middleware refuses an expired access token with 401 `توكن غير صالح` before any view runs, and a valid one makes `/login` and `/register` answer 400 `هذا المسار للمنصة فقط`. `GET /me` answers `{username, role, restaurant_id, restaurant: {name, slug, currency, timezone}}`, with `restaurant_id` and `restaurant` null for a Super admin; derive decimals from `currency` (JOD → 3). Every refusal is `{error, detail}` with the same Arabic message and a real status code (400/401/403/404).

- 2026-09-04 (from ticket 05) — menu prices are now `Decimal(12, 3)` serialized as JSON numbers
  (JOD has three decimals), so F9's money formatter should render three decimals for JOD. The menu
  response is otherwise unchanged, and `GET /menu` accepts `?r=<slug>` and `X-Restaurant-Slug`
  already, which F1 needs.

- 2026-09-05 — implemented. `lib/apiFetch.ts`: `authFetch` refreshes once on 401 through
  `POST /auth/refresh` (no Authorization header) and retries; otherwise `clearSession()` and a
  redirect to `/login` unless already on `/login`, `/register` or a `/table/` page;
  `loadSession()` GETs `/me` once per page load (cached) and sets the money formatter's currency.
  `lib/money.ts`: `formatMoney()` / `currencyLabel()` with JOD 3 decimals (label `د.أ`), IQD 0
  (`د.ع`), default 2; the 56 hard-coded `د.ع` labels are replaced across kanban, payments, tables,
  menu, orders, the customer page, the bill modals, the modifier selector, the order drawer and the
  chat bot. Login and register store `refresh`; the heartbeat fires only with a token; the offline
  sync keeps a 401'd order queued (retry after login) and stops the batch. QR links carry
  `?r=<slug>` from `/me`; the customer page reads `r` from `searchParams`, forwards
  `X-Restaurant-Slug` (and `?r=`) through the three proxies, reads the redacted Open-order rows for
  the occupancy check and shows the backend's Arabic `detail`/`error` for 400/403/404/503. The
  dashboard sends `{question}` in the body and has no key input. The orders page counts
  preparing/ready/served as Open and revenue from paid, non-cancelled Orders. Removed: the debug
  route, the qr-create proxy, the chat route's PUT and its public-key fallback and key logging, the
  store's unused actions; every base URL imports `API` from `lib/apiFetch.ts`.
- 2026-09-05 — **known limits**: the currency is a module-level value set after `/me` resolves, so
  a component may paint once with the JOD default before the first poll corrects it; the anonymous
  customer page never learns the currency and renders JOD (needs the currency on `GET /menu`; in
  `backlog.md`). Two compact price previews without a label (kanban tile, customer variant list)
  were left as plain numbers. Pre-existing ESLint findings in touched files were left alone.
- 2026-09-05 — **parity walk** (`npx tsc --noEmit` clean, `npm run build` 19/19 pages): login
  (`POST /login`), register (`POST /register`), admin (`/admin/restaurants*`), kanban and kitchen
  (`/menu`, `/orders*`), tables (`/table-layout*`, `/orders`), menu (`/menu*`, `/modifiers*`,
  `/inventory*`), payments (`/orders`, pay/done), inventory (`/inventory*`), dashboard
  (`POST /agent/ask` with a body), orders (`/orders`, done, cancel), customer page (`/api/menu`,
  `/api/orders`, `/api/orders/create` with the Slug) — payloads and response shapes unchanged
  against the contract table.


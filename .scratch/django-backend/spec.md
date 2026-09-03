# Spec: Rebuild the Waheed backend on Django with one schema per Restaurant

Status: ready-for-agent
Date: 2026-09-03
Sources: `docs/plans/backend-django-migration-plan.md` (approved, §14 grilling resolutions), ADR-0001…0004, `CONTEXT.md`, `docs/research/whatsapp-cloud-api-costs-iraq.md`, `backlog.md`.

## Problem Statement

Waheed is about to serve many Restaurants in Jordan, then Iraq, from one platform. Today a restaurant owner cannot trust that their data stays theirs: any request without a token falls back to the first Restaurant, three tables carry no Restaurant marker at all, anyone who scans a table QR can read every order of the restaurant (items, totals, cashier names, notes), and customers can order while the cashier is offline because the customer page bypasses the "restaurant offline" check. The AI assistant makes the owner paste an OpenAI key into the browser, the WhatsApp bot mixes every restaurant's menu into one conversation and files orders with no Restaurant, and the staff chat bot's "confirm order" button silently fails because the endpoint it calls does not exist. Prices are floating point, schema changes are ad-hoc SQL executed at start-up, there are no tests, and the deployment tooling has been retired by the host. The owner wants all of this fixed without losing a single screen or workflow their staff already use.

## Solution

Rebuild the API on Django with one PostgreSQL schema per Restaurant so isolation is structural rather than a filter someone must remember. Keep every existing route, payload, response shape and Arabic message so the current frontend keeps working, and change the frontend only where the contract forces it: table QR links carry the Restaurant's Slug, sessions refresh silently and expire to the login page, money shows the Restaurant's currency, and the staff chat bot talks to the backend instead of OpenAI. Move all AI keys to the server with Gemini (free tier) as the default Provider and OpenAI as automatic fallback. Run alerts and WhatsApp through Celery so nothing long-lived lives inside a web worker. Move WhatsApp to Meta's official Cloud API with one business number per Restaurant, so customer ordering costs nothing and cannot get the number banned. Prepare for Jordan: prices in JOD with three decimals, Amman time, a country on every Restaurant. Use the Django admin as the Super admin console for now. Start from a fresh database seeded with the demo Restaurant and today's demo accounts; keep the old code as a read-only backup.

## User Stories

### Super admin
1. As a Super admin, I want to sign in with my email and password, so that I can manage the platform.
2. As a Super admin, I want to list every Restaurant with its status, contacts and creation date, so that I can oversee the platform from the existing admin page.
3. As a Super admin, I want to suspend and reactivate a Restaurant, so that a Suspended restaurant's staff are signed out on their next request and its customers cannot order.
4. As a Super admin, I want to edit a Restaurant's name, Slug, country, currency and timezone in the Django admin, so that onboarding mistakes are fixed without a deploy.
5. As a Super admin, I want to create Admin and Cashier accounts for a Restaurant and reset their passwords in the Django admin, so that restaurants can staff up before a self-service page exists.
6. As a Super admin, I want to connect a Restaurant's WhatsApp account in the Django admin, so that its customers can order over WhatsApp.
7. As a Super admin, I want to look at one Restaurant's data only by naming it explicitly, so that I never see two restaurants mixed together.
8. As a Super admin, I want any request that names a Restaurant other than the caller's own to be refused, so that isolation violations fail loudly instead of leaking.

### Admin (restaurant owner)
9. As a restaurant owner, I want to register my Restaurant with a name, phone, email and password and be signed in right away, so that I can start setting up immediately.
10. As an Admin, I want my new Restaurant to start with Jordan defaults (JOD with three decimals, Amman time, country JO), so that bills and "today's sales" are correct for my market.
11. As an Admin, I want to create, edit, delete and toggle the availability of Menu items grouped by Category, so that the menu matches what I sell.
12. As an Admin, I want to add Variants under a Menu item, so that sizes and flavours are sold in its place.
13. As an Admin, I want a Variant to reuse its parent's Modifier groups and Recipe unless I define its own, so that I do not repeat setup for every size.
14. As an Admin, I want to define Modifier groups with a maximum number of selections and reorder them, so that customers and cashiers see the right choices in the right order.
15. As an Admin, I want each Modifier option to carry a price delta and, optionally, an effect on an Inventory item, so that "extra cheese" charges and consumes correctly.
16. As an Admin, I want a "without X" Modifier option to reduce the stock taken by the Recipe, so that stock does not drift low on every removal.
17. As an Admin, I want to manage Inventory items with units and minimum quantities and see which are Low stock, so that I reorder in time.
18. As an Admin, I want to define the Recipe of each Menu item, so that the menu shows Out of stock items and how many units can still be sold.
19. As an Admin, I want to design the Table layout with Zones, Tables, walls and doors, save it as a whole and clear it, so that the floor plan matches the room.
20. As an Admin, I want each Table's QR code to carry my Restaurant's Slug, so that customers reach my menu and nobody else's.
21. As an Admin, I want to ask the Report agent questions in Arabic about today's or this week's sales, top items, low stock, cancellations and order counts, so that I understand my business without building reports.
22. As an Admin, I want the Report agent to work without pasting any API key, so that no secret passes through my browser.
23. As an Admin, I want a clear Arabic "assistant is busy" message when the AI Provider is rate-limited, and an automatic switch to the fallback Provider when one is configured, so that a busy free tier does not block me.
24. As an Admin, I want revenue figures to count only Paid, non-cancelled Orders, so that cancelled orders never inflate my numbers.
25. As an Admin, I want my session to last a working day and refresh silently, and to be sent to the login page when it truly expires, so that I never see silently empty screens.
26. As an Admin, I want to see my Restaurant's name, Slug, currency and timezone in the app, so that labels and QR links are right.

### Cashier
27. As a Cashier, I want to sign in with email and password and land on the kanban board, so that I can start taking orders.
28. As a Cashier, I want to create an Order for a Table with Order lines, chosen Modifier options and notes, so that the kitchen gets exactly what the guest asked for.
29. As a Cashier, I want stock to be taken atomically when an Order is created and the order refused with the names of short items when stock is insufficient, so that two cashiers cannot oversell the same ingredient.
30. As a Cashier, I want Orders saved while offline to be sent once when the connection returns and never duplicated, so that a flaky network does not double-charge a table.
31. As a Cashier, I want to see all Open orders on the kanban and move them from preparing to ready to served, so that the floor knows what is where.
32. As a Cashier, I want to edit an Order while it is still preparing with stock rebalanced automatically, so that a changed mind is cheap.
33. As a Cashier, I want to cancel an Order from preparing, ready or served, with stock returned only when it was still preparing, so that made food is not counted back into the store.
34. As a Cashier, I want every cancellation logged with my name, so that the owner can audit cancellations.
35. As a Cashier, I want to record the Payment method (cash, card or QR) for one Order or for all Open orders of a Table at once, so that settling a table is one action.
36. As a Cashier, I want to close an Order after payment, so that it leaves the board and appears in the paid list.
37. As a Cashier, I want the payments queue to show unpaid Open orders and paid orders separately, so that I know who still owes.
38. As a Cashier, I want my signed-in device to send Heartbeats so that my Restaurant is Online for customers, and nothing else to count as Online.
39. As a Cashier, I want the staff Chat agent to draft an Order proposal from a conversation and to confirm it into a real Order at menu prices, so that ordering by chat is safe and fast.
40. As a Cashier, I want amounts shown with my Restaurant's currency symbol and decimals, so that bills read correctly in Jordan and later Iraq.
41. As kitchen staff signed in as a Cashier, I want the kitchen board to show preparing Orders oldest first with timers and a "ready" action, so that nothing is forgotten.

### Customer
42. As a customer, I want to scan a Table's QR and see the Restaurant's current menu (Available items, Variants, Modifier groups, Out of stock flags and maximum quantities) without signing in, so that I can order from my seat.
43. As a customer, I want to place a Customer order for my Table with Modifier options and notes, so that the kitchen gets it directly.
44. As a customer, I want a clear message when the Restaurant is offline or Suspended, so that I know to order from the cashier instead.
45. As a customer, I want to know whether my Table already has Open orders, and nothing more about anyone's orders, so that I do not double-order and nobody's data leaks to me.
46. As a customer, I want to order over WhatsApp in Arabic in a natural Conversation that remembers context for two hours and confirms items and total, so that I can order without an app.
47. As a customer, I want my WhatsApp order to reach the right Restaurant's kitchen at the Restaurant's menu prices, so that ordering by chat is as reliable as ordering at the counter.
48. As a Restaurant owner, I want a Fraud alert on my WhatsApp when one Cashier cancels three or more Orders within an hour, so that I can act the same day.

### Operator / developer
49. As a developer, I want one command to migrate all schemas and one to seed a demo Restaurant with the known demo accounts and menu, so that a fresh machine is productive in minutes.
50. As a developer, I want the whole test suite to run offline against PostgreSQL with fakes for the AI Provider and the WhatsApp sender, so that CI never depends on Google or Meta.
51. As a developer, I want a set of isolation tests that prove one Restaurant can never read or write another's data through any route or background task, so that regressions in tenancy are caught before deploy.
52. As an operator, I want the API deployed on Railway as a web service plus a Celery worker with Redis and PostgreSQL, migrations run before each release, and a health endpoint, so that deploys are routine.
53. As an operator, I want every AI call logged per Restaurant with Provider, model, tokens, latency and whether a fallback happened, so that I can see when the free tier caps out.
54. As an operator, I want a step-by-step wizard for the human-only parts of WhatsApp onboarding (Meta app, test number, webhook), so that setup is repeatable.
55. As an operator, I want the previous backend kept as a read-only backup, so that behaviour can be compared during the transition.

## Implementation Decisions

### Shape
- Django 5.2 LTS on Python 3.10; Django REST Framework with function-based views only (ADR-0002). Serializers validate input and format output; business rules live in per-app service modules; views stay thin.
- One URL configuration serving both platform and Restaurant routes; legacy paths reproduced exactly, without trailing slashes.
- Apps: shared (public schema) tenants, accounts, platform admin; per-Restaurant menu, inventory, orders, layout, ai, messaging.

### Tenancy (ADR-0001)
- django-tenants with one PostgreSQL schema per Restaurant. Public schema holds Restaurant (with Slug, country, currency, timezone, status, last Heartbeat), the mandatory domain record (unused for routing), User, WhatsApp account. Restaurant schemas hold menu, inventory, orders, table layout, AI usage log and Conversation state.
- Tenant resolution middleware: public schema first; a valid JWT selects the caller's Restaurant (a `X-Restaurant-Id` header that disagrees with the token is a 403; a Suspended Restaurant is a 403 on every request); a Super admin selects a Restaurant with that header or works at platform scope; with no token, a Slug from the `X-Restaurant-Slug` header or `r` query parameter selects the Restaurant. The request records how the Restaurant was resolved (token, super admin, slug).
- Only the five customer endpoints (menu, orders, create order, QR create order, restaurant status) accept a Slug-resolved Restaurant; every other Restaurant route answers 401 to Slug-only callers. Slug-resolved `GET /orders` returns only id, table number and status of Open orders. Slug-resolved order creation follows Customer-order rules: 503 while offline, cashier recorded as "QR", payment method ignored. A Suspended Restaurant answers customers with 403 and an Arabic "restaurant unavailable" message.
- CORS middleware runs before the tenant middleware so browsers see the 401/403 rather than an opaque network error.
- Every Celery task takes the Restaurant's schema name as its first argument and runs inside that schema (ADR-0003).

### Identity and roles
- Custom User in the public schema: email is the login identifier and globally unique; username is the display name, unique per Restaurant; role is one of super_admin, admin, cashier; the Restaurant link is null only for super_admin (database constraint). Django's default password hashing.
- Simple JWT: access token 8 hours, refresh token 30 days; claims carry role, restaurant id and username exactly as the legacy token did. New refresh endpoint; new "me" endpoint returning username, role and the Restaurant's name, slug, currency and timezone.
- Permissions: Super admin routes require role super_admin; menu, inventory and layout mutations and the Report agent require admin; orders, heartbeat and the Chat agent require cashier or admin.
- Django admin enabled in the public schema, reachable by super_admin users only; registers Restaurant, User, domain and WhatsApp account. The frontend super-admin page and its two routes stay.

### Registration and seeding
- Registration validates as today (same Arabic messages), creates the Restaurant with an auto-generated Slug (`r-` plus eight hex characters), country JO, currency JOD, timezone Asia/Amman, creates its schema synchronously, the mandatory domain record, and the owner Admin, then returns tokens.
- An idempotent bootstrap command creates the demo Restaurant (slug `waheed`) with today's three demo accounts and credentials, the six-item demo menu, a few Inventory items with Recipes and a small Table layout.

### Domain rules
- Order statuses: new Orders start preparing; preparing → ready → served → done; cancelled is reachable from preparing, ready and served; done is terminal; pending is retired.
- Cancelling through either route returns stock only while the Order is preparing; ready or served cancellations return nothing. Editing rebalances stock and is allowed only while preparing.
- Stock is checked and taken in one atomic pass with row locks; a shortage answers 400 naming the short Menu items. The Idempotency key makes a repeated creation return the original Order.
- A Modifier option's quantity delta adds to or subtracts from the Recipe deduction, floored at zero.
- A Variant inherits its parent's Modifier groups and Recipe when it has none; the menu response materialises the inheritance so the frontend is unchanged.
- Paid means a Payment method is recorded and is independent of status; revenue counts Paid, non-cancelled Orders. Recording payment is an idempotent update safe under concurrent calls for one Table.
- Online means a Heartbeat within 90 seconds; only signed-in staff devices send Heartbeats.
- Order lines keep the name and price captured at order time. Money is Decimal with 12 digits and 3 decimals; JSON carries numbers.
- Menu item deletion cascades to its Variants; deleting an Inventory item removes its Recipe rows; deleting a Modifier group removes its options.

### API contract
- All 42 legacy routes preserved (paths, bodies, success shapes, Arabic messages) except `POST /inventory/deduct/{order_id}`, which is removed.
- Added: `GET /health`, `GET /me`, `POST /auth/refresh`, `POST /orders` (quantity-based lines at menu prices, JWT required, returns order id under both legacy names), `POST /agent/chat`, and the WhatsApp webhook (GET verification, POST inbound).
- Errors carry both `error` and `detail` with the same message and a real status code: 400 validation and stock, 401 authentication, 403 forbidden or Suspended, 404 not found, 503 Restaurant offline. Validation and business failures are 4xx (the offline sync treats them as permanent); infrastructure failures are 5xx (retried).
- Timestamps are ISO-8601 in UTC with a trailing Z; the legacy orders format is kept for order creation time.
- The Report agent route reads the question from the query string or JSON body and ignores any client-supplied key.
- Menu listing prefetches modifiers and recipes and computes Out of stock and maximum quantity in memory (at most a handful of queries).

### Background work (ADR-0003)
- Celery with Redis as broker; Redis also backs the cache with tenant-aware keys. Tasks: send Fraud alert, process inbound WhatsApp message, send outbound WhatsApp message. Report and Chat agents answer synchronously within a 20-second budget. Tests run tasks eagerly.

### AI
- One Provider interface (complete with system prompt, user content, optional tools, optional structured output schema, optional Conversation id) with two implementations: Gemini through the Interactions API of the current google-genai SDK, and OpenAI. Default Provider Gemini (free tier); on rate-limit or server error fall back to OpenAI when configured, else answer with an Arabic "assistant is busy" error. Every call is logged per Restaurant with provider, model, purpose, tokens, latency, outcome and whether a fallback happened.
- Models by purpose: Gemini `gemini-3.8-flash` for reports, `gemini-3.5-flash-lite` for chat; OpenAI `gpt-4o-mini` for both. Configurable per Restaurant later through the Django admin field.
- Report agent: tools executed inside the Restaurant's schema (sales summary by period, top items, low stock, cancellations, order status counts), Arabic system prompt, at most four tool rounds, "today" in the Restaurant's timezone.
- Chat agent: menu context from the Restaurant's data, structured output with intent, items with quantities and reply text; an Order proposal is confirmed by the person through the quantity-based order route. Menu content is passed as data, never interpolated into instructions; orders are created only from parsed structured output.
- Conversation state for WhatsApp keeps the Provider's conversation id per customer number for two hours.

### WhatsApp (ADR-0004)
- Meta Cloud API called directly. One business number per Restaurant, stored with its phone number id and access token on the Restaurant's WhatsApp account, entered by the Super admin. One webhook: GET answers Meta's verification challenge with the verify token; POST validates the signature header with the app secret, answers 200 immediately, resolves the Restaurant from the phone number id and enqueues processing inside that schema. Replies go through the Graph API messages endpoint. Fraud alerts use the approved `fraud_alert` utility template and are logged only until the template is approved. A wizard script guides the human through creating the Meta app, obtaining the test number and pointing the webhook at a local tunnel.

### Frontend changes
- Table QR links include the Restaurant's Slug; the customer page's proxies forward it as the Slug header. The tables page gets the Slug from the "me" endpoint.
- The dashboard sends the question in the request body and loses its API-key input.
- The floating chat bot calls the backend Chat agent and confirms Order proposals through the quantity-based order route with the staff token; the OpenAI dependency and the debug route are removed, along with dead proxies and the store's unused order fetch.
- The authenticated fetch helper refreshes once on 401 and otherwise clears the session and redirects to login; Heartbeats fire only when a token exists; the offline sync treats 401 as "retry after login".
- A single money formatter uses the Restaurant's currency and decimals from the "me" endpoint, replacing the hard-coded dinar labels; the old orders page shows Open orders instead of the retired pending status and computes revenue from Paid, non-cancelled orders.
- All API calls import the base URL from one place.

### Deployment and repo
- Railway with the Railpack builder: web service running gunicorn with a pre-deploy command that migrates all schemas, a worker service running Celery, Redis and PostgreSQL plugins, health check on the health endpoint. The existing service and URL are reused with a fresh database.
- The previous backend directory is renamed to a legacy backup and left untouched; the new project takes its place. Work happens on branch `faysal` in small pushed commits. Nixpacks and Procfile configuration are removed at the end.

## Testing Decisions

- A good test drives an HTTP endpoint through Django's test client with django-tenants' tenant-aware client against a real PostgreSQL schema, and asserts the status code, the JSON body (keys, types and the Arabic messages the frontend displays) and the observable database state. Tests never call service functions or models directly to assert behaviour; internal refactors must not break them.
- Single seam: the HTTP API. Two fakes at the network edges only: a scripted AI Provider (returns configured text, structured output or tool calls) and a recording WhatsApp sender. Celery runs eagerly. The WhatsApp webhook is tested by posting signed payloads to it.
- Coverage: every route in the contract table has at least a success test and its documented failure; the ten-item isolation matrix from the plan becomes ten tests; golden-file contract tests compare response shapes against captures taken from the legacy backend with the seeded demo data (shape and message equality, not volatile values); the order state machine, stock rules, modifier deltas and Variant inheritance are tested through order and menu endpoints; Fraud alert through the cancel route with the recording sender; Provider fallback through the Report agent route with a scripted failure.
- Prior art: none in the repository (there are no tests today); the tenant test base classes and client from django-tenants are the starting pattern.
- Frontend: type check and production build must pass; parity is verified manually against the contract table and page list in the plan. Live smoke tests against Gemini and Meta's test number are opt-in and excluded from CI.

## Out of Scope

Everything in `backlog.md`, notably: taxes and service charge, the Iraq country selector, a restaurant settings page, restaurant-side staff management, a kitchen role, multi-branch brands, subdomain routing, real-time order updates, a category table, customer-facing web chat, WhatsApp media, notifications and payments, asynchronous long reports, Gemini paid tier, an order-line table, asynchronous tenant provisioning, deleting the legacy backup, moving the tracker to GitHub Issues. Also out: frontend redesign and the FinTech phase.

## Further Notes

- Vocabulary follows `CONTEXT.md`; where the code must keep a legacy field name (for example `is_available`, `inventory_name`, `client_id`) the glossary term is used everywhere else.
- Legacy data is not migrated; the legacy password hashes are therefore not carried over.
- Free-tier Gemini rate limits are only visible in Google AI Studio for the project; the usage log is how we will learn the real ceiling.
- The plan's eight phases are natural ticket boundaries; renaming the old backend directory is the prefactoring that must land first.

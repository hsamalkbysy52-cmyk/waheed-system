# Backlog

Everything postponed or deferred, in one place. Add an item the moment something is postponed, with a one-line reason and where the decision was made. Remove it when it ships.

## Product features

- **Taxes and service charge** — per-Restaurant sales-tax (Jordan 16%) and service-charge rates; `subtotal / tax / service / total` on Orders and Bills. Deferred to keep migration parity (grilling Q23).
- **Country selector at registration** — for the Iraq launch: `IQ` → currency `IQD`, timezone `Asia/Baghdad`; Meta's Iraq rate card changes 2026-10-01. Registration is fixed to `JO` for now (grilling Q24).
- **Restaurant settings endpoint and page** — Admin edits name, Slug, currency, timezone, phone. Slugs are auto-generated and only the Django admin can change them today (grilling Q2).
- **Restaurant-side staff management** — Admins create cashiers and reset passwords from the app; today only the Django admin can (grilling round 1, Django-admin decision).
- **`kitchen` role** — separate login for the kitchen board; kitchen staff use cashier accounts today (grilling Q3).
- **Multi-branch brands** — one owner with several Restaurants and cross-branch reporting; each branch is its own Restaurant today (grilling Q1).
- **Customer-facing web chat** — the Chat agent is staff-only in the web UI; customers get it over WhatsApp (grilling Q15).
- **WhatsApp production token** — the wizard uses the Meta test number's 24-hour token; production needs a permanent System User token and business verification (ADR-0004 consequences). Noticed in ticket 15 (2026-09-04).
- **WhatsApp extras** — media messages, order-status notifications to customers (business-initiated templates cost money), payments, non-Arabic replies. Text ordering only in the first version (plan §6.4).
- **Order-status notifications / real-time updates** — WebSocket or SSE instead of the 10–30 s polling (plan §13).
- **Currency on the customer menu** — the anonymous `GET /menu` carries no currency, so the customer table page formats prices as JOD by default; add `currency` (or a small `GET /restaurant/info?r=`) when Iraq goes live. Noticed in ticket 13 (2026-09-05).
- **Category table** — ordering and icons for menu categories; Category stays free text (grilling Q17).
- **Retire the frontend super-admin page** — decide whether the Django admin replaces `/admin` and `/admin/restaurants*` permanently (kept for parity now).
- **Fraud alert channels** — email or push in addition to WhatsApp.

## Platform and architecture

- **Subdomain per Restaurant** — `Domain` rows already exist; needs wildcard DNS and frontend routing (ADR-0001).
- **Server-side logout / refresh-token blacklist** — logout is client-side only (grilling Q5).
- **Request throttling** — `AnonRateThrottle` on `/login`, `/register` and the Slug-resolved customer routes (plan §4); the agent routes are throttled since ticket 11 (`AGENT_THROTTLE_RATE`), nothing owns the rest. Noticed in ticket 03's code review (2026-09-04); ticket 05 shipped the first live Slug-resolved route, `GET /menu`, so this is now real exposure rather than a future one.
- **Deleting a Restaurant** — the Super admin console refuses deletion: the PostgreSQL schema and its data would outlive the row. Needs a decision about dropping the schema (django-tenants' `auto_drop_schema`) before it is offered. Noticed in ticket 04 (2026-09-04).
- **Arabic messages for payload validation** — a malformed menu, modifier or inventory payload answers 400 with DRF's English text (the legacy API answered FastAPI's English 422). Needs product copy before it is worth translating. Noticed in ticket 05 (2026-09-04).
- **Async long reports** — "submit then poll" for `/agent/ask` if reports outgrow the 20 s request budget (grilling Q13).
- **Gemini Tier 1** — link a billing account when free-tier rate limits are hit in practice (plan §6.1).
- **`GET /orders` returns every Order ever** — the legacy did too and the pages filter client-side; add a date window or pagination when a Restaurant's history grows (the kanban polls it every 10 to 30 s). Noticed in ticket 08 (2026-09-04).
- **`OrderLine` table** — normalise the `items` JSON into rows when reporting needs joins (plan §3.7).
- **Async tenant provisioning** — create the schema in a Celery task with a `provisioning` status, or enable `TENANT_CREATION_FAKES_MIGRATIONS`, if registration gets slow (plan §3.6).
- **`django-tenant-users`** — revisit if one user must belong to several Restaurants (ADR-0001).
- **Delete `backend_legacy/`** — the user decides when (decision 10, 2026-09-03).
- **Switch the issue tracker to GitHub Issues** — re-run `/setup-matt-pocock-skills` after `brew install gh && gh auth login`; local markdown under `.scratch/` until then.
- **Re-authorise the GitHub MCP connector** — token expired; needed for PR automation from Claude.

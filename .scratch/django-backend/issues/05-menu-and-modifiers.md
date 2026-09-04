# 05: Menu, Variants and modifiers

**What to build:** Admins manage Menu items, Variants, Modifier groups and options exactly as today, and the menu is readable by staff and, via Slug, by customers.

**Blocked by:** 03

**Status:** implemented — awaiting review (2026-09-04). Route 9's `failure:inventory-item-not-found` is neither implemented nor asserted: the check needs the Inventory app (ticket 06, handoff recorded there).

- [x] Models: Menu item with parent link (deleting a parent removes its Variants), Modifier group and option with sort order, prices as Decimal(12,3)
- [~] Routes 2 to 15 match the goldens (shapes and Arabic messages); mutations are admin only; `GET /menu` accepts Slug-resolved callers — every golden but route 9's inventory-item refusal, which ticket 06 owns
- [x] A Variant inherits its parent's Modifier groups when it has none and the response materialises the inheritance
- [x] `out_of_stock` is false and `max_qty` is null until recipes exist (ticket 06), with the field names present
- [x] `GET /menu` for the seeded menu uses at most five queries (asserted with a query counter)
- [~] Tests: every route's success and documented failure; isolation item 4 for the menu; cross-Restaurant ids answer 404 (item 7) — all of it except golden 09's `failure:inventory-item-not-found`, which needs the Inventory app (ticket 06)

## Comments

- 2026-09-04 (from ticket 03) — handoffs: decorate views exactly as plan §4 shows (`@api_view` → `@permission_classes` → `@public_tenant_allowed` → `@tenant_required`); the guards raise `TypeError` at import if applied above `@api_view`. `request.tenant` and `request.tenant_source` (`core.middleware.TenantSource`: `jwt`, `super_admin`, `slug`) are set on every request. Re-assert on `GET /menu` what `tests/test_view_guards.py` asserts on the probe routes: Slug header or `?r=` → that Restaurant's menu; no Slug and no token → 400 `المطعم غير محدد`; Super admin without header → 400, with `X-Restaurant-Id` → that Restaurant (isolation items 3, 4 and 5); `POST /menu/add?r=B` → 401 `توكن غير موجود`. Delete `tests/probe_urls.py` once real routes cover every guard.

- 2026-09-04 (from ticket 04) — extend `manage.py bootstrap_dev`
  (`tenants/management/commands/bootstrap_dev.py`) with the six-item demo menu and a Modifier
  group: the legacy seed is `backend_legacy/database/models.py::seed_menu` (برجر 5000, بيتزا 8000,
  باستا 6000, كولا 1500, عصير 2000, شاي 1000), repriced as JOD Decimals. Seed inside
  `schema_context(restaurant.schema_name)`, keep the command idempotent, and add the assertion to
  `tests/test_bootstrap_dev.py`. When `GET /menu` lands, move the customer half of suspension
  (`tests/test_suspension.py::test_suspension_refuses_the_restaurants_customers`) off the probe.

- 2026-09-04 (from ticket 04) — `ISO_UTC = "%Y-%m-%dT%H:%M:%SZ"` currently lives in
  `platform_admin/serializers.py`. Plan §4 makes that the format for every serializer, so lift it
  into `core/` when the menu's timestamps need it, and point this ticket's serializers at it.

- 2026-09-04 — implemented. **App `menu`** (TENANT): `MenuItem` (Variants through a self FK,
  cascade), `ModifierGroup` and `ModifierOption`, prices `Decimal(12, 3)`, groups and options
  ordered by `sort_order` then id. Ten function-based views serve the fourteen routes: the legacy
  paths carry two methods each in places, so those views dispatch on the method. `GET /menu` is
  `AllowAny + @public_tenant_allowed`; `GET /menu/{id}/modifiers/groups` needs a token; every
  mutation needs the Restaurant's Admin. All fifteen Arabic strings were copied out of the
  fixtures programmatically into `core/messages.py`.
- 2026-09-04 — **deliberate deviations**, each visible in a test: a Variant materialises its
  parent's Modifier groups on the menu (spec story 13) where the legacy showed `[]`; the editor
  route still shows only the item's own groups, so nothing there looks editable that is not.
  `PUT /modifiers/groups/{id}` and `PUT /modifiers/options/{id}` answer 404 with the Arabic
  "not found" messages where the legacy answered `{"error": "not found"}` in English with 200 (no
  golden pins that). `POST /menu/add` with a `parent_id` this Restaurant does not own answers 404
  rather than storing a dangling parent. Payload validation answers 400 with DRF's English message,
  as the legacy answered FastAPI's English 422 (`backlog.md`). `ModifierOption.inventory_item_id`
  is a plain integer column until ticket 06 makes it a foreign key with the same-Restaurant check.
- 2026-09-04 — **`GET /menu` costs five queries** whatever the menu holds: the Restaurant, the
  caller, then items, groups and options. `tests/test_menu.py` asserts it with a query counter, so
  ticket 06's recipe work has to keep prefetching.
- 2026-09-04 — **guards moved to real routes** (ticket 03's handoff): `tests/probe_urls.py` is down
  to the one staff probe that stands in for the order routes, and `tests/test_view_guards.py` with
  it; the customer, Admin and platform guards are now asserted on `GET /menu`, the menu mutations
  and `/admin/restaurants`. Suspension's customer leg runs against `GET /menu` too. Ticket 08
  deletes the rest.
- 2026-09-04 — **seed**: `bootstrap_dev` now creates the six demo dishes and the `الإضافات` group
  with its two options inside the Restaurant's schema, idempotently. Verified on the local dev
  database, and the customer QR path (`GET /menu?r=waheed`) works straight after seeding.
- 2026-09-04 — **for the user**: `CLAUDE.md` says money is `DecimalField(max_digits=12,
  decimal_places=2)`, while plan §3.7 and this ticket say three decimals because JOD has three.
  The code follows the plan; `CLAUDE.md`'s line is stale and worth correcting.
- 2026-09-04 — tests: 249 → 304. `tests/test_menu.py` (22), `tests/test_modifiers.py` (25),
  `tests/test_menu_access.py` (18), plus three in `tests/test_bootstrap_dev.py`.

- 2026-09-04 — `/code-review` (fixed point 608b052). **Applied:** `core/money.py` now holds the
  three-decimal amount fields the plan's §2 layout asked for, so the model and payload fields stop
  repeating `max_digits=12, decimal_places=3`; `PUT /menu/{id}` takes its own
  `MenuItemEditSerializer` instead of the view popping `parent_id` out of the payload; the
  Admin-only half of `/menu/{id}/modifiers/groups` is a `core.decorators.admin_only_for("POST")`
  guard rather than a permission class called by hand inside the view; the fetch-or-404 lookups are
  `item_or_404`, `group_or_404`, `option_or_404`; the option payload serializer extends the edit
  one; money parameters are annotated `Decimal`; the super-admin menu response is compared to the
  golden like every other route, and the cross-Restaurant Variant test uses the other Restaurant's
  real id rather than an invented one. **Two further deviations, now recorded:** `max_selections`
  must be at least 1, where the legacy accepted anything (the frontend already sends `|| 1`); and
  deleting a Menu item takes its Modifier groups with it, which plan §3.7's cascade prescribes but
  the legacy API did not do (it orphaned the rows). **Noted, not changed:** plan §4's `menu_add`
  snippet answers 201, golden 03 records 200 and the frontend reads the body either way — the code
  follows the golden, and the plan snippet is stale. Throttling `GET /menu` is still open in
  `backlog.md`; this ticket ships the first live Slug-resolved route, which is what that entry was
  waiting for.

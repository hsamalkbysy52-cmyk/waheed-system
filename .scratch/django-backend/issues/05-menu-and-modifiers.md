# 05: Menu, Variants and modifiers

**What to build:** Admins manage Menu items, Variants, Modifier groups and options exactly as today, and the menu is readable by staff and, via Slug, by customers.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Models: Menu item with parent link (deleting a parent removes its Variants), Modifier group and option with sort order, prices as Decimal(12,3)
- [ ] Routes 2 to 15 match the goldens (shapes and Arabic messages); mutations are admin only; `GET /menu` accepts Slug-resolved callers
- [ ] A Variant inherits its parent's Modifier groups when it has none and the response materialises the inheritance
- [ ] `out_of_stock` is false and `max_qty` is null until recipes exist (ticket 06), with the field names present
- [ ] `GET /menu` for the seeded menu uses at most five queries (asserted with a query counter)
- [ ] Tests: every route's success and documented failure; isolation item 4 for the menu; cross-Restaurant ids answer 404 (item 7)

## Comments

- 2026-09-04 (from ticket 03) — handoffs: decorate views exactly as plan §4 shows (`@api_view` → `@permission_classes` → `@public_tenant_allowed` → `@tenant_required`); the guards raise `TypeError` at import if applied above `@api_view`. `request.tenant` and `request.tenant_source` (`core.middleware.TenantSource`: `jwt`, `super_admin`, `slug`) are set on every request. Re-assert on `GET /menu` what `tests/test_view_guards.py` asserts on the probe routes: Slug header or `?r=` → that Restaurant's menu; no Slug and no token → 400 `المطعم غير محدد`; Super admin without header → 400, with `X-Restaurant-Id` → that Restaurant (isolation items 3, 4 and 5); `POST /menu/add?r=B` → 401 `توكن غير موجود`. Delete `tests/probe_urls.py` once real routes cover every guard.

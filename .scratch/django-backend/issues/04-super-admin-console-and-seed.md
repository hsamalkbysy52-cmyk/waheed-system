# 04: Super admin console and demo seed

**What to build:** The Super admin manages Restaurants from the existing frontend admin page and from the Django admin, suspension takes effect immediately for staff and customers, and one command seeds a demo Restaurant so every screen has data.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] `GET /admin/restaurants` and `POST /admin/restaurants/{id}/status` match the goldens and are super_admin only
- [ ] Django admin registers Restaurant (editable slug, country, currency, timezone, status), User (create staff, set password) and the domain record; only super_admin users can sign in to it
- [ ] Suspension end to end: a staff token gets 403 on its next request, a customer Slug call gets 403 with the Arabic "restaurant unavailable" message, login is refused with the legacy message
- [ ] `bootstrap_dev` is idempotent and creates the demo Restaurant (slug `waheed`), the three demo accounts with today's credentials, the six-item menu, inventory items with recipes, a Modifier group and a small Table layout
- [ ] All of the above covered by HTTP tests

## Comments

- 2026-09-04 (from ticket 03) — handoffs:
  - `accounts.User` has no `PermissionsMixin`, no `is_staff` field (it is a property answering `role == super_admin`) and no `is_superuser`; `has_perm`/`has_module_perms` answer from the role. Django's stock `UserAdmin` and its forms assume those fields, so register a custom `ModelAdmin` (create staff with `User.objects.create_user`, set passwords with `set_password`). `createsuperuser` works and creates a Super admin.
  - `tenants.services.provision_restaurant(name, slug="waheed", email=..., phone=...)` creates the Restaurant, its schema and the Domain row; `bootstrap_dev` should use it rather than `Restaurant.objects.create`.
  - Tests suspend a Restaurant through `tests/conftest.suspend()` (a model update). Once `POST /admin/restaurants/{id}/status` exists, switch that helper to the route so suspension is exercised end to end, and re-assert isolation item 5 (Super admin without header → `/admin/restaurants` 200; with header → that Restaurant) and item 8's `bootstrap_dev` leg on the real routes; the probe-based versions live in `tests/test_view_guards.py`.
  - `Restaurant.ai_provider` is a blank string, not NULL, when unset; `Restaurant.email`/`phone` are blank strings where the legacy API had NULL (golden 40 shows the legacy nulls; compare per the goldens README).
  - The platform-scope guard is `core.decorators.public_only`; the Super admin permission is `core.permissions.IsSuperAdmin` (message `هذه الصفحة لمدير المنصة فقط`, golden 40). A Super admin token with `X-Restaurant-Id` on a platform route answers 400 `هذا المسار للمنصة فقط`.

# 04: Super admin console and demo seed

**What to build:** The Super admin manages Restaurants from the existing frontend admin page and from the Django admin, suspension takes effect immediately for staff and customers, and one command seeds a demo Restaurant so every screen has data.

**Blocked by:** 03

**Status:** implemented except the seed's Restaurant-data legs — awaiting review (2026-09-04). The menu, inventory, Modifier group and Table layout the seed must create belong to apps tickets 05, 06 and 07 build; `bootstrap_dev` seeds the Restaurant and the three accounts today and those tickets extend it (handoffs recorded there, backlog.md).

- [x] `GET /admin/restaurants` and `POST /admin/restaurants/{id}/status` match the goldens and are super_admin only
- [x] Django admin registers Restaurant (editable slug, country, currency, timezone, status), User (create staff, set password) and the domain record; only super_admin users can sign in to it
- [x] Suspension end to end: a staff token gets 403 on its next request, a customer Slug call gets 403 with the Arabic "restaurant unavailable" message, login is refused with the legacy message
- [~] `bootstrap_dev` is idempotent and creates the demo Restaurant (slug `waheed`), the three demo accounts with today's credentials, the six-item menu, inventory items with recipes, a Modifier group and a small Table layout — Restaurant and accounts done; the menu, inventory, Modifier group and Table layout wait for the apps that hold them (tickets 05 to 07)
- [x] All of the above covered by HTTP tests

## Comments

- 2026-09-04 (from ticket 03) — handoffs:
  - `accounts.User` has no `PermissionsMixin`, no `is_staff` field (it is a property answering `role == super_admin`) and no `is_superuser`; `has_perm`/`has_module_perms` answer from the role. Django's stock `UserAdmin` and its forms assume those fields, so register a custom `ModelAdmin` (create staff with `User.objects.create_user`, set passwords with `set_password`). `createsuperuser` works and creates a Super admin.
  - `tenants.services.provision_restaurant(name, slug="waheed", email=..., phone=...)` creates the Restaurant, its schema and the Domain row; `bootstrap_dev` should use it rather than `Restaurant.objects.create`.
  - Tests suspend a Restaurant through `tests/conftest.suspend()` (a model update). Once `POST /admin/restaurants/{id}/status` exists, switch that helper to the route so suspension is exercised end to end, and re-assert isolation item 5 (Super admin without header → `/admin/restaurants` 200; with header → that Restaurant) and item 8's `bootstrap_dev` leg on the real routes; the probe-based versions live in `tests/test_view_guards.py`.
  - `Restaurant.ai_provider` is a blank string, not NULL, when unset; `Restaurant.email`/`phone` are blank strings where the legacy API had NULL (golden 40 shows the legacy nulls; compare per the goldens README).
  - The platform-scope guard is `core.decorators.public_only`; the Super admin permission is `core.permissions.IsSuperAdmin` (message `هذه الصفحة لمدير المنصة فقط`, golden 40). A Super admin token with `X-Restaurant-Id` on a platform route answers 400 `هذا المسار للمنصة فقط`.

- 2026-09-04 — implemented. **Console routes:** new shared app `platform_admin` (no models) holds
  both; `GET /admin/restaurants` lists every Restaurant newest first, `POST /admin/restaurants/
  {id}/status` suspends or reactivates one and takes effect on that Restaurant's next request
  because the middleware reads the status every time. Both carry `IsAuthenticated + IsSuperAdmin`
  under `@public_only`, so a Super admin who sends `X-Restaurant-Id` is refused 400. `created_at`
  is `%Y-%m-%dT%H:%M:%SZ`; the two new Arabic strings are in `core/messages.py`
  (`INVALID_RESTAURANT_STATUS`, `RESTAURANT_STATUS_UPDATED`). Deliberate deviations from the
  goldens, per `tests/goldens/README.md`: an unknown Restaurant answers 404 and an invalid status
  400, where the legacy API answered 200 with `{"error"}`; `email` and `phone` are blank strings
  where the legacy rows were NULL (the frontend renders both as "—").
- 2026-09-04 — **Django admin.** `accounts.admin.UserAdmin` subclasses Django's for its password
  machinery only (the hash is never shown, the "reset password" form sets a new one); every
  inherited fieldset, filter and `filter_horizontal` is replaced, since this User has no
  `PermissionsMixin`. The add form is `StaffCreationForm(BaseUserCreationForm)`, **not** Django's
  `UserCreationForm`, whose `clean_username` rejects a display name any other user holds — ours are
  unique per Restaurant, so two Restaurants may each have a "cashier". The `CheckConstraint` is
  validated by the form, so a Cashier without a Restaurant comes back as a form error rather than
  an `IntegrityError`. Passwords set in the console pass `AUTH_PASSWORD_VALIDATORS` (8+ characters,
  not common), unlike the API's legacy six-character rule and unlike `bootstrap_dev`.
  `tenants.admin.RestaurantAdmin` edits name, Slug, contacts, country, currency, timezone, status
  and AI provider; `schema_name`, `created_at` and `last_heartbeat_at` are read-only; adding one
  goes through the new `tenants.services.provision()`, which registration also uses, so a
  console-created Restaurant gets its schema and Domain row. Deleting is disabled: the schema and
  its data would outlive the row (backlog). `Domain` is registered too.
- 2026-09-04 — **`INSTALLED_APPS` order changed** (`waheed/settings/base.py`): `django.contrib
  .admin` now leads, deduplicated with `dict.fromkeys`. django-tenants ships `admin/index.html` and
  `admin/app_list.html` overrides whose `{% is_public_schema %}` tag reads
  `request.tenant.schema_name` unconditionally; our platform-scope requests set `request.tenant =
  None` (plan §3.2), so every admin page raised `AttributeError`. `SHARED_APPS` still lists
  `django_tenants` first. The colouring those templates add is for browsing tenant schemas in the
  admin, which this console never does.
- 2026-09-04 — **`bootstrap_dev`** lives in `tenants/management/commands/`. One transaction,
  idempotent by create-if-missing (an account that exists keeps its current password), reporting
  each line it created or skipped. Verified twice against the local dev database and through the
  API in `tests/test_bootstrap_dev.py`. Its Restaurant-data legs are handed to tickets 05 to 07.
- 2026-09-04 — **Tests**: 211 → 248. `tests/test_admin_restaurants.py` (14, golden-backed),
  `tests/test_suspension.py` (5), `tests/test_django_admin.py` (11, the console driven through its
  own forms and then through the API), `tests/test_bootstrap_dev.py` (7). `tests/conftest.suspend`
  is now a fixture that posts the status route, so every suspension test in the suite exercises the
  console end to end; isolation item 5 is re-asserted on `GET /admin/restaurants` and item 8's seed
  leg on the real routes. The customer half of suspension still runs against the customer probe
  until `GET /menu` exists (ticket 05).

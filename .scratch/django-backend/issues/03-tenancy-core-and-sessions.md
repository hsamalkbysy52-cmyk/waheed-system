# 03: Tenancy core and sessions

**What to build:** A restaurant owner registers, receives a schema of their own, signs in from the existing login page, and every request is scoped to their Restaurant. Super admins and Slug-only customers are resolved as designed, and nobody can reach another Restaurant's data.

**Blocked by:** 01, 02

**Status:** implemented — awaiting review (2026-09-04; commits 58ef3bf and the review-fix commit)

- [x] Public-schema models: Restaurant as tenant (slug, country JO, currency JOD, timezone Asia/Amman, status, last Heartbeat, optional AI provider), the mandatory domain record, and User (email login, username unique per Restaurant, role, Restaurant link null only for super_admin enforced by a database constraint)
- [x] Tenant middleware resolves the Restaurant from the JWT, the super-admin header or the Slug, records the source, answers 401 to invalid tokens, 403 to a mismatched header and to Suspended Restaurants, and runs after CORS so those responses carry CORS headers
- [x] Decorators for tenant-required, public-only and public-tenant-allowed views; permission classes for the three roles; exception handler emitting `{error, detail}` with real status codes
- [x] `POST /register` provisions the schema, domain record and owner Admin with an auto-generated Slug and returns the legacy body plus a refresh token; `POST /login` returns the legacy body plus refresh; `POST /auth/refresh` and `GET /me` (username, role, restaurant id, Restaurant name, slug, currency, timezone)
- [x] JWT claims carry role, restaurant id and username; access 8 hours, refresh 30 days
- [x] Tests: register and login match the goldens; isolation matrix items 2, 3, 5, 6, 8 and 9 pass

## Comments

- 2026-09-04 (from ticket 01) — handoffs:
  - `core/middleware.JWTTenantMiddleware` is a placeholder that pins every request to `public`; replace its body with the plan §3.2 subclass of django-tenants' `TenantMainMiddleware` (keep the name and the MIDDLEWARE slot).
  - `accounts.User` exists as a bare `AbstractUser` so `AUTH_USER_MODEL` never has to be swapped; its `0001_initial` still has the default globally-unique `username` and a blank, non-unique `email`. Alter it (or regenerate the migration, nothing is deployed) to email login, username unique per Restaurant, role and the Restaurant link.
  - `core/responses.py` (`ok()`/`fail()` from plan §2 and §4) does not exist yet; introduce it together with the exception handler and switch the two health views in `core/views.py` to it.
  - Tests only have pytest-django's `client`; add `tests/conftest.py` with a Restaurant fixture and django-tenants' `TenantClient` before the first tenant-route test.

- 2026-09-04 — implemented. Routes: `POST /register`, `POST /login`, `POST /auth/refresh`, `GET /me` (`{username, role, restaurant_id, restaurant: {name, slug, currency, timezone} | null}`). `core/` gained `middleware` (the plan §3.2 subclass), `decorators`, `permissions`, `exceptions`, `responses` (`ok()` and `error_body()`; the plan's `fail()` was never needed because views raise DRF exceptions and the handler builds the body) and `messages` (every Arabic string in one place). Both initial migrations were regenerated (nothing was deployed) and the local `waheed` database recreated from them. 48 new HTTP tests; the whole suite runs in about two seconds. `/code-review` (standards + spec) ran against 2679ec4; its actionable findings are in the review-fix commit, the rest are the decisions and handoffs below.
  - Decisions recorded here because they deviate from the plan or the legacy API, each deliberate:
    - `User(AbstractBaseUser)` without `PermissionsMixin`: `role` is the single authority; `is_staff` is a property (`role == super_admin`) and `has_perm`/`has_module_perms` answer from the role. No groups or permission tables.
    - The exception handler emits only `{error, detail}` for validation failures, not the plan §4 `errors` field map: the golden comparison rejects extra keys and the frontend shows one line. The first failed check wins, in the legacy order (name, email format, password length, email taken).
    - Emails are compared case-insensitively as a whole (normalised at registration and sign-in); the legacy API compared them exactly. `phone` is optional at registration (the legacy API answered a 422 in English when it was missing).
    - `IsRestaurantAdmin` and `IsCashierOrAdmin` exclude Super admins: they look at a Restaurant by naming it (spec story 7) but do not act as its staff. The legacy API had no role checks on Restaurant routes.
    - New refusals with no legacy precedent: unknown `X-Restaurant-Id` or Slug → 404 `المطعم غير موجود`; tenant route without a Restaurant → 400 `المطعم غير محدد`; platform route with one → 400 `هذا المسار للمنصة فقط`; Suspended Restaurant reached by Slug → 403 `المطعم غير متاح حالياً` (Q4).
    - `Restaurant.ai_provider` is a blank string rather than NULL (ruff DJ001 forbids nullable CharFields); blank means the platform default.
    - django-tenants' `TenantClient` is not used: it resolves by hostname, which ADR-0001 rejects. `tests/conftest.py` provisions Restaurants the way registration does and obtains tokens through `POST /login`. Tenant routes do not exist yet, so the decorators and permissions are exercised through four test-only probe routes (`tests/probe_urls.py`) mounted with `pytest.mark.urls`.
    - Isolation matrix: items 2, 3, 6 and 9 hold on `/me`; item 5 and the slug-less 400 of item 3 hold on the probes and must be re-asserted on `/admin/restaurants` (ticket 04) and `/menu` (ticket 05); item 8 covers `migrate_schemas` plus register → login → me from an empty database, and gains its `bootstrap_dev` leg in ticket 04.
    - Throttling of `/login` and `/register` (plan §4) is owned by no ticket; added to `backlog.md`.

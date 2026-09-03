# 03: Tenancy core and sessions

**What to build:** A restaurant owner registers, receives a schema of their own, signs in from the existing login page, and every request is scoped to their Restaurant. Super admins and Slug-only customers are resolved as designed, and nobody can reach another Restaurant's data.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] Public-schema models: Restaurant as tenant (slug, country JO, currency JOD, timezone Asia/Amman, status, last Heartbeat, optional AI provider), the mandatory domain record, and User (email login, username unique per Restaurant, role, Restaurant link null only for super_admin enforced by a database constraint)
- [ ] Tenant middleware resolves the Restaurant from the JWT, the super-admin header or the Slug, records the source, answers 401 to invalid tokens, 403 to a mismatched header and to Suspended Restaurants, and runs after CORS so those responses carry CORS headers
- [ ] Decorators for tenant-required, public-only and public-tenant-allowed views; permission classes for the three roles; exception handler emitting `{error, detail}` with real status codes
- [ ] `POST /register` provisions the schema, domain record and owner Admin with an auto-generated Slug and returns the legacy body plus a refresh token; `POST /login` returns the legacy body plus refresh; `POST /auth/refresh` and `GET /me` (username, role, restaurant id, Restaurant name, slug, currency, timezone)
- [ ] JWT claims carry role, restaurant id and username; access 8 hours, refresh 30 days
- [ ] Tests: register and login match the goldens; isolation matrix items 2, 3, 5, 6, 8 and 9 pass

## Comments

- 2026-09-04 (from ticket 01) — handoffs:
  - `core/middleware.JWTTenantMiddleware` is a placeholder that pins every request to `public`; replace its body with the plan §3.2 subclass of django-tenants' `TenantMainMiddleware` (keep the name and the MIDDLEWARE slot).
  - `accounts.User` exists as a bare `AbstractUser` so `AUTH_USER_MODEL` never has to be swapped; its `0001_initial` still has the default globally-unique `username` and a blank, non-unique `email`. Alter it (or regenerate the migration, nothing is deployed) to email login, username unique per Restaurant, role and the Restaurant link.
  - `core/responses.py` (`ok()`/`fail()` from plan §2 and §4) does not exist yet; introduce it together with the exception handler and switch the two health views in `core/views.py` to it.
  - Tests only have pytest-django's `client`; add `tests/conftest.py` with a Restaurant fixture and django-tenants' `TenantClient` before the first tenant-route test.

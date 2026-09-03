# 01: Prefactor and scaffold the Django API

**What to build:** The previous FastAPI backend moves aside as a read-only backup and a new Django API takes its place, answering health checks from a real PostgreSQL and Redis setup, with lint and the HTTP test harness in place so every later ticket starts green.

**Blocked by:** None (can start immediately)

**Status:** implemented — awaiting review (2026-09-04; commits 621a07d, 44ffedf, 5a3ab3c and the review-fix commit)

- [x] The legacy backend is moved to a `backend_legacy` directory and left untouched; ignore rules still cover its virtualenv and database file
- [x] New Django 5.2 project on Python 3.10 with base/dev/prod settings, the plan's pinned dependencies, an environment example, ruff and pytest configured
- [x] django-tenants wired (PostgreSQL tenant backend, sync router, shared and tenant app lists) and `migrate_schemas --shared` succeeds on an empty database
- [x] Celery app configured with Redis as broker; Redis cache with tenant-aware keys; Celery runs eagerly under tests
- [x] Django admin, sessions and messages enabled in the public schema; the middleware order from the plan (CORS first, tenant middleware second)
- [x] `GET /` returns the legacy health body and `GET /health` returns 200; one HTTP test per route passes against PostgreSQL
- [x] `ruff check` passes; a backend README stub documents the local run and test commands
- [x] Committed and pushed to `faysal`

## Comments

- 2026-09-04 — implemented. Deviations from the plan, each recorded in the plan or `backlog.md`: redis pinned 6.4.0 (kombu 5.6 caps it below 6.5); `django.contrib.contenttypes` in both app lists (django-tenants refuses an empty `TENANT_APPS`); `django.contrib.staticfiles` added for the admin; the plan's `REVERSE_KEY_FUNCTION` dropped (django-redis only). Added beyond the checklist: `waheed/settings/test.py` (eager Celery), a bare custom `accounts.User` so `AUTH_USER_MODEL` is never swapped, `GET /health` pings PostgreSQL, an admin-login smoke test, secure cookies in prod, and prod-defaulting `wsgi.py`/`asgi.py`/Celery entrypoints. Local-machine note: `brew services` cannot start PostgreSQL or Redis under this account (Homebrew's `var` belongs to another user); both run user-owned per `backend/README.md`. Handoffs recorded in the comments of tickets 02, 03 and 16. `/code-review` (standards + spec) ran against d3a8e71; its actionable findings are in the review-fix commit, the rest are the handoffs above.

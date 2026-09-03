# 01: Prefactor and scaffold the Django API

**What to build:** The previous FastAPI backend moves aside as a read-only backup and a new Django API takes its place, answering health checks from a real PostgreSQL and Redis setup, with lint and the HTTP test harness in place so every later ticket starts green.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The legacy backend is moved to a `backend_legacy` directory and left untouched; ignore rules still cover its virtualenv and database file
- [ ] New Django 5.2 project on Python 3.10 with base/dev/prod settings, the plan's pinned dependencies, an environment example, ruff and pytest configured
- [ ] django-tenants wired (PostgreSQL tenant backend, sync router, shared and tenant app lists) and `migrate_schemas --shared` succeeds on an empty database
- [ ] Celery app configured with Redis as broker; Redis cache with tenant-aware keys; Celery runs eagerly under tests
- [ ] Django admin, sessions and messages enabled in the public schema; the middleware order from the plan (CORS first, tenant middleware second)
- [ ] `GET /` returns the legacy health body and `GET /health` returns 200; one HTTP test per route passes against PostgreSQL
- [ ] `ruff check` passes; a backend README stub documents the local run and test commands
- [ ] Committed and pushed to `faysal`

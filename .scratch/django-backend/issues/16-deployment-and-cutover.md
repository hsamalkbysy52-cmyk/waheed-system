# 16: Deployment and cutover

**What to build:** The API and the worker deploy on Railway with migrations before every release, the retired build tooling is gone, and the human cutover steps are scripted.

**Blocked by:** 12, 13

**Status:** implemented except the staging run (2026-09-04): the config, wizard and docs are in; the deployment itself and the staging checklist need the human (ready-for-human)

- [x] Railway config uses the Railpack builder, gunicorn as start command, a pre-deploy command that migrates all schemas, and the health path; the worker start command and every environment variable are documented; the environment example is complete
- [x] Nixpacks config and Procfile removed; backend README covers local run and tests; CLAUDE.md reflects the final layout
- [x] A cutover wizard (wizard skill) covers the steps only a human can do: PostgreSQL and Redis plugins, environment variables, service root directory, worker service, running the seed, checking the frontend's API URL
- [~] A staging verification checklist runs the isolation matrix and golden contract tests against the deployed URL and is recorded in this ticket's comments

## Comments

- 2026-09-04 (from ticket 01): `GET /health` runs `SELECT 1`, so Railway's health check (and its restart policy) fails while PostgreSQL is unreachable. Keep or relax that deliberately when writing `railway.json`. `wsgi.py` and the Celery app default to `waheed.settings.prod`; the Railway services still need `DJANGO_SETTINGS_MODULE` set explicitly.

- 2026-09-04 (from ticket 03): the User table's `UniqueConstraint(nulls_distinct=False)` needs PostgreSQL 15 or newer; confirm the Railway PostgreSQL plugin's version before the first `migrate_schemas`. `TENANT_BASE_DOMAIN` is a new environment variable (default `localhost`); it only fills the mandatory Domain row.

- 2026-09-04 (from ticket 04) — the Super admin console is served at `/django-admin/` and needs a
  Super admin account on the deployed database (`bootstrap_dev`, or `createsuperuser`) and static
  files (already in `backlog.md`: gunicorn serves none). `INSTALLED_APPS` is now built with
  `django.contrib.admin` first; keep that order when adding apps.

- 2026-09-04 (from ticket 04) — isolation matrix item 8 has no automated `migrate_schemas`-from-
  zero test: the test database is built by pytest-django, and `bootstrap_dev` plus `POST /register`
  are asserted on top of it (`tests/test_bootstrap_dev.py`, `tests/test_sessions.py`). The
  migration leg was verified by hand on a dropped and recreated local database (2026-09-04);
  cover it in this ticket's staging checklist against the deployed URL.

- 2026-09-04 — implemented. `backend/railway.json`: Railpack, `collectstatic` as the build command,
  `migrate_schemas --executor multiprocessing` as the pre-deploy command, gunicorn (3 workers, 60 s
  timeout) as the start command, `/health` with a 300 s timeout and `ON_FAILURE` restarts. The root
  `railway.json` and `nixpacks.toml` (the FastAPI service's) are deleted; `backend_legacy/Procfile`
  stays with the read-only backup. WhiteNoise (6.12.0) serves the Django admin's static files
  (`CompressedStaticFilesStorage`, no manifest, so a deploy that skipped `collectstatic` still
  serves); `XFrameOptionsMiddleware` is on; prod sets HSTS for a year and silences W008 and W021 on
  purpose (Railway's edge redirects to HTTPS and probes `/health` over HTTP; no preload submission).
  `tests/test_prod_settings.py` runs `manage.py check --deploy --fail-level WARNING` under the prod
  settings and asserts the hardening and the WhiteNoise placement. `scripts/railway_cutover_wizard.sh`
  walks the human through plugins (PostgreSQL 15+, Redis), the web service root directory and
  variables (with a generated `SECRET_KEY`), the worker service, the first release (polls `/health`),
  the seed and the frontend URL. `backend/README.md` gained a deployment section, the root README
  exists, `CLAUDE.md` names the final app layout, plan §11 lists the new variables.
- 2026-09-04 — **for the human (staging checklist)**, after the first deploy at `$API`:
  1. `curl $API/` → `{"message": "Waheed System Running!", "status": "ok"}`; `curl $API/health` → 200.
  2. `railway run python manage.py bootstrap_dev`, then `curl -X POST $API/login -H 'Content-Type:
     application/json' -d '{"email":"admin@restaurant1.local.placeholder","password":"admin123"}'` →
     `token`, `refresh`, `role: admin`.
  3. Isolation matrix (plan §3.9) with two Restaurants (register a second one): `GET /menu` with the
     other's `X-Restaurant-Id` → 403; `GET /menu?r=<other slug>` → that menu only; `POST /menu/add?r=`
     → 401; a Super admin without header on `/menu` → 400; a suspended Restaurant → 403 for staff and
     customers; ids from one Restaurant on the other's routes → 404.
  4. Contract: run the golden comparison against the deployed URL by pointing a copy of
     `tests/goldens/capture_legacy.py`'s recorder at `$API` (or walk the frontend pages: kanban,
     kitchen, tables + QR, menu, inventory, payments, dashboard, orders, customer table page).
  5. Django admin at `$API/django-admin/` renders with styles (WhiteNoise) and lists Restaurants,
     Users, Domains, WhatsApp accounts.
  6. Worker: `railway logs --service worker` shows it connected to Redis; cancel three orders as one
     cashier → the response carries `fraud_alert` and the worker logs the alert (log-only until a
     WhatsApp template is approved).
  7. Frontend: `NEXT_PUBLIC_API_URL=$API`; log in, place an order, scan a table QR (link carries
     `?r=<slug>`), order as a customer while a cashier device is online.
  Record the outcome here; anything red becomes a ticket.


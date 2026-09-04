# Waheed backend (Django)

Django 5.2 + Django REST Framework API with one PostgreSQL schema per Restaurant (django-tenants)
and Celery + Redis for background work. Built per `docs/plans/backend-django-migration-plan.md`.
The previous FastAPI API lives in `../backend_legacy/` as a read-only reference; edit nothing there.

## Local run

Requirements: Python 3.10 (pyenv `3.10.20`), PostgreSQL 15, Redis.

```bash
brew services start postgresql@15 && brew services start redis
createdb waheed
cd backend
python -m venv .venv && source .venv/bin/activate      # pyenv 3.10.20
pip install -e ".[dev]"
cp .env.example .env                                   # optional: every value is the local default
python manage.py migrate_schemas --shared              # never plain `migrate`
python manage.py runserver 8000
DJANGO_SETTINGS_MODULE=waheed.settings.dev celery -A waheed worker -l info   # second terminal
```

`manage.py` defaults to the dev settings; `wsgi.py`, `asgi.py` and the Celery app default to prod so a
deployment that forgets `DJANGO_SETTINGS_MODULE` fails at start-up rather than running with dev secrets.

Health: `GET http://localhost:8000/` (legacy body) and `GET http://localhost:8000/health`.
Django admin: `http://localhost:8000/django-admin/`.

### When `brew services` cannot start the services

If `/opt/homebrew/var` belongs to another macOS account, `brew services start` reports success
but launchd exits with status 78 (it cannot open its log files). Run both services under your own
account instead:

```bash
DEV=$HOME/.local/share/waheed-dev
PG=/opt/homebrew/opt/postgresql@15/bin
$PG/initdb -D $DEV/postgresql@15 -U $(whoami) --auth=trust -E UTF8 --locale=en_US.UTF-8   # once
$PG/pg_ctl -D $DEV/postgresql@15 -l $DEV/postgresql@15.log -o "-p 5432 -k /tmp" start
createdb -h localhost waheed                                                            # once
mkdir -p $DEV/redis && redis-server --port 6379 --daemonize yes --dir $DEV/redis \
  --logfile $DEV/redis/redis.log --pidfile $DEV/redis/redis.pid
```

Stop them with `$PG/pg_ctl -D $DEV/postgresql@15 stop` and `redis-cli shutdown`.

## Tests and lint

```bash
pytest                           # HTTP tests against a real PostgreSQL test database
pytest tests/test_health.py      # one file
ruff check . && ruff format --check .
```

Tests use `waheed.settings.test` (set in `pyproject.toml`): Celery runs tasks eagerly, so no worker
is needed, but PostgreSQL and Redis must be running.

## Deployment (Railway)

`railway.json` in this directory configures the web service: Railpack builder, `collectstatic` at
build time, `migrate_schemas` as the pre-deploy command, gunicorn as the start command and
`/health` as the health check. A second service runs the worker from the same root directory:

```bash
celery -A waheed worker -l info --concurrency 2
```

Both services need `DJANGO_SETTINGS_MODULE=waheed.settings.prod` and the variables listed in
`.env.example` (`SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`,
`TENANT_BASE_DOMAIN`, the AI keys and the WhatsApp secrets). PostgreSQL must be 15 or newer.
Static files for the Django admin are served by WhiteNoise. The human steps (plugins, variables,
root directory, worker service, seed, frontend URL) are scripted as a wizard:

```bash
scripts/railway_cutover_wizard.sh      # Railway deployment and cutover
scripts/whatsapp_setup_wizard.sh       # Meta app, test number, webhook (ADR-0004)
```

Migrations never run at start-up: only `migrate_schemas` in the pre-deploy command (or by hand).


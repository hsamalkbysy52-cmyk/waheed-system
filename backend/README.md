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

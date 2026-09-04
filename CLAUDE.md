# Waheed System — Restaurant OS

Multi-restaurant (multi-tenant) SaaS for restaurants: cashier POS and kanban, kitchen board, floor plan with per-table QR ordering, inventory with recipes and modifiers, AI report/chat agents, WhatsApp ordering bot. UI language is Arabic; the code is English.

## Layout

- `backend/` — Django 5.2 + DRF API. One PostgreSQL schema per restaurant via django-tenants; Celery + Redis for background work. Built per `docs/plans/backend-django-migration-plan.md` (approved; read it before backend work). Shared apps: `tenants`, `accounts`, `platform_admin`, `core`; per-Restaurant apps: `menu`, `inventory`, `layout`, `orders`, `messaging`, `ai`. `scripts/` holds the human wizards (Railway cutover, WhatsApp onboarding); `railway.json` is the deployment.
- `backend_legacy/` — the previous FastAPI API, kept as a read-only backup for behaviour reference. Edit nothing there; the user decides when it is deleted.
- `frontend/` — Next.js 16 (App Router) cashier, admin and customer UI. Read `frontend/AGENTS.md` first: this Next.js version differs from training data.
- `CONTEXT.md` (glossary), `docs/adr/` (decisions), `docs/plans/` (approved plans), `docs/research/` (fact sheets), `backlog.md` (everything postponed), `.scratch/<feature>/` (specs and tickets).

## Working rules

- Identifiers, commit messages and docs in English. Comments may be Arabic. Arabic user-facing strings the frontend displays stay byte-identical.
- Every existing feature keeps working after every change; the API contract table in the plan (§1.3) is the checklist.
- Python **3.10** only: `models.TextChoices` for enums, `typing.Optional`/`Union`, `typing_extensions.Self`. Skip `StrEnum`, `tomllib`, `except*`, PEP 695 generics.
- DRF views are **function-based**: `@api_view` plus decorators. Validation in serializers, business logic in `services.py`, views stay thin.
- Money is `Decimal` (`DecimalField(max_digits=12, decimal_places=3)`, JOD has three decimals; use `core.money.amount_field`), serialized as JSON numbers.
- Tenant safety: tenant models live in `TENANT_APPS` and are only reached with a tenant on the connection. Celery tasks take `schema_name` and run inside `schema_context`. Migrations run with `migrate_schemas`, never `migrate`.
- One responsibility per function. When a better practice improves the system, apply it and say what changed.
- The moment something is postponed, deferred or marked "later", add it to `backlog.md` with a one-line reason and where it was decided; remove it when it ships.

## Local gotchas

- Frontend needs `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000`; without it every call goes to the **production** Railway API.
- Backend tests need PostgreSQL running (`brew services start postgresql@15`) and Redis for Celery (`brew services start redis`). SQLite is not supported.
- Python comes from pyenv `3.10.20`; the venv is `backend/.venv` (`pip install -e ".[dev]"`). The legacy venv is `backend_legacy/.venv`; call it as `python -m ...` because its scripts' shebangs point at the new venv.
- If `brew services start` reports success but nothing listens (launchd status 78: `/opt/homebrew/var` belongs to another macOS account), run PostgreSQL and Redis under your own account as described in `backend/README.md`.

## Workflow

Every piece of work runs, in order: `/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` → `/code-review`. Work on branch `faysal`; commit small and push to `origin/faysal` right after each commit.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/` (`spec.md` plus `issues/NN-<slug>.md`), committed to `faysal`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five defaults: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

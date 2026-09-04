# Waheed System

Multi-restaurant restaurant OS: cashier POS and kanban, kitchen board, floor plan with per-table QR
ordering, inventory with recipes, AI report and chat agents, WhatsApp ordering. Arabic UI, English code.

- `backend/` — Django 5.2 API, one PostgreSQL schema per Restaurant. See `backend/README.md` for
  the local run, tests and the Railway deployment.
- `frontend/` — Next.js 16 app (cashier, admin, customer pages). Needs `frontend/.env.local` with
  `NEXT_PUBLIC_API_URL`.
- `backend_legacy/` — the previous FastAPI API, kept read-only for reference.
- `docs/` — the approved migration plan, ADRs and research; `CONTEXT.md` is the glossary;
  `backlog.md` holds everything postponed; `.scratch/` holds specs and tickets.

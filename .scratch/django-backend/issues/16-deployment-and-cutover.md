# 16: Deployment and cutover

**What to build:** The API and the worker deploy on Railway with migrations before every release, the retired build tooling is gone, and the human cutover steps are scripted.

**Blocked by:** 12, 13

**Status:** ready-for-agent

- [ ] Railway config uses the Railpack builder, gunicorn as start command, a pre-deploy command that migrates all schemas, and the health path; the worker start command and every environment variable are documented; the environment example is complete
- [ ] Nixpacks config and Procfile removed; backend README covers local run and tests; CLAUDE.md reflects the final layout
- [ ] A cutover wizard (wizard skill) covers the steps only a human can do: PostgreSQL and Redis plugins, environment variables, service root directory, worker service, running the seed, checking the frontend's API URL
- [ ] A staging verification checklist runs the isolation matrix and golden contract tests against the deployed URL and is recorded in this ticket's comments

## Comments

- 2026-09-04 (from ticket 01): `GET /health` runs `SELECT 1`, so Railway's health check (and its restart policy) fails while PostgreSQL is unreachable. Keep or relax that deliberately when writing `railway.json`. `wsgi.py` and the Celery app default to `waheed.settings.prod`; the Railway services still need `DJANGO_SETTINGS_MODULE` set explicitly.

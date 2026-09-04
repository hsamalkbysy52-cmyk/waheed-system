#!/usr/bin/env bash
# Railway deployment and cutover wizard (plan §8 phases 5 and 6; ticket 16).
#
# Walks a human through the steps only a human can do in the Railway dashboard, and checks each
# one it can check from here. Run from backend/ with the Railway CLI logged in (optional).
set -euo pipefail

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ask() { local reply; read -r -p "$1 " reply; printf '%s' "$reply"; }
pause() { read -r -p "Press Enter when done... " _; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing tool: $1"; exit 1; }; }
need curl; need python3

say "Step 1 of 7 — the Railway project and plugins"
cat <<'TXT'
  In https://railway.com/ open the existing Waheed project (the one serving the legacy API).
  Add two plugins to the project: PostgreSQL (must be 15 or newer: the users table uses
  UNIQUE NULLS NOT DISTINCT) and Redis. Railway exposes DATABASE_URL and REDIS_URL for them.
TXT
pause

say "Step 2 of 7 — point the web service at the new backend"
cat <<'TXT'
  Web service → Settings:
    Root Directory:      backend
    Builder:             Railpack (picked up from backend/railway.json)
    Start / pre-deploy / health check come from backend/railway.json:
      pre-deploy  python manage.py migrate_schemas --executor multiprocessing
      start       gunicorn waheed.wsgi:application --bind 0.0.0.0:$PORT --workers 3 --timeout 60
      health      /health
  Remove any old start command override left from the FastAPI service (uvicorn main:app).
TXT
pause

say "Step 3 of 7 — environment variables for the web service"
SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
cat <<TXT
  Set these on the web service (Variables tab). Reference the plugins for the two URLs.
    DJANGO_SETTINGS_MODULE = waheed.settings.prod
    SECRET_KEY             = ${SECRET}
    DATABASE_URL           = \${{Postgres.DATABASE_URL}}
    REDIS_URL              = \${{Redis.REDIS_URL}}
    ALLOWED_HOSTS          = <the service's public host, e.g. waheed-system-production.up.railway.app>
    CORS_ALLOWED_ORIGINS   = <the frontend origin(s), comma separated, https://...>
    TENANT_BASE_DOMAIN     = <the service's public host>
    AI_DEFAULT_PROVIDER    = gemini
    GEMINI_API_KEY         = <from https://aistudio.google.com/apikey>
    OPENAI_API_KEY         = <optional fallback>
    WHATSAPP_VERIFY_TOKEN / WHATSAPP_APP_SECRET = <from scripts/whatsapp_setup_wizard.sh>
  Optional: GEMINI_MODEL, OPENAI_MODEL, AGENT_THROTTLE_RATE, MESSAGING_SENDER,
            WHATSAPP_FRAUD_ALERT_TEMPLATE, SECURE_SSL_REDIRECT (see .env.example).
TXT
pause

say "Step 4 of 7 — the Celery worker service"
cat <<'TXT'
  + New → Empty service (same repo, Root Directory backend), name it "worker".
  Settings → Start Command:   celery -A waheed worker -l info --concurrency 2
  Disable the health check for this service (it serves no HTTP).
  Variables: the same set as the web service (Railway's "shared variables" or copy them).
TXT
pause

say "Step 5 of 7 — deploy and watch the first release"
API_URL="$(ask 'Paste the web service public URL (https://..., no trailing slash):')"
echo "  Waiting for /health..."
for _ in $(seq 1 30); do
  if curl -fsS "${API_URL}/health" >/dev/null 2>&1; then echo "  OK: /health answers 200."; break; fi
  sleep 10
done
curl -fsS "${API_URL}/" || echo "  The root route did not answer; check the deploy logs (migrations run in pre-deploy)."

say "Step 6 of 7 — seed the demo Restaurant (or register a real one)"
cat <<'TXT'
  Fresh database (decision: no legacy import). Either
    railway run --service <web> python manage.py bootstrap_dev      (demo accounts, plan §7)
  or register the first real Restaurant from the frontend's /register page.
  Then create the Super admin through bootstrap_dev, or:
    railway run --service <web> python manage.py createsuperuser
  and open <API_URL>/django-admin/ to check the console loads with its styles (WhiteNoise).
TXT
pause

say "Step 7 of 7 — the frontend"
cat <<TXT
  The frontend's NEXT_PUBLIC_API_URL must be ${API_URL} (Vercel project variables, or
  frontend/.env.local for a local run). Redeploy the frontend after changing it.
  Smoke test: log in as the demo Admin, open the tables page, scan a QR: the link carries ?r=<slug>.
TXT
echo "Done. Record the staging checklist results in .scratch/django-backend/issues/16-deployment-and-cutover.md."

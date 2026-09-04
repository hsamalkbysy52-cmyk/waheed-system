#!/usr/bin/env bash
# WhatsApp Cloud API onboarding wizard (ADR-0004; ticket 15).
#
# Walks a human through the steps only a human can do: creating the Meta app, obtaining the free
# test number, pointing Meta's webhook at this backend through a tunnel, and connecting the number
# to a Restaurant in the Django admin. Every step prints what to do, waits, then checks what it can.
#
# Usage: scripts/whatsapp_setup_wizard.sh            (from backend/, with the API running on :8000)
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
API_VERSION="${WHATSAPP_API_VERSION:-v21.0}"
ENV_FILE="${ENV_FILE:-.env}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ask() { local reply; read -r -p "$1 " reply; printf '%s' "$reply"; }
pause() { read -r -p "Press Enter when done... " _; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing tool: $1"; exit 1; }; }
need curl; need python3

say "Step 1 of 6 — Meta developer account and app"
cat <<'TXT'
  1. Sign in at https://developers.facebook.com/ (create a developer account if needed).
  2. My Apps → Create App → type "Business" → name it (e.g. "Waheed WhatsApp") → create.
  3. On the app dashboard add the product "WhatsApp" → Set up. A Meta Business Account is
     created or chosen for you.
TXT
pause

say "Step 2 of 6 — the free test number and a recipient"
cat <<'TXT'
  WhatsApp → API Setup shows a test phone number with its "Phone number ID" and a temporary
  access token (24 h; create a permanent System User token later for production).
  Add your own WhatsApp number under "To" as a test recipient and confirm the code you receive.
TXT
PHONE_NUMBER_ID="$(ask 'Paste the Phone number ID:')"
ACCESS_TOKEN="$(ask 'Paste the access token:')"
DISPLAY_PHONE="$(ask 'The test number as shown (digits only, e.g. 15551234567):')"
OWNER_PHONE="$(ask 'Your own WhatsApp number for fraud alerts (digits, country code, no +):')"

say "Checking the token against the Graph API..."
if curl -fsS "https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}" \
     -H "Authorization: Bearer ${ACCESS_TOKEN}" >/dev/null; then
  echo "  OK: Meta recognises the number id and token."
else
  echo "  The Graph API refused the token or number id; re-check both before continuing."
  pause
fi

say "Step 3 of 6 — secrets for the webhook"
APP_SECRET="$(ask 'App → Settings → Basic → App secret (click Show), paste it:')"
VERIFY_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
echo "  Generated a verify token for you: ${VERIFY_TOKEN}"
if [ -f "${ENV_FILE}" ]; then
  python3 - "$ENV_FILE" "$APP_SECRET" "$VERIFY_TOKEN" <<'PY'
import pathlib, sys
path, secret, verify = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
lines = [l for l in path.read_text().splitlines()
         if not l.startswith(("WHATSAPP_APP_SECRET=", "WHATSAPP_VERIFY_TOKEN=", "MESSAGING_SENDER="))]
lines += [f"WHATSAPP_APP_SECRET={secret}", f"WHATSAPP_VERIFY_TOKEN={verify}",
          "MESSAGING_SENDER=messaging.whatsapp.WhatsAppSender"]
path.write_text("\n".join(lines) + "\n")
print(f"  Wrote WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN and MESSAGING_SENDER to {path}")
PY
else
  echo "  No ${ENV_FILE} found; export these before starting the API:"
  echo "    WHATSAPP_APP_SECRET=${APP_SECRET}"
  echo "    WHATSAPP_VERIFY_TOKEN=${VERIFY_TOKEN}"
  echo "    MESSAGING_SENDER=messaging.whatsapp.WhatsAppSender"
fi
echo "  Restart the API (and the Celery worker) so they pick the values up."
pause

say "Step 4 of 6 — a public HTTPS URL for the webhook"
cat <<TXT
  Meta must reach ${BACKEND_URL}/webhooks/whatsapp over HTTPS. Locally, open a tunnel, e.g.:
    cloudflared tunnel --url ${BACKEND_URL}      or      ngrok http 8000
TXT
PUBLIC_URL="$(ask 'Paste the public https URL of the tunnel (no trailing slash):')"
say "Checking the verification handshake as Meta will do it..."
CHALLENGE="wizard-$RANDOM"
GOT="$(curl -fsS "${PUBLIC_URL}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${CHALLENGE}" || true)"
if [ "${GOT}" = "${CHALLENGE}" ]; then
  echo "  OK: the backend answered the challenge through the tunnel."
else
  echo "  The backend did not echo the challenge (got: '${GOT}'). Is the API restarted with the new"
  echo "  WHATSAPP_VERIFY_TOKEN, and is the tunnel up? Fix it, then continue."
  pause
fi

say "Step 5 of 6 — register the webhook with Meta"
cat <<TXT
  WhatsApp → Configuration → Webhook → Edit:
    Callback URL:  ${PUBLIC_URL}/webhooks/whatsapp
    Verify token:  ${VERIFY_TOKEN}
  Save (Meta calls the URL and expects the challenge back), then click Manage and subscribe to
  the "messages" field.
TXT
pause

say "Step 6 of 6 — connect the number to a Restaurant"
cat <<TXT
  Open ${BACKEND_URL}/django-admin/tenants/whatsappaccount/add/ as the Super admin and enter:
    Restaurant:        the Restaurant this number belongs to
    Phone number id:   ${PHONE_NUMBER_ID}
    Display phone:     ${DISPLAY_PHONE}
    Access token:      (the token from step 2)
    Owner phone:       ${OWNER_PHONE}
    Enabled:           checked
TXT
pause

say "Smoke test"
cat <<'TXT'
  From your own WhatsApp, message the test number "مرحبا". Within a few seconds the Chat agent
  should reply (the worker log shows the task). Then order something and answer "نعم": the Order
  appears on that Restaurant's kanban with cashier "WhatsApp".
  Fraud alerts stay logged only until Meta approves a utility template named in
  WHATSAPP_FRAUD_ALERT_TEMPLATE (body slots: restaurant, cashier, count, order id).
TXT
echo "Done."

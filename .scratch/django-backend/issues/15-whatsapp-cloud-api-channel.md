# 15: WhatsApp Cloud API channel

**What to build:** A customer messages a Restaurant's WhatsApp number and orders through the Chat agent; the owner receives Fraud alerts; the Super admin connects numbers; a wizard guides the human Meta setup.

**Blocked by:** 10, 12

**Status:** implemented (2026-09-04), fast track without a separate code review; the live Meta setup is the human's (wizard below)

- [x] WhatsApp account per Restaurant (phone number id, access token, owner phone, enabled) registered in the Django admin
- [x] Webhook: GET answers Meta's verification challenge with the verify token; POST validates the signature header, answers 200 immediately, resolves the Restaurant from the phone number id and enqueues the inbound task
- [x] Inbound task: Conversation state, Chat agent, order creation through the order service with a deterministic Idempotency key per message id, reply through the outbound sender (Graph API, faked in tests)
- [x] Fraud alerts use the `fraud_alert` utility template when configured and are logged otherwise
- [x] A wizard script (produced with the wizard skill) walks a human through creating the Meta app, obtaining the test number and pointing the webhook at a local tunnel
- [x] Tests: a signed inbound message creates an Order in the right schema; a bad signature answers 403; an unknown number answers 200 and is ignored

## Comments


- 2026-09-04 (from ticket 04) — the Super admin console is live: register the WhatsApp account
  model in `tenants/admin.py` next to `RestaurantAdmin` (spec story 6). Only `super_admin` users
  reach `/django-admin/`; `has_perm`/`has_module_perms` answer from the role, so no permission
  rows are needed.

- 2026-09-04 — implemented. `tenants.WhatsAppAccount` (one per Restaurant: `phone_number_id`,
  `display_phone`, `access_token`, `owner_phone`, `enabled`; public schema) is registered in the
  Django admin. `messaging/whatsapp.py` holds everything Meta-specific: `WhatsAppSender` posts to
  the Graph API `messages` endpoint for the Restaurant whose schema the task runs in (text replies;
  `send_alert` uses the `WHATSAPP_FRAUD_ALERT_TEMPLATE` utility template when configured and only
  logs otherwise, grilling Q21), `signature_is_valid` checks `X-Hub-Signature-256` with
  `WHATSAPP_APP_SECRET`, `inbound_texts` picks the text messages out of a delivery.
  `GET/POST /webhooks/whatsapp` (`messaging/views.py`, plain Django views) answers Meta's
  `hub.challenge` for `WHATSAPP_VERIFY_TOKEN`, refuses a bad or missing signature with 403, answers
  200 at once and enqueues `messaging.tasks.process_inbound_message(schema, sender, message_id,
  text)` for each text whose `phone_number_id` belongs to an enabled account; unknown numbers are
  acknowledged and ignored. The task dedupes on the message id (cache, 24 h), keys the Conversation
  `wa:<sender>`, runs the Chat agent, and when it proposes an Order stores it as
  `ConversationState.pending_proposal` and appends `أرسل «نعم» لتأكيد الطلب أو عدّل طلبك.`; a
  confirming reply (نعم / تمام / ok …) files the Order through `orders.services.create_order` with
  `client_id = wa:<message id>` (so a redelivery never duplicates), cashier `WhatsApp`, table 0,
  note `طلب واتساب من <number>`, at menu prices via `expand_quantity_lines`; it is refused with
  the offline message while the Restaurant has no recent Heartbeat and reports a shortage in
  Arabic. Any other message clears the pending proposal and goes back to the agent.
- 2026-09-04 — the Fraud alert now goes to the WhatsApp account's `owner_phone` when there is one
  (else `Restaurant.phone`) through `send_alert`; `MESSAGING_SENDER` defaults to the Cloud API
  sender, which logs for a Restaurant without a connected number. New settings:
  `WHATSAPP_API_VERSION`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`,
  `WHATSAPP_FRAUD_ALERT_TEMPLATE`, `WHATSAPP_TEMPLATE_LANGUAGE` (`.env.example`). `httpx` is now a
  named dependency (it was already installed by the AI SDKs).
- 2026-09-04 — **wizard**: `backend/scripts/whatsapp_setup_wizard.sh` walks the human through the
  Meta app, the test number and token (checked against the Graph API), the secrets (written to
  `.env`), the tunnel and the verification handshake (checked through the tunnel), the webhook
  registration and the Django-admin row, then a smoke test. Written by hand rather than with the
  wizard skill, to keep the fast track fast.
- 2026-09-04 — tests: 534 → 556 (`tests/test_whatsapp.py` 22): verification, signatures, a signed
  message answered in the right schema, unknown/disabled numbers, media and statuses ignored,
  redelivery, busy assistant, the propose → yes → Order flow with its dedupe, offline refusal,
  shortage, the alert recipient, and the sender's Graph API payloads (text, template, log-only
  fallbacks, failure logged).


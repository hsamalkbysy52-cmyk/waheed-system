---
status: accepted
date: 2026-09-03
---

# WhatsApp ordering runs on Meta's Cloud API, one business number per Restaurant

The legacy bot used neonize, an unofficial WhatsApp Web client: free per message, but it violates WhatsApp's business terms (accounts get limited or banned), breaks when the web protocol changes, and needs one always-on process with a session volume per restaurant. We move to the official WhatsApp Business Platform (Cloud API) called directly, without a Business Solution Provider. For our traffic it is effectively free: every reply inside a customer's 24-hour service window costs nothing, and the only business-initiated messages are owner fraud alerts sent as a utility template (about $0.009 each in the "Rest of Middle East" rate card that covers Jordan and Iraq). Each Restaurant gets its own business phone number registered under the platform's WhatsApp Business Account; the Super admin enters the number id and access token in the Django admin. Inbound messages arrive on one HTTPS webhook and are processed by Celery inside the Restaurant's schema.

## Considered options

- neonize / whatsmeow (status quo): rejected for the ban risk and per-restaurant worker cost.
- Twilio or 360dialog: same Meta fees plus $0.005 per message or €49 per number per month for nothing we need.
- One shared platform number with a "which restaurant?" step: rejected; per-restaurant numbers keep conversations and data naturally isolated.

## Consequences

Onboarding needs a Meta developer account, a business phone number not used in consumer WhatsApp, template approval for `fraud_alert`, and a public HTTPS webhook. Development uses Meta's free test number with a local tunnel. Costs and sources: `docs/research/whatsapp-cloud-api-costs-iraq.md`.

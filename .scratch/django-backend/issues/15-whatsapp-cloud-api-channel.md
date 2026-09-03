# 15: WhatsApp Cloud API channel

**What to build:** A customer messages a Restaurant's WhatsApp number and orders through the Chat agent; the owner receives Fraud alerts; the Super admin connects numbers; a wizard guides the human Meta setup.

**Blocked by:** 10, 12

**Status:** ready-for-agent

- [ ] WhatsApp account per Restaurant (phone number id, access token, owner phone, enabled) registered in the Django admin
- [ ] Webhook: GET answers Meta's verification challenge with the verify token; POST validates the signature header, answers 200 immediately, resolves the Restaurant from the phone number id and enqueues the inbound task
- [ ] Inbound task: Conversation state, Chat agent, order creation through the order service with a deterministic Idempotency key per message id, reply through the outbound sender (Graph API, faked in tests)
- [ ] Fraud alerts use the `fraud_alert` utility template when configured and are logged otherwise
- [ ] A wizard script (produced with the wizard skill) walks a human through creating the Meta app, obtaining the test number and pointing the webhook at a local tunnel
- [ ] Tests: a signed inbound message creates an Order in the right schema; a bad signature answers 403; an unknown number answers 200 and is ignored

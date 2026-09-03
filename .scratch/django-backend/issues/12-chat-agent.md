# 12: Chat agent

**What to build:** Staff chat with the Chat agent about the menu and receive an Order proposal they can confirm; the same agent later serves WhatsApp customers.

**Blocked by:** 09, 11

**Status:** ready-for-agent

- [ ] `POST /agent/chat` accepts messages and an optional table number, builds menu context from the Restaurant's Available Menu items as data, and answers `{reply, order_proposal?}` from structured output (intent, items with quantities, reply text); cashier or admin; throttled
- [ ] Conversation state keyed by sender with a two-hour expiry is used when a conversation id is supplied
- [ ] Menu text is never interpolated into instructions; proposal prices come from the menu; an Order proposal becomes an Order only through the quantity-based order route
- [ ] Tests with the fake Provider, including a Menu item whose name contains injected instructions

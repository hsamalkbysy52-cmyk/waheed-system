# 12: Chat agent

**What to build:** Staff chat with the Chat agent about the menu and receive an Order proposal they can confirm; the same agent later serves WhatsApp customers.

**Blocked by:** 09, 11

**Status:** implemented (2026-09-04), fast track without a separate code review

- [x] `POST /agent/chat` accepts messages and an optional table number, builds menu context from the Restaurant's Available Menu items as data, and answers `{reply, order_proposal?}` from structured output (intent, items with quantities, reply text); cashier or admin; throttled
- [x] Conversation state keyed by sender with a two-hour expiry is used when a conversation id is supplied
- [x] Menu text is never interpolated into instructions; proposal prices come from the menu; an Order proposal becomes an Order only through the quantity-based order route
- [x] Tests with the fake Provider, including a Menu item whose name contains injected instructions

## Comments

- 2026-09-04 — implemented. `ai/agents/chat_agent.py`: the system prompt names the Restaurant and
  the rules only; the Available menu (items and Variants, price, category, description,
  `out_of_stock`) travels as JSON in a separate user turn that starts with `MENU_DATA`, so a Menu
  item named with instructions is data (asserted). The model answers the JSON schema
  `{intent: chat|order, reply, items: [{name, quantity}]}`; a proposal keeps only names on the menu
  that are not Out of stock, at menu prices, as `{table, items: [{name, quantity, price}], total}`
  — the shape `components/ChatBot.tsx` already renders and confirms through `POST /orders`. A
  reply that is not JSON is treated as plain chat. `ai.models.ConversationState` (key, table,
  last 20 turns, two-hour expiry) is used when `conversation_id` is supplied; the web key is
  `web:<user id>:<conversation_id>` so two users never share a thread, and ticket 15 keys WhatsApp
  threads by phone number. `POST /agent/chat` (`ai/views.py::chat`) takes `{messages: [{role,
  content}], table_number?, conversation_id?, provider?}`, is for Cashiers and Admins, shares the
  agent throttle and answers `{reply, order_proposal, provider, model}` (`order_proposal` is
  null when there is nothing to confirm) or 503 busy; Provider selection and fallback are
  `ai.services.Assistant` with purpose `chat`.
- 2026-09-04 — tests: 517 → 534 (`tests/test_chat_agent.py` 17): replies, proposals at menu
  prices, dropped unknown/out-of-stock/off-sale items, plain-text fallback, structured-output
  request, the injected menu name staying out of the prompt, conversation memory, table
  stickiness, expiry, per-user privacy, guards, busy and fallback.
- 2026-09-04 — **for ticket 14**: the frontend should send `{messages, table_number,
  conversation_id}` with the staff token and read `reply` and `order_proposal`; the `__ORDER__`
  sentinel parsing and `menuText` go away.


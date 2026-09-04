# 11: AI providers and the Report agent

**What to build:** Admins ask the Report agent questions in Arabic and get answers grounded in their own Restaurant's data, from Gemini's free tier with OpenAI as fallback, without any key passing through the browser.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] A Provider interface with three implementations: Gemini on the Interactions API of the current google-genai SDK (tool loop of at most four rounds, structured output, conversation ids), OpenAI, and a scripted fake for tests
- [ ] Provider selection: request (admin only), then the Restaurant's setting, then the default; on rate limit or server error fall back to the other Provider when its key exists, otherwise answer the Arabic busy error; every call logged per Restaurant with provider, model, purpose, tokens, latency, outcome and fallback flag
- [ ] `POST /agent/ask` reads the question from the query string or the JSON body, ignores any client key, is admin only and throttled, answers within 20 seconds with `{answer, provider, model}`; tools: sales summary by period in the Restaurant's timezone, top items, Low stock, cancellations, order status counts; revenue counts Paid, non-cancelled Orders
- [ ] Tests with the fake Provider: a tool round trip, fallback, busy error; a live smoke test that is skipped without a Gemini key

- 2026-09-04 (from ticket 06) — the low-stock tool reads `inventory.services.low_stock_items()`
  (quantity at or below `min_quantity`), inside the Restaurant's schema.


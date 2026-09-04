# 11: AI providers and the Report agent

**What to build:** Admins ask the Report agent questions in Arabic and get answers grounded in their own Restaurant's data, from Gemini's free tier with OpenAI as fallback, without any key passing through the browser.

**Blocked by:** 08

**Status:** implemented (2026-09-04), fast track without a separate code review

- [x] A Provider interface with three implementations: Gemini on the Interactions API of the current google-genai SDK (tool loop of at most four rounds, structured output, conversation ids), OpenAI, and a scripted fake for tests
- [x] Provider selection: request (admin only), then the Restaurant's setting, then the default; on rate limit or server error fall back to the other Provider when its key exists, otherwise answer the Arabic busy error; every call logged per Restaurant with provider, model, purpose, tokens, latency, outcome and fallback flag
- [x] `POST /agent/ask` reads the question from the query string or the JSON body, ignores any client key, is admin only and throttled, answers within 20 seconds with `{answer, provider, model}`; tools: sales summary by period in the Restaurant's timezone, top items, Low stock, cancellations, order status counts; revenue counts Paid, non-cancelled Orders
- [x] Tests with the fake Provider: a tool round trip, fallback, busy error; a live smoke test that is skipped without a Gemini key

- 2026-09-04 (from ticket 06) — the low-stock tool reads `inventory.services.low_stock_items()`
  (quantity at or below `min_quantity`), inside the Restaurant's schema.

- 2026-09-04 — implemented. **App `ai`** (TENANT): `AIUsageLog` (provider, model, purpose, tokens,
  latency, outcome ok/busy/error, fallback flag). `ai/providers/base.py` is the vendor-neutral
  vocabulary (`CompletionRequest` with system, messages, tools, optional JSON schema;
  `Completion` with text or tool calls and usage; `ProviderBusy` for 429/5xx, `ProviderError` for
  the rest). Three Providers: `GeminiProvider` (google-genai `generate_content`, manual function
  calling with `parameters_json_schema`, `response_json_schema` for structured output, `ClientError`
  429 and `ServerError` → busy), `OpenAIProvider` (chat completions with tools and
  `json_schema` response format; `RateLimitError`, `InternalServerError`, `APIConnectionError` and
  5xx → busy) and `FakeProvider` (scripted per Provider name, records every request).
  **Deviation from the ticket text**: Gemini uses the classic `generate_content` path rather than
  the SDK's Interactions API, which in google-genai 2.22.0 is a separately generated, privately
  namespaced client with unstable error classes; conversation ids are therefore kept on our side
  (ticket 12's Conversation state) instead of Gemini's `previous_interaction_id`.
- 2026-09-04 — `ai.services.Assistant` chooses the Provider (request → `Restaurant.ai_provider` →
  `AI_DEFAULT_PROVIDER`, each only when its key is set), falls back once to the other available
  Provider on `ProviderBusy`, raises `AssistantBusy` otherwise, and writes one `AIUsageLog` row per
  call. `ai/agents/report_tools.py` holds the five tools (sales summary, top items, low stock,
  cancellations, order status counts) over the Restaurant's own rows with local-day periods
  (`today`, `yesterday`, `week` = last 7 days, `month` = last 30 days, `all`); revenue counts Paid,
  non-cancelled Orders. `ai/agents/report_agent.py` runs at most four tool rounds then forces an
  answer without tools. `POST /agent/ask` (`ai/views.py`) reads the question from the body or the
  query string, ignores `api_key`, accepts an optional `provider`, is Admin only, throttled per user
  (`AGENT_THROTTLE_RATE`, default 20/minute; 429 answers `طلبات كثيرة، حاول بعد قليل`) and answers
  `{answer, provider, model}` or 503 `المساعد مشغول، حاول بعد قليل`.
- 2026-09-04 — settings: `AI_DEFAULT_PROVIDER`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GEMINI_MODEL`
  (`gemini-2.5-flash`), `OPENAI_MODEL` (`gpt-4o-mini`), `AI_PROVIDER_CLASSES`; the test settings
  point both names at the fake with placeholder keys. `.env.example` documents them.
- 2026-09-04 — tests: 492 → 517 (+1 skipped live smoke test that needs `GEMINI_API_KEY`):
  `tests/test_report_agent.py` covers the route (query-string and body forms, admin only, missing
  question, provider choice and the Restaurant's setting, throttling), the tool loop (real data fed
  back, unknown tool, four-round cap), fallback and the busy error with the usage log rows, and each
  tool's arithmetic.


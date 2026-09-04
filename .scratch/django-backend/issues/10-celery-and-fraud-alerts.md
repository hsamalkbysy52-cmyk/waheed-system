# 10: Celery and fraud alerts

**What to build:** Background work runs on Celery inside the right Restaurant schema, and a Fraud alert is dispatched when a Cashier trips the rule, through a messaging adapter that is faked in tests.

**Blocked by:** 08

**Status:** implemented (2026-09-04), fast track without a separate code review

- [x] A tenant-aware task wrapper takes the schema name as its first argument and runs the body inside that schema; the worker starts against Redis; tasks run eagerly in tests
- [x] An outbound messaging adapter with a recording fake for tests and a log-only implementation for now, chosen by settings
- [x] Both cancel routes enqueue the Fraud alert task when the rule trips; the alert text matches the legacy Arabic message
- [x] Tests: a task enqueued from Restaurant A writes nothing into Restaurant B (isolation item 10); the recording fake receives the alert

- 2026-09-04 (from ticket 08) — the rule lives in `orders.services.fraud_rule_tripped(cashier)`
  and both cancel routes get a `Cancellation(order, cashier, fraud_alert)` back; the dispatch
  point is `orders/views.py::_cancelled` (the `fraud_alert` text is `core.messages.FRAUD_ALERT`).
  Enqueue with `request.tenant.schema_name` as the first argument.

- 2026-09-04 — implemented. `core.tasks.tenant_task` wraps a Celery `shared_task` so the first
  positional argument is the schema name, refuses a name that is no Restaurant's
  (`UnknownSchema`) and runs the body inside `schema_context`; the worker is the existing
  `celery -A waheed worker` against Redis, tests run eagerly. **App `messaging`** (TENANT, no models
  yet) holds `messaging.senders`: an `OutboundSender` protocol, `LoggingSender` (production until
  ticket 15) and `RecordingSender` (tests), chosen by the `MESSAGING_SENDER` setting (dotted path;
  the test settings pick the recorder and `tests/conftest.py` empties it around every test).
  `orders.tasks.send_fraud_alert(schema, order_id, cashier)` builds the legacy alert
  (`core.messages.FRAUD_ALERT_MESSAGE`, with the Restaurant's own name and local time in its
  timezone) and sends it to `Restaurant.phone`, or logs a warning when no phone is known. Both
  cancel routes enqueue it from `orders/views.py::_cancelled` when the rule trips.
- 2026-09-04 — **for ticket 15**: switch the recipient from `Restaurant.phone` to the WhatsApp
  account's owner phone and swap `MESSAGING_SENDER` for the Cloud API sender (template
  `fraud_alert`); everything else stays.
- 2026-09-04 — tests: 482 → 492 (`tests/test_tasks.py` 10): the wrapper runs in the named schema,
  a task for A writes nothing into B (isolation item 10), the connection is left on public, an
  unknown schema is refused; the alert through both routes, none below the threshold, log-only
  without a phone, and per-schema counting.


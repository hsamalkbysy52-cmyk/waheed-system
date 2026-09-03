# 10: Celery and fraud alerts

**What to build:** Background work runs on Celery inside the right Restaurant schema, and a Fraud alert is dispatched when a Cashier trips the rule, through a messaging adapter that is faked in tests.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] A tenant-aware task wrapper takes the schema name as its first argument and runs the body inside that schema; the worker starts against Redis; tasks run eagerly in tests
- [ ] An outbound messaging adapter with a recording fake for tests and a log-only implementation for now, chosen by settings
- [ ] Both cancel routes enqueue the Fraud alert task when the rule trips; the alert text matches the legacy Arabic message
- [ ] Tests: a task enqueued from Restaurant A writes nothing into Restaurant B (isolation item 10); the recording fake receives the alert

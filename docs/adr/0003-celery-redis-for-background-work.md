---
status: accepted
date: 2026-09-03
---

# Background work runs on Celery with Redis, one task per tenant schema

The legacy backend ran its WhatsApp client and alerts as a daemon thread inside the web process, which dies with the worker, cannot scale past one process and knows nothing about tenants. We adopt Celery 5 with Redis as broker and cache. Every task is wrapped so its first argument is the Restaurant's `schema_name` and its body runs inside `schema_context`, making cross-tenant writes from a task impossible by construction.

## Considered options

- Threads in the web process (status quo): rejected, see above.
- Lighter queues (Huey, django-q2): workable, but Celery is the ecosystem default the team already knows and Railway hosts Redis as a plugin.

## Consequences

A second Railway service (`celery worker`) and a Redis plugin. Tests run Celery eagerly. Requests that need an immediate answer (report and chat agents) stay synchronous; only alerts, outbound messages and inbound webhooks are queued.

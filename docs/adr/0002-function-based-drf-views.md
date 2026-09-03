---
status: accepted
date: 2026-09-03
---

# Django REST Framework views are function-based only

DRF's idiomatic path is class-based `APIView`/`ViewSet` with routers. We use `@api_view` function-based views exclusively: the project owner prefers one explicit function per route, the legacy API is a flat list of 42 routes that maps one-to-one onto functions, and the exact legacy URL paths (no trailing slashes, mixed nouns) are easier to reproduce without router conventions. Serializers still do validation and output formatting; business logic lives in `services.py` modules so views stay thin.

## Consequences

No routers, no generic views, no mixins. Reuse happens through decorators (`@tenant_required`, permission decorators) and services, not inheritance.

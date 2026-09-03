---
status: accepted
date: 2026-09-03
---

# One PostgreSQL schema per Restaurant, resolved from the JWT rather than the hostname

The legacy backend isolated Restaurants with a `restaurant_id` column and hand-written filters; three tables had no column at all, unauthenticated requests fell back to Restaurant 1, and every new query was a chance to leak data. We rebuild on django-tenants with one PostgreSQL schema per Restaurant so isolation is structural: a query cannot reach another Restaurant's rows because they are not on the connection's search path. django-tenants normally picks the schema from the request hostname; our frontend is one Next.js app talking to one API host and already carries the Restaurant in the JWT, so a custom middleware resolves the schema from the token (Super admins choose one with `X-Restaurant-Id`; customer QR endpoints identify the Restaurant by Slug). Hostname routing stays possible but unused.

## Considered options

- Keep row-level `restaurant_id` filtering: rejected, it is exactly the model that leaked.
- Subdomain per Restaurant: rejected for now; needs wildcard DNS and frontend routing without buying isolation the schema does not already give.
- `django-tenant-users` for global users: rejected; it brings its own user model and per-tenant permission tables while we have three fixed roles.

## Consequences

PostgreSQL only (no SQLite). Migrations run through `migrate_schemas`. Every background task receives a `schema_name` and runs inside `schema_context`. Users live in the public schema with a Restaurant foreign key; Slug is a public field on Restaurant.

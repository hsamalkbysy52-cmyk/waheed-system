# 04: Super admin console and demo seed

**What to build:** The Super admin manages Restaurants from the existing frontend admin page and from the Django admin, suspension takes effect immediately for staff and customers, and one command seeds a demo Restaurant so every screen has data.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] `GET /admin/restaurants` and `POST /admin/restaurants/{id}/status` match the goldens and are super_admin only
- [ ] Django admin registers Restaurant (editable slug, country, currency, timezone, status), User (create staff, set password) and the domain record; only super_admin users can sign in to it
- [ ] Suspension end to end: a staff token gets 403 on its next request, a customer Slug call gets 403 with the Arabic "restaurant unavailable" message, login is refused with the legacy message
- [ ] `bootstrap_dev` is idempotent and creates the demo Restaurant (slug `waheed`), the three demo accounts with today's credentials, the six-item menu, inventory items with recipes, a Modifier group and a small Table layout
- [ ] All of the above covered by HTTP tests

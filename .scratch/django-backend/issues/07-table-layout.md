# 07: Table layout

**What to build:** Admins design and save the floor plan with Zones, Tables, walls and doors; the tables page and the order drawer read it.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Routes 36 and 37 match the goldens
- [ ] Saving replaces the whole layout atomically; an empty list clears it
- [ ] Layouts are Restaurant-scoped; HTTP tests cover save, read, clear and isolation

## Comments


- 2026-09-04 (from ticket 04) — extend `manage.py bootstrap_dev` with a small Table layout (a
  couple of Zones and three tables, as the goldens were recorded with) so the tables page and the
  QR flow have something to show on a fresh machine (plan §7). Assert it in
  `tests/test_bootstrap_dev.py`.

# 07: Table layout

**What to build:** Admins design and save the floor plan with Zones, Tables, walls and doors; the tables page and the order drawer read it.

**Blocked by:** 03

**Status:** implemented (2026-09-04), fast track without a separate code review

- [x] Routes 36 and 37 match the goldens
- [x] Saving replaces the whole layout atomically; an empty list clears it
- [x] Layouts are Restaurant-scoped; HTTP tests cover save, read, clear and isolation

## Comments


- 2026-09-04 (from ticket 04) — extend `manage.py bootstrap_dev` with a small Table layout (a
  couple of Zones and three tables, as the goldens were recorded with) so the tables page and the
  QR flow have something to show on a fresh machine (plan §7). Assert it in
  `tests/test_bootstrap_dev.py`.

- 2026-09-04 — implemented. **App `layout`** (TENANT): `TableLayoutElement` (`element_id`,
  `element_type` free string as plan §5.4 keeps it, float coordinates, nullable `table_number` and
  `capacity`, `label` = Zone name, empty for walls and doors), ordered by id so the plan comes back
  in the order the page saved it. `GET /table-layout` for any staff token, `POST /table-layout/save`
  for the Admin only; the save is one transaction that deletes and re-creates the rows, an empty
  list clears the plan, a malformed element answers 400 and leaves the old plan standing.
  `layout.services.table_numbers()` lists the Tables for later tickets. `bootstrap_dev` seeds the
  goldens' plan (three Tables in two Zones, a wall, a door), idempotently.
- 2026-09-04 — tests: 355 → 374 (`tests/test_layout.py` 17, two in `tests/test_bootstrap_dev.py`):
  both goldens, replace, clear, cashier and Slug refusals, super-admin read, isolation between two
  Restaurants.


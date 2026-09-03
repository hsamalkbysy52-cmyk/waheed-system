# 07: Table layout

**What to build:** Admins design and save the floor plan with Zones, Tables, walls and doors; the tables page and the order drawer read it.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Routes 36 and 37 match the goldens
- [ ] Saving replaces the whole layout atomically; an empty list clears it
- [ ] Layouts are Restaurant-scoped; HTTP tests cover save, read, clear and isolation

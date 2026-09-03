# 02: Capture golden responses from the legacy API

**What to build:** A recorded request/response example for every legacy route, plus a comparison helper, so that contract tests in later tickets are mechanical and the frontend's expectations are provably preserved.

**Blocked by:** 01

**Status:** implemented — awaiting review (2026-09-04; commits 6aba0df and the review-fix commit)

- [x] The legacy backend runs locally against a seeded SQLite database containing the demo Restaurant and accounts, the demo menu, a Variant, a Modifier group with options, inventory items with a recipe, a Table layout and orders in every status
- [x] One fixture per legacy route (all 42) recording method, path, relevant headers, request body, status code and response body, stored with the new backend's tests
- [x] A comparison helper asserts recursively equal keys and value types and equal Arabic `message`/`error` strings while ignoring volatile values (ids, timestamps, tokens)
- [x] A meta-test loads every fixture and validates its structure
- [x] A note lists the routes whose behaviour the spec intentionally changes (removed deduct route, real status codes, redacted customer orders, QR semantics) so their comparisons are relaxed deliberately

## Comments

- 2026-09-04 (from ticket 01): `backend_legacy/.venv` moved with the directory, so its entry-point scripts (`uvicorn`, `pip`) still carry the old `backend/.venv/bin/python3` shebang and now resolve to the new Django venv (`.venv/bin/uvicorn` fails with "No module named uvicorn"). Run the legacy API with `backend_legacy/.venv/bin/python -m uvicorn main:app --port 8001` from `backend_legacy/`, or recreate that venv from `requirements.txt`.
- 2026-09-04 — implemented. 70 fixtures under `backend/tests/goldens/legacy/` cover all 42 routes (one `success` each, plus `success:<variant>` and `failure:<slug>` cases for the Arabic messages and the 401/403 isolation responses); `backend/tests/goldens/capture_legacy.py` seeds the legacy API through its own routes and re-records them reproducibly; `backend/tests/golden.py` holds the route manifest and `assert_matches_golden`; `backend/tests/goldens/README.md` is the note on intentionally changed routes. Seeding is through the API rather than SQL, and `pending` is absent because no legacy route produces it. `/code-review` found the first comparator rejected its own fixtures (per-element comparison against the first golden element); it now compares against the merged shape of all golden elements, accepts `null` only where the golden shows it, and every fixture is checked against itself. Handoff about edited Order lines losing `modifiers` recorded in ticket 08.

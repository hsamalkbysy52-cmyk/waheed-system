# 02: Capture golden responses from the legacy API

**What to build:** A recorded request/response example for every legacy route, plus a comparison helper, so that contract tests in later tickets are mechanical and the frontend's expectations are provably preserved.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The legacy backend runs locally against a seeded SQLite database containing the demo Restaurant and accounts, the demo menu, a Variant, a Modifier group with options, inventory items with a recipe, a Table layout and orders in every status
- [ ] One fixture per legacy route (all 42) recording method, path, relevant headers, request body, status code and response body, stored with the new backend's tests
- [ ] A comparison helper asserts recursively equal keys and value types and equal Arabic `message`/`error` strings while ignoring volatile values (ids, timestamps, tokens)
- [ ] A meta-test loads every fixture and validates its structure
- [ ] A note lists the routes whose behaviour the spec intentionally changes (removed deduct route, real status codes, redacted customer orders, QR semantics) so their comparisons are relaxed deliberately

## Comments

- 2026-09-04 (from ticket 01): `backend_legacy/.venv` moved with the directory, so its entry-point scripts (`uvicorn`, `pip`) still carry the old `backend/.venv/bin/python3` shebang and now resolve to the new Django venv (`.venv/bin/uvicorn` fails with "No module named uvicorn"). Run the legacy API with `backend_legacy/.venv/bin/python -m uvicorn main:app --port 8001` from `backend_legacy/`, or recreate that venv from `requirements.txt`.

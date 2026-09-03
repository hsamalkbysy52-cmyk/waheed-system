# Legacy golden fixtures

One JSON file per recorded call against the legacy FastAPI API (`../../../backend_legacy/`), under
`legacy/`, named `NN-<method>-<path>[--<case>].json`. `NN` is the route's number in the plan's
endpoint table (§1.3) and in `tests/golden.py::LEGACY_ROUTES`. Every one of the 42 routes has a
`success` fixture; some also have `success:<variant>` fixtures (an extra shape of a passing call,
such as the cancel route's `fraud_alert`) and `failure:<slug>` fixtures for the Arabic messages the
frontend displays. Each fixture records `method`, `path` (with query string), the relevant request
`headers`, the request `body`, the `status` and the JSON `response`.

`tests/test_goldens.py` checks that every fixture is well formed and that all 42 routes are covered.

## How to use one in a contract test

```python
from tests.golden import assert_matches_golden, legacy_golden

golden = legacy_golden("POST /menu/add")
response = client.post(golden.path, golden.body, content_type="application/json", **auth)
assert response.status_code == golden.status
assert_matches_golden(response.json(), golden.response)
```

`assert_matches_golden` compares keys and value kinds recursively and compares `message`, `error`
and `detail` strings by value. Ids, totals, timestamps and tokens may differ. A value may be `null`
only where the golden shows `null` at that position in some element; where the golden shows only
`null`, anything is accepted. List elements are compared to the merged shape of all the golden's
elements. A top-level list rejects an empty actual list when the golden's has elements, so seed
data before comparing; lists inside elements (an item's modifiers) may be empty. `fraud_alert` is
user-facing text too, but it embeds the cashier's name, so it is compared by kind only; the Fraud
alert ticket asserts it with the known cashier name.

## Recording

```bash
SCRATCH=/tmp/waheed-golden && rm -f $SCRATCH.db
cd backend_legacy && DATABASE_URL="sqlite:///$SCRATCH.db" .venv/bin/python -m uvicorn main:app --port 8001
cd backend && .venv/bin/python -m tests.goldens.capture_legacy          # other terminal
```

`capture_legacy.py` needs a fresh database: it seeds through the API in dependency order and refuses
to record the same case twice. Recorded state: the demo Restaurant with its three accounts and the
six-item menu, a Variant (`برجر دبل` under `برجر`), `شاي` toggled off sale, Inventory items with a
Recipe for `برجر` (`جبن` is Low stock, `طماطم` makes `باستا` Out of stock until it is deleted at the
end), a Modifier group with two options, a Table layout with three tables in two Zones plus a wall
and a door, Orders in every reachable status (`preparing`, `ready`, `served`, `done` and paid,
`cancelled` through both routes) and a second Restaurant that is Suspended at the end. The legacy API
never produces the `pending` status, which the spec retires.

Redactions and volatility: `Authorization` headers are recorded as `Bearer <role>` and response
`token` values as `<jwt>`. Ids are deterministic for a fresh database; timestamps are not. The
`/agent/ask` fixture holds the provider's error text for an invalid key, which changes between runs.

## Routes whose behaviour the spec changes on purpose

Compare these loosely, in the way described, instead of against the fixture as recorded.

| Route(s) | Legacy behaviour in the fixture | New behaviour | How to compare |
|---|---|---|---|
| `POST /inventory/deduct/{order_id}` (35) | Deducts stock a second time | Removed (grilling Q12) | No comparison; assert the route is gone |
| Every `failure:*` fixture with status 200 and `{"error"}` | Business and validation failures answered 200 | Real codes: 400 validation, state and stock; 401 authentication; 403 forbidden or Suspended; 404 not found; body carries both `error` and `detail` | Assert the spec's status; compare the body against `{"error": g.response["error"], "detail": g.response["error"]}` |
| `failure:*` fixtures with 400/401/403/503 and `{"detail"}` | FastAPI `HTTPException` shape | Same status, body gains `error` | Compare against `{"error": g.response["detail"], "detail": g.response["detail"]}` |
| `GET /orders` (16) | Full Orders of Restaurant 1 for any caller, token or not (the fixture was recorded as a Cashier; token-less QR callers got the same body) | Slug-resolved customers get only `id`, `table_number`, `status` of Open orders; staff get the full shape | Customer tests compare against the fixture's element with the other keys removed |
| `GET /restaurant/status` (19), `POST /orders/qr-create` (20) | Hard-coded to Restaurant 1 | Need a Slug (`X-Restaurant-Slug` header or `?r=`); slug-less call is 400 (plan §3.9, item 3); Suspended Restaurant is 403 with an Arabic "restaurant unavailable" message | Success shapes and the 503 offline message are unchanged |
| `POST /orders/create` (17) without a token | Accepted for Restaurant 1 | Slug-resolved callers follow Customer-order rules (503 offline, cashier `QR`, payment method ignored); otherwise a JWT is required | Same response shape |
| `POST /login` (38), `POST /register` (39) | `{token, role, username, message}` | Adds a `refresh` token | Compare against `{**g.response, "refresh": "<jwt>"}` |
| `POST /agent/ask` (42) | `{"error": <OpenAI exception text>}` for the client-supplied key | Client key ignored; `{"answer"}` on success, Arabic "assistant is busy" `error` when the Provider is rate-limited | Compare the shape only, never the error text |
| `PUT /orders/{order_id}` (23) | Editable while `preparing` or `pending`; rewrites the lines without their `modifiers` (see order 9 in fixture 16) | Editable while `preparing` only; `pending` is retired; whether edited lines keep their Modifier options is a handoff recorded in ticket 08 | Messages unchanged |
| All routes | `X-Restaurant-Id` mismatch 403, invalid token 401, Suspended 403 (fixtures under `02-get-menu--*`, `40-get-admin-restaurants--*`) | Same codes and messages, emitted by the tenant middleware with CORS headers | Compare as recorded |

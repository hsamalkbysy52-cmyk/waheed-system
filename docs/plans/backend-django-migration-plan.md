# Waheed System — Backend Migration Plan: FastAPI → Django + django-tenants + DRF (FBV) + Gemini

**Status:** DRAFT — awaiting review. Nothing in this document has been implemented yet.
**Date:** 2026-09-03
**Scope:** `backend/` rewrite. The Next.js frontend is touched only where the API contract forces it; those tasks are listed explicitly in §5.6.

---

## 0. Summary

| Topic | Decision |
|---|---|
| Framework | Django 5.2 LTS (5.2.17) + Django REST Framework 3.18 using **function-based views** (`@api_view`) only |
| Multi-tenancy | **django-tenants 3.14** — one PostgreSQL schema per restaurant; shared `public` schema for platform data (restaurants, domains, users) |
| Tenant resolution | Custom middleware: tenant comes from the **JWT** (as today); super-admin picks a tenant via `X-Restaurant-Id`; unauthenticated QR/customer endpoints identify the restaurant by **slug** (`X-Restaurant-Slug` header or `?r=`). Hostname/subdomain routing stays possible but is not required |
| Auth | `djangorestframework-simplejwt` 5.5 with custom claims (`role`, `restaurant_id`, `username`) so the existing frontend token handling keeps working unchanged |
| Database | PostgreSQL only (django-tenants requirement). SQLite dev mode is dropped. Driver: `psycopg` 3.2 |
| AI | Provider abstraction with **two providers: OpenAI (existing) and Gemini (new)** via `google-genai` 2.22 using the GA **Interactions API**. Default model `gemini-3.8-flash`; `gemini-3.5-flash-lite` for the high-volume WhatsApp/chat bots |
| API contract | Preserved path-for-path and field-for-field, plus a short list of deliberate, security-motivated changes (§5.3) |
| Deployment | Railway with the **Railpack** builder (Nixpacks is no longer a documented builder), `gunicorn`, `preDeployCommand` running `migrate_schemas` |
| Delivery | 8 phases (§8), each with acceptance criteria. Old backend is kept as `backend_legacy/` until cutover, then deleted |

---

## 1. Current state (what we are replacing)

Source: `backend/main.py` (971 lines, single module), `backend/database/{models,auth,tenant}.py`, `backend/agents/*`. Frontend consumption audited across all 38 source files of `frontend/`.

### 1.1 Architecture today
- FastAPI + SQLAlchemy, DB URL from `DATABASE_URL` (SQLite locally, PostgreSQL on Railway).
- Schema management is hand-rolled: `create_all()` plus a list of `ALTER TABLE ... ADD COLUMN` statements swallowed in `try/except` at import time, followed by backfill/enforcement routines that `RuntimeError` on failure.
- Seeding (default restaurant, `admin`/`cashier`/`superadmin` users, menu) also runs at import time.
- Multi-tenancy is **row-level**: a `restaurant_id` column on `menu_items`, `orders`, `cancellation_logs`, `inventory_items`, `table_layout`, `users`, enforced by helper functions `tenant_query()` / `tenant_add()` and the `owned_*()` lookups. `recipe_ingredients`, `modifier_groups`, `modifier_options` have **no** `restaurant_id` and are protected only through parent joins.
- Tenant identity (`get_restaurant_id`): from JWT for normal users; `X-Restaurant-Id` header for `super_admin`; **no token → restaurant 1** ("transitional bridge"). Most endpoints are therefore effectively unauthenticated for restaurant 1.
- JWT: `python-jose`, HS256, `JWT_SECRET` env (default `waheed-secret-2024`, committed), 8-hour expiry, claims `username`, `role`, `restaurant_id`.
- Errors are mostly HTTP **200** with `{"error": "..."}`; FastAPI `HTTPException` paths return `{"detail": "..."}` with 400/401/403/503. The frontend reads **both** keys (`detail` in order/menu/inventory forms, `error` in login/register/agent).

### 1.2 Known problems the migration must fix
1. `POST /agent/ask?question=&api_key=` — the **client supplies the OpenAI API key** as a query parameter (unencoded, ends up in access logs). Keys must live server-side.
2. Default-to-restaurant-1 when no token is present — a cross-tenant hole the moment a second restaurant exists. Consequences visible today: logged-out staff pages show restaurant 1's orders; the anonymous heartbeat fired from `/login` and the customer QR page keeps restaurant 1 "online".
3. `/restaurant/status` and `/orders/qr-create` are hard-coded to restaurant 1 (documented TODOs in the code). The customer QR page does not even use `qr-create`: it posts to `/orders/create` through a Next.js proxy, bypassing the "restaurant offline" check.
4. `agents/whatsapp_agent.py` is not tenant-aware at all: it reads every restaurant's menu and creates orders with no restaurant (relies on the `server_default=1`).
5. The floating chat bot (frontend, `gpt-4o` called from the Next.js server) confirms orders by posting to `POST /orders`, **which does not exist in the backend** — the feature is silently broken today. The warm-up call to `GET /health` is likewise a 404 (harmless).
6. Migrations are ad-hoc SQL at import time; no migration history, not reproducible.
7. Prices/totals are `Float`; money should be `Decimal`.
8. `Order.items_json` is a JSON **string** column parsed manually.
9. No tests.
10. Deployment config targets Nixpacks (`nixpacks.toml`), which Railway no longer documents as a builder (Railpack is the default now).

### 1.3 Endpoint inventory (42 implemented routes + 2 called-but-missing)

Legend — **Tenant**: runs inside a restaurant schema. **Public**: runs in the public schema. **FE auth**: how the frontend actually calls it today (Bearer via `authFetch`, or none).

| # | Method | Path | FE auth | Tenant | Purpose / contract notes |
|---|---|---|---|---|---|
| 1 | GET | `/` | none | Public | Health: `{"message": "Waheed System Running!", "status": "ok"}` |
| 2 | GET | `/menu` | Bearer (staff) / **none** (QR proxy, chat bot) | Tenant | `{menu:[{id,name,price,category,is_available,description,parent_id,out_of_stock,max_qty,modifiers:[...],variants:[...]}]}` |
| 3 | POST | `/menu/add` | Bearer | Tenant | body `{name,price,category,description="",parent_id?}` → `{message,id}` (FE reads `id`) |
| 4 | PUT | `/menu/{item_id}` | Bearer | Tenant | same body → `{message}` |
| 5 | DELETE | `/menu/{item_id}` | Bearer | Tenant | deletes item + its variants |
| 6 | GET | `/menu/{item_id}/modifiers/groups` | Bearer | Tenant | `{groups:[{id,name,max_selections,options:[{id,name,price_delta,inventory_item_id,quantity_delta}]}]}` — array order = display order |
| 7 | POST | `/menu/{item_id}/modifiers/groups` | Bearer | Tenant | `{name,max_selections=1}` → `{message,id}` |
| 8 | DELETE | `/modifiers/groups/{group_id}` | Bearer | Tenant | deletes group + options |
| 9 | POST | `/modifiers/groups/{group_id}/options` | Bearer | Tenant | `{name,price_delta=0,inventory_item_id?,quantity_delta=0}` (negative `quantity_delta` = "remove ingredient") → `{message,id}` |
| 10 | DELETE | `/modifiers/options/{option_id}` | Bearer | Tenant | |
| 11 | PUT | `/modifiers/groups/{group_id}` | Bearer | Tenant | `{name,max_selections}` |
| 12 | PUT | `/modifiers/options/{option_id}` | Bearer | Tenant | `{name,price_delta}` |
| 13 | PUT | `/menu/{item_id}/modifiers/groups/reorder` | Bearer | Tenant | `{order:[group_id,...]}` fire-and-forget |
| 14 | PUT | `/modifiers/groups/{group_id}/options/reorder` | Bearer | Tenant | `{order:[option_id,...]}` |
| 15 | PUT | `/menu/{item_id}/toggle` | Bearer | Tenant | flips `is_available` → `{message,is_available}` |
| 16 | GET | `/orders` | Bearer (staff) / **none** (QR proxy) | Tenant | `{orders:[{id,table_number,total_price,status,created_at:"%Y-%m-%dT%H:%M:%SZ",items:[...],cashier,notes,payment_method}]}`; QR page reads only `table_number`+`status` |
| 17 | POST | `/orders/create` | Bearer (cashier) / **none** (QR proxy) | Tenant | `{items:[{name,price,category,modifiers:[{name,price_delta,inventory_item_id,quantity_delta}]}],table_number=1,cashier,notes,payment_method?,client_id?}`; items are **one entry per unit**; → `{message,total,order_id}` (FE needs `order_id`); idempotent on `client_id` (offline replay); 400 `detail` when stock insufficient |
| 18 | POST | `/heartbeat` | Bearer (fires on every page, incl. anonymous ones) | Tenant | `{status,last_heartbeat_at}`; empty body |
| 19 | GET | `/restaurant/status` | none | Public→Tenant | `{online,last_heartbeat_at}` (restaurant 1 only today) |
| 20 | POST | `/orders/qr-create` | none | Public→Tenant | same body as 17; 503 when restaurant offline; **unused by the frontend** (proxy exists but nothing calls it) |
| 21 | PUT | `/orders/{id}/ready` | Bearer | Tenant | status → `ready` |
| 22 | PUT | `/orders/{id}/preparing` | Bearer | Tenant | status → `preparing` |
| 23 | PUT | `/orders/{id}` | Bearer | Tenant | `{items:[{name,price,category}],table_number,notes}`; only while `preparing`/`pending`; re-balances inventory; errors via `detail`/`error` |
| 24 | DELETE | `/orders/{id}` | Bearer | Tenant | status → `cancelled`, restores inventory |
| 25 | PUT | `/orders/{id}/served` | Bearer | Tenant | |
| 26 | PUT | `/orders/{id}/pay` | Bearer | Tenant | `{payment_method:"cash"\|"card"\|"qr"}`; fired concurrently for several orders of one table |
| 27 | PUT | `/orders/{id}/done` | Bearer | Tenant | |
| 28 | POST | `/orders/{id}/cancel?cashier=` | Bearer | Tenant | logs cancellation, runs fraud rule → `{message,order_id,fraud_alert?}` |
| 29 | GET | `/inventory` | Bearer | Tenant | `{items:[{id,name,unit,quantity,min_quantity}]}` |
| 30 | POST | `/inventory/add` | Bearer | Tenant | `{name,unit="قطعة",quantity=0,min_quantity=5}` |
| 31 | PUT | `/inventory/{id}` | Bearer | Tenant | |
| 32 | DELETE | `/inventory/{id}` | Bearer | Tenant | also deletes recipe rows |
| 33 | GET | `/inventory/recipe/{menu_item_id}` | Bearer | Tenant | `{recipe:[{id,inventory_item_id,amount,inventory_name,unit}]}` |
| 34 | POST | `/inventory/recipe/{menu_item_id}` | Bearer | Tenant | `{ingredients:[{inventory_item_id,amount}]}` full replace |
| 35 | POST | `/inventory/deduct/{order_id}` | — (not called by FE) | Tenant | manual deduction → `{message,low_stock:[]}` |
| 36 | GET | `/table-layout` | Bearer | Tenant | `{elements:[{element_id,element_type,x,y,w,h,table_number,capacity,label}]}` (`label` = zone name) |
| 37 | POST | `/table-layout/save` | Bearer | Tenant | full replace; empty array clears |
| 38 | POST | `/login` | none | Public | `{email,password}` → `{token,role,username,message}` or `{error}`; FE stores `token`/`role`/`username` in localStorage |
| 39 | POST | `/register` | none | Public | `{restaurant_name,phone,email,password}` → same shape as login; creates restaurant + owner |
| 40 | GET | `/admin/restaurants` | Bearer (super_admin) | Public | `{restaurants:[{id,name,email,phone,status,created_at}]}` |
| 41 | POST | `/admin/restaurants/{id}/status` | Bearer (super_admin) | Public | `{status:"active"\|"suspended"}` → `{id,status,message}` |
| 42 | POST | `/agent/ask?question=&api_key=` | Bearer | Tenant | no body → `{answer}` or `{error}` |
| — | GET | `/health` | none | Public | **called by the frontend warm-up, missing today** |
| — | POST | `/orders` | none | Tenant | **called by the chat bot's "confirm order" (`{table_number,items:[{name,quantity,price}]}` → expects `order_id` or `id`), missing today** |

Order statuses in use: `pending`, `preparing`, `ready`, `served`, `done`, `cancelled`.

---

## 2. Target architecture

```
backend/
├── manage.py
├── pyproject.toml                 # deps + ruff + pytest config (replaces requirements.txt)
├── .env.example
├── railway.json                   # see §9
├── waheed/                        # Django project
│   ├── settings/
│   │   ├── base.py                # everything shared
│   │   ├── dev.py                 # DEBUG, local PG, permissive CORS
│   │   └── prod.py                # Railway: env-driven, security headers
│   ├── urls.py                    # single urlconf (tenant + public routes, no prefixes)
│   ├── wsgi.py
│   └── asgi.py
├── core/                          # cross-cutting, no models
│   ├── middleware.py              # JWTTenantMiddleware (§3.2)
│   ├── permissions.py             # IsSuperAdmin, IsRestaurantAdmin, IsCashierOrAdmin
│   ├── decorators.py              # @tenant_required, @public_only, @public_tenant_allowed
│   ├── exceptions.py              # DRF exception handler → {"error", "detail"} + real status codes
│   ├── responses.py               # ok()/fail() helpers preserving today's shapes
│   └── money.py                   # Decimal helpers / serializer field
├── tenants/            (SHARED)   # Restaurant(TenantMixin), Domain(DomainMixin), WhatsAppAccount
├── accounts/           (SHARED)   # User (email login, role, restaurant FK), login/register/refresh/me FBVs
├── platform_admin/     (SHARED)   # /admin/restaurants* FBVs (super_admin)
├── menu/               (TENANT)   # MenuItem, ModifierGroup, ModifierOption + FBVs
├── inventory/          (TENANT)   # InventoryItem, RecipeIngredient + FBVs + stock service
├── orders/             (TENANT)   # Order, CancellationLog + FBVs + order service (used by API, QR, bots)
├── layout/             (TENANT)   # TableLayoutElement + FBVs
├── ai/                 (TENANT)   # providers/, agents/, AIUsageLog, ConversationState, /agent/* FBVs
│   ├── providers/base.py          # LLMProvider interface
│   ├── providers/openai_provider.py
│   ├── providers/gemini_provider.py
│   ├── agents/report_agent.py     # /agent/ask
│   ├── agents/chat_agent.py       # /agent/chat (replaces the frontend gpt-4o bot, §6.5)
│   ├── agents/whatsapp_agent.py
│   ├── agents/fraud_agent.py
│   └── management/commands/run_whatsapp_bot.py
├── legacy_import/      (SHARED)   # management command import_legacy (§7)
└── tests/                         # pytest, TenantTestCase-based
```

**Why one urlconf, not `PUBLIC_SCHEMA_URLCONF`:** all traffic arrives on one hostname (`NEXT_PUBLIC_API_URL`). The middleware decides the schema per request; each view is tagged `@tenant_required` or `@public_only` so a tenant view can never accidentally run in `public` and vice-versa (§3.4).

**Rule for every view:** function-based, decorated `@api_view([...])`, validation through a DRF `Serializer`, response through `core.responses` helpers. No `APIView`/`ViewSet` classes.

---

## 3. Multi-tenancy design (the part that must be right)

### 3.1 Schema layout

| Schema | Contents |
|---|---|
| `public` | `django_tenants`, `tenants.Restaurant`, `tenants.Domain`, `tenants.WhatsAppAccount`, `accounts.User`, `contenttypes`, `auth` (permissions only), `legacy_import` bookkeeping |
| `r_<12 hex>` (one per restaurant) | `menu.*`, `inventory.*`, `orders.*`, `layout.*`, `ai.AIUsageLog`, `ai.ConversationState`, `ai.OutboundAlert` |

Settings skeleton:

```python
DATABASES = {"default": {"ENGINE": "django_tenants.postgresql_backend", **env.db()}}
DATABASE_ROUTERS = ("django_tenants.routers.TenantSyncRouter",)
TENANT_MODEL = "tenants.Restaurant"
TENANT_DOMAIN_MODEL = "tenants.Domain"
TENANT_LIMIT_SET_CALLS = True

SHARED_APPS = (
    "django_tenants", "tenants", "accounts", "platform_admin", "legacy_import",
    "django.contrib.contenttypes", "django.contrib.auth",
    "rest_framework", "corsheaders",
)
TENANT_APPS = ("menu", "inventory", "orders", "layout", "ai")
INSTALLED_APPS = list(SHARED_APPS) + [a for a in TENANT_APPS if a not in SHARED_APPS]

MIDDLEWARE = (
    "corsheaders.middleware.CorsMiddleware",      # first: must add CORS headers even to the
    "core.middleware.JWTTenantMiddleware",        # 401/403 responses the tenant middleware emits
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
)

CACHES = {"default": {..., "KEY_FUNCTION": "django_tenants.cache.make_key",
                      "REVERSE_KEY_FUNCTION": "django_tenants.cache.reverse_key"}}
```

`django.contrib.admin`/`sessions` are left out of v1 (the platform console is the frontend's `/admin` page); they can be added to `SHARED_APPS` later without migration risk.

### 3.2 Tenant resolution — `core.middleware.JWTTenantMiddleware`

django-tenants' stock `TenantMainMiddleware` resolves the tenant from the request **hostname** via the `Domain` table. Our frontend is a single app on a single API host, never sends a tenant identifier, and the restaurant identity already travels in the JWT. Subclass the stock middleware and override `process_request`:

```
1. connection.set_schema_to_public()
2. Read Authorization: Bearer <token>
   ├─ present & invalid/expired  → 401 {"error": "توكن غير صالح", "detail": "..."}
   ├─ present & role != super_admin
   │     tenant = Restaurant.objects.get(pk=claims["restaurant_id"])
   │     if X-Restaurant-Id header present and != claims → 403 (isolation violation, as today)
   │     if tenant.status == "suspended" → 403 (checked every request, as today)
   │     request.tenant_source = "jwt"
   ├─ present & role == super_admin
   │     tenant = Restaurant(pk=X-Restaurant-Id) if header else None   # None = platform scope
   │     request.tenant_source = "super_admin"
   └─ absent → tenant = resolve_slug(request)   # §3.3, may be None; request.tenant_source = "slug"
3. request.tenant = tenant
   if tenant: connection.set_tenant(tenant)   # search_path = r_xxx,public
   else:      stay on public
```

The stock class' `hostname_from_request()` / `get_tenant()` remain functional, so per-restaurant subdomains (`<slug>.<TENANT_BASE_DOMAIN>`) can be enabled later by adding a `Domain` row — no redesign needed.

**Removed on purpose:** the "no token → restaurant 1" bridge. Every tenant endpoint requires either a valid JWT or an explicit public slug (§3.3).

### 3.3 Unauthenticated tenant endpoints (customer QR flow)

The customer page (`/table/[id]`) and its Next.js proxies call `GET /menu`, `GET /orders`, `POST /orders/create` with no token; `GET /restaurant/status` and `POST /orders/qr-create` are public by design. In the new backend these resolve the restaurant from a **slug**:

- Header `X-Restaurant-Slug: <slug>` **or** query `?r=<slug>` (either accepted). `slug` is a new unique ASCII field on `Restaurant` — restaurant names are Arabic, so slugs cannot be derived from names; auto-generated as `r-<8 hex>` at registration and editable by the admin later.
- Only views decorated `@public_tenant_allowed` accept slug-resolved tenants (`GET /menu`, `GET /orders`, `POST /orders/create`, `POST /orders/qr-create`, `GET /restaurant/status`). Every other tenant view rejects `tenant_source == "slug"` with 401, so `POST /menu/add?r=slug` is impossible.
- **Slug-resolved calls are treated as customer calls:**
  - `GET /orders` returns a **redacted projection** — only `{id, table_number, status}` of non-final orders (the customer page reads exactly `table_number` + `status`). Today anonymous callers get every order with items, totals, cashier names and notes.
  - `POST /orders/create` gets **QR semantics**: 503 while the restaurant is offline (heartbeat older than 90 s), `cashier` forced to `"QR"`, `payment_method` ignored. This restores the offline gate the customer page currently bypasses. `/orders/qr-create` stays as an alias.
- **Transitional switch:** env `PUBLIC_DEFAULT_TENANT_SLUG`. When set, a slug-less request to a `@public_tenant_allowed` endpoint resolves to that restaurant. Set it to the current single restaurant at cutover so the existing QR pages keep working; remove it in Phase 8 once the frontend embeds the slug in QR URLs (§5.6, F1).

### 3.4 View-level guards

- `@tenant_required` — 400 if `request.tenant is None` (super_admin without `X-Restaurant-Id`, or public call).
- `@public_only` — 400 if a tenant is set (defensive; `/login`, `/register`, `/admin/*`).
- `@public_tenant_allowed` — marks the five customer endpoints above; everything else refuses slug tenants.
- DRF permissions: `IsAuthenticated` default; `IsSuperAdmin` for `/admin/*`; `IsRestaurantAdmin` for menu/inventory/layout **mutations** and `/agent/ask`; cashier or admin for orders & heartbeat. (Today nothing is role-checked; see §5.3 for the compatibility switch.)

### 3.5 Users & roles

- Custom `accounts.User(AbstractBaseUser, PermissionsMixin)` in **public**: `email` (USERNAME_FIELD, unique), `username` (display; unique per restaurant via `UniqueConstraint(restaurant, username)`), `role ∈ {super_admin, admin, cashier}`, `restaurant` FK (null **only** for `super_admin`, enforced by a `CheckConstraint`), `is_active`.
- Passwords: existing hashes are bcrypt (`passlib`). Add `BCryptSHA256PasswordHasher` + `BCryptPasswordHasher` to `PASSWORD_HASHERS` and store legacy hashes as `bcrypt$<hash>` during import so users keep their passwords; Django re-hashes on next login.
- Tokens are issued with `RefreshToken.for_user(user)` plus manual claims `role`, `restaurant_id`, `username` (keeps the exact claim names the legacy token had). `JWTAuthentication` resolves the user from `public.accounts_user`, which is always on the search path.
- `django-tenant-users` was evaluated (global users + per-tenant permission tables). **Not adopted**: it brings its own user model and permission mixins, while our authorization is three fixed roles. Revisit only if one user must belong to several restaurants.

### 3.6 Registration = tenant provisioning (`POST /register`)

Inside `transaction.atomic()`:
1. Validate (name non-empty, email regex, password ≥ 6, email unused) — same rules and Arabic messages as today.
2. `Restaurant.objects.create(schema_name=f"r_{uuid4().hex[:12]}", slug=..., name, phone, email, status="active")` → `auto_create_schema=True` creates the schema and runs tenant migrations synchronously (a few seconds; acceptable; if it becomes slow, switch on `TENANT_CREATION_FAKES_MIGRATIONS` with a `TENANT_BASE_SCHEMA` template).
3. `Domain.objects.create(domain=f"{slug}.{TENANT_BASE_DOMAIN}", tenant=..., is_primary=True)` — required by django-tenants; unused for routing until subdomains are enabled.
4. Create owner `User(role="admin", restaurant=...)`.
5. Issue tokens; return `{token, refresh, role, username, message}`.

### 3.7 Data model changes (per tenant schema)

| Legacy | New | Notes |
|---|---|---|
| `menu_items.restaurant_id` etc. | *(dropped)* | isolation is the schema itself |
| `menu_items.parent_id` (int) | `MenuItem.parent = FK("self", null=True, on_delete=CASCADE)` | variants cascade like today |
| `modifier_groups.menu_item_id` | FK `menu_item` CASCADE | `sort_order` kept |
| `modifier_options.group_id` / `inventory_item_id` | FKs (`inventory_item` `SET_NULL`) | |
| `recipe_ingredients` | `RecipeIngredient(menu_item FK CASCADE, inventory_item FK CASCADE, amount Decimal)` + `UniqueConstraint(menu_item, inventory_item)` | today's `/inventory/{id}` delete cascade becomes DB-level |
| `orders.items_json` (text) | `Order.items = JSONField(default=list)` | same serialized shape `items: [...]` |
| `orders.total_price` Float | `DecimalField(12,2)`; serialized as a JSON **number** (`coerce_to_string=False`) | contract unchanged |
| `orders.client_id` unique per restaurant | `UniqueConstraint(client_id)` (schema-local) | |
| `orders.status` | `CharField(choices=Status)` | choices = today's six values |
| `restaurants.last_heartbeat_at` | stays on `Restaurant` (public) | `/heartbeat` writes the public row of `request.tenant` |
| `cancellation_logs.cancelled_at` (`datetime.now`, naive local) | `DateTimeField(auto_now_add)` with `USE_TZ=True` (UTC) | fraud window uses UTC consistently |
| all timestamps | serialized as ISO-8601 **with `Z`** | frontend already appends `Z` when missing, so this is compatible |

### 3.8 Concurrency & integrity

- Order creation: `transaction.atomic()` + `InventoryItem.objects.select_for_update().filter(pk__in=...)` (same idea as today's `with_for_update()`), single pass check-then-deduct, 400 `{"error": "مخزون غير كافٍ: ...", "detail": same}` on shortage. Idempotency on `client_id` inside the same transaction (`select_for_update` on the order row / unique-violation fallback) so offline replays never double-post.
- `PUT /orders/{id}/pay` is a plain idempotent row update; safe under the frontend's parallel calls.
- `search_path` is set per request; `TENANT_LIMIT_SET_CALLS=True` avoids re-setting it per query.
- Background work (WhatsApp bot, fraud alert) always runs under `tenant_context(restaurant)`; helper `run_in_tenant(restaurant, fn)`.

### 3.9 Isolation test matrix (must pass before cutover)

1. User of restaurant A with A's token: full CRUD on A. 200s.
2. Same token + `X-Restaurant-Id: B` → 403; no B data touched.
3. Forged/expired token → 401 on every tenant endpoint; slug-less QR call without `PUBLIC_DEFAULT_TENANT_SLUG` → 400.
4. `GET /menu?r=B` → B's menu only; `GET /orders?r=B` → redacted rows only; `POST /menu/add?r=B` → 401.
5. super_admin without header → `/admin/*` OK, `/menu` → 400; with `X-Restaurant-Id: B` → B data.
6. Suspended restaurant: login → `{"error": "هذا المطعم موقوف حالياً"}`; existing token → 403.
7. IDs from tenant A used in tenant B's requests (`PUT /orders/{A_id}`) → 404 (schema-local lookups make this structural, but keep the test).
8. `migrate_schemas` on a fresh DB + provisioning a tenant works from zero.
9. A 401/403 emitted by the middleware carries CORS headers (browser sees the status, not an opaque network error).

---

## 4. Django REST Framework conventions (function-based views)

```python
# menu/views.py
@api_view(["GET"])
@permission_classes([AllowAny])           # customer QR menu is public via slug
@public_tenant_allowed
@tenant_required
def menu_list(request):
    items = MenuItem.objects.select_related("parent").prefetch_related(
        "modifier_groups__options", "recipe__inventory_item")
    return ok({"menu": serialize_menu(items)})

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsRestaurantAdmin])
@tenant_required
def menu_add(request):
    s = MenuItemPayloadSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    item = MenuItem.objects.create(**s.validated_data)
    return ok({"message": f"تم إضافة {item.name}", "id": item.id}, status=201)
```

- **Serializers** validate input and format output (`created_at` as `%Y-%m-%dT%H:%M:%SZ`, decimals as numbers). Output dicts are built explicitly to guarantee the exact legacy shapes (`is_available`, `inventory_name`, `element_id`, ...).
- **Exception handler** (`core.exceptions.handler`) always emits **both keys** — `{"error": "<message>", "detail": "<message>"}` — because the frontend reads `detail` in order/menu/inventory forms and `error` in login/register/agent. `ValidationError` → 400 (+ `errors: {...}` field map); `NotAuthenticated` → 401; `PermissionDenied` → 403; `Http404` → 404; offline QR → 503. Status classes matter: the frontend's offline sync engine treats **4xx as permanent** failure and **5xx/network as retryable**, so validation/stock problems must be 4xx and infrastructure problems 5xx.
- **N+1 avoidance:** today `GET /menu` does 3–4 queries per item (modifiers, stock, max_qty). New implementation prefetches groups/options/recipes once and computes `out_of_stock`/`max_qty` in Python.
- **Throttling:** `AnonRateThrottle` on `/login`, `/register` and the slug-resolved customer endpoints; `UserRateThrottle` on `/agent/*`.
- **URLs:** identical paths to §1.3, defined in each app's `urls.py`, included from `waheed/urls.py` without prefixes. `APPEND_SLASH=False`; routes registered exactly as today (no trailing slash).
- **Renderers:** `JSONRenderer` only; `DEFAULT_AUTHENTICATION_CLASSES = [JWTAuthentication]`.

---

## 5. API contract & frontend compatibility

### 5.1 Preserved as-is
All 42 routes, their paths, request bodies and success response bodies, including Arabic `message` strings; `token`/`role`/`username` in the login response; `order_id` in the create response; `client_id` idempotency; `?cashier=` on cancel.

### 5.2 Additive (safe) changes
- `/login` and `/register` also return `refresh`. New `POST /auth/refresh` (`{refresh}` → `{token, refresh}`). Access token lifetime stays **8 hours** (the frontend has no refresh logic today); refresh lifetime 30 days.
- New `GET /health` (the frontend warm-up already calls it), `GET /me` (`{username, role, restaurant_id, restaurant: {name, slug}}`).
- New `POST /orders` — the quantity-based body the chat bot already sends (`{table_number, items:[{name, quantity, price?}]}`), expanded server-side into the same order service; returns `{message, total, order_id, id}`. Prices are taken from the **tenant's menu**, never from the request (the bot currently trusts LLM-supplied prices). Requires a JWT (see §5.6 F3).
- New `POST /agent/chat` — backend home for the floating chat bot (§6.5).
- Error bodies carry both `error` and `detail` plus a real HTTP status code.

### 5.3 Deliberate breaking changes (security) — need your sign-off
| Change | Why | Frontend impact |
|---|---|---|
| Tenant endpoints require a JWT, except the five customer endpoints which require a slug | closes the restaurant-1 bridge | staff pages already send Bearer everywhere; customer/QR proxies need the slug (F1); chat bot order needs auth (F3) |
| Anonymous `GET /orders` is redacted to `{id, table_number, status}` of open orders | stop leaking every order to anyone who scans a QR | customer page reads only those two fields → none |
| Anonymous `POST /orders/create` gets QR semantics (503 when offline, cashier `"QR"`) | restores the offline gate | customer page already handles non-OK responses |
| Errors use real status codes (400/401/403/404/503) with the same `{error, detail}` body | correctness; sync-engine semantics | code that only inspects `data.error`/`data.detail` keeps working; code that checks `res.ok` first will now show these as errors (desired) |
| `/agent/ask` ignores `api_key` and reads `question` from query **or** JSON body; key comes from the server | stop leaking provider keys through the browser and access logs | works immediately; the key input should be removed from the dashboard (F2) |
| Role checks: menu/inventory/layout mutations and `/agent/*` → `admin`; orders/heartbeat → `cashier` or `admin` | least privilege | cashier UI must not call admin mutations (to verify during Phase 6 with the switch below) |

Compatibility switch for a soft launch: `ENFORCE_ROLE_PERMISSIONS=false` degrades role checks to "any authenticated user of this restaurant" during Phase 7, then flips to `true`.

### 5.4 Things we will *not* change (frontend tolerates them)
- `is_available` field name (frontend normalizes `available ?? is_available`).
- `created_at` format (frontend appends `Z` if missing; we emit `Z`).
- `inventory_name` in recipes, `label` as zone name in layout, `element_type` strings.

### 5.5 Frontend call inventory (from the audit)
- **Base URL** `NEXT_PUBLIC_API_URL` (fallback = production Railway URL) is duplicated in 10 files; `lib/apiFetch.ts` `authFetch()` adds `Authorization: Bearer <localStorage.token>`.
- **Auth state**: `token`, `role`, `username` in localStorage; no refresh, no expiry check, no 401 handling anywhere (expired token = silently empty pages); logout = `localStorage.clear()`.
- **Tenant identity**: never sent by the frontend in any form. QR URL is `${site}/table/<n>`.
- **Anonymous calls**: Next.js proxies `app/api/menu`, `app/api/orders`, `app/api/orders/create` (customer page), `app/api/orders/qr-create` (dead), `app/api/warmup` (→ `/health`); chat bot `GET /menu` (store) and `POST /orders` (direct, non-existent); heartbeat fires on every page including `/login` and `/table/[id]`.
- **Polling**: `GET /orders` every 10/15/20/30 s from four pages; heartbeat every 60 s. No WebSocket/SSE.
- **Offline**: IndexedDB queue replayed to `POST /orders/create` with `client_id`; 4xx = permanent failure, 5xx = retry.
- **Frontend-side AI**: `app/api/chat/route.ts` calls OpenAI `gpt-4o` from the Next.js server (accepts a `NEXT_PUBLIC_OPENAI_API_KEY` fallback that can leak into the bundle), interpolates menu names into the system prompt (prompt-injection surface), uses an `__ORDER__{...}__END__` sentinel; `app/api/debug` exposes partial key previews publicly.

### 5.6 Frontend tasks forced or strongly recommended by this migration (~1–1.5 days, separate PR)
**Forced (F)**
- **F1** QR URL carries the slug (`/table/<n>?r=<slug>`); proxies `app/api/menu`, `app/api/orders`, `app/api/orders/create` forward `X-Restaurant-Slug`. Until merged, `PUBLIC_DEFAULT_TENANT_SLUG` keeps the single existing restaurant working.
- **F2** Dashboard: remove the API-key input; send `question` in the JSON body.
- **F3** Chat bot "confirm order": call `POST /orders` via `authFetch` (it is already only shown to logged-in staff). Without this the feature stays broken as it is today.

**Recommended (R)**
- **R1** `authFetch`: on 401 → clear storage and redirect to `/login`.
- **R2** `useHeartbeat`: only fire when a token exists (no 401 noise on `/login` and the customer page).
- **R3** Sync engine: treat 401 as "retry after login", not permanent `SyncFailed`.
- **R4** Delete `app/api/debug`, the `NEXT_PUBLIC_OPENAI_API_KEY` fallback, and dead code (`app/api/orders/qr-create`, `PUT /api/chat`, `lib/store.fetchOrders`).
- **R5** Switch the floating chat bot to backend `POST /agent/chat` (§6.5) and drop the `openai` npm dependency.
- **R6** Import the base URL from `lib/apiFetch.ts` everywhere instead of 10 copies.

---

## 6. AI layer — OpenAI + Gemini

### 6.1 Facts verified against current docs (2026-09-03)
- SDK: `google-genai` **2.22.0** (`pip install -U google-genai`). Env var: **`GEMINI_API_KEY`**; `genai.Client()` picks it up automatically.
- The **Interactions API** (`client.interactions.create(...)`) is **GA since June 2026** and is the recommended surface for new projects; `client.models.generate_content(...)` remains fully supported but is described as legacy. Interactions requires `google-genai >= 2.3.0`.
- Interactions request fields we will use: `model`, `input` (string or list of content blocks), `system_instruction`, `tools` (function declarations `{"type": "function", "name", "description", "parameters"}`), `response_format` (`{"type": "text", "mime_type": "application/json", "schema": <JSON schema>}`), `previous_interaction_id` (server-side conversation state), `generation_config` (incl. `thinking_level`), `safety_settings`, `store`. Response: `interaction.id`, `interaction.output_text`, `interaction.steps` (step types incl. `user_input`, `model_output`, `function_call` with `.name`, `.arguments`, `.id`), `interaction.outputs`. Function results go back as an input block `{"type": "function_result", "name", "call_id", "result": [{"type": "text", "text": ...}]}` together with `previous_interaction_id`.
- Models (stable, text; list prices per 1M tokens as published today): `gemini-3.8-flash` ("most intelligent Flash", $0.75 in / $3.75 out), `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash` ($1.50/$9.00), `gemini-3.5-flash-lite` ($0.30/$2.50), `gemini-3.1-flash-lite`; the 2.5 family (`gemini-2.5-flash`, `-flash-lite`, `-pro`) is still listed. `gemini-2.0-flash*` are shut down. `gemini-3.1-pro-preview` is preview only.
- Free tier exists for the 3.x Flash models but **content may be used to improve Google products**; the paid tier does not. Restaurant sales data → use a paid-tier key in production.
- Errors: `google.genai.errors.APIError` (`.code`, `.message`); built-in retries configurable via `types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=..., ...))`.

### 6.2 Provider abstraction (`ai/providers/`)

```python
class LLMProvider(Protocol):
    name: str
    def complete(self, *, system: str, user: str, tools: list[ToolSpec] | None = None,
                 response_schema: type[BaseModel] | None = None,
                 conversation_id: str | None = None, model: str | None = None) -> LLMResult: ...
    # LLMResult: text, parsed (pydantic instance | None), tool_calls[], conversation_id, usage{input,output}
```

- `gemini_provider.py`: Interactions API; tool-calling loop (max 4 rounds) executes server-side Python callables and feeds `function_result` blocks back with `previous_interaction_id`; `response_schema` → `response_format` JSON schema from `Model.model_json_schema()`, parsed with the same Pydantic model; `store=True` only when a `conversation_id` is requested (bots), else `store=False`.
- `openai_provider.py`: today's `gpt-4o-mini` behaviour wrapped in the same interface (tools via chat-completions tool calls, JSON via `response_format`).
- Selection order: request body `provider` (admin only) → `Restaurant.ai_provider` (public column, default `null`) → `AI_DEFAULT_PROVIDER` env (`gemini`). Models per use-case from settings:
  ```python
  AI_MODELS = {"gemini": {"report": "gemini-3.8-flash", "chat": "gemini-3.5-flash-lite"},
               "openai": {"report": "gpt-4o-mini", "chat": "gpt-4o-mini"}}
  ```
- Every call writes `ai.AIUsageLog(provider, model, purpose, input_tokens, output_tokens, latency_ms, ok)` in the tenant schema (from `usage_metadata`) — per-restaurant cost visibility.
- Prompt-injection hygiene shared by all agents: menu names/descriptions are passed as **structured tool results or JSON data**, never interpolated into the system prompt; orders are only ever created from the **parsed structured output**, never from free text.

### 6.3 Report agent (`POST /agent/ask`)
Replaces "dump today's stats into the prompt" with **tools** the model can call, all executed under `request.tenant`:
`get_sales_summary(period: today|week|month)`, `get_top_items(limit)`, `get_low_stock()`, `get_cancellations(period)`, `get_order_status_counts()`. System prompt stays Arabic, concise. Falls back to the single-shot stats prompt if a provider returns no tool support. Admin-only, throttled, 20 s timeout; response `{answer, provider, model}` (`answer` unchanged for the frontend). Accepts `question` from query string (today's frontend) or JSON body.

### 6.4 WhatsApp agent
- Runs **outside** the web workers: `python manage.py run_whatsapp_bot` (one neonize session per enabled `WhatsAppAccount`), deployed as a separate Railway worker service with a volume for `WA_SESSION_PATH`. `tenants.WhatsAppAccount(restaurant, owner_phone, session_path, enabled)` in public replaces the global `OWNER_PHONE`/`WA_SESSION_PATH` env vars.
- Message handling runs in `tenant_context(account.restaurant)`. Replaces the fragile `ORDER:برجر,كولا` text protocol with **structured output**:
  ```python
  class BotReply(BaseModel):
      intent: Literal["menu", "order", "other"]
      items: list[OrderedItem]            # {name: str, qty: int}
      reply_text: str
  ```
  Items are matched against the tenant's `MenuItem` names; orders are created through the same `orders.services.create_order()` used by the API (stock deduction and `client_id` idempotency apply).
- Multi-turn: `ConversationState(sender_key, provider_conversation_id, updated_at)` in the tenant schema, expiring after 2 hours; Gemini continues via `previous_interaction_id`.
- Model: `gemini-3.5-flash-lite` with the lowest `thinking_level` for latency/cost (exact enum verified against SDK types during implementation).

### 6.5 Chat agent (`POST /agent/chat`) — new backend home for the floating bot
- Body `{messages:[{role, content}], table_number?}`; menu context comes from the **tenant DB** (available items only), not from the client. Response `{reply, order_proposal?: {table_number, items:[{name, quantity, price}]}}` produced via structured output — no `__ORDER__` sentinel parsing. Confirming the proposal is a normal `POST /orders` call with the staff JWT.
- Same provider abstraction and `chat` model tier as the WhatsApp bot; `UserRateThrottle`; cashier or admin.
- Makes the Next.js server key-free (F2/R4/R5 in §5.6).

### 6.6 Fraud agent
Rule-based (no LLM): unchanged threshold (≥ 3 cancellations by the same cashier within 60 minutes), tenant-scoped `CancellationLog`, alert via the restaurant's `WhatsAppAccount.owner_phone` through the bot process (queue = a small `OutboundAlert` table polled by the worker) instead of an in-process global client.

### 6.7 Tests for the AI layer
Provider interface contract tests with fake providers; Gemini adapter tests against recorded fixtures (no network in CI); one opt-in live smoke test guarded by `GEMINI_API_KEY`.

---

## 7. Legacy data migration (`manage.py import_legacy`)

Source: the current production PostgreSQL (`LEGACY_DATABASE_URL`) or the local SQLite file. Read with plain `psycopg`/`sqlite3`; write through the ORM.

1. **Public:** for each legacy `restaurants` row → `Restaurant(legacy_id, name, phone, email, status, created_at, last_heartbeat_at, slug=auto, schema_name=auto)`; `Domain`; users with `restaurant_id` → `User` (bcrypt hashes preserved, §3.5); `super_admin` users → `restaurant=None`. Placeholder emails (`*.local.placeholder`) are kept so the three default accounts keep working.
2. **Per tenant** (in `tenant_context`): copy `menu_items` (keep PKs; `parent_id` → FK), `modifier_groups`, `modifier_options`, `inventory_items`, `recipe_ingredients`, `orders` (`items_json` → `items`, `created_at` treated as UTC), `cancellation_logs`, `table_layout`. Insert with explicit PKs, then `sqlsequencereset` per schema so new rows continue after the max id. Only rows whose parent chain resolves to the same legacy `restaurant_id` are copied; orphans are reported, not silently dropped.
3. `--dry-run` prints per-table counts; `--reset` truncates a tenant schema for reruns; final report compares source vs target counts per restaurant.
4. Rehearse against a **dump** of production twice before cutover.

---

## 8. Phased delivery

| Phase | Deliverables | Acceptance criteria | Est. |
|---|---|---|---|
| **0 — Prep** | `brew services start postgresql@15`, `createdb waheed`; `pyenv install 3.13.14`; `git mv backend backend_legacy`; new `backend/` Django scaffold; `pyproject.toml` with pinned deps (§10); `.env.example`; `ruff` + `pytest-django`; root `.gitignore` (done: `.venv/`, `frontend/.next/`, ...) | `manage.py check` passes; `migrate_schemas --shared` on an empty DB succeeds; `pytest` runs | 0.5 d |
| **1 — Tenancy core** | `tenants`, `accounts`, `core` (middleware, permissions, decorators, exception handler), Simple JWT with legacy claim names, `/`, `/health`, `/login`, `/register`, `/auth/refresh`, `/me`, `/admin/restaurants*` | Isolation matrix §3.9 items 1–3, 5, 6, 8, 9 green; token from `/login` accepted by the current frontend (`token`, `role`, `username`) | 2 d |
| **2 — Domain apps** | `menu` (+ modifiers), `inventory` (+ recipes, stock service), `orders` (create/edit/cancel/status transitions, idempotency, `select_for_update`, quantity-based `POST /orders`), `layout`, `/heartbeat`, `/restaurant/status`, slug-resolved customer endpoints with redaction/QR semantics + `PUBLIC_DEFAULT_TENANT_SLUG` | Every route in §1.3 returns the documented shape; contract tests compare JSON against golden files captured from the legacy API; §3.9 item 4; `/menu` ≤ 5 queries | 3 d |
| **3 — AI** | provider abstraction, OpenAI + Gemini providers, `/agent/ask` with tools, `/agent/chat`, `AIUsageLog`, fraud agent, WhatsApp worker with structured output, `WhatsAppAccount` | fake-provider tests green; live smoke test with `GEMINI_API_KEY` answers an Arabic sales question using ≥ 1 tool call; WhatsApp bot creates a tenant-scoped order in a manual test | 2.5 d |
| **4 — Data import** | `import_legacy` command, rehearsal against a production dump, count report | two consecutive rehearsals with zero orphans/mismatches; sample logins work with legacy passwords | 1 d |
| **5 — Deployment** | `railway.json` (Railpack, `gunicorn`, `preDeployCommand: migrate_schemas`), health check `/health`, env vars (§11), worker service for the bot; `frontend/.env.local` unchanged | staging Railway service passes the isolation matrix and contract tests against the deployed URL | 1 d |
| **6 — Frontend compatibility PR** | §5.6 F1–F3 (+ R1–R6 as agreed) | customer QR flow works with a slug; dashboard has no key input; chat-bot order confirm works | 1–1.5 d |
| **7 — Cutover** | maintenance window → final `import_legacy` → point the production domain at the new service → smoke test → keep legacy service stopped but deployable for 7 days (rollback) | frontend works end-to-end (login, orders, kanban, inventory, layout, reports) with `ENFORCE_ROLE_PERMISSIONS=false` and `PUBLIC_DEFAULT_TENANT_SLUG` set | 0.5 d |
| **8 — Cleanup** | delete `backend_legacy/`, `nixpacks.toml`, `Procfile`; flip `ENFORCE_ROLE_PERMISSIONS=true`; unset `PUBLIC_DEFAULT_TENANT_SLUG` after F1 is live; update `CLAUDE.md`, write `backend/README.md` | no references to legacy code; all switches removed | 0.5 d |

Total ≈ **12–12.5 working days**. Phases 0–5 live on branch `feat/django-backend`; nothing touches production until Phase 7.

---

## 9. Local development & deployment

**Local**
```bash
brew services start postgresql@15 && createdb waheed
pyenv install 3.13.14 && pyenv local 3.13.14
python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
cp .env.example .env            # DATABASE_URL=postgres://localhost/waheed, GEMINI_API_KEY=..., OPENAI_API_KEY=...
python manage.py migrate_schemas --shared
python manage.py bootstrap_dev  # restaurant "Waheed Restaurant" + admin/cashier/superadmin (same creds as today) + demo menu
python manage.py runserver 8000
```
Tests: `pytest` (needs PostgreSQL; uses django-tenants `FastTenantTestCase` + `TenantClient`).

**Railway**
- Builder: **Railpack** (default; Nixpacks is not a documented builder any more). Root directory of the service: `backend/`.
- `railway.json`:
  ```json
  {"$schema": "https://railway.com/railway.schema.json",
   "build": {"builder": "RAILPACK"},
   "deploy": {"preDeployCommand": ["python manage.py migrate_schemas --executor multiprocessing"],
              "startCommand": "gunicorn waheed.wsgi:application --bind 0.0.0.0:$PORT --workers 3 --timeout 60",
              "healthcheckPath": "/health", "healthcheckTimeout": 300,
              "restartPolicyType": "ON_FAILURE", "restartPolicyMaxRetries": 10}}
  ```
- Second service (worker): same repo, start command `python manage.py run_whatsapp_bot`, volume mounted at `/data`.
- Migrations never run at import time again; only via `preDeployCommand`.

---

## 10. Dependencies (pinned, verified on PyPI 2026-09-03)

| Package | Version | Note |
|---|---|---|
| Django | 5.2.17 (LTS, supported to Apr 2028) | Django 6.x needs Python ≥ 3.12 and is not yet in Simple JWT's tested matrix — stay on 5.2 |
| django-tenants | 3.14.0 | requires `Django >=5.2,<6.2` |
| djangorestframework | 3.18.0 | |
| djangorestframework-simplejwt | 5.5.1 | uses PyJWT |
| psycopg[binary] | ≥3.2.1,<3.3 | range django-tenants tests against |
| django-cors-headers | 4.9.0 | |
| django-environ | 0.14.0 | `DATABASE_URL` parsing (Railway gives `postgres://`; handled) |
| google-genai | 2.22.0 | Interactions API needs ≥ 2.3.0 |
| openai | keep current major | existing provider |
| neonize | 0.4.3.post0 | WhatsApp worker only |
| gunicorn | 26.2.0 | |
| bcrypt | ≥4 | legacy password hashes |
| dev: pytest, pytest-django, ruff, factory-boy | latest | |

Python: **3.13.14** via pyenv (3.10.20 also works with Django 5.2 if you prefer to keep the current venv).

Removed: fastapi, uvicorn, sqlalchemy, psycopg2-binary, passlib, python-jose, python-multipart.

---

## 11. Environment variables

| Var | Purpose |
|---|---|
| `DJANGO_SETTINGS_MODULE` | `waheed.settings.dev` / `waheed.settings.prod` |
| `SECRET_KEY` | Django secret (also Simple JWT signing key). **Rotates the JWT secret** → all users re-login at cutover (intentional; the legacy default secret is committed in the repo) |
| `DATABASE_URL` | PostgreSQL (Railway-provided) |
| `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` | prod hardening (today CORS is `*`) |
| `TENANT_BASE_DOMAIN` | e.g. `waheed.app`; used only to create `Domain` rows |
| `PUBLIC_DEFAULT_TENANT_SLUG` | transitional QR fallback (§3.3) |
| `ENFORCE_ROLE_PERMISSIONS` | `false` during soft launch (§5.3) |
| `AI_DEFAULT_PROVIDER` | `gemini` \| `openai` |
| `GEMINI_API_KEY` | Gemini Developer API (paid tier for production) |
| `OPENAI_API_KEY` | existing provider (renamed from `OPENAI_KEY`) |
| `WA_SESSION_PATH` | worker only, default `/data/wa_sessions/` |
| `LEGACY_DATABASE_URL` | import command only |

---

## 12. Risks & open decisions (please answer before "Go")

1. **Tenant resolution:** header/JWT + slug as proposed, or real subdomains per restaurant from day one (needs wildcard DNS + frontend routing)?
2. **Breaking changes in §5.3** — approve as listed? In particular: requiring a JWT on all staff endpoints, redacting anonymous `GET /orders`, and QR semantics for anonymous `POST /orders/create`.
3. **Frontend tasks (§5.6):** F1–F3 are required; which of R1–R6 do you want in the same PR? R5 (move the chat bot to the backend) is the one that makes the frontend key-free.
4. **Token lifetime:** keep 8 h access tokens (no frontend change) vs 1 h + silent refresh (frontend change).
5. **Python:** move to 3.13 (recommended) or stay on 3.10?
6. **Gemini billing:** OK to use a paid-tier key so restaurant data is not used for model training?
7. **WhatsApp bot:** one worker process (one neonize session per restaurant) as a second Railway service — acceptable?
8. **Money:** switch to `Decimal` now (recommended, contract unchanged) or keep floats?
9. **Legacy folder:** keep `backend_legacy/` in the repo until Phase 8, or rely on git history only?
10. **Repo hygiene:** work on branch `feat/django-backend`; PRs against `main` or direct commits?

---

## 13. Out of scope
Frontend redesign, QR ordering product changes beyond the slug, FinTech phase, Kubernetes/other hosting, real-time (WebSocket) order updates.

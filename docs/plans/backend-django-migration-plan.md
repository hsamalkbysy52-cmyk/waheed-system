# Waheed System — Backend Migration Plan: FastAPI → Django + django-tenants + DRF (FBV) + Gemini + Celery

**Status:** APPROVED 2026-09-03 (decisions in §12). Refined further through `/grill-with-docs`; the resulting spec and tickets live under `.scratch/django-backend/`.
**Scope:** `backend/` rewrite plus the frontend changes needed to keep every existing feature working.

---

## 0. Summary

| Topic | Decision |
|---|---|
| Framework | Django 5.2 LTS (5.2.17) + Django REST Framework 3.18 using **function-based views** (`@api_view`) only |
| Python | **3.10.20** (pyenv, existing venv). No 3.11+ syntax |
| Multi-tenancy | **django-tenants 3.14** — one PostgreSQL schema per restaurant; shared `public` schema for platform data (restaurants, users) |
| Tenant resolution | Custom middleware: tenant from the **JWT**; super-admin picks a tenant via `X-Restaurant-Id`; customer QR endpoints identify the restaurant by **slug** (`X-Restaurant-Slug` header or `?r=`). **No subdomains** |
| Auth | `djangorestframework-simplejwt` 5.5 with custom claims (`role`, `restaurant_id`, `username`); 8 h access + 30 d refresh; frontend refreshes once then redirects to login on 401. **Django admin** is the Super admin console for now |
| Database | PostgreSQL only. Driver `psycopg` 3.2. Money as `Decimal(12,3)` (Jordanian dinar has 3 decimals); per-Restaurant `country`, `currency`, `timezone` |
| Background work | **Celery 5.6 + Redis** (one worker service). Every task is tenant-aware via `schema_name` |
| AI | Provider abstraction: **OpenAI (existing) + Gemini (new)** via `google-genai` 2.22 Interactions API, **free tier**. `gemini-3.8-flash` for reports/chat reasoning, `gemini-3.5-flash-lite` for high-volume bots |
| WhatsApp bot | **Decision pending** — cost analysis in §6.4 must be approved before any bot code is written |
| Legacy | Old data is disposable: no import, fresh DB seeded by `bootstrap_dev`. Old code stays as `backend_legacy/` (read-only) until the user removes it |
| API contract | Preserved path-for-path and field-for-field; security fixes in §5.3 are approved. Frontend changes in §5.6 are in scope |
| Deployment | Railway: web service (gunicorn), worker service (celery), Redis and PostgreSQL plugins; **Railpack** builder; `preDeployCommand` runs `migrate_schemas` |
| Git | Branch `faysal`, small commits, push immediately |

---

## 1. Current state (what we are replacing)

Source: `backend_legacy/main.py` (971 lines, single module), `database/{models,auth,tenant}.py`, `agents/*`. Frontend consumption audited across all 38 source files of `frontend/`.

### 1.1 Architecture today
- FastAPI + SQLAlchemy, DB URL from `DATABASE_URL` (SQLite locally, PostgreSQL on Railway).
- Schema management is hand-rolled: `create_all()` plus `ALTER TABLE ... ADD COLUMN` statements swallowed in `try/except` at import time, followed by backfill/enforcement routines that `RuntimeError` on failure.
- Seeding (default restaurant, `admin`/`cashier`/`superadmin` users, menu) also runs at import time.
- Multi-tenancy is **row-level**: a `restaurant_id` column on `menu_items`, `orders`, `cancellation_logs`, `inventory_items`, `table_layout`, `users`, enforced by helper functions `tenant_query()` / `tenant_add()` and the `owned_*()` lookups. `recipe_ingredients`, `modifier_groups`, `modifier_options` have **no** `restaurant_id` and are protected only through parent joins.
- Tenant identity (`get_restaurant_id`): from JWT for normal users; `X-Restaurant-Id` header for `super_admin`; **no token → restaurant 1** ("transitional bridge"). Most endpoints are therefore effectively unauthenticated for restaurant 1.
- JWT: `python-jose`, HS256, `JWT_SECRET` env (default `waheed-secret-2024`, committed), 8-hour expiry, claims `username`, `role`, `restaurant_id`.
- Errors are mostly HTTP **200** with `{"error": "..."}`; FastAPI `HTTPException` paths return `{"detail": "..."}` with 400/401/403/503. The frontend reads **both** keys (`detail` in order/menu/inventory forms, `error` in login/register/agent).

### 1.2 Known problems the migration fixes
1. `POST /agent/ask?question=&api_key=` — the **client supplies the OpenAI API key** as an unencoded query parameter. Keys move server-side.
2. Default-to-restaurant-1 when no token is present — a cross-tenant hole. Visible today: logged-out staff pages show restaurant 1's orders; the anonymous heartbeat fired from `/login` and the customer QR page keeps restaurant 1 "online".
3. `/restaurant/status` and `/orders/qr-create` are hard-coded to restaurant 1. The customer QR page does not even use `qr-create`: it posts to `/orders/create` through a Next.js proxy, bypassing the "restaurant offline" check.
4. `agents/whatsapp_agent.py` is not tenant-aware: it reads every restaurant's menu and creates orders with no restaurant.
5. The floating chat bot (frontend, `gpt-4o` called from the Next.js server) confirms orders by posting to `POST /orders`, **which does not exist in the backend** — silently broken today. The warm-up call to `GET /health` is likewise a 404.
6. Migrations are ad-hoc SQL at import time; no migration history.
7. Prices/totals are `Float`.
8. `Order.items_json` is a JSON **string** column parsed manually.
9. No tests.
10. Deployment config targets Nixpacks, which Railway no longer documents as a builder.

### 1.3 Endpoint inventory (42 implemented routes + 2 called-but-missing) — the feature-parity checklist

Legend — **Tenant**: runs inside a restaurant schema. **Public**: runs in the public schema. **FE auth**: how the frontend calls it today (Bearer via `authFetch`, or none).

| # | Method | Path | FE auth | Tenant | Purpose / contract notes |
|---|---|---|---|---|---|
| 1 | GET | `/` | none | Public | Health: `{"message": "Waheed System Running!", "status": "ok"}` |
| 2 | GET | `/menu` | Bearer (staff) / **none** (QR proxy, chat bot) | Tenant | `{menu:[{id,name,price,category,is_available,description,parent_id,out_of_stock,max_qty,modifiers:[...],variants:[...]}]}` |
| 3 | POST | `/menu/add` | Bearer | Tenant | `{name,price,category,description="",parent_id?}` → `{message,id}` (FE reads `id`) |
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
| 17 | POST | `/orders/create` | Bearer (cashier) / **none** (QR proxy) | Tenant | `{items:[{name,price,category,modifiers:[{name,price_delta,inventory_item_id,quantity_delta}]}],table_number=1,cashier,notes,payment_method?,client_id?}`; items are **one entry per unit**; → `{message,total,order_id}`; idempotent on `client_id` (offline replay); 400 when stock insufficient |
| 18 | POST | `/heartbeat` | Bearer (fires on every page) | Tenant | `{status,last_heartbeat_at}`; empty body |
| 19 | GET | `/restaurant/status` | none | Public→Tenant | `{online,last_heartbeat_at}` |
| 20 | POST | `/orders/qr-create` | none | Public→Tenant | same body as 17; 503 when restaurant offline; unused by the frontend today |
| 21 | PUT | `/orders/{id}/ready` | Bearer | Tenant | status → `ready` |
| 22 | PUT | `/orders/{id}/preparing` | Bearer | Tenant | status → `preparing` |
| 23 | PUT | `/orders/{id}` | Bearer | Tenant | `{items:[{name,price,category}],table_number,notes}`; only while `preparing`/`pending`; re-balances inventory |
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
| 35 | POST | `/inventory/deduct/{order_id}` | — (not called by FE) | Tenant | **Dropped** (grilling Q12): unused by any UI and would double-deduct stock already taken at order creation |
| 36 | GET | `/table-layout` | Bearer | Tenant | `{elements:[{element_id,element_type,x,y,w,h,table_number,capacity,label}]}` (`label` = zone name) |
| 37 | POST | `/table-layout/save` | Bearer | Tenant | full replace; empty array clears |
| 38 | POST | `/login` | none | Public | `{email,password}` → `{token,role,username,message}` or `{error}` |
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
├── pyproject.toml                 # deps + ruff + pytest config
├── .env.example
├── railway.json                   # see §9
├── waheed/                        # Django project
│   ├── settings/{base,dev,prod}.py
│   ├── celery.py                  # Celery app; autodiscover tasks
│   ├── urls.py                    # single urlconf (tenant + public routes, no prefixes)
│   └── wsgi.py / asgi.py
├── core/                          # cross-cutting, no models
│   ├── middleware.py              # JWTTenantMiddleware (§3.2)
│   ├── permissions.py             # IsSuperAdmin, IsRestaurantAdmin, IsCashierOrAdmin
│   ├── decorators.py              # @tenant_required, @public_only, @public_tenant_allowed
│   ├── exceptions.py              # DRF exception handler → {"error", "detail"} + real status codes
│   ├── responses.py               # ok()/fail() helpers preserving today's shapes
│   ├── tasks.py                   # @tenant_task: Celery task wrapper running in schema_context
│   └── money.py                   # Decimal helpers / serializer field
├── tenants/            (SHARED)   # Restaurant(TenantMixin), Domain(DomainMixin), bootstrap_dev command
├── accounts/           (SHARED)   # User (email login, role, restaurant FK), login/register/refresh/me FBVs
├── platform_admin/     (SHARED)   # /admin/restaurants* FBVs (super_admin)
├── menu/               (TENANT)   # MenuItem, ModifierGroup, ModifierOption + FBVs
├── inventory/          (TENANT)   # InventoryItem, RecipeIngredient + FBVs + stock service
├── orders/             (TENANT)   # Order, CancellationLog + FBVs + order service (used by API, QR, bots)
├── layout/             (TENANT)   # TableLayoutElement + FBVs
├── ai/                 (TENANT)   # providers/, agents/, AIUsageLog, ConversationState, /agent/* FBVs, tasks
│   ├── providers/{base,openai_provider,gemini_provider}.py
│   ├── agents/{report_agent,chat_agent,fraud_agent}.py
│   └── tasks.py                   # send_fraud_alert, ...
├── messaging/          (TENANT)   # WhatsApp Cloud API channel (§6.4): webhook view, sender, inbound task; WhatsAppAccount lives in tenants
└── tests/                         # pytest, FastTenantTestCase-based
backend_legacy/                    # read-only backup of the FastAPI app
```

**Why one urlconf, not `PUBLIC_SCHEMA_URLCONF`:** all traffic arrives on one hostname. The middleware decides the schema per request; each view is tagged `@tenant_required` or `@public_only` so a tenant view can never run in `public` and vice-versa (§3.4).

**Rule for every view:** function-based, decorated `@api_view([...])`, validation through a DRF `Serializer`, business logic in a `services.py`, response through `core.responses`. No `APIView`/`ViewSet`.

---

## 3. Multi-tenancy design

### 3.1 Schema layout

| Schema | Contents |
|---|---|
| `public` | `django_tenants`, `tenants.Restaurant`, `tenants.Domain`, `accounts.User`, `contenttypes`, `auth` (permissions only), channel accounts (§6.4) |
| `r_<12 hex>` (one per restaurant) | `menu.*`, `inventory.*`, `orders.*`, `layout.*`, `ai.AIUsageLog`, `ai.ConversationState` |

Settings skeleton:

```python
DATABASES = {"default": {"ENGINE": "django_tenants.postgresql_backend", **env.db()}}
DATABASE_ROUTERS = ("django_tenants.routers.TenantSyncRouter",)
TENANT_MODEL = "tenants.Restaurant"
TENANT_DOMAIN_MODEL = "tenants.Domain"
TENANT_LIMIT_SET_CALLS = True

SHARED_APPS = (
    "django_tenants", "tenants", "accounts", "platform_admin",
    "django.contrib.contenttypes", "django.contrib.auth",
    "django.contrib.admin", "django.contrib.sessions", "django.contrib.messages",  # Super admin console
    "rest_framework", "corsheaders",
)
TENANT_APPS = ("menu", "inventory", "orders", "layout", "ai")
INSTALLED_APPS = list(SHARED_APPS) + [a for a in TENANT_APPS if a not in SHARED_APPS]

MIDDLEWARE = (
    "corsheaders.middleware.CorsMiddleware",      # first: CORS headers must reach the browser even on the
    "core.middleware.JWTTenantMiddleware",        # 401/403 responses the tenant middleware emits
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",      # Django admin only
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",                 # Django admin only; API views are CSRF-exempt
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
)

CACHES = {"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": env("REDIS_URL"),
                      "KEY_FUNCTION": "django_tenants.cache.make_key",
                      "REVERSE_KEY_FUNCTION": "django_tenants.cache.reverse_key"}}
```

The **Django admin** (`/django-admin/`, public schema) is the Super admin console for now: Restaurants (status, slug, country, currency, timezone), Users (create staff, reset passwords), WhatsApp accounts. Only `super_admin` users get `is_staff`. The frontend `/admin` page and `/admin/restaurants*` API stay for parity.

### 3.2 Tenant resolution — `core.middleware.JWTTenantMiddleware`

django-tenants' stock `TenantMainMiddleware` resolves the tenant from the request **hostname** via the `Domain` table. Our frontend is a single app on a single API host and never sends a tenant identifier; the restaurant identity travels in the JWT. Subclass the stock middleware and override `process_request`:

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

Subdomain routing is **not** built. A `Domain` row (`<slug>.<TENANT_BASE_DOMAIN>`) is still created because django-tenants requires the model; nothing reads it.

**Removed on purpose:** the "no token → restaurant 1" bridge. Every tenant endpoint requires either a valid JWT or an explicit slug (§3.3).

### 3.3 Unauthenticated tenant endpoints (customer QR flow)

The customer page (`/table/[id]`) and its Next.js proxies call `GET /menu`, `GET /orders`, `POST /orders/create` with no token; `GET /restaurant/status` and `POST /orders/qr-create` are public by design. These resolve the restaurant from a **slug**:

- Header `X-Restaurant-Slug: <slug>` **or** query `?r=<slug>`. `slug` is a new unique ASCII field on `Restaurant` — restaurant names are Arabic, so slugs cannot be derived from names; auto-generated as `r-<8 hex>` at registration, editable by the admin later.
- Only views decorated `@public_tenant_allowed` accept slug-resolved tenants (`GET /menu`, `GET /orders`, `POST /orders/create`, `POST /orders/qr-create`, `GET /restaurant/status`). Every other tenant view rejects `tenant_source == "slug"` with 401.
- **Slug-resolved calls are customer calls:**
  - `GET /orders` returns a **redacted projection** — `{id, table_number, status}` of non-final orders only.
  - `POST /orders/create` gets **QR semantics**: 503 while the restaurant is offline (heartbeat older than 90 s), `cashier` forced to `"QR"`, `payment_method` ignored. `/orders/qr-create` stays as an alias.
- The frontend embeds the slug in the QR URL and forwards it from its proxies (§5.6 F1). No transitional fallback: the data is disposable and the frontend ships in the same branch.

### 3.4 View-level guards

- `@tenant_required` — 400 if `request.tenant is None`.
- `@public_only` — 400 if a tenant is set (`/login`, `/register`, `/admin/*`).
- `@public_tenant_allowed` — marks the five customer endpoints.
- DRF permissions: `IsAuthenticated` default; `IsSuperAdmin` for `/admin/*`; `IsRestaurantAdmin` for menu/inventory/layout **mutations** and `/agent/ask`; cashier or admin for orders, heartbeat, `/agent/chat`.

### 3.5 Users & roles

- Custom `accounts.User(AbstractBaseUser, PermissionsMixin)` in **public**: `email` (USERNAME_FIELD, unique), `username` (display; `UniqueConstraint(restaurant, username)`), `role ∈ {super_admin, admin, cashier}`, `restaurant` FK (null **only** for `super_admin`, enforced by a `CheckConstraint`), `is_active`. Django's default PBKDF2 hasher (no legacy hashes to carry).
- Tokens: `RefreshToken.for_user(user)` plus claims `role`, `restaurant_id`, `username`. `JWTAuthentication` resolves the user from `public.accounts_user`, always on the search path.
- `django-tenant-users` evaluated and **not adopted** (own user model and per-tenant permission tables; our authorization is three fixed roles).

### 3.6 Registration = tenant provisioning (`POST /register`)

Inside `transaction.atomic()`: validate (same rules and Arabic messages as today) → `Restaurant.objects.create(schema_name=f"r_{uuid4().hex[:12]}", slug=..., ...)` (`auto_create_schema=True` runs tenant migrations synchronously, a few seconds) → `Domain` row → owner `User(role="admin")` → tokens. If provisioning time ever hurts, switch on `TENANT_CREATION_FAKES_MIGRATIONS` with a `TENANT_BASE_SCHEMA` template, or move schema creation to a Celery task with a "provisioning" status.

### 3.7 Data model (per tenant schema)

| Legacy | New | Notes |
|---|---|---|
| `*.restaurant_id` | *(dropped)* | isolation is the schema itself |
| `menu_items.parent_id` (int) | `MenuItem.parent = FK("self", null=True, on_delete=CASCADE)` | |
| `modifier_groups.menu_item_id` | FK `menu_item` CASCADE, `sort_order` kept | |
| `modifier_options.group_id` / `inventory_item_id` | FKs (`inventory_item` `SET_NULL`) | |
| `recipe_ingredients` | FKs CASCADE + `UniqueConstraint(menu_item, inventory_item)`, `amount Decimal` | |
| `orders.items_json` (text) | `Order.items = JSONField(default=list)` | same serialized shape |
| `orders.total_price` Float (and every price/delta) | `DecimalField(12,3)`; serialized as a JSON **number** (`coerce_to_string=False`) | JOD has 3 decimals; frontend formats via `toLocaleString()` |
| `orders.client_id` | `UniqueConstraint(client_id)` (schema-local) | |
| `orders.status` | `CharField(choices=Order.Status)` (`TextChoices`) | today's six values |
| `restaurants.last_heartbeat_at` | stays on `Restaurant` (public) | |
| all timestamps | `USE_TZ=True`, serialized ISO-8601 with `Z` | frontend appends `Z` when missing → compatible |

### 3.8 Concurrency, integrity, background work

- Order creation: `transaction.atomic()` + `select_for_update()` on the inventory rows, single pass check-then-deduct, 400 on shortage; `client_id` idempotency inside the same transaction.
- `PUT /orders/{id}/pay` is a plain idempotent row update; safe under the frontend's parallel calls.
- **Celery tasks are tenant-aware by construction:** `core.tasks.tenant_task` wraps a Celery task so its first argument is `schema_name`, and the body runs inside `django_tenants.utils.schema_context(schema_name)`. Views enqueue with `request.tenant.schema_name`; nothing else is accepted. Redis is the broker and result backend (results ignored except for tests).

### 3.9 Isolation test matrix (must pass before cutover)

1. User of restaurant A with A's token: full CRUD on A.
2. Same token + `X-Restaurant-Id: B` → 403; no B data touched.
3. Forged/expired token → 401 on every tenant endpoint; slug-less QR call → 400.
4. `GET /menu?r=B` → B's menu only; `GET /orders?r=B` → redacted rows only; `POST /menu/add?r=B` → 401.
5. super_admin without header → `/admin/*` OK, `/menu` → 400; with `X-Restaurant-Id: B` → B data.
6. Suspended restaurant: login → `{"error": "هذا المطعم موقوف حالياً"}`; existing token → 403.
7. IDs from tenant A used in tenant B's requests → 404.
8. `migrate_schemas` on a fresh DB + `bootstrap_dev` + `POST /register` work from zero.
9. A 401/403 emitted by the middleware carries CORS headers.
10. A Celery task enqueued from tenant A writes only into A's schema (asserted with `schema_context(B)` showing no rows).

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
    item = menu_services.add_item(**s.validated_data)
    return ok({"message": f"تم إضافة {item.name}", "id": item.id}, status=201)
```

- **Serializers** validate input and format output (`created_at` as `%Y-%m-%dT%H:%M:%SZ`, decimals as numbers). Output dicts are built explicitly to guarantee the exact legacy shapes.
- **Exception handler** always emits **both keys** — `{"error": "<message>", "detail": "<message>"}`. `ValidationError` → 400 (+ `errors` field map); `NotAuthenticated` → 401; `PermissionDenied` → 403; `Http404` → 404; offline QR → 503. The frontend's offline sync engine treats **4xx as permanent** failure and **5xx/network as retryable**, so validation/stock problems are 4xx and infrastructure problems 5xx.
- **N+1 avoidance:** `GET /menu` prefetches groups/options/recipes once and computes `out_of_stock`/`max_qty` in Python (≤ 5 queries).
- **Throttling:** `AnonRateThrottle` on `/login`, `/register` and slug-resolved endpoints; `UserRateThrottle` on `/agent/*`.
- **URLs:** identical paths to §1.3; `APPEND_SLASH=False`; no trailing slashes.
- **Renderers:** `JSONRenderer` only; `DEFAULT_AUTHENTICATION_CLASSES = [JWTAuthentication]`.

---

## 5. API contract & frontend compatibility

### 5.1 Preserved as-is
All 42 routes, their paths, request bodies and success response bodies, including Arabic `message` strings; `token`/`role`/`username` in the login response; `order_id` in the create response; `client_id` idempotency; `?cashier=` on cancel.

### 5.2 Additive changes
- `/login` and `/register` also return `refresh`. New `POST /auth/refresh` (`{refresh}` → `{token, refresh}`). Access 8 h, refresh 30 d.
- New `GET /health`, `GET /me` (`{username, role, restaurant_id, restaurant: {name, slug}}`).
- New `POST /orders` — the quantity-based body the chat bot already sends, expanded server-side into the same order service; returns `{message, total, order_id, id}`. Prices come from the **tenant's menu**, never from the request. Requires a JWT.
- New `POST /agent/chat` — backend home for the floating chat bot (§6.5).
- Error bodies carry both `error` and `detail` plus a real HTTP status code.

### 5.3 Approved security changes
| Change | Why | Frontend impact |
|---|---|---|
| Tenant endpoints require a JWT, except the five customer endpoints which require a slug | closes the restaurant-1 bridge | customer proxies forward the slug (F1); chat bot order needs auth (F3) |
| Anonymous `GET /orders` is redacted to `{id, table_number, status}` of open orders | stop leaking every order to anyone who scans a QR | none (customer page reads only those two fields) |
| Anonymous `POST /orders/create` gets QR semantics (503 when offline, cashier `"QR"`) | restores the offline gate | customer page already handles non-OK responses |
| Real status codes with the same `{error, detail}` body | correctness; sync-engine semantics | none |
| `/agent/ask` ignores `api_key`; `question` from query **or** JSON body; key from the server | stop leaking provider keys | remove the key input (F2) |
| Role checks: menu/inventory/layout mutations and `/agent/ask` → `admin`; orders/heartbeat/chat → `cashier` or `admin` | least privilege | cashier UI does not call admin mutations today; verified by the parity checklist |

### 5.4 Things we will *not* change (frontend tolerates them)
`is_available` field name; `created_at` format; `inventory_name` in recipes; `label` as zone name; `element_type` strings.

### 5.5 Frontend call inventory (from the audit)
- **Base URL** `NEXT_PUBLIC_API_URL` (fallback = production Railway URL) duplicated in 10 files; `lib/apiFetch.ts` `authFetch()` adds `Authorization: Bearer <localStorage.token>`.
- **Auth state**: `token`, `role`, `username` in localStorage; no refresh, no expiry check, no 401 handling; logout = `localStorage.clear()`.
- **Tenant identity**: never sent. QR URL is `${site}/table/<n>`.
- **Anonymous calls**: proxies `app/api/menu`, `app/api/orders`, `app/api/orders/create` (customer page), `app/api/orders/qr-create` (dead), `app/api/warmup` (→ `/health`); chat bot `GET /menu` and `POST /orders`; heartbeat on every page.
- **Polling**: `GET /orders` every 10/15/20/30 s from four pages; heartbeat every 60 s. No WebSocket/SSE.
- **Offline**: IndexedDB queue replayed to `POST /orders/create` with `client_id`; 4xx = permanent, 5xx = retry.
- **Frontend-side AI**: `app/api/chat/route.ts` calls OpenAI `gpt-4o` from the Next.js server (accepts a `NEXT_PUBLIC_OPENAI_API_KEY` fallback that can leak into the bundle), interpolates menu names into the system prompt, parses an `__ORDER__{...}__END__` sentinel; `app/api/debug` exposes partial key previews publicly.

### 5.6 Frontend tasks — all in scope (same branch)
- **F1** QR URL carries the slug (`/table/<n>?r=<slug>`); proxies `app/api/menu`, `app/api/orders`, `app/api/orders/create` forward `X-Restaurant-Slug`. The tables page gets the slug from `GET /me`.
- **F2** Dashboard: remove the API-key input; send `question` in the JSON body.
- **F3** Chat bot moves to backend `POST /agent/chat` (§6.5); "confirm order" calls `POST /orders` via `authFetch`; the `openai` npm dependency is removed.
- **F4** `authFetch`: on 401 → clear storage and redirect to `/login`; try `/auth/refresh` once first.
- **F5** `useHeartbeat`: fire only when a token exists.
- **F6** Sync engine: treat 401 as "retry after login", not permanent `SyncFailed`.
- **F7** Delete `app/api/debug`, `app/api/orders/qr-create`, `PUT /api/chat`, `lib/store.fetchOrders`, the `NEXT_PUBLIC_OPENAI_API_KEY` fallback.
- **F8** Import the base URL from `lib/apiFetch.ts` everywhere instead of 10 copies.
- **F9** `formatMoney()` helper: currency symbol and decimals from `GET /me` (`د.أ` with 3 decimals for JOD, `د.ع` for IQD) replaces the ~20 hard-coded `د.ع` labels.
- **F10** Old orders page: the `pending` stat card becomes "open orders" (status not `done`/`cancelled`); revenue tiles count Paid, non-cancelled orders only.

---

## 6. AI layer — OpenAI + Gemini

### 6.1 Facts verified against current docs (2026-09-03)
- SDK: `google-genai` **2.22.0** (`pip install -U google-genai`). Env var **`GEMINI_API_KEY`**; `genai.Client()` picks it up automatically.
- The **Interactions API** (`client.interactions.create(...)`) is **GA since June 2026** and recommended for new projects; `client.models.generate_content(...)` remains supported but is described as legacy. Interactions requires `google-genai >= 2.3.0`.
- Interactions request fields used: `model`, `input`, `system_instruction`, `tools` (`{"type": "function", "name", "description", "parameters"}`), `response_format` (`{"type": "text", "mime_type": "application/json", "schema": <JSON schema>}`), `previous_interaction_id`, `generation_config` (incl. `thinking_level`), `safety_settings`, `store`. Response: `interaction.id`, `interaction.output_text`, `interaction.steps` (types incl. `function_call` with `.name`, `.arguments`, `.id`), `interaction.outputs`. Function results go back as `{"type": "function_result", "name", "call_id", "result": [{"type": "text", "text": ...}]}` with `previous_interaction_id`.
- Models (stable, text): `gemini-3.8-flash` (most capable Flash), `gemini-3.5-flash-lite` (cheapest), plus 3.7/3.6/3.5 Flash and the 2.5 family. `gemini-2.0-flash*` are shut down.
- **Free tier (approved):** content may be used to improve Google products — accepted for now. Per-model free-tier rate limits are not published as a static table; they are shown in Google AI Studio's rate-limit page for the project and are low (small RPM and daily caps). Design consequences: one in-flight request per tenant per agent, Celery retry with exponential backoff on HTTP 429, `AIUsageLog` to see when the cap is hit, and a one-line switch to Tier 1 (link a billing account) when needed.
- Errors: `google.genai.errors.APIError` (`.code`, `.message`); built-in retries via `types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=..., ...))`.

### 6.2 Provider abstraction (`ai/providers/`)

```python
class LLMProvider(Protocol):
    name: str
    def complete(self, *, system: str, user: str, tools: Optional[list[ToolSpec]] = None,
                 response_schema: Optional[type[BaseModel]] = None,
                 conversation_id: Optional[str] = None, model: Optional[str] = None) -> LLMResult: ...
    # LLMResult: text, parsed (pydantic instance | None), tool_calls[], conversation_id, usage{input,output}
```

- `gemini_provider.py`: Interactions API; tool loop (max 4 rounds) executes server-side callables and feeds `function_result` blocks back with `previous_interaction_id`; `response_schema` → `response_format` from `Model.model_json_schema()`; `store=True` only when a `conversation_id` is requested.
- `openai_provider.py`: today's `gpt-4o-mini` behaviour behind the same interface.
- Selection: request `provider` (admin only) → `Restaurant.ai_provider` (nullable public column) → `AI_DEFAULT_PROVIDER` env (`gemini`).
  ```python
  AI_MODELS = {"gemini": {"report": "gemini-3.8-flash", "chat": "gemini-3.5-flash-lite"},
               "openai": {"report": "gpt-4o-mini", "chat": "gpt-4o-mini"}}
  ```
- Every call writes `ai.AIUsageLog(provider, model, purpose, input_tokens, output_tokens, latency_ms, ok, error_code)` in the tenant schema.
- Prompt-injection hygiene: menu names/descriptions are passed as **structured tool results or JSON data**, never interpolated into the system prompt; orders are created only from **parsed structured output**.

### 6.3 Report agent (`POST /agent/ask`)
Tools executed under `request.tenant`: `get_sales_summary(period)`, `get_top_items(limit)`, `get_low_stock()`, `get_cancellations(period)`, `get_order_status_counts()`. Arabic system prompt. Admin-only, throttled, 20 s timeout; response `{answer, provider, model}`. `question` from query string or JSON body.

### 6.4 WhatsApp bot — cost analysis and decision (ADR-0004)

Today's bot uses **neonize**, a Python binding of the unofficial WhatsApp Web (whatsmeow) protocol: a long-running process logged in as a normal WhatsApp account via QR scan, with the session file on a volume.

| Option | Direct cost | Infra cost | Risk / effort |
|---|---|---|---|
| **A. neonize (unofficial, status quo)** | $0 per message | one always-on worker per restaurant account + persistent volume (a Railway service each) | Violates WhatsApp ToS; numbers get banned; breaks when the web protocol changes; QR re-pairing on session loss; one process per restaurant does not scale |
| **B. Meta WhatsApp Business Platform (Cloud API), direct** | Per-message only for **business-initiated template messages** (marketing/utility/authentication, priced by category and recipient country). **Free:** all non-template replies inside an open 24 h customer-service window, all user-initiated (service) conversations, utility templates inside an open window. No hosting or API fee | none extra: Meta hosts the API; we expose one HTTPS **webhook** view and process messages in Celery | Official and stable. Needs a Meta Business account, a phone number not registered on consumer WhatsApp (per restaurant), business verification for volume, template approval for owner alerts |
| **C. BSP (Twilio, 360dialog, …)** | Meta's fees **plus** the BSP's per-message/monthly markup | none extra | Easiest onboarding; strictly more expensive than B for the same traffic |

**Recommendation: B (Cloud API direct).** Customer ordering is user-initiated, so the entire order flow is **free**; the only paid messages are owner fraud alerts (a utility template, cents per message; can even be free if the owner keeps a service window open by messaging the bot). It removes the per-restaurant worker service and volume, fits Celery naturally (webhook → task), and is multi-tenant by design: one `WhatsAppAccount(restaurant, phone_number_id, access_token)` row in public per restaurant. The unofficial route (A) is acceptable only as a local dev toy.

**What is built regardless of the choice:** a channel-agnostic `messaging` pipeline — `InboundMessage(restaurant, sender, text)` → Celery task under the tenant → `chat_agent` with structured output → `orders.services.create_order()` → `OutboundMessage`. Options A and B are adapters at the edges. Owner fraud alerts go through the same outbound adapter.

**Decision (grilling Q19–Q22, 2026-09-03): Option B**, recorded in ADR-0004. One business number per Restaurant under the platform's WhatsApp Business Account, onboarded by the Super admin in the Django admin (`tenants.WhatsAppAccount(restaurant, phone_number_id, access_token, enabled)`). Inbound: `POST /webhooks/whatsapp` verifies `X-Hub-Signature-256` with the app secret, answers 200 immediately, and enqueues `process_inbound_message(schema_name, ...)`; `GET` answers Meta's `hub.challenge` with the verify token. Outbound: Graph API `messages` endpoint. Owner fraud alerts use the approved `fraud_alert` utility template; until approval they are logged only. Development uses Meta's free test number and a local tunnel; a `/wizard` script walks the human through creating the Meta app, the test number and the webhook. Costs and sources: `docs/research/whatsapp-cloud-api-costs-iraq.md`.

### 6.5 Chat agent (`POST /agent/chat`) — backend home for the floating bot and the WhatsApp bot
- Body `{messages:[{role, content}], table_number?}`; menu context from the **tenant DB**. Response `{reply, order_proposal?: {table_number, items:[{name, quantity, price}]}}` via structured output:
  ```python
  class BotReply(BaseModel):
      intent: Literal["menu", "order", "other"]
      items: list[OrderedItem]            # {name: str, qty: int}
      reply_text: str
  ```
  Items are matched against tenant `MenuItem` names; a proposal is confirmed by a normal `POST /orders`.
- Multi-turn for WhatsApp: `ConversationState(sender_key, provider_conversation_id, updated_at)` in the tenant schema, 2 h expiry, continued via `previous_interaction_id`.
- Model: `gemini-3.5-flash-lite` with the lowest `thinking_level`.

### 6.6 Fraud agent
Rule-based (no LLM): ≥ 3 cancellations by the same cashier within 60 minutes, tenant-scoped `CancellationLog`. The alert is a Celery task (`send_fraud_alert(schema_name, ...)`) that uses the outbound messaging adapter once §6.4 is decided; until then it logs.

### 6.7 Tests for the AI layer
Fake provider for unit tests; Gemini adapter tests against recorded fixtures (no network in CI); one opt-in live smoke test guarded by `GEMINI_API_KEY`.

---

## 7. Seed data (`manage.py bootstrap_dev`)

Idempotent: creates restaurant "Waheed Restaurant" (slug `waheed`) with its schema, the three accounts with today's credentials (`admin@restaurant1.local.placeholder`/`admin123`, `cashier@…`/`cashier123`, `superadmin@platform.local.placeholder`/`superadmin123`), the six-item demo menu, a few inventory items with recipes, and a small table layout so every frontend page has data. Production restaurants register through the UI. No legacy import.

---

## 8. Phased delivery (each phase = its own tickets under `.scratch/django-backend/issues/`)

| Phase | Deliverables | Acceptance | Est. |
|---|---|---|---|
| **0 — Prep** | `brew services start postgresql@15 redis`, `createdb waheed`; `git mv backend backend_legacy`; new `backend/` scaffold on Python 3.10; `pyproject.toml` (§10); `.env.example`; `ruff`, `pytest-django`; Celery app wired to Redis | `manage.py check`; `migrate_schemas --shared` on an empty DB; `celery -A waheed inspect ping`; `pytest` runs | 0.5 d |
| **1 — Tenancy core** | `tenants`, `accounts`, `core` (middleware, permissions, decorators, exception handler, `tenant_task`), Simple JWT with legacy claim names, `/`, `/health`, `/login`, `/register`, `/auth/refresh`, `/me`, `/admin/restaurants*`, `bootstrap_dev` | §3.9 items 1–3, 5, 6, 8–10 green; current frontend logs in unchanged | 2 d |
| **2 — Domain apps** | `menu` (+ modifiers), `inventory` (+ recipes, stock service), `orders` (all transitions, idempotency, `select_for_update`, `POST /orders`), `layout`, `/heartbeat`, `/restaurant/status`, slug-resolved customer endpoints | every route in §1.3 returns the documented shape (golden-file contract tests captured from the legacy API); §3.9 item 4; `/menu` ≤ 5 queries | 3 d |
| **3 — AI + Celery** | providers (OpenAI + Gemini free tier), `/agent/ask` with tools, `/agent/chat`, `AIUsageLog`, fraud rule + `send_fraud_alert` task, channel-agnostic `messaging` pipeline (no WhatsApp adapter yet) | fake-provider tests green; live smoke test answers an Arabic sales question with ≥ 1 tool call; 429 handling proven with a fake | 2 d |
| **4 — Frontend** | §5.6 F1–F8 | customer QR flow works with the slug; chat bot orders through the backend; 401 redirects; no OpenAI key in the frontend | 1.5 d |
| **5 — Deployment** | `railway.json` (Railpack, gunicorn, `preDeployCommand: migrate_schemas`), worker service (`celery -A waheed worker`), Redis + PostgreSQL plugins, env vars (§11), `/health` check | staging passes the isolation matrix and contract tests against the deployed URL | 1 d |
| **6 — Cutover** | fresh production DB, `bootstrap_dev` or registration, point the Railway web service at `backend/`, frontend env unchanged | all frontend pages work end-to-end on production | 0.5 d |
| **7 — WhatsApp (Cloud API)** | webhook (verify token + signature check) → Celery task → Chat agent → order; outbound sender; `fraud_alert` template; Django-admin onboarding of numbers; `/wizard` script for the Meta app, test number and tunnel | a customer orders via WhatsApp into the right tenant with Meta's test number; owner receives a fraud alert (or the logged fallback) | 1.5 d |
| **8 — Cleanup** | remove `nixpacks.toml`, `Procfile`; `backend/README.md`; `backend_legacy/` stays until the user says otherwise | no dead config; docs current | 0.5 d |

Total ≈ **12.5 working days**. Everything lands on branch `faysal`, pushed after every commit.

---

## 9. Local development & deployment

**Local**
```bash
brew services start postgresql@15 && brew services start redis && createdb waheed
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"   # pyenv 3.10.20
cp .env.example .env            # DATABASE_URL=postgres://localhost/waheed, REDIS_URL=redis://localhost:6379/0, GEMINI_API_KEY=...
python manage.py migrate_schemas --shared
python manage.py bootstrap_dev
python manage.py runserver 8000
celery -A waheed worker -l info          # second terminal
```
Tests: `pytest` (needs PostgreSQL + Redis; `FastTenantTestCase` + `TenantClient`; Celery runs eagerly in tests).

**Railway**
- Builder **Railpack**; service root `backend/`.
- `railway.json`:
  ```json
  {"$schema": "https://railway.com/railway.schema.json",
   "build": {"builder": "RAILPACK"},
   "deploy": {"preDeployCommand": ["python manage.py migrate_schemas --executor multiprocessing"],
              "startCommand": "gunicorn waheed.wsgi:application --bind 0.0.0.0:$PORT --workers 3 --timeout 60",
              "healthcheckPath": "/health", "healthcheckTimeout": 300,
              "restartPolicyType": "ON_FAILURE", "restartPolicyMaxRetries": 10}}
  ```
- Worker service: same repo/root, start command `celery -A waheed worker -l info --concurrency 2`.
- Migrations run only via `preDeployCommand`.

---

## 10. Dependencies (pinned, verified on PyPI 2026-09-03, all support Python 3.10)

| Package | Version | Note |
|---|---|---|
| Django | 5.2.17 (LTS, to Apr 2028) | 6.x needs Python ≥ 3.12 |
| django-tenants | 3.14.0 | requires `Django >=5.2,<6.2` |
| djangorestframework | 3.18.0 | |
| djangorestframework-simplejwt | 5.5.1 | |
| psycopg[binary] | ≥3.2.1,<3.3 | range django-tenants tests against |
| celery[redis] | 5.6.3 | broker + result backend on Redis |
| redis | 6.4.0 | also Django cache backend. Corrected in ticket 01 (2026-09-04): kombu 5.6 (Celery 5.6.3) requires `redis<6.5`, so 8.1.0 cannot install |
| django-cors-headers | 4.9.0 | |
| django-environ | 0.14.0 | `DATABASE_URL`/`REDIS_URL` parsing |
| google-genai | 2.22.0 | Interactions API needs ≥ 2.3.0 |
| openai | 3.8.0 | existing provider |
| gunicorn | 26.2.0 | |
| dev: pytest 9.1.1, pytest-django 4.14.0, ruff 0.16.6, factory-boy 3.3.3 | | |

Removed: fastapi, uvicorn, sqlalchemy, psycopg2-binary, passlib, bcrypt, python-jose, python-multipart, neonize (returns only if §6.4 chooses option A).

---

## 11. Environment variables

| Var | Purpose |
|---|---|
| `DJANGO_SETTINGS_MODULE` | `waheed.settings.dev` / `waheed.settings.prod` |
| `SECRET_KEY` | Django secret + Simple JWT signing key |
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | Celery broker/result backend + cache |
| `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` | prod hardening (today CORS is `*`) |
| `TENANT_BASE_DOMAIN` | only to fill the mandatory `Domain` row |
| `AI_DEFAULT_PROVIDER` | `gemini` \| `openai` |
| `GEMINI_API_KEY` | free tier |
| `OPENAI_API_KEY` | existing provider (renamed from `OPENAI_KEY`) |
| `WHATSAPP_VERIFY_TOKEN` | webhook GET verification |
| `WHATSAPP_APP_SECRET` | validates `X-Hub-Signature-256` on webhook POSTs |
| (per Restaurant, in DB) | `phone_number_id`, `access_token` on `WhatsAppAccount` |

---

## 12. Decisions log

Resolved 2026-09-03 by the user:
1. Legacy data disposable → no import; seed with `bootstrap_dev`. Frontend may be changed freely.
2. No subdomains. All old features must keep working (§1.3 is the checklist).
3. WhatsApp bot: cost analysis (§6.4) and an explicit decision before any bot code.
4. Gemini free tier.
5. Celery for background workers (Redis broker).
6. Python 3.10, no upgrade.
7. `Decimal` for money; adopt better practices proactively.
8. Work through `/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` → `/code-review`.
9. Push everything to branch `faysal` immediately.
10. Keep `backend_legacy/` as backup.

Grilling rounds 1–2 (2026-09-03): all recommendations accepted, plus "Jordan first, Iraq later", "Django admin as Super admin console" and "keep `backlog.md` for everything postponed"; see §14 and `backlog.md`. The design tree is fully visited.

---

## 13. Out of scope
Frontend redesign, QR ordering product changes beyond the slug, FinTech phase, hosting other than Railway, real-time (WebSocket) order updates, subdomain routing.

---

## 14. Grilling resolutions (2026-09-03, round 1)

| # | Decision |
|---|---|
| Q1 | A Restaurant is one location. A brand with branches registers each branch as its own Restaurant. |
| Q2 | Slug auto-generated (`r-<8 hex>`) at registration; renaming comes with a later restaurant-settings endpoint. |
| Q3 | Roles stay `super_admin`, `admin`, `cashier`; `kitchen` is a future role. |
| Q4 | Suspended restaurant: customer QR endpoints return 403 `{"error": "المطعم غير متاح حالياً"}`; the customer page shows that message. |
| Q5 | Access token 8 h, refresh 30 d; frontend refreshes once on 401 then redirects to login; logout is client-side. |
| Q6 | Order state machine: new orders start `preparing`; `preparing → ready → served → done`; `cancelled` from `preparing`/`ready`/`served`; `done` terminal; `pending` retired. |
| Q7 | `done` = closed; `Paid` = payment method recorded, independent of status. Revenue = Paid, non-cancelled orders. |
| Q8 | Cancelling (either endpoint) restores stock only while the order is `preparing`. |
| Q9 | Negative modifier `quantity_delta` reduces the recipe deduction, floored at zero. |
| Q10 | A Variant inherits its parent's Modifier groups and Recipe when it has none of its own; `GET /menu` materialises the inheritance so the frontend is unchanged. |
| Q11 → Jordan | Money is `Decimal(12,3)`. `Restaurant.country` (`JO` now, `IQ` later), `Restaurant.currency` (`JOD` default; `IQD`), `Restaurant.timezone` (`Asia/Amman` default; `Asia/Baghdad`). "Today" in reports is the Restaurant's local day. Phone numbers stored as entered, digits normalised, no strict validation yet. |
| Q12 | `POST /inventory/deduct/{order_id}` dropped. |
| Q13 | `/agent/ask` and `/agent/chat` are synchronous; Celery only for alerts, outbound messages, inbound webhooks. |
| Q14 | Gemini 429/5xx → automatic fallback to OpenAI when a key exists, else `{"error": "المساعد مشغول، حاول بعد قليل"}`; fallback recorded in `AIUsageLog`. |
| Q15 | Chat agent in the web UI is staff-only; customers reach it over WhatsApp. |
| Q16 | Cutover reuses the existing Railway service and URL with a fresh PostgreSQL, plus Redis and a worker service. |
| Q17 | Category stays free text. |
| Q18 | Online window 90 s; only signed-in staff devices send Heartbeats. |
| Django admin | Super admin console for now (§3.1); staff accounts (cashiers) are created there until a restaurant-side staff API exists. |
| Q19 | WhatsApp via Meta Cloud API direct (ADR-0004). |
| Q20 | One business number per Restaurant under the platform's WhatsApp Business Account; Super admin onboards it in the Django admin. |
| Q21 | Owner fraud alerts as the `fraud_alert` utility template; logged-only fallback until approved. |
| Q22 | A `/wizard` script guides the human through the Meta app, test number and webhook tunnel (assumes no existing Meta account). |
| Q23 | No taxes/service charge in this migration → `backlog.md`. |
| Q24 | Registration fixed to `country = JO` → country selector in `backlog.md`. |

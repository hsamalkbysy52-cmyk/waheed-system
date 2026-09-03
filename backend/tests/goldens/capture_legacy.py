"""Record one golden fixture per legacy route by driving a running legacy API.

Usage, from ``backend/`` with the legacy API started on a fresh SQLite database:

    cd ../backend_legacy && DATABASE_URL=sqlite:////tmp/golden.db \\
        .venv/bin/python -m uvicorn main:app --port 8001
    cd ../backend && .venv/bin/python -m tests.goldens.capture_legacy

The database is seeded through the API itself, in dependency order, so the recorded responses show
rich shapes: a Variant, Modifier groups with options, Inventory items with a Recipe, a Table layout
and Orders in every reachable status (the legacy API never produces ``pending``). Tokens are
redacted in requests and responses; ids and timestamps stay as recorded and are ignored by
``tests.golden.assert_matches_golden``.
"""

import argparse
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlencode

from tests.golden import LEGACY_GOLDEN_DIR, LEGACY_ROUTES

ADMIN = ("admin@restaurant1.local.placeholder", "admin123")
CASHIER = ("cashier@restaurant1.local.placeholder", "cashier123")
SUPER_ADMIN = ("superadmin@platform.local.placeholder", "superadmin123")
NEW_OWNER = ("owner@shawarma-house.example", "secret123")

CLIENT_IDS = [f"{n:08d}-0000-4000-8000-000000000000" for n in range(1, 20)]


class Recorder:
    """Sends requests to the legacy API and writes each recorded one as a fixture file."""

    def __init__(self, base_url: str, out_dir: Path):
        self.base_url = base_url.rstrip("/")
        self.out_dir = out_dir
        self.tokens: dict[str, str] = {"invalid": "not.a.jwt"}

    def call(
        self,
        route: str,
        path: str,
        *,
        body: Optional[dict] = None,
        query: Optional[dict] = None,
        as_role: Optional[str] = None,
        headers: Optional[dict] = None,
        case: str = "success",
        record: bool = True,
    ) -> dict:
        if route not in LEGACY_ROUTES:
            raise ValueError(f"unknown legacy route {route!r}")
        method = route.split(" ", 1)[0]
        full_path = path + ("?" + urlencode(query) if query else "")
        sent_headers = {}
        if body is not None:
            sent_headers["Content-Type"] = "application/json"
        if as_role:
            sent_headers["Authorization"] = f"Bearer {self.tokens[as_role]}"
        sent_headers.update(headers or {})
        status, response = self._send(method, full_path, body, sent_headers)
        if record:
            self._write(
                route, case, method, full_path, sent_headers, body, status, response, as_role
            )
        return response

    def login(self, role: str, credentials: tuple, record: bool = False) -> None:
        email, password = credentials
        body = {"email": email, "password": password}
        response = self.call("POST /login", "/login", body=body, record=record)
        self.tokens[role] = response["token"]

    def _send(self, method: str, full_path: str, body: Optional[dict], headers: dict) -> tuple:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        request = urllib.request.Request(
            self.base_url + full_path, data=data, method=method, headers=headers
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))

    def _write(
        self,
        route: str,
        case: str,
        method: str,
        full_path: str,
        headers: dict,
        body: Optional[dict],
        status: int,
        response: Any,
        as_role: Optional[str],
    ) -> None:
        redacted_headers = dict(headers)
        if "Authorization" in redacted_headers:
            redacted_headers["Authorization"] = f"Bearer <{as_role}>"
        redacted_response = {**response, "token": "<jwt>"} if "token" in response else response
        fixture = {
            "route": route,
            "case": case,
            "method": method,
            "path": full_path,
            "headers": redacted_headers,
            "body": body,
            "status": status,
            "response": redacted_response,
        }
        name = fixture_name(route, case)
        target = self.out_dir / name
        if target.exists():
            raise FileExistsError(f"{name} recorded twice; give the second call a distinct case")
        target.write_text(
            json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"  {status} {method} {full_path} -> {name}")


def fixture_name(route: str, case: str) -> str:
    method, template = route.split(" ", 1)
    slug = template.strip("/").replace("/", "-").replace("{", "").replace("}", "") or "root"
    suffix = "" if case == "success" else "--" + case.split(":", 1)[1]
    return f"{LEGACY_ROUTES.index(route) + 1:02d}-{method.lower()}-{slug}{suffix}.json"


def menu_line(name: str, price: float, category: str, modifiers: Optional[list] = None) -> dict:
    """One Order line as the frontend sends it: one entry per unit, price captured at order time."""
    return {"name": name, "price": price, "category": category, "modifiers": modifiers or []}


def burger(modifiers: Optional[list] = None) -> dict:
    return menu_line("برجر", 5000, "وجبات", modifiers)


def cola() -> dict:
    return menu_line("كولا", 1500, "مشروبات")


def record_sessions(rec: Recorder) -> None:
    rec.call("GET /", "/")
    rec.login("admin", ADMIN, record=True)
    rec.login("cashier", CASHIER)
    rec.login("super_admin", SUPER_ADMIN)
    rec.call(
        "POST /login",
        "/login",
        body={"email": ADMIN[0], "password": "wrong"},
        case="failure:wrong-password",
    )
    registration = {
        "restaurant_name": "Shawarma House",
        "phone": "+962790000000",
        "email": NEW_OWNER[0],
        "password": NEW_OWNER[1],
    }
    owner = rec.call("POST /register", "/register", body=registration)
    rec.tokens["restaurant_2_owner"] = owner["token"]
    for case, override in (
        ("failure:empty-name", {"restaurant_name": "   "}),
        ("failure:invalid-email", {"email": "not-an-email"}),
        ("failure:short-password", {"password": "123"}),
        ("failure:duplicate-email", {}),
    ):
        rec.call("POST /register", "/register", body={**registration, **override}, case=case)

    # Customer ordering is refused until a cashier device has sent a Heartbeat.
    rec.call(
        "POST /orders/qr-create",
        "/orders/qr-create",
        body={"table_number": 2, "items": [burger()], "notes": ""},
        case="failure:restaurant-offline",
    )


def record_menu_and_inventory(rec: Recorder) -> dict:
    ids: dict[str, int] = {}
    variant = {"name": "برجر دبل", "price": 7000, "category": "وجبات", "description": "قطعتين لحم"}
    ids["variant"] = rec.call(
        "POST /menu/add", "/menu/add", body={**variant, "parent_id": 1}, as_role="admin"
    )["id"]
    throwaway = rec.call(
        "POST /menu/add",
        "/menu/add",
        body={"name": "ماء", "price": 500, "category": "مشروبات"},
        as_role="admin",
        record=False,
    )["id"]
    edited_variant = {**variant, "price": 7500, "parent_id": 1}
    rec.call("PUT /menu/{item_id}", f"/menu/{ids['variant']}", body=edited_variant, as_role="admin")
    rec.call(
        "PUT /menu/{item_id}",
        "/menu/9999",
        body=edited_variant,
        as_role="admin",
        case="failure:not-found",
    )
    rec.call("DELETE /menu/{item_id}", f"/menu/{throwaway}", as_role="admin")
    rec.call("PUT /menu/{item_id}/toggle", "/menu/6/toggle", as_role="admin")  # شاي goes off sale

    def add_inventory(name: str, unit: str, quantity: float, minimum: float, record: bool) -> int:
        body = {"name": name, "unit": unit, "quantity": quantity, "min_quantity": minimum}
        return rec.call(
            "POST /inventory/add", "/inventory/add", body=body, as_role="admin", record=record
        )["id"]

    ids["meat"] = add_inventory("لحم", "كغم", 20, 5, record=True)
    ids["bread"] = add_inventory("خبز", "قطعة", 50, 10, record=False)
    ids["cheese"] = add_inventory("جبن", "شريحة", 3, 10, record=False)  # Low stock
    ids["tomato"] = add_inventory("طماطم", "كغم", 1, 2, record=False)  # makes باستا Out of stock
    meat_edit = {"name": "لحم بقري", "unit": "كغم", "quantity": 20, "min_quantity": 5}
    rec.call(
        "PUT /inventory/{item_id}", f"/inventory/{ids['meat']}", body=meat_edit, as_role="admin"
    )
    rec.call(
        "PUT /inventory/{item_id}",
        "/inventory/9999",
        body=meat_edit,
        as_role="admin",
        case="failure:not-found",
    )

    burger_recipe = {
        "ingredients": [
            {"inventory_item_id": ids["meat"], "amount": 0.2},
            {"inventory_item_id": ids["bread"], "amount": 1},
        ]
    }
    rec.call(
        "POST /inventory/recipe/{menu_item_id}",
        "/inventory/recipe/1",
        body=burger_recipe,
        as_role="admin",
    )
    pasta_recipe = {"ingredients": [{"inventory_item_id": ids["tomato"], "amount": 2}]}
    rec.call(
        "POST /inventory/recipe/{menu_item_id}",
        "/inventory/recipe/3",
        body=pasta_recipe,
        as_role="admin",
        record=False,
    )
    rec.call(
        "POST /inventory/recipe/{menu_item_id}",
        "/inventory/recipe/9999",
        body=burger_recipe,
        as_role="admin",
        case="failure:menu-item-not-found",
    )
    rec.call("GET /inventory/recipe/{menu_item_id}", "/inventory/recipe/1", as_role="admin")
    return ids


def record_modifiers(rec: Recorder, ids: dict) -> None:
    groups_path = "/menu/1/modifiers/groups"
    group = rec.call(
        "POST /menu/{item_id}/modifiers/groups",
        groups_path,
        body={"name": "إضافات", "max_selections": 2},
        as_role="admin",
    )["id"]
    options_path = f"/modifiers/groups/{group}/options"
    extra_cheese = {
        "name": "جبن إضافي",
        "price_delta": 500,
        "inventory_item_id": ids["cheese"],
        "quantity_delta": 1,
    }
    no_bread = {
        "name": "بدون خبز",
        "price_delta": 0,
        "inventory_item_id": ids["bread"],
        "quantity_delta": -1,
    }
    ids["extra_cheese"] = rec.call(
        "POST /modifiers/groups/{group_id}/options",
        options_path,
        body=extra_cheese,
        as_role="admin",
    )["id"]
    no_bread_id = rec.call(
        "POST /modifiers/groups/{group_id}/options",
        options_path,
        body=no_bread,
        as_role="admin",
        record=False,
    )["id"]
    rec.call(
        "POST /modifiers/groups/{group_id}/options",
        options_path,
        body={**extra_cheese, "inventory_item_id": 9999},
        as_role="admin",
        case="failure:inventory-item-not-found",
    )
    rec.call(
        "PUT /modifiers/groups/{group_id}",
        f"/modifiers/groups/{group}",
        body={"name": "الإضافات", "max_selections": 3},
        as_role="admin",
    )
    rec.call(
        "PUT /modifiers/options/{option_id}",
        f"/modifiers/options/{ids['extra_cheese']}",
        body={"name": "جبن إضافي", "price_delta": 750},
        as_role="admin",
    )
    rec.call(
        "PUT /menu/{item_id}/modifiers/groups/reorder",
        f"{groups_path}/reorder",
        body={"order": [group]},
        as_role="admin",
    )
    rec.call(
        "PUT /modifiers/groups/{group_id}/options/reorder",
        f"{options_path}/reorder",
        body={"order": [no_bread_id, ids["extra_cheese"]]},
        as_role="admin",
    )

    size_group = rec.call(
        "POST /menu/{item_id}/modifiers/groups",
        groups_path,
        body={"name": "الحجم"},
        as_role="admin",
        record=False,
    )["id"]
    size_options = f"/modifiers/groups/{size_group}/options"
    rec.call(
        "POST /modifiers/groups/{group_id}/options",
        size_options,
        body={"name": "كبير", "price_delta": 1000},
        as_role="admin",
        record=False,
    )
    small = rec.call(
        "POST /modifiers/groups/{group_id}/options",
        size_options,
        body={"name": "صغير"},
        as_role="admin",
        record=False,
    )["id"]
    rec.call(
        "DELETE /modifiers/options/{option_id}", f"/modifiers/options/{small}", as_role="admin"
    )
    rec.call(
        "DELETE /modifiers/options/{option_id}",
        "/modifiers/options/9999",
        as_role="admin",
        case="failure:not-found",
    )
    rec.call(
        "DELETE /modifiers/groups/{group_id}", f"/modifiers/groups/{size_group}", as_role="admin"
    )
    rec.call(
        "DELETE /modifiers/groups/{group_id}",
        "/modifiers/groups/9999",
        as_role="admin",
        case="failure:not-found",
    )
    rec.call("GET /menu/{item_id}/modifiers/groups", groups_path, as_role="admin")


def record_layout(rec: Recorder) -> None:
    def element(element_id, element_type, x, y, w, h, table_number=None, capacity=None, label=""):
        return {
            "element_id": element_id,
            "element_type": element_type,
            "x": x,
            "y": y,
            "w": w,
            "h": h,
            "table_number": table_number,
            "capacity": capacity,
            "label": label,
        }

    layout = {
        "elements": [
            element("t-1", "table", 40, 60, 90, 90, table_number=1, capacity=4, label="الصالة"),
            element("t-2", "table", 160, 60, 90, 90, table_number=2, capacity=2, label="الصالة"),
            element("t-3", "table", 40, 220, 120, 90, table_number=3, capacity=6, label="الحديقة"),
            element("w-1", "wall", 0, 170, 300, 10),
            element("d-1", "door", 300, 0, 40, 10),
        ]
    }
    rec.call("POST /table-layout/save", "/table-layout/save", body=layout, as_role="admin")
    rec.call("GET /table-layout", "/table-layout", as_role="admin")


def record_orders(rec: Recorder, ids: dict) -> dict:
    client_ids = iter(CLIENT_IDS)

    def create(
        items: list, table: int, record: bool = False, case: str = "success", **extra
    ) -> dict:
        body = {"table_number": table, "items": items, "cashier": "cashier", "notes": "", **extra}
        body.setdefault("client_id", next(client_ids))
        return rec.call(
            "POST /orders/create",
            "/orders/create",
            body=body,
            as_role="cashier",
            record=record,
            case=case,
        )

    extra_cheese = {
        "name": "جبن إضافي",
        "price_delta": 750,
        "inventory_item_id": ids["cheese"],
        "quantity_delta": 1,
    }
    first = {
        "items": [burger([extra_cheese]), cola()],
        "table": 3,
        "notes": "بدون بصل",
        "client_id": CLIENT_IDS[0],
    }
    create(record=True, **first)  # order 1 stays preparing, with its modifiers
    create(case="success:idempotent-replay", record=True, **first)

    ready = create([burger()], 1)["order_id"]
    rec.call("PUT /orders/{order_id}/ready", f"/orders/{ready}/ready", as_role="cashier")
    rec.call(
        "PUT /orders/{order_id}/ready",
        "/orders/9999/ready",
        as_role="cashier",
        case="failure:not-found",
    )

    served = create([burger(), cola()], 2)["order_id"]
    rec.call(
        "PUT /orders/{order_id}/ready", f"/orders/{served}/ready", as_role="cashier", record=False
    )
    rec.call("PUT /orders/{order_id}/served", f"/orders/{served}/served", as_role="cashier")

    done = create([cola()], 1, payment_method="cash")["order_id"]
    rec.call(
        "PUT /orders/{order_id}/pay",
        f"/orders/{done}/pay",
        body={"payment_method": "card"},
        as_role="cashier",
    )
    rec.call("PUT /orders/{order_id}/done", f"/orders/{done}/done", as_role="cashier")

    deleted = create([burger()], 2)["order_id"]
    rec.call("DELETE /orders/{order_id}", f"/orders/{deleted}", as_role="cashier")

    cancelled = [create([cola()], 3)["order_id"] for _ in range(3)]
    cancel_query = {"cashier": "cashier"}
    rec.call(
        "POST /orders/{order_id}/cancel",
        f"/orders/{cancelled[0]}/cancel",
        query=cancel_query,
        as_role="cashier",
    )
    rec.call(
        "POST /orders/{order_id}/cancel",
        f"/orders/{cancelled[1]}/cancel",
        query=cancel_query,
        as_role="cashier",
        record=False,
    )
    rec.call(
        "POST /orders/{order_id}/cancel",
        f"/orders/{cancelled[2]}/cancel",
        query=cancel_query,
        as_role="cashier",
        case="success:fraud-alert",
    )
    rec.call(
        "POST /orders/{order_id}/cancel",
        f"/orders/{cancelled[0]}/cancel",
        query=cancel_query,
        as_role="cashier",
        case="failure:already-cancelled",
    )

    back_to_preparing = create([burger()], 1)["order_id"]
    rec.call(
        "PUT /orders/{order_id}/ready",
        f"/orders/{back_to_preparing}/ready",
        as_role="cashier",
        record=False,
    )
    rec.call(
        "PUT /orders/{order_id}/preparing",
        f"/orders/{back_to_preparing}/preparing",
        as_role="cashier",
    )

    # Edit the order that went back to preparing, not the first one: the legacy edit route drops
    # the lines' modifiers, and the first element of GET /orders should keep the full line shape.
    edit = {"items": [burger(), burger()], "table_number": 3, "notes": "تعديل: برجرين"}
    rec.call("PUT /orders/{order_id}", f"/orders/{back_to_preparing}", body=edit, as_role="cashier")
    rec.call(
        "PUT /orders/{order_id}",
        f"/orders/{served}",
        body=edit,
        as_role="cashier",
        case="failure:not-preparing",
    )
    create([menu_line("باستا", 6000, "وجبات")], 2, record=True, case="failure:insufficient-stock")

    rec.call("GET /orders", "/orders", as_role="cashier")
    rec.call("POST /heartbeat", "/heartbeat", as_role="cashier")
    rec.call("GET /restaurant/status", "/restaurant/status")
    rec.call(
        "POST /orders/qr-create",
        "/orders/qr-create",
        body={"table_number": 2, "items": [cola()], "notes": ""},
    )
    return {"done": done}


def record_reads_and_cleanup(rec: Recorder, ids: dict, order_ids: dict) -> None:
    rec.call("GET /menu", "/menu", as_role="admin")
    rec.call("GET /menu", "/menu", as_role="invalid", case="failure:invalid-token")
    rec.call(
        "GET /menu",
        "/menu",
        as_role="admin",
        headers={"X-Restaurant-Id": "2"},
        case="failure:foreign-restaurant-header",
    )
    rec.call(
        "GET /menu",
        "/menu",
        as_role="super_admin",
        headers={"X-Restaurant-Id": "2"},
        case="success:super-admin-selects-restaurant",
    )
    rec.call(
        "POST /inventory/deduct/{order_id}",
        f"/inventory/deduct/{order_ids['done']}",
        as_role="admin",
    )
    rec.call("GET /inventory", "/inventory", as_role="admin")
    rec.call("DELETE /inventory/{item_id}", f"/inventory/{ids['tomato']}", as_role="admin")
    rec.call(
        "DELETE /inventory/{item_id}", "/inventory/9999", as_role="admin", case="failure:not-found"
    )


def record_platform_admin(rec: Recorder) -> None:
    rec.call("GET /admin/restaurants", "/admin/restaurants", as_role="super_admin")
    rec.call("GET /admin/restaurants", "/admin/restaurants", case="failure:no-token")
    rec.call(
        "GET /admin/restaurants",
        "/admin/restaurants",
        as_role="admin",
        case="failure:not-super-admin",
    )
    status_path = "/admin/restaurants/2/status"
    rec.call(
        "POST /admin/restaurants/{restaurant_id}/status",
        status_path,
        body={"status": "closed"},
        as_role="super_admin",
        case="failure:invalid-status",
    )
    rec.call(
        "POST /admin/restaurants/{restaurant_id}/status",
        "/admin/restaurants/9999/status",
        body={"status": "active"},
        as_role="super_admin",
        case="failure:not-found",
    )
    rec.call(
        "POST /admin/restaurants/{restaurant_id}/status",
        status_path,
        body={"status": "suspended"},
        as_role="super_admin",
    )
    rec.call(
        "POST /login",
        "/login",
        body={"email": NEW_OWNER[0], "password": NEW_OWNER[1]},
        case="failure:restaurant-suspended",
    )
    rec.call(
        "GET /menu", "/menu", as_role="restaurant_2_owner", case="failure:restaurant-suspended"
    )


def record_agent(rec: Recorder) -> None:
    # No real key: the recorded shape is the legacy error path, {"error": <provider text>}.
    query = {"question": "كم مبيعات اليوم؟", "api_key": "sk-invalid"}
    rec.call("POST /agent/ask", "/agent/ask", query=query, as_role="admin")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base-url", default="http://127.0.0.1:8001")
    parser.add_argument("--out", type=Path, default=LEGACY_GOLDEN_DIR)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    for stale in args.out.glob("*.json"):
        stale.unlink()

    rec = Recorder(args.base_url, args.out)
    record_sessions(rec)
    ids = record_menu_and_inventory(rec)
    record_modifiers(rec, ids)
    record_layout(rec)
    order_ids = record_orders(rec, ids)
    record_reads_and_cleanup(rec, ids, order_ids)
    record_platform_admin(rec)
    record_agent(rec)

    recorded = sorted(args.out.glob("*.json"))
    covered = {json.loads(f.read_text(encoding="utf-8"))["route"] for f in recorded}
    print(f"\n{len(recorded)} fixtures, {len(covered)}/{len(LEGACY_ROUTES)} routes covered")
    missing = [route for route in LEGACY_ROUTES if route not in covered]
    if missing:
        raise SystemExit(f"routes without a fixture: {missing}")


if __name__ == "__main__":
    main()

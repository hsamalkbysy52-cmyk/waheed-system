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

from tests.golden import LEGACY_GOLDEN_DIR, LEGACY_ROUTES, Golden, fixture_name, split_route

ADMIN = ("admin@restaurant1.local.placeholder", "admin123")
CASHIER = ("cashier@restaurant1.local.placeholder", "cashier123")
SUPER_ADMIN = ("superadmin@platform.local.placeholder", "superadmin123")
NEW_OWNER = ("owner@shawarma-house.example", "secret123")

# Idempotency keys for the Orders created below, fixed so a re-run records the same requests.
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
        method = split_route(route)[0]
        full_path = path + ("?" + urlencode(query) if query else "")
        sent_headers = {}
        if body is not None:
            sent_headers["Content-Type"] = "application/json"
        if as_role:
            sent_headers["Authorization"] = f"Bearer {self.tokens[as_role]}"
        sent_headers.update(headers or {})
        status, response = self._send(method, full_path, body, sent_headers)
        if record:
            redacted_headers = {**sent_headers}
            if as_role:
                redacted_headers["Authorization"] = f"Bearer <{as_role}>"
            redacted_response = {**response, "token": "<jwt>"} if "token" in response else response
            self._write(
                Golden(
                    name=fixture_name(route, case).removesuffix(".json"),
                    route=route,
                    case=case,
                    method=method,
                    path=full_path,
                    headers=redacted_headers,
                    body=body,
                    status=status,
                    response=redacted_response,
                )
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

    def _write(self, golden: Golden) -> None:
        target = self.out_dir / f"{golden.name}.json"
        if target.exists():
            raise FileExistsError(
                f"{target.name} recorded twice; give the second call its own case"
            )
        document = json.dumps(golden.to_fixture(), ensure_ascii=False, indent=2) + "\n"
        target.write_text(document, encoding="utf-8")
        print(f"  {golden.status} {golden.method} {golden.path} -> {target.name}")


def order_line(name: str, price: float, category: str, modifiers: Optional[list] = None) -> dict:
    """One Order line as the frontend sends it: one entry per unit, price captured at order time."""
    return {"name": name, "price": price, "category": category, "modifiers": modifiers or []}


def burger(modifiers: Optional[list] = None) -> dict:
    return order_line("برجر", 5000, "وجبات", modifiers)


def cola() -> dict:
    return order_line("كولا", 1500, "مشروبات")


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


def record_customer_ordering_while_offline(rec: Recorder) -> None:
    """Customer orders are refused until a cashier device has sent a Heartbeat."""
    rec.call(
        "POST /orders/qr-create",
        "/orders/qr-create",
        body={"table_number": 2, "items": [burger()], "notes": ""},
        case="failure:restaurant-offline",
    )


def record_menu(rec: Recorder, state: dict) -> None:
    variant = {"name": "برجر دبل", "price": 7000, "category": "وجبات", "description": "قطعتين لحم"}
    state["variant"] = rec.call(
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
    rec.call(
        "PUT /menu/{item_id}", f"/menu/{state['variant']}", body=edited_variant, as_role="admin"
    )
    rec.call(
        "PUT /menu/{item_id}",
        "/menu/9999",
        body=edited_variant,
        as_role="admin",
        case="failure:not-found",
    )
    rec.call("DELETE /menu/{item_id}", f"/menu/{throwaway}", as_role="admin")
    rec.call("PUT /menu/{item_id}/toggle", "/menu/6/toggle", as_role="admin")  # شاي goes off sale


def record_inventory(rec: Recorder, state: dict) -> None:
    def add(name: str, unit: str, quantity: float, minimum: float, record: bool) -> int:
        body = {"name": name, "unit": unit, "quantity": quantity, "min_quantity": minimum}
        return rec.call(
            "POST /inventory/add", "/inventory/add", body=body, as_role="admin", record=record
        )["id"]

    state["meat"] = add("لحم", "كغم", 20, 5, record=True)
    state["bread"] = add("خبز", "قطعة", 50, 10, record=False)
    state["cheese"] = add("جبن", "شريحة", 3, 10, record=False)  # Low stock
    state["tomato"] = add("طماطم", "كغم", 1, 2, record=False)  # makes باستا Out of stock
    meat_edit = {"name": "لحم بقري", "unit": "كغم", "quantity": 20, "min_quantity": 5}
    rec.call(
        "PUT /inventory/{item_id}", f"/inventory/{state['meat']}", body=meat_edit, as_role="admin"
    )
    rec.call(
        "PUT /inventory/{item_id}",
        "/inventory/9999",
        body=meat_edit,
        as_role="admin",
        case="failure:not-found",
    )


def record_recipes(rec: Recorder, state: dict) -> None:
    burger_recipe = {
        "ingredients": [
            {"inventory_item_id": state["meat"], "amount": 0.2},
            {"inventory_item_id": state["bread"], "amount": 1},
        ]
    }
    route = "POST /inventory/recipe/{menu_item_id}"
    rec.call(route, "/inventory/recipe/1", body=burger_recipe, as_role="admin")
    pasta_recipe = {"ingredients": [{"inventory_item_id": state["tomato"], "amount": 2}]}
    rec.call(route, "/inventory/recipe/3", body=pasta_recipe, as_role="admin", record=False)
    rec.call(
        route,
        "/inventory/recipe/9999",
        body=burger_recipe,
        as_role="admin",
        case="failure:menu-item-not-found",
    )
    rec.call("GET /inventory/recipe/{menu_item_id}", "/inventory/recipe/1", as_role="admin")


def record_modifiers(rec: Recorder, state: dict) -> None:
    groups_path = "/menu/1/modifiers/groups"
    group_route, option_route = (
        "POST /menu/{item_id}/modifiers/groups",
        "POST /modifiers/groups/{group_id}/options",
    )
    group = rec.call(
        group_route, groups_path, body={"name": "إضافات", "max_selections": 2}, as_role="admin"
    )["id"]
    options_path = f"/modifiers/groups/{group}/options"
    extra_cheese = {
        "name": "جبن إضافي",
        "price_delta": 500,
        "inventory_item_id": state["cheese"],
        "quantity_delta": 1,
    }
    no_bread = {
        "name": "بدون خبز",
        "price_delta": 0,
        "inventory_item_id": state["bread"],
        "quantity_delta": -1,
    }
    extra_cheese_id = rec.call(option_route, options_path, body=extra_cheese, as_role="admin")["id"]
    no_bread_id = rec.call(
        option_route, options_path, body=no_bread, as_role="admin", record=False
    )["id"]
    rec.call(
        option_route,
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
        f"/modifiers/options/{extra_cheese_id}",
        body={"name": "جبن إضافي", "price_delta": 750},
        as_role="admin",
    )
    # The option as an Order line carries it after the edit above.
    state["extra_cheese_option"] = {**extra_cheese, "price_delta": 750}
    rec.call(
        "PUT /menu/{item_id}/modifiers/groups/reorder",
        f"{groups_path}/reorder",
        body={"order": [group]},
        as_role="admin",
    )
    rec.call(
        "PUT /modifiers/groups/{group_id}/options/reorder",
        f"{options_path}/reorder",
        body={"order": [no_bread_id, extra_cheese_id]},
        as_role="admin",
    )

    size_group = rec.call(
        group_route, groups_path, body={"name": "الحجم"}, as_role="admin", record=False
    )["id"]
    size_options = f"/modifiers/groups/{size_group}/options"
    big = {"name": "كبير", "price_delta": 1000}
    rec.call(option_route, size_options, body=big, as_role="admin", record=False)
    small = rec.call(
        option_route, size_options, body={"name": "صغير"}, as_role="admin", record=False
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


def record_orders(rec: Recorder, state: dict) -> None:
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

    def cancel(order_id: int, case: str = "success", record: bool = True) -> None:
        rec.call(
            "POST /orders/{order_id}/cancel",
            f"/orders/{order_id}/cancel",
            query={"cashier": "cashier"},
            as_role="cashier",
            case=case,
            record=record,
        )

    first = {
        "items": [burger([state["extra_cheese_option"]]), cola()],
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
    state["done_order"] = done

    deleted = create([burger()], 2)["order_id"]
    rec.call("DELETE /orders/{order_id}", f"/orders/{deleted}", as_role="cashier")

    cancelled = [create([cola()], 3)["order_id"] for _ in range(3)]
    cancel(cancelled[0])
    cancel(cancelled[1], record=False)
    cancel(cancelled[2], case="success:fraud-alert")  # third cancellation within the hour
    cancel(cancelled[0], case="failure:already-cancelled")

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
    create([order_line("باستا", 6000, "وجبات")], 2, record=True, case="failure:insufficient-stock")
    rec.call("GET /orders", "/orders", as_role="cashier")


def record_customer_channel(rec: Recorder) -> None:
    rec.call("POST /heartbeat", "/heartbeat", as_role="cashier")
    rec.call("GET /restaurant/status", "/restaurant/status")
    customer_order = {"table_number": 2, "items": [cola()], "notes": ""}
    rec.call("POST /orders/qr-create", "/orders/qr-create", body=customer_order)


def record_menu_reads(rec: Recorder) -> None:
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


def record_inventory_reads_and_cleanup(rec: Recorder, state: dict) -> None:
    deduct_path = f"/inventory/deduct/{state['done_order']}"
    rec.call("POST /inventory/deduct/{order_id}", deduct_path, as_role="admin")
    rec.call("GET /inventory", "/inventory", as_role="admin")
    rec.call("DELETE /inventory/{item_id}", f"/inventory/{state['tomato']}", as_role="admin")
    rec.call(
        "DELETE /inventory/{item_id}",
        "/inventory/9999",
        as_role="admin",
        case="failure:not-found",
    )


def record_super_admin(rec: Recorder) -> None:
    rec.call("GET /admin/restaurants", "/admin/restaurants", as_role="super_admin")
    rec.call("GET /admin/restaurants", "/admin/restaurants", case="failure:no-token")
    rec.call(
        "GET /admin/restaurants",
        "/admin/restaurants",
        as_role="admin",
        case="failure:not-super-admin",
    )
    status_route = "POST /admin/restaurants/{restaurant_id}/status"
    status_path = "/admin/restaurants/2/status"
    rec.call(
        status_route,
        status_path,
        body={"status": "closed"},
        as_role="super_admin",
        case="failure:invalid-status",
    )
    rec.call(
        status_route,
        "/admin/restaurants/9999/status",
        body={"status": "active"},
        as_role="super_admin",
        case="failure:not-found",
    )
    rec.call(status_route, status_path, body={"status": "suspended"}, as_role="super_admin")
    rec.call(
        "POST /login",
        "/login",
        body={"email": NEW_OWNER[0], "password": NEW_OWNER[1]},
        case="failure:restaurant-suspended",
    )
    rec.call(
        "GET /menu", "/menu", as_role="restaurant_2_owner", case="failure:restaurant-suspended"
    )


def record_report_agent(rec: Recorder) -> None:
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
    state: dict[str, Any] = {}
    record_sessions(rec)
    record_customer_ordering_while_offline(rec)
    record_menu(rec, state)
    record_inventory(rec, state)
    record_recipes(rec, state)
    record_modifiers(rec, state)
    record_layout(rec)
    record_orders(rec, state)
    record_customer_channel(rec)
    record_menu_reads(rec)
    record_inventory_reads_and_cleanup(rec, state)
    record_super_admin(rec)
    record_report_agent(rec)

    recorded = sorted(args.out.glob("*.json"))
    covered = {json.loads(f.read_text(encoding="utf-8"))["route"] for f in recorded}
    print(f"\n{len(recorded)} fixtures, {len(covered)}/{len(LEGACY_ROUTES)} routes covered")
    missing = [route for route in LEGACY_ROUTES if route not in covered]
    if missing:
        raise SystemExit(f"routes without a fixture: {missing}")


if __name__ == "__main__":
    main()

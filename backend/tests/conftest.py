"""Shared fixtures for the HTTP tests.

Every test drives an endpoint through Django's test client. Restaurants are provisioned the way
registration provisions them (schema, Domain row) and staff tokens are obtained through
``POST /login``, so a fixture never hands a test something the API could not have produced.

django-tenants' ``TenantClient`` is deliberately not used: it selects the Restaurant from the
request hostname, which ADR-0001 rejects. Our middleware reads the JWT, the super-admin header or
the Slug, and the fixtures pass exactly those, the way the frontend does.
"""

import pytest
from django.db import connection

from accounts.models import Role, User
from messaging.senders import RecordingSender
from tenants.services import provision_restaurant


@pytest.fixture(autouse=True)
def _public_schema():
    """Requests leave the connection on the last Restaurant's schema; start every test on public."""
    connection.set_schema_to_public()
    yield
    connection.set_schema_to_public()


@pytest.fixture(autouse=True)
def _no_messages_from_earlier_tests():
    """The recording sender is process-wide; every test starts with an empty outbox."""
    RecordingSender.reset()
    yield
    RecordingSender.reset()


PASSWORD = "secret123"
ADMIN_PASSWORD = "admin123"  # the demo Admin's password, as the login golden records it


def make_user(email: str, password: str, **fields) -> User:
    """A user who remembers the password they were given, so ``login`` can sign them in."""
    user = User.objects.create_user(email, password, **fields)
    user.plain_password = password  # test-only attribute, never persisted
    return user


def sign_in(client, email: str, password: str) -> dict:
    """The body of a successful ``POST /login``."""
    response = client.post(
        "/login", {"email": email, "password": password}, content_type="application/json"
    )
    assert response.status_code == 200, response.content
    return response.json()


@pytest.fixture
def restaurant(db):
    """The demo Restaurant the goldens were recorded against, provisioned like a registration."""
    connection.set_schema_to_public()  # an earlier fixture's request may have left a schema set
    return provision_restaurant("Waheed Restaurant", slug="waheed", email="", phone="")


@pytest.fixture
def other_restaurant(db):
    """A second Restaurant, for every test that must prove one cannot reach the other."""
    connection.set_schema_to_public()
    return provision_restaurant("Shawarma House", slug="r-other", email="", phone="")


@pytest.fixture
def admin(restaurant):
    return make_user(
        "admin@restaurant1.local.placeholder",
        ADMIN_PASSWORD,
        username="admin",
        role=Role.ADMIN,
        restaurant=restaurant,
    )


@pytest.fixture
def cashier(restaurant):
    return make_user(
        "cashier@restaurant1.local.placeholder",
        PASSWORD,
        username="cashier",
        role=Role.CASHIER,
        restaurant=restaurant,
    )


@pytest.fixture
def other_admin(other_restaurant):
    return make_user(
        "owner@shawarma-house.example",
        PASSWORD,
        username="owner@shawarma-house.example",
        role=Role.ADMIN,
        restaurant=other_restaurant,
    )


@pytest.fixture
def super_admin(db):
    return make_user(
        "superadmin@platform.local.placeholder",
        PASSWORD,
        username="superadmin",
        role=Role.SUPER_ADMIN,
        restaurant=None,
    )


@pytest.fixture
def login(client):
    """``login(user)``: that user's ``Authorization`` header, obtained through ``POST /login``."""

    def _login(user) -> dict:
        session = sign_in(client, user.email, user.plain_password)
        return {"Authorization": f"Bearer {session['token']}"}

    return _login


def set_status_via_console(client, auth: dict, restaurant, status: str) -> dict:
    """Set a Restaurant's status through the Super admin console route, and return its body."""
    response = client.post(
        f"/admin/restaurants/{restaurant.pk}/status",
        {"status": status},
        content_type="application/json",
        headers=auth,
    )
    assert response.status_code == 200, response.content
    return response.json()


@pytest.fixture
def suspend(client, super_admin, login):
    """``suspend(restaurant)``: suspended the way the Super admin does it, through the console."""

    def _suspend(restaurant) -> None:
        set_status_via_console(client, login(super_admin), restaurant, "suspended")

    return _suspend


# --- menu setup, built through the API so a fixture never creates what a route could not ------

DEMO_ITEMS = (
    ("برجر", 5, "وجبات"),
    ("بيتزا", 8, "وجبات"),
    ("باستا", 6, "وجبات"),
    ("كولا", 1.5, "مشروبات"),
    ("عصير", 2, "مشروبات"),
    ("شاي", 1, "مشروبات"),
)


def add_menu_item(client, auth: dict, name: str, price, category: str, **fields) -> int:
    """``POST /menu/add``; returns the new Menu item's id."""
    body = {"name": name, "price": price, "category": category, **fields}
    response = client.post("/menu/add", body, content_type="application/json", headers=auth)
    assert response.status_code == 200, response.content
    return response.json()["id"]


def add_modifier_group(client, auth: dict, item_id: int, name: str, max_selections: int) -> int:
    response = client.post(
        f"/menu/{item_id}/modifiers/groups",
        {"name": name, "max_selections": max_selections},
        content_type="application/json",
        headers=auth,
    )
    assert response.status_code == 200, response.content
    return response.json()["id"]


def add_modifier_option(client, auth: dict, group_id: int, **option) -> int:
    response = client.post(
        f"/modifiers/groups/{group_id}/options",
        option,
        content_type="application/json",
        headers=auth,
    )
    assert response.status_code == 200, response.content
    return response.json()["id"]


# The Inventory the goldens were recorded with: جبن is Low stock, طماطم makes باستا Out of stock.
DEMO_INVENTORY = (
    ("لحم بقري", "كغم", 20, 5),
    ("خبز", "قطعة", 50, 10),
    ("جبن", "شريحة", 3, 10),
    ("طماطم", "كغم", 1, 2),
)


def add_inventory_item(client, auth: dict, name: str, unit: str, quantity, min_quantity) -> int:
    """``POST /inventory/add``; returns the new Inventory item's id."""
    body = {"name": name, "unit": unit, "quantity": quantity, "min_quantity": min_quantity}
    response = client.post("/inventory/add", body, content_type="application/json", headers=auth)
    assert response.status_code == 200, response.content
    return response.json()["id"]


def save_recipe(client, auth: dict, menu_item_id: int, ingredients: list) -> None:
    """``POST /inventory/recipe/{menu_item_id}``; ``ingredients`` is ``[(inventory_id, amount)]``
    and replaces the whole Recipe."""
    body = {
        "ingredients": [
            {"inventory_item_id": inventory_id, "amount": amount}
            for inventory_id, amount in ingredients
        ]
    }
    response = client.post(
        f"/inventory/recipe/{menu_item_id}", body, content_type="application/json", headers=auth
    )
    assert response.status_code == 200, response.content


@pytest.fixture
def demo_menu(client, admin, login):
    """The menu the goldens were recorded with: six items, a Variant, a Modifier group, شاي off,
    four Inventory items, and Recipes for برجر (50 servings) and باستا (Out of stock).

    Returns the ids by name, so tests name what they act on instead of counting rows.
    """
    auth = login(admin)
    ids = {
        name: add_inventory_item(client, auth, name, unit, quantity, minimum)
        for name, unit, quantity, minimum in DEMO_INVENTORY
    }
    ids.update(
        (name, add_menu_item(client, auth, name, price, category))
        for name, price, category in DEMO_ITEMS
    )
    ids["برجر دبل"] = add_menu_item(
        client, auth, "برجر دبل", 7.5, "وجبات", description="قطعتين لحم", parent_id=ids["برجر"]
    )
    ids["الإضافات"] = add_modifier_group(client, auth, ids["برجر"], "الإضافات", 3)
    ids["بدون خبز"] = add_modifier_option(
        client,
        auth,
        ids["الإضافات"],
        name="بدون خبز",
        price_delta=0,
        inventory_item_id=ids["خبز"],
        quantity_delta=-1,
    )
    ids["جبن إضافي"] = add_modifier_option(
        client,
        auth,
        ids["الإضافات"],
        name="جبن إضافي",
        price_delta=0.75,
        inventory_item_id=ids["جبن"],
        quantity_delta=1,
    )
    save_recipe(client, auth, ids["برجر"], [(ids["لحم بقري"], 0.2), (ids["خبز"], 1)])
    save_recipe(client, auth, ids["باستا"], [(ids["طماطم"], 2)])
    client.put(f"/menu/{ids['شاي']}/toggle", headers=auth)
    return ids


# --- orders, built through the API -----------------------------------------------------------


def order_line(name: str, price, category: str = "", modifiers: tuple = ()) -> dict:
    """One Order line as the order drawer sends it: one entry per unit, price with the chosen
    options' deltas folded in, and the options themselves for the kitchen and the stock."""
    return {"name": name, "price": price, "category": category, "modifiers": list(modifiers)}


def modifier_line(name: str, price_delta, inventory_item_id, quantity_delta) -> dict:
    return {
        "name": name,
        "price_delta": price_delta,
        "inventory_item_id": inventory_item_id,
        "quantity_delta": quantity_delta,
    }


def create_order(client, auth: dict, items: list, **fields) -> dict:
    """``POST /orders/create``; returns the response body (``message``, ``total``, ``order_id``)."""
    response = client.post(
        "/orders/create", {"items": items, **fields}, content_type="application/json", headers=auth
    )
    assert response.status_code == 200, response.content
    return response.json()


def orders_of(client, auth: dict) -> list:
    response = client.get("/orders", headers=auth)
    assert response.status_code == 200, response.content
    return response.json()["orders"]


def order_by_id(client, auth: dict, order_id: int) -> dict:
    return next(order for order in orders_of(client, auth) if order["id"] == order_id)


def stock_of(client, auth: dict) -> dict:
    """Inventory quantities by name, for asserting what an Order took or gave back."""
    response = client.get("/inventory", headers=auth)
    assert response.status_code == 200, response.content
    return {item["name"]: item["quantity"] for item in response.json()["items"]}

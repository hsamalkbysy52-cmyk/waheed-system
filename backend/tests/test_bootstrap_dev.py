"""``manage.py bootstrap_dev``: the idempotent demo seed (plan §7; spec story 49).

Isolation matrix item 8, second leg: on a database that holds nothing, the seed plus the API's own
routes bring up a working Restaurant with its three demo accounts. What the seed created is
asserted through the API, never by reading its output, and the credentials are spelled out here
rather than imported, so a change to the command's own constants cannot make these tests pass.
"""

from io import StringIO
from typing import NamedTuple

import pytest
from django.core.management import call_command

from tests.conftest import sign_in

pytestmark = pytest.mark.django_db


class Account(NamedTuple):
    email: str
    password: str
    username: str
    role: str


# Plan §7: the credentials the frontend's login screen is demonstrated with.
ADMIN = Account("admin@restaurant1.local.placeholder", "admin123", "admin", "admin")
CASHIER = Account("cashier@restaurant1.local.placeholder", "cashier123", "cashier", "cashier")
SUPER_ADMIN = Account(
    "superadmin@platform.local.placeholder", "superadmin123", "superadmin", "super_admin"
)
DEMO_ACCOUNTS = (ADMIN, CASHIER, SUPER_ADMIN)


def bootstrap() -> str:
    output = StringIO()
    call_command("bootstrap_dev", stdout=output)
    return output.getvalue()


def signed_in(client, account: Account) -> dict:
    """That account's ``Authorization`` header, obtained through ``POST /login``."""
    return {"Authorization": f"Bearer {sign_in(client, account.email, account.password)['token']}"}


def listed_restaurants(client, account: Account) -> list:
    return client.get("/admin/restaurants", headers=signed_in(client, account)).json()[
        "restaurants"
    ]


@pytest.fixture
def seeded(db):
    return bootstrap()


@pytest.mark.parametrize("account", DEMO_ACCOUNTS, ids=lambda account: account.role)
def test_every_demo_account_signs_in(client, seeded, account):
    session = sign_in(client, account.email, account.password)

    assert session["role"] == account.role
    assert session["username"] == account.username


def test_the_demo_restaurant_carries_the_jordan_defaults(client, seeded):
    me = client.get("/me", headers=signed_in(client, ADMIN)).json()

    assert me["restaurant"] == {
        "name": "Waheed Restaurant",
        "slug": "waheed",
        "currency": "JOD",
        "timezone": "Asia/Amman",
    }


def test_the_seeded_super_admin_runs_the_console(client, seeded):
    listed = client.get("/admin/restaurants", headers=signed_in(client, SUPER_ADMIN))

    assert listed.status_code == 200
    assert [row["name"] for row in listed.json()["restaurants"]] == ["Waheed Restaurant"]


def test_seeding_twice_leaves_one_restaurant_and_working_accounts(client, seeded):
    bootstrap()

    assert len(listed_restaurants(client, SUPER_ADMIN)) == 1
    assert sign_in(client, CASHIER.email, CASHIER.password)["role"] == "cashier"


def test_the_seed_leaves_registered_restaurants_alone(client, db):
    body = {
        "restaurant_name": "Shawarma House",
        "phone": "",
        "email": "owner@shawarma-house.example",
        "password": "secret123",
    }
    client.post("/register", body, content_type="application/json")

    bootstrap()

    assert {row["name"] for row in listed_restaurants(client, SUPER_ADMIN)} == {
        "Waheed Restaurant",
        "Shawarma House",
    }


def test_the_seed_creates_the_demo_menu_with_its_modifier_group(client, seeded):
    menu = client.get("/menu", headers=signed_in(client, ADMIN)).json()["menu"]

    assert [dish["name"] for dish in menu] == ["برجر", "بيتزا", "باستا", "كولا", "عصير", "شاي"]
    burger = menu[0]
    assert burger["price"] == 5
    assert [group["name"] for group in burger["modifiers"]] == ["الإضافات"]
    assert [option["name"] for option in burger["modifiers"][0]["options"]] == [
        "بدون خبز",
        "جبن إضافي",
    ]


def test_a_customer_reads_the_seeded_menu_by_slug(client, seeded):
    """A fresh machine can serve the table QR flow straight after the seed."""
    response = client.get("/menu?r=waheed")

    assert response.status_code == 200
    assert len(response.json()["menu"]) == 6


def test_seeding_twice_leaves_one_menu(client, seeded):
    bootstrap()

    menu = client.get("/menu", headers=signed_in(client, ADMIN)).json()["menu"]
    assert len(menu) == 6
    assert len(menu[0]["modifiers"]) == 1

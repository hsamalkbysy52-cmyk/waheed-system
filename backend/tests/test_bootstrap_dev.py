"""``manage.py bootstrap_dev``: the idempotent demo seed (plan §7; spec story 49).

Isolation matrix item 8, second leg: on a database that holds nothing, the seed plus the API's own
routes bring up a working Restaurant with its three demo accounts. What the seed created is
asserted through the API, never by reading its output.
"""

from io import StringIO

import pytest
from django.core.management import call_command

from tests.conftest import sign_in

pytestmark = pytest.mark.django_db

# Plan §7: the credentials the frontend's login screen is demonstrated with.
DEMO_ACCOUNTS = [
    ("admin@restaurant1.local.placeholder", "admin123", "admin", "admin"),
    ("cashier@restaurant1.local.placeholder", "cashier123", "cashier", "cashier"),
    ("superadmin@platform.local.placeholder", "superadmin123", "superadmin", "super_admin"),
]


def bootstrap() -> str:
    output = StringIO()
    call_command("bootstrap_dev", stdout=output)
    return output.getvalue()


@pytest.fixture
def seeded(db):
    return bootstrap()


@pytest.mark.parametrize(("email", "password", "username", "role"), DEMO_ACCOUNTS)
def test_every_demo_account_signs_in(client, seeded, email, password, username, role):
    session = sign_in(client, email, password)

    assert session["role"] == role
    assert session["username"] == username


def test_the_demo_restaurant_carries_the_jordan_defaults(client, seeded):
    email, password = DEMO_ACCOUNTS[0][:2]
    session = sign_in(client, email, password)

    me = client.get("/me", headers={"Authorization": f"Bearer {session['token']}"}).json()

    assert me["restaurant"] == {
        "name": "Waheed Restaurant",
        "slug": "waheed",
        "currency": "JOD",
        "timezone": "Asia/Amman",
    }


def test_the_seeded_super_admin_runs_the_console(client, seeded):
    email, password = DEMO_ACCOUNTS[2][:2]
    session = sign_in(client, email, password)

    listed = client.get(
        "/admin/restaurants", headers={"Authorization": f"Bearer {session['token']}"}
    )

    assert listed.status_code == 200
    assert [row["name"] for row in listed.json()["restaurants"]] == ["Waheed Restaurant"]


def test_seeding_twice_leaves_one_restaurant_and_working_accounts(client, seeded):
    bootstrap()

    email, password = DEMO_ACCOUNTS[2][:2]
    session = sign_in(client, email, password)
    listed = client.get(
        "/admin/restaurants", headers={"Authorization": f"Bearer {session['token']}"}
    ).json()

    assert len(listed["restaurants"]) == 1
    assert sign_in(client, DEMO_ACCOUNTS[1][0], DEMO_ACCOUNTS[1][1])["role"] == "cashier"


def test_the_seed_leaves_registered_restaurants_alone(client, db):
    body = {
        "restaurant_name": "Shawarma House",
        "phone": "",
        "email": "owner@shawarma-house.example",
        "password": "secret123",
    }
    client.post("/register", body, content_type="application/json")

    bootstrap()

    session = sign_in(client, DEMO_ACCOUNTS[2][0], DEMO_ACCOUNTS[2][1])
    listed = client.get(
        "/admin/restaurants", headers={"Authorization": f"Bearer {session['token']}"}
    ).json()
    assert {row["name"] for row in listed["restaurants"]} == {
        "Waheed Restaurant",
        "Shawarma House",
    }

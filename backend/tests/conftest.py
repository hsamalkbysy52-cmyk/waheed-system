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
from tenants.services import provision_restaurant


@pytest.fixture(autouse=True)
def _public_schema():
    """Requests leave the connection on the last Restaurant's schema; start every test on public."""
    connection.set_schema_to_public()
    yield
    connection.set_schema_to_public()


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
    return provision_restaurant("Waheed Restaurant", slug="waheed", email="", phone="")


@pytest.fixture
def other_restaurant(db):
    """A second Restaurant, for every test that must prove one cannot reach the other."""
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

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
from tenants.models import Restaurant
from tenants.services import provision_restaurant


@pytest.fixture(autouse=True)
def _public_schema():
    """Requests leave the connection on the last Restaurant's schema; start every test on public."""
    connection.set_schema_to_public()
    yield
    connection.set_schema_to_public()


PASSWORD = "secret123"


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
    return User.objects.create_user(
        "admin@restaurant1.local.placeholder",
        "admin123",
        username="admin",
        role=Role.ADMIN,
        restaurant=restaurant,
    )


@pytest.fixture
def cashier(restaurant):
    return User.objects.create_user(
        "cashier@restaurant1.local.placeholder",
        PASSWORD,
        username="cashier",
        role=Role.CASHIER,
        restaurant=restaurant,
    )


@pytest.fixture
def other_admin(other_restaurant):
    return User.objects.create_user(
        "owner@shawarma-house.example",
        PASSWORD,
        username="owner@shawarma-house.example",
        role=Role.ADMIN,
        restaurant=other_restaurant,
    )


@pytest.fixture
def super_admin(db):
    return User.objects.create_user(
        "superadmin@platform.local.placeholder",
        PASSWORD,
        username="superadmin",
        role=Role.SUPER_ADMIN,
        restaurant=None,
    )


@pytest.fixture
def login(client):
    """``login(user)``: that user's ``Authorization`` header, obtained through ``POST /login``.

    The Admin fixture keeps the demo password the goldens use; every other fixture uses PASSWORD.
    """

    def _login(user, password=None):
        password = password or ("admin123" if user.username == "admin" else PASSWORD)
        response = client.post(
            "/login", {"email": user.email, "password": password}, content_type="application/json"
        )
        assert response.status_code == 200, response.content
        return {"Authorization": f"Bearer {response.json()['token']}"}

    return _login


def suspend(restaurant):
    """Suspension through the API is the Super admin console's job (ticket 04); tests set it up."""
    Restaurant.objects.filter(pk=restaurant.pk).update(status=Restaurant.Status.SUSPENDED)

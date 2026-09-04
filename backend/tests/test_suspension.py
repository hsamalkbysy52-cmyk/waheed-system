"""Suspension end to end (spec story 3; isolation matrix item 6): the Super admin suspends a
Restaurant through the console route, and staff, customers and sign-in are refused from the next
request on. Reactivation puts all three back.

The customer leg uses the customer probe (tests/probe_urls.py) until ``GET /menu`` arrives with
ticket 05; the refusal itself comes from the middleware, so the route only has to accept a Slug.
"""

import pytest

from tests.conftest import set_status, sign_in
from tests.golden import golden_error, legacy_golden, refusal

pytestmark = [pytest.mark.django_db, pytest.mark.urls("tests.probe_urls")]

SUSPENDED = refusal("هذا المطعم موقوف حالياً")
UNAVAILABLE = refusal("المطعم غير متاح حالياً")


@pytest.fixture
def console(client, super_admin, login):
    """The Super admin's ``Authorization`` header, obtained the way the frontend obtains it."""
    return login(super_admin)


def test_suspension_signs_the_staff_out_on_their_next_request(client, console, admin, login):
    headers = login(admin)
    assert client.get("/me", headers=headers).status_code == 200

    set_status(client, console, admin.restaurant, "suspended")

    refused = client.get("/me", headers=headers)
    assert refused.status_code == 403
    assert refused.json() == SUSPENDED


def test_suspension_refuses_the_restaurants_customers(client, console, restaurant):
    assert client.get("/_probe/customer?r=waheed").status_code == 200

    set_status(client, console, restaurant, "suspended")

    refused = client.get("/_probe/customer?r=waheed")
    assert refused.status_code == 403
    assert refused.json() == UNAVAILABLE


def test_suspension_refuses_sign_in_with_the_legacy_message(client, console, admin):
    golden = legacy_golden("POST /login", "failure:restaurant-suspended")
    set_status(client, console, admin.restaurant, "suspended")

    response = client.post(
        "/login",
        {"email": admin.email, "password": admin.plain_password},
        content_type="application/json",
    )

    assert response.status_code == 403
    assert response.json() == golden_error(golden)


def test_suspension_leaves_other_restaurants_alone(client, console, restaurant, other_admin):
    set_status(client, console, restaurant, "suspended")

    assert sign_in(client, other_admin.email, other_admin.plain_password)["role"] == "admin"
    assert client.get("/_probe/customer?r=r-other").status_code == 200


def test_reactivation_restores_staff_customers_and_sign_in(client, console, admin):
    set_status(client, console, admin.restaurant, "suspended")

    set_status(client, console, admin.restaurant, "active")

    session = sign_in(client, admin.email, admin.plain_password)
    signed_in = client.get("/me", headers={"Authorization": f"Bearer {session['token']}"})

    assert signed_in.status_code == 200
    assert signed_in.json()["restaurant"]["slug"] == "waheed"
    assert client.get("/_probe/customer?r=waheed").status_code == 200

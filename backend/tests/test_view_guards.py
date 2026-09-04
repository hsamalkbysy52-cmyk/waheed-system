"""The staff guard, through the probe route that stands in for the order routes (plan §3.4).

Everything else these probes used to prove now runs against real routes: the menu carries the
customer and Admin guards (tests/test_menu_access.py, tests/test_menu.py) and the Super admin
console carries the platform guard (tests/test_admin_restaurants.py).
"""

import pytest

from tests.golden import refusal

pytestmark = [pytest.mark.django_db, pytest.mark.urls("tests.probe_urls")]

NO_TOKEN = refusal("توكن غير موجود")


def test_staff_reach_their_restaurant_through_their_token(client, cashier, login):
    response = client.get("/_probe/staff", headers=login(cashier))

    assert response.status_code == 200
    assert response.json() == {
        "restaurant": "waheed",
        "source": "jwt",
        "schema": cashier.restaurant.schema_name,
    }


def test_an_admin_counts_as_staff(client, admin, login):
    assert client.get("/_probe/staff", headers=login(admin)).status_code == 200


def test_a_staff_route_without_a_token_is_refused(client, restaurant):
    response = client.get("/_probe/staff")

    assert response.status_code == 401
    assert response.json() == NO_TOKEN


def test_a_staff_route_refuses_slug_only_callers(client, restaurant):
    """Only the customer routes accept a Restaurant that a Slug, rather than a token, selected."""
    response = client.get("/_probe/staff", headers={"X-Restaurant-Slug": "waheed"})

    assert response.status_code == 401
    assert response.json() == NO_TOKEN


def test_a_super_admin_is_not_restaurant_staff(client, super_admin, restaurant, login):
    headers = {**login(super_admin), "X-Restaurant-Id": str(restaurant.pk)}

    response = client.get("/_probe/staff", headers=headers)

    assert response.status_code == 403
    assert response.json() == refusal("هذه العملية لموظفي المطعم فقط")


def test_register_is_a_platform_route(client, admin, login):
    """A signed-in staff member's token scopes the connection to their Restaurant, where a new
    Restaurant cannot be created; the platform routes refuse the call instead of failing inside."""
    body = {"restaurant_name": "X", "phone": "", "email": "x@example.com", "password": "secret123"}

    response = client.post("/register", body, content_type="application/json", headers=login(admin))

    assert response.status_code == 400
    assert response.json() == refusal("هذا المسار للمنصة فقط")

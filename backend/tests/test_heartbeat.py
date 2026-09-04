"""Heartbeat and the staff guard: route 18 (plan §1.3; spec story 38; plan §3.4).

Only a signed-in staff device keeps a Restaurant Online. The guard cases that used to run on the
probe route (tests/test_view_guards.py, now deleted) are asserted here on the real route.
"""

import re

import pytest

from tests.golden import assert_matches_golden, legacy_golden, refusal

pytestmark = pytest.mark.django_db

NO_TOKEN = refusal("توكن غير موجود")
STAFF_ONLY = refusal("هذه العملية لموظفي المطعم فقط")
ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def test_the_heartbeat_matches_the_golden(client, cashier, login):
    golden = legacy_golden("POST /heartbeat")

    response = client.post(golden.path, headers=login(cashier))

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert ISO_UTC.match(response.json()["last_heartbeat_at"])


def test_a_heartbeat_stamps_the_callers_restaurant(client, cashier, login, restaurant):
    assert restaurant.last_heartbeat_at is None

    client.post("/heartbeat", headers=login(cashier))

    restaurant.refresh_from_db()
    assert restaurant.last_heartbeat_at is not None
    assert restaurant.is_online is True


def test_an_admin_counts_as_staff(client, admin, login, restaurant):
    assert client.post("/heartbeat", headers=login(admin)).status_code == 200


def test_a_heartbeat_without_a_token_is_refused(client, restaurant):
    response = client.post("/heartbeat")

    assert response.status_code == 401
    assert response.json() == NO_TOKEN
    restaurant.refresh_from_db()
    assert restaurant.last_heartbeat_at is None


def test_a_heartbeat_refuses_slug_only_callers(client, restaurant):
    """Only the customer routes accept a Restaurant that a Slug, rather than a token, selected;
    otherwise anyone with a QR link could keep a Restaurant Online (plan §1.2, item 2)."""
    response = client.post("/heartbeat", headers={"X-Restaurant-Slug": "waheed"})

    assert response.status_code == 401
    assert response.json() == NO_TOKEN
    restaurant.refresh_from_db()
    assert restaurant.is_online is False


def test_a_super_admin_is_not_restaurant_staff(client, super_admin, restaurant, login):
    headers = {**login(super_admin), "X-Restaurant-Id": str(restaurant.pk)}

    response = client.post("/heartbeat", headers=headers)

    assert response.status_code == 403
    assert response.json() == STAFF_ONLY


def test_a_heartbeat_reaches_only_the_callers_restaurant(
    client, cashier, other_admin, login, restaurant, other_restaurant
):
    client.post("/heartbeat", headers=login(cashier))

    other_restaurant.refresh_from_db()
    assert other_restaurant.last_heartbeat_at is None


def test_a_suspended_restaurants_staff_cannot_keep_it_online(
    client, cashier, login, restaurant, suspend
):
    auth = login(cashier)
    suspend(restaurant)

    response = client.post("/heartbeat", headers=auth)

    assert response.status_code == 403
    assert response.json() == refusal("هذا المطعم موقوف حالياً")

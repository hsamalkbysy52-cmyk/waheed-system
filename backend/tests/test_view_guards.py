"""View guards through the probe routes (tests/probe_urls.py): the three decorators and the three
permission classes (plan §3.3, §3.4; isolation matrix items 3 and 5)."""

import pytest

from tests.conftest import suspend
from tests.golden import golden_error, legacy_golden, refusal

pytestmark = [pytest.mark.django_db, pytest.mark.urls("tests.probe_urls")]

NO_TOKEN = refusal("توكن غير موجود")
NO_RESTAURANT = refusal("المطعم غير محدد")


# --- staff routes: a token for the Restaurant ---------------------------------------------


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
    response = client.get("/_probe/staff", headers={"X-Restaurant-Slug": "waheed"})

    assert response.status_code == 401
    assert response.json() == NO_TOKEN


# --- admin-only routes ----------------------------------------------------------------------


def test_admin_routes_refuse_cashiers(client, cashier, login):
    response = client.get("/_probe/admin", headers=login(cashier))

    assert response.status_code == 403
    assert response.json() == refusal("هذه العملية لمدير المطعم فقط")


def test_admin_routes_admit_the_admin(client, admin, login):
    assert client.get("/_probe/admin", headers=login(admin)).status_code == 200


# --- customer routes: a Slug, or a token --------------------------------------------------


@pytest.mark.parametrize("how", ["header", "query"])
def test_customers_reach_a_restaurant_by_slug(client, other_restaurant, how):
    if how == "header":
        response = client.get("/_probe/customer", headers={"X-Restaurant-Slug": "r-other"})
    else:
        response = client.get("/_probe/customer?r=r-other")

    assert response.status_code == 200
    assert response.json() == {
        "restaurant": "r-other",
        "source": "slug",
        "schema": other_restaurant.schema_name,
    }


def test_staff_may_use_customer_routes_with_their_token(client, cashier, login):
    response = client.get("/_probe/customer", headers=login(cashier))

    assert response.status_code == 200
    assert response.json()["source"] == "jwt"


def test_a_customer_route_without_a_slug_is_refused(client, restaurant):
    """Isolation matrix item 3: the "no token means Restaurant 1" bridge is gone."""
    response = client.get("/_probe/customer")

    assert response.status_code == 400
    assert response.json() == NO_RESTAURANT


def test_an_unknown_slug_is_not_found(client, restaurant):
    response = client.get("/_probe/customer?r=nobody")

    assert response.status_code == 404
    assert response.json() == refusal("المطعم غير موجود")


def test_a_suspended_restaurant_is_unavailable_to_customers(client, other_restaurant):
    suspend(other_restaurant)

    response = client.get("/_probe/customer?r=r-other")

    assert response.status_code == 403
    assert response.json() == refusal("المطعم غير متاح حالياً")


# --- super admin: platform scope, or one named Restaurant -----------------------------------


def test_a_super_admin_must_name_a_restaurant_to_use_a_tenant_route(client, super_admin, login):
    """Isolation matrix item 5, first half."""
    response = client.get("/_probe/customer", headers=login(super_admin))

    assert response.status_code == 400
    assert response.json() == NO_RESTAURANT


def test_a_super_admin_reaches_the_restaurant_named_in_the_header(
    client, super_admin, other_restaurant, login
):
    """Isolation matrix item 5, second half."""
    headers = {**login(super_admin), "X-Restaurant-Id": str(other_restaurant.pk)}

    response = client.get("/_probe/customer", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "restaurant": "r-other",
        "source": "super_admin",
        "schema": other_restaurant.schema_name,
    }


def test_platform_routes_admit_super_admins_at_platform_scope(client, super_admin, login):
    response = client.get("/_probe/platform", headers=login(super_admin))

    assert response.status_code == 200
    assert response.json() == {"schema": "public"}


def test_platform_routes_refuse_a_super_admin_scoped_to_a_restaurant(
    client, super_admin, restaurant, login
):
    headers = {**login(super_admin), "X-Restaurant-Id": str(restaurant.pk)}

    response = client.get("/_probe/platform", headers=headers)

    assert response.status_code == 400
    assert response.json() == refusal("هذا المسار للمنصة فقط")


def test_platform_routes_refuse_restaurant_staff(client, admin, login):
    golden = legacy_golden("GET /admin/restaurants", "failure:not-super-admin")

    response = client.get("/_probe/platform", headers=login(admin))

    assert response.status_code == 403
    assert response.json() == golden_error(golden)


def test_platform_routes_without_a_token_are_refused(client):
    golden = legacy_golden("GET /admin/restaurants", "failure:no-token")

    response = client.get("/_probe/platform")

    assert response.status_code == 401
    assert response.json() == golden_error(golden)


def test_register_and_login_are_platform_routes(client, admin, login):
    """A signed-in staff member's token scopes the connection to their Restaurant, where a new
    Restaurant cannot be created; the platform routes refuse the call instead of failing inside."""
    body = {"restaurant_name": "X", "phone": "", "email": "x@example.com", "password": "secret123"}

    response = client.post("/register", body, content_type="application/json", headers=login(admin))

    assert response.status_code == 400
    assert response.json() == refusal("هذا المسار للمنصة فقط")

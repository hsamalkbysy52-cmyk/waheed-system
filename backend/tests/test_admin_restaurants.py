"""The Super admin console's two routes: ``GET /admin/restaurants`` and
``POST /admin/restaurants/{id}/status`` (plan §1.3 routes 40 and 41; spec stories 2 and 3).

They are platform routes: a Super admin at platform scope only, refused for everyone else and for
a Super admin who scopes the request to one Restaurant (isolation matrix item 5).
"""

import pytest

from tests.conftest import set_status
from tests.golden import assert_matches_golden, golden_error, legacy_golden, refusal

pytestmark = pytest.mark.django_db

LIST = "GET /admin/restaurants"
STATUS = "POST /admin/restaurants/{restaurant_id}/status"


def status_path(restaurant) -> str:
    return f"/admin/restaurants/{restaurant.pk}/status"


# --- listing -------------------------------------------------------------------------------


def test_the_restaurant_list_matches_the_golden(
    client, restaurant, other_restaurant, super_admin, login
):
    golden = legacy_golden(LIST)

    response = client.get(golden.path, headers=login(super_admin))

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)


def test_the_restaurant_list_is_newest_first(
    client, restaurant, other_restaurant, super_admin, login
):
    response = client.get("/admin/restaurants", headers=login(super_admin))

    listed = response.json()["restaurants"]
    assert [row["name"] for row in listed] == ["Shawarma House", "Waheed Restaurant"]
    assert [row["id"] for row in listed] == [other_restaurant.pk, restaurant.pk]


def test_the_restaurant_list_shows_the_contacts_and_status_the_console_displays(
    client, super_admin, login
):
    body = {
        "restaurant_name": "Shawarma House",
        "phone": "+962790000000",
        "email": "owner@shawarma-house.example",
        "password": "secret123",
    }
    client.post("/register", body, content_type="application/json")

    listed = client.get("/admin/restaurants", headers=login(super_admin)).json()["restaurants"]

    assert listed[0]["name"] == "Shawarma House"
    assert listed[0]["email"] == "owner@shawarma-house.example"
    assert listed[0]["phone"] == "+962790000000"
    assert listed[0]["status"] == "active"
    assert listed[0]["created_at"].endswith("Z")


def test_the_restaurant_list_without_a_token_is_refused(client, restaurant):
    golden = legacy_golden(LIST, "failure:no-token")

    response = client.get(golden.path)

    assert response.status_code == 401
    assert response.json() == golden_error(golden)


@pytest.mark.parametrize("staff", ["admin", "cashier"])
def test_the_restaurant_list_refuses_restaurant_staff(client, request, staff, login):
    golden = legacy_golden(LIST, "failure:not-super-admin")

    response = client.get(golden.path, headers=login(request.getfixturevalue(staff)))

    assert response.status_code == 403
    assert response.json() == golden_error(golden)


def test_the_restaurant_list_refuses_a_super_admin_scoped_to_one_restaurant(
    client, restaurant, super_admin, login
):
    """Isolation matrix item 5 on the real route: the console works at platform scope."""
    headers = {**login(super_admin), "X-Restaurant-Id": str(restaurant.pk)}

    response = client.get("/admin/restaurants", headers=headers)

    assert response.status_code == 400
    assert response.json() == refusal("هذا المسار للمنصة فقط")


# --- setting the status --------------------------------------------------------------------


def test_suspending_a_restaurant_matches_the_golden(client, restaurant, super_admin, login):
    golden = legacy_golden(STATUS)

    response = client.post(
        status_path(restaurant),
        golden.body,
        content_type="application/json",
        headers=login(super_admin),
    )

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert response.json() == {
        "id": restaurant.pk,
        "status": "suspended",
        "message": "تم تحديث حالة المطعم",
    }


def test_a_suspended_restaurant_can_be_reactivated(client, restaurant, super_admin, login):
    auth = login(super_admin)
    set_status(client, auth, restaurant, "suspended")

    assert set_status(client, auth, restaurant, "active")["status"] == "active"


def test_an_unknown_status_is_refused(client, restaurant, super_admin, login):
    golden = legacy_golden(STATUS, "failure:invalid-status")

    response = client.post(
        status_path(restaurant),
        golden.body,
        content_type="application/json",
        headers=login(super_admin),
    )

    assert response.status_code == 400
    assert response.json() == golden_error(golden)


def test_a_missing_status_is_refused_the_same_way(client, restaurant, super_admin, login):
    response = client.post(
        status_path(restaurant), {}, content_type="application/json", headers=login(super_admin)
    )

    assert response.status_code == 400
    assert response.json()["error"] == "قيمة status غير صالحة — active أو suspended فقط"


def test_setting_the_status_of_an_unknown_restaurant_is_not_found(client, super_admin, login):
    golden = legacy_golden(STATUS, "failure:not-found")

    response = client.post(
        golden.path, golden.body, content_type="application/json", headers=login(super_admin)
    )

    assert response.status_code == 404
    assert response.json() == golden_error(golden)


def test_setting_the_status_refuses_restaurant_staff(client, admin, login):
    """An Admin cannot lift their own suspension."""
    response = client.post(
        status_path(admin.restaurant),
        {"status": "active"},
        content_type="application/json",
        headers=login(admin),
    )

    assert response.status_code == 403
    assert response.json() == refusal("هذه الصفحة لمدير المنصة فقط")


def test_setting_the_status_without_a_token_is_refused(client, restaurant):
    response = client.post(
        status_path(restaurant), {"status": "suspended"}, content_type="application/json"
    )

    assert response.status_code == 401
    assert response.json() == refusal("توكن غير موجود")

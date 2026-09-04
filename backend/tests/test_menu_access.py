"""Who reaches which Restaurant's menu (plan §3.9, isolation matrix items 3, 4, 5 and 7).

``GET /menu`` is the first real customer route, so the guards that ``tests/test_view_guards.py``
proved on the probe routes are asserted here on a route the frontend actually calls.
"""

import pytest

from tests.conftest import add_menu_item
from tests.golden import assert_matches_golden, golden_error, legacy_golden, refusal

pytestmark = pytest.mark.django_db

NO_TOKEN = refusal("توكن غير موجود")
NO_RESTAURANT = refusal("المطعم غير محدد")
ITEM_NOT_FOUND = refusal("الصنف غير موجود")


@pytest.fixture
def two_menus(client, admin, other_admin, login):
    """One dish in each of two Restaurants, so a leak between them is visible by name."""
    add_menu_item(client, login(admin), "برجر", 5, "وجبات")
    add_menu_item(client, login(other_admin), "شاورما", 3, "وجبات")
    return {"waheed": "برجر", "r-other": "شاورما"}


def names_in(response) -> list:
    return [item["name"] for item in response.json()["menu"]]


# --- customers reach one Restaurant by Slug --------------------------------------------------


@pytest.mark.parametrize("slug", ["waheed", "r-other"])
def test_a_slug_header_selects_that_restaurants_menu(client, two_menus, slug):
    response = client.get("/menu", headers={"X-Restaurant-Slug": slug})

    assert response.status_code == 200
    assert names_in(response) == [two_menus[slug]]


@pytest.mark.parametrize("slug", ["waheed", "r-other"])
def test_the_query_parameter_selects_that_restaurants_menu(client, two_menus, slug):
    """Isolation matrix item 4: the table QR link carries ``?r=<slug>``."""
    response = client.get(f"/menu?r={slug}")

    assert response.status_code == 200
    assert names_in(response) == [two_menus[slug]]


def test_the_menu_without_a_slug_or_a_token_is_refused(client, two_menus):
    """Isolation matrix item 3: the "no token means Restaurant 1" bridge is gone."""
    response = client.get("/menu")

    assert response.status_code == 400
    assert response.json() == NO_RESTAURANT


def test_an_unknown_slug_is_not_found(client, two_menus):
    response = client.get("/menu?r=nobody")

    assert response.status_code == 404
    assert response.json() == refusal("المطعم غير موجود")


def test_a_suspended_restaurant_is_unavailable_to_customers(client, two_menus, suspend, restaurant):
    suspend(restaurant)

    response = client.get("/menu?r=waheed")

    assert response.status_code == 403
    assert response.json() == refusal("المطعم غير متاح حالياً")


def test_a_slug_resolved_caller_may_not_change_the_menu(client, two_menus, admin):
    """Isolation matrix item 4: ``POST /menu/add?r=B`` is refused, however open the menu is."""
    body = {"name": "مسروق", "price": 1, "category": "وجبات"}

    response = client.post("/menu/add?r=waheed", body, content_type="application/json")

    assert response.status_code == 401
    assert response.json() == NO_TOKEN


# --- staff reach their own Restaurant --------------------------------------------------------


def test_a_staff_token_selects_the_callers_restaurant(client, two_menus, admin, cashier, login):
    for user in (admin, cashier):
        response = client.get("/menu", headers=login(user))

        assert response.status_code == 200
        assert names_in(response) == ["برجر"]


def test_an_invalid_token_is_refused_before_the_menu(client, two_menus):
    golden = legacy_golden("GET /menu", "failure:invalid-token")

    response = client.get("/menu", headers={"Authorization": "Bearer not.a.jwt"})

    assert response.status_code == 401
    assert response.json() == golden_error(golden)


def test_naming_another_restaurant_with_a_staff_token_is_forbidden(
    client, two_menus, admin, other_restaurant, login
):
    """Isolation matrix item 2, on the menu."""
    golden = legacy_golden("GET /menu", "failure:foreign-restaurant-header")
    headers = {**login(admin), "X-Restaurant-Id": str(other_restaurant.pk)}

    response = client.get("/menu", headers=headers)

    assert response.status_code == 403
    assert response.json() == golden_error(golden)


def test_a_suspended_restaurant_signs_its_staff_out_of_the_menu(
    client, two_menus, admin, login, suspend
):
    golden = legacy_golden("GET /menu", "failure:restaurant-suspended")
    headers = login(admin)
    suspend(admin.restaurant)

    response = client.get("/menu", headers=headers)

    assert response.status_code == 403
    assert response.json() == golden_error(golden)


# --- super admins name the Restaurant they look at -------------------------------------------


def test_a_super_admin_must_name_a_restaurant(client, two_menus, super_admin, login):
    """Isolation matrix item 5, first half."""
    response = client.get("/menu", headers=login(super_admin))

    assert response.status_code == 400
    assert response.json() == NO_RESTAURANT


def test_a_super_admin_sees_the_menu_of_the_restaurant_they_name(
    client, two_menus, super_admin, other_restaurant, login
):
    """Isolation matrix item 5, second half."""
    golden = legacy_golden("GET /menu", "success:super-admin-selects-restaurant")
    headers = {**login(super_admin), "X-Restaurant-Id": str(other_restaurant.pk)}

    response = client.get(golden.path, headers=headers)

    assert response.status_code == golden.status
    assert_matches_golden(response.json(), legacy_golden("GET /menu").response)
    assert names_in(response) == ["شاورما"]


# --- one Restaurant's ids mean nothing in another --------------------------------------------


def test_ids_from_another_restaurant_are_not_found(client, admin, other_admin, login):
    """Isolation matrix item 7, through every route that takes a Menu item id."""
    theirs = add_menu_item(client, login(other_admin), "شاورما", 3, "وجبات")
    auth = login(admin)
    body = {"name": "مسروق", "price": 1, "category": "وجبات"}

    edited = client.put(f"/menu/{theirs}", body, content_type="application/json", headers=auth)

    assert edited.status_code == 404
    assert edited.json() == ITEM_NOT_FOUND
    assert client.delete(f"/menu/{theirs}", headers=auth).status_code == 404
    assert client.put(f"/menu/{theirs}/toggle", headers=auth).status_code == 404
    assert client.get(f"/menu/{theirs}/modifiers/groups", headers=auth).status_code == 404


def test_an_id_that_exists_in_both_restaurants_only_ever_reaches_the_callers_own(
    client, admin, other_admin, login
):
    """Ids are per-schema sequences, so both Restaurants hold a Menu item 1: acting on it from one
    must leave the other's alone (ADR-0001)."""
    mine = add_menu_item(client, login(admin), "برجر", 5, "وجبات")
    theirs = add_menu_item(client, login(other_admin), "شاورما", 3, "وجبات")
    assert mine == theirs  # the same id in two schemas

    client.delete(f"/menu/{theirs}", headers=login(admin))

    assert names_in(client.get("/menu?r=r-other")) == ["شاورما"]
    assert names_in(client.get("/menu?r=waheed")) == []


def test_a_variant_cannot_be_hung_on_another_restaurants_dish(client, admin, other_admin, login):
    theirs = add_menu_item(client, login(other_admin), "شاورما", 3, "وجبات")
    body = {"name": "شاورما دبل", "price": 4, "category": "وجبات", "parent_id": theirs}

    response = client.post("/menu/add", body, content_type="application/json", headers=login(admin))

    assert response.status_code == 404
    assert response.json() == ITEM_NOT_FOUND


def test_a_modifier_group_id_from_another_restaurant_never_reaches_it(
    client, admin, other_admin, login, demo_menu
):
    from tests.conftest import add_modifier_group

    their_item = add_menu_item(client, login(other_admin), "شاورما", 3, "وجبات")
    their_group = add_modifier_group(client, login(other_admin), their_item, "الخبز", 1)

    client.delete(f"/modifiers/groups/{their_group}", headers=login(admin))

    still_theirs = client.get(
        f"/menu/{their_item}/modifiers/groups", headers=login(other_admin)
    ).json()["groups"]
    assert [group["name"] for group in still_theirs] == ["الخبز"]

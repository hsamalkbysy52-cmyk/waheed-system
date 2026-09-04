"""Menu items and Variants: routes 2 to 5 and 15 (plan §1.3; spec stories 11, 12, 42).

Shapes and Arabic messages come from the legacy goldens; the failures answer real status codes
(tests/goldens/README.md).
"""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from tests.conftest import add_menu_item
from tests.golden import assert_matches_golden, golden_error, legacy_golden, refusal

pytestmark = pytest.mark.django_db

ITEM_NOT_FOUND = refusal("الصنف غير موجود")


def menu_of(client, auth: dict) -> list:
    response = client.get("/menu", headers=auth)
    assert response.status_code == 200, response.content
    return response.json()["menu"]


def item_named(menu: list, name: str) -> dict:
    return next(item for item in menu if item["name"] == name)


# --- GET /menu ------------------------------------------------------------------------------


def test_the_menu_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("GET /menu")

    response = client.get(golden.path, headers=login(admin))

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)


def test_the_menu_nests_variants_under_their_parent(client, admin, login, demo_menu):
    menu = menu_of(client, login(admin))

    assert [item["name"] for item in menu] == ["برجر", "بيتزا", "باستا", "كولا", "عصير", "شاي"]
    burger = item_named(menu, "برجر")
    assert [variant["name"] for variant in burger["variants"]] == ["برجر دبل"]
    assert burger["variants"][0]["parent_id"] == demo_menu["برجر"]
    assert burger["variants"][0]["description"] == "قطعتين لحم"


def test_the_menu_carries_prices_as_numbers_and_the_stock_fields(client, admin, login, demo_menu):
    burger = item_named(menu_of(client, login(admin)), "برجر")

    assert burger["price"] == 5
    assert burger["is_available"] is True
    assert burger["out_of_stock"] is False
    assert burger["max_qty"] is None  # Recipes arrive with ticket 06


def test_a_variant_inherits_its_parents_modifier_groups(client, admin, login, demo_menu):
    """Spec story 13: a Variant reuses its parent's Modifier groups unless it defines its own."""
    burger = item_named(menu_of(client, login(admin)), "برجر")

    inherited = burger["variants"][0]["modifiers"]
    assert [group["name"] for group in inherited] == ["الإضافات"]
    assert [option["name"] for option in inherited[0]["options"]] == ["بدون خبز", "جبن إضافي"]


def test_a_variant_with_its_own_groups_does_not_inherit(client, admin, login, demo_menu):
    from tests.conftest import add_modifier_group

    auth = login(admin)
    add_modifier_group(client, auth, demo_menu["برجر دبل"], "درجة الاستواء", 1)

    burger = item_named(menu_of(client, auth), "برجر")

    assert [group["name"] for group in burger["variants"][0]["modifiers"]] == ["درجة الاستواء"]


def test_the_menu_shows_unavailable_items_so_the_pages_can_filter_them(
    client, admin, login, demo_menu
):
    tea = item_named(menu_of(client, login(admin)), "شاي")

    assert tea["is_available"] is False


def test_the_menu_is_read_without_an_n_plus_one(client, admin, login, demo_menu):
    """Plan §4: at most five queries for the whole menu, however many items and options it holds.

    Two of the five belong to every authenticated request (the Restaurant and the caller); the
    menu itself costs three: items, their Modifier groups, the groups' options.
    """
    auth = login(admin)

    with CaptureQueriesContext(connection) as captured:
        menu_of(client, auth)

    selects = [query for query in captured.captured_queries if query["sql"].startswith("SELECT")]
    assert len(selects) <= 5, [query["sql"] for query in selects]


# --- POST /menu/add -------------------------------------------------------------------------


def test_adding_an_item_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("POST /menu/add")
    body = {**golden.body, "parent_id": demo_menu["برجر"]}

    response = client.post(golden.path, body, content_type="application/json", headers=login(admin))

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert response.json()["message"] == "تم إضافة برجر دبل"


def test_an_added_item_appears_on_the_menu(client, admin, login):
    auth = login(admin)

    add_menu_item(client, auth, "كنافة", 3.25, "حلويات", description="بالجبن")

    added = item_named(menu_of(client, auth), "كنافة")
    assert added["price"] == 3.25
    assert added["category"] == "حلويات"
    assert added["description"] == "بالجبن"
    assert added["parent_id"] is None
    assert added["modifiers"] == []
    assert added["variants"] == []


def test_an_item_without_a_description_carries_an_empty_one(client, admin, login):
    auth = login(admin)

    add_menu_item(client, auth, "كنافة", 3.25, "حلويات")

    assert item_named(menu_of(client, auth), "كنافة")["description"] == ""


def test_adding_an_item_is_refused_for_cashiers(client, cashier, login):
    body = {"name": "كنافة", "price": 3, "category": "حلويات"}

    response = client.post(
        "/menu/add", body, content_type="application/json", headers=login(cashier)
    )

    assert response.status_code == 403
    assert response.json() == refusal("هذه العملية لمدير المطعم فقط")


def test_adding_an_item_without_a_name_is_refused(client, admin, login):
    body = {"price": 3, "category": "حلويات"}

    response = client.post("/menu/add", body, content_type="application/json", headers=login(admin))

    assert response.status_code == 400


# --- PUT /menu/{item_id} --------------------------------------------------------------------


def test_editing_an_item_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("PUT /menu/{item_id}")
    path = f"/menu/{demo_menu['برجر دبل']}"

    response = client.put(path, golden.body, content_type="application/json", headers=login(admin))

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    edited = item_named(menu_of(client, login(admin)), "برجر")["variants"][0]
    assert edited["price"] == golden.body["price"]


def test_editing_an_unknown_item_is_not_found(client, admin, login):
    golden = legacy_golden("PUT /menu/{item_id}", "failure:not-found")

    response = client.put(
        golden.path, golden.body, content_type="application/json", headers=login(admin)
    )

    assert response.status_code == 404
    assert response.json() == golden_error(golden)


def test_editing_leaves_a_variant_attached_to_its_parent(client, admin, login, demo_menu):
    """The legacy API ignored ``parent_id`` on edit; the frontend's edit form omits it."""
    auth = login(admin)
    body = {"name": "برجر دبل", "price": 7.5, "category": "وجبات"}

    client.put(
        f"/menu/{demo_menu['برجر دبل']}", body, content_type="application/json", headers=auth
    )

    burger = item_named(menu_of(client, auth), "برجر")
    assert [variant["name"] for variant in burger["variants"]] == ["برجر دبل"]


def test_editing_is_refused_for_cashiers(client, cashier, admin, login, demo_menu):
    body = {"name": "برجر", "price": 6, "category": "وجبات"}

    response = client.put(
        f"/menu/{demo_menu['برجر']}", body, content_type="application/json", headers=login(cashier)
    )

    assert response.status_code == 403


# --- DELETE /menu/{item_id} -----------------------------------------------------------------


def test_deleting_an_item_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("DELETE /menu/{item_id}")
    auth = login(admin)

    response = client.delete(f"/menu/{demo_menu['كولا']}", headers=auth)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert "كولا" not in [item["name"] for item in menu_of(client, auth)]


def test_deleting_a_parent_takes_its_variants_with_it(client, admin, login, demo_menu):
    auth = login(admin)

    client.delete(f"/menu/{demo_menu['برجر']}", headers=auth)

    names = [item["name"] for item in menu_of(client, auth)]
    assert "برجر" not in names and "برجر دبل" not in names


def test_deleting_an_unknown_item_is_not_found(client, admin, login):
    response = client.delete("/menu/9999", headers=login(admin))

    assert response.status_code == 404
    assert response.json() == ITEM_NOT_FOUND


# --- PUT /menu/{item_id}/toggle -------------------------------------------------------------


def test_toggling_an_item_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("PUT /menu/{item_id}/toggle")

    response = client.put(f"/menu/{demo_menu['بيتزا']}/toggle", headers=login(admin))

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert response.json()["is_available"] is False


def test_toggling_twice_puts_an_item_back_on_sale(client, admin, login, demo_menu):
    auth = login(admin)
    path = f"/menu/{demo_menu['شاي']}/toggle"

    client.put(path, headers=auth)

    assert client.put(path, headers=auth).json()["is_available"] is False
    assert item_named(menu_of(client, auth), "شاي")["is_available"] is False


def test_toggling_an_unknown_item_is_not_found(client, admin, login):
    response = client.put("/menu/9999/toggle", headers=login(admin))

    assert response.status_code == 404
    assert response.json() == ITEM_NOT_FOUND

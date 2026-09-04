"""Modifier groups and options: routes 6 to 14 (plan §1.3; spec stories 14, 15).

The editor surface: reading a Menu item's own groups, creating, editing, deleting and reordering
them and their options. Inheritance belongs to the menu response, not here (tests/test_menu.py).
"""

import pytest

from tests.conftest import add_menu_item, add_modifier_group, add_modifier_option
from tests.golden import assert_matches_golden, golden_error, legacy_golden, refusal

pytestmark = pytest.mark.django_db

ITEM_NOT_FOUND = refusal("الصنف غير موجود")
GROUP_NOT_FOUND = refusal("المجموعة غير موجودة")
OPTION_NOT_FOUND = refusal("الخيار غير موجود")
ADMIN_ONLY = refusal("هذه العملية لمدير المطعم فقط")


def groups_of(client, auth: dict, item_id: int) -> list:
    response = client.get(f"/menu/{item_id}/modifiers/groups", headers=auth)
    assert response.status_code == 200, response.content
    return response.json()["groups"]


# --- GET /menu/{item_id}/modifiers/groups ---------------------------------------------------


def test_the_groups_of_an_item_match_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("GET /menu/{item_id}/modifiers/groups")

    response = client.get(f"/menu/{demo_menu['برجر']}/modifiers/groups", headers=login(admin))

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert [group["name"] for group in response.json()["groups"]] == ["الإضافات"]


def test_a_cashier_may_read_the_groups(client, cashier, admin, login, demo_menu):
    response = client.get(f"/menu/{demo_menu['برجر']}/modifiers/groups", headers=login(cashier))

    assert response.status_code == 200


def test_a_variant_shows_only_its_own_groups_in_the_editor(client, admin, login, demo_menu):
    """The parent's groups reach a Variant through the menu, not through its editor."""
    assert groups_of(client, login(admin), demo_menu["برجر دبل"]) == []


def test_the_groups_of_an_unknown_item_are_not_found(client, admin, login):
    response = client.get("/menu/9999/modifiers/groups", headers=login(admin))

    assert response.status_code == 404
    assert response.json() == ITEM_NOT_FOUND


# --- POST /menu/{item_id}/modifiers/groups --------------------------------------------------


def test_creating_a_group_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("POST /menu/{item_id}/modifiers/groups")
    auth = login(admin)

    response = client.post(
        f"/menu/{demo_menu['بيتزا']}/modifiers/groups",
        golden.body,
        content_type="application/json",
        headers=auth,
    )

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    created = groups_of(client, auth, demo_menu["بيتزا"])[0]
    assert created["name"] == "إضافات" and created["max_selections"] == 2
    assert created["options"] == []


def test_creating_a_group_on_an_unknown_item_is_not_found(client, admin, login):
    response = client.post(
        "/menu/9999/modifiers/groups",
        {"name": "إضافات", "max_selections": 2},
        content_type="application/json",
        headers=login(admin),
    )

    assert response.status_code == 404
    assert response.json() == ITEM_NOT_FOUND


def test_creating_a_group_is_refused_for_cashiers(client, cashier, admin, login, demo_menu):
    response = client.post(
        f"/menu/{demo_menu['بيتزا']}/modifiers/groups",
        {"name": "إضافات", "max_selections": 2},
        content_type="application/json",
        headers=login(cashier),
    )

    assert response.status_code == 403
    assert response.json() == ADMIN_ONLY


# --- PUT and DELETE /modifiers/groups/{group_id} ---------------------------------------------


def test_editing_a_group_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("PUT /modifiers/groups/{group_id}")
    auth = login(admin)

    response = client.put(
        f"/modifiers/groups/{demo_menu['الإضافات']}",
        golden.body,
        content_type="application/json",
        headers=auth,
    )

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    edited = groups_of(client, auth, demo_menu["برجر"])[0]
    assert edited["name"] == "الإضافات" and edited["max_selections"] == 3


def test_editing_an_unknown_group_is_not_found_in_arabic(client, admin, login):
    """The legacy API answered an English ``{"error": "not found"}`` here; no golden pins it."""
    response = client.put(
        "/modifiers/groups/9999",
        {"name": "إضافات", "max_selections": 1},
        content_type="application/json",
        headers=login(admin),
    )

    assert response.status_code == 404
    assert response.json() == GROUP_NOT_FOUND


def test_deleting_a_group_matches_the_golden_and_takes_its_options(client, admin, login, demo_menu):
    golden = legacy_golden("DELETE /modifiers/groups/{group_id}")
    auth = login(admin)

    response = client.delete(f"/modifiers/groups/{demo_menu['الإضافات']}", headers=auth)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert groups_of(client, auth, demo_menu["برجر"]) == []


def test_deleting_an_unknown_group_is_not_found(client, admin, login):
    golden = legacy_golden("DELETE /modifiers/groups/{group_id}", "failure:not-found")

    response = client.delete(golden.path, headers=login(admin))

    assert response.status_code == 404
    assert response.json() == golden_error(golden)


# --- options ---------------------------------------------------------------------------------


def test_creating_an_option_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("POST /modifiers/groups/{group_id}/options")
    auth = login(admin)
    body = {**golden.body, "inventory_item_id": demo_menu["جبن"]}

    response = client.post(
        f"/modifiers/groups/{demo_menu['الإضافات']}/options",
        body,
        content_type="application/json",
        headers=auth,
    )

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    created = groups_of(client, auth, demo_menu["برجر"])[0]["options"][-1]
    assert created["name"] == "جبن إضافي"
    assert created["price_delta"] == golden.body["price_delta"]
    assert created["inventory_item_id"] == demo_menu["جبن"]
    assert created["quantity_delta"] == golden.body["quantity_delta"]


def test_an_option_may_leave_the_inventory_link_empty(client, admin, login, demo_menu):
    auth = login(admin)

    add_modifier_option(client, auth, demo_menu["الإضافات"], name="حار", price_delta=0)

    created = groups_of(client, auth, demo_menu["برجر"])[0]["options"][-1]
    assert created["inventory_item_id"] is None
    assert created["quantity_delta"] == 0


def test_an_option_naming_an_unknown_inventory_item_is_not_found(client, admin, login, demo_menu):
    golden = legacy_golden(
        "POST /modifiers/groups/{group_id}/options", "failure:inventory-item-not-found"
    )

    response = client.post(
        f"/modifiers/groups/{demo_menu['الإضافات']}/options",
        golden.body,  # inventory_item_id 9999
        content_type="application/json",
        headers=login(admin),
    )

    assert response.status_code == 404
    assert response.json() == golden_error(golden)


def test_an_option_cannot_consume_another_restaurants_inventory(client, admin, other_admin, login):
    """Isolation matrix item 7: the other Restaurant's Inventory item is not there. This
    Restaurant holds no Inventory, so the foreign id cannot collide with one of its own."""
    from tests.conftest import add_inventory_item

    foreign_id = add_inventory_item(client, login(other_admin), "سماق", "كغم", 5, 1)
    auth = login(admin)
    group = add_modifier_group(
        client, auth, add_menu_item(client, auth, "برجر", 5, "وجبات"), "إضافات", 1
    )

    response = client.post(
        f"/modifiers/groups/{group}/options",
        {"name": "سماق", "price_delta": 0, "inventory_item_id": foreign_id, "quantity_delta": 1},
        content_type="application/json",
        headers=auth,
    )

    assert response.status_code == 404
    assert response.json() == refusal("مادة المخزون غير موجودة")


def test_creating_an_option_in_an_unknown_group_is_not_found(client, admin, login):
    response = client.post(
        "/modifiers/groups/9999/options",
        {"name": "جبن", "price_delta": 0},
        content_type="application/json",
        headers=login(admin),
    )

    assert response.status_code == 404
    assert response.json() == GROUP_NOT_FOUND


def test_creating_an_option_is_refused_for_cashiers(client, cashier, admin, login, demo_menu):
    response = client.post(
        f"/modifiers/groups/{demo_menu['الإضافات']}/options",
        {"name": "جبن", "price_delta": 0},
        content_type="application/json",
        headers=login(cashier),
    )

    assert response.status_code == 403


def test_editing_an_option_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("PUT /modifiers/options/{option_id}")
    auth = login(admin)

    response = client.put(
        f"/modifiers/options/{demo_menu['جبن إضافي']}",
        golden.body,
        content_type="application/json",
        headers=auth,
    )

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    edited = groups_of(client, auth, demo_menu["برجر"])[0]["options"][-1]
    assert edited["price_delta"] == golden.body["price_delta"]
    assert edited["inventory_item_id"] == 3  # the edit payload never touches the inventory link


def test_editing_an_unknown_option_is_not_found_in_arabic(client, admin, login):
    response = client.put(
        "/modifiers/options/9999",
        {"name": "جبن", "price_delta": 0},
        content_type="application/json",
        headers=login(admin),
    )

    assert response.status_code == 404
    assert response.json() == OPTION_NOT_FOUND


def test_deleting_an_option_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("DELETE /modifiers/options/{option_id}")
    auth = login(admin)

    response = client.delete(f"/modifiers/options/{demo_menu['بدون خبز']}", headers=auth)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    remaining = groups_of(client, auth, demo_menu["برجر"])[0]["options"]
    assert [option["name"] for option in remaining] == ["جبن إضافي"]


def test_deleting_an_unknown_option_is_not_found(client, admin, login):
    golden = legacy_golden("DELETE /modifiers/options/{option_id}", "failure:not-found")

    response = client.delete(golden.path, headers=login(admin))

    assert response.status_code == 404
    assert response.json() == golden_error(golden)


# --- ordering ---------------------------------------------------------------------------------


def test_reordering_groups_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("PUT /menu/{item_id}/modifiers/groups/reorder")
    auth = login(admin)
    second = add_modifier_group(client, auth, demo_menu["برجر"], "درجة الاستواء", 1)

    response = client.put(
        f"/menu/{demo_menu['برجر']}/modifiers/groups/reorder",
        {"order": [second, demo_menu["الإضافات"]]},
        content_type="application/json",
        headers=auth,
    )

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert [group["name"] for group in groups_of(client, auth, demo_menu["برجر"])] == [
        "درجة الاستواء",
        "الإضافات",
    ]


def test_reordering_ignores_a_group_that_belongs_to_another_item(client, admin, login, demo_menu):
    auth = login(admin)
    other = add_modifier_group(client, auth, demo_menu["بيتزا"], "العجينة", 1)

    response = client.put(
        f"/menu/{demo_menu['برجر']}/modifiers/groups/reorder",
        {"order": [other]},
        content_type="application/json",
        headers=auth,
    )

    assert response.status_code == 200
    assert [group["name"] for group in groups_of(client, auth, demo_menu["بيتزا"])] == ["العجينة"]


def test_reordering_groups_of_an_unknown_item_is_not_found(client, admin, login):
    response = client.put(
        "/menu/9999/modifiers/groups/reorder",
        {"order": []},
        content_type="application/json",
        headers=login(admin),
    )

    assert response.status_code == 404
    assert response.json() == ITEM_NOT_FOUND


def test_reordering_options_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("PUT /modifiers/groups/{group_id}/options/reorder")
    auth = login(admin)

    response = client.put(
        f"/modifiers/groups/{demo_menu['الإضافات']}/options/reorder",
        {"order": [demo_menu["جبن إضافي"], demo_menu["بدون خبز"]]},
        content_type="application/json",
        headers=auth,
    )

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    options = groups_of(client, auth, demo_menu["برجر"])[0]["options"]
    assert [option["name"] for option in options] == ["جبن إضافي", "بدون خبز"]


def test_reordering_options_of_an_unknown_group_is_not_found(client, admin, login):
    response = client.put(
        "/modifiers/groups/9999/options/reorder",
        {"order": []},
        content_type="application/json",
        headers=login(admin),
    )

    assert response.status_code == 404
    assert response.json() == GROUP_NOT_FOUND


def test_an_option_added_to_a_variants_own_group_does_not_leak_to_the_parent(
    client, admin, login, demo_menu
):
    auth = login(admin)
    variant_group = add_modifier_group(client, auth, demo_menu["برجر دبل"], "درجة الاستواء", 1)
    add_modifier_option(client, auth, variant_group, name="ويل دن", price_delta=0)

    assert [group["name"] for group in groups_of(client, auth, demo_menu["برجر"])] == ["الإضافات"]
    assert len(groups_of(client, auth, demo_menu["برجر"])[0]["options"]) == 2


def test_a_group_belongs_to_the_item_it_was_created_on(client, admin, login):
    auth = login(admin)
    item_id = add_menu_item(client, auth, "شاورما", 3, "وجبات")
    group_id = add_modifier_group(client, auth, item_id, "الخبز", 1)

    assert [group["id"] for group in groups_of(client, auth, item_id)] == [group_id]

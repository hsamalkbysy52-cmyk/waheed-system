"""Inventory items and Recipes: routes 29 to 34 (plan §1.3; spec stories 13, 17, 18).

Shapes and Arabic messages come from the legacy goldens; failures answer real status codes
(tests/goldens/README.md). Route 35, the legacy deduct route, is asserted gone.
"""

import pytest
from django_tenants.utils import schema_context

from inventory.services import low_stock_items
from tests.conftest import add_inventory_item, add_menu_item, save_recipe
from tests.golden import assert_matches_golden, golden_error, legacy_golden, refusal

pytestmark = pytest.mark.django_db

INVENTORY_ITEM_NOT_FOUND = refusal("المادة غير موجودة")
LINKED_ITEM_NOT_FOUND = refusal("مادة المخزون غير موجودة")
ITEM_NOT_FOUND = refusal("الصنف غير موجود")
ADMIN_ONLY = refusal("هذه العملية لمدير المطعم فقط")
NO_TOKEN = refusal("توكن غير موجود")


def inventory_of(client, auth: dict) -> list:
    response = client.get("/inventory", headers=auth)
    assert response.status_code == 200, response.content
    return response.json()["items"]


def recipe_of(client, auth: dict, menu_item_id: int) -> list:
    response = client.get(f"/inventory/recipe/{menu_item_id}", headers=auth)
    assert response.status_code == 200, response.content
    return response.json()["recipe"]


def menu_item(client, auth: dict, name: str) -> dict:
    menu = client.get("/menu", headers=auth).json()["menu"]
    dishes = {dish["name"]: dish for dish in menu}
    variants = {variant["name"]: variant for dish in menu for variant in dish["variants"]}
    return {**dishes, **variants}[name]


# --- GET /inventory ---------------------------------------------------------------------------


def test_the_inventory_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("GET /inventory")

    response = client.get(golden.path, headers=login(admin))

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)


def test_the_inventory_lists_items_in_id_order_with_numbers(client, admin, login, demo_menu):
    items = inventory_of(client, login(admin))

    assert [item["name"] for item in items] == ["لحم بقري", "خبز", "جبن", "طماطم"]
    meat = items[0]
    assert meat["id"] == demo_menu["لحم بقري"]
    assert meat["unit"] == "كغم"
    assert meat["quantity"] == 20 and meat["min_quantity"] == 5


def test_a_cashier_may_read_the_inventory(client, cashier, admin, login, demo_menu):
    response = client.get("/inventory", headers=login(cashier))

    assert response.status_code == 200
    assert len(response.json()["items"]) == 4


def test_the_inventory_is_not_a_customer_route(client, demo_menu):
    """Isolation matrix item 4: a Slug selects a Restaurant only for the five customer routes."""
    response = client.get("/inventory?r=waheed")

    assert response.status_code == 401
    assert response.json() == NO_TOKEN


def test_a_super_admin_reads_the_inventory_of_the_restaurant_they_name(
    client, super_admin, login, demo_menu, restaurant
):
    response = client.get(
        "/inventory", headers={**login(super_admin), "X-Restaurant-Id": str(restaurant.pk)}
    )

    assert response.status_code == 200
    assert len(response.json()["items"]) == 4


# --- POST /inventory/add ----------------------------------------------------------------------


def test_adding_an_item_matches_the_golden(client, admin, login):
    golden = legacy_golden("POST /inventory/add")
    auth = login(admin)

    response = client.post(golden.path, golden.body, content_type="application/json", headers=auth)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert response.json()["message"] == "تم إضافة لحم"
    added = inventory_of(client, auth)[0]
    assert added["id"] == response.json()["id"]
    assert added == {**golden.body, "id": added["id"]}


def test_an_item_gets_the_legacy_defaults_when_the_payload_omits_them(client, admin, login):
    auth = login(admin)

    response = client.post(
        "/inventory/add", {"name": "ملح"}, content_type="application/json", headers=auth
    )

    assert response.status_code == 200
    added = inventory_of(client, auth)[0]
    assert added["unit"] == "قطعة"
    assert added["quantity"] == 0
    assert added["min_quantity"] == 5


def test_quantities_keep_three_decimals(client, admin, login):
    auth = login(admin)

    add_inventory_item(client, auth, "زعفران", "غرام", 0.125, 0.05)

    added = inventory_of(client, auth)[0]
    assert added["quantity"] == 0.125
    assert added["min_quantity"] == 0.05


def test_adding_an_item_is_refused_for_cashiers(client, cashier, login):
    response = client.post(
        "/inventory/add",
        {"name": "ملح", "unit": "كغم", "quantity": 1, "min_quantity": 1},
        content_type="application/json",
        headers=login(cashier),
    )

    assert response.status_code == 403
    assert response.json() == ADMIN_ONLY


def test_adding_an_item_without_a_name_is_a_validation_error(client, admin, login):
    response = client.post(
        "/inventory/add", {"unit": "كغم"}, content_type="application/json", headers=login(admin)
    )

    assert response.status_code == 400


# --- PUT /inventory/{item_id} -----------------------------------------------------------------


def test_editing_an_item_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("PUT /inventory/{item_id}")
    auth = login(admin)
    body = {**golden.body, "name": "لحم غنم", "quantity": 12.5, "min_quantity": 4}

    response = client.put(
        f"/inventory/{demo_menu['لحم بقري']}", body, content_type="application/json", headers=auth
    )

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    edited = inventory_of(client, auth)[0]
    assert edited == {**body, "id": demo_menu["لحم بقري"]}


def test_editing_an_unknown_item_is_not_found(client, admin, login, demo_menu):
    golden = legacy_golden("PUT /inventory/{item_id}", "failure:not-found")

    response = client.put(
        golden.path, golden.body, content_type="application/json", headers=login(admin)
    )

    assert response.status_code == 404
    assert response.json() == golden_error(golden)


def test_editing_an_item_is_refused_for_cashiers(client, cashier, admin, login, demo_menu):
    response = client.put(
        f"/inventory/{demo_menu['لحم بقري']}",
        {"name": "لحم", "unit": "كغم", "quantity": 1, "min_quantity": 1},
        content_type="application/json",
        headers=login(cashier),
    )

    assert response.status_code == 403
    assert response.json() == ADMIN_ONLY


def test_editing_the_stock_changes_what_the_menu_can_sell(client, admin, login, demo_menu):
    """Spec story 18: باستا is Out of stock at 1 kg of طماطم and sells again at 6 kg."""
    auth = login(admin)
    assert menu_item(client, auth, "باستا")["out_of_stock"] is True

    client.put(
        f"/inventory/{demo_menu['طماطم']}",
        {"name": "طماطم", "unit": "كغم", "quantity": 6, "min_quantity": 2},
        content_type="application/json",
        headers=auth,
    )

    pasta = menu_item(client, auth, "باستا")
    assert pasta["out_of_stock"] is False
    assert pasta["max_qty"] == 3


# --- DELETE /inventory/{item_id} --------------------------------------------------------------


def test_deleting_an_item_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("DELETE /inventory/{item_id}")
    auth = login(admin)

    response = client.delete(f"/inventory/{demo_menu['طماطم']}", headers=auth)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert [item["name"] for item in inventory_of(client, auth)] == ["لحم بقري", "خبز", "جبن"]


def test_deleting_an_item_removes_its_recipe_lines(client, admin, login, demo_menu):
    """Plan §3.7: باستا's only ingredient goes, so باستا has no Recipe and is back on sale."""
    auth = login(admin)

    client.delete(f"/inventory/{demo_menu['طماطم']}", headers=auth)

    assert recipe_of(client, auth, demo_menu["باستا"]) == []
    pasta = menu_item(client, auth, "باستا")
    assert pasta["out_of_stock"] is False and pasta["max_qty"] is None


def test_deleting_an_item_keeps_the_options_that_consumed_it(client, admin, login, demo_menu):
    """An option outlives its Inventory item: the link is cleared, the choice stays on the menu."""
    auth = login(admin)

    client.delete(f"/inventory/{demo_menu['جبن']}", headers=auth)

    options = menu_item(client, auth, "برجر")["modifiers"][0]["options"]
    cheese = next(option for option in options if option["name"] == "جبن إضافي")
    assert cheese["inventory_item_id"] is None
    assert cheese["quantity_delta"] == 1


def test_deleting_an_unknown_item_is_not_found(client, admin, login, demo_menu):
    golden = legacy_golden("DELETE /inventory/{item_id}", "failure:not-found")

    response = client.delete(golden.path, headers=login(admin))

    assert response.status_code == 404
    assert response.json() == golden_error(golden)


def test_deleting_an_item_is_refused_for_cashiers(client, cashier, admin, login, demo_menu):
    response = client.delete(f"/inventory/{demo_menu['طماطم']}", headers=login(cashier))

    assert response.status_code == 403
    assert len(inventory_of(client, login(admin))) == 4


# --- GET /inventory/recipe/{menu_item_id} -----------------------------------------------------


def test_the_recipe_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("GET /inventory/recipe/{menu_item_id}")

    response = client.get(f"/inventory/recipe/{demo_menu['برجر']}", headers=login(admin))

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)


def test_the_recipe_carries_the_ingredients_with_their_names_and_units(
    client, admin, login, demo_menu
):
    recipe = recipe_of(client, login(admin), demo_menu["برجر"])

    assert [(line["inventory_name"], line["unit"], line["amount"]) for line in recipe] == [
        ("لحم بقري", "كغم", 0.2),
        ("خبز", "قطعة", 1),
    ]
    assert [line["inventory_item_id"] for line in recipe] == [
        demo_menu["لحم بقري"],
        demo_menu["خبز"],
    ]


def test_a_cashier_may_read_a_recipe(client, cashier, admin, login, demo_menu):
    response = client.get(f"/inventory/recipe/{demo_menu['برجر']}", headers=login(cashier))

    assert response.status_code == 200


def test_an_item_without_a_recipe_has_an_empty_one(client, admin, login, demo_menu):
    assert recipe_of(client, login(admin), demo_menu["كولا"]) == []


def test_a_variant_shows_only_its_own_recipe_in_the_editor(client, admin, login, demo_menu):
    """The parent's Recipe reaches a Variant through the menu, not through its editor."""
    assert recipe_of(client, login(admin), demo_menu["برجر دبل"]) == []


def test_the_recipe_of_an_unknown_item_is_not_found(client, admin, login, demo_menu):
    response = client.get("/inventory/recipe/9999", headers=login(admin))

    assert response.status_code == 404
    assert response.json() == ITEM_NOT_FOUND


# --- POST /inventory/recipe/{menu_item_id} ----------------------------------------------------


def test_saving_a_recipe_matches_the_golden(client, admin, login, demo_menu):
    golden = legacy_golden("POST /inventory/recipe/{menu_item_id}")
    auth = login(admin)
    body = {
        "ingredients": [
            {"inventory_item_id": demo_menu["جبن"], "amount": 2},
            {"inventory_item_id": demo_menu["طماطم"], "amount": 0.25},
        ]
    }

    response = client.post(
        f"/inventory/recipe/{demo_menu['بيتزا']}",
        body,
        content_type="application/json",
        headers=auth,
    )

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert [
        (line["inventory_name"], line["amount"])
        for line in recipe_of(client, auth, demo_menu["بيتزا"])
    ] == [
        ("جبن", 2),
        ("طماطم", 0.25),
    ]


def test_saving_a_recipe_replaces_the_whole_recipe(client, admin, login, demo_menu):
    auth = login(admin)

    save_recipe(client, auth, demo_menu["برجر"], [(demo_menu["خبز"], 2)])

    recipe = recipe_of(client, auth, demo_menu["برجر"])
    assert [(line["inventory_name"], line["amount"]) for line in recipe] == [("خبز", 2)]


def test_saving_an_empty_recipe_clears_it(client, admin, login, demo_menu):
    auth = login(admin)

    save_recipe(client, auth, demo_menu["برجر"], [])

    assert recipe_of(client, auth, demo_menu["برجر"]) == []
    burger = menu_item(client, auth, "برجر")
    assert burger["out_of_stock"] is False and burger["max_qty"] is None


def test_saving_a_recipe_for_an_unknown_item_is_not_found(client, admin, login, demo_menu):
    golden = legacy_golden("POST /inventory/recipe/{menu_item_id}", "failure:menu-item-not-found")

    response = client.post(
        golden.path, golden.body, content_type="application/json", headers=login(admin)
    )

    assert response.status_code == 404
    assert response.json() == golden_error(golden)


def test_a_recipe_naming_an_unknown_inventory_item_is_not_found_and_saves_nothing(
    client, admin, login, demo_menu
):
    auth = login(admin)
    body = {
        "ingredients": [
            {"inventory_item_id": demo_menu["خبز"], "amount": 3},
            {"inventory_item_id": 9999, "amount": 1},
        ]
    }

    response = client.post(
        f"/inventory/recipe/{demo_menu['برجر']}",
        body,
        content_type="application/json",
        headers=auth,
    )

    assert response.status_code == 404
    assert response.json() == LINKED_ITEM_NOT_FOUND
    assert len(recipe_of(client, auth, demo_menu["برجر"])) == 2  # the old Recipe stands


def test_a_recipe_cannot_consume_another_restaurants_inventory(client, admin, other_admin, login):
    """Isolation matrix item 7: the other Restaurant's Inventory item is not there. This
    Restaurant holds no Inventory, so the foreign id cannot collide with one of its own."""
    foreign_id = add_inventory_item(client, login(other_admin), "سماق", "كغم", 5, 1)
    auth = login(admin)
    dish = add_menu_item(client, auth, "كولا", 1.5, "مشروبات")

    response = client.post(
        f"/inventory/recipe/{dish}",
        {"ingredients": [{"inventory_item_id": foreign_id, "amount": 1}]},
        content_type="application/json",
        headers=auth,
    )

    assert response.status_code == 404
    assert response.json() == LINKED_ITEM_NOT_FOUND
    assert recipe_of(client, auth, dish) == []


def test_a_recipe_names_each_inventory_item_once(client, admin, login, demo_menu):
    body = {
        "ingredients": [
            {"inventory_item_id": demo_menu["خبز"], "amount": 1},
            {"inventory_item_id": demo_menu["خبز"], "amount": 2},
        ]
    }

    response = client.post(
        f"/inventory/recipe/{demo_menu['كولا']}",
        body,
        content_type="application/json",
        headers=login(admin),
    )

    assert response.status_code == 400
    assert response.json() == refusal("مادة المخزون مكررة في الوصفة")


def test_saving_a_recipe_is_refused_for_cashiers(client, cashier, admin, login, demo_menu):
    response = client.post(
        f"/inventory/recipe/{demo_menu['كولا']}",
        {"ingredients": [{"inventory_item_id": demo_menu["خبز"], "amount": 1}]},
        content_type="application/json",
        headers=login(cashier),
    )

    assert response.status_code == 403
    assert response.json() == ADMIN_ONLY


# --- the menu's stock fields (spec stories 13 and 18) -----------------------------------------


def test_max_qty_is_the_fewest_servings_any_ingredient_allows(client, admin, login, demo_menu):
    """برجر: 20 kg / 0.2 = 100 servings of meat, 50 / 1 = 50 of bread; the golden edit set meat
    to 19 and bread to 45, hence the recorded 45. Here bread is the limit at 50."""
    burger = menu_item(client, login(admin), "برجر")

    assert burger["out_of_stock"] is False
    assert burger["max_qty"] == 50


def test_an_item_is_out_of_stock_when_one_ingredient_cannot_cover_a_serving(
    client, admin, login, demo_menu
):
    pasta = menu_item(client, login(admin), "باستا")  # 1 kg of طماطم, 2 kg per serving

    assert pasta["out_of_stock"] is True
    assert pasta["max_qty"] == 0


def test_an_item_without_a_recipe_is_never_out_of_stock(client, admin, login, demo_menu):
    cola = menu_item(client, login(admin), "كولا")

    assert cola["out_of_stock"] is False
    assert cola["max_qty"] is None


def test_a_variant_inherits_its_parents_recipe(client, admin, login, demo_menu):
    """Spec story 13: برجر دبل has no Recipe of its own and shows برجر's stock."""
    variant = menu_item(client, login(admin), "برجر دبل")

    assert variant["out_of_stock"] is False
    assert variant["max_qty"] == 50


def test_a_variant_with_its_own_recipe_does_not_inherit(client, admin, login, demo_menu):
    auth = login(admin)

    save_recipe(client, auth, demo_menu["برجر دبل"], [(demo_menu["لحم بقري"], 0.4)])

    assert menu_item(client, auth, "برجر دبل")["max_qty"] == 50  # 20 kg / 0.4
    assert menu_item(client, auth, "برجر")["max_qty"] == 50  # the parent is untouched


def test_a_variant_inherits_out_of_stock_too(client, admin, login, demo_menu):
    auth = login(admin)
    add_menu_item(client, auth, "باستا كبيرة", 9, "وجبات", parent_id=demo_menu["باستا"])

    assert menu_item(client, auth, "باستا كبيرة")["out_of_stock"] is True


def test_customers_see_the_stock_fields_by_slug(client, demo_menu):
    """Spec story 42: the QR menu carries Out of stock flags and maximum quantities."""
    menu = client.get("/menu?r=waheed").json()["menu"]

    pasta = next(dish for dish in menu if dish["name"] == "باستا")
    assert pasta["out_of_stock"] is True and pasta["max_qty"] == 0


# --- Low stock (spec story 17) -----------------------------------------------------------------


def test_low_stock_is_quantity_at_or_below_the_minimum(client, admin, login, demo_menu, restaurant):
    """No route lists Low stock today (the inventory page derives it); the Report agent's tool
    (ticket 11) reads it through the service, so the rule is pinned here."""
    auth = login(admin)
    client.put(
        f"/inventory/{demo_menu['خبز']}",
        {"name": "خبز", "unit": "قطعة", "quantity": 10, "min_quantity": 10},  # at the minimum
        content_type="application/json",
        headers=auth,
    )

    with schema_context(restaurant.schema_name):
        low = [item.name for item in low_stock_items()]

    assert low == ["خبز", "جبن", "طماطم"]


# --- the legacy deduct route is gone (grilling Q12) --------------------------------------------


def test_the_legacy_deduct_route_is_gone(client, admin, login, demo_menu):
    golden = legacy_golden("POST /inventory/deduct/{order_id}")

    response = client.post(golden.path, headers=login(admin))

    assert response.status_code == 404


# --- isolation (plan §3.9, item 7) --------------------------------------------------------------


def test_inventory_ids_from_another_restaurant_are_not_found(client, admin, other_admin, login):
    foreign_id = add_inventory_item(client, login(other_admin), "سماق", "كغم", 5, 1)
    auth = login(admin)  # this Restaurant holds no Inventory, so the id cannot be its own
    body = {"name": "مسروق", "unit": "كغم", "quantity": 0, "min_quantity": 0}

    edited = client.put(
        f"/inventory/{foreign_id}", body, content_type="application/json", headers=auth
    )
    deleted = client.delete(f"/inventory/{foreign_id}", headers=auth)

    assert edited.status_code == deleted.status_code == 404
    assert edited.json() == deleted.json() == INVENTORY_ITEM_NOT_FOUND
    assert [item["name"] for item in inventory_of(client, login(other_admin))] == ["سماق"]


def test_an_id_that_exists_in_both_restaurants_only_ever_reaches_the_callers_own(
    client, admin, other_admin, login
):
    """Schemas start their ids at 1, so the first Inventory item of each Restaurant shares an id;
    the caller's schema decides which one a route touches."""
    own_id = add_inventory_item(client, login(admin), "لحم", "كغم", 5, 1)
    foreign_id = add_inventory_item(client, login(other_admin), "سماق", "كغم", 5, 1)
    assert own_id == foreign_id

    response = client.delete(f"/inventory/{own_id}", headers=login(admin))

    assert response.status_code == 200
    assert inventory_of(client, login(admin)) == []
    assert [item["name"] for item in inventory_of(client, login(other_admin))] == ["سماق"]


def test_each_restaurant_sees_only_its_own_inventory(client, admin, other_admin, login, demo_menu):
    add_inventory_item(client, login(other_admin), "سماق", "كغم", 5, 1)

    assert [item["name"] for item in inventory_of(client, login(other_admin))] == ["سماق"]
    assert "سماق" not in [item["name"] for item in inventory_of(client, login(admin))]


def test_a_recipe_of_another_restaurants_dish_is_not_found(client, admin, other_admin, login):
    foreign_dish = add_menu_item(client, login(other_admin), "شاورما", 3, "وجبات")

    response = client.get(f"/inventory/recipe/{foreign_dish}", headers=login(admin))

    assert response.status_code == 404
    assert response.json() == ITEM_NOT_FOUND

"""Table layout: routes 36 and 37 (plan §1.3; spec stories 19, 20).

The tables page saves the whole plan and reads it back; a Cashier reads it for the order drawer.
"""

import pytest

from tests.golden import assert_matches_golden, legacy_golden, refusal

pytestmark = pytest.mark.django_db

ADMIN_ONLY = refusal("هذه العملية لمدير المطعم فقط")
NO_TOKEN = refusal("توكن غير موجود")

DEMO_LAYOUT = legacy_golden("POST /table-layout/save").body["elements"]


def save_layout(client, auth: dict, elements: list):
    return client.post(
        "/table-layout/save",
        {"elements": elements},
        content_type="application/json",
        headers=auth,
    )


def layout_of(client, auth: dict) -> list:
    response = client.get("/table-layout", headers=auth)
    assert response.status_code == 200, response.content
    return response.json()["elements"]


@pytest.fixture
def saved_layout(client, admin, login):
    """The plan the goldens were recorded with, saved through the API."""
    response = save_layout(client, login(admin), DEMO_LAYOUT)
    assert response.status_code == 200, response.content
    return DEMO_LAYOUT


# --- GET /table-layout -----------------------------------------------------------------------


def test_the_layout_matches_the_golden(client, admin, login, saved_layout):
    golden = legacy_golden("GET /table-layout")

    response = client.get(golden.path, headers=login(admin))

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)


def test_the_layout_comes_back_as_saved_in_order(client, admin, login, saved_layout):
    elements = layout_of(client, login(admin))

    assert elements == saved_layout
    assert [el["element_id"] for el in elements] == ["t-1", "t-2", "t-3", "w-1", "d-1"]


def test_an_empty_layout_is_an_empty_list(client, admin, login):
    assert layout_of(client, login(admin)) == []


def test_a_cashier_reads_the_layout(client, cashier, admin, login, saved_layout):
    response = client.get("/table-layout", headers=login(cashier))

    assert response.status_code == 200
    assert len(response.json()["elements"]) == 5


def test_the_layout_needs_a_token(client, saved_layout):
    """Not one of the five customer routes: a Slug alone is refused."""
    assert client.get("/table-layout").status_code == 401
    response = client.get("/table-layout?r=waheed")

    assert response.status_code == 401
    assert response.json() == NO_TOKEN


def test_a_super_admin_reads_the_layout_of_the_restaurant_they_name(
    client, super_admin, login, saved_layout, restaurant
):
    response = client.get(
        "/table-layout", headers={**login(super_admin), "X-Restaurant-Id": str(restaurant.pk)}
    )

    assert response.status_code == 200
    assert len(response.json()["elements"]) == 5


# --- POST /table-layout/save -----------------------------------------------------------------


def test_saving_the_layout_matches_the_golden(client, admin, login):
    golden = legacy_golden("POST /table-layout/save")

    response = client.post(
        golden.path, golden.body, content_type="application/json", headers=login(admin)
    )

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert response.json()["message"] == "تم حفظ المخطط"


def test_saving_replaces_the_whole_layout(client, admin, login, saved_layout):
    auth = login(admin)
    smaller = [saved_layout[0], saved_layout[4]]

    save_layout(client, auth, smaller)

    assert layout_of(client, auth) == smaller


def test_saving_an_empty_list_clears_the_layout(client, admin, login, saved_layout):
    auth = login(admin)

    response = save_layout(client, auth, [])

    assert response.status_code == 200
    assert layout_of(client, auth) == []


def test_walls_and_doors_may_omit_table_fields(client, admin, login):
    auth = login(admin)
    wall = {"element_id": "w-9", "element_type": "wall", "x": 0, "y": 0, "w": 10, "h": 100}

    response = save_layout(client, auth, [wall])

    assert response.status_code == 200
    assert layout_of(client, auth) == [
        {**wall, "table_number": None, "capacity": None, "label": ""}
    ]


def test_a_null_label_is_stored_as_an_empty_string(client, admin, login):
    auth = login(admin)
    door = {
        "element_id": "d-9",
        "element_type": "door",
        "x": 0,
        "y": 0,
        "w": 10,
        "h": 10,
        "label": None,
    }

    save_layout(client, auth, [door])

    assert layout_of(client, auth)[0]["label"] == ""


def test_coordinates_keep_their_decimals(client, admin, login):
    auth = login(admin)
    table = {
        "element_id": "t-9",
        "element_type": "table",
        "x": 12.5,
        "y": 7.25,
        "w": 90,
        "h": 90,
        "table_number": 9,
        "capacity": 4,
        "label": "الشرفة",
    }

    save_layout(client, auth, [table])

    assert layout_of(client, auth) == [table]


def test_a_malformed_element_is_refused_and_the_old_layout_stands(
    client, admin, login, saved_layout
):
    auth = login(admin)

    response = save_layout(client, auth, [{"element_id": "t-9", "element_type": "table"}])

    assert response.status_code == 400
    assert layout_of(client, auth) == saved_layout


def test_saving_is_refused_for_cashiers(client, cashier, admin, login, saved_layout):
    response = save_layout(client, login(cashier), [])

    assert response.status_code == 403
    assert response.json() == ADMIN_ONLY
    assert len(layout_of(client, login(admin))) == 5


def test_saving_needs_a_token(client, saved_layout):
    response = client.post(
        "/table-layout/save?r=waheed", {"elements": []}, content_type="application/json"
    )

    assert response.status_code == 401
    assert response.json() == NO_TOKEN


# --- isolation (plan §3.9, items 1 and 4) ----------------------------------------------------


def test_each_restaurant_has_its_own_layout(client, admin, other_admin, login, saved_layout):
    other = login(other_admin)
    assert layout_of(client, other) == []
    table = {**saved_layout[0], "element_id": "x-1", "label": "شاورما هاوس"}

    save_layout(client, other, [table])

    assert layout_of(client, other) == [table]
    assert layout_of(client, login(admin)) == saved_layout


def test_clearing_one_restaurants_layout_leaves_the_others(
    client, admin, other_admin, login, saved_layout
):
    save_layout(client, login(other_admin), [saved_layout[0]])

    save_layout(client, login(admin), [])

    assert layout_of(client, login(admin)) == []
    assert len(layout_of(client, login(other_admin))) == 1

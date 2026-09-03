"""Golden fixtures captured from the legacy API, and the helper that compares responses to them.

The fixtures under tests/goldens/legacy/ are the contract every later ticket preserves. See
tests/goldens/README.md for how they were captured and which routes are compared loosely.
"""

import json

import pytest

from tests.golden import (
    LEGACY_GOLDEN_DIR,
    LEGACY_ROUTES,
    assert_matches_golden,
    legacy_golden,
    load_legacy_goldens,
    route_pattern,
)

FIXTURE_KEYS = {"route", "case", "method", "path", "headers", "body", "status", "response"}
HTTP_METHODS = {"GET", "POST", "PUT", "DELETE"}


def test_every_legacy_route_has_a_success_fixture():
    covered = {golden.route for golden in load_legacy_goldens() if golden.case == "success"}

    assert len(LEGACY_ROUTES) == 42
    assert covered == set(LEGACY_ROUTES)


@pytest.mark.parametrize("file", sorted(LEGACY_GOLDEN_DIR.glob("*.json")), ids=lambda f: f.stem)
def test_fixture_is_well_formed(file):
    raw = json.loads(file.read_text(encoding="utf-8"))

    assert set(raw) == FIXTURE_KEYS
    assert raw["method"] in HTTP_METHODS
    assert raw["route"] in LEGACY_ROUTES
    assert raw["route"].startswith(raw["method"] + " ")
    assert route_pattern(raw["route"]).match(raw["path"].split("?")[0])
    assert file.stem.startswith(f"{LEGACY_ROUTES.index(raw['route']) + 1:02d}-")
    assert raw["case"].split(":")[0] in {"success", "failure"}
    assert all(isinstance(k, str) and isinstance(v, str) for k, v in raw["headers"].items())
    assert raw["headers"].get("Authorization", "Bearer <").startswith("Bearer <"), "redact tokens"
    assert raw["body"] is None or isinstance(raw["body"], dict)
    assert isinstance(raw["status"], int) and 100 <= raw["status"] <= 599
    assert isinstance(raw["response"], dict)
    assert raw["response"].get("token", "<jwt>") == "<jwt>", "redact tokens"


def test_root_golden_is_the_legacy_health_body():
    golden = legacy_golden("GET /")

    assert golden.status == 200
    assert golden.response == {"message": "Waheed System Running!", "status": "ok"}


ORDER = {
    "id": 7,
    "table_number": 3,
    "total_price": 6500.0,
    "status": "preparing",
    "created_at": "2026-09-04T10:00:00Z",
    "items": [{"name": "برجر", "price": 5000.0}],
    "cashier": "cashier",
    "notes": "",
    "payment_method": None,
}


def test_same_shape_with_different_volatile_values_matches():
    actual = {
        **ORDER,
        "id": 99,
        "total_price": 1,
        "created_at": "2030-01-01T00:00:00Z",
        "items": [{"name": "شاي", "price": 1000}, {"name": "كولا", "price": 1500.5}],
        "payment_method": "cash",
    }

    assert_matches_golden(actual, ORDER)


def test_missing_key_fails():
    actual = {key: value for key, value in ORDER.items() if key != "notes"}

    with pytest.raises(AssertionError, match="notes"):
        assert_matches_golden(actual, ORDER)


def test_extra_key_fails():
    with pytest.raises(AssertionError, match="surprise"):
        assert_matches_golden({**ORDER, "surprise": 1}, ORDER)


def test_changed_value_type_fails():
    with pytest.raises(AssertionError, match=r"\$\.status"):
        assert_matches_golden({**ORDER, "status": 200}, ORDER)


@pytest.mark.parametrize("key", ["message", "error", "detail"])
def test_user_facing_text_must_be_identical(key):
    with pytest.raises(AssertionError, match=key):
        assert_matches_golden({key: "تم حفظ الطلب"}, {key: "تم حفظ الطلب!"})


def test_user_facing_text_that_matches_passes():
    assert_matches_golden(
        {"message": "تم حفظ الطلب!", "order_id": 3}, {"message": "تم حفظ الطلب!", "order_id": 9}
    )


def test_null_is_compatible_with_any_value_in_either_direction():
    assert_matches_golden({"payment_method": None}, {"payment_method": "cash"})
    assert_matches_golden({"payment_method": "card"}, {"payment_method": None})


def test_bool_is_not_a_number():
    with pytest.raises(AssertionError, match="is_available"):
        assert_matches_golden({"is_available": 1}, {"is_available": True})


def test_every_list_element_follows_the_first_golden_element():
    with pytest.raises(AssertionError, match=r"\$\.items\[1\]"):
        assert_matches_golden(
            {**ORDER, "items": [{"name": "شاي", "price": 1000}, {"name": "كولا"}]}, ORDER
        )


def test_empty_list_fails_when_the_golden_has_elements():
    with pytest.raises(AssertionError, match=r"\$\.items"):
        assert_matches_golden({**ORDER, "items": []}, ORDER)


def test_route_pattern_matches_concrete_paths_only_for_its_template():
    assert route_pattern("PUT /menu/{item_id}").match("/menu/7")
    assert not route_pattern("PUT /menu/{item_id}").match("/menu/7/toggle")
    assert route_pattern("PUT /menu/{item_id}/toggle").match("/menu/7/toggle")

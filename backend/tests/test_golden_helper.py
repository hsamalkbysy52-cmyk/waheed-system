"""The comparator: same keys and kinds, identical user-facing text, volatile values ignored."""

import pytest

from tests.golden import assert_matches_golden, fixture_name, route_pattern

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


def test_changed_value_kind_fails():
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


def test_null_where_the_golden_never_shows_null_fails():
    with pytest.raises(AssertionError, match=r"\$\.total_price"):
        assert_matches_golden({**ORDER, "total_price": None}, ORDER)


def test_null_in_the_golden_accepts_any_value():
    assert_matches_golden({"payment_method": "cash"}, {"payment_method": None})


def test_null_is_accepted_where_any_golden_element_shows_null():
    golden = {"menu": [{"max_qty": 45}, {"max_qty": None}]}

    assert_matches_golden({"menu": [{"max_qty": None}, {"max_qty": 3}]}, golden)


def test_bool_is_not_a_number():
    with pytest.raises(AssertionError, match="is_available"):
        assert_matches_golden({"is_available": 1}, {"is_available": True})


def test_every_list_element_follows_the_golden_elements():
    with pytest.raises(AssertionError, match=r"\$\.items\[1\]"):
        assert_matches_golden(
            {**ORDER, "items": [{"name": "شاي", "price": 1000}, {"name": "كولا"}]}, ORDER
        )


def test_key_seen_in_only_some_golden_elements_is_optional():
    golden = {"orders": [{"id": 1, "fraud_alert": "x"}, {"id": 2}]}

    assert_matches_golden({"orders": [{"id": 3}]}, golden)


def test_top_level_list_must_have_elements_when_the_golden_does():
    with pytest.raises(AssertionError, match=r"\$\.items"):
        assert_matches_golden({**ORDER, "items": []}, ORDER)


def test_list_inside_an_element_may_be_empty():
    golden = {"menu": [{"id": 1, "modifiers": [{"id": 1, "name": "الإضافات"}]}]}

    assert_matches_golden({"menu": [{"id": 2, "modifiers": []}]}, golden)


def test_route_pattern_matches_concrete_paths_only_for_its_template():
    assert route_pattern("PUT /menu/{item_id}").match("/menu/7")
    assert not route_pattern("PUT /menu/{item_id}").match("/menu/7/toggle")
    assert route_pattern("PUT /menu/{item_id}/toggle").match("/menu/7/toggle")


def test_fixture_name_encodes_route_position_method_path_and_case():
    assert fixture_name("GET /", "success") == "01-get-root.json"
    assert (
        fixture_name("POST /orders/{order_id}/cancel", "success:fraud-alert")
        == "28-post-orders-order_id-cancel--fraud-alert.json"
    )

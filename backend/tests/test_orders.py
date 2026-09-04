"""Orders, stock and payments: routes 16, 17 and 21 to 28 (plan §1.3; spec stories 28 to 37).

Shapes and Arabic messages come from the legacy goldens; failures answer real status codes
(tests/goldens/README.md). Stock effects are asserted through ``GET /inventory``.
"""

import re
import threading

import pytest
from django.db import connection
from django.test import Client
from django_tenants.utils import schema_context

from tests.conftest import (
    add_inventory_item,
    add_menu_item,
    create_order,
    modifier_line,
    order_by_id,
    order_line,
    orders_of,
    save_recipe,
    stock_of,
)
from tests.golden import assert_matches_golden, golden_error, legacy_golden, refusal

pytestmark = pytest.mark.django_db

NOT_FOUND = refusal("الطلب غير موجود")
NOT_FOUND_ALT = refusal("الطلب مو موجود")
CLOSED = refusal("الطلب مغلق ولا يمكن تغييره")
ALREADY_CANCELLED = refusal("الطلب ملغي مسبقاً")
NOT_EDITABLE = refusal("لا يمكن تعديل الطلب بعد إعداده")
STAFF_ONLY = refusal("هذه العملية لموظفي المطعم فقط")
NO_TOKEN = refusal("توكن غير موجود")
ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def burger(demo_menu: dict, *modifiers) -> dict:
    return order_line("برجر", 5, "وجبات", modifiers)


def cola() -> dict:
    return order_line("كولا", 1.5, "مشروبات")


def pasta() -> dict:
    return order_line("باستا", 6, "وجبات")


def extra_cheese(demo_menu: dict) -> dict:
    return modifier_line("جبن إضافي", 0.75, demo_menu["جبن"], 1)


def no_bread(demo_menu: dict) -> dict:
    return modifier_line("بدون خبز", 0, demo_menu["خبز"], -1)


def put(client, auth: dict, path: str, body: dict = None):
    return client.put(path, body, content_type="application/json", headers=auth)


@pytest.fixture
def staff(client, cashier, admin, login, demo_menu):
    """The Cashier's header, with the demo menu, inventory and Recipes in place."""
    return login(cashier)


# --- POST /orders/create ----------------------------------------------------------------------


def test_creating_an_order_matches_the_golden(client, staff, demo_menu):
    golden = legacy_golden("POST /orders/create")
    body = dict(golden.body)
    body["items"][0]["modifiers"][0]["inventory_item_id"] = demo_menu["جبن"]

    response = client.post(golden.path, body, content_type="application/json", headers=staff)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert response.json()["message"] == "تم حفظ الطلب!"
    assert response.json()["total"] == 6500


def test_a_new_order_is_preparing_with_its_lines_captured(client, staff, demo_menu):
    lines = [burger(demo_menu, extra_cheese(demo_menu)), cola()]

    created = create_order(client, staff, lines, table_number=3, notes="بدون بصل")

    order = order_by_id(client, staff, created["order_id"])
    assert order["status"] == "preparing"
    assert order["table_number"] == 3
    assert order["total_price"] == 6.5  # the sum of the line prices (deltas folded in)
    assert order["items"] == lines
    assert order["notes"] == "بدون بصل"
    assert order["cashier"] == "cashier"  # the token's username when the payload names none
    assert order["payment_method"] is None
    assert ISO_UTC.match(order["created_at"])


def test_the_payload_may_name_the_cashier_and_prepay(client, staff, demo_menu):
    created = create_order(client, staff, [cola()], cashier="سارة", payment_method="card")

    order = order_by_id(client, staff, created["order_id"])
    assert order["cashier"] == "سارة"
    assert order["payment_method"] == "card"


def test_an_order_without_lines_is_refused(client, staff):
    response = client.post(
        "/orders/create", {"items": []}, content_type="application/json", headers=staff
    )

    assert response.status_code == 400


def test_creating_an_order_takes_the_recipe_from_stock(client, staff, admin, login, demo_menu):
    create_order(client, staff, [burger(demo_menu), burger(demo_menu)])

    stock = stock_of(client, login(admin))
    assert stock["لحم بقري"] == 19.6  # 2 × 0.2
    assert stock["خبز"] == 48  # 2 × 1
    assert stock["جبن"] == 3  # no option chose it


def test_a_positive_option_delta_takes_more_stock(client, staff, admin, login, demo_menu):
    create_order(client, staff, [burger(demo_menu, extra_cheese(demo_menu))])

    assert stock_of(client, login(admin))["جبن"] == 2


def test_a_negative_option_delta_spares_the_recipe_floored_at_zero(
    client, staff, admin, login, demo_menu
):
    """Grilling Q9: "without bread" takes no bread, and never puts bread back."""
    create_order(client, staff, [burger(demo_menu, no_bread(demo_menu))])

    stock = stock_of(client, login(admin))
    assert stock["خبز"] == 50
    assert stock["لحم بقري"] == 19.8


def test_a_variant_takes_its_parents_recipe(client, staff, admin, login, demo_menu):
    create_order(client, staff, [order_line("برجر دبل", 7.5, "وجبات")])

    stock = stock_of(client, login(admin))
    assert stock["لحم بقري"] == 19.8 and stock["خبز"] == 49


def test_a_line_without_a_recipe_takes_nothing(client, staff, admin, login, demo_menu):
    create_order(client, staff, [cola(), order_line("شيء غير موجود", 1)])

    assert stock_of(client, login(admin)) == {"لحم بقري": 20, "خبز": 50, "جبن": 3, "طماطم": 1}


def test_insufficient_stock_matches_the_golden_and_saves_nothing(
    client, staff, admin, login, demo_menu
):
    golden = legacy_golden("POST /orders/create", "failure:insufficient-stock")

    response = client.post(golden.path, golden.body, content_type="application/json", headers=staff)

    assert response.status_code == 400
    assert response.json() == golden_error(golden)  # "مخزون غير كافٍ: باستا"
    assert orders_of(client, staff) == []
    assert stock_of(client, login(admin))["طماطم"] == 1


def test_a_shortage_names_every_short_item_once_and_takes_nothing(
    client, staff, admin, login, demo_menu
):
    """Two باستا need 4 kg of طماطم and there is 1; the burgers in the same Order are not taken."""
    body = {"items": [pasta(), burger(demo_menu), pasta()]}

    response = client.post("/orders/create", body, content_type="application/json", headers=staff)

    assert response.status_code == 400
    assert response.json() == refusal("مخزون غير كافٍ: باستا")
    assert stock_of(client, login(admin))["لحم بقري"] == 20


def test_the_last_unit_goes_to_one_order_only(client, staff, admin, login, demo_menu):
    auth = login(admin)
    put(
        client,
        auth,
        f"/inventory/{demo_menu['طماطم']}",
        {"name": "طماطم", "unit": "كغم", "quantity": 2, "min_quantity": 2},
    )

    create_order(client, staff, [pasta()])
    response = client.post(
        "/orders/create", {"items": [pasta()]}, content_type="application/json", headers=staff
    )

    assert response.status_code == 400
    assert stock_of(client, auth)["طماطم"] == 0


def test_a_replayed_idempotency_key_returns_the_original_order(
    client, staff, admin, login, demo_menu
):
    golden = legacy_golden("POST /orders/create", "success:idempotent-replay")
    body = dict(golden.body)
    body["items"][0]["modifiers"][0]["inventory_item_id"] = demo_menu["جبن"]

    first = client.post(golden.path, body, content_type="application/json", headers=staff)
    replay = client.post(golden.path, body, content_type="application/json", headers=staff)

    assert replay.status_code == 200
    assert_matches_golden(replay.json(), golden.response)
    assert replay.json() == first.json()
    assert len(orders_of(client, staff)) == 1
    assert stock_of(client, login(admin))["جبن"] == 2  # taken once


def test_different_idempotency_keys_are_different_orders(client, staff, demo_menu):
    create_order(client, staff, [cola()], client_id="a" * 36)
    create_order(client, staff, [cola()], client_id="b" * 36)

    assert len(orders_of(client, staff)) == 2


def test_the_same_idempotency_key_may_be_used_by_two_restaurants(
    client, staff, other_admin, login, demo_menu
):
    key = "00000001-0000-4000-8000-000000000000"
    create_order(client, staff, [cola()], client_id=key)

    created = create_order(client, login(other_admin), [order_line("شاورما", 3)], client_id=key)

    assert [order["id"] for order in orders_of(client, login(other_admin))] == [created["order_id"]]


@pytest.mark.django_db(transaction=True)
def test_two_cashiers_cannot_oversell_the_last_unit(client, staff, admin, login, demo_menu):
    """Spec story 29: two Orders for the last serving at the same time, one wins, one is refused.

    Real transactions and two threads, each with its own connection, so the row lock is exercised
    rather than simulated.
    """
    auth = login(admin)
    put(
        client,
        auth,
        f"/inventory/{demo_menu['طماطم']}",
        {"name": "طماطم", "unit": "كغم", "quantity": 2, "min_quantity": 2},
    )
    results, barrier = [], threading.Barrier(2)

    def order_pasta(client_id: str) -> None:
        try:
            barrier.wait(timeout=5)
            response = Client().post(
                "/orders/create",
                {"items": [pasta()], "client_id": client_id},
                content_type="application/json",
                headers=staff,
            )
            results.append(response.status_code)
        finally:
            connection.close()

    threads = [threading.Thread(target=order_pasta, args=(f"race-{n}",)) for n in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)

    assert sorted(results) == [200, 400]
    assert stock_of(client, auth)["طماطم"] == 0
    assert len(orders_of(client, staff)) == 1


# --- GET /orders ------------------------------------------------------------------------------


def test_the_orders_match_the_golden(client, staff, demo_menu):
    create_order(
        client, staff, [burger(demo_menu, extra_cheese(demo_menu)), cola()], notes="بدون بصل"
    )
    paid = create_order(client, staff, [cola()])["order_id"]
    put(client, staff, f"/orders/{paid}/pay", {"payment_method": "card"})
    put(client, staff, f"/orders/{paid}/done")
    golden = legacy_golden("GET /orders")

    response = client.get(golden.path, headers=staff)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)


def test_staff_see_every_order_in_id_order(client, staff, demo_menu):
    first = create_order(client, staff, [cola()])["order_id"]
    second = create_order(client, staff, [cola()])["order_id"]
    client.delete(f"/orders/{first}", headers=staff)

    orders = orders_of(client, staff)

    assert [order["id"] for order in orders] == [first, second]
    assert [order["status"] for order in orders] == ["cancelled", "preparing"]


def test_an_admin_reads_the_orders_too(client, admin, login, staff, demo_menu):
    create_order(client, staff, [cola()])

    assert len(orders_of(client, login(admin))) == 1


def test_orders_without_a_token_or_slug_are_refused(client, restaurant):
    response = client.get("/orders")

    assert response.status_code == 400
    assert response.json() == refusal("المطعم غير محدد")


def test_a_super_admin_is_not_restaurant_staff_for_orders(client, super_admin, login, restaurant):
    headers = {**login(super_admin), "X-Restaurant-Id": str(restaurant.pk)}

    response = client.get("/orders", headers=headers)

    assert response.status_code == 403
    assert response.json() == STAFF_ONLY


# --- status transitions (routes 21, 22, 25, 27) -----------------------------------------------


def test_marking_ready_matches_the_golden(client, staff, demo_menu):
    golden = legacy_golden("PUT /orders/{order_id}/ready")
    order_id = create_order(client, staff, [cola()])["order_id"]

    response = put(client, staff, f"/orders/{order_id}/ready")

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert order_by_id(client, staff, order_id)["status"] == "ready"


def test_marking_an_unknown_order_ready_is_not_found(client, staff):
    golden = legacy_golden("PUT /orders/{order_id}/ready", "failure:not-found")

    response = put(client, staff, golden.path)

    assert response.status_code == 404
    assert response.json() == golden_error(golden)  # "الطلب مو موجود"


def test_sending_an_order_back_to_preparing_matches_the_golden(client, staff, demo_menu):
    golden = legacy_golden("PUT /orders/{order_id}/preparing")
    order_id = create_order(client, staff, [cola()])["order_id"]
    put(client, staff, f"/orders/{order_id}/ready")

    response = put(client, staff, f"/orders/{order_id}/preparing")

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert order_by_id(client, staff, order_id)["status"] == "preparing"


def test_marking_served_matches_the_golden(client, staff, demo_menu):
    golden = legacy_golden("PUT /orders/{order_id}/served")
    order_id = create_order(client, staff, [cola()])["order_id"]
    put(client, staff, f"/orders/{order_id}/ready")

    response = put(client, staff, f"/orders/{order_id}/served")

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert order_by_id(client, staff, order_id)["status"] == "served"


def test_closing_an_order_matches_the_golden(client, staff, demo_menu):
    golden = legacy_golden("PUT /orders/{order_id}/done")
    order_id = create_order(client, staff, [cola()])["order_id"]
    put(client, staff, f"/orders/{order_id}/pay", {"payment_method": "cash"})

    response = put(client, staff, f"/orders/{order_id}/done")

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    closed = order_by_id(client, staff, order_id)
    assert closed["status"] == "done" and closed["payment_method"] == "cash"


@pytest.mark.parametrize("route", ["ready", "preparing", "served", "done"])
def test_a_done_order_is_final(client, staff, demo_menu, route):
    order_id = create_order(client, staff, [cola()])["order_id"]
    put(client, staff, f"/orders/{order_id}/done")

    response = put(client, staff, f"/orders/{order_id}/{route}")

    assert response.status_code == 400
    assert response.json() == CLOSED
    assert order_by_id(client, staff, order_id)["status"] == "done"


@pytest.mark.parametrize("route", ["ready", "preparing", "served", "done"])
def test_a_cancelled_order_is_final(client, staff, demo_menu, route):
    order_id = create_order(client, staff, [cola()])["order_id"]
    client.delete(f"/orders/{order_id}", headers=staff)

    response = put(client, staff, f"/orders/{order_id}/{route}")

    assert response.status_code == 400
    assert response.json() == CLOSED


@pytest.mark.parametrize("route", ["preparing", "served", "done"])
def test_unknown_orders_are_not_found_with_the_legacy_spelling(client, staff, route):
    response = put(client, staff, f"/orders/9999/{route}")

    assert response.status_code == 404
    assert response.json() in (NOT_FOUND, NOT_FOUND_ALT)


# --- PUT /orders/{order_id} (edit) ------------------------------------------------------------


def test_editing_an_order_matches_the_golden_and_rebalances_stock(
    client, staff, admin, login, demo_menu
):
    golden = legacy_golden("PUT /orders/{order_id}")
    order_id = create_order(client, staff, [burger(demo_menu)], table_number=3)["order_id"]

    response = put(client, staff, f"/orders/{order_id}", golden.body)  # two burgers now

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert response.json()["order_id"] == order_id
    edited = order_by_id(client, staff, order_id)
    assert [line["name"] for line in edited["items"]] == ["برجر", "برجر"]
    assert edited["total_price"] == 10000 and edited["notes"] == "تعديل: برجرين"
    stock = stock_of(client, login(admin))
    assert stock["لحم بقري"] == 19.6 and stock["خبز"] == 48


def test_editing_gives_back_what_the_old_lines_took(client, staff, admin, login, demo_menu):
    order_id = create_order(client, staff, [burger(demo_menu), burger(demo_menu)])["order_id"]

    put(client, staff, f"/orders/{order_id}", {"items": [cola()], "table_number": 1, "notes": ""})

    stock = stock_of(client, login(admin))
    assert stock["لحم بقري"] == 20 and stock["خبز"] == 50


def test_editing_with_a_shortage_changes_nothing(client, staff, admin, login, demo_menu):
    order_id = create_order(client, staff, [burger(demo_menu)])["order_id"]

    response = put(client, staff, f"/orders/{order_id}", {"items": [pasta()], "table_number": 1})

    assert response.status_code == 400
    assert response.json() == refusal("مخزون غير كافٍ: باستا")
    assert [line["name"] for line in order_by_id(client, staff, order_id)["items"]] == ["برجر"]
    assert stock_of(client, login(admin))["لحم بقري"] == 19.8


def test_an_order_that_is_not_preparing_cannot_be_edited(client, staff, demo_menu):
    golden = legacy_golden("PUT /orders/{order_id}", "failure:not-preparing")
    order_id = create_order(client, staff, [cola()])["order_id"]
    put(client, staff, f"/orders/{order_id}/ready")

    response = put(client, staff, f"/orders/{order_id}", golden.body)

    assert response.status_code == 400
    assert response.json() == golden_error(golden)


def test_editing_an_unknown_order_is_not_found(client, staff):
    response = put(client, staff, "/orders/9999", {"items": [cola()], "table_number": 1})

    assert response.status_code == 404
    assert response.json() == NOT_FOUND


# --- PUT /orders/{order_id}/pay ---------------------------------------------------------------


def test_recording_payment_matches_the_golden_and_keeps_the_status(client, staff, demo_menu):
    golden = legacy_golden("PUT /orders/{order_id}/pay")
    order_id = create_order(client, staff, [cola()])["order_id"]

    response = put(client, staff, f"/orders/{order_id}/pay", golden.body)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    paid = order_by_id(client, staff, order_id)
    assert paid["payment_method"] == "card" and paid["status"] == "preparing"


def test_recording_payment_is_idempotent(client, staff, demo_menu):
    order_id = create_order(client, staff, [cola()])["order_id"]

    for _ in range(3):
        assert (
            put(client, staff, f"/orders/{order_id}/pay", {"payment_method": "qr"}).status_code
            == 200
        )

    assert order_by_id(client, staff, order_id)["payment_method"] == "qr"


def test_payment_defaults_to_cash(client, staff, demo_menu):
    order_id = create_order(client, staff, [cola()])["order_id"]

    put(client, staff, f"/orders/{order_id}/pay", {})

    assert order_by_id(client, staff, order_id)["payment_method"] == "cash"


def test_an_unknown_payment_method_is_refused(client, staff, demo_menu):
    order_id = create_order(client, staff, [cola()])["order_id"]

    response = put(client, staff, f"/orders/{order_id}/pay", {"payment_method": "gold"})

    assert response.status_code == 400


def test_a_cancelled_order_cannot_be_paid(client, staff, demo_menu):
    order_id = create_order(client, staff, [cola()])["order_id"]
    client.delete(f"/orders/{order_id}", headers=staff)

    response = put(client, staff, f"/orders/{order_id}/pay", {"payment_method": "cash"})

    assert response.status_code == 400
    assert response.json() == CLOSED


def test_paying_an_unknown_order_is_not_found(client, staff):
    response = put(client, staff, "/orders/9999/pay", {"payment_method": "cash"})

    assert response.status_code == 404
    assert response.json() == NOT_FOUND


# --- DELETE /orders/{order_id} (cancel, route 24) ---------------------------------------------


def test_deleting_an_order_matches_the_golden_and_cancels_it(client, staff, demo_menu):
    golden = legacy_golden("DELETE /orders/{order_id}")
    order_id = create_order(client, staff, [cola()])["order_id"]

    response = client.delete(f"/orders/{order_id}", headers=staff)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert response.json()["order_id"] == order_id
    assert order_by_id(client, staff, order_id)["status"] == "cancelled"


def test_cancelling_while_preparing_returns_the_stock(client, staff, admin, login, demo_menu):
    order_id = create_order(client, staff, [burger(demo_menu, extra_cheese(demo_menu))])["order_id"]

    client.delete(f"/orders/{order_id}", headers=staff)

    assert stock_of(client, login(admin)) == {"لحم بقري": 20, "خبز": 50, "جبن": 3, "طماطم": 1}


def test_cancelling_after_preparing_returns_nothing(client, staff, admin, login, demo_menu):
    """Grilling Q8: made food is not counted back into the store."""
    order_id = create_order(client, staff, [burger(demo_menu)])["order_id"]
    put(client, staff, f"/orders/{order_id}/ready")

    client.delete(f"/orders/{order_id}", headers=staff)

    stock = stock_of(client, login(admin))
    assert stock["لحم بقري"] == 19.8 and stock["خبز"] == 49


def test_deleting_an_unknown_order_is_not_found(client, staff):
    response = client.delete("/orders/9999", headers=staff)

    assert response.status_code == 404
    assert response.json() == NOT_FOUND


def test_deleting_a_cancelled_order_again_is_refused(client, staff, demo_menu):
    order_id = create_order(client, staff, [cola()])["order_id"]
    client.delete(f"/orders/{order_id}", headers=staff)

    response = client.delete(f"/orders/{order_id}", headers=staff)

    assert response.status_code == 400
    assert response.json() == ALREADY_CANCELLED


def test_a_done_order_cannot_be_cancelled(client, staff, demo_menu):
    order_id = create_order(client, staff, [cola()])["order_id"]
    put(client, staff, f"/orders/{order_id}/done")

    assert client.delete(f"/orders/{order_id}", headers=staff).status_code == 400
    assert (
        client.post(f"/orders/{order_id}/cancel?cashier=cashier", headers=staff).status_code == 400
    )


# --- POST /orders/{order_id}/cancel (route 28) -------------------------------------------------


def test_cancelling_matches_the_golden(client, staff, demo_menu):
    golden = legacy_golden("POST /orders/{order_id}/cancel")
    order_id = create_order(client, staff, [cola()])["order_id"]

    response = client.post(f"/orders/{order_id}/cancel?cashier=cashier", headers=staff)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert response.json() == {"message": "تم إلغاء الطلب!", "order_id": order_id}
    assert order_by_id(client, staff, order_id)["status"] == "cancelled"


def test_cancelling_from_ready_and_served_is_allowed(client, staff, demo_menu):
    ready = create_order(client, staff, [cola()])["order_id"]
    served = create_order(client, staff, [cola()])["order_id"]
    put(client, staff, f"/orders/{ready}/ready")
    put(client, staff, f"/orders/{served}/served")

    for order_id in (ready, served):
        assert client.post(f"/orders/{order_id}/cancel", headers=staff).status_code == 200


def test_cancelling_a_cancelled_order_matches_the_golden(client, staff, demo_menu):
    golden = legacy_golden("POST /orders/{order_id}/cancel", "failure:already-cancelled")
    order_id = create_order(client, staff, [cola()])["order_id"]
    client.post(f"/orders/{order_id}/cancel?cashier=cashier", headers=staff)

    response = client.post(f"/orders/{order_id}/cancel?cashier=cashier", headers=staff)

    assert response.status_code == 400
    assert response.json() == golden_error(golden)


def test_cancelling_an_unknown_order_is_not_found(client, staff):
    response = client.post("/orders/9999/cancel?cashier=cashier", headers=staff)

    assert response.status_code == 404
    assert response.json() == NOT_FOUND_ALT


def test_the_third_cancellation_within_an_hour_matches_the_fraud_golden(client, staff, demo_menu):
    """Spec story 48: three or more cancellations by one Cashier within an hour trip the rule."""
    golden = legacy_golden("POST /orders/{order_id}/cancel", "success:fraud-alert")
    ids = [create_order(client, staff, [cola()])["order_id"] for _ in range(3)]

    responses = [client.post(f"/orders/{i}/cancel?cashier=cashier", headers=staff) for i in ids]

    assert [r.status_code for r in responses] == [200, 200, 200]
    assert "fraud_alert" not in responses[0].json() and "fraud_alert" not in responses[1].json()
    assert_matches_golden(responses[2].json(), golden.response)
    assert responses[2].json()["fraud_alert"] == golden.response["fraud_alert"]


def test_the_log_names_the_token_holder_not_the_query_parameter(client, staff, demo_menu):
    ids = [create_order(client, staff, [cola()])["order_id"] for _ in range(3)]

    responses = [client.post(f"/orders/{i}/cancel?cashier=someone", headers=staff) for i in ids]

    assert responses[2].json()["fraud_alert"].startswith("⚠️ cashier ألغى")


def test_both_cancel_routes_count_toward_the_rule(client, staff, demo_menu):
    ids = [create_order(client, staff, [cola()])["order_id"] for _ in range(3)]
    client.delete(f"/orders/{ids[0]}", headers=staff)
    client.delete(f"/orders/{ids[1]}", headers=staff)

    response = client.post(f"/orders/{ids[2]}/cancel", headers=staff)

    assert "fraud_alert" in response.json()


def test_cancellations_older_than_an_hour_do_not_count(client, staff, demo_menu, restaurant):
    from datetime import timedelta

    from django.utils import timezone

    from orders.models import CancellationLog

    ids = [create_order(client, staff, [cola()])["order_id"] for _ in range(3)]
    client.post(f"/orders/{ids[0]}/cancel", headers=staff)
    client.post(f"/orders/{ids[1]}/cancel", headers=staff)
    with schema_context(restaurant.schema_name):
        CancellationLog.objects.update(cancelled_at=timezone.now() - timedelta(hours=2))

    response = client.post(f"/orders/{ids[2]}/cancel", headers=staff)

    assert "fraud_alert" not in response.json()


def test_two_cashiers_cancellations_are_counted_apart(client, staff, admin, login, demo_menu):
    ids = [create_order(client, staff, [cola()])["order_id"] for _ in range(3)]
    client.post(f"/orders/{ids[0]}/cancel", headers=staff)
    client.post(f"/orders/{ids[1]}/cancel", headers=staff)

    response = client.post(f"/orders/{ids[2]}/cancel", headers=login(admin))

    assert "fraud_alert" not in response.json()


# --- isolation (plan §3.9, items 1 and 7) -----------------------------------------------------


def test_each_restaurant_sees_only_its_own_orders(client, staff, other_admin, login, demo_menu):
    create_order(client, staff, [cola()])
    other = login(other_admin)
    create_order(client, other, [order_line("شاورما", 3)])

    assert [order["items"][0]["name"] for order in orders_of(client, staff)] == ["كولا"]
    assert [order["items"][0]["name"] for order in orders_of(client, other)] == ["شاورما"]


def test_order_ids_from_another_restaurant_are_not_found(client, staff, other_admin, login):
    foreign = create_order(client, login(other_admin), [order_line("شاورما", 3)])["order_id"]

    responses = [
        put(client, staff, f"/orders/{foreign}/ready"),
        put(client, staff, f"/orders/{foreign}/pay", {"payment_method": "cash"}),
        put(client, staff, f"/orders/{foreign}", {"items": [cola()], "table_number": 1}),
        client.delete(f"/orders/{foreign}", headers=staff),
        client.post(f"/orders/{foreign}/cancel", headers=staff),
    ]

    assert [r.status_code for r in responses] == [404] * 5
    assert order_by_id(client, login(other_admin), foreign)["status"] == "preparing"


def test_an_orders_stock_comes_from_its_own_restaurant(
    client, staff, other_admin, login, demo_menu
):
    """The other Restaurant's Inventory is untouched by this Restaurant's Orders, even when the
    payload names an Inventory item id that exists over there."""
    other = login(other_admin)
    add_inventory_item(client, other, "لحم", "كغم", 10, 1)
    dish = add_menu_item(client, other, "شاورما", 3, "وجبات")
    save_recipe(client, other, dish, [(1, 1)])

    create_order(client, staff, [burger(demo_menu, modifier_line("x", 0, 1, 5))])

    assert stock_of(client, other)["لحم"] == 10

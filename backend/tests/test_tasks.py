"""Background work runs inside the right Restaurant (ADR-0003; plan §3.9, item 10) and the Fraud
alert reaches the owner through the configured sender (spec story 48).

Celery runs eagerly under the test settings, so a ``.delay()`` has finished when it returns.
"""

import pytest
from django.db import connection

from core.tasks import UnknownSchema, tenant_task
from messaging.senders import RecordingSender
from orders.models import Order
from tests.conftest import create_order, order_line, orders_of

pytestmark = pytest.mark.django_db


@tenant_task
def file_test_order(table_number: int) -> str:
    """A task that writes into whatever schema it runs in, so leaks would be visible."""
    Order.objects.create(table_number=table_number, items=[])
    return connection.schema_name


# --- the tenant task wrapper ---------------------------------------------------------------------


def test_a_tenant_task_runs_inside_the_named_schema(client, admin, login, restaurant):
    result = file_test_order.delay(restaurant.schema_name, 7)

    assert result.get() == restaurant.schema_name
    assert [order["table_number"] for order in orders_of(client, login(admin))] == [7]


def test_a_task_enqueued_for_restaurant_a_writes_nothing_into_b(
    client, admin, other_admin, login, restaurant, other_restaurant
):
    """Isolation matrix item 10."""
    file_test_order.delay(restaurant.schema_name, 7)

    assert len(orders_of(client, login(admin))) == 1
    assert orders_of(client, login(other_admin)) == []


def test_a_tenant_task_leaves_the_connection_where_it_found_it(restaurant):
    connection.set_schema_to_public()

    file_test_order.delay(restaurant.schema_name, 1)

    assert connection.schema_name == "public"


def test_a_tenant_task_refuses_an_unknown_schema(db):
    with pytest.raises(UnknownSchema):
        file_test_order.delay("r_000000000000", 1)


def test_the_schema_name_is_the_first_argument_by_construction(restaurant):
    with pytest.raises(TypeError):
        file_test_order.delay()


# --- the Fraud alert -----------------------------------------------------------------------------


@pytest.fixture
def owner_phone(restaurant):
    restaurant.phone = "+962790000000"
    restaurant.save(update_fields=["phone"])
    return restaurant.phone


def three_cancellations(client, auth: dict, route: str) -> list:
    ids = [create_order(client, auth, [order_line("كولا", 1.5)])["order_id"] for _ in range(3)]
    responses = []
    for order_id in ids:
        if route == "delete":
            responses.append(client.delete(f"/orders/{order_id}", headers=auth))
        else:
            responses.append(client.post(f"/orders/{order_id}/cancel", headers=auth))
    return responses


def test_the_third_cancellation_alerts_the_owner(client, cashier, login, demo_menu, owner_phone):
    responses = three_cancellations(client, login(cashier), "cancel")

    assert [len(RecordingSender.sent)] == [1]
    sent = RecordingSender.sent[0]
    assert sent.to == owner_phone
    assert sent.text.startswith("🚨 تحذير احتيال - مطعم Waheed Restaurant\n")
    assert "الكاشير 'cashier' ألغى 3 طلبات خلال ساعة واحدة." in sent.text
    assert f"آخر إلغاء: طلب #{responses[2].json()['order_id']}" in sent.text
    assert "الوقت: " in sent.text


def test_the_delete_route_alerts_too(client, cashier, login, demo_menu, owner_phone):
    three_cancellations(client, login(cashier), "delete")

    assert len(RecordingSender.sent) == 1


def test_no_alert_below_the_threshold(client, cashier, login, demo_menu, owner_phone):
    auth = login(cashier)
    for order_id in [
        create_order(client, auth, [order_line("كولا", 1.5)])["order_id"] for _ in range(2)
    ]:
        client.post(f"/orders/{order_id}/cancel", headers=auth)

    assert RecordingSender.sent == []


def test_without_an_owner_phone_the_alert_is_only_logged(
    client, cashier, login, demo_menu, restaurant, caplog
):
    assert restaurant.phone == ""

    with caplog.at_level("WARNING", logger="waheed.orders"):
        responses = three_cancellations(client, login(cashier), "cancel")

    assert "fraud_alert" in responses[2].json()  # the response still flags it
    assert RecordingSender.sent == []
    assert any("logged only" in record.message for record in caplog.records)


def test_the_alert_is_sent_from_the_restaurants_own_schema(
    client, cashier, other_admin, login, demo_menu, owner_phone, other_restaurant
):
    """The task counts cancellations inside the caller's schema: the other Restaurant's
    cancellations are not its business."""
    other = login(other_admin)
    other_ids = [
        create_order(client, other, [order_line("شاورما", 3)])["order_id"] for _ in range(2)
    ]
    for order_id in other_ids:
        client.post(f"/orders/{order_id}/cancel", headers=other)

    three_cancellations(client, login(cashier), "cancel")

    assert len(RecordingSender.sent) == 1
    assert "ألغى 3 طلبات" in RecordingSender.sent[0].text

"""The customer channel: Slug-resolved orders, the offline gate and the Restaurant's status
(plan §1.3, routes 16, 17, 19, 20; plan §3.9 items 3 and 4; spec stories 42 to 45), plus the
quantity-based ``POST /orders`` that the Chat agent's proposals are confirmed through.
"""

import pytest

from tests.conftest import create_order, order_line, orders_of, stock_of
from tests.golden import assert_matches_golden, golden_error, legacy_golden, refusal

pytestmark = pytest.mark.django_db

NO_TOKEN = refusal("توكن غير موجود")
NO_RESTAURANT = refusal("المطعم غير محدد")
UNAVAILABLE = refusal("المطعم غير متاح حالياً")
OFFLINE = refusal("الطلب الإلكتروني غير متاح حالياً، الرجاء الطلب من الكاشير مباشرة.")
CUSTOMER_KEYS = {"id", "table_number", "status"}


def customer_post(client, path: str, body: dict, slug: str = "waheed"):
    return client.post(
        path, body, content_type="application/json", headers={"X-Restaurant-Slug": slug}
    )


@pytest.fixture
def online(client, cashier, login, demo_menu):
    """A Cashier's device has just sent a Heartbeat: the Restaurant is Online."""
    auth = login(cashier)
    assert client.post("/heartbeat", headers=auth).status_code == 200
    return auth


# --- GET /orders by Slug (spec story 45) ----------------------------------------------------------


def test_customers_see_only_that_a_table_has_open_orders(client, online, demo_menu):
    golden = legacy_golden("GET /orders")
    create_order(client, online, [order_line("كولا", 1.5)], table_number=2, notes="سر")
    done = create_order(client, online, [order_line("كولا", 1.5)], table_number=5)["order_id"]
    client.put(f"/orders/{done}/done", headers=online)
    redacted_shape = {
        "orders": [{k: v for k, v in golden.response["orders"][0].items() if k in CUSTOMER_KEYS}]
    }

    response = client.get("/orders?r=waheed")

    assert response.status_code == 200
    assert_matches_golden(response.json(), redacted_shape)
    assert response.json()["orders"] == [
        {"id": response.json()["orders"][0]["id"], "table_number": 2, "status": "preparing"}
    ]


def test_the_slug_header_works_like_the_query_parameter(client, online, demo_menu):
    create_order(client, online, [order_line("كولا", 1.5)], table_number=2)

    response = client.get("/orders", headers={"X-Restaurant-Slug": "waheed"})

    assert response.status_code == 200
    assert set(response.json()["orders"][0]) == CUSTOMER_KEYS


def test_customers_of_another_slug_see_that_restaurants_orders_only(
    client, online, other_admin, login, demo_menu
):
    """Isolation matrix item 4: ``GET /orders?r=B`` is B's redacted rows."""
    create_order(client, online, [order_line("كولا", 1.5)], table_number=2)
    create_order(client, login(other_admin), [order_line("شاورما", 3)], table_number=7)

    response = client.get("/orders?r=r-other")

    assert [order["table_number"] for order in response.json()["orders"]] == [7]


# --- POST /orders/create and /orders/qr-create by Slug (spec stories 43, 44) ----------------------


def test_a_customer_order_matches_the_golden_when_online(client, online, demo_menu):
    golden = legacy_golden("POST /orders/qr-create")

    response = customer_post(client, "/orders/create", golden.body)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert response.json()["total"] == 1500


def test_qr_create_is_an_alias(client, online, demo_menu):
    golden = legacy_golden("POST /orders/qr-create")

    response = customer_post(client, golden.path, golden.body)

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)


def test_a_customer_order_records_qr_as_cashier_and_ignores_payment(client, online, demo_menu):
    body = {
        "table_number": 2,
        "items": [order_line("كولا", 1.5)],
        "notes": "بدون ثلج",
        "cashier": "hacker",
        "payment_method": "cash",
    }

    created = customer_post(client, "/orders/create", body).json()

    order = next(o for o in orders_of(client, online) if o["id"] == created["order_id"])
    assert order["cashier"] == "QR"
    assert order["payment_method"] is None
    assert order["notes"] == "بدون ثلج"
    assert order["status"] == "preparing"


def test_a_customer_order_takes_stock_like_any_other(client, online, admin, login, demo_menu):
    customer_post(client, "/orders/create", {"table_number": 1, "items": [order_line("برجر", 5)]})

    stock = stock_of(client, login(admin))
    assert stock["لحم بقري"] == 19.8 and stock["خبز"] == 49


def test_a_customer_order_is_refused_while_offline(client, demo_menu):
    golden = legacy_golden("POST /orders/qr-create", "failure:restaurant-offline")

    response = customer_post(client, golden.path, golden.body)

    assert response.status_code == 503
    assert response.json() == golden_error(golden)


def test_the_offline_gate_covers_both_creation_paths(client, admin, login, demo_menu):
    body = {"table_number": 2, "items": [order_line("كولا", 1.5)]}

    assert customer_post(client, "/orders/create", body).status_code == 503
    assert customer_post(client, "/orders/qr-create", body).status_code == 503
    assert orders_of(client, login(admin)) == []


def test_a_cashier_may_order_while_the_restaurant_is_offline(client, cashier, login, demo_menu):
    """The counter works offline; only the customer channel is gated (plan §1.3, route 17)."""
    created = create_order(client, login(cashier), [order_line("كولا", 1.5)])

    assert created["message"] == "تم حفظ الطلب!"


def test_a_customer_order_reaches_the_slugs_restaurant_only(
    client, online, other_admin, other_restaurant, login, demo_menu
):
    """Isolation matrix item 4: ``POST /orders/create?r=B`` lands in B."""
    other_restaurant.last_heartbeat_at = None
    client.post("/heartbeat", headers=login(other_admin))

    response = client.post(
        "/orders/create?r=r-other",
        {"table_number": 4, "items": [order_line("شاورما", 3)]},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert [o["table_number"] for o in orders_of(client, login(other_admin))] == [4]
    assert orders_of(client, online) == []


# --- GET /restaurant/status (route 19) ------------------------------------------------------------


def test_the_status_matches_the_golden_when_online(client, online):
    golden = legacy_golden("GET /restaurant/status")

    response = client.get(f"{golden.path}?r=waheed")

    assert response.status_code == 200
    assert_matches_golden(response.json(), golden.response)
    assert response.json()["online"] is True


def test_the_status_is_offline_without_a_recent_heartbeat(client, restaurant):
    response = client.get("/restaurant/status", headers={"X-Restaurant-Slug": "waheed"})

    assert response.status_code == 200
    assert response.json() == {"online": False, "last_heartbeat_at": None}


def test_the_status_is_per_restaurant(client, online, other_restaurant):
    assert client.get("/restaurant/status?r=waheed").json()["online"] is True
    assert client.get("/restaurant/status?r=r-other").json()["online"] is False


def test_an_old_heartbeat_does_not_count(client, online, restaurant):
    from datetime import timedelta

    from django.utils import timezone

    restaurant.last_heartbeat_at = timezone.now() - timedelta(seconds=91)
    restaurant.save(update_fields=["last_heartbeat_at"])

    assert client.get("/restaurant/status?r=waheed").json()["online"] is False


# --- the customer guards (plan §3.9, item 3; spec stories 44) -------------------------------------


@pytest.mark.parametrize(
    "method, path",
    [
        ("get", "/orders"),
        ("post", "/orders/create"),
        ("post", "/orders/qr-create"),
        ("get", "/restaurant/status"),
    ],
)
def test_a_customer_route_without_a_slug_is_refused(client, restaurant, method, path):
    response = getattr(client, method)(path, {}, content_type="application/json")

    assert response.status_code == 400
    assert response.json() == NO_RESTAURANT


@pytest.mark.parametrize(
    "method, path",
    [
        ("get", "/orders"),
        ("post", "/orders/create"),
        ("get", "/restaurant/status"),
        ("get", "/menu"),
    ],
)
def test_a_suspended_restaurant_is_unavailable_to_customers(
    client, restaurant, suspend, method, path
):
    suspend(restaurant)

    response = getattr(client, method)(f"{path}?r=waheed", {}, content_type="application/json")

    assert response.status_code == 403
    assert response.json() == UNAVAILABLE


@pytest.mark.parametrize(
    "method, path",
    [
        ("post", "/orders"),
        ("put", "/orders/1/ready"),
        ("put", "/orders/1/pay"),
        ("delete", "/orders/1"),
        ("post", "/orders/1/cancel"),
        ("post", "/heartbeat"),
        ("get", "/inventory"),
        ("get", "/table-layout"),
        ("post", "/menu/add"),
    ],
)
def test_every_other_restaurant_route_refuses_slug_only_callers(client, restaurant, method, path):
    response = getattr(client, method)(f"{path}?r=waheed", {}, content_type="application/json")

    assert response.status_code == 401
    assert response.json() == NO_TOKEN


# --- POST /orders: quantity-based lines at menu prices (spec story 39) ----------------------------


def post_orders(client, auth: dict, body: dict):
    return client.post("/orders", body, content_type="application/json", headers=auth)


def test_a_quantity_order_expands_lines_at_menu_prices(client, cashier, login, demo_menu):
    auth = login(cashier)
    body = {
        "table_number": 4,
        "items": [{"name": "برجر", "quantity": 2, "price": 0.001}, {"name": "كولا", "quantity": 1}],
    }

    response = post_orders(client, auth, body)

    assert response.status_code == 200
    created = response.json()
    assert created["order_id"] == created["id"]
    assert created["message"] == "تم حفظ الطلب!"
    assert created["total"] == 11.5  # 2 × 5 + 1.5 from the menu, not the payload
    order = next(o for o in orders_of(client, auth) if o["id"] == created["id"])
    assert [(line["name"], line["price"]) for line in order["items"]] == [
        ("برجر", 5),
        ("برجر", 5),
        ("كولا", 1.5),
    ]
    assert order["table_number"] == 4 and order["cashier"] == "cashier"


def test_a_quantity_order_takes_stock(client, cashier, admin, login, demo_menu):
    post_orders(client, login(cashier), {"items": [{"name": "برجر", "quantity": 2}]})

    assert stock_of(client, login(admin))["لحم بقري"] == 19.6


def test_a_quantity_order_names_an_unknown_item(client, cashier, login, demo_menu):
    response = post_orders(client, login(cashier), {"items": [{"name": "سوشي", "quantity": 1}]})

    assert response.status_code == 404
    assert response.json() == refusal("الصنف غير موجود في القائمة: سوشي")


def test_a_quantity_order_needs_a_positive_quantity(client, cashier, login, demo_menu):
    response = post_orders(client, login(cashier), {"items": [{"name": "كولا", "quantity": 0}]})

    assert response.status_code == 400
    assert response.json() == refusal("الكمية يجب أن تكون 1 أو أكثر")


def test_a_quantity_order_is_refused_when_stock_is_short(client, cashier, login, demo_menu):
    response = post_orders(client, login(cashier), {"items": [{"name": "باستا", "quantity": 1}]})

    assert response.status_code == 400
    assert response.json() == refusal("مخزون غير كافٍ: باستا")


def test_a_quantity_order_needs_a_staff_token(client, super_admin, login, restaurant, online):
    body = {"items": [{"name": "كولا", "quantity": 1}]}

    anonymous = client.post("/orders?r=waheed", body, content_type="application/json")
    platform = client.post(
        "/orders",
        body,
        content_type="application/json",
        headers={**login(super_admin), "X-Restaurant-Id": str(restaurant.pk)},
    )

    assert anonymous.status_code == 401 and anonymous.json() == NO_TOKEN
    assert platform.status_code == 403


def test_a_quantity_order_replays_on_its_idempotency_key(client, cashier, login, demo_menu):
    auth = login(cashier)
    body = {"items": [{"name": "كولا", "quantity": 1}], "client_id": "chat-1"}

    first = post_orders(client, auth, body).json()
    replay = post_orders(client, auth, body).json()

    assert replay == first
    assert len(orders_of(client, auth)) == 1

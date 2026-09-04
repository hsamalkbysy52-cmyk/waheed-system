"""The WhatsApp Cloud API channel (ADR-0004; plan §6.4; spec stories 46, 47).

Meta's webhook is exercised with signed deliveries; the Chat agent is the scripted fake and the
outbound sender the recorder, so nothing reaches Meta or a model.
"""

import hashlib
import hmac
import json

import pytest
from django_tenants.utils import schema_context

from ai.models import ConversationState
from ai.providers.fake import FakeProvider
from messaging.senders import RecordingSender
from tenants.models import WhatsAppAccount
from tests.conftest import orders_of

pytestmark = pytest.mark.django_db

WEBHOOK = "/webhooks/whatsapp"
APP_SECRET = "test-app-secret"
PHONE_NUMBER_ID = "111222333"
CUSTOMER = "962790000001"


def scripted(intent: str, reply: str, items: list = ()) -> str:
    return json.dumps({"intent": intent, "reply": reply, "items": list(items)}, ensure_ascii=False)


def delivery(
    text: str, message_id: str = "wamid.1", phone_number_id: str = PHONE_NUMBER_ID
) -> dict:
    """A webhook payload the way Meta sends a text message."""
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WABA",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "15550000000",
                                "phone_number_id": phone_number_id,
                            },
                            "contacts": [{"profile": {"name": "زبون"}, "wa_id": CUSTOMER}],
                            "messages": [
                                {
                                    "from": CUSTOMER,
                                    "id": message_id,
                                    "timestamp": "1",
                                    "type": "text",
                                    "text": {"body": text},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }


def sign(body: bytes, secret: str = APP_SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post_webhook(client, payload: dict, signature=None):
    body = json.dumps(payload).encode()
    headers = {"X-Hub-Signature-256": sign(body) if signature is None else signature}
    return client.post(WEBHOOK, body, content_type="application/json", headers=headers)


@pytest.fixture
def connected(restaurant):
    """The demo Restaurant with a connected WhatsApp number."""
    return WhatsAppAccount.objects.create(
        restaurant=restaurant,
        phone_number_id=PHONE_NUMBER_ID,
        display_phone="15550000000",
        access_token="EAAtoken",
        owner_phone="962790000009",
    )


@pytest.fixture
def online(client, cashier, login, demo_menu, connected):
    assert client.post("/heartbeat", headers=login(cashier)).status_code == 200
    return login(cashier)


# --- verification and signatures ------------------------------------------------------------------


def test_meta_verification_echoes_the_challenge(client, db):
    response = client.get(
        f"{WEBHOOK}?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345"
    )

    assert response.status_code == 200
    assert response.content == b"12345"
    assert response["Content-Type"].startswith("text/plain")


def test_a_wrong_verify_token_is_forbidden(client, db):
    response = client.get(f"{WEBHOOK}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1")

    assert response.status_code == 403


def test_a_bad_signature_is_forbidden_and_ignored(client, connected, demo_menu):
    FakeProvider.script("gemini", scripted("chat", "never"))

    response = post_webhook(client, delivery("مرحبا"), signature=sign(b"other body"))

    assert response.status_code == 403
    assert RecordingSender.sent == [] and FakeProvider.calls == []


def test_a_missing_signature_is_forbidden(client, connected, demo_menu):
    response = client.post(WEBHOOK, json.dumps(delivery("مرحبا")), content_type="application/json")

    assert response.status_code == 403


# --- inbound messages ----------------------------------------------------------------------------


def test_a_signed_message_is_answered_by_the_chat_agent(client, connected, demo_menu, restaurant):
    FakeProvider.script("gemini", scripted("chat", "أهلاً! كيف أساعدك؟"))

    response = post_webhook(client, delivery("مرحبا"))

    assert response.status_code == 200
    assert RecordingSender.sent == [(CUSTOMER, "أهلاً! كيف أساعدك؟")]
    with schema_context(restaurant.schema_name):
        assert (
            ConversationState.objects.get(key=f"wa:{CUSTOMER}").messages[-1]["content"]
            == "أهلاً! كيف أساعدك؟"
        )


def test_the_conversation_runs_in_the_right_restaurant(
    client, connected, demo_menu, restaurant, other_restaurant
):
    FakeProvider.script("gemini", scripted("chat", "ok"))

    post_webhook(client, delivery("مرحبا"))

    with schema_context(other_restaurant.schema_name):
        assert ConversationState.objects.count() == 0
    menu = json.loads(FakeProvider.calls[0][1].messages[0].content.split("\n", 1)[1])["menu"]
    assert "برجر" in [row["name"] for row in menu]  # the demo Restaurant's menu, not the other's


def test_an_unknown_number_is_acknowledged_and_ignored(client, connected, demo_menu):
    FakeProvider.script("gemini", scripted("chat", "never"))

    response = post_webhook(client, delivery("مرحبا", phone_number_id="999"))

    assert response.status_code == 200
    assert RecordingSender.sent == [] and FakeProvider.calls == []


def test_a_disabled_number_is_ignored(client, connected, demo_menu):
    connected.enabled = False
    connected.save(update_fields=["enabled"])

    post_webhook(client, delivery("مرحبا"))

    assert RecordingSender.sent == []


def test_statuses_and_media_are_ignored(client, connected, demo_menu):
    payload = delivery("x")
    payload["entry"][0]["changes"][0]["value"]["messages"][0] = {
        "from": CUSTOMER,
        "id": "m",
        "type": "image",
        "image": {},
    }
    payload["entry"][0]["changes"][0]["value"]["statuses"] = [
        {"id": "wamid.9", "status": "delivered"}
    ]

    response = post_webhook(client, payload)

    assert response.status_code == 200
    assert RecordingSender.sent == []


def test_a_redelivered_message_is_processed_once(client, connected, demo_menu):
    FakeProvider.script("gemini", scripted("chat", "1"), scripted("chat", "2"))

    post_webhook(client, delivery("مرحبا", message_id="wamid.same"))
    post_webhook(client, delivery("مرحبا", message_id="wamid.same"))

    assert RecordingSender.sent == [(CUSTOMER, "1")]


def test_a_busy_assistant_is_told_to_the_customer(client, connected, demo_menu):
    from ai.providers.base import ProviderBusy

    FakeProvider.script("gemini", ProviderBusy("429"))
    FakeProvider.script("openai", ProviderBusy("503"))

    post_webhook(client, delivery("مرحبا"))

    assert RecordingSender.sent == [(CUSTOMER, "المساعد مشغول، حاول بعد قليل")]


# --- ordering over WhatsApp (spec story 47) -------------------------------------------------------


def test_a_proposal_waits_for_yes_then_becomes_an_order(client, online, demo_menu, restaurant):
    FakeProvider.script(
        "gemini",
        scripted(
            "order",
            "برجرين وكولا بـ 11.5 دينار",
            [{"name": "برجر", "quantity": 2}, {"name": "كولا", "quantity": 1}],
        ),
    )

    post_webhook(client, delivery("بدي برجرين وكولا", message_id="wamid.ask"))
    assert (
        RecordingSender.sent[-1].text
        == "برجرين وكولا بـ 11.5 دينار\nأرسل «نعم» لتأكيد الطلب أو عدّل طلبك."
    )
    assert orders_of(client, online) == []

    post_webhook(client, delivery("نعم", message_id="wamid.yes"))

    orders = orders_of(client, online)
    assert len(orders) == 1
    order = orders[0]
    assert order["cashier"] == "WhatsApp" and order["table_number"] == 0
    assert [line["name"] for line in order["items"]] == ["برجر", "برجر", "كولا"]
    assert order["total_price"] == 11.5
    assert order["notes"] == f"طلب واتساب من {CUSTOMER}"
    assert (
        RecordingSender.sent[-1].text
        == f"تم تأكيد طلبك رقم #{order['id']} وسيصلك قريباً. بالعافية!\nالإجمالي: 11.500 JOD"
    )
    assert len(FakeProvider.calls) == 1  # the confirmation never asked the model


def test_a_redelivered_confirmation_does_not_duplicate_the_order(client, online, demo_menu):
    FakeProvider.script("gemini", scripted("order", "كولا", [{"name": "كولا", "quantity": 1}]))
    post_webhook(client, delivery("كولا", message_id="wamid.ask"))

    post_webhook(client, delivery("نعم", message_id="wamid.yes"))
    post_webhook(client, delivery("نعم", message_id="wamid.yes"))

    assert len(orders_of(client, online)) == 1


def test_confirming_while_offline_is_refused(client, connected, demo_menu, admin, login):
    FakeProvider.script("gemini", scripted("order", "كولا", [{"name": "كولا", "quantity": 1}]))
    post_webhook(client, delivery("كولا", message_id="wamid.ask"))

    post_webhook(client, delivery("نعم", message_id="wamid.yes"))

    assert (
        RecordingSender.sent[-1].text
        == "الطلب الإلكتروني غير متاح حالياً، الرجاء الطلب من الكاشير مباشرة."
    )
    assert orders_of(client, login(admin)) == []


def test_a_new_message_instead_of_yes_goes_back_to_the_agent(client, online, demo_menu):
    FakeProvider.script(
        "gemini",
        scripted("order", "كولا", [{"name": "كولا", "quantity": 1}]),
        scripted("chat", "تمام، ألغيت الطلب"),
    )
    post_webhook(client, delivery("كولا", message_id="m1"))

    post_webhook(client, delivery("لا خلص", message_id="m2"))
    post_webhook(client, delivery("نعم", message_id="m3"))  # nothing pending any more

    assert RecordingSender.sent[-2].text == "تمام، ألغيت الطلب"
    assert len(FakeProvider.calls) == 3  # the last "yes" was ordinary chat
    assert orders_of(client, online) == []


def test_a_shortage_is_reported_in_arabic(client, online, admin, login, demo_menu):
    """The agent proposed a burger; the meat ran out before the customer said yes."""
    FakeProvider.script("gemini", scripted("order", "برجر", [{"name": "برجر", "quantity": 1}]))
    post_webhook(client, delivery("برجر", message_id="m1"))
    client.put(
        f"/inventory/{demo_menu['لحم بقري']}",
        {"name": "لحم بقري", "unit": "كغم", "quantity": 0, "min_quantity": 5},
        content_type="application/json",
        headers=login(admin),
    )

    post_webhook(client, delivery("نعم", message_id="m2"))

    assert RecordingSender.sent[-1].text == "مخزون غير كافٍ: برجر"


# --- the owner's alerts go to the WhatsApp owner phone --------------------------------------------


def test_fraud_alerts_go_to_the_whatsapp_owner_phone(client, cashier, login, demo_menu, connected):
    from tests.conftest import create_order, order_line

    auth = login(cashier)
    for _ in range(3):
        order_id = create_order(client, auth, [order_line("كولا", 1.5)])["order_id"]
        client.post(f"/orders/{order_id}/cancel", headers=auth)

    assert RecordingSender.sent[-1].to == "962790000009"
    assert "تحذير احتيال" in RecordingSender.sent[-1].text


# --- the Cloud API sender -------------------------------------------------------------------------


class FakeGraph:
    def __init__(self):
        self.posts = []

    def __call__(self, url, json=None, headers=None, timeout=None):
        self.posts.append((url, json, headers))

        class Response:
            def raise_for_status(self):
                pass

        return Response()


def test_the_sender_posts_a_text_message_for_the_current_restaurant(
    connected, restaurant, monkeypatch
):
    from messaging import whatsapp

    graph = FakeGraph()
    monkeypatch.setattr(whatsapp.httpx, "post", graph)

    with schema_context(restaurant.schema_name):
        whatsapp.WhatsAppSender().send(CUSTOMER, "أهلاً")

    url, payload, headers = graph.posts[0]
    assert url == f"https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages"
    assert payload == {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": CUSTOMER,
        "type": "text",
        "text": {"body": "أهلاً"},
    }
    assert headers == {"Authorization": "Bearer EAAtoken"}


def test_the_sender_uses_the_template_for_alerts_when_configured(
    connected, restaurant, monkeypatch, settings
):
    from messaging import whatsapp

    settings.WHATSAPP_FRAUD_ALERT_TEMPLATE = "fraud_alert"
    graph = FakeGraph()
    monkeypatch.setattr(whatsapp.httpx, "post", graph)

    with schema_context(restaurant.schema_name):
        whatsapp.WhatsAppSender().send_alert(
            "962790000009", "text", ["Waheed", "cashier", "3", "7"]
        )

    template = graph.posts[0][1]["template"]
    assert template["name"] == "fraud_alert" and template["language"] == {"code": "ar"}
    assert [p["text"] for p in template["components"][0]["parameters"]] == [
        "Waheed",
        "cashier",
        "3",
        "7",
    ]


def test_alerts_are_only_logged_without_an_approved_template(
    connected, restaurant, monkeypatch, caplog
):
    from messaging import whatsapp

    graph = FakeGraph()
    monkeypatch.setattr(whatsapp.httpx, "post", graph)

    with (
        schema_context(restaurant.schema_name),
        caplog.at_level("WARNING", logger="waheed.messaging"),
    ):
        whatsapp.WhatsAppSender().send_alert("962790000009", "text", [])

    assert graph.posts == []
    assert any("logged only" in record.message for record in caplog.records)


def test_a_restaurant_without_a_number_sends_nothing(restaurant, monkeypatch, caplog):
    from messaging import whatsapp

    graph = FakeGraph()
    monkeypatch.setattr(whatsapp.httpx, "post", graph)

    with schema_context(restaurant.schema_name), caplog.at_level("INFO", logger="waheed.messaging"):
        whatsapp.WhatsAppSender().send(CUSTOMER, "x")

    assert graph.posts == []


def test_a_graph_api_failure_is_logged_not_raised(connected, restaurant, monkeypatch, caplog):
    import httpx

    from messaging import whatsapp

    def failing_post(*args, **kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(whatsapp.httpx, "post", failing_post)

    with (
        schema_context(restaurant.schema_name),
        caplog.at_level("ERROR", logger="waheed.messaging"),
    ):
        whatsapp.WhatsAppSender().send(CUSTOMER, "x")

    assert any("failed" in record.message for record in caplog.records)

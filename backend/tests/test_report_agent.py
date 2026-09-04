"""The Report agent and the Provider layer: route 42 (plan §1.3, §6.1; spec stories 21 to 24, 53).

Both Providers are the scripted fake under the test settings; scripts are set per Provider name.
"""

import os

import pytest
from django_tenants.utils import schema_context

from ai.agents.report_tools import ReportTools
from ai.models import AIUsageLog
from ai.providers.base import ProviderBusy, ProviderError
from ai.providers.fake import FakeProvider, tool_call_step
from tests.conftest import create_order, order_line
from tests.golden import legacy_golden, refusal

pytestmark = pytest.mark.django_db

BUSY = refusal("المساعد مشغول، حاول بعد قليل")
ADMIN_ONLY = refusal("هذه العملية لمدير المطعم فقط")


def ask(client, auth: dict, question: str = "كم مبيعات اليوم؟", **body):
    return client.post(
        "/agent/ask", {"question": question, **body}, content_type="application/json", headers=auth
    )


def usage_logs(restaurant) -> list:
    with schema_context(restaurant.schema_name):
        return list(AIUsageLog.objects.values("provider", "outcome", "fallback", "purpose"))


@pytest.fixture
def sales(client, cashier, login, demo_menu):
    """Two paid orders (one done), one unpaid, one cancelled: revenue must be 6.5."""
    auth = login(cashier)
    paid = create_order(client, auth, [order_line("برجر", 5)])["order_id"]
    client.put(
        f"/orders/{paid}/pay",
        {"payment_method": "cash"},
        content_type="application/json",
        headers=auth,
    )
    client.put(f"/orders/{paid}/done", headers=auth)
    paid_open = create_order(client, auth, [order_line("كولا", 1.5)])["order_id"]
    client.put(
        f"/orders/{paid_open}/pay",
        {"payment_method": "card"},
        content_type="application/json",
        headers=auth,
    )
    create_order(client, auth, [order_line("كولا", 1.5)])  # unpaid
    cancelled = create_order(client, auth, [order_line("كولا", 1.5), order_line("كولا", 1.5)])[
        "order_id"
    ]
    client.post(f"/orders/{cancelled}/cancel", headers=auth)
    return auth


# --- the route -------------------------------------------------------------------------------


def test_the_agent_answers_with_provider_and_model(client, admin, login, restaurant):
    FakeProvider.script("gemini", "مبيعات اليوم 6.5 دينار")

    response = ask(client, login(admin))

    assert response.status_code == 200
    assert response.json() == {
        "answer": "مبيعات اليوم 6.5 دينار",
        "provider": "gemini",
        "model": "gemini-2.5-flash",  # the configured model name, logged as such
    }
    assert usage_logs(restaurant) == [
        {"provider": "gemini", "outcome": "ok", "fallback": False, "purpose": "report"}
    ]


def test_the_legacy_query_string_form_still_works_and_the_client_key_is_ignored(
    client, admin, login, restaurant
):
    """Plan §1.2 item 1: the dashboard's ``?question=&api_key=`` call keeps working, key unused."""
    golden = legacy_golden("POST /agent/ask")
    FakeProvider.script("gemini", "الجواب")

    response = client.post(golden.path, headers=login(admin))

    assert response.status_code == 200
    assert response.json()["answer"] == "الجواب"
    assert FakeProvider.calls[0][1].messages[0].content == "كم مبيعات اليوم؟"


def test_a_missing_question_is_a_validation_error(client, admin, login):
    response = client.post("/agent/ask", {}, content_type="application/json", headers=login(admin))

    assert response.status_code == 400
    assert response.json() == refusal("السؤال مطلوب")


def test_the_agent_is_for_admins_only(client, cashier, login):
    response = ask(client, login(cashier))

    assert response.status_code == 403
    assert response.json() == ADMIN_ONLY


def test_the_agent_needs_a_token(client, restaurant):
    assert ask(client, {}).status_code == 401
    assert client.post("/agent/ask?r=waheed&question=x").status_code == 401  # not a customer route


def test_the_system_prompt_names_the_restaurant_and_carries_no_menu_text(
    client, admin, login, demo_menu
):
    FakeProvider.script("gemini", "ok")

    ask(client, login(admin))

    request = FakeProvider.calls[0][1]
    assert "Waheed Restaurant" in request.system and "JOD" in request.system
    assert "برجر" not in request.system  # data reaches the model through tools, never the prompt
    assert {tool.name for tool in request.tools} == {
        "sales_summary",
        "top_items",
        "low_stock",
        "cancellations",
        "order_status_counts",
    }


# --- the tool loop ---------------------------------------------------------------------------


def test_a_tool_round_trip_feeds_real_data_back_to_the_model(
    client, admin, login, sales, restaurant
):
    FakeProvider.script(
        "gemini", tool_call_step("sales_summary", {"period": "today"}), "إيراد اليوم 6.5 دينار"
    )

    response = ask(client, login(admin))

    assert response.json()["answer"] == "إيراد اليوم 6.5 دينار"
    first, second = (call[1] for call in FakeProvider.calls)
    assert (
        second.messages[1].role == "assistant"
        and second.messages[1].tool_calls[0].name == "sales_summary"
    )
    tool_turn = second.messages[2]
    assert tool_turn.role == "tool" and tool_turn.tool_call_id == "call-1"
    assert '"revenue": 6.5' in tool_turn.content and '"paid_orders": 2' in tool_turn.content
    assert len(usage_logs(restaurant)) == 2


def test_an_unknown_tool_is_answered_with_an_error_not_a_crash(client, admin, login, restaurant):
    FakeProvider.script("gemini", tool_call_step("drop_tables", {}), "حسناً")

    response = ask(client, login(admin))

    assert response.status_code == 200
    assert "unknown tool" in FakeProvider.calls[1][1].messages[2].content


def test_after_four_tool_rounds_the_model_must_answer(client, admin, login, restaurant):
    FakeProvider.script(
        "gemini",
        *[tool_call_step("low_stock", {}, call_id=f"c{n}") for n in range(4)],
        "الجواب النهائي",
    )

    response = ask(client, login(admin))

    assert response.json()["answer"] == "الجواب النهائي"
    assert len(FakeProvider.calls) == 5
    assert FakeProvider.calls[4][1].tools == []  # the last call offers no tools


# --- Provider selection and fallback (grilling Q14) -------------------------------------------


def test_gemini_busy_falls_back_to_openai_and_is_logged(client, admin, login, restaurant):
    FakeProvider.script("gemini", ProviderBusy("429"))
    FakeProvider.script("openai", "من OpenAI")

    response = ask(client, login(admin))

    assert response.status_code == 200
    assert response.json()["provider"] == "openai"
    assert usage_logs(restaurant) == [
        {"provider": "gemini", "outcome": "busy", "fallback": False, "purpose": "report"},
        {"provider": "openai", "outcome": "ok", "fallback": True, "purpose": "report"},
    ]


def test_both_providers_busy_is_the_arabic_busy_error(client, admin, login, restaurant):
    FakeProvider.script("gemini", ProviderBusy("429"))
    FakeProvider.script("openai", ProviderBusy("503"))

    response = ask(client, login(admin))

    assert response.status_code == 503
    assert response.json() == BUSY


def test_without_a_fallback_key_the_busy_error_comes_straight_back(client, admin, login, settings):
    settings.AI_PROVIDER_KEYS = {"gemini": "test-key", "openai": ""}
    FakeProvider.script("gemini", ProviderBusy("429"))

    response = ask(client, login(admin))

    assert response.status_code == 503
    assert response.json() == BUSY
    assert [name for name, _ in FakeProvider.calls] == ["gemini"]


def test_without_any_key_the_assistant_is_busy(client, admin, login, settings):
    settings.AI_PROVIDER_KEYS = {"gemini": "", "openai": ""}

    response = ask(client, login(admin))

    assert response.status_code == 503
    assert response.json() == BUSY


def test_a_provider_error_is_not_retried_elsewhere(client, admin, login, restaurant):
    FakeProvider.script("gemini", ProviderError("bad key"))
    FakeProvider.script("openai", "never")

    with pytest.raises(ProviderError):
        ask(client, login(admin))

    assert usage_logs(restaurant)[0]["outcome"] == "error"


def test_the_request_may_choose_the_provider(client, admin, login):
    FakeProvider.script("openai", "من OpenAI")

    response = ask(client, login(admin), provider="openai")

    assert response.json()["provider"] == "openai"


def test_an_unknown_provider_is_refused(client, admin, login):
    response = ask(client, login(admin), provider="claude")

    assert response.status_code == 400
    assert response.json() == refusal("مزوّد الذكاء الاصطناعي غير معروف")


def test_the_restaurants_setting_picks_its_provider(client, admin, login, restaurant):
    restaurant.ai_provider = "openai"
    restaurant.save(update_fields=["ai_provider"])
    FakeProvider.script("openai", "من OpenAI")

    response = ask(client, login(admin))

    assert response.json()["provider"] == "openai"


def test_the_agent_is_throttled_per_user(client, admin, login, monkeypatch):
    """DRF binds the rates at import, so the test lowers them on the throttle class itself."""
    from ai.views import AgentRateThrottle

    monkeypatch.setattr(AgentRateThrottle, "THROTTLE_RATES", {"agent": "3/minute"})
    auth = login(admin)
    FakeProvider.script("gemini", "1", "2", "3", "4")

    responses = [ask(client, auth) for _ in range(4)]

    assert [r.status_code for r in responses] == [200, 200, 200, 429]
    assert responses[3].json() == refusal("طلبات كثيرة، حاول بعد قليل")


# --- the tools themselves (spec stories 21, 24) -------------------------------------------------


def test_sales_summary_counts_paid_non_cancelled_orders_only(
    client, admin, login, sales, restaurant
):
    with schema_context(restaurant.schema_name):
        summary = ReportTools(restaurant).run("sales_summary", {"period": "today"})

    assert summary["revenue"] == 6.5
    assert summary["paid_orders"] == 2
    assert summary["orders"] == 4
    assert summary["cancelled_orders"] == 1
    assert summary["currency"] == "JOD"
    assert summary["average_ticket"] == 3.25


def test_top_items_ignores_cancelled_orders(client, admin, login, sales, restaurant):
    with schema_context(restaurant.schema_name):
        top = ReportTools(restaurant).run("top_items", {"period": "week", "limit": 5})

    assert top["items"] == [
        {"name": "كولا", "units": 2, "revenue": 3.0},
        {"name": "برجر", "units": 1, "revenue": 5.0},
    ]


def test_low_stock_lists_items_at_or_below_their_minimum(
    client, admin, login, demo_menu, restaurant
):
    with schema_context(restaurant.schema_name):
        low = ReportTools(restaurant).run("low_stock", {})

    assert [item["name"] for item in low["items"]] == ["جبن", "طماطم"]


def test_cancellations_are_counted_by_cashier(client, admin, login, sales, restaurant):
    with schema_context(restaurant.schema_name):
        result = ReportTools(restaurant).run("cancellations", {"period": "today"})

    assert result == {
        "period": "today",
        "count": 1,
        "by_cashier": [{"cashier": "cashier", "count": 1}],
    }


def test_order_status_counts_cover_every_status(client, admin, login, sales, restaurant):
    with schema_context(restaurant.schema_name):
        counts = ReportTools(restaurant).run("order_status_counts", {"period": "all"})

    assert counts == {
        "period": "all",
        "preparing": 2,
        "ready": 0,
        "served": 0,
        "done": 1,
        "cancelled": 1,
    }


def test_an_unknown_period_falls_back_to_today(client, admin, login, sales, restaurant):
    with schema_context(restaurant.schema_name):
        summary = ReportTools(restaurant).run("sales_summary", {"period": "forever"})

    assert summary["period"] == "today"


def test_yesterday_holds_nothing_for_orders_placed_now(client, admin, login, sales, restaurant):
    with schema_context(restaurant.schema_name):
        summary = ReportTools(restaurant).run("sales_summary", {"period": "yesterday"})

    assert summary["orders"] == 0


# --- live smoke test (skipped without a key) ---------------------------------------------------


@pytest.mark.skipif(not os.environ.get("GEMINI_API_KEY"), reason="needs a real GEMINI_API_KEY")
def test_gemini_answers_a_trivial_prompt_live(settings):
    from ai.providers.base import CompletionRequest, Message
    from ai.providers.gemini import GeminiProvider

    settings.AI_PROVIDER_KEYS = {"gemini": os.environ["GEMINI_API_KEY"], "openai": ""}

    completion = GeminiProvider().complete(
        CompletionRequest(system="أجب بكلمة واحدة.", messages=[Message("user", "ما لون السماء؟")])
    )

    assert completion.text.strip()

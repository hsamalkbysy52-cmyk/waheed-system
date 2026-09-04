"""``POST /agent/ask`` (plan §1.3, route 42; spec stories 21 to 23).

The question comes from the query string (the legacy dashboard) or the JSON body (F2); a client
``api_key`` is ignored (plan §1.2, item 1). Admin only, throttled per user.
"""

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle

from ai.agents import report_agent
from ai.services import PROVIDER_NAMES, AssistantBusy
from core import messages
from core.decorators import tenant_required
from core.exceptions import ServiceUnavailable
from core.permissions import IsRestaurantAdmin
from core.responses import ok


class AgentRateThrottle(UserRateThrottle):
    scope = "agent"


def _question(request) -> str:
    question = request.data.get("question") if isinstance(request.data, dict) else None
    question = question or request.query_params.get("question") or ""
    if not question.strip():
        raise ValidationError(messages.QUESTION_REQUIRED)
    return question.strip()


def _provider(request):
    chosen = (
        request.data.get("provider") if isinstance(request.data, dict) else None
    ) or request.query_params.get("provider")
    if chosen and chosen not in PROVIDER_NAMES:
        raise ValidationError(messages.UNKNOWN_PROVIDER)
    return chosen or None


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsRestaurantAdmin])
@throttle_classes([AgentRateThrottle])
@tenant_required
def ask(request):
    try:
        answer = report_agent.ask(request.tenant, _question(request), provider=_provider(request))
    except AssistantBusy:
        raise ServiceUnavailable(messages.ASSISTANT_BUSY) from None
    return ok({"answer": answer.text, "provider": answer.provider, "model": answer.model})

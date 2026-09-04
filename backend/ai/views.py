"""The agent routes: ``POST /agent/ask`` (plan §1.3, route 42; spec stories 21 to 23) and
``POST /agent/chat`` (plan §6.5; spec story 39).

The report question comes from the query string (the legacy dashboard) or the JSON body (F2); a
client ``api_key`` is ignored (plan §1.2, item 1). Reports are Admin only, chat is for any staff;
both are throttled per user.
"""

from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle

from ai.agents import chat_agent, report_agent
from ai.services import PROVIDER_NAMES, AssistantBusy
from core import messages
from core.decorators import tenant_required
from core.exceptions import ServiceUnavailable
from core.permissions import IsCashierOrAdmin, IsRestaurantAdmin
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


class ChatTurnSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    content = serializers.CharField(max_length=4000, allow_blank=True)


class ChatPayloadSerializer(serializers.Serializer):
    # ``provider`` comes first: the ``messages`` field below shadows the core.messages module
    # inside this class body.
    provider = serializers.ChoiceField(
        choices=list(PROVIDER_NAMES),
        required=False,
        allow_null=True,
        default=None,
        error_messages={"invalid_choice": messages.UNKNOWN_PROVIDER},
    )
    messages = ChatTurnSerializer(many=True, allow_empty=False)
    table_number = serializers.IntegerField(required=False, allow_null=True, default=None)
    conversation_id = serializers.CharField(
        max_length=80, required=False, allow_blank=True, allow_null=True, default=None
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsCashierOrAdmin])
@throttle_classes([AgentRateThrottle])
@tenant_required
def chat(request):
    serializer = ChatPayloadSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    payload = serializer.validated_data
    key = payload["conversation_id"] or None
    try:
        reply = chat_agent.chat(
            request.tenant,
            payload["messages"],
            table_number=payload["table_number"],
            conversation_key=f"web:{request.user.pk}:{key}" if key else None,
            provider=payload["provider"],
        )
    except AssistantBusy:
        raise ServiceUnavailable(messages.ASSISTANT_BUSY) from None
    return ok(
        {
            "reply": reply.reply,
            "order_proposal": reply.order_proposal,
            "provider": reply.provider,
            "model": reply.model,
        }
    )

"""Inbound WhatsApp messages become Conversations and Orders (spec stories 46, 47).

Runs inside the Restaurant's schema (``tenant_task``). A customer's text goes to the Chat agent
with the Conversation keyed by their number; a proposal waits for a "yes", and the confirmation
files the Order through the order service with the message id as its Idempotency key, so Meta's
redeliveries never duplicate an Order.
"""

import logging
import re

from django.core.cache import cache
from django.db import connection
from rest_framework.exceptions import ValidationError

from ai.agents import chat_agent
from ai.models import ConversationState
from ai.services import AssistantBusy
from core import messages
from core.tasks import tenant_task
from messaging.senders import outbound_sender
from orders import services as order_services
from tenants.models import Restaurant

logger = logging.getLogger("waheed.messaging")

CONFIRMATIONS = re.compile(
    r"^\s*(نعم|اي|أي|ايه|أيوه|اكد|أكد|تأكيد|تمام|اوكي|أوكي|ok|okay|yes|y)\s*[.!]*\s*$", re.I
)
WHATSAPP_CASHIER = "WhatsApp"
NO_TABLE = 0
SEEN_TTL = 24 * 3600


@tenant_task
def process_inbound_message(sender: str, message_id: str, text: str) -> str:
    """Answer one customer message; returns the reply text (for tests and logs)."""
    if not cache.add(f"wa:seen:{message_id}", 1, SEEN_TTL):
        return ""  # Meta delivered it twice
    restaurant = Restaurant.objects.get(schema_name=connection.schema_name)
    key = f"wa:{sender}"
    state = ConversationState.load(key)
    if state.pending_proposal and CONFIRMATIONS.match(text):
        reply = _confirm(restaurant, state, message_id)
    else:
        reply = _chat(restaurant, key, state, text)
    outbound_sender().send(sender, reply)
    return reply


def _chat(restaurant: Restaurant, key: str, state: ConversationState, text: str) -> str:
    try:
        answer = chat_agent.chat(
            restaurant, [{"role": "user", "content": text}], conversation_key=key
        )
    except AssistantBusy:
        return messages.ASSISTANT_BUSY
    state = ConversationState.load(key)  # the agent saved the turns; keep the proposal with them
    if answer.order_proposal:
        state.pending_proposal = answer.order_proposal
        state.save(update_fields=["pending_proposal"])
        return f"{answer.reply}\n{messages.WHATSAPP_CONFIRM_PROMPT}"
    if state.pending_proposal:
        state.pending_proposal = None
        state.save(update_fields=["pending_proposal"])
    return answer.reply


def _confirm(restaurant: Restaurant, state: ConversationState, message_id: str) -> str:
    proposal = state.pending_proposal
    if not restaurant.is_online:
        return messages.ONLINE_ORDERING_UNAVAILABLE
    try:
        order = order_services.create_order(
            items=order_services.expand_quantity_lines(proposal["items"]),
            table_number=proposal.get("table") or NO_TABLE,
            cashier=WHATSAPP_CASHIER,
            notes=messages.WHATSAPP_ORDER_NOTE.format(sender=state.key.split(":", 1)[-1]),
            payment_method=None,
            client_id=f"wa:{message_id}"[:36],
        )
    except ValidationError as refused:  # a shortage, most likely
        return str(refused.detail[0] if isinstance(refused.detail, list) else refused.detail)
    state.pending_proposal = None
    state.remember(
        [
            {
                "role": "assistant",
                "content": messages.WHATSAPP_ORDER_CONFIRMED.format(order_id=order.id),
            }
        ]
    )
    total = messages.WHATSAPP_ORDER_TOTAL.format(
        total=order.total_price, currency=restaurant.currency
    )
    return f"{messages.WHATSAPP_ORDER_CONFIRMED.format(order_id=order.id)}\n{total}"

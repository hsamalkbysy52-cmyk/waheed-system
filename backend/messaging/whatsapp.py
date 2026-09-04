"""Meta's WhatsApp Cloud API (ADR-0004): the outbound sender and the webhook's parsing.

Everything Meta-specific lives here. The sender finds the Restaurant's number from the schema the
task runs in; without a connected number it logs, so a Restaurant that has not onboarded WhatsApp
loses nothing but the message.
"""

import hashlib
import hmac
import logging
from typing import NamedTuple, Optional

import httpx
from django.conf import settings
from django.db import connection

from tenants.models import WhatsAppAccount

logger = logging.getLogger("waheed.messaging")

GRAPH_URL = "https://graph.facebook.com/{version}/{phone_number_id}/messages"


def current_account() -> Optional[WhatsAppAccount]:
    """The enabled WhatsApp account of the Restaurant whose schema the connection is on."""
    return (
        WhatsAppAccount.objects.filter(restaurant__schema_name=connection.schema_name, enabled=True)
        .select_related("restaurant")
        .first()
    )


def account_for(phone_number_id: str) -> Optional[WhatsAppAccount]:
    return (
        WhatsAppAccount.objects.filter(phone_number_id=phone_number_id, enabled=True)
        .select_related("restaurant")
        .first()
    )


class WhatsAppSender:
    """Sends through the Graph API ``messages`` endpoint. Free-form text is free inside a
    customer's 24-hour service window; owner alerts go as the approved ``fraud_alert`` utility
    template, or are only logged until one is configured (grilling Q21)."""

    def send(self, to: str, text: str) -> None:
        account = current_account()
        if account is None:
            logger.info(
                "no WhatsApp number for schema %s; not sent to %s: %s",
                connection.schema_name,
                to,
                text,
            )
            return
        self._post(account, {"to": to, "type": "text", "text": {"body": text}})

    def send_alert(self, to: str, text: str, parameters: list) -> None:
        account = current_account()
        template = settings.WHATSAPP_FRAUD_ALERT_TEMPLATE
        if account is None or not template:
            logger.warning(
                "fraud alert logged only (account=%s, template=%r): %s", account, template, text
            )
            return
        self._post(
            account,
            {
                "to": to,
                "type": "template",
                "template": {
                    "name": template,
                    "language": {"code": settings.WHATSAPP_TEMPLATE_LANGUAGE},
                    "components": [
                        {
                            "type": "body",
                            "parameters": [{"type": "text", "text": str(p)} for p in parameters],
                        }
                    ],
                },
            },
        )

    @staticmethod
    def _post(account: WhatsAppAccount, message: dict) -> None:
        url = GRAPH_URL.format(
            version=settings.WHATSAPP_API_VERSION, phone_number_id=account.phone_number_id
        )
        payload = {"messaging_product": "whatsapp", "recipient_type": "individual", **message}
        headers = {"Authorization": f"Bearer {account.access_token}"}
        try:
            response = httpx.post(url, json=payload, headers=headers, timeout=10.0)
            response.raise_for_status()
        except httpx.HTTPError as failure:  # a lost reply is logged, never a crashed task
            logger.error("WhatsApp send to %s failed: %s", message.get("to"), failure)


# --- inbound --------------------------------------------------------------------------------------


def signature_is_valid(raw_body: bytes, header: Optional[str]) -> bool:
    """``X-Hub-Signature-256`` is ``sha256=<hmac of the raw body with the app secret>``."""
    secret = settings.WHATSAPP_APP_SECRET
    if not secret or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[len("sha256=") :])


class InboundText(NamedTuple):
    phone_number_id: str  # the Restaurant's number that received it
    sender: str  # the customer's number
    message_id: str
    text: str


def inbound_texts(payload: dict) -> list:
    """The text messages in a webhook delivery; statuses and media are ignored (backlog)."""
    found = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            phone_number_id = (value.get("metadata") or {}).get("phone_number_id")
            for message in value.get("messages") or []:
                if message.get("type") != "text" or not phone_number_id:
                    continue
                body = (message.get("text") or {}).get("body", "").strip()
                if body and message.get("from") and message.get("id"):
                    found.append(InboundText(phone_number_id, message["from"], message["id"], body))
    return found

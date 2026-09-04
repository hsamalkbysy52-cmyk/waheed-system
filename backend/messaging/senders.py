"""Outbound messages to people (plan §6.4): one interface, chosen by settings.

``messaging.whatsapp.WhatsAppSender`` is the production sender (it logs for a Restaurant without a
connected number); ``LoggingSender`` never sends, and tests use ``RecordingSender`` so a Fraud
alert or a reply can be asserted without any network.
"""

import logging
from typing import NamedTuple, Protocol

from django.conf import settings
from django.utils.module_loading import import_string

logger = logging.getLogger("waheed.messaging")


class OutboundSender(Protocol):
    def send(self, to: str, text: str) -> None: ...

    def send_alert(self, to: str, text: str, parameters: list) -> None:
        """An owner alert: the WhatsApp sender uses the approved template, others the text."""


class LoggingSender:
    """Log-only fallback: nothing leaves the process (spec: alerts are logged until WhatsApp
    ships)."""

    def send(self, to: str, text: str) -> None:
        logger.info("outbound message to %s: %s", to, text)

    def send_alert(self, to: str, text: str, parameters: list) -> None:
        self.send(to, text)


class SentMessage(NamedTuple):
    to: str
    text: str


class RecordingSender:
    """The test double: every message lands in ``RecordingSender.sent``."""

    sent: list = []

    def send(self, to: str, text: str) -> None:
        self.sent.append(SentMessage(to, text))

    def send_alert(self, to: str, text: str, parameters: list) -> None:
        self.send(to, text)

    @classmethod
    def reset(cls) -> None:
        cls.sent.clear()


def outbound_sender() -> OutboundSender:
    """The sender configured by ``MESSAGING_SENDER`` (a dotted path to a class)."""
    return import_string(settings.MESSAGING_SENDER)()

"""Outbound messages to people (plan §6.4): one interface, chosen by settings.

The WhatsApp Cloud API sender arrives with ticket 15. Until then production logs what it would have
sent, and tests record it so a Fraud alert can be asserted without any network.
"""

import logging
from typing import NamedTuple, Protocol

from django.conf import settings
from django.utils.module_loading import import_string

logger = logging.getLogger("waheed.messaging")


class OutboundSender(Protocol):
    def send(self, to: str, text: str) -> None: ...


class LoggingSender:
    """Log-only fallback: nothing leaves the process (spec: alerts are logged until WhatsApp
    ships)."""

    def send(self, to: str, text: str) -> None:
        logger.info("outbound message to %s: %s", to, text)


class SentMessage(NamedTuple):
    to: str
    text: str


class RecordingSender:
    """The test double: every message lands in ``RecordingSender.sent``."""

    sent: list = []

    def send(self, to: str, text: str) -> None:
        self.sent.append(SentMessage(to, text))

    @classmethod
    def reset(cls) -> None:
        cls.sent.clear()


def outbound_sender() -> OutboundSender:
    """The sender configured by ``MESSAGING_SENDER`` (a dotted path to a class)."""
    return import_string(settings.MESSAGING_SENDER)()

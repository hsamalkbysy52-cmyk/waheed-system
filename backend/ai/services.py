"""Provider selection, fallback and usage logging (plan §6.1; grilling Q14; spec story 53).

Selection order: the request's choice (Admin only, validated by the view), then the Restaurant's
setting, then the platform default. A Provider is available when its key is configured. On a rate
limit or a vendor outage the other Provider answers when it is available; otherwise the caller
gets ``AssistantBusy`` and the API answers the Arabic busy message.
"""

import time
from typing import Optional

from django.conf import settings
from django.utils.module_loading import import_string

from ai.models import AIUsageLog
from ai.providers.base import Completion, CompletionRequest, Provider, ProviderBusy, ProviderError
from core import messages
from tenants.models import Restaurant

PROVIDER_NAMES = tuple(Restaurant.AIProvider.values)  # ("gemini", "openai")


class AssistantBusy(Exception):
    """Every available Provider is rate limited or down."""

    message = messages.ASSISTANT_BUSY


def provider_key(name: str) -> str:
    return settings.AI_PROVIDER_KEYS.get(name, "")


def available_providers() -> list:
    return [name for name in PROVIDER_NAMES if provider_key(name)]


def choose_provider(restaurant: Restaurant, requested: Optional[str] = None) -> str:
    """The Provider to try first; an unavailable choice falls through to the next rule."""
    available = available_providers()
    for candidate in (requested, restaurant.ai_provider, settings.AI_DEFAULT_PROVIDER):
        if candidate and candidate in available:
            return candidate
    if available:
        return available[0]
    raise AssistantBusy()


def build_provider(name: str) -> Provider:
    factory = import_string(settings.AI_PROVIDER_CLASSES[name])
    return factory(name=name, model=settings.AI_PROVIDER_MODELS.get(name))


class Assistant:
    """One agent run's Provider handle: knows which Provider is primary, falls back once, and logs
    every call in the Restaurant's schema."""

    def __init__(self, restaurant: Restaurant, purpose: str, requested: Optional[str] = None):
        self.restaurant = restaurant
        self.purpose = purpose
        self.primary = choose_provider(restaurant, requested)
        self.current = build_provider(self.primary)
        self.fell_back = False

    def complete(self, request: CompletionRequest) -> Completion:
        try:
            return self._logged(self.current, request)
        except ProviderBusy:
            fallback = self._fallback_name()
            if fallback is None:
                raise AssistantBusy() from None
            self.current, self.fell_back = build_provider(fallback), True
            try:
                return self._logged(self.current, request)
            except ProviderBusy:
                raise AssistantBusy() from None

    def _fallback_name(self) -> Optional[str]:
        if self.fell_back:
            return None  # one switch per run: the second Provider is not swapped back
        others = [name for name in available_providers() if name != self.current.name]
        return others[0] if others else None

    def _logged(self, provider: Provider, request: CompletionRequest) -> Completion:
        started = time.monotonic()
        try:
            completion = provider.complete(request)
        except ProviderBusy:
            self._log(provider, AIUsageLog.Outcome.BUSY, started)
            raise
        except ProviderError:
            self._log(provider, AIUsageLog.Outcome.ERROR, started)
            raise
        self._log(provider, AIUsageLog.Outcome.OK, started, completion)
        return completion

    def _log(self, provider, outcome: str, started: float, completion=None) -> None:
        usage = completion.usage if completion else None
        AIUsageLog.objects.create(
            provider=provider.name,
            model=(completion.model if completion else provider.model) or "",
            purpose=self.purpose,
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            latency_ms=int((time.monotonic() - started) * 1000),
            outcome=outcome,
            fallback=self.fell_back,
        )

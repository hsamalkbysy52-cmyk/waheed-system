"""AI bookkeeping of one Restaurant, in its own schema: what the Providers did (spec story 53) and
the Conversations the Chat agent remembers (spec story 46)."""

from datetime import timedelta

from django.db import models
from django.utils import timezone

CONVERSATION_TTL = timedelta(hours=2)  # a Conversation is forgotten two hours after its last turn
CONVERSATION_TURNS_KEPT = 20


class AIUsageLog(models.Model):
    class Outcome(models.TextChoices):
        OK = "ok"
        BUSY = "busy"  # rate limited or the Provider's servers failed
        ERROR = "error"

    provider = models.CharField(max_length=20)
    model = models.CharField(max_length=100)
    purpose = models.CharField(max_length=30)  # "report", "chat"
    prompt_tokens = models.IntegerField(default=0)
    completion_tokens = models.IntegerField(default=0)
    latency_ms = models.IntegerField(default=0)
    outcome = models.CharField(max_length=10, choices=Outcome.choices)
    fallback = models.BooleanField(default=False)  # this call ran on the fallback Provider
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.purpose} via {self.provider}/{self.model}: {self.outcome}"


class ConversationState(models.Model):
    """The recent turns of one Conversation, keyed by who is talking (a WhatsApp number, or the
    web chat's conversation id), so the Chat agent remembers context for two hours."""

    key = models.CharField(max_length=100, unique=True)
    table_number = models.IntegerField(null=True, blank=True)
    messages = models.JSONField(default=list)  # [{role, content}], newest last
    expires_at = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"conversation {self.key}"

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    @classmethod
    def load(cls, key: str) -> "ConversationState":
        """The live Conversation for a key, or a fresh one; an expired one is forgotten."""
        state = cls.objects.filter(key=key).first()
        if state is not None and state.is_expired:
            state.delete()
            state = None
        return state or cls(key=key, messages=[], expires_at=timezone.now() + CONVERSATION_TTL)

    def remember(self, turns: list, table_number=None) -> None:
        self.messages = (self.messages + turns)[-CONVERSATION_TURNS_KEPT:]
        if table_number is not None:
            self.table_number = table_number
        self.expires_at = timezone.now() + CONVERSATION_TTL
        self.save()

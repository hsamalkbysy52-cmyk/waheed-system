"""What the AI Providers did for one Restaurant (spec story 53); lives in its schema."""

from django.db import models


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

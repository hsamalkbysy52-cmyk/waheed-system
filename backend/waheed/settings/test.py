"""pytest: dev settings, with Celery running tasks inline so tests never need a worker."""

from .dev import *  # noqa: F403

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Fixtures create and sign in several users per test; the production hasher would dominate the run.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Fraud alerts and replies are recorded, never sent (tests/test_tasks.py reads them).
MESSAGING_SENDER = "messaging.senders.RecordingSender"

# Both Providers are the scripted fake, "available" with placeholder keys;
# tests/test_report_agent.py scripts them per name.
AI_PROVIDER_KEYS = {"gemini": "test-key", "openai": "test-key"}
AI_PROVIDER_CLASSES = {
    "gemini": "ai.providers.fake.FakeProvider",
    "openai": "ai.providers.fake.FakeProvider",
}

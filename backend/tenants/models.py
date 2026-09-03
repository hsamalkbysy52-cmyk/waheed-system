from django.db import models
from django_tenants.models import DomainMixin, TenantMixin


class Restaurant(TenantMixin):
    """A single restaurant location; the unit of data isolation (CONTEXT.md).

    Lives in the public schema; its own schema (``schema_name``) holds menu, inventory, orders
    and layout. ``slug`` is the public identifier customer QR links carry; names are Arabic, so
    it is generated rather than derived. Jordan defaults (plan §14 Q11); Iraq later.
    """

    class Status(models.TextChoices):
        ACTIVE = "active"
        SUSPENDED = "suspended"

    class AIProvider(models.TextChoices):
        GEMINI = "gemini"
        OPENAI = "openai"

    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=50, unique=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    country = models.CharField(max_length=2, default="JO")
    currency = models.CharField(max_length=3, default="JOD")
    timezone = models.CharField(max_length=63, default="Asia/Amman")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    last_heartbeat_at = models.DateTimeField(null=True, blank=True)
    # Empty means the platform default (AI_DEFAULT_PROVIDER); set per Restaurant in the admin.
    ai_provider = models.CharField(
        max_length=10, choices=AIProvider.choices, blank=True, default=""
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name

    @property
    def is_suspended(self) -> bool:
        return self.status == self.Status.SUSPENDED


class Domain(DomainMixin):
    """The tenancy library's mandatory hostname row; unused for routing (ADR-0001)."""

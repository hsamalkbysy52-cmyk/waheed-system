from django.db import models
from django_tenants.models import DomainMixin, TenantMixin


class Restaurant(TenantMixin):
    """A single restaurant location; the unit of data isolation (CONTEXT.md).

    Slug, country, currency, timezone, status and the last Heartbeat arrive with ticket 03.
    """

    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name


class Domain(DomainMixin):
    """The tenancy library's mandatory hostname row; unused for routing (ADR-0001)."""

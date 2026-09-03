"""Provisioning a Restaurant: the public row, its schema and the mandatory Domain row."""

from typing import Optional
from uuid import uuid4

from django.conf import settings

from tenants.models import Domain, Restaurant


def provision_restaurant(
    name: str, *, email: str = "", phone: str = "", slug: Optional[str] = None
) -> Restaurant:
    """Create a Restaurant with Jordan defaults and its schema (synchronously, plan §3.6).

    The Slug is ``r-`` plus eight hex characters unless the caller fixes one (the demo Restaurant
    is ``waheed``); the schema name is ``r_`` plus twelve. Both are random, and their unique
    constraints are the collision guard. Call inside ``transaction.atomic()`` together with
    whatever must exist alongside the Restaurant, so a failure leaves nothing behind.
    """
    restaurant = Restaurant.objects.create(
        schema_name=f"r_{uuid4().hex[:12]}",
        slug=slug or f"r-{uuid4().hex[:8]}",
        name=name,
        email=email,
        phone=phone,
    )
    Domain.objects.create(
        tenant=restaurant,
        domain=f"{restaurant.slug}.{settings.TENANT_BASE_DOMAIN}",
        is_primary=True,
    )
    return restaurant

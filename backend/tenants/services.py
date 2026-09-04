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
    is ``waheed``). Call inside ``transaction.atomic()`` together with whatever must exist
    alongside the Restaurant, so a failure leaves nothing behind.
    """
    return provision(
        Restaurant(name=name, slug=slug or f"r-{uuid4().hex[:8]}", email=email, phone=phone)
    )


def provision(restaurant: Restaurant) -> Restaurant:
    """Save a new Restaurant with its own schema and the mandatory Domain row.

    The schema name is ``r_`` plus twelve hex characters; it is random, and its unique constraint
    is the collision guard. Registration, the demo seed and the Super admin console all create
    Restaurants through here, so none of them can produce one without a schema.
    """
    restaurant.schema_name = f"r_{uuid4().hex[:12]}"
    restaurant.save()  # auto_create_schema: django-tenants creates the schema and migrates it
    Domain.objects.create(
        tenant=restaurant,
        domain=f"{restaurant.slug}.{settings.TENANT_BASE_DOMAIN}",
        is_primary=True,
    )
    return restaurant

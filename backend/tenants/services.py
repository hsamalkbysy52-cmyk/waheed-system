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
    return create_with_schema(
        Restaurant(name=name, slug=slug or f"r-{uuid4().hex[:8]}", email=email, phone=phone)
    )


def create_with_schema(restaurant: Restaurant) -> Restaurant:
    """Save a Restaurant that does not exist yet, with its own schema and its Domain row.

    The schema name is ``r_`` plus twelve hex characters; it is random, and its unique constraint
    is the collision guard. Registration, the demo seed and the Super admin console all create
    Restaurants through here, so none of them can produce one without a schema. A Restaurant that
    has been saved before is refused: renaming a live schema would orphan everything in it.
    """
    if restaurant.pk is not None:
        raise ValueError(f"{restaurant} exists already; its schema cannot be created twice")
    restaurant.schema_name = f"r_{uuid4().hex[:12]}"
    restaurant.save()  # auto_create_schema: django-tenants creates the schema and migrates it
    set_primary_domain(restaurant)
    return restaurant


def set_primary_domain(restaurant: Restaurant) -> None:
    """Point the Restaurant's mandatory Domain row at its current Slug.

    Nothing routes by hostname (ADR-0001), but the row must exist, and it stays consistent with
    the Slug, which the Super admin console may change.
    """
    Domain.objects.update_or_create(
        tenant=restaurant,
        is_primary=True,
        defaults={"domain": f"{restaurant.slug}.{settings.TENANT_BASE_DOMAIN}"},
    )


def record_heartbeat(restaurant: Restaurant):
    """A staff device is alive: stamp the Restaurant (public schema) and return the moment."""
    from django.utils import timezone

    now = timezone.now()
    Restaurant.objects.filter(pk=restaurant.pk).update(last_heartbeat_at=now)
    restaurant.last_heartbeat_at = now
    return now

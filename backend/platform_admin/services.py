"""What the Super admin console does to a Restaurant."""

from rest_framework.exceptions import NotFound

from core import messages
from tenants.models import Restaurant


def list_restaurants():
    """Every Restaurant on the platform, newest first, as the legacy console listed them."""
    return Restaurant.objects.order_by("-created_at")


def set_status(restaurant_id: int, status: str) -> Restaurant:
    """Suspend or reactivate a Restaurant.

    It takes effect on the Restaurant's very next request: the tenant middleware reads the status
    on every call, so staff tokens stop working and customers are turned away without a deploy
    (plan §3.2, spec story 3).
    """
    try:
        restaurant = Restaurant.objects.get(pk=restaurant_id)
    except Restaurant.DoesNotExist:
        raise NotFound(messages.RESTAURANT_NOT_FOUND) from None
    restaurant.status = status
    restaurant.save(update_fields=["status"])
    return restaurant

"""Input validation and output shaping for the Super admin console routes."""

from rest_framework import serializers

from core import messages
from core.timestamps import iso_utc
from tenants.models import Restaurant

# Timestamps are ISO-8601 in UTC with a trailing Z (spec, API contract).


class RestaurantStatusSerializer(serializers.Serializer):
    """``{"status": "active" | "suspended"}``. Every rejection carries the legacy message, which
    named both values, so the console shows one line whatever went wrong."""

    status = serializers.ChoiceField(
        choices=Restaurant.Status.choices,
        error_messages=dict.fromkeys(
            ("required", "null", "invalid_choice"), messages.INVALID_RESTAURANT_STATUS
        ),
    )


def serialize_restaurant(restaurant: Restaurant) -> dict:
    """One row of the console's Restaurant list (plan §1.3, route 40)."""
    return {
        "id": restaurant.pk,
        "name": restaurant.name,
        "email": restaurant.email,
        "phone": restaurant.phone,
        "status": restaurant.status,
        "created_at": iso_utc(restaurant.created_at),
    }

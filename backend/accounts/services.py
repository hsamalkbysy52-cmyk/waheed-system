"""Account operations: registering a Restaurant with its owner, and signing staff in."""

from django.contrib.auth import authenticate
from django.db import transaction
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from accounts.models import Role, User
from core import messages
from tenants.services import provision_restaurant


def register_restaurant(*, restaurant_name: str, phone: str, email: str, password: str) -> User:
    """Provision the Restaurant, its schema and Domain row, and create its owner Admin (plan §3.6).

    One transaction: a failure anywhere leaves no half-registered Restaurant. The owner's display
    name is the email, as the legacy API did.
    """
    with transaction.atomic():
        restaurant = provision_restaurant(restaurant_name, email=email, phone=phone)
        return User.objects.create_user(
            email, password, username=email, role=Role.ADMIN, restaurant=restaurant
        )


def sign_in(*, email: str, password: str) -> User:
    """The staff member for these credentials, or the legacy refusals: wrong credentials (401) and
    a Suspended Restaurant (403, checked at sign-in as well as on every later request)."""
    user = authenticate(username=email, password=password)
    if user is None:
        raise AuthenticationFailed(messages.WRONG_CREDENTIALS)
    if user.restaurant is not None and user.restaurant.is_suspended:
        raise PermissionDenied(messages.RESTAURANT_SUSPENDED)
    return user

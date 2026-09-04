"""View-level tenancy guards (plan §3.4). They wrap the function under ``@api_view`` and raise DRF
exceptions, so refusals take the ``{error, detail}`` shape like every other failure.

A tenant view can never run without a Restaurant, a platform view never with one; only the five
customer routes accept a Restaurant that a Slug, rather than a token, selected.
"""

from functools import wraps

from rest_framework.exceptions import NotAuthenticated, PermissionDenied, ValidationError

from core import messages
from core.middleware import TenantSource
from core.permissions import IsRestaurantAdmin


def tenant_required(view):
    """400 without a Restaurant; 401 when a Slug selected it and this is not a customer route."""
    _below_api_view(view)

    @wraps(view)
    def guarded(request, *args, **kwargs):
        if request.tenant_source == TenantSource.SLUG and not getattr(
            guarded, "public_tenant", False
        ):
            raise NotAuthenticated(messages.MISSING_TOKEN)
        if request.tenant is None:
            raise ValidationError(messages.RESTAURANT_NOT_SPECIFIED)
        return view(request, *args, **kwargs)

    return guarded


def public_tenant_allowed(view):
    """Marks one of the customer routes: a Slug-resolved Restaurant is acceptable here."""
    _below_api_view(view)
    view.public_tenant = True  # ``wraps`` carries the mark whichever decorator is applied first
    return view


def public_only(view):
    """400 when a Restaurant is set: ``/login``, ``/register`` and ``/admin/*`` work at platform
    scope, and a Restaurant cannot be created while the connection is inside another."""
    _below_api_view(view)

    @wraps(view)
    def guarded(request, *args, **kwargs):
        if request.tenant is not None:
            raise ValidationError(messages.PLATFORM_ROUTE_ONLY)
        return view(request, *args, **kwargs)

    return guarded


def admin_only_for(*methods: str):
    """Narrow some methods of a path to the Restaurant's Admin (plan §3.4).

    Permission classes apply to a whole view, and the legacy paths carry two methods each in
    places: reading a Menu item's Modifier groups and creating one share one path, and only the
    creation is an Admin's to make.
    """

    def decorate(view):
        _below_api_view(view)

        @wraps(view)
        def guarded(request, *args, **kwargs):
            permission = IsRestaurantAdmin()
            if request.method in methods and not permission.has_permission(request, view):
                raise PermissionDenied(permission.message)
            return view(request, *args, **kwargs)

        return guarded

    return decorate


def _below_api_view(view) -> None:
    """Above ``@api_view`` the guards would wrap DRF's generated view: the mark would be lost and
    the exceptions would escape DRF's handler as 500s. Fail at import time instead."""
    if hasattr(view, "cls") or hasattr(view, "view_class"):
        raise TypeError(f"{view.__name__}: apply the tenancy guards below @api_view")

"""View-level tenancy guards (plan §3.4). They wrap the function under ``@api_view`` and raise DRF
exceptions, so refusals take the ``{error, detail}`` shape like every other failure.

A tenant view can never run without a Restaurant, a platform view never with one; only the five
customer routes accept a Restaurant that a Slug, rather than a token, selected.
"""

from functools import wraps

from rest_framework.exceptions import NotAuthenticated, ValidationError

from core import messages
from core.middleware import FROM_SLUG


def tenant_required(view):
    """400 without a Restaurant; 401 when a Slug selected it and this is not a customer route."""

    @wraps(view)
    def guarded(request, *args, **kwargs):
        if request.tenant_source == FROM_SLUG and not getattr(guarded, "public_tenant", False):
            raise NotAuthenticated(messages.MISSING_TOKEN)
        if request.tenant is None:
            raise ValidationError(messages.RESTAURANT_NOT_SPECIFIED)
        return view(request, *args, **kwargs)

    return guarded


def public_tenant_allowed(view):
    """Marks one of the customer routes: a Slug-resolved Restaurant is acceptable here."""
    view.public_tenant = True  # ``wraps`` carries the mark whichever decorator is applied first
    return view


def public_only(view):
    """400 when a Restaurant is set: ``/login``, ``/register`` and ``/admin/*`` work at platform
    scope, and a Restaurant cannot be created while the connection is inside another."""

    @wraps(view)
    def guarded(request, *args, **kwargs):
        if request.tenant is not None:
            raise ValidationError(messages.PLATFORM_ROUTE_ONLY)
        return view(request, *args, **kwargs)

    return guarded

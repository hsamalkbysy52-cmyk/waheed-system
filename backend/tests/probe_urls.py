"""Test-only routes that consume the view guards the way the domain apps will (plan §3.4, §4).

The middleware, decorators and permission classes are observable only through a view that uses
them; the tenant routes arrive with tickets 04 to 09, so these four probes stand in. Each answers
which Restaurant the request was scoped to, how it was resolved and which schema the connection is
on. ``@pytest.mark.urls("tests.probe_urls")`` mounts them next to the real routes.
"""

from django.db import connection
from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

from core.decorators import public_only, public_tenant_allowed, tenant_required
from core.permissions import IsCashierOrAdmin, IsRestaurantAdmin, IsSuperAdmin
from core.responses import ok
from waheed.urls import urlpatterns as real_urlpatterns


def _scope(request) -> dict:
    return {
        "restaurant": request.tenant.slug,
        "source": request.tenant_source,
        "schema": connection.schema_name,
    }


@api_view(["GET"])
@permission_classes([IsCashierOrAdmin])
@tenant_required
def staff_probe(request):
    """Like the order routes: staff of the Restaurant only."""
    return ok(_scope(request))


@api_view(["GET"])
@permission_classes([IsRestaurantAdmin])
@tenant_required
def admin_probe(request):
    """Like the menu mutations: the Restaurant's Admin only."""
    return ok(_scope(request))


@api_view(["GET"])
@permission_classes([AllowAny])
@public_tenant_allowed
@tenant_required
def customer_probe(request):
    """Like ``GET /menu``: customers with a Slug, staff with a token."""
    return ok(_scope(request))


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
@public_only
def platform_probe(request):
    """Like ``GET /admin/restaurants``: Super admins at platform scope."""
    return ok({"schema": connection.schema_name})


urlpatterns = real_urlpatterns + [
    path("_probe/staff", staff_probe),
    path("_probe/admin", admin_probe),
    path("_probe/customer", customer_probe),
    path("_probe/platform", platform_probe),
]

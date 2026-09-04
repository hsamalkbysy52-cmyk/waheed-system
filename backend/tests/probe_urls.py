"""One test-only route standing in for the staff routes until they exist (plan §3.4).

``IsCashierOrAdmin`` guards the order and heartbeat routes, which arrive with ticket 08; the menu
(ticket 05) and the Super admin console (ticket 04) now carry every other guard, so their probes
are gone and their assertions live on the real routes. Delete this file when ticket 08 lands.
"""

from django.db import connection
from django.urls import path
from rest_framework.decorators import api_view, permission_classes

from core.decorators import tenant_required
from core.permissions import IsCashierOrAdmin
from core.responses import ok
from waheed.urls import urlpatterns as real_urlpatterns


@api_view(["GET"])
@permission_classes([IsCashierOrAdmin])
@tenant_required
def staff_probe(request):
    """Like the order routes: staff of the Restaurant, with a token, and no one else."""
    return ok(
        {
            "restaurant": request.tenant.slug,
            "source": request.tenant_source,
            "schema": connection.schema_name,
        }
    )


urlpatterns = real_urlpatterns + [path("_probe/staff", staff_probe)]

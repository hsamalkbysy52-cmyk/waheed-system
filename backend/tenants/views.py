"""Heartbeat and Online status (plan §1.3, routes 18 and 19; spec story 38).

Only a signed-in staff device counts as Online: the Heartbeat needs a Cashier's or Admin's token,
and the Restaurant it stamps is the token's. Customers read the status by Slug.
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated

from core.decorators import public_tenant_allowed, tenant_required
from core.permissions import IsCashierOrAdmin
from core.responses import ok
from core.timestamps import iso_utc
from tenants import services


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsCashierOrAdmin])
@tenant_required
def heartbeat(request):
    beat = services.record_heartbeat(request.tenant)
    return ok({"status": "ok", "last_heartbeat_at": iso_utc(beat)})


@api_view(["GET"])
@permission_classes([AllowAny])
@public_tenant_allowed
@tenant_required
def restaurant_status(request):
    restaurant = request.tenant
    return ok(
        {
            "online": restaurant.is_online,
            "last_heartbeat_at": iso_utc(restaurant.last_heartbeat_at),
        }
    )

"""The Super admin console's two API routes (plan §1.3, routes 40 and 41).

Both are platform routes: they work at platform scope only, so a Super admin who scopes the request
to one Restaurant is refused rather than shown a mixture (spec story 7).
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core import messages
from core.decorators import public_only
from core.permissions import IsSuperAdmin
from core.responses import ok
from platform_admin import services
from platform_admin.serializers import RestaurantStatusSerializer, serialize_restaurant


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsSuperAdmin])
@public_only
def restaurant_list(request):
    restaurants = services.list_restaurants()
    return ok({"restaurants": [serialize_restaurant(r) for r in restaurants]})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsSuperAdmin])
@public_only
def restaurant_status(request, restaurant_id: int):
    serializer = RestaurantStatusSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    restaurant = services.set_status(restaurant_id, serializer.validated_data["status"])
    return ok(
        {
            "id": restaurant.pk,
            "status": restaurant.status,
            "message": messages.RESTAURANT_STATUS_UPDATED,
        }
    )

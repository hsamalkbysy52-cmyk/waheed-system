"""Table layout routes (plan §1.3, routes 36 and 37): staff read the plan, the Admin saves it."""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from core import messages
from core.decorators import tenant_required
from core.permissions import IsRestaurantAdmin
from core.responses import ok
from layout import services
from layout.serializers import LayoutSavePayloadSerializer, serialize_element


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@tenant_required
def table_layout(request):
    return ok({"elements": [serialize_element(el) for el in services.layout_elements()]})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsRestaurantAdmin])
@tenant_required
def table_layout_save(request):
    serializer = LayoutSavePayloadSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    services.save_layout(**serializer.validated_data)
    return ok({"message": messages.LAYOUT_SAVED})

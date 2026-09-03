from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

from core.responses import ok


@api_view(["GET"])
@permission_classes([AllowAny])
def home(request):
    """Legacy root health body, byte-identical to the FastAPI response (plan §1.3, route 1)."""
    return ok({"message": "Waheed System Running!", "status": "ok"})


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Deploy health check: answers 200 only while PostgreSQL answers this process."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return ok({"status": "ok"})

"""Account routes: ``/register``, ``/login``, ``/auth/refresh`` and ``/me`` (plan §1.3, §5.2)."""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from accounts import services
from accounts.models import User
from accounts.serializers import LoginSerializer, RegisterSerializer
from accounts.tokens import issue_tokens
from core.decorators import public_only
from core.responses import ok


@api_view(["POST"])
@permission_classes([AllowAny])
@public_only
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    owner = services.register_restaurant(**serializer.validated_data)
    welcome = f"تم تسجيل مطعم {owner.restaurant.name} بنجاح! أهلاً {owner.username}!"
    return ok(_session_body(owner, welcome))


@api_view(["POST"])
@permission_classes([AllowAny])
@public_only
def login(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = services.sign_in(**serializer.validated_data)
    return ok(_session_body(user, f"أهلاً {user.username}!"))


@api_view(["POST"])
@permission_classes([AllowAny])
def refresh(request):
    """``{refresh}`` → ``{token, refresh}``. The access token inherits the refresh token's claims.

    Call it without an ``Authorization`` header: an expired access token there is refused by the
    tenant middleware before this view runs.
    """
    serializer = TokenRefreshSerializer(data=request.data)
    try:
        serializer.is_valid(raise_exception=True)
    except TokenError as exc:  # Simple JWT's own view does the same translation
        raise InvalidToken(exc.args[0]) from exc
    return ok({"token": serializer.validated_data["access"], "refresh": request.data["refresh"]})


@api_view(["GET"])
def me(request):
    """Who is signed in and which Restaurant they run; the frontend takes Slug, currency and
    timezone from here (plan §5.6 F1, F9)."""
    user = request.user
    restaurant = user.restaurant
    return ok(
        {
            "username": user.username,
            "role": user.role,
            "restaurant_id": user.restaurant_id,
            "restaurant": restaurant
            and {
                "name": restaurant.name,
                "slug": restaurant.slug,
                "currency": restaurant.currency,
                "timezone": restaurant.timezone,
            },
        }
    )


def _session_body(user: User, message: str) -> dict:
    """The legacy login body (``token``, ``role``, ``username``, ``message``) plus ``refresh``."""
    tokens = issue_tokens(user)
    return {
        "token": tokens.access,
        "refresh": tokens.refresh,
        "role": user.role,
        "username": user.username,
        "message": message,
    }

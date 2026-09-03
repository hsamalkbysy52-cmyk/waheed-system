"""Tenant resolution (plan §3.2, ADR-0001).

django-tenants' stock middleware picks the schema from the request hostname. Our frontend talks to
one API host and carries the Restaurant in the JWT, so this subclass resolves it from the token, the
Super admin's ``X-Restaurant-Id`` header, or, for customers, the Slug (``X-Restaurant-Slug`` header
or ``?r=``), and records how on ``request.tenant_source``. Refusals are answered here, before any
view, with the legacy messages; CORS middleware runs outside this one so browsers see them.
"""

from typing import Optional

from django.db import connection
from django.http import JsonResponse
from django_tenants.middleware.main import TenantMainMiddleware
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import TokenError

from accounts.models import Role
from core import messages
from core.responses import error_body
from tenants.models import Restaurant

# request.tenant_source values
FROM_JWT = "jwt"
FROM_SUPER_ADMIN = "super_admin"
FROM_SLUG = "slug"  # also when nothing identified a Restaurant: request.tenant is then None


class Refused(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


class JWTTenantMiddleware(TenantMainMiddleware):
    def process_request(self, request):
        connection.set_schema_to_public()  # tenant metadata lives there; never inherit a schema
        try:
            request.tenant, request.tenant_source = self.resolve(request)
        except Refused as refused:
            return JsonResponse(
                error_body(refused.message),
                status=refused.status,
                json_dumps_params={"ensure_ascii": False},
            )
        if request.tenant is not None:
            connection.set_tenant(request.tenant)

    def resolve(self, request) -> tuple:
        claims = self.claims(request)
        if claims is None:
            return self.from_slug(request), FROM_SLUG
        if claims.get("role") == Role.SUPER_ADMIN:
            return self.from_header(request), FROM_SUPER_ADMIN
        return self.from_claims(request, claims), FROM_JWT

    @staticmethod
    def claims(request) -> Optional[dict]:
        """The verified JWT payload, None without a Bearer header, 401 for a bad token."""
        authentication = JWTAuthentication()
        header = authentication.get_header(request)
        if header is None:
            return None
        try:
            raw_token = authentication.get_raw_token(header)
            if raw_token is None:  # not a Bearer header; DRF ignores it too
                return None
            return authentication.get_validated_token(raw_token).payload
        except (AuthenticationFailed, TokenError):
            raise Refused(401, messages.INVALID_TOKEN) from None

    @staticmethod
    def from_claims(request, claims: dict) -> Restaurant:
        """Staff: their Restaurant comes from the token, never from the request (legacy rule)."""
        restaurant = _restaurant(pk=claims.get("restaurant_id"))
        if restaurant is None:
            raise Refused(401, messages.INVALID_TOKEN)
        named = request.headers.get("X-Restaurant-Id")
        if named is not None and named.strip() != str(restaurant.pk):
            raise Refused(403, messages.FOREIGN_RESTAURANT)
        if restaurant.is_suspended:  # checked on every request, not only at sign-in
            raise Refused(403, messages.RESTAURANT_SUSPENDED)
        return restaurant

    @staticmethod
    def from_header(request) -> Optional[Restaurant]:
        """Super admin: platform scope, or the Restaurant named in the header (Suspended included,
        since Super admins review those too)."""
        named = request.headers.get("X-Restaurant-Id")
        if named is None:
            return None
        restaurant = _restaurant(pk=named.strip())
        if restaurant is None:
            raise Refused(404, messages.RESTAURANT_NOT_FOUND)
        return restaurant

    @staticmethod
    def from_slug(request) -> Optional[Restaurant]:
        """Customers: the Slug from the table QR link; a Suspended Restaurant is unavailable."""
        slug = request.headers.get("X-Restaurant-Slug") or request.GET.get("r")
        if not slug:
            return None
        restaurant = _restaurant(slug=slug.strip())
        if restaurant is None:
            raise Refused(404, messages.RESTAURANT_NOT_FOUND)
        if restaurant.is_suspended:
            raise Refused(403, messages.RESTAURANT_UNAVAILABLE)
        return restaurant


def _restaurant(**lookup) -> Optional[Restaurant]:
    try:
        return Restaurant.objects.get(**lookup)
    except (Restaurant.DoesNotExist, ValueError, TypeError):
        return None

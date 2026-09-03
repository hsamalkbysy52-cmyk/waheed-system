"""Role permissions (plan §3.4). Authority is the User's role; an anonymous caller is answered 401
by DRF before these run. Super admins look at a Restaurant's data by naming it (spec story 7) but
do not act as its staff, so the two Restaurant permissions exclude them."""

from rest_framework.permissions import BasePermission

from accounts.models import Role
from core import messages


def _role(request):
    return getattr(request.user, "role", None)


class IsSuperAdmin(BasePermission):
    message = messages.PLATFORM_ADMIN_ONLY

    def has_permission(self, request, view) -> bool:
        return _role(request) == Role.SUPER_ADMIN


class IsRestaurantAdmin(BasePermission):
    message = messages.RESTAURANT_ADMIN_ONLY

    def has_permission(self, request, view) -> bool:
        return _role(request) == Role.ADMIN


class IsCashierOrAdmin(BasePermission):
    message = messages.STAFF_ONLY

    def has_permission(self, request, view) -> bool:
        return _role(request) in (Role.ADMIN, Role.CASHIER)

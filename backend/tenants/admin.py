"""Restaurants in the Super admin console (plan §3.1; spec story 4).

Onboarding mistakes — a wrong Slug, currency, timezone or country — are fixed here without a
deploy, and a Restaurant can be suspended here as well as through ``POST /admin/restaurants/{id}
/status``. Adding one goes through the same provisioning as registration, so it gets its schema.
"""

from django.contrib import admin

from tenants.models import Domain, Restaurant, WhatsAppAccount
from tenants.services import create_with_schema, set_primary_domain


@admin.register(Restaurant)
class RestaurantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "status", "country", "currency", "timezone", "created_at")
    list_filter = ("status", "country")
    search_fields = ("name", "slug", "email", "phone")
    ordering = ("-created_at",)
    readonly_fields = ("schema_name", "created_at", "last_heartbeat_at")
    fields = (
        "name",
        "slug",
        "email",
        "phone",
        "country",
        "currency",
        "timezone",
        "status",
        "ai_provider",
        "schema_name",
        "created_at",
        "last_heartbeat_at",
    )

    def save_model(self, request, obj, form, change) -> None:
        if change:
            super().save_model(request, obj, form, change)
            set_primary_domain(obj)  # an edited Slug takes the Domain row with it
        else:
            create_with_schema(obj)  # names the schema, creates it and adds the Domain row

    def has_delete_permission(self, request, obj=None) -> bool:
        """A Restaurant's schema and its data outlive the row: suspend it instead of deleting."""
        return False


@admin.register(Domain)
class DomainAdmin(admin.ModelAdmin):
    """The tenancy library's mandatory hostname rows; nothing routes by hostname (ADR-0001)."""

    list_display = ("domain", "tenant", "is_primary")
    search_fields = ("domain",)


@admin.register(WhatsAppAccount)
class WhatsAppAccountAdmin(admin.ModelAdmin):
    """One business number per Restaurant (ADR-0004); the Super admin connects it here."""

    list_display = ("restaurant", "display_phone", "phone_number_id", "owner_phone", "enabled")
    list_filter = ("enabled",)
    search_fields = ("restaurant__name", "display_phone", "phone_number_id")
    autocomplete_fields = ("restaurant",)
    readonly_fields = ("created_at",)

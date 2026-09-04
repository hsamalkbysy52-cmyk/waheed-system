from django.contrib import admin
from django.urls import path

from accounts import views as account_views
from core import views as core_views
from inventory import views as inventory_views
from layout import views as layout_views
from menu import views as menu_views
from orders import views as orders_views
from platform_admin import views as platform_views
from tenants import views as tenant_views

# One urlconf for platform and Restaurant routes; legacy paths have no trailing slash.
urlpatterns = [
    path("", core_views.home),
    path("health", core_views.health),
    path("register", account_views.register),
    path("login", account_views.login),
    path("auth/refresh", account_views.refresh),
    path("me", account_views.me),
    path("menu", menu_views.menu_list),
    path("menu/add", menu_views.menu_add),
    path("menu/<int:item_id>", menu_views.menu_edit_or_delete),
    path("menu/<int:item_id>/toggle", menu_views.menu_toggle),
    path("menu/<int:item_id>/modifiers/groups", menu_views.item_modifier_groups),
    path("menu/<int:item_id>/modifiers/groups/reorder", menu_views.modifier_groups_reorder),
    path("modifiers/groups/<int:group_id>", menu_views.modifier_group_edit_or_delete),
    path("modifiers/groups/<int:group_id>/options", menu_views.modifier_option_create),
    path("modifiers/groups/<int:group_id>/options/reorder", menu_views.modifier_options_reorder),
    path("modifiers/options/<int:option_id>", menu_views.modifier_option_edit_or_delete),
    path("orders", orders_views.orders_list),
    path("orders/create", orders_views.orders_create),
    path("orders/qr-create", orders_views.orders_create),  # alias for the customer channel
    path("heartbeat", tenant_views.heartbeat),
    path("restaurant/status", tenant_views.restaurant_status),
    path("orders/<int:order_id>", orders_views.order_edit_or_cancel),
    path("orders/<int:order_id>/ready", orders_views.order_ready),
    path("orders/<int:order_id>/preparing", orders_views.order_preparing),
    path("orders/<int:order_id>/served", orders_views.order_served),
    path("orders/<int:order_id>/pay", orders_views.order_pay),
    path("orders/<int:order_id>/done", orders_views.order_done),
    path("orders/<int:order_id>/cancel", orders_views.order_cancel),
    path("inventory", inventory_views.inventory_list),
    path("inventory/add", inventory_views.inventory_add),
    path("inventory/<int:item_id>", inventory_views.inventory_edit_or_delete),
    # Route 35, POST /inventory/deduct/{order_id}, is dropped on purpose (grilling Q12).
    path("inventory/recipe/<int:menu_item_id>", inventory_views.menu_item_recipe),
    path("table-layout", layout_views.table_layout),
    path("table-layout/save", layout_views.table_layout_save),
    path("admin/restaurants", platform_views.restaurant_list),
    path("admin/restaurants/<int:restaurant_id>/status", platform_views.set_restaurant_status),
    path("django-admin/", admin.site.urls),
]

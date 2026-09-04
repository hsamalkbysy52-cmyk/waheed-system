from django.contrib import admin
from django.urls import path

from accounts import views as account_views
from core import views as core_views
from menu import views as menu_views
from platform_admin import views as platform_views

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
    path("admin/restaurants", platform_views.restaurant_list),
    path("admin/restaurants/<int:restaurant_id>/status", platform_views.set_restaurant_status),
    path("django-admin/", admin.site.urls),
]

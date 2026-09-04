from django.contrib import admin
from django.urls import path

from accounts import views as account_views
from core import views as core_views
from platform_admin import views as platform_views

# One urlconf for platform and Restaurant routes; legacy paths have no trailing slash.
urlpatterns = [
    path("", core_views.home),
    path("health", core_views.health),
    path("register", account_views.register),
    path("login", account_views.login),
    path("auth/refresh", account_views.refresh),
    path("me", account_views.me),
    path("admin/restaurants", platform_views.restaurant_list),
    path("admin/restaurants/<int:restaurant_id>/status", platform_views.set_restaurant_status),
    path("django-admin/", admin.site.urls),
]

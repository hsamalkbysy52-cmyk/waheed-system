from django.contrib import admin
from django.urls import path

from core import views as core_views

# One urlconf for platform and Restaurant routes; legacy paths have no trailing slash.
urlpatterns = [
    path("", core_views.home),
    path("health", core_views.health),
    path("django-admin/", admin.site.urls),
]

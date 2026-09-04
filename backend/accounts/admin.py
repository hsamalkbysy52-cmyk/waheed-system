"""Staff accounts in the Super admin console (plan §3.1; spec story 5).

Restaurants have no staff page of their own yet, so Admins and Cashiers are created here and their
passwords are reset here. Django's stock ``UserAdmin`` is reused for its password handling — the
hash is never shown and the "reset password" form sets a new one — but every fieldset it inherits
is replaced: this User has no ``PermissionsMixin``, so there are no groups, permissions,
``is_superuser`` or editable ``is_staff``; ``role`` alone decides what someone may do.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import BaseUserCreationForm

from accounts.models import User


class StaffCreationForm(BaseUserCreationForm):
    """The console's add form: an account with its password, its role and its Restaurant.

    Django's own ``UserCreationForm`` rejects a display name another user already holds, whatever
    Restaurant they work at; ours are unique per Restaurant, so this uses the documented base form.
    """

    class Meta(BaseUserCreationForm.Meta):
        model = User
        fields = ("email", "username", "role", "restaurant")


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    add_form = StaffCreationForm
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "username", "role", "restaurant", "password1", "password2"),
            },
        ),
    )
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Identity", {"fields": ("username", "role", "restaurant")}),
        ("Status", {"fields": ("is_active", "date_joined", "last_login")}),
    )
    readonly_fields = ("date_joined", "last_login")
    list_display = ("email", "username", "role", "restaurant", "is_active")
    list_filter = ("role", "is_active")
    search_fields = ("email", "username")
    ordering = ("email",)
    filter_horizontal = ()

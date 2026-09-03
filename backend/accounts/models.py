from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models import Q
from django.utils import timezone

from tenants.models import Restaurant


class Role(models.TextChoices):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    CASHIER = "cashier"


class UserManager(BaseUserManager):
    use_in_migrations = True

    @classmethod
    def normalize_email(cls, email: str) -> str:
        """Emails are compared case-insensitively as a whole, not only in the domain part."""
        return (email or "").strip().lower()

    def get_by_natural_key(self, username):
        return self.get(email=self.normalize_email(username))

    def create_user(self, email: str, password: str, **fields) -> "User":
        user = self.model(email=self.normalize_email(email), **fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str, **fields) -> "User":
        """``createsuperuser``: a Super admin, who belongs to no Restaurant."""
        fields.setdefault("username", self.normalize_email(email))
        fields["role"] = Role.SUPER_ADMIN
        fields["restaurant"] = None
        return self.create_user(email, password, **fields)


class User(AbstractBaseUser):
    """Platform user in the public schema (plan §3.5).

    Email is the login identifier; ``username`` is the display name the legacy API shows and is
    unique within a Restaurant. Authority comes from ``role`` alone: Super admins run the platform
    and the Django admin, Admins run one Restaurant, Cashiers work in it. The Restaurant link is
    null only for Super admins, enforced by the database.
    """

    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=Role.choices)
    restaurant = models.ForeignKey(
        Restaurant, null=True, blank=True, on_delete=models.CASCADE, related_name="users"
    )
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["restaurant", "username"],
                nulls_distinct=False,  # Super admins (no Restaurant) share one namespace too
                name="accounts_user_username_unique_per_restaurant",
            ),
            models.CheckConstraint(
                condition=Q(role=Role.SUPER_ADMIN, restaurant__isnull=True)
                | (~Q(role=Role.SUPER_ADMIN) & Q(restaurant__isnull=False)),
                name="accounts_user_restaurant_null_only_for_super_admin",
            ),
        ]

    def __str__(self) -> str:
        return self.email

    @property
    def is_super_admin(self) -> bool:
        return self.role == Role.SUPER_ADMIN

    @property
    def is_staff(self) -> bool:
        """Django admin access: the Super admin console is for Super admins only (plan §3.1)."""
        return self.is_super_admin

    def has_perm(self, perm, obj=None) -> bool:
        return self.is_active and self.is_super_admin

    def has_module_perms(self, app_label) -> bool:
        return self.is_active and self.is_super_admin

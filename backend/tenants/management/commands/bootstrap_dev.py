"""``manage.py bootstrap_dev``: the demo Restaurant and its accounts (plan §7; spec story 49).

Idempotent, so a developer can run it after every migration without thinking about it. It brings
up the Restaurant, the three accounts the frontend's login screen is demonstrated with, and the
demo menu with a Modifier group. Inventory with Recipes and the Table layout are seeded here too
once those apps exist (tickets 06 and 07).
"""

from decimal import Decimal
from typing import NamedTuple

from django.core.management.base import BaseCommand
from django.db import transaction
from django_tenants.utils import schema_context

from accounts.models import Role, User
from menu.models import MenuItem, ModifierGroup, ModifierOption
from tenants.models import Restaurant
from tenants.services import provision_restaurant

DEMO_NAME = "Waheed Restaurant"
DEMO_SLUG = "waheed"


class DemoAccount(NamedTuple):
    email: str
    password: str
    username: str
    role: str


# Today's demo credentials, unchanged from the legacy backend's own seed (database/auth.py).
DEMO_ACCOUNTS = (
    DemoAccount("admin@restaurant1.local.placeholder", "admin123", "admin", Role.ADMIN),
    DemoAccount("cashier@restaurant1.local.placeholder", "cashier123", "cashier", Role.CASHIER),
    DemoAccount(
        "superadmin@platform.local.placeholder", "superadmin123", "superadmin", Role.SUPER_ADMIN
    ),
)


# The legacy seed's six items (backend_legacy/database/models.py::seed_menu), priced in JOD.
DEMO_MENU = (
    ("برجر", Decimal("5.000"), "وجبات"),
    ("بيتزا", Decimal("8.000"), "وجبات"),
    ("باستا", Decimal("6.000"), "وجبات"),
    ("كولا", Decimal("1.500"), "مشروبات"),
    ("عصير", Decimal("2.000"), "مشروبات"),
    ("شاي", Decimal("1.000"), "مشروبات"),
)
DEMO_GROUP = "الإضافات"
DEMO_OPTIONS = (
    ("بدون خبز", Decimal("0.000"), Decimal("-1.000")),
    ("جبن إضافي", Decimal("0.750"), Decimal("1.000")),
)


class Command(BaseCommand):
    help = "Seed the demo Restaurant and the demo accounts for local development (idempotent)."

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        restaurant = self.demo_restaurant()
        for account in DEMO_ACCOUNTS:
            self.demo_account(account, restaurant)
        self.demo_menu(restaurant)

    def demo_restaurant(self) -> Restaurant:
        seeded = Restaurant.objects.filter(slug=DEMO_SLUG).first()
        if seeded is not None:
            self.report(f"Restaurant '{DEMO_SLUG}' already seeded", created=False)
            return seeded
        restaurant = provision_restaurant(DEMO_NAME, slug=DEMO_SLUG)
        self.report(f"Restaurant '{DEMO_SLUG}' created in schema {restaurant.schema_name}")
        return restaurant

    def demo_account(self, account: DemoAccount, restaurant: Restaurant) -> None:
        if User.objects.filter(email=account.email).exists():
            self.report(f"{account.role} {account.email} already seeded", created=False)
            return
        User.objects.create_user(
            account.email,
            account.password,
            username=account.username,
            role=account.role,
            restaurant=None if account.role == Role.SUPER_ADMIN else restaurant,
        )
        self.report(f"{account.role} {account.email} created with password '{account.password}'")

    def demo_menu(self, restaurant: Restaurant) -> None:
        """The six demo dishes and one Modifier group, inside the Restaurant's own schema."""
        with schema_context(restaurant.schema_name):
            if MenuItem.objects.exists():
                self.report("Menu already seeded", created=False)
                return
            dishes = {
                name: MenuItem.objects.create(name=name, price=price, category=category)
                for name, price, category in DEMO_MENU
            }
            group = ModifierGroup.objects.create(
                menu_item=dishes["برجر"], name=DEMO_GROUP, max_selections=3
            )
            for position, (name, price_delta, quantity_delta) in enumerate(DEMO_OPTIONS):
                # The inventory link arrives with ticket 06, together with the Recipes.
                ModifierOption.objects.create(
                    group=group,
                    name=name,
                    price_delta=price_delta,
                    quantity_delta=quantity_delta,
                    sort_order=position,
                )
            self.report(f"Menu created: {len(dishes)} items, group '{DEMO_GROUP}'")

    def report(self, line: str, created: bool = True) -> None:
        self.stdout.write(self.style.SUCCESS(line) if created else line)

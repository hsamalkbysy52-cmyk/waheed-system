"""``manage.py bootstrap_dev``: the demo Restaurant and its accounts (plan §7; spec story 49).

Idempotent, so a developer can run it after every migration without thinking about it. The demo
menu, inventory with recipes, Modifier group and Table layout are seeded here too once those apps
exist (tickets 05, 06 and 07); today the command brings up the Restaurant and the three accounts
the frontend's login screen is demonstrated with.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Role, User
from tenants.models import Restaurant
from tenants.services import provision_restaurant

DEMO_NAME = "Waheed Restaurant"
DEMO_SLUG = "waheed"

# Today's demo credentials, unchanged from the legacy backend's own seed (database/auth.py).
DEMO_ACCOUNTS = (
    ("admin@restaurant1.local.placeholder", "admin123", "admin", Role.ADMIN),
    ("cashier@restaurant1.local.placeholder", "cashier123", "cashier", Role.CASHIER),
    ("superadmin@platform.local.placeholder", "superadmin123", "superadmin", Role.SUPER_ADMIN),
)


class Command(BaseCommand):
    help = "Seed the demo Restaurant and the demo accounts for local development (idempotent)."

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        restaurant = self.demo_restaurant()
        for email, password, username, role in DEMO_ACCOUNTS:
            self.demo_account(email, password, username, role, restaurant)

    def demo_restaurant(self) -> Restaurant:
        seeded = Restaurant.objects.filter(slug=DEMO_SLUG).first()
        if seeded is not None:
            self.report(f"Restaurant '{DEMO_SLUG}' already seeded", created=False)
            return seeded
        restaurant = provision_restaurant(DEMO_NAME, slug=DEMO_SLUG)
        self.report(f"Restaurant '{DEMO_SLUG}' created in schema {restaurant.schema_name}")
        return restaurant

    def demo_account(
        self, email: str, password: str, username: str, role: str, restaurant: Restaurant
    ) -> None:
        if User.objects.filter(email=email).exists():
            self.report(f"{role} {email} already seeded", created=False)
            return
        User.objects.create_user(
            email,
            password,
            username=username,
            role=role,
            restaurant=None if role == Role.SUPER_ADMIN else restaurant,
        )
        self.report(f"{role} {email} created with password '{password}'")

    def report(self, line: str, created: bool = True) -> None:
        self.stdout.write(self.style.SUCCESS(line) if created else line)

"""The Django admin as the Super admin console (plan §3.1; spec stories 4 and 5).

Only Super admins may sign in; Restaurants are edited there and staff accounts are created there
until a restaurant-side page exists. Every assertion goes through the console's own HTTP forms and
then through the API, so the console is proven to produce accounts and Restaurants the API accepts.
"""

import pytest
from django.db import connection

from tenants.models import Domain, Restaurant
from tests.conftest import sign_in
from tests.golden import legacy_golden

pytestmark = pytest.mark.django_db

CONSOLE = "/django-admin/"
USER_ADD = "/django-admin/accounts/user/add/"
RESTAURANT_ADD = "/django-admin/tenants/restaurant/add/"
CONSOLE_PASSWORD = "Console-Pass-9182"  # satisfies Django's password validators


def console_login(client, user) -> bool:
    """Sign in to the Django admin the way a person does; True when a session was created."""
    response = client.post(
        f"{CONSOLE}login/",
        {"username": user.email, "password": user.plain_password, "next": CONSOLE},
    )
    return response.status_code == 302


def submit(client, path: str, form: dict):
    """Post an admin form, failing with its validation errors instead of an HTML page."""
    response = client.post(path, form)
    if response.status_code != 302:
        admin_form = response.context.get("adminform") if response.context else None
        raise AssertionError(f"{path} refused the form: {admin_form and admin_form.form.errors}")
    return response


def restaurant_form(restaurant: Restaurant, **changes) -> dict:
    fields = {
        "name": restaurant.name,
        "slug": restaurant.slug,
        "email": restaurant.email,
        "phone": restaurant.phone,
        "country": restaurant.country,
        "currency": restaurant.currency,
        "timezone": restaurant.timezone,
        "status": restaurant.status,
        "ai_provider": restaurant.ai_provider,
    }
    return {**fields, **changes}


def schema_exists(schema_name: str) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", [schema_name]
        )
        return cursor.fetchone() is not None


# --- who may sign in -----------------------------------------------------------------------


def test_a_super_admin_reaches_the_console(client, super_admin, restaurant):
    assert console_login(client, super_admin)

    index = client.get(CONSOLE)

    assert index.status_code == 200
    assert b"/django-admin/tenants/restaurant/" in index.content
    assert b"/django-admin/accounts/user/" in index.content


@pytest.mark.parametrize("staff", ["admin", "cashier"])
def test_the_console_refuses_restaurant_staff(client, request, staff):
    assert not console_login(client, request.getfixturevalue(staff))

    assert client.get(CONSOLE).status_code == 302  # bounced back to the console's login page


def test_the_console_lists_the_restaurants_and_their_users(client, super_admin, admin):
    console_login(client, super_admin)

    restaurants = client.get("/django-admin/tenants/restaurant/")
    users = client.get("/django-admin/accounts/user/")

    assert restaurants.status_code == 200
    assert b"Waheed Restaurant" in restaurants.content
    assert users.status_code == 200
    assert admin.email.encode() in users.content


# --- staff accounts ------------------------------------------------------------------------


def test_a_cashier_created_in_the_console_can_sign_in(client, super_admin, restaurant):
    console_login(client, super_admin)

    submit(
        client,
        USER_ADD,
        {
            "email": "new.cashier@waheed.example",
            "username": "cashier",
            "role": "cashier",
            "restaurant": restaurant.pk,
            "password1": CONSOLE_PASSWORD,
            "password2": CONSOLE_PASSWORD,
        },
    )

    session = sign_in(client, "new.cashier@waheed.example", CONSOLE_PASSWORD)
    assert session["role"] == "cashier"
    assert session["username"] == "cashier"


def test_each_restaurant_may_have_its_own_cashier_of_the_same_name(
    client, super_admin, cashier, other_restaurant
):
    console_login(client, super_admin)

    submit(
        client,
        USER_ADD,
        {
            "email": "cashier@shawarma-house.example",
            "username": cashier.username,
            "role": "cashier",
            "restaurant": other_restaurant.pk,
            "password1": CONSOLE_PASSWORD,
            "password2": CONSOLE_PASSWORD,
        },
    )

    session = sign_in(client, "cashier@shawarma-house.example", CONSOLE_PASSWORD)
    assert session["username"] == cashier.username


def test_a_cashier_cannot_be_created_without_a_restaurant(client, super_admin):
    console_login(client, super_admin)

    response = client.post(
        USER_ADD,
        {
            "email": "loose.cashier@waheed.example",
            "username": "loose",
            "role": "cashier",
            "restaurant": "",
            "password1": CONSOLE_PASSWORD,
            "password2": CONSOLE_PASSWORD,
        },
    )

    assert response.status_code == 200  # the form comes back with the constraint's complaint
    refused = client.post(
        "/login",
        {"email": "loose.cashier@waheed.example", "password": CONSOLE_PASSWORD},
        content_type="application/json",
    )
    assert refused.status_code == 401  # no such account was created


def test_a_password_set_in_the_console_replaces_the_old_one(client, super_admin, cashier):
    console_login(client, super_admin)

    submit(
        client,
        f"/django-admin/accounts/user/{cashier.pk}/password/",
        {"password1": CONSOLE_PASSWORD, "password2": CONSOLE_PASSWORD},
    )

    assert sign_in(client, cashier.email, CONSOLE_PASSWORD)["role"] == "cashier"
    stale = client.post(
        "/login",
        {"email": cashier.email, "password": cashier.plain_password},
        content_type="application/json",
    )
    assert stale.status_code == 401


# --- Restaurants ---------------------------------------------------------------------------


def test_editing_a_restaurant_changes_what_its_staff_see(client, super_admin, admin, login):
    console_login(client, super_admin)
    restaurant = admin.restaurant

    submit(
        client,
        f"/django-admin/tenants/restaurant/{restaurant.pk}/change/",
        restaurant_form(restaurant, slug="waheed-amman", currency="IQD", timezone="Asia/Baghdad"),
    )

    me = client.get("/me", headers=login(admin)).json()
    assert me["restaurant"] == {
        "name": "Waheed Restaurant",
        "slug": "waheed-amman",
        "currency": "IQD",
        "timezone": "Asia/Baghdad",
    }


def test_suspending_a_restaurant_in_the_console_refuses_its_staff(
    client, super_admin, admin, login
):
    console_login(client, super_admin)
    headers = login(admin)

    submit(
        client,
        f"/django-admin/tenants/restaurant/{admin.restaurant.pk}/change/",
        restaurant_form(admin.restaurant, status="suspended"),
    )

    assert client.get("/me", headers=headers).status_code == 403


def test_a_restaurant_added_in_the_console_gets_its_schema_and_domain_record(
    client, super_admin, login
):
    console_login(client, super_admin)

    submit(
        client,
        RESTAURANT_ADD,
        {
            "name": "Pizza Place",
            "slug": "pizza-place",
            "email": "owner@pizza.example",
            "phone": "+962790000001",
            "country": "JO",
            "currency": "JOD",
            "timezone": "Asia/Amman",
            "status": "active",
            "ai_provider": "",
        },
    )

    added = Restaurant.objects.get(slug="pizza-place")
    assert added.schema_name.startswith("r_")
    assert schema_exists(added.schema_name)
    assert Domain.objects.filter(tenant=added, is_primary=True).count() == 1
    listed = client.get(legacy_golden("GET /admin/restaurants").path, headers=login(super_admin))
    assert listed.json()["restaurants"][0]["name"] == "Pizza Place"

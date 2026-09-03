"""Sessions: ``POST /auth/refresh`` and ``GET /me`` (plan §5.2), the token contract (plan §3.5)
and the register → login → me path from an empty database (isolation matrix item 8)."""

import pytest
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from tests.golden import legacy_golden

EIGHT_HOURS = 8 * 3600
THIRTY_DAYS = 30 * 86400


def sign_in(client, email, password):
    response = client.post(
        "/login", {"email": email, "password": password}, content_type="application/json"
    )
    assert response.status_code == 200, response.content
    return response.json()


@pytest.mark.django_db
def test_tokens_carry_the_legacy_claims_and_the_agreed_lifetimes(client, admin):
    session = sign_in(client, admin.email, "admin123")

    access, refresh = AccessToken(session["token"]), RefreshToken(session["refresh"])

    for token in (access, refresh):
        assert token["role"] == "admin"
        assert token["restaurant_id"] == admin.restaurant_id
        assert token["username"] == "admin"
    assert access["exp"] - access["iat"] == EIGHT_HOURS
    assert refresh["exp"] - refresh["iat"] == THIRTY_DAYS


@pytest.mark.django_db
def test_refresh_returns_a_new_access_token_that_signs_in(client, admin):
    session = sign_in(client, admin.email, "admin123")

    response = client.post(
        "/auth/refresh", {"refresh": session["refresh"]}, content_type="application/json"
    )

    assert response.status_code == 200
    assert set(response.json()) == {"token", "refresh"}
    me = client.get("/me", headers={"Authorization": f"Bearer {response.json()['token']}"})
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


@pytest.mark.django_db
def test_refresh_with_an_invalid_token_is_refused(client):
    response = client.post(
        "/auth/refresh", {"refresh": "not-a-token"}, content_type="application/json"
    )

    assert response.status_code == 401
    assert response.json() == {"error": "توكن غير صالح", "detail": "توكن غير صالح"}


@pytest.mark.django_db
def test_refresh_for_a_deactivated_user_is_refused_in_arabic(client, admin):
    session = sign_in(client, admin.email, "admin123")
    admin.is_active = False
    admin.save()

    response = client.post(
        "/auth/refresh", {"refresh": session["refresh"]}, content_type="application/json"
    )

    assert response.status_code == 401
    assert response.json() == {"error": "توكن غير صالح", "detail": "توكن غير صالح"}


@pytest.mark.django_db
def test_me_describes_the_admin_and_the_restaurant_with_jordan_defaults(client, admin, login):
    response = client.get("/me", headers=login(admin))

    assert response.status_code == 200
    assert response.json() == {
        "username": "admin",
        "role": "admin",
        "restaurant_id": admin.restaurant_id,
        "restaurant": {
            "name": "Waheed Restaurant",
            "slug": "waheed",
            "currency": "JOD",
            "timezone": "Asia/Amman",
        },
    }


@pytest.mark.django_db
def test_me_for_a_super_admin_has_no_restaurant(client, super_admin, login):
    response = client.get("/me", headers=login(super_admin))

    assert response.status_code == 200
    assert response.json() == {
        "username": "superadmin",
        "role": "super_admin",
        "restaurant_id": None,
        "restaurant": None,
    }


@pytest.mark.django_db
def test_me_without_a_token_is_refused_with_the_legacy_message(client):
    response = client.get("/me")

    assert response.status_code == 401
    assert response.json() == {"error": "توكن غير موجود", "detail": "توكن غير موجود"}


@pytest.mark.django_db
def test_register_then_login_then_me_work_from_an_empty_database(client):
    """Isolation matrix item 8: the test database starts empty; nothing is seeded here."""
    golden = legacy_golden("POST /register")
    registered = client.post(golden.path, golden.body, content_type="application/json").json()
    first_visit = client.get("/me", headers={"Authorization": f"Bearer {registered['token']}"})
    assert first_visit.status_code == 200

    session = sign_in(client, golden.body["email"], golden.body["password"])
    me = client.get("/me", headers={"Authorization": f"Bearer {session['token']}"}).json()

    assert me["role"] == "admin"
    assert me["restaurant"]["name"] == "Shawarma House"
    assert me["restaurant"]["slug"].startswith("r-") and len(me["restaurant"]["slug"]) == 10
    assert me["restaurant"]["currency"] == "JOD"

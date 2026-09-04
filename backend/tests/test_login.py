"""``POST /login``: staff sign in with email and password (spec stories 1, 27); refusals keep the
legacy messages with real status codes (tests/goldens/README.md)."""

import pytest

from tests.golden import assert_matches_golden, golden_error, legacy_golden


@pytest.mark.django_db
def test_login_matches_the_golden_and_adds_a_refresh_token(client, admin):
    golden = legacy_golden("POST /login")

    response = client.post(golden.path, golden.body, content_type="application/json")

    assert response.status_code == 200
    assert_matches_golden(response.json(), {**golden.response, "refresh": "<jwt>"})


@pytest.mark.django_db
def test_login_with_a_wrong_password_is_refused_with_the_legacy_message(client, admin):
    golden = legacy_golden("POST /login", "failure:wrong-password")

    response = client.post(golden.path, golden.body, content_type="application/json")

    assert response.status_code == 401
    assert response.json() == golden_error(golden)


@pytest.mark.django_db
def test_login_with_an_unknown_email_is_refused_the_same_way(client, admin):
    body = {"email": "nobody@example.com", "password": "admin123"}

    response = client.post("/login", body, content_type="application/json")

    assert response.status_code == 401
    assert response.json()["error"] == "البريد الإلكتروني أو كلمة السر غلط"


@pytest.mark.django_db
def test_login_matches_the_email_case_insensitively(client, admin):
    body = {"email": "Admin@Restaurant1.Local.Placeholder", "password": "admin123"}

    response = client.post("/login", body, content_type="application/json")

    assert response.status_code == 200
    assert response.json()["username"] == "admin"


@pytest.mark.django_db
def test_login_to_a_suspended_restaurant_is_refused(client, other_admin, suspend):
    """Isolation matrix item 6, first half."""
    suspend(other_admin.restaurant)
    golden = legacy_golden("POST /login", "failure:restaurant-suspended")

    response = client.post(golden.path, golden.body, content_type="application/json")

    assert response.status_code == 403
    assert response.json() == golden_error(golden)

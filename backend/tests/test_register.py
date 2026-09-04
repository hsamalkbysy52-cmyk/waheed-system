"""``POST /register``: a restaurant owner registers and is signed in (spec stories 9 and 10)."""

import pytest

from tests.golden import assert_matches_golden, golden_error, legacy_golden, refusal


@pytest.mark.django_db
def test_register_matches_the_golden_and_adds_a_refresh_token(client):
    golden = legacy_golden("POST /register")

    response = client.post(golden.path, golden.body, content_type="application/json")

    assert response.status_code == 200
    assert_matches_golden(response.json(), {**golden.response, "refresh": "<jwt>"})


@pytest.mark.django_db
@pytest.mark.parametrize("case", ["empty-name", "invalid-email", "short-password"])
def test_register_rejects_bad_input_with_the_legacy_message(client, case):
    golden = legacy_golden("POST /register", f"failure:{case}")

    response = client.post(golden.path, golden.body, content_type="application/json")

    assert response.status_code == 400
    assert response.json() == golden_error(golden)


@pytest.mark.django_db
def test_register_rejects_an_email_that_is_already_registered(client):
    first = legacy_golden("POST /register")
    client.post(first.path, first.body, content_type="application/json")
    golden = legacy_golden("POST /register", "failure:duplicate-email")

    response = client.post(golden.path, golden.body, content_type="application/json")

    assert response.status_code == 400
    assert response.json() == golden_error(golden)


@pytest.mark.django_db
def test_register_reports_the_first_failed_check_in_the_legacy_order(client):
    """Name, then email format, then password length: the legacy API stopped at the first."""
    body = {"restaurant_name": "Shawarma House", "phone": "", "email": "nope", "password": "123"}

    response = client.post("/register", body, content_type="application/json")

    assert response.status_code == 400
    assert response.json()["error"] == "البريد الإلكتروني غير صالح"


def test_register_is_a_platform_route(client, admin, login):
    """A signed-in staff member's token scopes the connection to their Restaurant, where a new
    Restaurant cannot be created; the platform routes refuse the call instead of failing inside."""
    body = {"restaurant_name": "X", "phone": "", "email": "x@example.com", "password": "secret123"}

    response = client.post("/register", body, content_type="application/json", headers=login(admin))

    assert response.status_code == 400
    assert response.json() == refusal("هذا المسار للمنصة فقط")

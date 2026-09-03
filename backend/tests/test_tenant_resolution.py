"""The tenant middleware, observed through ``GET /me``: how a request's Restaurant is resolved and
refused (plan §3.2; isolation matrix items 2, 3, 6 and 9). The messages are the legacy API's
(``tests/goldens/legacy/02-get-menu--*``)."""

from datetime import timedelta

import pytest
from rest_framework_simplejwt.tokens import AccessToken

from tests.conftest import suspend
from tests.golden import golden_error, legacy_golden

ORIGIN = {"Origin": "http://localhost:3000"}


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.django_db
def test_an_invalid_token_is_refused_before_any_view(client):
    golden = legacy_golden("GET /menu", "failure:invalid-token")

    response = client.get("/me", headers=bearer("not.a.jwt"))

    assert response.status_code == 401
    assert response.json() == golden_error(golden)


@pytest.mark.django_db
def test_an_expired_token_is_refused(client, admin):
    token = AccessToken.for_user(admin)
    token.set_exp(lifetime=timedelta(seconds=-1))

    response = client.get("/me", headers=bearer(str(token)))

    assert response.status_code == 401
    assert response.json()["error"] == "توكن غير صالح"


@pytest.mark.django_db
def test_a_tampered_token_is_refused(client, admin, login):
    genuine = login(admin)["Authorization"].removeprefix("Bearer ")
    header, payload, signature = genuine.split(".")
    forged = ".".join(
        [header, payload, signature[:-2] + ("AA" if signature[-2:] != "AA" else "BB")]
    )

    response = client.get("/me", headers=bearer(forged))

    assert response.status_code == 401
    assert response.json()["error"] == "توكن غير صالح"


@pytest.mark.django_db
def test_a_token_whose_user_is_gone_is_refused_in_arabic(client, admin, login):
    headers = login(admin)
    admin.delete()

    response = client.get("/me", headers=headers)

    assert response.status_code == 401
    assert response.json() == {"error": "توكن غير صالح", "detail": "توكن غير صالح"}


@pytest.mark.django_db
def test_naming_another_restaurant_in_the_header_is_forbidden(
    client, admin, other_restaurant, login
):
    """Isolation matrix item 2."""
    golden = legacy_golden("GET /menu", "failure:foreign-restaurant-header")
    headers = {**login(admin), "X-Restaurant-Id": str(other_restaurant.pk)}

    response = client.get("/me", headers=headers)

    assert response.status_code == 403
    assert response.json() == golden_error(golden)


@pytest.mark.django_db
def test_naming_your_own_restaurant_in_the_header_is_fine(client, admin, login):
    headers = {**login(admin), "X-Restaurant-Id": str(admin.restaurant_id)}

    response = client.get("/me", headers=headers)

    assert response.status_code == 200


@pytest.mark.django_db
def test_a_suspended_restaurant_signs_its_staff_out_on_the_next_request(client, admin, login):
    """Isolation matrix item 6, second half: an existing token stops working at once."""
    golden = legacy_golden("GET /menu", "failure:restaurant-suspended")
    headers = login(admin)
    suspend(admin.restaurant)

    response = client.get("/me", headers=headers)

    assert response.status_code == 403
    assert response.json() == golden_error(golden)


@pytest.mark.django_db
def test_middleware_refusals_carry_cors_headers(client, admin, other_restaurant, login):
    """Isolation matrix item 9: the browser must see the 401/403, not a network error."""
    unauthenticated = client.get("/me", headers={**bearer("not.a.jwt"), **ORIGIN})
    forbidden = client.get(
        "/me", headers={**login(admin), "X-Restaurant-Id": str(other_restaurant.pk), **ORIGIN}
    )

    assert unauthenticated.status_code == 401
    assert forbidden.status_code == 403
    assert unauthenticated["Access-Control-Allow-Origin"] == "*"
    assert forbidden["Access-Control-Allow-Origin"] == "*"


@pytest.mark.django_db
def test_a_super_admin_may_name_a_restaurant_even_a_suspended_one(
    client, super_admin, other_restaurant, login
):
    suspend(other_restaurant)
    headers = {**login(super_admin), "X-Restaurant-Id": str(other_restaurant.pk)}

    response = client.get("/me", headers=headers)

    assert response.status_code == 200


@pytest.mark.django_db
def test_a_super_admin_naming_an_unknown_restaurant_gets_404(client, super_admin, login):
    headers = {**login(super_admin), "X-Restaurant-Id": "999999"}

    response = client.get("/me", headers=headers)

    assert response.status_code == 404
    assert response.json() == {"error": "المطعم غير موجود", "detail": "المطعم غير موجود"}

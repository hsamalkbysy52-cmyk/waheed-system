"""HTTP tests for the health routes: the legacy root (plan §1.3, route 1) and the added /health."""

import pytest


def test_root_returns_legacy_health_body(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"message": "Waheed System Running!", "status": "ok"}


@pytest.mark.django_db
def test_health_reports_ok_when_the_database_answers(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.django_db
def test_django_admin_login_page_renders(client):
    response = client.get("/django-admin/login/")

    assert response.status_code == 200

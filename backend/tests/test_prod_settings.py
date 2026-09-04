"""The production settings module (ticket 16): hardening that `manage.py check --deploy` asks for,
and the static-files setup the Django admin needs behind gunicorn."""

import importlib
import os
import subprocess
import sys

import pytest

PROD_ENV = {
    # 64 varied characters: W009 wants at least 50 characters and 5 distinct ones.
    "SECRET_KEY": "kq7v2m9p4x1z8w3n6b5c0f2g7h9j4l1rQW8E5R2T7Y1U4I9O3P6A0S5D8F2G4H7J",
    "DATABASE_URL": "postgres://localhost/waheed",
    "REDIS_URL": "redis://localhost:6379/0",
    "ALLOWED_HOSTS": "api.example.com",
    "CORS_ALLOWED_ORIGINS": "https://app.example.com",
}


@pytest.fixture
def prod(monkeypatch):
    for key, value in PROD_ENV.items():
        monkeypatch.setenv(key, value)
    import waheed.settings.prod as module

    return importlib.reload(module)


def test_production_is_hardened(prod):
    assert prod.DEBUG is False
    assert prod.SECURE_HSTS_SECONDS >= 31_536_000
    assert prod.SESSION_COOKIE_SECURE and prod.CSRF_COOKIE_SECURE
    assert prod.SECURE_PROXY_SSL_HEADER == ("HTTP_X_FORWARDED_PROTO", "https")
    assert "django.middleware.clickjacking.XFrameOptionsMiddleware" in prod.MIDDLEWARE


def test_static_files_are_served_by_whitenoise(prod):
    middleware = list(prod.MIDDLEWARE)
    assert middleware.index("whitenoise.middleware.WhiteNoiseMiddleware") == (
        middleware.index("django.middleware.security.SecurityMiddleware") + 1
    )
    assert prod.STORAGES["staticfiles"]["BACKEND"].startswith("whitenoise.storage.")


def test_the_deploy_check_passes_without_warnings():
    """What Railway will run: the checks at WARNING level, with the one silenced check explained
    in prod.py (Railway's edge handles the HTTPS redirect)."""
    env = {**os.environ, **PROD_ENV, "DJANGO_SETTINGS_MODULE": "waheed.settings.prod"}
    result = subprocess.run(
        [sys.executable, "manage.py", "check", "--deploy", "--fail-level", "WARNING"],
        capture_output=True,
        text=True,
        env=env,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    )

    assert result.returncode == 0, result.stderr + result.stdout

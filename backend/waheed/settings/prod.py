"""Production (Railway): every secret and host comes from the environment."""

from .base import *  # noqa: F403
from .base import env

DEBUG = False
SECRET_KEY = env("SECRET_KEY")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS")

# Fail at start-up rather than at the first query when the infrastructure URLs are missing.
env("DATABASE_URL")
env("REDIS_URL")

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")  # TLS terminates at Railway
SESSION_COOKIE_SECURE = True  # Django admin cookies travel over HTTPS only
CSRF_COOKIE_SECURE = True

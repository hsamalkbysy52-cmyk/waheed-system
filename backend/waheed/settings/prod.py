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

# `manage.py check --deploy` hardening (ticket 16). Railway's edge already redirects HTTP to HTTPS
# and probes /health over plain HTTP inside the network, so Django itself does not redirect
# (security.W008 is silenced deliberately); HSTS is sent on the HTTPS responses instead.
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=False)
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31_536_000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = False  # W021: not submitting a Railway subdomain to browser preload lists
SILENCED_SYSTEM_CHECKS = ["security.W008", "security.W021"]

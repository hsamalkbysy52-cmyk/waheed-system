"""Local development: permissive defaults so a fresh machine runs with no .env file."""

from .base import *  # noqa: F403
from .base import env

DEBUG = env.bool("DEBUG", default=True)
SECRET_KEY = env("SECRET_KEY", default="dev-only-insecure-secret-key-never-use-in-production")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

CORS_ALLOW_ALL_ORIGINS = True  # the legacy API allowed every origin; prod restricts it

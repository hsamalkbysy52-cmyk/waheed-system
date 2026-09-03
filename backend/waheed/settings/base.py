"""Settings shared by every environment. dev.py, prod.py and test.py override."""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")  # silently skipped when the file is absent

DEBUG = False
ALLOWED_HOSTS = []

# --- Tenancy (ADR-0001): one PostgreSQL schema per Restaurant -----------------------------

SHARED_APPS = (
    "django_tenants",  # must come first
    "tenants",
    "accounts",
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.admin",  # Super admin console
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
)
# Per-Restaurant apps are added here by the tickets that create them
# (menu, inventory, orders, layout, ai, messaging). django-tenants requires contenttypes in
# both lists so every Restaurant schema carries its own content-types table.
TENANT_APPS = ("django.contrib.contenttypes",)
INSTALLED_APPS = list(SHARED_APPS) + [a for a in TENANT_APPS if a not in SHARED_APPS]

TENANT_MODEL = "tenants.Restaurant"
TENANT_DOMAIN_MODEL = "tenants.Domain"
TENANT_LIMIT_SET_CALLS = True
DATABASE_ROUTERS = ("django_tenants.routers.TenantSyncRouter",)

DATABASES = {
    "default": {
        **env.db("DATABASE_URL", default="postgres://localhost/waheed"),
        "ENGINE": "django_tenants.postgresql_backend",
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

MIDDLEWARE = (
    # CORS first: the browser must see the 401/403 the tenant middleware emits, not a network error.
    "corsheaders.middleware.CorsMiddleware",
    "core.middleware.JWTTenantMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",  # Django admin only
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",  # Django admin only; API views are CSRF-exempt
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
)

ROOT_URLCONF = "waheed.urls"
WSGI_APPLICATION = "waheed.wsgi.application"
APPEND_SLASH = False  # legacy paths carry no trailing slash

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,  # Django admin templates
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# --- Identity -----------------------------------------------------------------------------

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- API (ADR-0002: function-based DRF views) ---------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    # Secure by default; public routes opt in with @permission_classes([AllowAny]).
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
}

# --- Background work and cache (ADR-0003) -------------------------------------------------

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_IGNORE_RESULT = True  # results matter only under tests, where tasks run eagerly
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        # Prefixes every key with the connection's schema name, so Restaurants never share entries.
        "KEY_FUNCTION": "django_tenants.cache.make_key",
    }
}

# --- Internationalisation -----------------------------------------------------------------

LANGUAGE_CODE = "en-us"  # code and admin are English; the API's user-facing strings are Arabic
TIME_ZONE = "UTC"  # each Restaurant carries its own timezone for reporting
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

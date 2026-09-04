"""Settings shared by every environment. dev.py, prod.py and test.py override."""

from datetime import timedelta
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
    "platform_admin",
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.admin",  # Super admin console
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
)
# Per-Restaurant apps. django-tenants requires contenttypes in both lists so every Restaurant
# schema carries its own content-types table.
TENANT_APPS = (
    "django.contrib.contenttypes",
    "menu",
    "inventory",
    "layout",
    "orders",
    "messaging",
    "ai",
)
# ``dict.fromkeys`` keeps each app's first occurrence: contenttypes is in both lists above.
# django.contrib.admin leads so its own templates render the Super admin console — the tenancy
# library ships admin template overrides that read ``request.tenant.schema_name`` unconditionally,
# and a platform-scope request has no Restaurant (plan §3.2).
INSTALLED_APPS = list(dict.fromkeys(["django.contrib.admin", *SHARED_APPS, *TENANT_APPS]))

TENANT_MODEL = "tenants.Restaurant"
TENANT_DOMAIN_MODEL = "tenants.Domain"
TENANT_LIMIT_SET_CALLS = True
# Only fills the mandatory Domain row (``<slug>.<base>``); nothing routes by hostname (ADR-0001).
TENANT_BASE_DOMAIN = env("TENANT_BASE_DOMAIN", default="localhost")
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
    "EXCEPTION_HANDLER": "core.exceptions.exception_handler",
    # The agent routes are the only throttled ones for now (backlog: the public routes).
    "DEFAULT_THROTTLE_RATES": {"agent": env("AGENT_THROTTLE_RATE", default="20/minute")},
}

# Sessions last a working day and refresh silently for a month (plan §14 Q5).
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
}

# --- Background work and cache (ADR-0003) -------------------------------------------------

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_IGNORE_RESULT = True  # results matter only under tests, where tasks run eagerly
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# Outbound messages (Fraud alerts, WhatsApp replies): a dotted path to a sender class. The Cloud
# API sender logs for a Restaurant without a connected number; tests record instead.
MESSAGING_SENDER = env("MESSAGING_SENDER", default="messaging.whatsapp.WhatsAppSender")

# --- WhatsApp Cloud API (ADR-0004; plan §6.4) -----------------------------------------------

WHATSAPP_API_VERSION = env("WHATSAPP_API_VERSION", default="v21.0")
WHATSAPP_VERIFY_TOKEN = env("WHATSAPP_VERIFY_TOKEN", default="")  # Meta's webhook verification
WHATSAPP_APP_SECRET = env("WHATSAPP_APP_SECRET", default="")  # signs every webhook delivery
# The approved utility template for owner alerts; empty means "log only" (grilling Q21).
WHATSAPP_FRAUD_ALERT_TEMPLATE = env("WHATSAPP_FRAUD_ALERT_TEMPLATE", default="")
WHATSAPP_TEMPLATE_LANGUAGE = env("WHATSAPP_TEMPLATE_LANGUAGE", default="ar")

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

# --- AI Providers (plan §6.1; grilling Q14) -------------------------------------------------

# Gemini's free tier is the default; OpenAI is the automatic fallback when its key exists. A
# Provider is available only when its key is set. Keys never reach the browser (spec story 22).
AI_DEFAULT_PROVIDER = env("AI_DEFAULT_PROVIDER", default="gemini")
AI_PROVIDER_KEYS = {
    "gemini": env("GEMINI_API_KEY", default=""),
    "openai": env("OPENAI_API_KEY", default=""),
}
AI_PROVIDER_MODELS = {
    "gemini": env("GEMINI_MODEL", default="gemini-2.5-flash"),
    "openai": env("OPENAI_MODEL", default="gpt-4o-mini"),
}
AI_PROVIDER_CLASSES = {
    "gemini": "ai.providers.gemini.GeminiProvider",
    "openai": "ai.providers.openai_provider.OpenAIProvider",
}

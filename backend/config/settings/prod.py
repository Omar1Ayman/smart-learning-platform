from pathlib import Path

from decouple import Csv, config

from .base import *  # noqa: F403
from .base import BASE_DIR

DEBUG = False
MEDIA_ROOT = Path(config("MEDIA_ROOT", default=str(BASE_DIR / "media")))

# Require SSL for production database connections (Neon, etc.)
DATABASES["default"]["OPTIONS"] = {
    "sslmode": "require",
}
# Fail loudly at boot rather than silently run with the dev placeholder key.
SECRET_KEY = config("DJANGO_SECRET_KEY")
if len(SECRET_KEY) < 50 or SECRET_KEY in {
    "dev-insecure-key-change-me-before-prod",
    "dev-insecure-key-local-only",
    "build-only",
    "build-only-placeholder-do-not-use-at-runtime",
}:
    raise RuntimeError(
        "DJANGO_SECRET_KEY must be a unique, randomly generated production secret "
        "of at least 50 characters."
    )

# --- Hosts ---
# Railway gives each service a *.railway.app domain, plus a health-check
# domain (healthcheck.railway.app). ALLOWED_HOSTS must include both the
# backend domain and any custom domain wired to the service.
ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", cast=Csv())
if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    raise RuntimeError("DJANGO_ALLOWED_HOSTS must contain explicit production hostnames.")

required_database_variables = (
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "DB_HOST",
)
missing_database_variables = [
    name for name in required_database_variables if not config(name, default="")
]
if missing_database_variables:
    raise RuntimeError(
        "Set the required PostgreSQL variables: " + ", ".join(missing_database_variables) + "."
    )

if not FRONTEND_URL.startswith("https://"):  # noqa: F405
    raise RuntimeError("FRONTEND_URL must use HTTPS in production.")

# --- Wave E1 — require a real email backend in production ---
# Silently dropping password-reset emails is worse than a hard fail at
# boot. If you're using a third-party transactional email API (SendGrid
# HTTP API, Mailgun, Postmark), override EMAIL_BACKEND to its backend
# AND set EMAIL_HOST_USER to the API key. Any SMTP-based provider works
# out of the box.
if EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend":  # noqa: F405
    raise RuntimeError(
        "EMAIL_BACKEND must not be the console backend in production. "
        "Set EMAIL_BACKEND, EMAIL_HOST, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD "
        "in your environment (see .env.production.example)."
    )
if not EMAIL_HOST or not EMAIL_HOST_USER or not EMAIL_HOST_PASSWORD:  # noqa: F405
    raise RuntimeError(
        "EMAIL_HOST, EMAIL_HOST_USER, and EMAIL_HOST_PASSWORD must be set in production."
    )

# --- HTTPS / proxies ---
# Railway terminates TLS at its edge and forwards X-Forwarded-Proto. Trust
# that header so Django knows the original request was HTTPS.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# --- CORS ---
# Frontend is on a different registrable domain (e.g. Vercel *.vercel.app
# vs backend *.railway.app), so the browser treats requests as cross-site.
# Credentials (the httpOnly refresh cookie) must be allowed explicitly.
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", cast=Csv())
if not CORS_ALLOWED_ORIGINS or any(
    not origin.startswith("https://") for origin in CORS_ALLOWED_ORIGINS
):
    raise RuntimeError("CORS_ALLOWED_ORIGINS must contain explicit HTTPS frontend origins.")
CORS_ALLOW_CREDENTIALS = True

# CSRF trusted origins are needed for Django admin login across domains.
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", cast=Csv())
if not CSRF_TRUSTED_ORIGINS or any(
    not origin.startswith("https://") for origin in CSRF_TRUSTED_ORIGINS
):
    raise RuntimeError("CSRF_TRUSTED_ORIGINS must contain HTTPS origins.")

# --- Refresh cookie SameSite ---
# Cross-domain frontend/backend requires SameSite=None; Secure. This is
# weaker than Strict against CSRF, but the cookie is httpOnly + the
# refresh endpoint is POST-only and returns nothing sensitive without
# a valid token, so the practical exposure is limited. When a custom
# root domain is available, switch back to Strict and host both services
# under that domain.
REFRESH_TOKEN_COOKIE_SAMESITE = config("REFRESH_TOKEN_COOKIE_SAMESITE", default="None")
if REFRESH_TOKEN_COOKIE_SAMESITE not in ("None", "Strict"):
    raise RuntimeError("REFRESH_TOKEN_COOKIE_SAMESITE must be either 'None' or 'Strict'.")

# --- Logging ---
# Send everything to stdout so platform log collectors (Railway/Render/
# DO) can aggregate it. JSON would be nicer for structured search, but
# plain text is readable in the platform's UI and works with everything.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}

STORAGES = {
    **STORAGES,  # keep base.py's "default" storage (FileSystemStorage for media)
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

# Serve static files directly from Django's app finders at request time.
# Required on Vercel because collectstatic doesn't run during build.
WHITENOISE_USE_FINDERS = True
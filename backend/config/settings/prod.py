from decouple import config

from .base import *  # noqa: F401,F403

DEBUG = False

# Fail loudly at boot rather than silently run with the dev placeholder key.
SECRET_KEY = config("DJANGO_SECRET_KEY")

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# No wildcard CORS/hosts in prod — must be set explicitly per deployment.
if ALLOWED_HOSTS == ["localhost", "127.0.0.1"]:  # noqa: F405 (default from base.py)
    raise RuntimeError("DJANGO_ALLOWED_HOSTS must be set explicitly in production.")

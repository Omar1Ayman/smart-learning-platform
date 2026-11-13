# ============================================================================
# Smart Learning Platform — Backend production image.
#
# Design:
#   - Multi-stage: build deps (gcc, headers) stay in the builder, runtime
#     gets only libpq + libmagic (needed by psycopg2 + python-magic).
#   - Non-root user (app) — running gunicorn as root is a needless risk.
#   - Healthcheck hits /health/ (already implemented, returns 200/503).
#   - collectstatic runs at image build; migrations and billing seed data
#     run through the container entrypoint before Gunicorn starts.
# ============================================================================

# ---- Stage 1: build ----
FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Install into an isolated venv so we can COPY it into the runtime stage.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements/ requirements/
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements/prod.txt

# ---- Stage 2: runtime ----
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libmagic1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash app
WORKDIR /app
USER app

COPY --from=builder --chown=app:app /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

# Copy source last so code changes don't invalidate the pip cache layer.
COPY --chown=app:app . .

# collectstatic needs a settings module that doesn't require production
# secrets at build time. Temporary values are scoped to this build step
# and are never persisted as runtime environment defaults.

# Pre-build the static files (admin CSS etc.) so the image is ready to
# serve on first request. Whitenoise serves them from /app/staticfiles.
RUN mkdir -p /app/staticfiles \
    && DJANGO_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')" \
       DJANGO_ALLOWED_HOSTS="build.example.com" \
       EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend" \
       EMAIL_HOST="build.invalid" \
       EMAIL_HOST_USER="build@example" \
       EMAIL_HOST_PASSWORD="build" \
       DB_NAME="build" \
       DB_USER="build" \
       DB_PASSWORD="build" \
       DB_HOST="localhost" \
       FRONTEND_URL="https://example.com" \
       CORS_ALLOWED_ORIGINS="https://example.com" \
       CSRF_TRUSTED_ORIGINS="https://example.com" \
       python manage.py collectstatic --noinput --clear

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD-SHELL host="$${DJANGO_ALLOWED_HOSTS%%,*}"; \
    curl --fail --silent --show-error --output /dev/null \
    --header "Host: $${host}" --header "X-Forwarded-Proto: https" \
    http://127.0.0.1:8000/health/ || exit 1

EXPOSE 8000

# gunicorn: 3 workers is a safe default for a container (rule of thumb is
# 2×CPU+1 but this leaves headroom when replicas scale horizontally).
# --access-logfile - pipes access logs to stdout so the platform collector
# can pick them up (Railway/Render/DO all do this).
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]

CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--timeout", "60", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
# Production Deployment Guide

This guide covers a split deployment: Django/PostgreSQL on a container host
and Next.js on a frontend host. The repository's root `docker-compose.yml` is
for local development only.

## Required services

- PostgreSQL with automated backups and a tested restore process.
- Backend container with HTTPS, a health-check URL, and outbound SMTP access.
- Frontend hosted over HTTPS.
- Transactional email provider for invitations, password resets, and alerts.
- Persistent private storage for uploaded content.

Use one production backend replica while applying migrations. The container
entrypoint runs migrations and seeds billing plans before starting Gunicorn.
If the hosting platform supports a one-off release job, run
`python manage.py migrate --noinput` and `python manage.py seed_plans` there
instead of running migration commands concurrently on multiple replicas,
and set `RUN_MIGRATIONS=0` on the web containers.

## 1. Configure PostgreSQL

Create a managed PostgreSQL database and set `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, `DB_HOST`, `DB_PORT`, and optionally `DB_CONN_MAX_AGE` on the
backend service. Do not expose the database publicly unless the provider
requires it; restrict inbound connections to the application and operators.

## 2. Configure and deploy the backend

Build from `backend/` using its `Dockerfile`. Set these runtime variables:

| Variable | Requirement |
| --- | --- |
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` |
| `DJANGO_SECRET_KEY` | Unique random value of at least 50 characters |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated backend hostnames, no scheme |
| `CORS_ALLOWED_ORIGINS` | Exact HTTPS frontend origins |
| `CSRF_TRUSTED_ORIGINS` | Exact HTTPS origins, including schemes |
| `FRONTEND_URL` | HTTPS frontend base URL used in invitation/reset links |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | Working production SMTP configuration |
| `DEFAULT_FROM_EMAIL` | Sender address authorized by the email provider |
| `REFRESH_TOKEN_COOKIE_SAMESITE` | `None` for separate frontend/backend domains; `Strict` when same-site deployment permits |
| `MEDIA_ROOT` | Path on a persistent private volume for uploaded content |

Generate a secret locally, then add it only to the host's secret manager:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

The image runs as the non-root `app` user. A mounted media volume must be
writable by that user. The default filesystem storage is not shared between
replicas: keep one backend replica while using it, and back up the volume
separately from PostgreSQL. For horizontal scaling, configure private shared
object storage before adding replicas.

The container exposes port `8000`; configure the platform to route HTTPS
traffic to it. Its health check is `GET /health/`. A failed static-file
collection now fails the image build instead of being ignored.

## 3. Configure and deploy the frontend

Build `frontend/` with the production Node.js version declared by that
package. Set `NEXT_PUBLIC_API_BASE_URL` at build time to the backend API URL,
for example `https://api.example.com/api/v1`. Next.js embeds this value in
the client bundle, so changing it requires a new frontend build.

Set the frontend's canonical HTTPS domain as `FRONTEND_URL`,
`CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS` on the backend. Do not use
wildcard CORS origins with credentialed requests.

## 4. Verify the deployment

Before inviting real users:

1. Confirm `/health/` returns HTTP 200 and the backend logs contain no
   migration, static-file, or email configuration errors.
2. Sign up or provision an owner, complete the invitation/password flow,
   log in, and verify refresh/logout behavior in the deployed browsers.
3. Create an academic year, teacher, student, group, enrollment, and
   assignment; verify role boundaries using separate test accounts.
4. Create, publish, submit, and grade an assessment; verify notifications
   and audit entries.
5. Upload and retrieve a content file, restart the backend, and confirm the
   file remains available.
6. Verify database and media backups, then perform a restore test.
7. Check production email delivery and error monitoring.

## Launch limitations to resolve

- File uploads use local filesystem storage. A persistent private disk is
  required for a single instance; shared object storage is required for
  multiple backend replicas.
- Upload validation checks type and size but does not scan for malware.
  Add an antivirus or managed scanning workflow before accepting untrusted
  uploads at scale.
- Payment-provider integration is not configured; subscriptions require the
  existing administrative/manual billing workflow.
- A successful local test/build is not a substitute for testing the actual
  provider's networking, secrets, email delivery, storage persistence,
  backups, and restore procedure.

Do not treat the service as production-ready until the required services are
provisioned, the smoke checks pass in the deployed environment, and the
storage and recovery limitations above have an operational plan.

# Smart Learning Platform

A multi-tenant, Arabic-first (RTL) Educational SaaS platform. Independent
teachers, private tutoring centers, and schools each get an isolated
**tenant** with their own admins, teachers, students, courses, question
banks, exams, and results.

> **Status:** early foundation. Identity, tenancy, and the first slice of the
> academic domain are built and tested. See [`PROJECT_MEMORY.md`](./PROJECT_MEMORY.md)
> for exactly what's done, what's pending, and why decisions were made the
> way they were — read that file first, every session.

## Stack

| Layer      | Choice                                                                 |
|------------|-------------------------------------------------------------------------|
| Backend    | Python, Django 5, Django REST Framework, PostgreSQL (modular monolith)  |
| Frontend   | Next.js (App Router), React, TypeScript, Tailwind CSS                   |
| Auth       | JWT (SimpleJWT) — access token in memory, refresh token in an `httpOnly` cookie |
| State      | TanStack Query (server state) + Zustand (client/auth state)             |
| Forms      | React Hook Form + Zod                                                   |
| Infra      | Docker Compose (Postgres + backend + frontend) for local dev            |

Full rationale for every one of these choices is in
[`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`SECURITY.md`](./SECURITY.md).

## Project layout

```
smart-learning-platform/
├── backend/            Django project (apps/, config/, tests/)
├── frontend/            Next.js app (app/, components/, lib/)
├── docker-compose.yml
├── PROJECT_MEMORY.md    Read this first — vision, decisions, progress, next steps
├── ARCHITECTURE.md      System, database, tenant, API, frontend architecture
├── SECURITY.md          Threat model + current mitigation status per threat
└── API.md               Endpoint reference (grows as the API grows)
```

## Running locally

### Option A — Docker Compose (recommended)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build
```

- Backend API: http://localhost:8000/api/v1/
- Django admin: http://localhost:8000/admin/
- Frontend: http://localhost:3000

### Option B — run each side manually

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements/dev.txt
cp .env.example .env               # then point DB_HOST etc. at your local Postgres
python manage.py migrate
python manage.py runserver
```

**Run the test suite** (this is what proves tenant isolation actually holds —
see `tests/test_tenant_isolation.py`):

```bash
pytest
```

**Frontend**

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

> The layout loads two Arabic Google Fonts via `next/font/google`, which
> fetches them at build time — this needs normal outbound internet access
> to `fonts.googleapis.com`/`fonts.gstatic.com` (true of any
> `next/font/google` usage, not specific to this project). If you're
> building behind a restrictive proxy/firewall that blocks it, either
> allow those two hosts or switch `app/layout.tsx` to `next/font/local`
> with self-hosted font files.

## First run: creating your first tenant

There's no seed data — the platform is self-serve by design (point 89/90 of
the product spec: a new customer should be able to sign up without a
developer). Create the first tenant + owner account via:

```
POST /api/v1/auth/signup/
{
  "tenant_name": "Future Center",
  "owner_email": "owner@example.com",
  "owner_password": "a-strong-password"
}
```

This returns an access token immediately and sets the refresh cookie — log
in at `/login` on the frontend with the same credentials, or use the
response directly against the API.

## Contributing / continuing this build

This project is being built phase by phase (see the roadmap in
`PROJECT_MEMORY.md`). Each phase: design → implement → test → document,
before moving to the next. Tenant isolation is treated as the most
security-critical property in the system — any change touching a model,
permission class, or viewset must keep (or extend) the isolation tests
green.

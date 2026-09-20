# Architecture

## 1. System overview

```
                         ┌─────────────────────────┐
                         │        Browser           │
                         │  Next.js (RTL, Arabic)   │
                         └────────────┬─────────────┘
                                      │ HTTPS / JSON
                                      ▼
                         ┌─────────────────────────┐
                         │   Django REST API        │
                         │   /api/v1/...            │
                         │   (modular monolith)     │
                         └────────────┬─────────────┘
                                      │
                     ┌────────────────┼────────────────┐
                     ▼                ▼                ▼
              ┌────────────┐  ┌──────────────┐  ┌─────────────┐
              │ PostgreSQL  │  │ Object/file   │  │  (future)   │
              │ shared DB,  │  │ storage       │  │  Redis /    │
              │ tenant_id   │  │ (content,     │  │  Celery —   │
              │ on every    │  │ branding)     │  │  only when  │
              │ tenant row  │  │               │  │  a real     │
              └────────────┘  └──────────────┘  │  async job   │
                                                  │  exists      │
                                                  └─────────────┘
```

**Why a modular monolith, not microservices** (spec §2): at this stage the
team is one engineer (Claude) plus one product owner (Omar). Microservices
buy you independent deployability and fault isolation at the cost of
distributed transactions, network calls where a function call would do, and
N services to operate. None of that cost is justified yet. The Django app is
split into **apps** (`tenants`, `accounts`, `academics`, `content`,
`questions`, `assessments`, `exams`, `audit`, `reports`, `common`) with
clear boundaries, so that splitting a hot app out into its own service later
— if 1000-tenant scale ever demands it (spec §81) — is a deployment change,
not a rewrite.

## 2. Request lifecycle (every tenant-scoped request)

This is the enforcement chain from spec §7/§40, implemented literally, not
just described:

```
1. Authentication      JWTAuthentication verifies the token signature, then
                        re-fetches the User row from the DB by user_id.
                        (Token claims are never trusted for authorization —
                        only the DB-fresh user.tenant / user.role are.)
                        └─ apps/accounts + rest_framework_simplejwt

2. request.tenant       TenantContextMixin.perform_authentication() sets
                        request.tenant = request.user.tenant right after
                        step 1, before any permission check runs.
                        └─ apps/common/mixins.py

3. Role permission      HasRole("OWNER","ADMIN") / IsAdminForWriteActions —
                        is this role allowed to even attempt this action?
                        └─ apps/common/permissions.py

4. Object permission    IsSameTenantObject.has_object_permission() — does
                        this specific row belong to request.tenant?
                        └─ apps/common/permissions.py

5. Relationship perm.   Serializer relational fields (e.g. Term.academic_year)
                        have their queryset scoped to request.tenant in
                        __init__, so a foreign tenant's id is not just
                        rejected — it's not a valid choice at all, the same
                        way a nonexistent id would be rejected.
                        └─ apps/academics/serializers.py

6. DB query             get_queryset() filters by request.tenant, and
                        perform_create() forces tenant=request.tenant. A
                        client-supplied "tenant" field is never in a
                        serializer's writable fields, so there's nothing to
                        override even for a request that tries.
                        └─ apps/common/views.py (TenantScopedViewSet)
```

Steps 2–6 are implemented once in `apps/common/` and inherited by every
domain app, specifically so that "forgetting to filter by tenant" (spec §8)
requires *opting out* of the base classes rather than remembering to opt in.

## 3. Multi-tenancy strategy — decision record

**Chosen: shared database, shared schema, `tenant_id` foreign key on every
tenant-owned table.**

Alternatives considered:
- *Database-per-tenant*: strongest isolation, but migrations, connection
  pooling, and cross-tenant admin reporting all get much harder, and it's
  operationally heavy for a 1–1000 tenant target (spec §81).
- *Schema-per-tenant* (Postgres schemas): a middle ground, but adds real
  operational complexity (per-tenant migrations, connection routing) for
  isolation guarantees the row-level approach already gives us *if* the
  enforcement chain in §2 is applied consistently everywhere.

Row-level isolation was chosen because it's the simplest thing that can be
made airtight, and airtightness comes from the base classes in
`apps/common/`, not from schema boundaries. It can be migrated to
schema-per-tenant later without touching business logic, if a specific
enterprise customer ever requires it.

All primary keys are **UUIDv4**, not auto-incrementing integers — not as a
security control by itself (spec §98 is explicit that UUID ≠ authorization),
but so IDs never leak tenant size, row counts, or creation order across
tenants, and so a sequential-ID enumeration attack isn't even structurally
possible.

## 4. Database architecture

Current schema (Phase 0–4 slice — see PROJECT_MEMORY.md for what's pending):

```
Tenant
 └─< User (role: OWNER | ADMIN | TEACHER | STUDENT)

Tenant
 └─< AcademicYear
      └─< Term
 └─< Stage
      └─< Grade
           └─< Group  (also FKs AcademicYear)
 └─< Subject
 └─< AuditLog
```

Every tenant-owned model inherits `TenantScopedModel` (`apps/common/models.py`):
UUID primary key, `tenant` FK, `created_at`/`updated_at`. Constraints in use
today: `UniqueConstraint` scoped *within* a tenant (e.g. two tenants can both
have a "Biology" subject; one tenant can't have two), `CheckConstraint` for
date ordering (`end_date > start_date`), and `on_delete=CASCADE` from
child → parent so deleting a Tenant cleanly removes everything under it in
one transaction — nothing to leak or orphan.

Course → Chapter → Lesson, Content, Question Bank, Assessment, Attempt, and
Result are **designed** (see §7 below and PROJECT_MEMORY.md §5) but not yet
migrated — they're the next phase.

## 5. Backend architecture

```
backend/
├── config/
│   ├── settings/{base,dev,test,prod}.py   one base, three overrides
│   └── urls.py                             /api/v1/... root
├── apps/
│   ├── common/     abstract base models, tenant-aware manager, permission
│   │               primitives, pagination, exception handler — every other
│   │               app depends on this one; it depends on nothing else
│   ├── tenants/     Tenant model, signup endpoint (creates Tenant + OWNER
│   │               atomically)
│   ├── accounts/    custom User model (email-based), JWT views, token
│   │               claims
│   ├── academics/   AcademicYear, Term, Stage, Grade, Group, Subject
│   ├── audit/       AuditLog model + log_action() service
│   └── (content, questions, assessments, exams, reports — Phase 4+)
└── tests/           pytest-django; factories + isolation/permission tests
```

Each app follows the same internal shape: `models.py` → `serializers.py` →
`views.py` (ViewSets built on `TenantScopedViewSet`) → `urls.py`
(`DefaultRouter`). This repetition is deliberate (spec §87: reusable,
predictable architecture) — a new domain app is a known recipe, not a new
design exercise each time.

## 6. Frontend architecture

```
frontend/
├── app/
│   ├── layout.tsx                 <html dir="rtl" lang="ar">, fonts, providers
│   ├── (auth)/login/page.tsx
│   └── (dashboard)/
│       ├── layout.tsx             sidebar + topbar shell, auth guard
│       ├── dashboard/page.tsx
│       ├── academic-years/page.tsx
│       └── terms/page.tsx         SmartSelect + QuickCreateModal reference use
├── components/
│   ├── ui/                        Button, Input, Modal, Drawer, Table, Toast primitives
│   ├── layout/                    Sidebar (role-aware nav), Topbar
│   └── common/                    SmartSelect.tsx, QuickCreateModal.tsx
└── lib/
    ├── api/client.ts              axios instance, 401 → silent refresh → retry once
    ├── auth/store.ts              zustand — access token + user, memory-only
    └── query/provider.tsx         TanStack Query provider
```

**RTL is structural, not a theme switch** (spec §14): the root `<html>` tag
is `dir="rtl" lang="ar"` from the very first commit, spacing utilities use
Tailwind's logical properties (`ms-*`/`me-*`/`ps-*`/`pe-*`, not
`ml-*`/`mr-*`), and the sidebar lives on the reading-start side, which in
RTL is the right edge — there is no LTR version to "flip" later.

**SmartSelect / QuickCreateModal** (spec §16–17): a `SmartSelect` is a
searchable relation picker with a "+" action; `QuickCreateModal` is a
generic modal that renders a form, and on success returns the created
record so the caller can auto-select it and close the modal — the calling
form's other fields are untouched. `TermForm` is the reference
implementation: picking/creating an `AcademicYear` without leaving the Term
form. Every future "pick or create a related record" flow (Teacher, Group,
Course, …) reuses these two components rather than growing bespoke modals.

## 7. API structure

Versioned from day one: `/api/v1/...`. Current surface (grows in
`API.md` as it's built):

```
POST /api/v1/auth/signup/      create Tenant + OWNER, returns tokens
POST /api/v1/auth/login/       returns access token (body) + refresh (cookie)
POST /api/v1/auth/refresh/     reads refresh cookie, returns new access token
GET  /api/v1/auth/me/          current user + tenant

/api/v1/academic-years/        CRUD — OWNER/ADMIN write, all roles read
/api/v1/terms/
/api/v1/stages/
/api/v1/grades/
/api/v1/groups/
/api/v1/subjects/
```

Planned (unchanged from spec §67, not yet built): `/content`,
`/question-banks`, `/questions`, `/assessments`, `/attempts`, `/results`,
`/reports`, `/audit`, `/security`.

## 8. Anti-cheat architecture (designed, not yet implemented — Phase 10)

```
ExamAttempt ──< SecurityEvent (EXAM_STARTED, TAB_HIDDEN, TAB_VISIBLE,
                WINDOW_BLURRED, FULLSCREEN_EXITED, COPY_ATTEMPT,
                PASTE_ATTEMPT, NETWORK_DISCONNECTED, ANSWER_CHANGED, ...)
                        │
                        ▼
                SuspicionSignal (rule-based aggregation of event counts/
                patterns over one attempt → a risk score)
                        │
                        ▼
                Review queue (teacher/admin dashboard, spec §47): a
                signal is a flag for a human to look at, never an
                automatic verdict (spec §46) — no attempt is auto-failed
                or auto-flagged as cheating by the system itself.
```

Real protection is layered *underneath* this (spec §64/§43): server-side
timer enforcement, server-side scoring, attempt-limit constraints,
question/option randomization, and target restrictions. Event logging is
the detection layer on top of those controls, not a replacement for them —
this is why it's scheduled *after* the exam engine itself (Phase 9) is
solid, not before.

## 9. Deployment (target shape — Phase 14, not started)

Docker images for backend and frontend, Postgres as a managed instance
(not a container) in production, static/media on object storage, backend
served via gunicorn behind a reverse proxy terminating TLS. `docker-compose.yml`
in this repo is for **local development only** — see `SECURITY.md` for what
changes between dev and prod configuration.

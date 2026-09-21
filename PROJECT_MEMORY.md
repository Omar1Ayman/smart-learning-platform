# PROJECT_MEMORY.md

_Read this file first, every session — before touching code._
_Last updated: 2026-09-21 — Roadmap position: Phase 3 (Identity & Tenancy)
done; Phase 4 (Academic Core) done through Course → Chapter → Lesson.
Next up: Phase 5 (Teacher Assignment + Student Enrollment)._

## 1. Product vision

**Smart Learning Platform**: a multi-tenant, Arabic-first (RTL) Educational
SaaS. Independent teachers, private tutoring centers, and schools each sign
up as an isolated **tenant** and get admin, teacher, and student accounts,
an academic structure, content, question banks, exams with anti-cheat
tracking, and reports — a product a customer can actually pay for and run
their teaching business on, not a portfolio demo.

## 2. Business model

B2B multi-tenant SaaS. A tenant is one teacher, one tutoring center, or one
school. Self-serve signup (spec §89/90): `POST /auth/signup/` creates a
Tenant + its OWNER account with no developer involved. Tenant branding
(logo, primary color, contact info) is modeled on `Tenant` already;
full branding UI is a later phase.

## 3. Roles (MVP)

`OWNER`/`ADMIN`, `TEACHER`, `STUDENT` — a single `role` field on `User`,
scoped to exactly one `Tenant`. See §14 for why this is a field and not a
separate Membership model, and when that would need to change.

## 4. Multi-tenant architecture — decision

**Shared database, shared schema, `tenant_id` FK on every tenant-owned
row.** Full rationale in `ARCHITECTURE.md` §3. Enforcement is a five-layer
chain (Authentication → Tenant → Role → Object → Relationship → DB query),
implemented once in `apps/common/` and inherited everywhere — see
`ARCHITECTURE.md` §2 for the exact code path. This is the single most
security-critical part of the system; it is built and has automated tests
(`backend/tests/test_tenant_isolation.py`) that pass against a real
PostgreSQL database, not sqlite.

## 5. Domain model

**Built:**
```
Tenant ──< User (role)
Tenant ──< AcademicYear ──< Term
Tenant ──< Stage ──< Grade ──< Group (also FK's AcademicYear)
Tenant ──< Subject
Tenant ──< Course (FK's Subject + Grade) ──< Chapter ──< Lesson
Tenant ──< AuditLog
```

Course intentionally has **no `teacher` field** — see §14's "Course has no
teacher field" decision below; that's `TeacherAssignment`'s job (Phase 5).
Lesson intentionally has **no content/body field** — attaching PDFs,
video, text, etc. at a flexible scope is Content's job (Phase 6); a
Lesson today is just the slot Content will attach to.

**Designed, not yet built** (Phase 5 → Phase 9):
```
Content  (flexible scope: any of tenant/stage/grade/group/subject/
          course/chapter/lesson/year/term — spec §27)
QuestionBank ──< Question             (PENDING → APPROVED/REJECTED workflow)
Assessment  (independent targeting: tenant/stage/grade/group/students;
             independent of Course/QuestionBank — spec §33)
  ──< ExamAttempt ──< Answer
  ──< Result
TeacherAssignment  (Teacher × Stage/Grade/Group/Subject/Course)
Enrollment  (Student × AcademicYear × Grade × Group — history-preserving,
             spec §23; Promotion is a transaction over this, spec §25)
```

Relationships are deliberately **not** assumed one-to-one anywhere (spec
§18) — e.g. a Teacher can have many `TeacherAssignment` rows, a Student's
`Enrollment` history spans multiple `AcademicYear`s.

## 6. Database architecture

PostgreSQL. UUIDv4 primary keys everywhere (non-enumerable, no cross-tenant
size/order leakage — but explicitly *not* treated as a security boundary by
itself, see `SECURITY.md` §1). Every tenant-owned model extends
`TenantScopedModel` (`backend/apps/common/models.py`): `tenant` FK,
`created_at`/`updated_at`, tenant-aware manager. Constraints so far:
tenant-scoped `UniqueConstraint`s (e.g. one "Biology" subject per tenant,
not globally), `CheckConstraint`s for date ordering, `CASCADE` from child to
parent. No business rule relies on frontend validation alone (spec §4).

## 7. Backend architecture

Django 5 + DRF, modular monolith (`backend/apps/{common,tenants,accounts,
academics,audit}` today). Full layout and the request-lifecycle enforcement
chain: `ARCHITECTURE.md` §2/§5. Auth: SimpleJWT, access token short-lived
(30 min, returned in the JSON body), refresh token (7 days, rotated on use,
blacklisted after rotation, delivered only as an `httpOnly`/`Secure`/
`SameSite=Strict` cookie scoped to `/api/v1/auth/refresh/`).

## 8. Frontend architecture

Next.js App Router + TypeScript + Tailwind. RTL (`dir="rtl" lang="ar"`) on
`<html>` from the first commit — see `ARCHITECTURE.md` §6. TanStack Query
for server state, Zustand for auth state (access token kept in memory only,
never `localStorage` — an XSS bug should not be able to read a live
credential off disk). React Hook Form + Zod for every form. The
`SmartSelect` + `QuickCreateModal` pattern (spec §16/17) is implemented and
demonstrated end-to-end, including a **three-level nested chain** on the
Courses page: creating a Course can quick-create a Grade without leaving
the Course form, and that Grade's own quick-create can quick-create a
Stage without leaving *its* form — every level auto-selects into its
parent and preserves what was already typed above it, exactly as spec
§16 asks. Reuse `SmartSelect`/`QuickCreateModal` for every future
"pick or create a related record" flow instead of building a new modal
each time; don't rebuild the chain pattern from scratch either — copy
`CourseForm`/`GradeForm`'s shape.

## 9. Security model

Full threat-by-threat status: `SECURITY.md`. Headline decisions: UUIDs are
never authorization; `tenant`/`role` are never client-writable fields on
any serializer; refresh tokens are `httpOnly`; tracebacks never reach an API
response. **Known gap, highest priority for the next security pass:** login/
signup/refresh are not yet rate-limited.

## 10. Anti-cheat architecture

Designed in `ARCHITECTURE.md` §8, **not implemented yet** — it's Phase 10,
after the exam engine (Phase 9) exists to protect in the first place.
Principle already locked in: event logs → aggregated suspicion signals →
human review queue. Never an automatic cheating verdict (spec §46).

## 11. API structure

`/api/v1/...`, versioned from day one. Current + planned endpoint list:
`API.md`.

## 12. Completed features (Phase 0–4)

- Tenant signup (`Tenant` + `OWNER` `User` created atomically)
- JWT login / cookie-based refresh / `me` endpoint
- Full tenant-isolation + role-permission enforcement chain, with **23
  passing automated tests against real PostgreSQL**:
  - cross-tenant read of another tenant's object → 403/404, and it never
    appears in a list either
  - a client-supplied `tenant` field on create is silently ignored; the
    object is created under the *caller's* real tenant
  - a `STUDENT` cannot create an `AcademicYear` or a `Lesson` (role check)
  - a `Course`/`Term` cannot reference another tenant's `Subject`/`Grade`/
    `AcademicYear` (relationship-permission layer)
- Academic Year / Term / Stage / Grade / Group / Subject / **Course /
  Chapter / Lesson**: models with tenant-scoped constraints, full CRUD
  API, tenant-scoped serializers
- Backend fully lint-clean (`flake8`, `black`), zero pending migrations
- Frontend: RTL shell (sidebar + topbar), login/signup flow with silent
  refresh on load, Academic Years + Terms + **Courses** pages, the latter
  demonstrating a **three-level SmartSelect/QuickCreateModal chain**
  (Course → Grade → Stage, each auto-selecting into its parent)
- Frontend fully lint-clean (`eslint` flat config), builds cleanly,
  **`npm audit` = 0 vulnerabilities** (see §14 — the original dependency
  pins had known CVEs and were upgraded before anything shipped)
- `docker-compose.yml` (Postgres + backend + frontend) for local dev,
  multi-stage Dockerfiles (frontend uses Next's `standalone` output), CI
  workflow (lint + test + build for both sides) — **the Docker build
  itself has not been run** in the environment this was built in (no
  Docker Hub network access there); verify `docker compose up --build`
  the first time you run this for real

## 13. Pending features (rest of the roadmap)

Content (flexible scoping), Question Bank + review workflow, Assessment
Builder (6-step wizard) + targeting + scheduling + randomization, Exam
engine (attempts/timer/autosave/server-side scoring), Anti-cheat event
tracking + suspicion dashboard, Teacher assignments + Student enrollment +
Promotion transaction, all three role dashboards (beyond the current
placeholder shell), Reports, rate limiting, full audit coverage (currently
2 of ~10 listed actions), onboarding wizard, tenant branding UI, bulk
operations, accessibility pass, production deployment.

## 14. Architecture decisions log

- **2026-09-20 — Shared-DB multi-tenancy**, not schema/DB-per-tenant. See
  `ARCHITECTURE.md` §3.
- **2026-09-20 — `role` is a field on `User`, not a separate `Membership`
  model.** Assumes one user belongs to exactly one tenant, which matches
  every actor in the spec (an Owner, Teacher, or Student belonging to more
  than one tenant at once was never described as a requirement). **Revisit
  this if** a real need shows up for one person to hold accounts at two
  different tenants under one login — that would mean introducing a
  `Membership(user, tenant, role)` table and changing what `request.tenant`
  resolution means (probably a tenant selector after login).
- **2026-09-20 — Refresh token in an `httpOnly` cookie, access token in
  memory only** (not `localStorage`, not a persisted cookie). Trade-off:
  the user is silently re-authenticated on page load via the cookie, but a
  hard browser-storage wipe or a different browser means logging in again
  — accepted, since the alternative (persisting the access token
  client-side) is directly exploitable by any future XSS bug.
- **2026-09-20 — UUIDv4 primary keys tenant-wide**, not sequential
  integers, purely to avoid leaking counts/order — explicitly documented as
  *not* a substitute for the real authorization chain (spec §98).
- **2026-09-21 — Course has no `teacher` field.** Spec §22 is explicit
  that Course → Teacher must not be the only modeling path (one teacher
  teaches many groups; more than one teacher can share a subject). "Who
  teaches this" is `TeacherAssignment`'s job (Phase 5), not a Course
  column — adding one now would mean migrating it away later.
- **2026-09-21 — Frontend dependency versions bumped off their original
  pins before shipping** (Next.js 14.2.15 → 16.3.5, ESLint 8 → 9 with a
  native flat config, axios/postcss patched) after `npm audit` showed
  known CVEs, some critical, unfixed at the original pins. Confirmed
  `npm audit` = 0 findings and a clean `npm run build` before treating
  the frontend as done — "security first" (spec §38) applies to picking
  dependency versions, not just to code written from scratch.

## 15. Known limitations (today, stated plainly)

- No rate limiting yet.
- Audit logging is a pattern demo (2 actions wired), not comprehensive.
- No file upload handling yet — nothing to evaluate for upload-specific
  risk yet, don't assume it's been hardened once it exists.
- No independent security audit / penetration test. The automated tests
  cover the specific scenarios the spec names; that is necessary but not
  sufficient before a commercial launch.
- Not deployed anywhere — `docker-compose.yml` is dev-only.
- Teacher visibility is currently "any tenant member can read academic
  structure" — the spec's tighter rule ("Teacher sees only their own
  assignment scope," §12) needs `TeacherAssignment` to exist first
  (Phase 5) before it can be enforced.

## 16. Next steps

Pick up at **Phase 5 — People & Relationships**: `TeacherAssignment`
(Teacher × Stage/Grade/Group/Subject/Course, spec §22) and `Enrollment`
(Student × AcademicYear × Grade × Group, history-preserving, spec §23),
then the `Promotion` transaction (preview → validate → confirm → atomic,
spec §25). Once `TeacherAssignment` exists, close out the known limitation
in §15 above (Teacher read access is currently tenant-wide, not scoped to
assignment). Same recipe as every phase so far: model + tenant-scoped
constraints → tenant-scoped serializer → tested viewset (isolation +
role + relationship tests, run against real Postgres) → frontend page.
Say "كمل" / "continue" to proceed.

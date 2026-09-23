# PROJECT_MEMORY.md

_Read this file first, every session — before touching code._
_Last updated: 2026-09-21 — Roadmap position: Phase 5 (People &
Relationships) done — TeacherAssignment, Enrollment with role-scoped
visibility, Promotion. Next up: Phase 6 (Content)._

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
Tenant ──< TeacherAssignment (Teacher × Course × Group[] — empty Group[] = whole grade)
Tenant ──< Enrollment (Student × Group, denormalized AcademicYear — one per student per year)
Tenant ──< AuditLog
```

Course intentionally has **no `teacher` field** — that's what
`TeacherAssignment` is for (see §14). Lesson intentionally has **no
content/body field** — attaching PDFs, video, text, etc. at a flexible
scope is Content's job (Phase 6); a Lesson today is just the slot Content
will attach to. `TeacherAssignment` is keyed on `Course` (which already
encodes Subject + Grade) plus an optional `groups` M2M to narrow it,
rather than a pile of independently-nullable Stage/Grade/Group/Subject
fields — see §14 for why. `Enrollment.academic_year` is a **deliberate
denormalization** of `group.academic_year`, kept in sync server-side only
(never client-writable), purely so "one enrollment per student per year"
can be a real DB constraint — Django can't express uniqueness across a
related model's field directly.

**Designed, not yet built** (Phase 6 → Phase 9):
```
Content  (flexible scope: any of tenant/stage/grade/group/subject/
          course/chapter/lesson/year/term — spec §27)
QuestionBank ──< Question             (PENDING → APPROVED/REJECTED workflow)
Assessment  (independent targeting: tenant/stage/grade/group/students;
             independent of Course/QuestionBank — spec §33)
  ──< ExamAttempt ──< Answer
  ──< Result
```

Relationships are deliberately **not** assumed one-to-one anywhere (spec
§18) — e.g. a Teacher can have many `TeacherAssignment` rows (one per
Course, each optionally narrowed to specific Groups), a Student's
`Enrollment` history spans multiple `AcademicYear`s (one row per year,
never overwritten — Promotion always inserts a new row for a new year).

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
academics,people,audit}` today — `people` holds `TeacherAssignment` and
`Enrollment`, split from `academics` since it's about people-to-structure
relationships, not the structure itself). Full layout and the
request-lifecycle enforcement chain: `ARCHITECTURE.md` §2/§5. Auth:
SimpleJWT, access token short-lived (30 min, returned in the JSON body),
refresh token (7 days, rotated on use, blacklisted after rotation,
delivered only as an `httpOnly`/`Secure`/`SameSite=Strict` cookie scoped
to `/api/v1/auth/refresh/`). The tenant-scoped-relational-field pattern
(`apps/academics/serializers.py`'s old `_TenantScopedSerializer`) was
promoted to `apps/common/serializers.py` as `TenantScopedModelSerializer`
once `people` needed it too — one shared implementation, not a copy per app.

## 8. Frontend architecture

Next.js App Router + TypeScript + Tailwind. RTL (`dir="rtl" lang="ar"`) on
`<html>` from the first commit — see `ARCHITECTURE.md` §6. TanStack Query
for server state, Zustand for auth state (access token kept in memory only,
never `localStorage` — an XSS bug should not be able to read a live
credential off disk). React Hook Form + Zod for every form (use `useWatch`,
not the `watch()` method, for anything read reactively — `watch()` opts
the component out of Next's React Compiler memoization; ESLint will flag
it). The `SmartSelect` + `QuickCreateModal` pattern (spec §16/17) is used
throughout, including a **three-level nested chain** (Course → Grade →
Stage on the Courses page) and **cross-domain nesting** — the Teacher
Assignment and Enrollment forms quick-create a `User` (Teacher/Student)
inline via the same `UserForm`, just with a locked `fixedRole` prop, so
"there's no teacher yet" never blocks the flow of assigning one. Reuse
`SmartSelect`/`QuickCreateModal`/this chaining shape for every future
"pick or create a related record" flow instead of building a new modal
each time.

## 9. Security model

Full threat-by-threat status: `SECURITY.md`. Headline decisions: UUIDs are
never authorization; `tenant`/`role` are never client-writable fields on
any serializer; refresh tokens are `httpOnly`; tracebacks never reach an API
response. Role-scoped *read* visibility (not just tenant isolation) is now
real for Enrollment — see §12. **Known gap, highest priority for the next
security pass:** login/signup/refresh are not yet rate-limited.

## 10. Anti-cheat architecture

Designed in `ARCHITECTURE.md` §8, **not implemented yet** — it's Phase 10,
after the exam engine (Phase 9) exists to protect in the first place.
Principle already locked in: event logs → aggregated suspicion signals →
human review queue. Never an automatic cheating verdict (spec §46).

## 11. API structure

`/api/v1/...`, versioned from day one. Current + planned endpoint list:
`API.md`.

## 12. Completed features (Phase 0–5)

- Tenant signup (`Tenant` + `OWNER` `User` created atomically); OWNER/ADMIN
  can now create TEACHER/STUDENT/ADMIN accounts via `/api/v1/users/`
- JWT login / cookie-based refresh / `me` endpoint
- Full tenant-isolation + role-permission enforcement chain, with **47
  passing automated tests against real PostgreSQL**, including:
  - cross-tenant read of another tenant's object → 403/404, never in a list
  - a client-supplied `tenant` field on create is silently ignored
  - relationship-permission layer (a `Course`/`Term`/`TeacherAssignment`/
    `Enrollment` can't reference another tenant's related object)
  - **role-scoped read visibility on Enrollment** (spec §12/§13, not just
    tenant isolation): OWNER/ADMIN see every enrollment; TEACHER sees only
    students in groups they're assigned to (directly, or via a
    whole-grade assignment); STUDENT sees only their own — and a Teacher
    fetching an out-of-scope enrollment by direct ID gets 404, not 403,
    because it's genuinely outside their queryset, the same mechanism
    tenant isolation itself uses
  - Promotion is atomic: one invalid item in a batch rolls back every
    item, tested explicitly
- Academic Year / Term / Stage / Grade / Group / Subject / Course /
  Chapter / Lesson / **TeacherAssignment / Enrollment**: models with
  tenant-scoped constraints, full CRUD API, tenant-scoped serializers
- **Promotion** (`POST /api/v1/enrollments/promote/`): PROMOTE / REPEAT /
  TRANSFER / GRADUATE, `dry_run` flag doubles as the "Preview" step (spec
  §25) without duplicating validation logic, real transaction on confirm
- Backend fully lint-clean (`flake8`, `black`), zero pending migrations
- Frontend: RTL shell, login/signup flow with silent refresh, Academic
  Years / Terms / Courses / **Team (user management) / Teacher
  Assignments / Enrollments** pages. Enrollments page automatically
  reflects the viewer's role-scoped visibility with zero special frontend
  logic — it just renders whatever the backend returns.
- Frontend fully lint-clean (`eslint` flat config), builds cleanly,
  `npm audit` = 0 vulnerabilities
- `docker-compose.yml`, multi-stage Dockerfiles, CI workflow — **the
  Docker build itself still has not been run** in the environment this
  was built in (no Docker Hub network access there)

## 13. Pending features (rest of the roadmap)

Content (flexible scoping), Question Bank + review workflow, Assessment
Builder (6-step wizard) + targeting + scheduling + randomization, Exam
engine (attempts/timer/autosave/server-side scoring), Anti-cheat event
tracking + suspicion dashboard, all three role dashboards (beyond the
current placeholder shell — they should now surface real
TeacherAssignment/Enrollment data), Reports, rate limiting, full audit
coverage (currently 3 of ~10 listed actions — signup, academic-year
create, promotion), onboarding wizard, tenant branding UI, bulk
operations, accessibility pass, production deployment. **Promotion has no
frontend UI yet** — it's a real, tested backend endpoint
(`/api/v1/enrollments/promote/`) with no page calling it; building that
multi-step wizard (pick source group → preview → assign actions per
student → confirm) is a good Phase 6+ frontend task on its own.

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
- **2026-09-21 — TeacherAssignment is keyed on Course + an optional
  `groups` M2M**, not independently-nullable Stage/Grade/Group/Subject
  fields. Course already encodes Subject + Grade; empty `groups` means
  "the whole grade," a non-empty set narrows it. This covers every
  combination spec §22 lists (one teacher, many groups/grades; many
  teachers, one subject/group) without an ambiguous "which fields
  actually matter for this row" shape.
- **2026-09-21 — `Enrollment.academic_year` is a denormalized copy of
  `group.academic_year`**, set server-side, never client-writable. Purely
  so "one enrollment per student per year" can be a real
  `UniqueConstraint` — Django can't constrain across a related model's
  field directly. `EnrollmentSerializer.validate()` also checks this in
  Python before hitting the DB, so a violation is a clean 400, not an
  unhandled `IntegrityError` (worth remembering as a general pattern: a
  DB `UniqueConstraint` is the real guarantee, but every serializer that
  can hit one needs a matching `validate()` check, or the failure mode is
  an ugly 500 instead of a normal validation error).
- **2026-09-21 — Engineering note for future serializers:** a nested
  `many=True` serializer field declared at class-body time (e.g. `items =
  SomeItemSerializer(many=True)` inside another serializer) is
  instantiated once, before any request exists — `self.context` is *not*
  reliably available in that child's `__init__`. Do any
  per-request/per-tenant queryset scoping in `to_internal_value()` (or
  `validate()`) instead, which runs per-request after DRF has bound the
  child to its parent. `PromotionItemSerializer`
  (`apps/people/serializers.py`) hit this directly — its first version
  scoped querysets in `__init__` and every promotion silently 400'd with
  "object does not exist" until this was understood.

## 15. Known limitations (today, stated plainly)

- No rate limiting yet.
- Audit logging covers 3 of the ~10 actions spec §50 lists (tenant
  signup, academic year create, promotion) — a pattern demo, not
  comprehensive.
- No file upload handling yet — nothing to evaluate for upload-specific
  risk yet, don't assume it's been hardened once it exists.
- No independent security audit / penetration test. The automated tests
  cover the specific scenarios the spec names; that is necessary but not
  sufficient before a commercial launch.
- Not deployed anywhere — `docker-compose.yml` is dev-only, and its own
  `docker build` has never actually been run (see §12).
- Promotion has a real, tested backend endpoint and no frontend UI yet
  (see §13).
- TeacherAssignment's own list (not Enrollment's) is still readable by
  any tenant member, not scoped to "only see your own assignments" —
  lower priority than Enrollment's visibility since who-teaches-what is
  administrative metadata, not student data, but worth tightening
  alongside Reports/Dashboards later if it turns out to matter.

## 16. Next steps

Pick up at **Phase 6 — Content**: a `Content` model attachable at a
flexible scope (spec §27 — tenant/stage/grade/group/subject/course/
chapter/lesson/year/term, but *not* every Content row needs every one of
those FKs filled in) supporting PDF/video/image/document/link/text/book
types. This is the first place file upload shows up in this codebase —
budget real time for extension/MIME/size validation and
private-vs-public storage, not just a model with a `FileField` (spec
§78, and the "no file upload handling yet" limitation in §15 needs
closing out carefully, not rushed). Same recipe as every phase so far:
model + tenant-scoped constraints → tenant-scoped serializer → tested
viewset → frontend page. Say "كمل" / "continue" to proceed.

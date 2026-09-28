# PROJECT_MEMORY.md

_Read this file first, every session — before touching code._
_Last updated: 2026-09-23 — Roadmap position: Phase 6 (Content) done —
flexible scoping, real file-upload security, student cross-group
visibility. Next up: Phase 7 (Question Bank)._

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
Tenant ──< Content (every scope field independently nullable — see below)
Tenant ──< AuditLog
```

Course intentionally has **no `teacher` field** — that's what
`TeacherAssignment` is for (see §14). Lesson intentionally has **no
content/body field** — that's `Content`'s job now, and it's built:
`Content` can attach at *any independent combination* of stage/grade/
group/subject/course/chapter/lesson/academic_year/term (all nullable),
unlike `TeacherAssignment` which is deliberately keyed on one canonical
FK (Course) — Content has no such canonical shape (spec §27's own example
is grade+subject+term with no group at all), so nullable-everything is
the correct model here, not a shortcut (see §14). Visibility for a
STUDENT is computed, not stored: `apps/content/services.py` resolves the
student's current Enrollment → Group → Grade → Stage and their grade's
Courses/Chapters/Lessons, then a Content row is visible only if *every
one of its non-null scope fields* matches that context — an unset field
imposes no restriction at all. This is what makes the spec's cross-group
example work for real.

**Designed, not yet built** (Phase 7 → Phase 9):
```
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
academics,people,content,audit}` today — `people` holds
`TeacherAssignment`/`Enrollment`; `content` holds `Content` plus its own
`validators.py` (extension/MIME/size checks) and `services.py`
(visibility resolution) rather than cramming those into the serializer).
Full layout and the request-lifecycle enforcement chain:
`ARCHITECTURE.md` §2/§5. Auth: SimpleJWT, access token short-lived
(30 min, returned in the JSON body), refresh token (7 days, rotated on
use, blacklisted after rotation, delivered only as an `httpOnly`/
`Secure`/`SameSite=Strict` cookie scoped to `/api/v1/auth/refresh/`). The
tenant-scoped-relational-field pattern lives in
`apps/common/serializers.py` as `TenantScopedModelSerializer`, shared by
academics/people/content.

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
Stage on the Courses page) and **cross-domain nesting** (Teacher
Assignment / Enrollment forms quick-create a `User` inline via
`UserForm`'s `fixedRole` prop). The Content page is the one place so far
that isn't a plain JSON form: `lib/api/content.ts`'s `createContent()`
builds a `FormData`/multipart request when a file is attached, and
`downloadContent()` branches on the response's `Content-Type` (JSON for
external-link/text content, a `Blob` for real files) rather than assuming
one shape — copy that pattern for any future upload/download flow rather
than assuming every API call is JSON in and JSON out.

## 9. Security model

Full threat-by-threat status: `SECURITY.md`. Headline decisions: UUIDs are
never authorization; `tenant`/`role` are never client-writable fields on
any serializer; refresh tokens are `httpOnly`; tracebacks never reach an API
response. Role-scoped *read* visibility (not just tenant isolation) is
real for Enrollment and, per-student, for Content. File uploads
(`apps/content/validators.py`) check real extension, a genuine MIME sniff
of the file's bytes via `python-magic` (never trust the filename or the
client-sent `Content-Type` header alone), and a per-type size cap;
storage paths are UUID-generated, never derived from the uploaded name;
there is no direct `/media/...` URL anywhere — every file is served
through an authenticated `download` action that re-runs the exact same
visibility check the list view uses. **Known gap, highest priority for
the next security pass:** login/signup/refresh are not yet rate-limited.

## 10. Anti-cheat architecture

Designed in `ARCHITECTURE.md` §8, **not implemented yet** — it's Phase 10,
after the exam engine (Phase 9) exists to protect in the first place.
Principle already locked in: event logs → aggregated suspicion signals →
human review queue. Never an automatic cheating verdict (spec §46).

## 11. API structure

`/api/v1/...`, versioned from day one. Current + planned endpoint list:
`API.md`.

## 12. Completed features (Phase 0–6)

- Tenant signup (`Tenant` + `OWNER` `User` created atomically); OWNER/ADMIN
  can now create TEACHER/STUDENT/ADMIN accounts via `/api/v1/users/`
- JWT login / cookie-based refresh / `me` endpoint
- Full tenant-isolation + role-permission enforcement chain, with **70
  passing automated tests against real PostgreSQL**, including:
  - cross-tenant read of another tenant's object → 403/404, never in a list
  - a client-supplied `tenant` field on create is silently ignored
  - relationship-permission layer (a `Course`/`Term`/`TeacherAssignment`/
    `Enrollment`/`Content` can't reference another tenant's related object)
  - role-scoped read visibility on Enrollment (spec §12/§13) — extended
    in Phase 6 to **Content**, per-student, computed from their live
    academic context rather than a stored flag
  - Promotion is atomic: one invalid item in a batch rolls back every item
  - **file upload security** (spec §78): wrong extension rejected, real
    file bytes not matching the claimed type rejected (MIME-sniffed, not
    filename-trusted), oversized files rejected, a crafted `../../`-style
    filename never survives into the stored path, a Teacher can't edit
    another Teacher's uploaded content, an unauthenticated request can't
    download anything
- Academic Year / Term / Stage / Grade / Group / Subject / Course /
  Chapter / Lesson / TeacherAssignment / Enrollment / **Content**: models
  with tenant-scoped constraints, full CRUD API, tenant-scoped serializers
- **Promotion** (`POST /api/v1/enrollments/promote/`): PROMOTE / REPEAT /
  TRANSFER / GRADUATE, `dry_run` flag doubles as the "Preview" step
- Backend fully lint-clean (`flake8`, `black`), zero pending migrations
- Frontend: RTL shell, login/signup flow with silent refresh, Academic
  Years / Terms / Courses / Team / Teacher Assignments / Enrollments /
  **Content** pages. Content's create form switches between a file input,
  a URL input, or a textarea depending on the chosen type, and "open"
  correctly branches between downloading a real file and showing a link
  or plain text.
- Frontend fully lint-clean (`eslint` flat config), builds cleanly,
  `npm audit` = 0 vulnerabilities
- `docker-compose.yml`, multi-stage Dockerfiles, CI workflow — **the
  Docker build itself still has not been run** in the environment this
  was built in (no Docker Hub network access there)

## 13. Pending features (rest of the roadmap)

Question Bank + review workflow, Assessment Builder (6-step wizard) +
targeting + scheduling + randomization, Exam engine (attempts/timer/
autosave/server-side scoring), Anti-cheat event tracking + suspicion
dashboard, all three role dashboards (beyond the current placeholder
shell), Reports, rate limiting, full audit coverage (currently 3 of ~10
listed actions), onboarding wizard, tenant branding UI, bulk operations,
accessibility pass, production deployment, malware/antivirus scanning for
uploads (`Content.scan_status` is the hook, nothing populates it yet).
**Promotion has no frontend UI yet** — a real, tested backend endpoint
with no page calling it. **Content's frontend scope form exposes 5 of 9
possible scope fields** (stage/grade/group/subject/course — chapter,
lesson, academic_year, term are supported by the API but not in the form
yet); add them if a real workflow needs finer scoping than "which
course," which hasn't come up yet.

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
- **2026-09-23 — Content's scope fields are independently nullable**
  (stage/grade/group/subject/course/chapter/lesson/academic_year/term),
  unlike `TeacherAssignment`'s Course-keyed shape. Deliberate difference:
  "who teaches what" has one natural canonical FK (Course); "what can see
  this content" genuinely doesn't — spec §27's own example (grade +
  subject + term, no group) needs independent axes, not a hierarchy.
- **2026-09-23 — File storage paths are always a fresh UUID**, never
  derived from the uploaded filename, and there is no `/media/...` route
  in `config/urls.py` at all, even in dev — every file is only reachable
  through `ContentViewSet.download`, which reruns the full tenant+role+
  eligibility check. This was a deliberate choice to close spec §78's
  "Access control"/"Private/public visibility" items for real, not just
  rely on a hard-to-guess path.
- **2026-09-23 — Engineering note, a real bug found and fixed:** DRF's
  `BooleanField` treats a field *absent* from **multipart/form** data as
  `False` (it mimics an HTML checkbox, where "unchecked" and "not
  present" are indistinguishable) — this silently overrides a model's own
  `default=True` on every multipart request, i.e. every file upload,
  since file fields require multipart. `Content.is_published` hit this
  exactly: every uploaded file was silently created as unpublished. Fixed
  in `ContentSerializer.create()` by checking `"is_published" not in
  self.initial_data` and only then applying the intended default — partial
  updates (PATCH) are unaffected (DRF handles absence differently there).
  **Any future `BooleanField` with a non-`False` default on a serializer
  that also accepts multipart input needs this same guard**, or a test
  uploading a file without explicitly setting that field will pass while
  quietly shipping the wrong value.

## 15. Known limitations (today, stated plainly)

- No rate limiting yet.
- Audit logging covers 3 of the ~10 actions spec §50 lists (tenant
  signup, academic year create, promotion) — a pattern demo, not
  comprehensive. Content upload/delete isn't logged yet.
- File uploads are validated (extension/MIME/size) and served only
  through an authenticated, permission-checked endpoint, but there is
  **no malware/antivirus scanning** — `Content.scan_status` exists as the
  hook for it (spec #78 calls this "if appropriate"), nothing currently
  populates PENDING/INFECTED.
- Local disk storage (`MEDIA_ROOT`) only — a real deployment should move
  to object storage (S3-style, private ACLs); swapping Django's
  `STORAGES` setting needs no model or validator changes, by design, but
  hasn't been exercised against a real bucket.
- No independent security audit / penetration test. The automated tests
  cover the specific scenarios the spec names; that is necessary but not
  sufficient before a commercial launch.
- Not deployed anywhere — `docker-compose.yml` is dev-only, and its own
  `docker build` has never actually been run (see §12).
- Promotion has a real, tested backend endpoint and no frontend UI yet
  (see §13).
- TeacherAssignment's own list (not Enrollment's/Content's) is still
  readable by any tenant member, not scoped to "only see your own
  assignments." Content's TEACHER-role read visibility is also tenant-wide
  today (only the STUDENT-role visibility is computed per-person) — lower
  priority than the Enrollment/Content-for-Student work since this is
  administrative metadata and creator-only, not other people's private
  data (and write access to others' content is already object-scoped via
  `IsCreatorOrAdmin`), but worth tightening alongside Reports/Dashboards
  later if it turns out to matter.

## 16. Next steps

Pick up at **Phase 7 — Questions**: `QuestionBank` (independent entity,
spec §28) and `Question` (type/difficulty/topic/points/status) with the
PENDING → Admin review → APPROVED/REJECTED workflow (spec §29) — a
Teacher can create a Question but explicitly **cannot approve their own**
(spec §29's own words), which is a role+ownership check in the same
shape as `IsCreatorOrAdmin` (`apps/common/permissions.py`) but stricter:
here the *creator themselves* must be excluded even if they're also
staff-permitted to write, not just non-owners. Correct answers are part
of a Question but must never be serialized to a STUDENT-facing read (spec
§41/§44 — this matters more once Assessments/Attempts consume Questions
in Phase 8/9, but the serializer-level exclusion should exist from the
start here so it's never accidentally exposed later). Same recipe as
every phase so far: model + tenant-scoped constraints → tenant-scoped
serializer → tested viewset → frontend page. Say "كمل" / "continue" to
proceed.

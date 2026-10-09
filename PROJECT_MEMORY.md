# PROJECT_MEMORY.md

_Read this file first, every session — before touching code._
_Last updated: 2026-09-23 — Roadmap position: Phase 7 (Question Bank)
done — review workflow, nobody approves their own question, MCQ/TRUE_FALSE
backed by a real DB constraint. Next up: Phase 8 (Assessment Builder)._

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
Tenant ──< QuestionBank ──< Question ──< QuestionOption
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

`QuestionBank`/`Question` are built, including the review workflow
(`review_status`: PENDING → APPROVED/REJECTED, spec §29) and `QuestionOption`
for MCQ/TRUE_FALSE. `Question.bank` uses `on_delete=RESTRICT` — a bank with
questions in it can't be deleted (archive it instead); `destroy()` in
`QuestionViewSet` turns that into a clean `400`, not an unhandled `500`.
`Question.accepted_answers`/`explanation`/`QuestionOption.is_correct` are
staff-only today because the only consumers that exist are staff
endpoints (`IsStaffMember` blocks STUDENT from the bank entirely) — the
*real* test of "never leak the correct answer to a student" comes in
Phase 9 when Attempts actually serve questions to a student mid-exam;
that needs its own dedicated student-facing serializer that structurally
omits these fields, the same way `apps/content/services.py` computes
Content visibility rather than trusting a flag.

**Designed, not yet built** (Phase 8 → Phase 9):
```
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
academics,people,content,questions,audit}` today — `people` holds
`TeacherAssignment`/`Enrollment`; `content` holds `Content` plus its own
`validators.py` (extension/MIME/size checks) and `services.py`
(visibility resolution); `questions` holds `QuestionBank`/`Question`/
`QuestionOption` and the review workflow). Full layout and the
request-lifecycle enforcement chain: `ARCHITECTURE.md` §2/§5. Auth:
SimpleJWT, access token short-lived (30 min, returned in the JSON body),
refresh token (7 days, rotated on use, blacklisted after rotation,
delivered only as an `httpOnly`/`Secure`/`SameSite=Strict` cookie scoped
to `/api/v1/auth/refresh/`). The tenant-scoped-relational-field pattern
lives in `apps/common/serializers.py` as `TenantScopedModelSerializer`,
shared by academics/people/content/questions. `apps/common/permissions.py`
now has two distinct "who can write" shapes plus a third "who can even
read" shape — `IsAdminForWriteActions` (OWNER/ADMIN write, everyone
reads), `IsStaffForWriteActions` (+ TEACHER can write), `IsStaffMember`
(blocks STUDENT from reading at all — questions needed this, Content/
Enrollment didn't) — pick the narrowest one that actually matches the
resource, don't default to the most permissive one out of habit.

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

## 12. Completed features (Phase 0–7)

- Tenant signup (`Tenant` + `OWNER` `User` created atomically); OWNER/ADMIN
  can now create TEACHER/STUDENT/ADMIN accounts via `/api/v1/users/`
- JWT login / cookie-based refresh / `me` endpoint
- Full tenant-isolation + role-permission enforcement chain, with **91
  passing automated tests against real PostgreSQL**, including:
  - cross-tenant read of another tenant's object → 403/404, never in a list
  - a client-supplied `tenant` field on create is silently ignored
  - relationship-permission layer (a `Course`/`Term`/`TeacherAssignment`/
    `Enrollment`/`Content`/`Question` can't reference another tenant's
    related object)
  - role-scoped read visibility on Enrollment (spec §12/§13), Content
    (per-student, computed from their live academic context), and
    Questions (STUDENT blocked entirely; TEACHER sees own + APPROVED only)
  - Promotion is atomic: one invalid item in a batch rolls back every item
  - **file upload security** (spec §78): wrong extension rejected, real
    file bytes not matching the claimed type rejected (MIME-sniffed, not
    filename-trusted), oversized files rejected, a crafted `../../`-style
    filename never survives into the stored path
  - **question review workflow** (spec §29): nobody (not even OWNER/ADMIN)
    can approve a question they authored themselves; editing a
    previously-approved question sends it back to PENDING; a MCQ/
    TRUE_FALSE question can never have zero or two+ correct options —
    backed by an actual Postgres partial-unique constraint, not just a
    serializer check, and tested by writing straight through the ORM to
    prove the constraint itself holds, not just the API path
- Academic Year / Term / Stage / Grade / Group / Subject / Course /
  Chapter / Lesson / TeacherAssignment / Enrollment / Content /
  **QuestionBank / Question / QuestionOption**: models with tenant-scoped
  constraints, full CRUD API, tenant-scoped serializers
- **Promotion** (`POST /api/v1/enrollments/promote/`): PROMOTE / REPEAT /
  TRANSFER / GRADUATE, `dry_run` flag doubles as the "Preview" step
- Backend fully lint-clean (`flake8`, `black`), zero pending migrations
- Frontend: RTL shell, login/signup flow with silent refresh, Academic
  Years / Terms / Courses / Team / Teacher Assignments / Enrollments /
  Content / **Question Banks / Questions** pages. The Question form
  switches its fields (options list, accepted-answers box, nothing extra)
  per question type and lets OWNER/ADMIN approve or reject straight from
  the list; dynamic MCQ options use React Hook Form's `useFieldArray`.
- Frontend fully lint-clean (`eslint` flat config), builds cleanly,
  `npm audit` = 0 vulnerabilities **as of each phase's own check** — see
  §14's 2026-09-26 note: this needs re-checking periodically, not just once
- `docker-compose.yml`, multi-stage Dockerfiles, CI workflow — **the
  Docker build itself still has not been run** in the environment this
  was built in (no Docker Hub network access there)

## 13. Pending features (rest of the roadmap)

Assessment Builder (6-step wizard) + targeting + scheduling +
randomization, Exam engine (attempts/timer/autosave/server-side scoring —
and a **student-facing Question serializer that structurally omits
correct-answer fields**, not just one that's been told not to render
them, see §5), Anti-cheat event tracking + suspicion dashboard, all three
role dashboards (beyond the current placeholder shell), Reports, rate
limiting, full audit coverage (currently 5 of ~10 listed actions —
question approve/reject added in Phase 7, upload/delete still missing),
onboarding wizard, tenant branding UI, bulk operations, accessibility
pass, production deployment, malware/antivirus scanning for uploads.
**Promotion has no frontend UI yet.** **Content's frontend scope form
exposes 5 of 9 possible scope fields** (chapter/lesson/academic_year/term
are API-only so far). **TRUE_FALSE question editing**: the frontend
pre-fills "صح"/"خطأ" as fixed options on create but doesn't yet stop a
teacher from freely editing that text on an *edit* flow (there's no edit
UI for existing questions yet at all, only create) — worth a guard if/when
edit is built, so a TRUE_FALSE question can't drift into an arbitrary
2-option MCQ through editing.

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
- **2026-09-23 — "Nobody approves their own question" applies to
  OWNER/ADMIN too, not just TEACHER.** Spec §29's literal wording is
  about Teachers; this codebase applies the same rule regardless of role,
  since "don't review your own work" is a stronger, simpler-to-defend
  principle than "Teachers specifically can't, but Admins somehow can."
  If that turns out to be too strict in practice (a solo Owner with no
  second reviewer, say), the fix is a product decision (e.g. a
  "self-publish" flag), not quietly loosening the review endpoint.
- **2026-09-23 — `QuestionOption`'s "exactly one correct answer" is a
  real partial-unique constraint** (`UniqueConstraint(fields=["question"],
  condition=Q(is_correct=True))`), not just serializer validation —
  tested by writing a second `is_correct=True` row straight through the
  ORM, bypassing the API entirely, to prove the database itself refuses
  it. Keep reaching for an actual DB constraint first for any future
  "exactly one of N rows" rule; add the serializer-level check on top
  only so the failure mode is a clean 400 instead of a raw `IntegrityError`.
- **2026-09-23 — `Question.bank` uses `on_delete=RESTRICT`**, and
  `QuestionViewSet.destroy()` catches the resulting `RestrictedError` and
  returns a clean `400` ("archive instead of delete"). `RESTRICT`/
  `PROTECT` on_delete choices need this same catch-and-convert treatment
  wherever they're used — Django raises a plain exception, DRF's default
  handler doesn't know what to do with it, so without the override it's
  an unhandled 500, not a helpful API error.
- **2026-09-26 — Environment note, not a code decision, but important:**
  partway through this phase, the sandbox's working directory
  (`/home/claude`) was wiped by a container reset — all uncommitted *and
  committed* git history that only existed there was gone. The project
  was fully recovered by unzipping the **last delivered zip** from
  `/mnt/user-data/outputs/`, which (a) is **not** wiped by a container
  reset the way the working container is, and (b) still had the complete
  git history up through the last successful `present_files` call, since
  the zip includes `.git/`. Everything after that last delivery (code
  written, tests debugged, docs edited) had to be redone from scratch —
  which was fast only because this file, the commit messages, and the
  conversation itself already recorded exactly what the correct end
  state looked like. **Lesson for pacing future phases:** commit and
  re-deliver (zip + `present_files`) more often, not just once per phase
  at the very end — the delivered zip is the only true persistence
  boundary here, not the working container, and not a git commit that
  hasn't been packaged and handed over yet.
- **2026-09-26 — `npm audit` is a check to repeat, not a box to tick
  once.** Rebuilding this exact dependency set from the same
  `package.json` days later surfaced a **new critical Next.js RCE**
  (`next/og` `ImageResponse`) that did not exist at Phase 6's check —
  patched by bumping to the latest 16.3.x patch (16.3.8) rather than a
  major version. A handful of `high`-severity findings remained
  (`chokidar`/`braces`/`micromatch`/`fast-glob`, pulled in transitively by
  `tailwindcss` and `eslint-config-next`) whose fix path was a major
  Tailwind v4 rewrite; `npm ls --omit=dev` confirmed none of those
  packages appear in the production dependency tree at all — they're
  build-time/lint-time only, never bundled into what ships to a browser,
  and nothing here ever feeds untrusted input into their glob-matching
  code. Judged not worth a risky, disproportionate major-version rewrite
  for that risk profile; documented in SECURITY.md instead of either
  silently ignored or reflexively "fixed." Re-run `npm audit` (and
  `pip list --outdated`-style thinking for the backend) at the start of
  any future session that touches dependencies, not just once at
  project start.

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
- TeacherAssignment's own list (not Enrollment's/Content's/Question's) is
  still readable by any tenant member, not scoped to "only see your own
  assignments." Content's TEACHER-role read visibility is also tenant-wide
  (only STUDENT visibility is computed per-person) — lower priority than
  the student-facing work since this is administrative/creator-owned
  metadata, not other people's private data, but worth tightening
  alongside Reports/Dashboards later if it turns out to matter.
- Question edit has no frontend UI yet (create only) — see §13.
- A container reset mid-Phase-7 wiped the working directory once; see
  §14's 2026-09-26 note. Nothing about the *delivered* project was lost
  (the last zip had full git history), but it's worth remembering this
  can happen and pacing deliveries accordingly.

## 16. Next steps

Pick up at **Phase 8 — Assessments**: `Assessment` as an entity
independent of both `Course` and `QuestionBank` (spec §33 is explicit
about this — an Assessment pulls questions *from* banks and can target
students outside a single course's roster, so it must not be modeled as
a child of either), with its own **targeting** (tenant/stage/grade/group/
multiple-groups/specific-students — reuse the same kind of
independently-optional-scope thinking `Content` already established in
Phase 6, not a copy of `TeacherAssignment`'s Course-keyed shape), a
**6-step builder** (basic info → questions → targeting → schedule →
settings → review/publish, spec §34), and **question/option
randomization settings** stored on the Assessment (the actual
randomization logic belongs to Phase 9's attempt-serving code, not here —
this phase just needs the settings to exist and be configurable). Start
designing the **student-facing Question shape** now even though Phase 9
consumes it (§5/§13) — getting the "never include `is_correct`/
`accepted_answers`/`explanation`" serializer right while building the
very first thing that will use it is safer than retrofitting it onto
code that already (mis)trusts the staff shape. Same recipe as every phase
so far: model + tenant-scoped constraints → tenant-scoped serializer →
tested viewset → frontend page. Before writing new code, re-run `npm
audit` and re-check pinned backend versions (§14, 2026-09-26) — enough
time may have passed for new advisories again. Say "كمل" / "continue" to
proceed.

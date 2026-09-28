# API Reference

Base URL: `/api/v1/`. All request/response bodies are JSON. All endpoints
below except signup/login/refresh require `Authorization: Bearer <access
token>`. All list endpoints are paginated
(`{"count","next","previous","results"}`, page size 20).

Errors always come back as `{"error": {"status": <int>, "detail": ...}}` —
never a raw traceback.

## Auth

### `POST /api/v1/auth/signup/`
Creates a new Tenant and its OWNER user in one transaction. Public
(`AllowAny`).

Request:
```json
{ "tenant_name": "Future Center", "owner_email": "owner@example.com", "owner_password": "a-strong-password" }
```
Response `201`: `{ "access": "<jwt>", "tenant": {...}, "user": {...} }`
(also sets the `refresh_token` httpOnly cookie).

### `POST /api/v1/auth/login/`
Request: `{ "email": "...", "password": "..." }`
Response `200`: `{ "access": "<jwt>" }` + sets `refresh_token` cookie.

### `POST /api/v1/auth/refresh/`
No body — reads the `refresh_token` cookie. Response `200`:
`{ "access": "<jwt>" }`, rotates the cookie.

### `POST /api/v1/auth/logout/`
Blacklists the current refresh token and clears the cookie.

### `GET /api/v1/auth/me/`
Response `200`: current user (id, email, role, tenant summary).

## Users

### `GET/POST /api/v1/users/`, `GET/PATCH/DELETE /api/v1/users/<id>/`
OWNER/ADMIN only for write; members can read their own tenant's list.
Creates a TEACHER, STUDENT, or ADMIN account in the caller's tenant —
`role=OWNER` is rejected (there is exactly one OWNER per tenant, set at
signup). Request for create: `{ "email", "password", "role",
"first_name"?, "last_name"? }`. Response never includes the password.

## Academics

All of the following are standard `ModelViewSet`s: `GET` (list/retrieve) is
allowed for any authenticated member of the tenant; `POST`/`PUT`/
`PATCH`/`DELETE` require role `OWNER` or `ADMIN`. `tenant` is never a
request field — it's always the caller's own tenant.

| Endpoint                          | Model         | Notable fields |
|------------------------------------|---------------|----------------|
| `/api/v1/academic-years/`          | AcademicYear  | `name`, `start_date`, `end_date`, `is_active` |
| `/api/v1/terms/`                   | Term          | `academic_year` (scoped to caller's tenant), `name`, `start_date`, `end_date`, `order` |
| `/api/v1/stages/`                  | Stage         | `name`, `order` |
| `/api/v1/grades/`                  | Grade         | `stage`, `name`, `order` |
| `/api/v1/groups/`                  | Group         | `grade`, `academic_year`, `name`, `capacity` |
| `/api/v1/subjects/`                | Subject       | `name`, `code` |
| `/api/v1/courses/`                 | Course        | `subject` (scoped), `grade` (scoped), `name`, `description`, `is_active` |
| `/api/v1/chapters/`                | Chapter       | `course` (scoped), `name`, `order` (unique per course) |
| `/api/v1/lessons/`                 | Lesson        | `chapter` (scoped), `name`, `order` (unique per chapter) |

`Course` deliberately has no `teacher` field — see PROJECT_MEMORY.md §14
for why that's TeacherAssignment's job, not Course's.

## People

### `/api/v1/teacher-assignments/`
Standard `ModelViewSet`, OWNER/ADMIN write, all roles read. Fields:
`teacher` (scoped to `role=TEACHER` users in caller's tenant), `course`
(scoped), `groups` (M2M, scoped — must belong to `course.grade`; empty
means "the whole grade").

### `/api/v1/enrollments/`
Standard `ModelViewSet`, OWNER/ADMIN write, but **read is role-scoped**,
not just tenant-scoped: OWNER/ADMIN see every row; TEACHER sees only
students in groups they're assigned to; STUDENT sees only their own.
Fields: `student` (scoped to `role=STUDENT`), `group` (scoped),
`academic_year` (read-only, derived from `group.academic_year`), `status`.

### `POST /api/v1/enrollments/promote/`
OWNER/ADMIN only. Body:
```json
{
  "target_academic_year": "<uuid>",
  "dry_run": false,
  "items": [
    {"enrollment": "<uuid>", "action": "PROMOTE", "target_group": "<uuid>"},
    {"enrollment": "<uuid>", "action": "REPEAT", "target_group": "<uuid>"},
    {"enrollment": "<uuid>", "action": "TRANSFER", "target_group": "<uuid>"},
    {"enrollment": "<uuid>", "action": "GRADUATE"}
  ]
}
```
`dry_run: true` validates everything and returns what *would* happen
without writing anything (the "Preview" step, spec §25) — same request
shape, same validation, nothing committed. `dry_run: false` (default)
validates, then commits every item in a single transaction: one invalid
item fails the whole batch with a `400` and nothing is written, not even
the valid items. `GRADUATE` marks the existing enrollment `GRADUATED` and
creates no new row; every other action creates a new `Enrollment` for
`target_academic_year` and, for `TRANSFER`, also marks the old one
`TRANSFERRED`. A student can only ever have one enrollment per academic
year — promoting into a year they're already enrolled in is rejected.

## Content

### `GET/POST /api/v1/content/`, `GET/PATCH/DELETE /api/v1/content/<id>/`
`POST` is `multipart/form-data` when a file is attached (JSON is fine for
link/text content). OWNER/ADMIN/TEACHER may write; a TEACHER may only
modify content they created (`created_by`), OWNER/ADMIN anything.

Fields: `title`, `content_type` (`PDF`, `VIDEO`, `IMAGE`, `DOCUMENT`,
`BOOK`, `CHAPTER_RESOURCE` need a `file`; `EXTERNAL_LINK` needs
`external_url`; `TEXT`, `SUMMARY`, `LESSON_EXPLANATION` need `text_body` —
exactly one payload, the other two must be empty), `description`,
`is_published`, and nine independent optional scope fields: `stage`,
`grade`, `group`, `subject`, `course`, `chapter`, `lesson`,
`academic_year`, `term` (each scoped to the caller's tenant).

Upload rules (`apps/content/validators.py`): extension whitelist per type,
real MIME sniffed from the file bytes (not the filename or the client's
`Content-Type`), size cap per type (5 MB images, 20 MB PDF/documents,
50 MB books, 300 MB video). Violations are a `400` with a `file` error.
The stored path is a generated UUID — the uploaded name is kept only in
`original_filename` for display. `file` is write-only: no response ever
contains a direct file path.

**Read visibility:** OWNER/ADMIN/TEACHER see every row in the tenant. A
STUDENT sees a row only if *every non-null scope field on it* matches
their current enrollment's context (their group/grade/stage/academic
year, and the courses/chapters/lessons of their grade) and it is
published; a student with no enrollment sees nothing. An unset scope
field restricts nothing — so a book scoped only to grade + subject + term
is visible to every student in that grade regardless of group.

### `GET /api/v1/content/<id>/download/`
The only way to read a payload. Runs the exact same queryset and object
permission chain as the detail view (so an out-of-scope student gets
`404`, an unauthenticated caller `401`). Returns the file as an
attachment for file types, `{"external_url": ...}` for links, or
`{"text_body": ...}` for text types. There is no public `/media/` URL.

## Planned (not built yet — see PROJECT_MEMORY.md roadmap)

`/question-banks`, `/questions`, `/assessments`, `/attempts`, `/results`,
`/reports`, `/audit`, `/security`.

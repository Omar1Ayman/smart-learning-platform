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

## Planned (not built yet — see PROJECT_MEMORY.md roadmap)

`/content`, `/question-banks`, `/questions`, `/assessments`, `/attempts`,
`/results`, `/reports`, `/audit`, `/security`.

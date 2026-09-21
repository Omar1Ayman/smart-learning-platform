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

### `GET /api/v1/auth/me/`
Response `200`: current user (id, email, role, tenant summary).

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
for why that's TeacherAssignment's job (Phase 5), not Course's.

## Planned (not built yet — see PROJECT_MEMORY.md roadmap)

`/content`, `/question-banks`, `/questions`, `/assessments`, `/attempts`,
`/results`, `/reports`, `/audit`, `/security`.

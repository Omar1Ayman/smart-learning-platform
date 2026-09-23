# Security

Security is treated as a property of every feature, not a feature of its
own bolted on at the end (spec §38). This document is the honest,
continuously-updated status of that — including what is **not** done yet.
Anyone extending this project should update this file in the same commit
that changes anything security-relevant.

## 1. Authorization model

No permission decision in this codebase is made with a single
`if user.is_admin` check. Every tenant-scoped endpoint goes through the
five-layer chain documented in `ARCHITECTURE.md` §2: Authentication →
Tenant → Role → Object → Relationship → DB query. Concretely:

- **Tenant** comes only from `request.user.tenant`, resolved server-side
  after signature verification and a fresh DB lookup. It is never read from
  a request body, query param, header, or trusted from a JWT claim (the
  JWT does carry a `tenant_id` claim, but that's for the *frontend's*
  convenience — e.g. showing the tenant name without an extra request — the
  backend re-derives it from the DB on every request; see
  `TenantContextMixin` in `apps/common/mixins.py`).
- **UUIDs are not authorization** (spec §98). Every object endpoint still
  runs `IsSameTenantObject`, so knowing/guessing a UUID from another tenant
  gets you a 404, not the object.
- **Foreign keys can't cross tenants**: relational serializer fields (e.g.
  `Term.academic_year`) have their `queryset` scoped to `request.tenant`
  at serializer init time — a foreign tenant's id isn't rejected with a
  permissions error that would confirm the id exists, it's simply not a
  valid choice, the same response you'd get for a made-up id.
- **Read visibility can be narrower than tenant membership.** Tenant
  isolation says "you can't see another tenant's data"; that's necessary
  but not sufficient — spec §12/§13 also require a Teacher to see only
  their own assignment scope and a Student to see only their own record.
  `EnrollmentViewSet.get_queryset()` implements this: it starts from the
  same tenant-scoped queryset every other endpoint uses, then narrows it
  further by `request.user.role`. A Teacher fetching an out-of-scope
  enrollment by direct ID gets 404, the same as a genuine cross-tenant
  request — it's simply outside their queryset, not a special case.

## 2. Threat checklist (spec §38) — current status

| Threat                         | Status        | Notes |
|--------------------------------|----------------|-------|
| IDOR                            | Mitigated      | `IsSameTenantObject` on every detail/update/delete route; tested in `test_tenant_isolation.py`. |
| BOLA                            | Mitigated      | Same mechanism as IDOR — object-level check runs regardless of role. |
| Broken access control           | Mitigated       | Role checks (`HasRole`, `IsAdminForWriteActions`) gate every write. Read access on Enrollment is per-teacher-scoped (spec §12) via `TeacherAssignment`, tested in `test_enrollments.py`. Still MVP-scoped elsewhere: e.g. `TeacherAssignment`'s own list is tenant-wide, not narrowed to "your own assignments" (see PROJECT_MEMORY.md §15). |
| Privilege escalation            | Mitigated       | `role` is never a client-writable field on any serializer; only set server-side at signup (`OWNER`) or via the OWNER/ADMIN-only `/api/v1/users/` endpoint, which itself rejects `role=OWNER` (`UserCreateSerializer.validate_role`) — there is exactly one OWNER per tenant, set at signup, never created after the fact. |
| Mass assignment                 | Mitigated       | Serializers use explicit `fields` allow-lists, never `fields = "__all__"`; `tenant` and `role` are excluded from every writable serializer. Tested explicitly: `test_tampered_tenant_claim_is_ignored`. |
| Sensitive data exposure         | Mitigated (current scope) | No password hashes, internal permission flags, or (once they exist) correct-answer fields are ever put in a serializer's `fields`. |
| SQL injection                   | Mitigated       | Django ORM only, no raw SQL anywhere in the codebase yet. |
| XSS                              | Mitigated (current scope) | React escapes by default; no `dangerouslySetInnerHTML` used. Will matter more once rich content/branding (spec §91, "no unsafe HTML/JS from a tenant") is built. |
| CSRF                             | Mitigated       | API auth is bearer-token based, not cookie-session based, so classic CSRF doesn't apply to it. The one cookie that exists — the refresh token — is `SameSite=Strict`, scoped to the single `/api/v1/auth/refresh/` path, which blocks cross-site use. |
| SSRF                             | Not yet applicable | No server-side outbound fetch of user-supplied URLs exists yet; will need review when content-by-URL or webhook features are added. |
| File upload attacks             | Not yet applicable | No file upload endpoint exists yet (Phase 6/Content). Will require extension+MIME+size checks, private-by-default storage, and no execution from the upload path. |
| Path traversal                  | Not yet applicable | No filesystem path is ever built from user input yet. |
| Rate-limit abuse / brute force  | **Planned, not done** | DRF throttle classes are not yet configured on `/auth/login/`, `/auth/signup/`, or `/auth/refresh/`. Tracked as a known gap below. |
| Session attacks                 | Partially mitigated | Refresh tokens rotate on use and are blacklisted after rotation (`ROTATE_REFRESH_TOKENS` + `BLACKLIST_AFTER_ROTATION`), so a stolen, already-used refresh token is dead. Refresh token itself is `httpOnly` (unreadable by JS, so an XSS bug can't exfiltrate it) + `Secure` + `SameSite=Strict`. |
| JWT misuse                      | Mitigated       | Signature-verified on every request; short expiry; claims are advisory only (see §1) — the DB row is always the source of truth for role/tenant. |
| CORS misconfiguration           | Mitigated (dev) | `CORS_ALLOWED_ORIGINS` is an explicit allow-list from env, not `*`; must be set to the real frontend origin(s) before production deploy — see `.env.example`. |

## 3. Password & credential handling

Passwords are hashed with Django's default PBKDF2 hasher (never stored or
logged in plaintext). `DJANGO_SECRET_KEY` and DB credentials live in
environment variables only (`.env`, gitignored) — `.env.example` documents
every variable without real values. **This must be rotated before any real
deployment**; the checked-in example is a development placeholder.

## 4. Error handling

`apps/common/exceptions.py` wraps every DRF error response into a
consistent `{"error": {...}}` shape. With `DEBUG=False` (the only
acceptable prod setting — enforced by `config/settings/prod.py` raising if
`DJANGO_DEBUG` is unset), Django never serializes a Python traceback into an
API response.

## 5. Anti-cheat is a detection layer, not the security boundary

To be explicit about a distinction the product spec itself insists on
(§64/§98): disabling right-click, blocking F12, or hiding a button are UX
deterrents at best and are never treated as security controls in this
codebase. The actual boundary for exam integrity, once the exam engine
exists, is server-side timer enforcement, server-side scoring, attempt
limits, and target restrictions — event logging (tab-hidden, copy attempts,
etc.) only adds visibility on top of that boundary, per the anti-cheat
design in `ARCHITECTURE.md` §8.

## 6. Known gaps (honest, as of this writing)

- **No rate limiting configured yet** — highest-priority item for the next
  security pass, before Phase 6 starts.
- **Audit logging covers three actions** (tenant signup, academic year
  creation, promotion) as a pattern demonstration, not the full list in
  spec §50 yet.
- **No file upload surface yet**, so upload-specific hardening hasn't been
  built or tested — don't treat its absence from the table above as "safe
  by default" once that feature lands.
- **No independent penetration test.** The tests in `tests/` verify the
  specific isolation and privilege-escalation scenarios the spec calls out
  (spec §71/§72) and pass against a real PostgreSQL instance, but that is
  not a substitute for a third-party security review before commercial
  launch (spec §100).
- **Not deployed anywhere.** Every control above has been verified in a
  local/dev configuration; production configuration (`prod.py`, real
  secrets, TLS, locked-down `CORS_ALLOWED_ORIGINS`) is written but unused
  until Phase 14.

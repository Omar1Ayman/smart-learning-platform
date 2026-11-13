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
- **Some resources are staff-only, not just write-restricted.** Most
  endpoints let every authenticated tenant member read and restrict only
  writes (`IsAdminForWriteActions`/`IsStaffForWriteActions`). The
  Question Bank is different: `IsStaffMember` refuses STUDENT on *every*
  method, because being able to browse question text ahead of time is
  close enough to seeing the answer key that read access itself needs
  gating, not just write access.
- **Review/approval authority excludes the author, structurally.**
  `QuestionViewSet`'s `approve`/`reject` actions check
  `question.created_by_id == request.user.id` and refuse with `403`
  regardless of the caller's role — OWNER and ADMIN included, not just
  TEACHER (spec §29 names Teachers specifically; this codebase applies
  the same rule to everyone who can author a question, deliberately
  stricter — see PROJECT_MEMORY.md's Phase 7 decisions).

## 2. Threat checklist (spec §38) — current status

| Threat                         | Status        | Notes |
|--------------------------------|----------------|-------|
| IDOR                            | Mitigated      | `IsSameTenantObject` on every detail/update/delete route; tested in `test_tenant_isolation.py`. |
| BOLA                            | Mitigated      | Same mechanism as IDOR — object-level check runs regardless of role. |
| Broken access control           | Mitigated       | Role checks (`HasRole`, `IsAdminForWriteActions`) gate every write. Read access on Enrollment is per-teacher-scoped (spec §12) via `TeacherAssignment`, tested in `test_enrollments.py`. Still MVP-scoped elsewhere: e.g. `TeacherAssignment`'s own list is tenant-wide, not narrowed to "your own assignments" (see PROJECT_MEMORY.md §15). |
| Privilege escalation            | Mitigated       | `role` is never a client-writable field on any serializer; only set server-side at signup (`OWNER`) or via the OWNER/ADMIN-only `/api/v1/users/` endpoint, which itself rejects `role=OWNER` (`UserCreateSerializer.validate_role`) — there is exactly one OWNER per tenant, set at signup, never created after the fact. |
| Mass assignment                 | Mitigated       | Serializers use explicit `fields` allow-lists, never `fields = "__all__"`; `tenant` and `role` are excluded from every writable serializer. Tested explicitly: `test_tampered_tenant_claim_is_ignored`. |
| Sensitive data exposure         | Mitigated (current scope) | No password hashes or internal permission flags are ever put in a serializer's `fields`. `ContentSerializer.file` is `write_only` — the API never returns a direct file path. Text content is rendered as plain text by React, never as HTML (no `dangerouslySetInnerHTML`). `QuestionSerializer` **does** include `accepted_answers`/`explanation`/`QuestionOption.is_correct` — deliberately, since it's the staff-authoring shape and `IsStaffMember` means no STUDENT request ever reaches it. **Phase 9 must not reuse this serializer for anything a student's browser receives** — a dedicated student-facing shape that structurally omits these fields is listed as required in PROJECT_MEMORY.md §5/§13, not optional polish. |
| SQL injection                   | Mitigated       | Django ORM only, no raw SQL anywhere in the codebase yet. |
| XSS                              | Mitigated (current scope) | React escapes by default; no `dangerouslySetInnerHTML` used. Will matter more once rich content/branding (spec §91, "no unsafe HTML/JS from a tenant") is built. |
| CSRF                             | Mitigated       | API auth is bearer-token based, not cookie-session based, so classic CSRF doesn't apply to it. The one cookie that exists — the refresh token — is `SameSite=Strict`, scoped to the single `/api/v1/auth/refresh/` path, which blocks cross-site use. |
| SSRF                             | Not yet applicable | No server-side outbound fetch of user-supplied URLs exists yet; will need review when content-by-URL or webhook features are added. |
| File upload attacks             | Mitigated (no AV scan) | `apps/content/validators.py`: extension whitelist per content type, a real MIME sniff of the file's bytes via `python-magic` (a PNG renamed `.pdf` is rejected — tested), and a per-type size cap. Files are served only through the authenticated `ContentViewSet.download` action; there is no `/media/...` route at all. **Not done:** malware/antivirus scanning (`Content.scan_status` is the hook; nothing populates it). |
| Path traversal                  | Mitigated       | Stored filenames are a fresh UUID plus a sanitized extension (`generate_storage_filename`); nothing from the uploaded name reaches the storage path. Django's multipart parser also strips directory components first — a second, independent layer. Tested with a `../../etc/passwd.pdf` upload. |
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

Administrators do not set or send users' passwords. New accounts receive a
single-use, three-day email invitation to choose their own password; if the
invitation cannot be delivered, account creation is rolled back.

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
  security pass, before Phase 8 (Assessments/exam APIs) starts — exam
  endpoints are exactly the kind of surface spec §49 wants throttled.
- **Audit logging covers five actions** (tenant signup, academic year
  creation, promotion, question approve/reject) as a pattern demonstration,
  not the full list in spec §50 yet.
- **Frontend `npm audit` needs re-checking periodically, not just once.**
  A new critical Next.js RCE (`next/og` `ImageResponse`) was disclosed
  between this project's Phase 6 and Phase 7 sessions and was caught and
  patched (16.3.5 → 16.3.8) only because the check was repeated. A
  handful of `high` findings remain in dev/lint-only tooling
  (`tailwindcss`'s and `eslint-config-next`'s transitive `chokidar`/
  `braces`/`micromatch`/`fast-glob`) whose only available fix is a major
  Tailwind v4 rewrite; `npm ls --omit=dev` confirms none of them reach the
  production bundle, so this was judged lower priority than a disruptive
  major-version jump — see PROJECT_MEMORY.md's 2026-09-26 note for the
  full reasoning. Re-run `npm audit` at the start of any session that
  touches dependencies.
- **Uploads have no malware scanning**, and storage is local disk. The
  validators (extension, real MIME sniff, size) and the authenticated-only
  download path are built and tested (Phase 6), but a production deployment
  should add a scanner behind `Content.scan_status` and move to private
  object storage before real customers upload real files. Video is the
  weak spot: the 300 MB cap is enforced, but buffering that through Django
  is not how a real deployment should serve video.
- **No independent penetration test.** The tests in `tests/` verify the
  specific isolation and privilege-escalation scenarios the spec calls out
  (spec §71/§72) and pass against a real PostgreSQL instance, but that is
  not a substitute for a third-party security review before commercial
  launch (spec §100).
- **Not deployed anywhere.** Every control above has been verified in a
  local/dev configuration; production configuration (`prod.py`, real
  secrets, TLS, locked-down `CORS_ALLOWED_ORIGINS`) is written but unused
  until Phase 14.

## Dependency Audit — Deferred Advisories

_Last reviewed: 2026-11-04 (Next.js 16.4.5, React 18.x)_

### `zod` < 4.6.6 — HIGH (GHSA-mrhx-c7xc-m3w5)
**Deferred because:** Zod runs client-side only. An attacker who can
feed adversarial input to a Zod validator already has JS execution in
the victim's browser — the memory-exhaustion vector is redundant. No
schema in `lib/validation/schemas.ts` uses `z.array().max()` on a
user-controlled collection at scale (largest is MCQ `options`, capped
at 2–10 by UI). Fixing requires zod@4 — breaking migration not
justified by the theoretical risk profile.

**Revisit when:** Zod 3.x gets a security patch, or a planned zod@4
migration happens for other reasons.

### `minimatch` < 11.0.1 — MODERATE (GHSA-g3hv-75wg-m249)
**Deferred because:** Build-time only. Pulled transitively by
`eslint` + `@typescript-eslint/*`, never bundled to the browser
(`npm ls --omit=dev` confirms). ESLint patterns in this project are
all hard-coded — no untrusted input reaches glob-matching.

**Revisit when:** ESLint 9.x ships a release with updated minimatch
transitively. `--force` path would downgrade ESLint to 4.0.0 — worse
than the advisory.

### Patched — do NOT re-defer if reappeared
- `follow-redirects` (GHSA-mrwp-f3q8-3g9p) — patched 2026-11-04
- `postcss-selector-parser` (GHSA-rj75-hqrm-r3gf) — patched 2026-11-04
- `next` critical RCE chain (GHSA-2464, GHSA-p3m5, GHSA-673q) — patched
  2026-11-04 by bumping 16.3.8 → 16.4.5

If any reappears in a future audit, something has regressed.

## Planned Upgrade — React 18 → 19
Next.js 16.4.5 emits a deprecation warning: React 18 support is
removed in Next.js 17. Non-blocking today. Planned for **Wave 6**
(post-Phase 9) — the upgrade involves TypeScript type changes and
hook signature updates that require a full regression pass. Not to
be done opportunistically mid-feature-work.
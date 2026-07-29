# Runbook — `module-3-superadmin`

**Date**: 2026-07-18
**Project**: `gastos-personales-reference`
**Module**: 3 — Superadmin surface (role assignment, session revocation, audit log)

This runbook is the operator-facing companion to `auth-runbook.md`
(Module 2). Every admin action a `role: "ADMIN"` user can take on the
platform — list users, change a role, list sessions, revoke a session,
revoke every session for a user — flows through one of the 5 endpoints
documented here. The companion piece to `docs/operations/auth-runbook.md`
covers the sign-in surface; this one covers everything that lives behind
`/admin/*`.

All secret values live in the `staging` GitHub Actions environment (per
`production-foundation-runbook.md` §9) and the production environment.
Local devs edit `apps/web/.env.test` (committed, runtime-gated) and
`apps/api/.env.test`; NEVER commit a real `NEXTAUTH_SECRET` or
`ADMIN_ENABLED` override that disables the surface in production.

## 1. Admin onboarding

An "admin" is a `User` row with `role = "ADMIN"` in the Prisma `User`
table. The platform ships **no public sign-up path to ADMIN** — every
admin must be provisioned out-of-band by an existing admin (or by direct
DB access during initial seeding). The rationale: ADMIN exposes the
session list, role mutation, and session revoke endpoints for every
account on the platform, including the right to revoke any session
including one's own. Public sign-up to ADMIN would let an attacker who
temporarily gained email access self-elevate to full read of every
user's data.

### Provisioning a new admin (existing admin does this)

1. The existing admin signs in at `/{locale}/sign-in` (per
   `auth-runbook.md` §2) and visits `/{locale}/admin/users`.
2. Locate the target user (the list is paginated; use `?limit=200` for
   small populations).
3. Click on the user's row → detail page. The detail page exposes the
   `ChangeRoleForm` with the current role pre-selected.
4. Pick `ADMIN` from the Select. The form posts to
   `POST /api/admin/users/:userId/role` with body
   `{role: "ADMIN"}` (Zod-validated by
   `libs/features/auth/shared/schemas/admin.schemas.ts`).
5. The server changes the role + writes an audit row + emits
   `auth.role.changed` (PR #2 task 2.2 + 2.5). The target user's
   existing JWT remains valid until their next refresh — D4 cascade
   policy. Worst-case 24h window (matches
   `SESSION_TTL_SECONDS` per `auth-runbook.md` §5).
6. The admin signs out of their own session and back in (or wait for
   the next JWT refresh). The fresh JWT carries `role: "ADMIN"`.

> **Initial seeding (no existing admin).** Direct DB access required:
> `UPDATE "User" SET role = 'ADMIN' WHERE email = 'firstadmin@example.test';`
> in a `prisma studio` session or via `psql`. The next sign-in by that
> user mints an ADMIN JWT through the standard next-auth flow.

## 2. Role assignment procedure

`POST /admin/users/:userId/role` is the only mutation path. The body is
`{role: "USER" | "ADMIN"}` — the enum is closed (Zod
`ChangeRoleBodySchema`). The idempotent path: re-submitting the same
role is a no-op (no DB write, no audit row, no event). The platform
NEVER silently upgrades — every role mutation is explicit.

### Reversing a role assignment

1. The acting admin visits `/{locale}/admin/users/:userId`.
2. Picks the new role from the Select. Submits.
3. Server writes the change + audit row + `auth.role.changed` event
   payload includes `{actorId, targetUserId, fromRole, toRole}`.

### Threat matrix coverage (per `design.md` §7)

- **Non-admin attempts role change → 403.** `AdminGuard` rejects
  non-admin tokens before the handler runs.
- **Expired/forged JWT → 401.** `JwtAuthGuard`'s try/catch decode
  (per `pattern/nextauth-decode-try-catch`) rejects before
  `AdminGuard` runs.
- **Unknown userId → 404.** Controller translates
  `RbacService.changeRole`'s "User not found" into 404.
- **Invalid role body → 400.** Zod pipe rejects before the service.

## 3. Listing + revoking sessions

Sessions are listed per user via
`GET /admin/sessions?userId=<uuid>`, sorted DESC by `expires`
(per PR #2 deviation #1 — the proxy for `lastActiveAt`). The response
shape is `[{id, userId, sessionToken, expires, userAgent, ipAddress}]`.

### Single-session revoke

`DELETE /admin/sessions/:sessionId` deletes the row + writes an audit
row with `action: "REVOKE_SESSION"`, `metadata: {targetUserId}`.

**Self-revoke UX (D5).** When the deleted session belongs to the
calling admin (i.e. the `sessionId` resolves to a session whose
`userId` matches the JWT's `userId`), the response carries
`Set-Cookie: authjs.session-token=; Path=/; Expires=<epoch>`
so the browser clears the cookie client-side. This is the standard
"log out from this device" UX. The client shows a confirmation dialog
before calling the endpoint — accidental self-revoke is recoverable
(re-sign in with email/password or Google per `auth-runbook.md` §1).

### Bulk revoke (kill-switch for a single user)

`DELETE /admin/sessions/user/:userId` deletes every session for the
user + writes an audit row with `action: "REVOKE_ALL_SESSIONS"`,
`metadata: {count: <n>}`. Use case: "I lost my phone — log me out
everywhere" or "Suspected compromise on user X — force sign-out."

**Self-revoke-all.** When `userId === request.user.id`, the response
carries the same `Set-Cookie` clear. This is the "log out everywhere"
UX — matches the standard Cognito/Auth0 `GlobalSignOut` pattern.

## 4. Emergency revoke procedures

### 4.1 Suspected compromise of an admin account

1. The responding operator (another admin) signs in and visits
   `/{locale}/admin/sessions`.
2. Enters the compromised user's id, picks the bulk-revoke button.
3. `DELETE /admin/sessions/user/:userId` runs — every active session
   for the user is killed + the audit row records the actor + IP.
4. After revoke, consider rotating the user's password out-of-band
   (per `auth-runbook.md` §1 the reset flow mints a single-use
   link — use the staged preview console to fetch it).

### 4.2 Suspected compromise of a non-admin account

1. Same flow as §4.1, the targeted user is the victim.
2. Optionally also change the user's role to `USER` explicitly via
   §2 (no-op if already USER) to mark the row with an audit trail.

### 4.3 Suspected leak of an admin's JWT signing secret

This is a tier-1 incident. `NEXTAUTH_SECRET` compromise means every
JWT (and every session) on the platform is forgeable.

1. The operator rotates `NEXTAUTH_SECRET` in the secret store.
2. Restart the API + web processes — next-auth re-reads the secret at
   boot.
3. **All existing sessions become invalid** because the JWT signatures
   no longer verify against the new secret. The SessionsService.list
   call still resolves sessions (rows persist), but `JwtAuthGuard`
   rejects the bearer header. The admin uses
   `DELETE /admin/sessions/user/:userId` with the new secret IN CASE
   the attacker is racing the rotation — the revoke still runs
   because the admin's freshly minted JWT IS valid; the attacker's
   JWT is not.
4. Audit the AdminAuditEvent table for any
   `auth.role.changed` rows with `createdAt >= <rotation-time>` —
   those may be attacker-induced.

### 4.4 Kill the entire admin surface (per D7 / D8)

Set `ADMIN_ENABLED=false` in the API env. `AdminGuard` checks this
flag first and returns 404 for every `/admin/*` route. The
`/admin/*` API surface becomes invisible — even a leaked admin JWT
cannot mutate state. The web `/admin/*` pages continue to render
(Middleware still recognizes the routes) but every fetch returns
404, so the UI surfaces a permanent error state.

Use this when:

- A CVE lands that bypasses `AdminGuard`'s `role === 'ADMIN'` check.
- An investigation requires freeze-on-write while forensics run.
- The platform is offline for maintenance and admins need a
  visual signal.

```bash
# Fly.io
flyctl secrets set ADMIN_ENABLED=false -a gastos-api

# Render
render env set ADMIN_ENABLED=false --service gastos-api
```

To re-enable, set the variable back to `true` (or unset it; the
default is `true`) and restart the API.

## 5. Audit log query examples

The audit rows live in `AdminAuditEvent` (per design D2). The
schema (see `libs/core/database/prisma/schema.prisma`) is:

```
AdminAuditEvent {
  id          String   @id @default(cuid())
  actorId     String                     -- the admin who performed the action
  targetId    String                     -- the session id (REVOKE_SESSION) or
                                         -- userId (REVOKE_ALL_SESSIONS, CHANGE_ROLE)
  action      AdminAuditAction            -- REVOKE_SESSION | REVOKE_ALL_SESSIONS | CHANGE_ROLE
  createdAt   DateTime @default(now())    -- @@index([createdAt])
  metadata    Json?                       -- e.g. {count: N} for bulk revokes,
                                         -- {fromRole, toRole} for role changes
  ipAddress   String?                    -- ≤ 45 chars (IPv6 max), per D3 truncation
  userAgent   String?                    -- ≤ 512 chars, per design §7
}
```

The `@@index([createdAt])` index supports a future retention purge
job (deferred to M4 Privacy per D7). For now, no automated purge.

### Example 1 — who revoked a specific session?

```sql
SELECT actor_id, created_at, ip_address, user_agent
FROM admin_audit_event
WHERE action = 'REVOKE_SESSION' AND target_id = '<sessionId>'
ORDER BY created_at DESC;
```

### Example 2 — every role change in the last 7 days

```sql
SELECT actor_id, target_id, metadata->>'fromRole' AS from_role,
       metadata->>'toRole' AS to_role, created_at, ip_address
FROM admin_audit_event
WHERE action = 'CHANGE_ROLE'
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

### Example 3 — bulk revoke audit trail

```sql
SELECT actor_id, target_id, metadata->>'count' AS revoked_count,
       created_at, ip_address
FROM admin_audit_event
WHERE action = 'REVOKE_ALL_SESSIONS'
ORDER BY created_at DESC
LIMIT 50;
```

### Example 4 — all admin actions from a specific IP

```sql
SELECT actor_id, action, target_id, created_at
FROM admin_audit_event
WHERE ip_address = '<ip>'
ORDER BY created_at DESC;
```

### Example 5 — recent admin activity (operator dashboard)

```sql
SELECT actor_id, action, target_id, created_at
FROM admin_audit_event
ORDER BY created_at DESC
LIMIT 100;
```

## 6. Retention (deferred to M4)

**No automated purge ships in M3.** The D7 decision is intentional:
retention policy is M4 Privacy scope, and the `@@index([createdAt])`
index supports whatever purge query M4 lands. The runbook entry
exists to document the gap so future maintainers don't think the
audit table is unbounded by design.

When M4 ships the purge job, the index on `createdAt` already
supports the canonical delete:

```sql
DELETE FROM admin_audit_event
WHERE created_at < NOW() - INTERVAL '<retention_days> days';
```

Until then, the audit table grows monotonically. Plan for capacity:
~1 KB per row, ~1 admin action per ~10 sign-ins for a busy platform.

## 7. Local dev prerequisites

The repo's `apps/web/.env.test` and `apps/api/.env.test` (committed)
contain a complete fixture set so `NODE_ENV=test pnpm dev` boots out
of the box. The following vars drive the admin surface specifically:

| Variable | Dev default | Production required | Notes |
| --- | --- | --- | --- |
| `ADMIN_ENABLED` | `true` (implicit) | `true` | D8 kill-switch — see §4.4 |
| `NEXTAUTH_SECRET` | test fixture | from secret store | Used to sign JWTs that `JwtAuthGuard` validates |
| `SESSION_TTL_SECONDS` | `86400` (24h) | `86400` | D4 cascade window — target's stale JWT stays valid until refresh |

The 2 inherited vars from `auth-runbook.md` §5 (`NODE_ENV`,
`NEXTAUTH_URL`, `API_URL`, `WEB_ORIGIN`) apply unchanged.

> **Always run turbo commands with `NODE_ENV=test` in the apply
> gate:** `apps/web#build` crashes when `API_URL` / `WEB_ORIGIN`
> are empty (the test fixture supplies them). Use
> `NODE_ENV=test pnpm turbo run build` and friends.

## 8. Troubleshooting

### Symptom: admin visits `/admin/users` → redirect to `/(app)`

1. Verify the actor is actually `role: "ADMIN"` in the DB:
   `SELECT role FROM "User" WHERE email = '<email>';`
2. The Middleware pre-check (`apps/web/middleware.ts`) reads the JWT
   directly. If the JWT is from before the role change (D4 cascade
   window), the user must sign out and back in to receive a fresh
   JWT with `role: "ADMIN"`.
3. Inspect `auth.role.changed` audit events for the user — confirm
   the role was actually changed.

### Symptom: `404` on every `/admin/*` API call

`ADMIN_ENABLED=false` in the API env. Unset / set to `true` and
restart the API (§4.4).

### Symptom: `403` on `/admin/*` for a user who SHOULD be admin

The JWT is stale. Have the user sign out (or revoke their session
via `auth-runbook.md` §3) and sign back in. The fresh JWT carries the
new role.

### Symptom: revoked session is still authenticating

The platform reads JWTs from cookies — if a request hits the API
with a JWT minted before the revoke, the API validates the JWT
signature + expiry (still valid for up to 24h) and lets the
request through. The session row is gone from the DB but the JWT
itself remains self-contained. To fully evict, either: (a) wait for
the JWT to expire (24h worst case per `SESSION_TTL_SECONDS`), or
(b) rotate `NEXTAUTH_SECRET` (§4.3) — every JWT becomes invalid
immediately.

### Symptom: pino log line shows `[REDACTED]` where IP should be

This is the expected behavior — pino's bracket-notation redaction
(per `pattern/pino-bracket-notation-redaction`) replaces the `ip`
key's value with `[REDACTED]` before serialization. The actual IP
is still captured in the audit row (`ipAddress` column).

## 9. Related artifacts

- `auth-runbook.md` — Module 2 sign-in surface (Gmail, Google OAuth,
  password reset, `MAIL_DSN` kill-switch, `GOOGLE_E2E_MOCK`).
- `production-foundation-runbook.md` — Module 1 baseline (free-tier,
  backups, secrets list).
- `openspec/changes/module-3-superadmin/design.md` — D1–D8 design
  decisions (admin guard, audit shape, IP+UA capture, role-change
  cascade, self-revoke UX, route group, retention).
- `openspec/changes/module-3-superadmin/tasks.md` — Phase 5
  (PR #5) tasks 5.1-5.8.
- `apps/api/src/modules/auth/admin.controller.ts` — the 5 endpoints
  (`GET /admin/users`, `POST /admin/users/:userId/role`, `GET /admin/sessions`,
  `DELETE /admin/sessions/:sessionId`, `DELETE /admin/sessions/user/:userId`).
- `apps/api/src/shared/guards/admin.guard.ts` — `AdminGuard` reads
  `env.ADMIN_ENABLED` first, then `req.user.role === 'ADMIN'`.
  401 / 403 / 404 split per threat matrix §7.
- `apps/api/src/modules/auth/admin.module.ts` — DI module wiring
  `RbacService` + `SessionService` into the controller. Skipped
  entirely when `ADMIN_ENABLED=false` (kill-switch).
- `libs/features/auth/server/src/audit.service.ts` — the
  `insertAuditEvent` pure function used by `RbacService.changeRole`
  + `SessionService.revoke`/`revokeAll`.
- `libs/features/auth/shared/schemas/admin.schemas.ts` — single
  source of truth for the 3 Zod schemas (`ListUsersQuerySchema`,
  `ChangeRoleBodySchema`, `ListSessionsQuerySchema`).
- `apps/web/middleware.ts` — locale-aware `/admin/*` pre-check
  (D1). Redirects non-admins to `/{locale}/(app)` with the
  `?admin=denied` flash.
- `apps/web/app/[locale]/(app)/admin/{layout,users/page,users/[userId]/page,sessions/page}.tsx`
  — server components; `dynamic = "force-dynamic"` so each render
  fetches fresh session + user rows.
- `apps/web/components/admin/{AdminNav,UsersTable,SessionsTable,ChangeRoleForm}.tsx`
  — 4 client components with 5 form states per AGENTS.md §9
  (loading, error, success, empty, validation-error).
- `apps/web/lib/admin-api.ts` — typed fetch wrappers for the 5
  admin endpoints + Zod re-exports from `@features/auth`.
- `apps/web/messages/{en,es}.json` — `admin.*` i18n keys (flash +
  nav + users + userDetail + sessions).
- `libs/features/auth/docs/admin-flow.feature` + `step-defs/admin.steps.ts`
  — Cucumber BDD vertical scenario (Phase 5 task 5.1 + 5.2). Walks:
  admin login → list users → change role → list sessions → revoke
  single → revoke all → non-admin redirect.
- `apps/web/e2e/auth/admin.spec.ts` — Playwright vertical spec
  (Phase 5 task 5.3 + 5.4). Mocks the 5 admin endpoints via
  `page.route()` per `pattern/playwright-per-project-webserver-not-supported`.
- `apps/web/e2e/auth/admin.a11y.spec.ts` — Playwright + axe-core
  per-surface WCAG AA audit (Phase 4 task 4.7). Zero serious /
  critical per surface.
- `Documents-es/docs/operations/admin-runbook.md` — Spanish mirror
  of this runbook.

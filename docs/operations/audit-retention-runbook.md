# Runbook — `module-4-privacy` (audit retention + IP redaction)

**Date**: 2026-07-19
**Project**: `gastos-personales-reference`
**Module**: 4 — Privacy surface (audit log UI, retention purge, IP HMAC redaction)

This runbook is the operator-facing companion to `admin-runbook.md`
(Module 3). The Module 3 runbook covers every admin action exposed by
the 5 endpoints under `/admin/*` (user listing, role change, session
revoke single, session revoke all). This runbook covers the 2 new
endpoints M4 ships under `/admin/audit` + the retention cron that
governs how long audit rows live before they're purged:

 - `GET  /admin/audit` — filtered, paginated audit-log read
 - `POST /admin/audit/purge` — dual-mode retention purge (dry-run +
   real)

It also covers the IP HMAC redaction that lands at the audit
controller boundary (carry-forward from M3 F4 pino redaction but
extended to the `AdminAuditEvent.ipAddress` column itself), and the
local-dev / staging prerequisites specific to the retention env vars.

The companion piece is `docs/operations/admin-runbook.md` (Module 3)
which covers `/admin/users`, `/admin/sessions`, and the role-change
endpoints. Read that first if you need to provision admin actors or
revoke sessions; this runbook assumes you already have an `ADMIN`
session.

## 1. Operator prerequisites

All secret values live in the `staging` GitHub Actions environment
(per `production-foundation-runbook.md` §9) and the production
environment. Local devs edit `apps/web/.env.test` (committed,
runtime-gated) and `apps/api/.env.test`; NEVER commit a real
`NEXTAUTH_SECRET` or an `AUDIT_RETENTION_DAYS=0` override in
production (that disables the retention cron — see §3.3 for why
this is a kill-switch, not a "purge everything now" command).

To run any `/admin/audit*` endpoint you must already have an
`ADMIN`-role session. See `admin-runbook.md` §1 for provisioning.

## 2. The audit log surface

### 2.1 Reading the audit log — `GET /admin/audit`

The endpoint returns the `AdminAuditEvent` rows the platform has
written since launch, optionally filtered by `actorId`, `targetId`,
`action`, `since`, `until`, and paginated by `limit` (≤ 200, default
50) + `offset` (default 0). The query string is parsed by
`ListAuditQuerySchema` (Zod) so an unknown `action=INVALID` value
returns 400 before any DB call — protects the audit table from a
bad query plan. The response shape is the spec-literal 8-field
projection:

```ts
interface AdminAuditEventResponse {
  readonly id: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly action: "REVOKE_SESSION" | "REVOKE_ALL_SESSIONS" | "CHANGE_ROLE";
  readonly createdAt: string;        // ISO 8601
  readonly metadata: unknown;        // { sessionId } | { count } | { from, to } etc.
  readonly ipAddress: string | null; // HMAC-SHA256 hex (64 chars) — see §4
  readonly userAgent: string | null; // ≤ 512 chars
}
```

**Operator examples.**

```bash
# Last 50 audit rows (no filters)
curl -sS -b authjs.session-token="$ADMIN_JWT" \
  "$API_URL/admin/audit?limit=50&offset=0"

# All role changes in the last 7 days
curl -sS -b authjs.session-token="$ADMIN_JWT" \
  "$API_URL/admin/audit?action=CHANGE_ROLE&since=$(date -u -d '7 days ago' +%FT%TZ)"

# Every action a specific admin performed
curl -sS -b authjs.session-token="$ADMIN_JWT" \
  "$API_URL/admin/audit?actorId=$ADMIN_USER_ID&limit=200"
```

The platform's web UI surfaces this same endpoint under
`/{locale}/admin/audit` (PR #3 task 3.4 GREEN). Operators without
curl access can use the UI directly.

### 2.2 Audit row write paths

Every audit row is written by one of 3 service methods, each
called from the existing M3 admin controller actions:

| Action | Source | Triggered by |
| --- | --- | --- |
| `REVOKE_SESSION` | `SessionService.revoke` | `DELETE /admin/sessions/:sessionId` |
| `REVOKE_ALL_SESSIONS` | `SessionService.revokeAll` | `DELETE /admin/sessions/user/:userId` |
| `CHANGE_ROLE` | `RbacService.changeRole` | `POST /admin/users/:userId/role` |

The IP + UA capture happens at the HTTP boundary (controller D3);
the row insertion happens inside the service via
`AuditService.insertAuditEvent` (M3 PR #2 task 2.5 — refactored in
M4 to share the new `hashIpForAudit` helper).

## 3. Retention — `POST /admin/audit/purge`

The retention policy is encoded in 2 env vars
(`AUDIT_RETENTION_DAYS` + `AUDIT_RETENTION_ENABLED`) — both parsed
at boot via `env.schema.ts` (M4 PR #1 task 1.4 GREEN) so a
misconfiguration crashes the API before any purge runs.

### 3.1 Dry-run vs real — the dual-mode contract

The endpoint takes `{ dryRun: bool, olderThanDays: number }` and
returns one of two shapes:

| `dryRun` | Response shape | Effect |
| --- | --- | --- |
| `true`  | `{ matched, wouldDelete }` | No rows touched; query the count |
| `false` | `{ matched, deleted }`     | Atomic `deleteMany` (Postgres MVCC all-or-none) |

A successful real purge returns `matched === deleted` (atomicity is
on a single `deleteMany` call regardless of match count). The
second call with the same `olderThanDays` returns
`{ matched: 0, deleted: 0 }` — the operation is idempotent (the
first call already removed every eligible row).

### 3.2 Manual purge invocation

```bash
# Dry-run — count what WOULD be deleted without touching anything
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "olderThanDays": 90}' \
  "$API_URL/admin/audit/purge"
# → {"matched": 1284, "wouldDelete": 1284}

# Real purge — atomic deleteMany
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false, "olderThanDays": 90}' \
  "$API_URL/admin/audit/purge"
# → {"matched": 1284, "deleted": 1284}
```

The `olderThanDays` field is `int ≥ 1` (Zod `min(1)`) — there is no
"purge everything older than 0 days" path because that would
silently delete the operator's own session-revoke row. Operators who
want to purge everything must delete the table via a separate
migration, NOT through this endpoint.

### 3.3 The retention env contract

| Variable | Default | Range | Effect |
| --- | --- | --- | --- |
| `AUDIT_RETENTION_DAYS` | `90` | `int ≥ 0` | Days before auto-purge kicks in |
| `AUDIT_RETENTION_ENABLED` | `false` | `bool` | Whether the 03:00 cron runs |

The cron itself lives at
`libs/features/auth/server/src/audit-retention.cron.ts` (the
decorator-free handler) + `apps/api/src/modules/auth/audit-retention.schedule.ts`
(the `AuditRetentionSchedule` class with the `@Cron('0 3 * * *')`
decorator). The schedule is registered in `AdminModule` ONLY when
`AUDIT_RETENTION_ENABLED=true` (M4 PR #2 task 2.10 GREEN).

**`AUDIT_RETENTION_DAYS=0` is a KILL-SWITCH, not "purge everything
now."** Setting the value to 0 means the cron computes the cutoff as
"everything older than the unix epoch" — which IS all rows — but
Zod's `min(0)` accepts it because the cron handler filters
`olderThanDays <= 0` as a no-op (skips the call to `purgeOlderThan`).
The operator who wants to mass-purge must use the manual endpoint,
not the cron.

To schedule a one-shot mass purge:

```bash
# 1. Verify the dry-run count first
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "olderThanDays": 30}' \
  "$API_URL/admin/audit/purge"

# 2. If the count is what you expect, run the real purge
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false, "olderThanDays": 30}' \
  "$API_URL/admin/audit/purge"

# 3. Verify — the second call should return 0
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "olderThanDays": 30}' \
  "$API_URL/admin/audit/purge"
```

## 4. IP HMAC redaction (PII)

The `AdminAuditEvent.ipAddress` column stores the IPv4/IPv6 address
the admin used at the moment they took the action — but NEVER in
plaintext. The column holds a 64-character lowercase hex string that
is the HMAC-SHA256 of the raw IP keyed by `env.NEXTAUTH_SECRET`:

```ts
// libs/features/auth/server/src/audit.service.ts
import { createHmac } from "node:crypto";
export function hashIpForAudit(rawIp: string): string {
  return createHmac("sha256", env.NEXTAUTH_SECRET)
    .update(rawIp)
    .digest("hex");
}
```

The HMAC has two properties the platform relies on:

1. **Deterministic.** Every raw IP maps to exactly one hex string,
   so the operator can answer forensic queries like "did this IP
   perform a role change on March 14?" by re-hashing the candidate
   IP and searching for that hex. The raw IP is never stored and
   never leaves the audit row.
2. **Non-reversible without the secret.** The HMAC is one-way for an
   attacker who exfiltrates the `AdminAuditEvent` table without
   `NEXTAUTH_SECRET`. Rotating the secret (per `admin-runbook.md`
   §4.3) invalidates the link between old hexes and old IPs.

The pino redact path (`pattern/pino-bracket-notation-redaction`,
carried from M3 F4) is independent of the column-level HMAC. It
substitutes `[REDACTED]` for the `ip` key in structured log lines
BEFORE serialization, so the IP never lands in log aggregation
either. The two mechanisms together give the operator:

| Where | What | PII risk |
| --- | --- | --- |
| Audit row `ipAddress` column | HMAC hex | Forensic via re-hash; raw not exposed |
| Pino structured log lines | `[REDACTED]` | Never present |
| GET /admin/audit response | HMAC hex | Forensic via re-hash; raw not exposed |
| GET /admin/sessions response | Raw IP | Carry-forward M3; M4 keeps the M3 contract |

**M3 carry-forward note.** The M3 spec shipped `ipAddress` as a raw
IP string in the sessions listing response (per the
`admin-runbook.md` §3 pin). M4 does NOT migrate that to HMAC —
that is out of scope. The audit-log redaction is the targeted
change; sessions still ship raw IP per the M3 contract.

## 5. Retention policy rationale

The 90-day default (`AUDIT_RETENTION_DAYS=90`) is the minimum that
satisfies two constraints:

1. **Forensic window for active investigations.** GDPR-style
   breach investigations typically take 30-60 days from incident
   detection to formal review. A 90-day retention guarantees the
   audit row is still on disk when the formal review starts.
2. **Storage budget on a free-tier Postgres instance.** Per the
   Module 1 baseline (`production-foundation-runbook.md` §3),
   `gastos-personales-reference` runs on a free-tier Postgres
   with a 1 GB cap. Each `AdminAuditEvent` row is ~1 KB
   (metadata + 64-char HMAC + truncated UA). 90 days at ~10
   audit events/day = ~900 KB total — leaves headroom for the
   User + Session + Transaction tables.

Operators who need longer retention (e.g. for a regulated
workload) should bump `AUDIT_RETENTION_DAYS` to 365 + provision
additional Postgres storage. The cron schedule stays at
`@Cron('0 3 * * *')` UTC regardless of retention length.

## 6. The retention cron

The cron is the `@Cron('0 3 * * *')` decorator on the
`AuditRetentionSchedule` class in
`apps/api/src/modules/auth/audit-retention.schedule.ts` and is
registered only when `AUDIT_RETENTION_ENABLED=true`. The 03:00 UTC
slot keeps retention ops out of operator shift windows in NA + EU.
The handler is intentionally split into a decorator-free
`audit-retention.cron.ts` in the auth feature library + a
`AuditRetentionSchedule` shell in `apps/api/` to keep the
`experimentalDecorators` requirement isolated to the API tsconfig
(per `D-M4-4` deviation).

To verify the cron is wired in production:

```bash
# After deploy, check the API logs for the AuditRetentionSchedule
# class name (the NestJS Logger prefixes every line with the class
# name, so a grep on the class name is a stable operator signal).
flyctl logs --app gastos-api | grep "AuditRetentionSchedule"
# → {"level":"info","time":"...","msg":"[AuditRetentionSchedule] ..."
```

To disable retention entirely (e.g. for a long-running
investigation that needs the table frozen):

```bash
# Fly.io
flyctl secrets set AUDIT_RETENTION_ENABLED=false -a gastos-api

# Render
render env set AUDIT_RETENTION_ENABLED=false --service gastos-api
```

Re-enable the same way (`AUDIT_RETENTION_ENABLED=true`) + restart
the API process.

## 7. Local dev prerequisites

The repo's `apps/web/.env.test` and `apps/api/.env.test` (committed)
contain a complete fixture set so `NODE_ENV=test pnpm dev` boots out
of the box. The following vars drive the audit retention surface
specifically:

| Variable | Dev default | Production required | Notes |
| --- | --- | --- | --- |
| `AUDIT_RETENTION_DAYS` | `90` | `90` (or per §5) | M4 task 1.4 — `int ≥ 0`, default 90 |
| `AUDIT_RETENTION_ENABLED` | `false` | `true` | M4 task 1.4 — `bool`, default false (kill-switch) |
| `NEXTAUTH_SECRET` | test fixture | from secret store | Used as the HMAC key in §4 — rotate per `admin-runbook.md` §4.3 |

The 2 inherited vars from `auth-runbook.md` §5 + 2 from
`admin-runbook.md` §7 (`NODE_ENV`, `NEXTAUTH_URL`, `API_URL`,
`WEB_ORIGIN`) apply unchanged.

> **Always run turbo commands with `NODE_ENV=test` in the apply
> gate:** `apps/web#build` crashes when `API_URL` / `WEB_ORIGIN`
> are empty (the test fixture supplies them). Use
> `NODE_ENV=test pnpm turbo run build` and friends.

## 8. Troubleshooting

### Symptom: `GET /admin/audit` returns 400 with `error: "INVALID_QUERY"`

A filter value failed Zod. The most common offenders:

 - `action=GOD` — `action` must be one of `REVOKE_SESSION`,
   `REVOKE_ALL_SESSIONS`, `CHANGE_ROLE`.
 - `limit=999` — `limit` is `int 1..200`; the schema REJECTS (not
   silently clamps) values > 200, so a UI bug that sends `limit=1000`
   surfaces as a 400 instead of an unannounced cap.
 - `since=not-a-date` — `since` / `until` are coerced via
   `z.coerce.date()`. Invalid strings return 400.

### Symptom: `POST /admin/audit/purge` returns 200 with `deleted: 0`

This is the expected idempotent path — a previous call with the same
`olderThanDays` already removed every eligible row. To verify:

```bash
# Get a fresh row count
curl -sS -b authjs.session-token="$ADMIN_JWT" "$API_URL/admin/audit?limit=1"
# Then run a dry-run with a tiny window
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "olderThanDays": 1}' \
  "$API_URL/admin/audit/purge"
# If matched is 0, you're already up-to-date.
```

### Symptom: `ipAddress` column shows 64 hex chars but the operator wants to trace back to a user

Use the `hashIpForAudit` helper directly to re-derive the hex from a
candidate raw IP. The platform does not ship a CLI for this; use a
short Node script:

```bash
node -e "
const { createHmac } = require('node:crypto');
const hex = createHmac('sha256', process.env.NEXTAUTH_SECRET)
  .update('203.0.113.42')
  .digest('hex');
console.log(hex);
"
# Then search the audit table for that hex:
# SELECT * FROM admin_audit_event WHERE ip_address = '<hex>';
```

### Symptom: cron fires but `deleted` count is suspiciously always 0

`AUDIT_RETENTION_DAYS=0` is the kill-switch — the cron handler
treats `olderThanDays <= 0` as a no-op (per §3.3). Set the value
to a positive integer to enable the auto-purge.

## 9. Related artifacts

- `auth-runbook.md` — Module 2 sign-in surface (Gmail, Google OAuth,
  password reset, `MAIL_DSN` kill-switch, `GOOGLE_E2E_MOCK`).
- `admin-runbook.md` — Module 3 admin surface (5 endpoints under
  `/admin/*`, role assignment, session revoke, kill-switch via
  `ADMIN_ENABLED=false`).
- `production-foundation-runbook.md` — Module 1 baseline (free-tier,
  backups, secrets list).
- `openspec/changes/module-4-privacy/design.md` — D1–D8 design
  decisions (Session.lastActiveAt coalesce, cron pattern, audit
  filter shape, purge dual-mode, route placement, IP HMAC,
  session projection deprecation, retention env contract).
- `openspec/changes/module-4-privacy/tasks.md` — Phase 4 (PR #4)
  tasks 4.1-4.8 (BDD + runbook + final gate).
- `apps/api/src/modules/auth/admin.controller.ts` — the 2 new
  endpoints (`GET /admin/audit`, `POST /admin/audit/purge`) +
  the 5 M3 endpoints carried forward.
- `apps/api/src/modules/auth/audit-retention.schedule.ts` — the
  `AuditRetentionSchedule` class with the `@Cron('0 3 * * *')`
  decorator that wires the handler into NestJS's ScheduleModule.
- `libs/features/auth/server/src/audit-retention.cron.ts` — the
  decorator-free handler invoked by the schedule + the manual
  endpoint (per `D-M4-4` deviation).
- `libs/features/auth/server/src/audit.service.ts` — the
  `findMany`, `countOlderThan`, `purgeOlderThan` + `insertAuditEvent`
  + `hashIpForAudit` helpers.
- `libs/features/auth/shared/schemas/audit.schemas.ts` —
  `AuditActionEnum` + `ListAuditQuerySchema` + `PurgeAuditBodySchema`.
- `apps/web/app/[locale]/(app)/admin/audit/page.tsx` — server
  component composing `AdminNav` + `AuditLogTable` + `AuditRetentionButton`
  (M4 PR #3 task 3.4 GREEN).
- `apps/web/components/admin/AuditLogTable.tsx` — client component
  with 7 spec-literal columns + 5 form states per AGENTS.md §9.
- `apps/web/components/admin/AuditRetentionButton.tsx` — client
  component with dry-run button + confirm-dialog real purge.
- `apps/web/lib/audit-api.ts` — typed fetch wrappers for the 2
  admin audit endpoints + Zod re-exports from `@features/auth`.
- `apps/web/messages/{en,es}.json` — `admin.audit.*` i18n keys
  (title, filters, columns, dryRun, purge, confirm, errors).
- `libs/features/auth/docs/audit-flow.feature` +
  `step-defs/audit.steps.ts` — Cucumber BDD vertical scenario
  (Phase 4 task 4.1 + 4.2). Walks: admin login → list audit →
  filter by actorId → see own REVOKE_SESSION → dry-run purge
  (olderThanDays=1) → real purge (olderThanDays=90) → verify
  deletion.
- `apps/web/e2e/auth/audit.spec.ts` — Playwright vertical spec
  (Phase 4 task 4.3 + 4.4). Mocks the 2 admin audit endpoints
  via `page.route()` per
  `pattern/playwright-per-project-webserver-not-supported`.
- `apps/web/e2e/auth/audit.a11y.spec.ts` — Playwright + axe-core
  per-surface WCAG AA audit (Phase 3 task 3.8). Zero serious /
  critical per surface.
- `Documents-es/docs/operations/audit-retention-runbook.md` —
  Spanish mirror of this runbook.

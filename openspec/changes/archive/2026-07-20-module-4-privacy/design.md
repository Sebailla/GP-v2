# Design: `module-4-privacy`

Tracker `feat/privacy` from `develop@da79688`. 4 chained PRs (≤400 LOC/PR), strict TDD, vertical slices. Additive only — no breaking changes. Carries forward M2/M3 patterns (pino `[ip]` redaction, JWT decode try/catch, overrideProvider, Playwright split, next-intl alias, `pattern/ratelimit-test-isolation`, `NODE_ENV=test`).

## 1. Technical Approach

M4 ships the M3-deferred privacy surface. Server adds `Session.lastActiveAt` (nullable + index) and a 60s coalesced write on `SessionService.validateSession` (D1); `SessionService.list()` swaps the M3 `expires DESC` proxy for `lastActiveAt DESC` (D7) and the admin controller projection drops `sessionToken` for the 6-field spec-literal shape. New `AuditService.findMany` (D3) + `countOlderThan` + `purgeOlderThan` + a `@nestjs/schedule` cron at 03:00 gated by `AUDIT_RETENTION_ENABLED` (D2) reads `AUDIT_RETENTION_DAYS` (D8, default 90, `0` = kill-switch). New `GET /admin/audit` + `POST /admin/audit/purge` (D4) extend `AdminController`. Web adds `/[locale]/(app)/admin/audit/` with `AuditLogTable`, filter bar, retention button, EN/ES messages, axe-clean, and the existing `(app)` admin layout (D5) + `middleware.ts` admin guard carry forward. 4 chained PRs per the proposal: schema + lastActiveAt (PR1), audit API + retention (PR2), UI + BDD + e2e (PR3), runbook + Spanish mirror (PR4).

## 2. Architecture Decisions

| # | Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|---|
| **D1** | `Session.lastActiveAt` write coalesce | DB-level conditional `prisma.session.update({ where: { id, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }] }, data: { lastActiveAt: now } })`; row count `0` ⇒ coalesce hit | In-memory per-worker throttle (locks shared state, doesn't survive restart); naive `update` (writes per request); read-then-write race | Postgres OR-in-where is atomic; no shared state; survives restart + scales across workers. Write amplification bounded at 1 update / 60s / session even with N concurrent workers. |
| **D2** | Retention cron pattern | `@Cron('0 3 * * *')` in `AuditRetentionModule` reads `AUDIT_RETENTION_DAYS` and calls `auditService.purgeOlderThan(days)`; gated by `AUDIT_RETENTION_ENABLED=false` in dev/test | External cron (out of repo); `setInterval` (not testable); hourly cron | `@nestjs/schedule` is canonical, testable via `ScheduleModule.forRoot()` in NestJS test harness. 03:00 UTC keeps retention ops out of operator shift windows. Gating flag honors dev/test repeatability (AGENTS.md §10). |
| **D3** | Audit query filter shape | `?actorId=&targetId=&action=&since=&until=&limit=&offset=` (all optional, `limit` clamped 1-200 default 50, `offset` ≥ 0 default 0); Prisma `where` builds dynamically | One fixed filter set; GraphQL; raw SQL | 1-to-1 mapping to spec scenarios. Prisma parameterized → no SQL injection. Dynamic `where` only adds present filters → smaller plan, no `null = null` predicate. |
| **D4** | Purge endpoint dual-mode | `POST /admin/audit/purge` with `{ dryRun: bool, olderThanDays: number }`; controller delegates to `auditService.countOlderThan` (dry) or `purgeOlderThan` (real) | Two endpoints (`/purge-preview` + `/purge-real`); separate admin action surface | Spec mandates a single contract; dry-run is a query, real is a delete — same auth/rate-limit envelope, same `ADMIN_RATE_LIMIT` bucket. Single endpoint reduces surface area. |
| **D5** | Audit log UI route placement | `/[locale]/(app)/admin/audit/page.tsx` server component + optional `audit/[id]/page.tsx` row detail; inherits `(app)/admin/layout.tsx` server-side guard (already in place) | Standalone `(admin)` group; client-only route | The `(app)/admin` layout's `getSession()` check + role guard (M3 D1) is defense-in-depth; `middleware.ts` short-circuits unauthenticated/non-admin before HTML. Reusing the group eliminates duplicated layout + nav work. |
| **D6** | IP redaction in audit responses | Controller maps `ipAddress` → 64-char lowercase HMAC-SHA256 hex (per M3 F4 via `hashIpForAudit`); UI never receives raw IP. Forensic re-derivation: re-hash candidate IP with `env.JWT_SECRET` server-side | Plaintext IP in admin response; one-way SHA256 (irreversible) | Spec literal: "HMAC hex, NOT raw IP". HMAC keeps determinism → forensic queries (`WHERE ipAddress = hashIpForAudit('1.2.3.4')`) still work without exposing raw IP to UI even for admins (PII protection). |
| **D7** | Session projection deprecation | M3 `{ id, userId, sessionToken, expires }` → spec-literal `{ id, userId, createdAt, lastActiveAt, userAgent, ipAddress }`. `sessionToken` no longer in admin response | Add `createdAt`/`lastActiveAt`/`ipAddress` alongside M3 fields; new `/v2` endpoint | Spec mandates exactly 6 fields. `sessionToken` is internal-only (cookie carries it; admin never needs it). UA truncation to 512 chars + IP as HMAC enforced at the controller projection. |
| **D8** | Audit retention env contract | `AUDIT_RETENTION_DAYS: z.coerce.number().int().min(0).default(90).optional()` + `AUDIT_RETENTION_ENABLED: z.coerce.boolean().default(false).optional()` | Hardcoded 90; per-tenant config; DB-backed config table | `0` = kill-switch (no auto-purge, operator runs manually). `default(90)` keeps dev/test ergonomic. Zod `min(0)` rejects negatives at boot. Coerce handles string-from-env. |

## 3. Data Flow

### 3.1 Admin Lists Audit Events with Filters

```
Browser (role=ADMIN)         AdminController (ADMIN + RateLimit)        AuditService             Postgres
       │                            │                                       │                       │
       ├──GET /admin/audit?         │                                       │                       │
       │  actorId=X&                │                                       │                       │
       │  action=REVOKE_SESSION─────►│                                       │                       │
       │                             ├──build Prisma where (only present)    │                       │
       │                             ├──prisma.adminAuditEvent.findMany({   │                       │
       │                             │   where, orderBy:{createdAt:desc},   │                       │
       │                             │   take:limit, skip:offset })─────────┼──────────────────────►│
       │                             │◄──────────── rows (HMAC ip) ──────────┼───────────────────────┤
       │                             ├──map to spec-literal projection      │                       │
       │                             │  (no raw IP — HMAC only)              │                       │
       │◄──── 200 JSON [...] ────────┤                                       │                       │
```

### 3.2 Session.lastActiveAt Coalesce on validateSession

```
Browser → JwtAuthGuard → controller → SessionService.validateSession(token)
                                            │
                                            ├──sessionRepo.findByToken → Session
                                            ├──session expired? → AuthError('SESSION_EXPIRED')
                                            ├──userRepo.findById(session.userId)
                                            │
                                            ├──cutoff = now - 60_000
                                            ├──await prisma.session.update({
                                            │    where: { id, OR: [
                                            │      { lastActiveAt: null },
                                            │      { lastActiveAt: { lt: cutoff } }
                                            │    ]},
                                            │    data: { lastActiveAt: now }
                                            │  })
                                            │  → count=0: coalesce (someone else won, or fresh)
                                            │  → count=1: write succeeded
                                            │
                                            ├──return CurrentUser (unchanged regardless)
```

## 4. File Changes

| File | Action | Description |
|---|---|---|
| `libs/core/database/prisma/schema.prisma` | Modify | Add `Session.lastActiveAt DateTime?` + `@@index([lastActiveAt])` |
| `libs/core/database/prisma/migrations/<ts>_session_last_active_at/` | Create | Prisma migration: nullable column + index |
| `libs/core/config/env.schema.ts` | Modify | Add `AUDIT_RETENTION_DAYS` + `AUDIT_RETENTION_ENABLED` (D8) |
| `libs/features/auth/server/src/session-service.ts` | Modify | Coalesce-write on `getCurrentUser` (D1); `list()` ORDER BY `lastActiveAt DESC`; 6-field projection (D7) |
| `libs/features/auth/server/src/audit.service.ts` | Modify | Add `findMany` (D3), `countOlderThan`, `purgeOlderThan` (D4) |
| `libs/features/auth/server/src/audit-retention.cron.ts` | Create | `@Cron('0 3 * * *')`; reads env; calls `purgeOlderThan`; gated (D2) |
| `libs/features/auth/shared/schemas/audit.schemas.ts` | Create | `AuditActionEnum`, `ListAuditQuerySchema`, `PurgeAuditBodySchema` |
| `libs/features/auth/shared/schemas/index.ts` | Modify | Export audit schemas |
| `apps/api/src/modules/auth/admin.controller.ts` | Modify | `GET /admin/audit` + `POST /admin/audit/purge` (D4); `listSessions` projection swap (D7) |
| `apps/api/src/modules/auth/admin.module.ts` | Modify | Wire `audit-retention.cron.ts` if `AUDIT_RETENTION_ENABLED === true` |
| `apps/api/.env.example` | Modify | `AUDIT_RETENTION_DAYS=90` + `AUDIT_RETENTION_ENABLED=false` |
| `apps/api/test/audit.controller.test.ts` | Create | Vitest: 2 endpoints × happy + edge + 403 non-admin + rate-limit isolation |
| `apps/api/test/audit-retention.test.ts` | Create | Vitest: `countOlderThan` + `purgeOlderThan` idempotent + atomic |
| `libs/features/auth/server/src/__tests__/session-service.last-active-at.test.ts` | Create | Unit: coalesce on `getCurrentUser` |
| `libs/features/auth/server/src/__tests__/audit-service.find-many.test.ts` | Create | Unit: filter combinations + pagination + cap |
| `apps/web/app/[locale]/(app)/admin/audit/page.tsx` | Create | Server component: calls `GET /admin/audit` with searchParams; renders `AuditLogTable` |
| `apps/web/app/[locale]/(app)/admin/audit/[id]/page.tsx` | Create | Row detail (full metadata JSON) |
| `apps/web/components/admin/AuditLogTable.tsx` | Create | Client: 5 form states (loading/error/success/empty/validation-error) per AGENTS.md §9 |
| `apps/web/components/admin/AuditFilterBar.tsx` | Create | Client: actorId/targetId/action select/since/until + pagination |
| `apps/web/components/admin/AuditRetentionButton.tsx` | Create | Client: dry-run + real purge with confirm dialog |
| `apps/web/components/admin/AdminNav.tsx` | Modify | Add "Audit log" link |
| `apps/web/lib/audit-api.ts` | Create | `listAdminAuditEvents`, `dryRunPurgeAuditEvents`, `purgeAuditEvents`; mirrors `admin-api.ts` |
| `apps/web/messages/{en,es}.json` | Modify | `admin.audit.*` keys (title, filters, columns, dryRun, purge, confirm, errors) |
| `apps/web/e2e/auth/audit.spec.ts` | Create | Playwright + en + es projects; `page.route()` mocks 2 endpoints |
| `apps/web/e2e/auth/audit.a11y.spec.ts` | Create | `@axe-core/playwright` per surface; assert 0 serious/critical |
| `libs/features/auth/docs/audit-flow.feature` | Create | BDD: list w/ filters, dry-run purge, real purge, retention env defaults |
| `libs/features/auth/docs/step-defs/audit.steps.ts` | Create | Step defs |
| `docs/operations/audit-retention-runbook.md` | Create | Runbook: dry-run vs real, IP redaction, retention rationale, M3 carry-forward |
| `Documents-es/docs/operations/audit-retention-runbook.md` | Create | Spanish mirror |
| `Documents-es/openspec/changes/module-4-privacy/design.md` | Create | Spanish mirror of this file |

## 5. Interfaces / Contracts

```ts
// libs/features/auth/shared/schemas/audit.schemas.ts
export const AuditActionEnum = z.enum(["REVOKE_SESSION", "REVOKE_ALL_SESSIONS", "CHANGE_ROLE"]);

export const ListAuditQuerySchema = z.object({
  actorId: z.string().uuid().optional(),
  targetId: z.string().uuid().optional(),
  action: AuditActionEnum.optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const PurgeAuditBodySchema = z.object({
  dryRun: z.coerce.boolean(),
  olderThanDays: z.coerce.number().int().min(1),
});
```

HTTP contract:

```
GET  /admin/audit?actorId=&targetId=&action=&since=&until=&limit=50&offset=0
     → 200 [{id, actorId, targetId, action, createdAt, metadata, ipAddress, userAgent}]
     → 400 invalid query (e.g. action=invalid); 403 non-admin; 401 unauth

POST /admin/audit/purge  body: { dryRun: bool, olderThanDays: number }
     → 200 { matched, [wouldDelete | deleted] }  (key depends on dryRun)
     → 400 invalid body; 403 non-admin; 500 DB error (deleteMany atomicity)
```

## 6. Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `SessionService` coalesce | Vitest; in-memory Prisma mock; assert 1 write / 60s window / session |
| Unit | `SessionService.list` projection | Vitest; assert 6-field spec-literal + `lastActiveAt DESC` |
| Unit | `AuditService.findMany` filters | Vitest; 8 filter combos |
| Unit | `AuditService.purgeOlderThan` atomicity | Vitest; `deleteMany` mock; idempotent on second call |
| Integration | `GET /admin/audit` w/ filters | Vitest NestJS e2e + supertest |
| Integration | `POST /admin/audit/purge` dry + real | Vitest; `overrideProvider(RATE_LIMITER_TOKEN).useValue(InMemoryRateLimiter)` per `pattern/ratelimit-test-isolation` |
| Integration | `AUDIT_RETENTION_DAYS` env boundary | Vitest: 5 permutations (unset/0/30/-1/abc) |
| Integration | `Session.lastActiveAt` migration | Vitest; assert column + index |
| E2E web | audit page render + filter | Playwright en + es; `page.route()` mocks |
| E2E web | axe-core | `@axe-core/playwright`; 0 serious/critical |
| BDD | audit scenarios | Cucumber `audit-flow.feature` + step-defs |
| Cron | `@Cron('0 3 * * *')` firing | Vitest NestJS e2e with `ScheduleModule.forRoot()` |

## 7. Threat Matrix

| Boundary | Min adversarial cases | Applicability | Design response | Planned RED tests |
|---|---|---|---|---|
| Routing (admin audit) | foreign actor; non-admin; expired JWT; missing filter | Applicable | `JwtAuthGuard + AdminGuard + RateLimitGuard`; 401/403/400 split | Vitest e2e: 401 + 403 + 400 |
| Configuration (`AUDIT_RETENTION_DAYS`) | unset; `0`; `-1`; `abc`; `99999` | Applicable | Zod at boot; defaults; `0`=kill-switch; `min(0)` rejects negatives | Vitest boundary: 5 perms |
| PII (`ipAddress` display) | raw IP never in response; HMAC always | Applicable | Controller maps HMAC via `hashIpForAudit`; pino `[ip]` redact (carried from M3 F4) | Vitest: response `ipAddress` matches 64-char hex pattern, not raw |
| Retention (destructive) | double-purge idempotency; partial failure; race with reads | Applicable | `deleteMany` atomic; cron + endpoint share same fn | Vitest: idempotent + atomicity + concurrent-reader |
| Shell/process | N/A — no subprocess | N/A | None | None |
| VCS/PR | N/A — no automation | N/A | None | None |

## 8. Migration / Rollout

No DB schema BREAKING changes. `Session.lastActiveAt` is nullable (no backfill). New audit endpoint is additive. Retention cron is OPT-IN (`AUDIT_RETENTION_ENABLED=false` in dev/test). Rollback: drop the 2 env vars + revert the cron; existing audit rows preserved. Each chained PR is atomic (AGENTS.md §5) and keeps `develop` green.

## 9. Open Questions

None. All product decisions resolved in the proposal's `## Product decisions` section (audit log UI + retention + `Session.lastActiveAt`).

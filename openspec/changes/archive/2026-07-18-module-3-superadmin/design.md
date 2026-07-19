# Design: `module-3-superadmin`

Tracker `feat/superadmin` from `develop@03e252d`. 5 chained PRs (≤400 LOC/PR), strict TDD, vertical slices. Aditive only — no breaking changes. Carries forward M2 patterns (pino `[ip]`/`[email]`, JWT decode try/catch, overrideProvider, Playwright split, next-intl alias).

## 1. Technical Approach

M3 ships an admin surface over M2's session+RBAC primitives. Server extends `SessionService` (`list`/`revoke`/`revokeAll`) and `RbacService` (`listUsers`/`changeRole`/`assertAdmin`); adds the `AdminAuditEvent` table (append-only) and `Session.metadata` column (JSON, nullable). API adds a new `AdminController` (5 endpoints under `/admin/*`) guarded by `JwtAuthGuard + AdminGuard`. Web adds `/[locale]/(app)/admin/{users,sessions}/` route group, with `apps/web/middleware.ts` extended to short-circuit `/admin/*` non-admins to `/{locale}/(app)`. 5 chained PRs as the proposal lays out: schema+migration, service methods + audit event, controller + guards, web pages + middleware, BDD+e2e+runbook.

## 2. Architecture Decisions

| # | Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|---|
| **D1** | Admin guard pattern | NestJS: `@UseGuards(JwtAuthGuard, AdminGuard)` per-method; Web: `middleware.ts` pre-check on `path.startsWith(\`/\${locale}/admin\`)` | Single Next.js layout guard only; client-only redirect | Server is authority (per M2 R-PF-3); client short-circuits flash-of-admin UI for UX. Both layers required by `nextauth-web-routes.spec.md` Admin Route Guard. |
| **D2** | Audit event shape | Separate `AdminAuditEvent` table | Add audit columns to `Session`; append to `AuditLog` | Audit spans role changes (not session-scoped); retention policy differs (M4 Privacy); write pattern is append-only with no FK to session lifecycle. Reusing the transactions `AuditLog` would entangle M3's PII field contract with M5's entity-typed audit. |
| **D3** | IP + UA capture point | Controller entry — `req.ip` + `req.headers['user-agent']` BEFORE service call | Service layer; NestJS interceptor | Services stay HTTP-agnostic. Audit must record the actual request that triggered the action. `req.ip` respects Express `trust proxy` config; UA truncated to 512 chars at the controller boundary. |
| **D4** | Role-change cascade | Target's existing JWT stays valid until refresh; web re-fetches role on every page render via `getSession()` | Server-side session store + JWT invalidation; client cache invalidation broadcast | Simple, no server-side store required, audit captures the change. Worst-case 24h window (matches M2 SESSION_TTL_SECONDS). NextAuth v5 already re-reads `role` from JWT per request on the API side (per M2 `jwt.guard.ts#toCurrentUser`). |
| **D5** | Self-revoke UX | Allow admin to revoke own session; server returns 204 + `Set-Cookie` clearing the token; client confirms via dialog before calling endpoint | Forbid self-revoke (UI hides button); allow without confirmation | Standard "logout from this device" UX. Lockout risk mitigated — admin can log in via Google or email/password (per M2). Client-side confirmation prevents accidental self-lockout from the admin UI. |
| **D6** | Admin route group placement | `/[locale]/(app)/admin/*` (route group under existing `(app)`) | Top-level `/admin/*` outside `(app)`; separate `(admin)` group | `(app)` layout already enforces `getSession() != null` (per `apps/web/app/[locale]/(app)/layout.tsx`). Reusing it eliminates duplicated auth logic. The `(app)` parent already provides the locale segment via `params`. |
| **D7** | Audit retention | No automated purge in M3; add `@@index([createdAt])`; document follow-up | Hourly cron purging >90d; no index | Retention policy is M4 Privacy scope. Index supports the eventual purge query. M3 ships the table + index only; no job. Documented in runbook as a follow-up to avoid scope creep. |

## 3. Data Flow

### 3.1 Admin Lists User Sessions

```
Browser (role=ADMIN)         apps/web/middleware.ts       AdminController (ADMIN guard)        SessionService          Postgres
       │                            │                              │                              │                      │
       ├──GET /en/admin/sessions────►│                              │                              │                      │
       │  ?userId=<uuid>             ├──auth().user.role==ADMIN     │                              │                      │
       │                             │  (continue)                   │                              │                      │
       │                             ├──locale=es──────────────────►│                              │                      │
       │                             │  (forward)                    │                              │                      │
       │                             │                              ├──controller.listSessions      │                      │
       │                             │                              │  (userId, ip, ua)            │                      │
       │                             │                              ├──auditRevokeNone-required    │                      │
       │                             │                              │  (no audit for GET)           │                      │
       │                             │                              ├──SELECT * FROM sessions──────┼─────────────────────►│
       │                             │                              │  WHERE user_id = $1          │                      │
       │                             │                              │  ORDER BY last_active_at DESC │                      │
       │                             │                              │◄─────── rows ────────────────┼──────────────────────┤
       │                             │                              ├──200 JSON [...sessions]      │                      │
       │◄─────── 200 HTML ────────────┤◄─────────────────────────────┤                              │                      │
       │     (sessions table page)    │                              │                              │                      │
```

### 3.2 Admin Revokes Single Session (with audit)

```
Browser (role=ADMIN)         AdminController                      SessionService                   Postgres                AdminAuditEvent
       │                            │                                   │                              │                          │
       ├──DELETE /admin/sessions/   │                                   │                              │                          │
       │       {sessionId}──────────►│                                   │                              │                          │
       │                             ├──assertAdmin(actorId)              │                              │                          │
       │                             │  (throw 403 if not)                 │                              │                          │
       │                             ├──controller.revokeSession          │                              │                          │
       │                             │  (sessionId, ipAddress, ua)        │                              │                          │
       │                             ├──service.revoke(sessionId)        │                              │                          │
       │                             │                                   ├──DELETE FROM sessions        │                          │
       │                             │                                   │  WHERE id = $1──────────────┼──────────────────────►│
       │                             │                                   │◄── 1 row deleted ───────────┼──────────────────────┤
       │                             ├──insertAuditEvent({                │                              │                          │
       │                             │   actorId,                         │                              │                          │
       │                             │   targetId: sessionId,              │                              │                          │
       │                             │   action: "REVOKE_SESSION",        │                              │                          │
       │                             │   ipAddress,                       │                              │                          │
       │                             │   userAgent,                       │                              │                          │
       │                             │   metadata: { targetUserId }       │                              │                          │
       │                             │ })────────────────────────────────┼──────────────────────────────┼────────────────────────►│
       │                             │                                   │                              │                          │
       │                             ├──Set-Cookie: authjs.session-token=│                              │                          │
       │                             │  ; Path=/; Expires=...              │                              │                          │
       │                             │  (only if self-revoke)             │                              │                          │
       │◄──── 204 No Content ────────┤                                   │                              │                          │
```

## 4. File Changes

| File | Action | Description |
|---|---|---|
| `libs/core/database/prisma/schema.prisma` | Modify | Add `Session.metadata Json?`, add `model AdminAuditEvent { actorId, targetId, action enum, createdAt default now, metadata Json, ipAddress String?, userAgent String?, @@index([createdAt]) }` |
| `libs/core/database/prisma/migrations/<ts>_admin_audit/` | Create | Prisma migration: add `AdminAuditEvent` table + `Session.metadata` column |
| `libs/features/auth/server/src/session-service.ts` | Modify | Add `list(userId, limit, offset)`, `revoke(sessionId, actorId, ip, ua)`, `revokeAll(userId, actorId, ip, ua)` methods; emit `auth.session.revoked` event on revoke |
| `libs/features/auth/server/src/rbac-service.ts` | Modify | Add `listUsers({limit, offset})`, `changeRole(userId, newRole, actorId, ip, ua)`, `assertAdmin(userId)` methods |
| `libs/features/auth/server/src/auth.events.ts` | Modify | Add `auth.session.revoked` event type with `{ actorId, targetUserId, sessionId, ipAddress, userAgent }` payload (extend existing) |
| `libs/features/auth/shared/schemas/admin.schemas.ts` | Create | Zod: `ListUsersQuerySchema`, `ChangeRoleBodySchema`, `ListSessionsQuerySchema` |
| `libs/features/auth/shared/schemas/index.ts` | Modify | Export new schemas |
| `apps/api/src/modules/auth/admin.controller.ts` | Create | NestJS controller with 5 endpoints: `GET /admin/users`, `POST /admin/users/:userId/role`, `GET /admin/sessions`, `DELETE /admin/sessions/:sessionId`, `DELETE /admin/sessions/user/:userId` |
| `apps/api/src/modules/auth/admin.module.ts` | Create | DI module wiring `RbacService` + `SessionService` + `AuditService` (or inline in controller) |
| `apps/api/src/modules/auth/auth.controller.ts` | Modify | No change to existing endpoints; new admin endpoints live in `admin.controller.ts` |
| `apps/api/src/modules/auth/auth.module.ts` | Modify | Import `AdminModule` |
| `apps/api/src/shared/guards/admin.guard.ts` | Create | `@UseGuards(JwtAuthGuard, AdminGuard)` — checks `req.user.role === 'ADMIN'` |
| `apps/api/src/shared/decorators/admin.decorator.ts` | Create | `@AdminOnly()` convenience decorator composing `UseGuards(JwtAuthGuard, AdminGuard)` |
| `apps/api/src/shared/guards/jwt.guard.ts` | Modify | Verify `request.user.role` flows from JWT (already per M2) |
| `apps/api/.env.example` | Modify | Add `ADMIN_ENABLED=true` (default; set `false` to disable admin routes entirely) |
| `apps/api/test/admin.e2e-spec.ts` | Create | Vitest e2e: 5 endpoints × happy + edge + error + non-admin 403 |
| `libs/features/auth/server/src/__tests__/session-service.admin.test.ts` | Create | Unit: list/revoke/revokeAll |
| `libs/features/auth/server/src/__tests__/rbac-service.admin.test.ts` | Create | Unit: listUsers/changeRole/assertAdmin |
| `apps/web/app/[locale]/(app)/admin/layout.tsx` | Create | Admin route group layout (inherits `(app)` auth guard; adds admin nav) |
| `apps/web/app/[locale]/(app)/admin/users/page.tsx` | Create | Admin users list page (server component, calls `GET /admin/users`) |
| `apps/web/app/[locale]/(app)/admin/users/[userId]/page.tsx` | Create | User detail page with role change form (calls `POST /admin/users/:userId/role`) |
| `apps/web/app/[locale]/(app)/admin/sessions/page.tsx` | Create | Admin sessions list page (calls `GET /admin/sessions?userId=...`) |
| `apps/web/components/admin/UsersTable.tsx` | Create | Client component: 5 form states + role change form |
| `apps/web/components/admin/SessionsTable.tsx` | Create | Client component: 5 form states + revoke buttons (single + all) |
| `apps/web/components/admin/AdminNav.tsx` | Create | Top-level nav for admin pages |
| `apps/web/middleware.ts` | Modify | Add admin route check: `path.startsWith(\`/\${locale}/admin\`)` → check `auth().user.role === 'ADMIN'`; redirect to `/\${locale}/(app)` with flash if not |
| `apps/web/messages/en.json` | Modify | Add `admin.*` keys (title, sections, errors, success) |
| `apps/web/messages/es.json` | Modify | Add Spanish equivalents (neutral/professional Spanish) |
| `apps/web/e2e/auth/admin.spec.ts` | Create | Playwright + axe-core: admin login → list users → change role → list sessions → revoke single → revoke all → non-admin redirect |
| `libs/features/auth/docs/admin-flow.feature` | Create | Cucumber BDD: same vertical scenario as e2e |
| `libs/features/auth/docs/step-defs/admin.steps.ts` | Create | Step defs for admin flow |
| `docs/operations/admin-runbook.md` | Create | Runbook: admin onboarding, role assignment procedure, emergency revoke, audit query examples, retention (deferred to M4) |
| `Documents-es/docs/operations/admin-runbook.md` | Create | Spanish mirror |
| `Documents-es/openspec/changes/module-3-superadmin/design.md` | Create | Spanish mirror of this design (≤ 900 words, 0 CJK) |
| `openspec/changes/module-3-superadmin/design.md` | Create | This file |

## 5. Interfaces / Contracts

```ts
// libs/features/auth/shared/schemas/admin.schemas.ts

export const ListUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ChangeRoleBodySchema = z.object({
  role: z.enum(["USER", "ADMIN"]),
});

export const ListSessionsQuerySchema = z.object({
  userId: z.string().uuid(),
});

// Event payloads (extend libs/features/auth/server/src/auth.events.ts)

export interface SessionRevokedEvent {
  readonly type: "auth.session.revoked";
  readonly payload: {
    readonly actorId: string;
    readonly targetUserId: string;
    readonly sessionId: string;
    readonly ipAddress: string | null;
    readonly userAgent: string | null;
    readonly count: number; // 1 for single, N for revokeAll
  };
}

export interface AdminAuditEventRow {
  readonly id: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly action: "REVOKE_SESSION" | "REVOKE_ALL_SESSIONS" | "CHANGE_ROLE";
  readonly createdAt: Date;
  readonly metadata: Record<string, unknown>;
  readonly ipAddress: string | null; // ≤ 45 chars
  readonly userAgent: string | null; // ≤ 512 chars
}
```

HTTP contract:

```
GET    /admin/users?limit=50&offset=0
       → 200 [{id, email, role, createdAt}]
       → 403 if non-admin
       → 401 if unauthenticated

POST   /admin/users/:userId/role
       body: {role: "USER"|"ADMIN"}
       → 200 {id, email, role}
       → 400 invalid role
       → 403 non-admin
       → 404 unknown user

GET    /admin/sessions?userId=<uuid>
       → 200 [{id, userId, createdAt, lastActiveAt, userAgent, ipAddress}]
       → 400 missing userId
       → 403 non-admin

DELETE /admin/sessions/:sessionId
       → 204 (with Set-Cookie clear if self-revoke)
       → 404 unknown session
       → 403 non-admin

DELETE /admin/sessions/user/:userId
       → 204 (with Set-Cookie clear if self-revoke; revokedCount in audit metadata)
       → 404 unknown user
```

## 6. Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `SessionService.list/revoke/revokeAll` | Vitest; in-memory Prisma mock (per M2 pattern) |
| Unit | `RbacService.listUsers/changeRole/assertAdmin` | Vitest |
| Unit | Zod schemas (`admin.schemas.ts`) | Vitest boundary fixture (per AGENTS.md §7) |
| Integration | `AdminController` endpoints with `AdminGuard` | Vitest NestJS e2e; `.overrideProvider(RATE_LIMITER_TOKEN).useValue(new InMemoryRateLimiter())` per `pattern/ratelimit-test-isolation` |
| Integration | Audit row insertion on every admin op | Vitest; assert row created with correct fields |
| Integration | Self-revoke sets cookie | Vitest supertest; assert `Set-Cookie` header |
| Integration | IP redaction in pino logs | Vitest with pino sink (per `pattern/pino-bracket-notation-redaction`) |
| Integration | JWT decode failure mode for admin endpoints | Vitest supertest; expired/wrong-secret token → 401 (per `pattern/nextauth-decode-try-catch`) |
| E2E web | Admin vertical scenario (Playwright en + es) | Playwright + `page.route()` for API mocks (per `pattern/playwright-per-project-webserver-not-supported`) |
| E2E web | axe-core on every admin page | Playwright + `@axe-core/playwright`; 0 serious/critical |
| BDD | Admin vertical scenario in Cucumber | `libs/features/auth/docs/admin-flow.feature` + step-defs |
| Manual | Runbook walkthrough | Operator runs the runbook against staging |
| Rate-limit | New admin endpoints rate-limit | Vitest; 30 req / 60 s per admin actor (NOT per-IP, per `pattern/ratelimit-test-isolation`) |

## 7. Threat Matrix

Per `references/threat-matrix.md`. Marked Applicable/N/A with reason.

| Boundary | Min adversarial cases | Applicability | Design response | Planned RED tests |
|---|---|---|---|---|
| Routing (admin endpoints) | foreign actor calls admin; non-admin token; expired token; ADMIN_ENABLED=false | Applicable | `JwtAuthGuard + AdminGuard`; 401 + 403 generic copy; `ADMIN_ENABLED=false` → 404 from `AdminGuard` | Vitest e2e: 401 + 403 + 404 |
| Configuration | `ADMIN_ENABLED=false` env toggle | Applicable | `AdminGuard` checks `env.ADMIN_ENABLED` first; returns 404 to hide surface entirely | Vitest: `ADMIN_ENABLED=false` → 404 |
| IP + UA handling | IP spoofing via `X-Forwarded-For`; UA truncation > 512 | Applicable | Use Express `req.ip` (respects trust proxy); UA from `req.headers['user-agent']` truncated to 512 chars; pino `[ip]` redaction (per `pattern/pino-bracket-notation-redaction`) | Vitest: IP+UA captured; pino output shows `[REDACTED]` for IP; UA >512 truncated |
| Documentation-like paths | N/A — no executable docs | N/A | None | None |
| Git repo selection | N/A — no shell | N/A | None | None |
| Commit / Push / PR | N/A — no VCS automation | N/A | None | None |
| Shell/process | N/A — no subprocess | N/A | None | None |

## 8. Migration / Rollout

No DB schema BREAKING changes. New `AdminAuditEvent` table (additive) + new `Session.metadata` column (nullable, no default). Rollback: `git revert <chain-tip>` removes the migration + deletes the `AdminModule` import. No data loss — existing sessions still work without the `metadata` column populated.

`ADMIN_ENABLED` defaults to `true`; setting it `false` makes `AdminGuard` 404 every `/admin/*` route, providing a kill-switch without code changes (emergency response). Rollback is reversible per-PR because each PR is atomic (AGENTS.md §5) and the chain keeps `develop` green at every step.

## 9. Open Questions

None. All product decisions resolved in the proposal's `## Product decisions` section (per user answers captured 2026-07-18).

# Tasks: `module-3-superadmin`

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Estimated ~1500-2500 LOC (35 files, 5 PRs). 400-line budget risk **High**. Chained PRs recommended **Yes**. Split: PR #1 schema → PR #2 services → PR #3 controller → PR #4 UI → PR #5 BDD+e2e+runbook. Delivery `auto-chain`; chain strategy `feature-branch-chain`. PR bases: #1 = `feat/superadmin`; #2 = #1; #3 = #2; #4 = #3; #5 = #4. Final merge to `develop` after all 5 approved.

### Work Units

| # | Goal | PR | Focused test cmd | Harness | Rollback |
|---|------|----|--------------------|---------|----------|
| 1 | Schema+migration+RbacService+Zod | #1 | `pnpm --filter @core/database test` | Vitest in-mem Prisma | Revert migration; no data loss |
| 2 | SessionService.revoke/revokeAll+audit+events | #2 | `pnpm --filter @features/auth test` | Vitest in-mem Prisma | Revert services; events unused |
| 3 | AdminController+AdminGuard+kill-switch | #3 | `pnpm --filter api test test/admin.e2e-spec.ts` | NestJS+supertest | Revert controller+guard; routes 404 |
| 4 | Web pages+middleware+5 form states+axe-core | #4 | `pnpm --filter web test && e2e admin.a11y.spec.ts` | Playwright+Vitest | Revert pages+middleware; (app) intact |
| 5 | BDD+Playwright e2e vertical+runbook+ES | #5 | `pnpm turbo run bdd e2e && lint:fixtures` | Cucumber+Playwright en/es | Revert docs; code untouched |

## Carry-forward + threat→RED

Strict TDD RED→GREEN→TRIANGULATE→REFACTOR; atomic commits; pino `[email]`+`[ip]`; `next-auth/jwt#decode` try/catch; `.overrideProvider(TOKEN).useValue(InMemoryAdapter)`; next-intl alias + Turbopack cond; Playwright web + Vitest NestJS API e2e; ESLint boundaries; 5 form states + WCAG AA; ES mirror same commit, 0 CJK. Routing + Configuration + IP-handling (Applicable per design §7) → Phase 3 + 4 + 5 RED.

## Phase 1 — Schema + Migration + RbacService (PR #1)

Base `feat/superadmin`. Verify `pnpm --filter @core/database test`.

- [x] 1.1 RED `schema.prisma` test: add `AdminAuditEvent` model + `Session.metadata Json?`; assert migration creates table.
- [x] 1.2 GREEN update `schema.prisma`; generate Prisma migration `add_admin_audit_event`.
- [x] 1.3 RED `rbac-service.admin.test.ts`: `listUsers({limit, offset})` + `changeRole(userId, newRole)` + `assertAdmin(userId)`; assert `metadata.from/to` on role change.
- [x] 1.4 GREEN extend `RbacService` with the 3 methods; emit `auth.role.changed` event with `{actorId, targetUserId, fromRole, toRole}`.
- [x] 1.5 RED Zod boundary fixture: `ListUsersQuerySchema`, `ChangeRoleBodySchema`, `ListSessionsQuerySchema`; assert role enum accepts only "USER" | "ADMIN".
- [x] 1.6 GREEN create `libs/features/auth/shared/schemas/admin.schemas.ts`; export from `index.ts`.
- [x] 1.7 `libs/core/config/env.schema.ts`: add `ADMIN_ENABLED: z.coerce.boolean().default(true)`; refine in productionEnvSchema (optional, never required).
- [x] 1.8 ES mirror `Documents-es/.../tasks.md`; verify 0 CJK.

## Phase 2 — SessionService + AuthEvents (PR #2)

Base PR #1. Verify `pnpm --filter @features/auth test`.

- [x] 2.1 RED `session-service.admin.test.ts`: `list(userId)` returns array sorted `lastActiveAt DESC`; `revoke(sessionId)` deletes row + emits `auth.session.revoked` event with payload `{actorId, targetUserId, sessionId, ipAddress, userAgent}`; `revokeAll(userId)` deletes all + emits event with `count` in metadata.
- [x] 2.2 GREEN extend `SessionService` with `list`, `revoke`, `revokeAll`; emit `auth.session.revoked` event on each.
- [x] 2.3 RED `auth.events.test.ts`: assert `auth.session.revoked` event type registered in `AUTH_EVENTS` union.
- [x] 2.4 GREEN add `auth.session.revoked` + `auth.role.changed` types to `libs/features/auth/server/src/auth.events.ts`.
- [x] 2.5 REFACTOR extract `insertAuditEvent` pure fn to `libs/features/auth/server/src/audit.service.ts` (called by RbacService.changeRole + SessionService.revoke).

## Phase 3 — AdminController + Guards (PR #3)

Base PR #2. Verify `NODE_ENV=test pnpm --filter api exec vitest run src/modules/auth/__tests__/admin*.test.ts && pnpm --filter api exec vitest run test/admin.e2e-spec.ts`.

- [x] 3.1 RED `admin.controller.test.ts` (NestJS testing module): 5 endpoints × happy + edge + error + 403 non-admin + 401 unauthenticated.
- [x] 3.2 GREEN `apps/api/src/modules/auth/admin.controller.ts` with 5 endpoints (GET /admin/users, POST /admin/users/:userId/role, GET /admin/sessions, DELETE /admin/sessions/:sessionId, DELETE /admin/sessions/user/:userId).
- [x] 3.3 RED `admin.guard.spec.ts`: assert 403 when `req.user.role !== 'ADMIN'`; assert 401 when no token.
- [x] 3.4 GREEN create `AdminGuard` in `apps/api/src/shared/guards/admin.guard.ts`; reads `req.user.role` from JwtAuthGuard.
- [x] 3.5 GREEN apply `@UseGuards(JwtAuthGuard, AdminGuard)` to all 5 endpoints.
- [x] 3.6 RED self-revoke sets cookie: e2e asserts `Set-Cookie: authjs.session-token=; Path=/; Expires=...` on `DELETE /admin/sessions/<own-session-id>`.
- [x] 3.7 RED pino `[ip]` redaction: `admin.controller.test.ts` forces a revoke, asserts captured pino line emits `ip: [REDACTED]` (per `pattern/pino-bracket-notation-redaction`).
- [x] 3.8 GREEN wire `AdminModule` in `auth.module.ts`; if `ADMIN_ENABLED=false`, controller throws `NotFoundException` for all routes (kill-switch per design).
- [x] 3.9 **Routing RED** add to admin e2e: foreign callbackUrl → 401; expired JWT → 401; non-admin → 403.

## Phase 4 — Web UI + Middleware Guard (PR #4)

Base PR #3. Verify `NODE_ENV=test pnpm --filter web test`.

- [x] 4.1 RED `middleware.admin.test.ts`: non-admin visits `/en/admin/users` → redirect to `/en/(app)`; unauthenticated → redirect to `/en/sign-in`; admin → continues.
- [x] 4.2 GREEN extend `apps/web/middleware.ts` with `/admin/*` pre-check; redirect non-admin to `/{locale}/(app)` + flash.
- [x] 4.3 RED `admin.users.page.test.tsx` + `admin.sessions.page.test.tsx`: 5 form states per AGENTS.md §9 (loading, error, success, empty, validation-error); role change form validation; revoke buttons (single + all).
- [x] 4.4 GREEN create `/[locale]/(app)/admin/{users,sessions}/page.tsx` server components; create `/[locale]/(app)/admin/users/[userId]/page.tsx` user detail page.
- [x] 4.5 GREEN create `UsersTable`, `SessionsTable`, `AdminNav` client components with 5 form states.
- [x] 4.6 GREEN `apps/web/messages/{en,es}.json`: add `admin.*` keys (titles, sections, errors, success messages).
- [x] 4.7 RED axe-core: `apps/web/e2e/auth/admin.a11y.spec.ts` per-surface audit (users list, user detail, sessions list); assert 0 serious/critical.
- [x] 4.8 TRIANGULATE admin nav: empty state (no users) shows CTA + helpful copy; success state after role change shows localized confirmation.

## Phase 5 — BDD + Runbook + E2E Vertical (PR #5)

Base PR #4. Verify `NODE_ENV=test pnpm turbo run bdd e2e && pnpm lint:fixtures`.

- [x] 5.1 RED Cucumber `admin-flow.feature`: admin login → list users → change role → list sessions → revoke single → revoke all → non-admin redirect.
- [x] 5.2 GREEN step-defs `libs/features/auth/docs/step-defs/admin.steps.ts` covering all 7 scenarios.
- [x] 5.3 RED Playwright `admin.spec.ts` same vertical scenario for `en` + `es` projects.
- [x] 5.4 GREEN `apps/web/e2e/auth/admin.spec.ts`; `page.route()` mocks the 5 admin endpoints.
- [x] 5.5 RED draft `docs/operations/admin-runbook.md`: admin onboarding, role assignment procedure, emergency revoke, audit query examples, retention (deferred to M4).
- [x] 5.6 GREEN runbook complete; verified against staging.
- [x] 5.7 ES mirror `Documents-es/docs/operations/admin-runbook.md`; verify 0 CJK across all M3 docs.
- [x] 5.8 Final gate: `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` + `NODE_ENV=test pnpm lint:fixtures` exit 0.

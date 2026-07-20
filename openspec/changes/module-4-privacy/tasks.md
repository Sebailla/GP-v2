# Tasks: Module 4 Privacy

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1200-2000 (28 files, 4 PRs) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 schema → PR #2 audit API + retention → PR #3 web UI → PR #4 BDD+runbook |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Session.lastActiveAt column, index, env, SessionService coalesce + list projection | PR #1 | `pnpm --filter @core/database test && pnpm --filter @features/auth test` | NestJS Vitest | Revert migration + SessionService changes; no audit endpoint touched |
| 2 | AuditService findMany/purge, /admin/audit + /admin/audit/purge, retention cron, env | PR #2 | `NODE_ENV=test pnpm --filter api test` | NestJS e2e supertest | Disable cron via `AUDIT_RETENTION_ENABLED=false`; revert endpoints |
| 3 | audit-api wrappers, server page, filter/table/retention UI, EN/ES messages, axe | PR #3 | `NODE_ENV=test pnpm --filter web test` | Playwright en+es | Drop page; remove nav link; UI is additive |
| 4 | BDD feature + step-defs, Playwright vertical, runbook EN+ES, final gate | PR #4 | `NODE_ENV=test pnpm turbo run build lint typecheck test bdd && pnpm lint:fixtures` | Playwright + Cucumber | Revert runbook; BDD stays as docs |

PR bases: #1 = `feat/privacy` (tracker); #2 = #1; #3 = #2; #4 = #3. Final merge to `develop` after all 4 approved.

## Carry-forward + threat→RED

Strict TDD RED→GREEN→TRIANGULATE→REFACTOR; atomic commits; pino `[email]` + `[ip]` brackets; `next-auth/jwt#decode` try/catch; `.overrideProvider(TOKEN).useValue(InMemoryAdapter)`; next-intl alias + Turbopack cond; Playwright web + Vitest NestJS API e2e; ESLint boundaries; 5 form states + WCAG AA; ES mirror same commit, 0 CJK. Routing (audit endpoints) + Configuration (AUDIT_RETENTION_DAYS) + PII (ipAddress HMAC) + Retention (deleteMany atomicity) — Applicable per design §7. Shell/process N/A.

## Phase 1 — Schema + SessionService (PR #1)

Base `feat/privacy`. Verify `pnpm --filter @core/database test && pnpm --filter @features/auth test`.

- [x] 1.1 RED `schema.prisma` test: add `Session.lastActiveAt DateTime?` + `@@index([lastActiveAt])`; assert migration creates column + index.
- [x] 1.2 GREEN update `schema.prisma`; generate Prisma migration `add_session_last_active_at`.
- [x] 1.3 RED `env-refine.audit-retention.test.ts`: AUDIT_RETENTION_DAYS parses 0/30/90/-1/abc; AUDIT_RETENTION_ENABLED parses true/false.
- [x] 1.4 GREEN `env.schema.ts`: add `AUDIT_RETENTION_DAYS` (z.coerce.number.int.min(0).default(90)) + `AUDIT_RETENTION_ENABLED` (z.coerce.boolean.default(false)); `.env.example` documents.
- [x] 1.5 RED `session-service.last-active-at.test.ts`: validateSession on session with `lastActiveAt < now-60s` writes `now()`; within 60s coalesces; new session (`lastActiveAt IS NULL`) writes.
- [x] 1.6 GREEN extend `SessionService.validateSession` with coalesced write (D1 pattern: `where: { id, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }] }`).
- [x] 1.7 RED `session-service.list-projection.test.ts`: list returns 6-field spec-literal projection; orderBy `lastActiveAt DESC`; `lastActiveAt IS NULL` sorts last.
- [x] 1.8 GREEN update `SessionService.list` projection to spec-literal `{ id, userId, createdAt, lastActiveAt, userAgent, ipAddress }`; orderBy.
- [x] 1.9 ES mirror `Documents-es/.../tasks.md`; verify 0 CJK.

## Phase 2 — Audit API + Retention (PR #2)

Base PR #1. Verify `NODE_ENV=test pnpm --filter api test && pnpm --filter @features/auth test`.

- [x] 2.1 RED `audit.schemas.test.ts` (boundary): ListAuditQuerySchema (actorId/targetId/action/since/until/limit/offset; max limit 200); PurgeAuditBodySchema (dryRun + olderThanDays ≥ 1).
- [x] 2.2 GREEN create `libs/features/auth/shared/schemas/audit.schemas.ts`; export from index.
- [x] 2.3 RED `audit-service.find-many.test.ts`: 8 filter combinations (actorId, targetId, action, since, until, all, none, multi); pagination; Zod coercion.
- [x] 2.4 GREEN extend `AuditService.findMany({ actorId?, targetId?, action?, since?, until?, limit?, offset? })` (D3); assert dynamic `where` build.
- [x] 2.5 RED `audit-service.purge.test.ts`: countOlderThan returns matched count; purgeOlderThan deletes matching rows; idempotent on second call; deleteMany is atomic (single call regardless of count).
- [x] 2.6 GREEN extend `AuditService` with `countOlderThan(days)` + `purgeOlderThan(days)` (D4).
- [x] 2.7 RED `audit.controller.test.ts` (NestJS e2e): GET /admin/audit 4 endpoints × happy + edge + error + 403; POST /admin/audit/purge dry-run + real + idempotent + 403.
- [x] 2.8 GREEN extend `AdminController` with GET /admin/audit + POST /admin/audit/purge (D4 dual-mode); update revokeSession projection to spec-literal (D7).
- [x] 2.9 RED `audit-retention.cron.test.ts`: when `AUDIT_RETENTION_ENABLED=true` the cron calls `auditService.purgeOlderThan(days)`; when false, no-op; reads `AUDIT_RETENTION_DAYS` env var.
- [x] 2.10 GREEN `libs/features/auth/server/src/audit-retention.cron.ts` with `@Cron('0 3 * * *')` (D2); register in `AdminModule` behind env flag.
- [x] 2.11 TRIANGULATE audit findMany with edge case: action enum mismatch (admin sends `action=GOD`) → Zod 400; very large `limit=999` → clamped to 200.

## Phase 3 — Web UI + i18n (PR #3)

Base PR #2. Verify `NODE_ENV=test pnpm --filter web test`.

- [x] 3.1 RED `audit-api.test.ts`: all 3 wrappers (`listAdminAuditEvents`, `dryRunPurgeAuditEvents`, `purgeAuditEvents`) send `Authorization: Bearer <token>` (per M3 JD-1 pattern); URL params encoded correctly.
- [x] 3.2 GREEN `apps/web/lib/audit-api.ts` with 3 wrappers; `authHeader()` returns Bearer token.
- [x] 3.3 RED `audit-page.test.tsx`: server component fetches audit events + renders table; filter bar with 4 filter inputs; pagination controls; dry-run + real purge buttons; 5 form states per AGENTS.md §9.
- [x] 3.4 GREEN `apps/web/app/[locale]/(app)/admin/audit/page.tsx` server component; `AuditFilterBar` client component; `AuditLogTable` client component; `AuditRetentionButton` client component.
- [x] 3.5 GREEN `apps/web/messages/{en,es}.json`: add `admin.audit.*` keys (title, filters, columns, dryRun, purge, confirm, errors).
- [x] 3.6 RED `audit-filter-bar.test.tsx`: filter inputs bind to URL params; submit triggers fetch.
- [x] 3.7 RED `audit-retention-button.test.tsx`: dry-run button shows matched count; real button shows confirm dialog; both 5-state contract.
- [x] 3.8 RED axe-core: `apps/web/e2e/auth/audit.a11y.spec.ts` per-surface audit; assert 0 serious/critical.
- [x] 3.9 TRIANGULATE audit page: empty state (no events) shows CTA; success state after filter apply shows localized confirmation; error state on 401/403/500 shows appropriate copy.

## Phase 4 — BDD + Runbook + Final Gate (PR #4)

Base PR #3. Verify `NODE_ENV=test pnpm turbo run build lint typecheck test bdd && pnpm lint:fixtures`.

- [ ] 4.1 RED Cucumber `audit-flow.feature`: admin login → /en/admin/audit → list events → filter by actorId → see own REVOKE_SESSION row → dry-run purge with olderThanDays=1 → real purge with olderThanDays=90 → verify deletion.
- [ ] 4.2 GREEN step-defs `libs/features/auth/docs/step-defs/audit.steps.ts` covering all scenarios.
- [ ] 4.3 RED Playwright `audit.spec.ts` (en + es projects) same vertical scenario.
- [ ] 4.4 GREEN `apps/web/e2e/auth/audit.spec.ts`; `page.route()` mocks the 2 admin audit endpoints.
- [ ] 4.5 RED draft `docs/operations/audit-retention-runbook.md`: how to invoke purge manually, dry-run vs real, retention policy rationale, IP redaction explanation, M3 carry-forward notes.
- [ ] 4.6 GREEN runbook complete; verified against staging; `docs/operations/audit-retention-runbook.md` + ES mirror committed in same atomic commit.
- [ ] 4.7 ES mirror `Documents-es/docs/operations/audit-retention-runbook.md`; verify 0 CJK.
- [ ] 4.8 Final gate: `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` + `NODE_ENV=test pnpm lint:fixtures` exit 0.

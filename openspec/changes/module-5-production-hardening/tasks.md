# Tasks: Module 5 Production Hardening

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1500-2500 (28 files, 5 PRs) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | #1 BCRYPT → #2 F2 → #3 breaker → #4 cov+metrics → #5 spec+docs+gate |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

PR bases: #1=`feat/hardening`; #2=#1; #3=#2; #4=#3; #5=#4 → `develop`. Threat→RED: Coverage 4.5; PII 4.7; F2 2.1–2.3; BCRYPT 1.3; clamp 5.1. Shell/VCS N/A.

### Phase 1 — BCRYPT (PR #1)

Verify `NODE_ENV=test pnpm --filter @core/config test && pnpm --filter @features/auth test`.

- [x] 1.1 RED `apps/api/test/env.bcrypt-cost-override.test.ts`: env `BCRYPT_COST_FACTOR_OVERRIDE` parses 12/14/4; rejects 0,-1,3,"abc".
- [x] 1.2 GREEN `libs/core/config/env.schema.ts`: add `BCRYPT_COST_FACTOR_OVERRIDE: z.coerce.number().int().min(4).optional()`; `.env.example`.
- [x] 1.3 RED `apps/api/test/auth-hash.bcrypt.test.ts`: default 12 hashes <500ms; override 14 at cost 14 (verify salt).
- [x] 1.4 GREEN `libs/features/auth/server/src/{auth-service,password-reset.service}.ts`: `bcrypt.hash(p, env.BCRYPT_COST_FACTOR_OVERRIDE ?? BCRYPT_COST_FACTOR)`; `constants.ts:BCRYPT_COST_FACTOR=12`.
- [x] 1.5 RED same test: test mode forces cost 4; 10 logins <2s.
- [x] 1.6 GREEN keep `BCRYPT_COST_FACTOR=12`; doc override allows lower in test.
- [x] 1.7 ES mirror `Documents-es/.../tasks.md`; grep CJK empty.

### Phase 2 — F2 Serializable (PR #2)

Verify `NODE_ENV=test pnpm --filter @features/auth test && pnpm --filter api test`.

- [x] 2.1 RED `apps/api/test/rbac-serializable.test.ts`: concurrent demote on last 2 admins → one 200, other 409 `LastAdminError`.
- [x] 2.2 RED `apps/api/test/rbac-serializable-retry.test.ts`: transient 40001 on 1st → retry on 2nd.
- [x] 2.3 RED `apps/api/test/rbac-serializable-exhausted.test.ts`: 3×40001 → 503 + localized `serialization_failed`.
- [x] 2.4 GREEN `libs/features/auth/server/src/rbac-service.ts`: `prisma.$transaction(w, { isolationLevel: Serializable })`; re-check admins INSIDE tx; retry 40001/P2034 50ms×2^attempt, max 3.
- [x] 2.5 RED `apps/api/test/rbac-serializable-concurrency.test.ts`: `Promise.all`; one wins.
- [x] 2.6 GREEN map `P2034`→409/503; i18n keys in `apps/web/messages/{en,es}.json`.

### Phase 3 — Breaker Perf (PR #3)

Verify `NODE_ENV=test pnpm --filter @features/auth test`.

- [x] 3.1 RED `apps/api/test/session-service.breaker.test.ts`: warm cache <60s; miss triggers `listActive`.
- [x] 3.2 GREEN `libs/features/auth/server/src/session-service.ts`: `Map<userId,{count,ts}>` TTL 60s = `LAST_ACTIVE_AT_COALESCE_WINDOW_MS`.
- [x] 3.3 RED `apps/api/test/session-service.breaker-perf.test.ts`: 100 sequential `getCurrentUser` warm → spy=0 `listActive`.
- [x] 3.4 GREEN TTL eviction; test asserts hit then miss.
- [x] 3.5 RED `apps/api/test/session-service.breaker-race.test.ts`: concurrent `getCurrentUser` no stampede (single-flight).
- [x] 3.6 GREEN if no single-flight, doc bounded stampede in JSDoc.

### Phase 4 — Coverage + Metrics (PR #4)

Verify `NODE_ENV=test pnpm turbo run test && pnpm turbo run build lint typecheck test bdd && pnpm turbo run test --coverage`.

- [x] 4.1 RED `apps/api/test/observability-metrics.test.ts`: increments bump right Counter (`authLoginSuccessTotal`, `authLoginFailureTotal{reason,email_domain}`, `authAdminOperationTotal{operation,actor_role}`).
- [x] 4.2 GREEN `apps/api/src/modules/metrics/registry.ts`: 7 Counters (`auth_login_success_total`, `auth_login_failure_total`, `auth_password_reset_requested_total`, `auth_password_reset_completed_total`, `auth_admin_operation_total`, `auth_session_validations_total`, `auth_session_validations_failed_total`).
- [x] 4.3 RED `apps/api/test/metrics.e2e-spec.ts`: after login+admin+session, `GET /metrics` returns counters.
- [x] 4.4 GREEN `apps/api/src/modules/auth/{auth,admin}.controller.ts`: increment success/failure; pino `[email]`+`[ip]` redacted; no PII in labels.
- [x] 4.5 RED `apps/api/test/coverage-gate.test.ts`: 65% pass; 50% fail.
- [x] 4.6 GREEN `turbo.json` add `coverage.disabled` to `env`; per-pkg `vitest.config.ts` `thresholds.global.{lines,branches,functions,statements}=60` (apps/api, apps/web, libs/features/auth/server, libs/core/{database,logging,rate-limit}).
- [x] 4.7 RED `apps/api/test/observability-pii.test.ts`: no `@`; no `ip_address`; no UUID.
- [x] 4.8 GREEN `libs/features/auth/server/src/audit.service.ts`: increments at 8 admin endpoints (list_users, change_role, list_sessions, revoke_session, revoke_all_sessions, list_audit, purge_audit_dry_run, purge_audit_real).

### Phase 5 — Spec Clamp + Runbook + Gate (PR #5)

Verify `NODE_ENV=test pnpm turbo run build lint typecheck test bdd && pnpm lint:fixtures && NODE_ENV=test pnpm turbo run test --coverage`.

- [x] 5.1 RED `libs/shared/schemas/__tests__/audit.schemas.test.ts`: `?limit=500` accepted (Zod max=500); controller clamps 200.
- [x] 5.2 GREEN `libs/features/auth/shared/schemas/audit.schemas.ts`: `.max(200)`→`.max(500)`; `admin.controller.ts:listAuditEvents` adds `Math.min(parsed.limit, 200)` in `take`.
- [x] 5.3 RED `apps/api/test/runbook-paths.test.ts`: runbook refs `audit-retention.cron.ts`; grep matches `AuditRetentionSchedule`.
- [x] 5.4 GREEN `docs/operations/audit-retention-runbook.md`+`Documents-es/...`: paths (159, 396); grep (281).
- [x] 5.5 RED `apps/web/__tests__/audit-log-table-i18n.test.ts`: header "IP (HMAC, first 8 chars)" / "IP (HMAC, primeros 8 caracteres)".
- [x] 5.6 GREEN `apps/web/messages/{en,es}.json`: rename header; update `AuditLogTable.tsx` if direct ref.
- [x] 5.7 RED `apps/api/test/coverage-final.test.ts`: ≥60% per package; CI fails if dropped.
- [x] 5.8 GREEN `coverage.disabled=false` enforced; `.env.example` documents escape.
- [x] 5.9 ES mirror; verify 0 CJK.
- [x] 5.10 Final gate: `pnpm turbo run build lint typecheck test bdd` + `pnpm lint:fixtures` + `pnpm turbo run test --coverage` exit 0.

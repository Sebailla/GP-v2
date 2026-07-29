# Design: Module 5 Production Hardening

## 1. Technical Approach

M5 closes eight carry-forward WARNINGs, enforces coverage, and adds auth observability. Server work raises bcrypt 10→12 with a Zod override, protects F2 with Serializable retry, caches the session breaker count for 60s, and adds seven PII-safe counters to the existing authenticated `/metrics`. Pipeline work runs per-package Vitest coverage at four 60% thresholds with `coverage.disabled=true`. Audit requests accept 500 but read at most 200; runbook paths/grep and HMAC wording are corrected. Delivery is five chained PRs ≤400 LOC with strict TDD.

## 2. Architecture Decisions

| Choice | Alternatives considered | Rationale |
|---|---|---|
| **D1** `BCRYPT_COST_FACTOR_OVERRIDE` integer ≥4; unset uses 12; hash uses `override ?? 12`. | Bump constant only; keep 10. | Tests use 4; production uses 12. Existing 10 optimizes test speed. |
| **D2** Serializable interactive transaction; count admins inside; retry SQLSTATE/P2034 three times at 50/100/200ms, then localized 503. | Count-then-act; row lock. | PostgreSQL Serializable closes concurrent demotions canonically. |
| **D3** Per-user active-session-count cache, TTL 60s; refresh on miss. | Remove breaker; query every request. | Retains bot write-amplification defense and matches coalescing. |
| **D4** v8 provider, four per-package 60% thresholds, Turbo coverage task, `coverage.disabled` escape. | Global/advisory coverage. | Package failures are actionable and enforce M1’s target. |
| **D5** Seven counters in the existing prom-client registry; auth/reset/admin/session hooks; enum or registered-domain labels only. | New service; raw IDs. | Reuses M1 `/metrics` and prevents PII leakage. |
| **D6** Audit schema max 500; controller `Math.min(limit, 200)`. | Reject >200; service clamp. | Meets silent-clamp contract at the HTTP boundary. |
| **D7** Rename English/Spanish labels to HMAC wording. | Keep “hash”. | Matches actual HMAC-SHA256 behavior. |

## 3. Data Flow

```text
AuthService.register / PasswordResetService.consumeReset
 ├─ env.BCRYPT_COST_FACTOR_OVERRIDE ?? BCRYPT_COST_FACTOR(12)
 ├─ bcrypt.hash(password, cost)
 └─ persist User.hashedPassword
```

```text
pnpm turbo run test
 ├─ Vitest --coverage/package → coverage-final.json
 ├─ compare lines/branches/functions/statements ≥60%
 └─ fail below threshold; coverage.disabled=true warns/exits 0
```

```text
changeRole → Serializable transaction → read target/count inside tx
                                  ├─ reject last admin (409)
                                  └─ update + audit atomically
40001/P2034 → 50/100/200ms retry → exhausted localized 503
```

## 4. File Changes

| File | Action | Description |
|---|---|---|
| `libs/core/config/env.schema.ts` | Modify | Add bcrypt override and coverage-disabled contract. |
| `libs/features/auth/server/src/constants.ts` | Modify | Set default 12. |
| `libs/features/auth/server/src/auth-service.ts` | Modify | Use validated hash cost. |
| `libs/features/auth/server/src/password-reset.service.ts` | Modify | Shared cost and reset metrics. |
| `libs/features/auth/server/src/rbac-service.ts` | Modify | Serializable retry. |
| `libs/features/auth/server/src/session-service.ts` | Modify | 60s cache and validation metrics. |
| `libs/features/auth/server/src/audit.service.ts` | Modify | Audit metric hooks. |
| `libs/core/metrics/src/index.ts` | Modify | Seven counters. |
| `apps/api/src/modules/metrics/registry.ts` | Modify | Register counters. |
| `apps/api/src/modules/metrics/metrics.module.ts` | Modify | Provide registry. |
| `apps/api/src/modules/auth/auth.module.ts` | Modify | Inject metrics. |
| `apps/api/src/modules/auth/admin.module.ts` | Modify | Inject metrics. |
| `apps/api/src/modules/auth/auth.controller.ts` | Modify | Count auth/reset outcomes. |
| `apps/api/src/modules/auth/admin.controller.ts` | Modify | Clamp/count admin operations. |
| `libs/features/auth/shared/schemas/audit.schemas.ts` | Modify | Max 500. |
| `libs/shared/schemas/__tests__/audit.schemas.test.ts` | Modify | Clamp schema tests. |
| `apps/api/test/auth-hash.bcrypt.test.ts` | Create | Cost tests. |
| `apps/api/test/rbac-serializable.test.ts` | Create | Race/retry tests. |
| `apps/api/test/observability-metrics.test.ts` | Create | Counter/privacy tests. |
| `apps/api/test/metrics.e2e-spec.ts` | Modify | Counter scrape tests. |
| `apps/api/test/audit.controller.test.ts` | Modify | Effective limit test. |
| `apps/api/test/auth.controller.test.ts` | Modify | Metric hook tests. |
| `apps/api/test/session-service.test.ts` | Modify | Cache tests. |
| `apps/api/vitest.config.ts` | Modify | v8 thresholds. |
| `apps/web/vitest.config.ts` | Modify | v8 thresholds. |
| `libs/features/auth/server/vitest.config.ts` | Modify | v8 thresholds. |
| `libs/core/database/vitest.config.ts` | Modify | v8 thresholds. |
| `libs/core/logging/vitest.config.ts` | Modify | v8 thresholds. |
| `libs/core/rate-limit/vitest.config.ts` | Modify | v8 thresholds. |
| `turbo.json` | Modify | Coverage task/env/output. |
| `apps/web/messages/{en,es}.json` | Modify | HMAC labels. |
| `apps/web/components/admin/AuditLogTable.tsx` | Modify | Update direct reference if present. |
| `docs/operations/audit-retention-runbook.md` | Modify | Correct paths/grep. |
| `Documents-es/docs/operations/audit-retention-runbook.md` | Modify | Mirror corrections. |
| `openspec/specs/{auth-server-surface,audit-log-ui,rbac-admin,observability}/spec.md` | Done | Canonical M5 contracts. |

## 5. Interfaces / Contracts

```ts
BCRYPT_COST_FACTOR_OVERRIDE: z.coerce.number().int().min(4).optional();
await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
const effectiveLimit = Math.min(query.limit, 200);
```

Counters: `auth_login_success_total`, `auth_login_failure_total`, `auth_password_reset_requested_total`, `auth_password_reset_completed_total`, `auth_admin_operation_total`, `auth_session_validations_total`, `auth_session_validations_failed_total`. Labels never contain email, UUID, IP, or `ip_address`.

## 6. Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | Bcrypt, Serializable, cache, clamp | Mock bcrypt/transactions; race, backoff, TTL, 500→200. |
| Integration | Metrics, coverage | Assert privacy; 65% passes, 50% fails, disabled warns. |
| E2E | Metrics, audit UI | Nest scrape; Playwright limit 500 returns ≤200; axe clean. |
| BDD | Admin metric | Admin operation then scrape expected counter. |

## 7. Threat Matrix

| Boundary | Applicability | Response | RED test |
|---|---|---|---|
| Coverage | Applicable | Package thresholds; bypass warning. | 65%/50%/disabled. |
| Metrics PII | Applicable | Domain/enums; pino bracket-safe `ip` redaction. | No email/UUID/IP. |
| Serializable | Applicable | In-tx invariant, bounded retry. | Parallel demotes; three 40001s. |
| Bcrypt | Applicable | Default 12; test override ≥4. | Cost 12 <500ms; override 4. |
| Audit limit | Applicable | Zod 500/controller 200. | 500 succeeds with ≤200 rows. |
| Shell/process | N/A | No subprocess. | None. |
| VCS | N/A | No runtime automation. | None. |

## 8. Migration / Rollout

No schema changes. Roll out five independent chained PRs: bcrypt; Serializable; cache; metrics/coverage; clamp/docs/i18n. Emergency rollback uses `BCRYPT_COST_FACTOR_OVERRIDE=10` or `coverage.disabled=true`. Existing `/metrics` authentication remains.

## 9. Open Questions

None. All product decisions are resolved.

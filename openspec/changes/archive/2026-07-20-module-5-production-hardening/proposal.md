# Proposal: Module 5 Production Hardening

## Intent

M5 closes eight warnings deferred to M4 and wires the 60% coverage target that remained advisory through M1–M4. Delivery is vertical: auth, RBAC, sessions, metrics, audit UI, runbook, i18n, tests, and the Spanish mirror. Security headers, secrets rotation, and other AGENTS.md §11 exclusions remain untouched.

## Scope

### In Scope
- Raise bcrypt cost from 10 to 12 with an environment-configurable override.
- Protect `changeRole` last-admin invariants with Serializable escalation and tests.
- Optimize the session circuit-breaker hot path with memoization or batching.
- Wire and enforce all four 60% coverage thresholds in Turbo; add counters to `/metrics`.
- Silently clamp audit `limit` to 200; correct runbook paths/grep; rename the UI header to “HMAC”.

### Out of Scope
- Security headers (HSTS, CSP), secrets rotation/manager, CDN configuration.
- Account deletion, data export, non-admin sessions UI, additional OAuth providers, i18n beyond en/es, Sentry.

## Capabilities

### New Capabilities
- `observability`: Structured auth/admin/session counters exposed through `/metrics`.

### Modified Capabilities
- `auth-server-surface`: Production bcrypt cost contract and observability counters.
- `rbac-admin`: Serializable protection for concurrent role changes.
- `audit-log-ui`: `limit > 200` is silently clamped, not rejected.

## Approach

Five chained PRs, ≤400 LOC: (1) bcrypt; (2) Serializable F2; (3) circuit optimization; (4) Turbo coverage and metrics; (5) clamp, runbook, HMAC, gates, mirror. Follow RED → GREEN → TRIANGULATE → REFACTOR; keep slices atomic.

## Affected Areas

| Area | Impact |
|---|---|
| `libs/features/auth/server/src/{constants,rbac-service,session-service}.ts` | Harden auth, RBAC, and session paths |
| `turbo.json`, `libs/core/logging/` | Coverage gate and metrics |
| `apps/api/src/modules/auth/admin.controller.ts` | Clamp audit limit |
| `docs/operations/audit-retention-runbook.md`, `apps/web/messages/{en,es}.json` | Docs and HMAC label |
| `openspec/specs/{auth-server-surface,rbac-admin,audit-log-ui,observability}/spec.md` | Contract updates/new spec |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Coverage enforcement changes AGENTS.md §10 contract | High | Confirm before apply; disable gate if rejected |
| Observability conflicts with §11 out-of-scope | High | Escalate scope interpretation before apply |
| bcrypt 12 increases login latency | Medium | Staging measurement; override env var |
| Serializable retries/errors under contention | Medium | Test concurrency and document retry behavior |
| Per-package coverage below 60% | Medium | Use package thresholds rather than an artificial repo aggregate |

## Rollback Plan

Revert any chained PR independently. Lower bcrypt through `BCRYPT_COST_FACTOR_OVERRIDE`; disable the gate with `coverage.disabled=true`; revert clamp to 400 rejection and metrics wiring without touching prior M1–M4 behavior.

## Dependencies

`BCRYPT_COST_FACTOR_OVERRIDE`, `coverage.disabled`, and four 60% threshold settings; existing auth/database configuration remains required.

## Success Criteria

- `pnpm turbo run build lint typecheck test bdd` passes; coverage reports meet ≥60% lines, branches, functions, and statements.
- Concurrent demotion, bcrypt cost, circuit-breaker, metrics, clamp, and HMAC behavior are verified; admin axe audit has no serious/critical findings.
- Five PRs remain within the 400-LOC review budget and every English doc has a clean Spanish mirror.

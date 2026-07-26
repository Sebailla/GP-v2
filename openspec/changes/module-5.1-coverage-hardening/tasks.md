# Tasks: M5.1 — Coverage Hardening

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~200-400 (test infrastructure only, 2 PRs) |
| 400-line budget risk | Low |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 coverage gate + rate-limit race → PR #2 bcrypt timing widening |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Coverage gate + rate-limit race | PR #1 (base `feat/m5.1-coverage-hardening`) | `NODE_ENV=test pnpm turbo run test` | forced 50% summary run + 3× rate-limit suite | revert Vitest bumps + validator commit; no production code |
| 2 | Bcrypt timing widening + runbook | PR #2 (base PR #1) | `NODE_ENV=test pnpm turbo run test --coverage` | `BCRYPT_PERF_TEST=1` probe | revert test-budget + runbook commit |

## Carry-forward + threat→RED

Strict TDD RED→GREEN→TRIANGULATE→REFACTOR; atomic commits; pino [...];
`NODE_ENV=test` mandatory for every turbo command (Engram #2495).
Applicable threats: coverage gate (§7), bcrypt timing, rate-limit race.

## Phase 1 — Coverage Gate + Rate-Limit Race (PR #1)

Base `feat/m5.1-coverage-hardening`. Verify `NODE_ENV=test pnpm turbo run build lint typecheck test bdd`.

- [x] 1.1 RED `tools/coverage-validator.test.ts`: package below 60% → exit 1; at 60%+ → exit 0.
- [x] 1.2 GREEN `tools/coverage-validator.ts`: read each package's `coverage/coverage-summary.json`; compare against 60% threshold; exit 1 if below.
- [x] 1.3 RED `package.json` (root): bump Vitest to v4.2.5; if all 6 suites pass keep v4.2.5; else fall back to v4.1.9 + comparator.
- [x] 1.4 GREEN each `vitest.config.ts` (6 pkgs): verify `coverage.thresholds.global` at 60% per metric; update for v4.2+ format if needed.
- [x] 1.5 RED `tools/coverage-validator.test.ts`: stub a package summary at 50% → exit 1 with failing-package error message.
- [x] 1.6 GREEN `turbo.json`: add `coverage` task after `test`; runs `tools/coverage-validator.ts` per package.
- [x] 1.7 RED `apps/api/test/rate-limit.e2e-spec.ts`: 3 consecutive full runs show intermittent flake (race with coverage).
- [x] 1.8 GREEN `apps/api/test/rate-limit.e2e-spec.ts`: add `describe.serial` + `beforeEach`/`afterEach` resetting the rate-limit store and flushing timers.
- [x] 1.9 RED `apps/api/test/rate-limit.e2e-spec.ts`: 3 consecutive runs after stabilization — no flake.
- [x] 1.10 ES mirror `Documents-es/.../tasks.md`; verify 0 CJK.

## Phase 2 — Bcrypt Timing Widening + Runbook (PR #2)

Base PR #1. Verify `NODE_ENV=test pnpm turbo run build lint typecheck test bdd`.

- [ ] 2.1 RED `apps/api/test/auth-hash.bcrypt.test.ts`: cost 12 under coverage takes >500ms (reproduce flake).
- [ ] 2.2 GREEN `apps/api/test/auth-hash.bcrypt.test.ts`: timing assertion 500ms→1500ms; log `bcrypt cost-12: <elapsed> ms`.
- [ ] 2.3 RED `apps/api/test/auth-hash.bcrypt.test.ts`: cost 12 passes within 1500ms.
- [ ] 2.4 GREEN create `apps/api/test/auth-hash.bcrypt.perf.test.ts`: production-realistic 500ms probe gated by `BCRYPT_PERF_TEST=1`.
- [ ] 2.5 RED `apps/api/test/auth-hash.bcrypt.perf.test.ts`: when `BCRYPT_PERF_TEST=1` → cost 12 < 500ms.
- [ ] 2.6 GREEN `docs/operations/audit-retention-runbook.md`: add "Coverage Instrumentation Behavior" (D6): 1500ms budget under coverage, 500ms production SLA, dual-test pattern, `coverage.disabled=true` escape hatch.
- [ ] 2.7 ES mirror `Documents-es/docs/operations/audit-retention-runbook.md`: translate the new section.
- [ ] 2.8 ES mirror `Documents-es/.../tasks.md`; verify 0 CJK.
- [ ] 2.9 Final gate: `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` exit 0; `pnpm turbo run test --coverage` exit 0; 0 new warnings.

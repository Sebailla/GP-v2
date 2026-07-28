# Proposal: M5.1.1 — Coverage Housekeeping

## Intent

M5.1.1 closes the M5.1 verify-report carry-forward: `apps/api` branch coverage is 54.87% (below the 60% observability spec contract). M5.1.1 adds tests for the highest-impact uncovered branches (primarily `transactions.controller.ts` at 0%) until `apps/api` branch coverage exceeds 60% (target 65%). No production code, spec, or threshold changes — test infrastructure only. End-to-end: identify gaps → add tests (RED → GREEN) → re-run `coverage:validate` → re-verify M5.1 to PASS WITH WARNINGS → re-archive.

## Scope

**In** — add tests for uncovered branches in `apps/api/test/transactions/` (primary: `transactions.controller.ts` at 0%) and other low-coverage `apps/api/test/` files; lift `apps/api` branch coverage > 60% (target 65%); re-run `tools/coverage-validator.ts` and verify exit 0; re-write M5.1 verify-report to PASS WITH WARNINGS and re-archive.

**Out** — new product features; modify the spec threshold (60% stays the contract); production code changes beyond what tests require; refactor existing tests (only ADD); cross-package refactors.

## Capabilities

- **New**: None — M5.1.1 lifts existing test coverage; no new spec requirements.
- **Modified**: None — threshold and behavior stay as defined in the observability spec (no delta spec needed).

## Approach

| PR | Scope | LOC |
|---|---|---|
| #1 | Tests for uncovered branches in `apps/api` (primarily `transactions.controller.ts`); lift `apps/api` branch coverage > 60% | ≤ 400 |
| #2 | Final gate; re-write M5.1 verify-report to PASS WITH WARNINGS; re-archive M5.1 | ≤ 400 |

PR #1 → `feat/m5.1.1-coverage-housekeeping` (cut from `develop@92ddb06`); PR #2 → PR #1 per `feature-branch-chain`. Strict TDD: each test file lands as RED → GREEN → TRIANGULATE → REFACTOR in atomic commits.

## Affected Areas

- `apps/api/test/transactions/` — new tests for `transactions.controller.ts` (0% → ≥60%).
- `apps/api/test/` (other low-cov files) — new tests per per-package coverage report.
- M5.1 verify-report + ES mirror — rewritten FAIL → PASS WITH WARNINGS.

## Risks

- **Medium**: `transactions.controller.ts` at 0% needs extensive coverage. *Mitigation*: highest-impact branches first; validator enforces 60% (per spec), target 65% only.
- **Medium**: Web/libs packages also have uncovered branches. *Mitigation*: PR #1 = `apps/api` only; web/libs → future M5.1.2 slice.
- **Low**: Tests reveal latent bugs (M3 PR #80). *Mitigation*: RED first; if failing, log as M5.1.1 carry-forward.
- **Low**: Per-package threshold may differ from global 60%. *Mitigation*: out of scope per user; M5.1.1a spec amendment if discovered.

## Rollback Plan

Both PRs revert cleanly. Removing added tests restores prior coverage state. No production code to revert. `git revert <pr1-merge-sha>` and `git revert <pr2-merge-sha>`. M5.1 archive reverts to its prior FAIL verdict if PR #2 is reverted — acceptable.

## Dependencies

No new env vars, packages, or spec changes. Requires the M5.1 `tools/coverage-validator.ts` to remain the authoritative gate.

## Success Criteria

- `pnpm turbo run test --coverage` → `apps/api` branch coverage > 60% (target 65%).
- `NODE_ENV=test pnpm coverage:validate` → exit 0; no regressions.
- M5.1 verify-report rewritten to PASS WITH WARNINGS; M5.1 re-archived with PASS verdict.
- 2 chained PRs ≤ 400 LOC each; ES mirror in `Documents-es/` with 0 CJK.
- `pnpm turbo run build lint typecheck test bdd` exit 0.

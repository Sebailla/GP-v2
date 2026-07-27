# Tasks: M5.1.1 Coverage Housekeeping

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~400-800 (tests + runbook + verify-report) |
| 400-line budget risk | Low |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 lift + tests → PR #2 re-verify + re-archive |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Low

PR bases: #1 = `feat/m5.1.1-coverage-housekeeping` (tracker); #2 = #1. Final merge to `develop` after both approved.

## Carry-forward + threat→RED

Strict TDD RED→GREEN→TRIANGULATE→REFACTOR; atomic commits; pino [...]; `NODE_ENV=test` mandatory for every turbo command (see Engram #2495). Coverage gate (Applicable per design §7); transactions.controller.ts branch coverage (Applicable); Bcrypt timing (Applicable); Rate-limit test race (Applicable).

## Phase 1 — Coverage Lift (PR #1)

Base `feat/m5.1.1-coverage-housekeeping`. Verify `NODE_ENV=test pnpm turbo run test --coverage` shows apps/api branch coverage > 60%.

- [x] 1.1 RED `apps/api/test/transactions/transactions.controller.test.ts`: read controller source first; add tests for each uncovered branch (not-found, unauthorized, negative amount, forbidden, validation, etc.).
- [x] 1.2 GREEN same test file: new branch-test assertions pass.
- [x] 1.3 RED `apps/api/test/helpers/mint-jwt.test.ts`: cover uncovered branches in `apps/api/src/test/helpers/mint-jwt.ts` (57.14% per M5.1 verify-report).
- [x] 1.4 GREEN same test file: assertions pass.
- [x] 1.5 RED `apps/api/test/auth/auth-callback.workflow.test.ts` (if applicable): add tests for uncovered auth-callback branches. **N/A — `auth-callback.workflow.ts` does not exist in the codebase; the only adjacent source (`auth.controller.ts`) is at 64.7% branches and the only uncovered lines are doc comments. `apps/api` overall branch coverage is now 68.80% (well above the 60% threshold).**
- [x] 1.6 GREEN same test files: assertions pass. **N/A — same as 1.5; no test file required because there are no uncovered branches in the auth callback path.**
- [x] 1.7 RED `tools/coverage-validator.test.ts`: add M5.1.1 scenario — stub `apps/api` `coverage-summary.json` with branch < 60%; assert exit 1 + package name + pct + no per-package override.
- [x] 1.8 GREEN same test file: assertions pass; suite is now 12/12.
- [x] 1.9 `pnpm turbo run test --coverage` per package: apps/api branch > 60%; other packages maintain coverage.
- [ ] 1.10 RED `docs/operations/audit-retention-runbook.md` §8 addendum: M5.1.1 entry — per-package threshold fixed at 60%; only escape is `coverage.disabled=true`.
- [ ] 1.11 ES mirror `Documents-es/docs/operations/audit-retention-runbook.md` §8: Spanish translation of the addendum.
- [ ] 1.12 ES mirror `Documents-es/.../tasks.md`; verify 0 CJK.

## Phase 2 — Re-verify M5.1 (PR #2)

Base PR #1. Verify `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` + `pnpm coverage:validate` exit 0.

- [ ] 2.1 RED re-read `openspec/changes/archive/2026-07-26-module-5.1-coverage-hardening/verify-report.md`; understand current FAIL known-issue section.
- [ ] 2.2 GREEN same file: rewrite verdict FAIL → PASS WITH WARNINGS; update known-issue section to reference M5.1.1 closure.
- [ ] 2.3 GREEN ES mirror `Documents-es/openspec/changes/archive/2026-07-26-module-5.1-coverage-hardening/verify-report.md`: translate PASS WITH WARNINGS verdict.
- [ ] 2.4 RED `apps/api/test/coverage-validator.test.ts` integration check: after PR #1, `pnpm coverage:validate` asserts exit 0.
- [ ] 2.5 GREEN `pnpm turbo run test bdd`: BDD scenarios pass.
- [ ] 2.6 GREEN `pnpm coverage:validate` exits 0 — pipeline gate enforced; apps/api branch ≥ 60%.
- [ ] 2.7 GREEN `pnpm lint:fixtures` exits 0 — fixture gate still passes.
- [ ] 2.8 ES mirror `Documents-es/.../tasks.md`; verify 0 CJK.
- [ ] 2.9 Final gate: `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` + `pnpm coverage:validate` exit 0.
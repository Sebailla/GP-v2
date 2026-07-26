# Proposal: M5.1 — Coverage Hardening

## Intent

M5.1 closes the 3 carry-forward WARNINGs from the M5 verify-report: (1) coverage threshold process enforcement incomplete in Vitest v4.1.9 (API branch 55.15%, `test --coverage` exits 0); (2) bcrypt cost-12 timing test sensitive to CPU load + coverage; (3) coverage instrumentation can expose a rate-limit race. Vertical delivery: Vitest v4.2+ upgrade + timing budget widening + race fix + runbook. No production-code changes.

## Scope

**In** — Vitest v4.2+ upgrade across 6 packages; threshold exit-code verification (fallback: `tools/coverage-validator.ts`); bcrypt timing 500ms→1500ms; rate-limit race fix (serialize or unique counter); runbook entry.

**Out** — new features; security headers/CSP/secrets (AGENTS.md §11); threshold value changes (stays 60%); test-infrastructure refactors.

## Capabilities

### Modified
- `observability` (M5-introduced): +2 requirements — `Coverage Threshold Process Exit Code Enforcement` (process MUST exit non-zero when any package <60% even with no test failures) and `Bcrypt Cost-12 Timing Stability Under Instrumentation` (budget widens to 1500ms under coverage; documents the run-config override).

## Approach

| PR | Scope |
|---|---|
| #1 | Vitest v4.1.9→v4.2+ upgrade + threshold exit-code verify + rate-limit race fix |
| #2 | Bcrypt timing budget widening + runbook note |

Both ≤400 LOC. PR #1 → `feat/m5.1-coverage-hardening` (cut from `develop@4afb18d`); PR #2 → PR #1 per `feature-branch-chain`.

## Affected Areas

- `package.json` (root + 6) — vitest + @vitest/coverage-v8 bumps.
- `vitest.config.ts` per package — verify threshold enforcement.
- `apps/api/test/auth-hash.bcrypt.test.ts` — timing budget widening.
- `apps/api/test/rate-limit.e2e-spec.ts` — race stabilization.
- `tools/coverage-validator.ts` (new) — post-coverage comparator fallback.
- `docs/operations/audit-retention-runbook.md` + ES mirror — coverage instrumentation note.
- `openspec/specs/observability/spec.md` — +2 requirements, +6 scenarios.

## Risks

- **High**: Vitest v4.2+ breaks tests (NEXTAUTH, Prisma, jest-dom). *Mitigation*: upgrade isolated in PR #1; fallback to v4.1.9 + custom comparator.
- **Medium**: Vitest v4.2+ still doesn't exit non-zero on threshold. *Mitigation*: `tools/coverage-validator.ts` parses `coverage-summary.json`.
- **Medium**: Wider bcrypt budget hides real perf regression. *Mitigation*: log timing in CI.
- **Low**: Rate-limit serialization slows suite. *Mitigation*: serialize only the affected test.
- **Low**: Coverage baseline shifts. *Mitigation*: document new baseline.

## Rollback Plan

PR #1: revert Vitest bumps. PR #2: revert test-budget + runbook commit. Both via `git revert`. No production code touched.

## Dependencies

- `vitest` v4.2.x+ (NPM at apply).
- `@vitest/coverage-v8` compatible.
- No new env vars.

## Success Criteria

- `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` → exit 0.
- `pnpm turbo run test --coverage` → exit 0, all packages ≥60%.
- **Critical**: package forced <60% → coverage FAILS exit 1.
- Bcrypt timing passes within 1500ms under coverage.
- Rate-limit race absent across 3 consecutive runs.
- 0 production-code changes.
- ES mirror in `Documents-es/` with 0 CJK.
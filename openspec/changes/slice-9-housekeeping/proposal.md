# Proposal — slice-9-housekeeping

draft · 2026-07-14 · gp-v2 · auto · hybrid · single PR · Strict TDD ACTIVE, config/doc exception

## Intent

Drain maintenance debt from develop@0b4534b: 4 low-priority items (stale JSDoc, DOM whitespace in SessionList, auto-regen tracked, spec defect mandating // in strict JSON), all low-risk per explore.md.

## Scope

**In**: (1) setup.ts JSDoc L32-33 → vitest.config.ts:62-64, drop singleFork. (2a) Guard SessionList.tsx:60 vs empty statusText. (2b) Realistic statusText in mock Response (state-coverage.test.tsx:724-727). (3) Add next-env.d.ts to .gitignore + git rm --cached. (4) Amend fix-ci-env-propagation/spec.md R3+Q3+AC8: drop mandated // in turbo.json (RFC 8259 §2), mandate PR-body breadcrumb, preserve R3.

**Out/Non-goals**: production logic; same defect in fix-bdd-ci-zod-resolution/spec.md (deferred); new ESLint/CI/ADR/deps/features/tests/BDD.

## Capabilities

None new, none modified (doc correction).

## Approach

5 atomic commits: docs(test) · refactor(web) · test(web) · chore(git) · docs(spec). Item 1 NO mirror; Item 4 YES (same commit). Q4 addresses missing original mirror.

Rationale: (1) L84-89 already describes post-migration. (2a) 500 regex matches "500 " — DOM trailing space. (2b) Mirror NestJS InternalServerErrorException. (3) Next.js: not edited. (4) Stop future specs copying defect.

## Affected Files

| File | LOC | Mirror |
|------|-----|--------|
| setup.ts | +3/-3 | NO |
| SessionList.tsx | +2/-1 | NO |
| state-coverage.test.tsx | +1/0 | NO |
| .gitignore | +1/0 | NO |
| next-env.d.ts (rm --cached) | 0 | NO |
| fix-ci-env-propagation/spec.md | +15/-10 | YES |
| ES mirror (initial, Q4) | +15/-10 | (mirror) |

~37 net LOC.

## Goals

G1 setup.ts refs current lines; no singleFork. G2 SessionList guarded. G3 mock realistic statusText. G4 next-env.d.ts gitignored + untracked. G5 archived spec amended; original preserved. G6 ES mirror same commit. G7 CI gates green (22/22 + 145/145 + 43/43 + 4/4).

## Risks

R1 setup.ts removes context → minimal text preserves attribution. R2 SessionList regresses api → api doesn't test frontend; 145/145 gate. R3 mock breaks setup → only ADDS a field. R4 rm --cached irreversible → file auto-regens. R5 amend breaks traceability → original R3 preserved. R6 ES mirror drift (§13) → bundled same commit.

## Rollback

Per-commit git revert (§5). Items 1/2a/2b/4 restore prior text. Item 3 re-tracks file; next build recreates dirty file.

## Success Criteria

grep singleFork setup.ts → 0. grep statusText SessionList.tsx → guarded. git ls-files next-env.d.ts → empty. grep next-env.d.ts .gitignore → 1 match. grep // turbo fix-ci-env-propagation/spec.md → 0. ES mirror with amend. pnpm turbo build/lint/typecheck/test exits 0; web 145/145; bdd 43/43; lint:fixtures exits 0.

## Open Questions

Q1 HYBRID vs only? Rec: HYBRID. Q2 gitignore+untrack vs only? Rec: BOTH. Q3 preserve R3 vs replace? Rec: PRESERVE. Q4 ES mirror missing originally. Rec: bundle into Item 4. Q5 single PR? Rec: single.
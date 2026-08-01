# Spec — `fix-archive-mirrors`

> **Project**: `gastos-personales-reference` (`gp-v2`) · **Date**: 2026-07-14  
> **Status**: draft · **Mode**: auto · **Store**: hybrid · **Shape**: A (documentation-only) · **Delivery**: 7 chained PRs, oldest first

## 1. Header

This spec restores Spanish mirrors for seven archived OpenSpec changes. English Markdown is authoritative; translations MUST be hand-written in neutral professional Spanish. No source code is changed.

## 2. Intent

Restore AGENTS.md §13 compliance for 29 missing or partial archive mirrors while preserving reviewable, independently reversible per-archive commits.

## 3. Goals

- **G1**: Mirror `fix-api-nestjs-di` in PR 1.
- **G2**: Mirror `fix-bdd-tsx-node22` in PR 2.
- **G3**: Mirror `fix-state-coverage-drift` in PR 3.
- **G4**: Mirror `fix-vitest-4-deprecation` in PR 4.
- **G5**: Mirror `fix-web-vitest-crash` in PR 5.
- **G6**: Fill and verify `fix-ci-env-propagation` in PR 6.
- **G7**: Fill and verify `slice-8-closing-bdd-and-docs` in PR 7.
- **G8**: Complete the oldest-first chain with clean scope and no CJK drift.

## 4. Non-Goals

No source code, tooling, CI, ESLint, active-change mirror, ADR, or stray `-mirror/` folder changes. Existing partial files MUST NOT be retranslated or overwritten.

## 5. Functional Requirements

- **R1 (MUST)**: PR 1 MUST contain all five ES files for `2026-07-13-fix-api-nestjs-di`: `proposal.md`, `spec.md`, `design.md`, `tasks.md`, `explore.md`.
- **R2 (MUST)**: PR 2 MUST contain all five ES files for `2026-07-14-fix-bdd-tsx-node22`.
- **R3 (MUST)**: PR 3 MUST contain all five ES files for `2026-07-14-fix-state-coverage-drift`.
- **R4 (MUST)**: PR 4 MUST contain all four EN-equivalent ES files for `2026-07-14-fix-vitest-4-deprecation`: `proposal.md`, `spec.md`, `design.md`, `tasks.md`.
- **R5 (MUST)**: PR 5 MUST contain all five ES files for `2026-07-14-fix-web-vitest-crash`.
- **R6 (MUST)**: PR 6 MUST add the four missing files for `2026-07-14-fix-ci-env-propagation` and verify its existing `spec.md` is intact.
- **R7 (MUST)**: PR 7 MUST add the three missing files for `2026-07-13-slice-8-closing-bdd-and-docs` and verify its existing `design.md` is intact.
- **R8 (MUST)**: Each PR MUST use one atomic five-file-batch (or the archive's actual 3/4/5-file batch) commit and MUST be independently revertible.
- **R9 (MUST)**: All seven PRs MUST merge in order: PR 1 through PR 7.
- **R10 (MUST)**: Every ES file MUST pass `perl -ne 'print if /\p{Han}/'`; the command MUST produce no output.
- **R11 (SHOULD)**: Each PR SHOULD use the `docs(mirrors):` title prefix and `[mirror-batch]` label or description marker.
- **R12 (MUST)**: Every PR MUST touch only its own `Documents-es/openspec/changes/archive/<archive>/` subtree; no source-code file MAY be modified.

## 6. Scenarios

```gherkin
Scenario: fix-api-nestjs-di archive has 5 ES files
  Given the fix-api-nestjs-di archive landed on develop
  When PR 1 lands with hand-translated ES files
  Then its ES directory MUST contain proposal.md, spec.md, design.md, tasks.md, explore.md
  And each file MUST pass the CJK drift check

Scenario: fix-bdd-tsx-node22 archive has 5 ES files
  Given PR 1 is merged
  When PR 2 lands
  Then its ES directory MUST contain all five EN-equivalent files
  And each file MUST pass the CJK drift check

Scenario: fix-state-coverage-drift archive has 5 ES files
  Given PRs 1 and 2 are merged
  When PR 3 lands
  Then its ES directory MUST contain all five EN-equivalent files
  And each file MUST pass the CJK drift check

Scenario: fix-vitest-4-deprecation archive has 4 ES files
  Given PRs 1 through 3 are merged
  When PR 4 lands
  Then its ES directory MUST contain proposal.md, spec.md, design.md, tasks.md
  And each file MUST pass the CJK drift check

Scenario: fix-web-vitest-crash archive has 5 ES files
  Given PRs 1 through 4 are merged
  When PR 5 lands
  Then its ES directory MUST contain all five EN-equivalent files
  And each file MUST pass the CJK drift check

Scenario: fix-ci-env-propagation partial mirror is completed
  Given its existing ES spec.md is intact
  When PR 6 lands
  Then design.md, explore.md, proposal.md, and tasks.md MUST exist
  And the existing spec.md MUST remain unchanged

Scenario: slice-8-closing-bdd-and-docs partial mirror is completed
  Given its existing ES design.md is intact
  When PR 7 lands
  Then proposal.md, spec.md, and tasks.md MUST exist
  And the existing design.md MUST remain unchanged

Scenario: PRs merge in chain order
  Given PRs 1-7 each merge in sequence
  When the chain completes
  Then all seven PRs MUST be merged
  And develop MUST contain all 29 ES files

Scenario: All ES files pass CJK drift check
  Given all seven PRs are merged
  When the archive-wide Han-codepoint command runs
  Then no output MUST be produced

Scenario: AGENTS.md §13 compliance is restored
  Given all seven PRs are merged
  When every in-scope EN archive is compared with its ES mirror
  Then 7 of 7 archives MUST show complete mirrors

Scenario: The chain touches documentation only
  Given all seven PRs are merged
  When the chain diff is listed
  Then every changed path MUST end in .md
  And no .ts, .tsx, .json, .cjs, .sh, .yml, or .yaml path MAY appear

Scenario: Stray mirror folders remain deferred
  Given the three stray -mirror folders exist
  When this change completes
  Then they MUST remain untouched
  And a new Engram observation MUST document them as deferred cleanup
```

## 7. Constraint Surface

EN archive files are the source of truth. Translation MUST preserve paths, code identifiers, versions, commands, and technical industry terms. PRs are documentation-only, hand-translated, neutral Spanish, oldest-first, and independently revertible. The 400-line review budget drives chaining despite the aggregate size.

## 8. Test Plan

| Check | Expected |
|---|---|
| EN/ES filename comparison per archive | No missing or extra in-scope files |
| `perl -ne 'print if /\p{Han}/'` per ES file | Empty output |
| `pnpm lint:fixtures` per PR | Exit 0 |
| `git diff --name-only` per PR | Only that archive's ES subtree |
| Final archive audit | 7/7 complete mirrors; 29 files |

## 9. Acceptance Criteria

R1-R7, R10, and R12 pass; R8-R9 are evidenced by seven ordered atomic commits/PRs; R11 is applied where repository labels permit. Existing partial files are intact, three stray folders are untouched, and the final audit reports zero missing in-scope mirrors.

## 10. Out of Scope

The three stray `-mirror/` folders, active changes, already-complete ADR mirrors, source code, CI, ESLint, package configuration, and automated translation are excluded.

## 11. Open Questions — Resolved

- **Q1**: 7 chained PRs, not one mega-PR.
- **Q2**: Oldest-first order.
- **Q3**: Yes, mark each PR as a mirror batch.
- **Q4**: Yes, verify and fill both partial mirrors.
- **Q5**: No, stray folders remain out of scope and are only documented.
- **Q6**: Hand translation only.

## 12. Traceability

| Requirements | Goals |
|---|---|
| R1-R7 | G1-G7 |
| R8-R9 | G1-G8 |
| R10 | G8 |
| R11 | G8 |
| R12 | G8 |

---

## Relevant Files

- `openspec/changes/fix-archive-mirrors/proposal.md` — scope and delivery decision.
- `openspec/changes/fix-archive-mirrors/explore.md` — audit inventory and verification baseline.
- `Documents-es/openspec/changes/archive/` — destination for the 29 mirrors.

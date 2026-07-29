# Tasks — `slice-8-closing-bdd-and-docs`

> **Status**: draft · tasks phase · **Date**: 2026-07-12
> **Project**: `gastos-personales-reference` · **Branch**: `develop` (`bb25aab`) · tracker `feat/v1.1.2-slice-8-closing-bdd-and-docs`
> **Mode**: interactive · **Artifact store**: hybrid · **Delivery**: `ask-on-risk` · **Chain**: `feature-branch-chain` · **Review budget**: 400 lines / PR
> **Strict TDD**: active (AGENTS.md §4; `openspec/config.yaml strict_tdd: true`)
> **Approval inputs**: `proposal.md` (Engram #2226), `spec.md` (Engram #2228), `design.md` (Engram #2229)
> **Slice-7 close**: `bb25aab` · **Bridge-fix pattern**: `a9b550d`
> **8.4 split (5-PR per user-locked decision)**: A1, A2, B1, B2, C; all five flags over `yes`

---

## Conventions used in this file

- **Work-unit commits**: every commit MUST be independently revertible. Tests land in the same commit as the behavior they verify. Docs land in the same commit as their `Documents-es/` mirror (AGENTS.md §13).
- **No "Co-Authored-By"** trailers (AGENTS.md §6 / project rule).
- **Conventional Commits**: `type(scope): subject` — imperative, ≤72 chars, no trailing period.
- **RED before GREEN**: any commit that adds production code MUST be preceded (or paired in the same commit) by a failing test. For 8.4 docs prose no Vitest RED test exists; verification is via `wc -l`, `grep`, and the `no-mojibake-in-docs` rule (declared at design §8 / spec §8.4 "Test strategy").
- **MUST / SHALL / MUST NOT** are RFC 2119; anything weaker (should, may) is non-binding.
- **`feat/v1.1.2-…`** tracker branch pattern mirrors slice-7's tracker; minor version bump because this is a feature slice, not a patch.

---

## PR #1 — Sub-slice 8.1 — Auth BDD bridge fix

- **PR title**: `feat(auth): slice 8 PR-1 — auth BDD bridge GREEN (mirrors transactions fix)`
- **Branch name**: `feat/v1.1.2-slice-8-auth-bridge`
- **Base branch**: `develop` (the **first** child PR targets the tracker; tracker targets `develop`)
- **Tracker branch (created first)**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (created off `develop` before any child branch)
- **Sub-slice**: 8.1
- **Estimated LOC**: ~180 (150 in port + 177 of new test minus register.ts space saved + 1 vitest config line)
- **ask-on-risk trigger**: **No** (Low risk, ~180 LOC, within budget)
- **Sub-slice atomic commits** (RED-first per strict TDD):

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `test(auth): add RED register.test.ts mirroring transactions bridge test` | Bridge contract has no test today; copy transactions test shape verbatim (3 assertions: wrapper arity + world-off-`.inner`, capture-group regex, `setWorldConstructor` invoked at load). Commit lands RED (2 FAIL) — proves the bug is real before any production code is touched. |
| 2 | `feat(auth): vitest include docs/__tests__ to enable bridge test discovery` | `libs/features/auth/server/vitest.config.ts` does NOT include `../docs/__tests__/**/*.test.ts` — without this 1-line bump commit #1's test is undiscovered by `pnpm --filter @features/auth test`. Fix is mechanical and MUST precede or accompany the GREEN commit. |
| 3 | `feat(auth): port transactions buildWrapper into auth bridge register.ts` | GREEN commit. Port `buildWrapper`, `countStringPlaceholders`, `buildPattern` (lines 72-118 / 143-165 of transactions register.ts) verbatim. Substitute the four strings + the `TxWorld → AuthWorld` import. Introduce `setWorldConstructor(AuthWorldWrapper)` mirroring lines 125-129. Commit #1's test now PASSES; bridge BDD runs without timeouts. |

- **Files touched** (with LOC delta):
  - `libs/features/auth/docs/support/register.ts` — REWRITE: 80 → ~180 LOC (+100)
  - `libs/features/auth/docs/__tests__/register.test.ts` — NEW: ~177 LOC
  - `libs/features/auth/server/vitest.config.ts` — +1 LOC (3rd include entry)
  - Total: +278 LOC
- **Verification commands** (orchestrator runs ALL of these; PR is green only when all exit 0):
  ```bash
  # RED proof: revert commit #3 locally — `pnpm --filter @features/auth test` MUST report 2 FAIL.
  # GREEN proof (this PR state):
  pnpm --filter @features/auth test           # 2/2 PASS on register.test.ts
  pnpm --filter @features/auth bdd           # 18/18 PASS, <2s
  pnpm --filter @features/transactions bdd   # 25/25 PASS (no regression)
  git diff --stat bb25aab..HEAD -- libs/features/transactions/   # empty
  ```
- **Out of scope for this PR** (apply MUST NOT touch these):
  - `libs/features/auth/docs/cucumber.mjs`
  - `libs/features/auth/docs/support/env-bootstrap.js`
  - `libs/features/auth/docs/support/service-context.ts`
  - Any `libs/features/auth/docs/*.feature`
  - Any `libs/features/auth/docs/step-defs/*.steps.ts`
  - `libs/features/transactions/docs/support/register.ts` (canonical source)
  - `.github/workflows/ci.yml`, `eslint.config.mjs`, anything in `docs/` or `Documents-es/`

---

## PR #2 — Sub-slice 8.2 — BDD as a CI gate

- **PR title**: `ci(workflows): slice 8 PR-2 — BDD (Cucumber) gate with Postgres service`
- **Branch name**: `feat/v1.1.2-slice-8-ci-bdd-gate`
- **Base branch**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; PR #1 must merge first)
- **Sub-slice**: 8.2
- **Estimated LOC**: ~30 (5th job block replaces the lines 187-196 placeholder comment)
- **ask-on-risk trigger**: **No** (Low risk, ~30 LOC)
- **Sub-slice atomic commits**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `ci(workflows): replace BDD/e2e placeholder with BDD (Cucumber) job` | Append the `bdd:` block from design §3.1 verbatim (services: postgres:16-alpine + healthcheck, env block mirroring `test` job, prisma generate/deploy, `pnpm turbo run bdd`). Remove the lines 187-196 placeholder comment block. Preserves trigger set; `needs: [static, test]`; `timeout-minutes: 30`. No e2e job (deferred). Single commit because the YAML shape is inseparable from its placement + removal of the placeholder. |

- **Files touched** (with LOC delta):
  - `.github/workflows/ci.yml` — append 5th job (+30 LOC, -10 placeholder comment = +20 net)
  - Total: +20 LOC
- **Verification commands**:
  ```bash
  # YAML shape (local):
  node -e "const yaml=require('yaml');const fs=require('fs');const j=yaml.parse(fs.readFileSync('.github/workflows/ci.yml','utf8'));console.log(Object.keys(j.jobs||{}));"
  # Expect exactly: [ 'static', 'build', 'test', 'e2e', 'bdd' ] (e2e is the deferred placeholder; bdd is the new one — verify ordering + presence)
  grep -q "bdd:" .github/workflows/ci.yml && grep -q "needs: \[static, test\]" .github/workflows/ci.yml && grep -q "postgres:16-alpine" .github/workflows/ci.yml && grep -q "pnpm turbo run bdd" .github/workflows/ci.yml && echo OK
  # Trigger set unchanged:
  grep -A4 "^on:" .github/workflows/ci.yml
  # Lint:
  pnpm lint:fixtures
  # No regressions to other jobs:
  pnpm turbo run static test build
  # Action required (post-merge): open a test PR; confirm `BDD (Cucumber)` check appears; revert auth bridge; confirm check FAILS; revert the revert.
  ```
- **Out of scope for this PR**:
  - Adding Playwright e2e job (the deferred half of the placeholder)
  - Adding `actions/upload-artifact` (GitHub retains step logs 90 days)
  - YAML anchor extraction (rejected at design §3.2)
  - Changing the `on:` trigger set
  - Any code change outside `.github/workflows/ci.yml`

---

## PR #3 — Sub-slice 8.3 — Markdown lint wiring

- **PR title**: `chore(lint): slice 8 PR-3 — wire @eslint/markdown and activate no-mojibake-in-docs at lint time`
- **Branch name**: `feat/v1.1.2-slice-8-markdown-lint`
- **Base branch**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; can run **in parallel with PR #4-#8** after PR #1+PR #2 merge — zero deps on docs sub-slice)
- **Sub-slice**: 8.3
- **Estimated LOC**: ~50 (1 import + 1 parser block + 1 rule block + 6 LOC fixture + runner multi-invalid branch + production-tree scan ~10 LOC)
- **ask-on-risk trigger**: **No** (Low risk, ~50 LOC, well within budget)
- **Sub-slice atomic commits**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `test(lint): add RED triangulation fixture for no-mojibake-in-docs (secondCjkLine)` | RED per strict TDD. Add `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md` with a single CJK codepoint on **line 5** (NOT line 1), forcing the rule to scan the full document, not the first line. The new fixture is rejected by the runner's "ambiguous invalid" branch (line 137-145 of `run-fixtures.mjs`) → RED: `pnpm lint:fixtures` exits non-zero. |
| 2 | `chore(deps): pin @eslint/markdown@8.0.3 (exact, no caret)` | Exact pin to `8.0.3` at root `package.json` `devDependencies`. Pin is mandatory per slice-1 §5 Stack-churn mitigation + spec §8.3 lines 329-336 (the parser has shipped breaking parser-API changes historically). Document the bump procedure in the commit body. |
| 3 | `feat(lint): wire @eslint/markdown parser and Documents-es/**/*.md rule block` | Two `eslint.config.mjs` insertions per design §4.2: (a) parser block for `**/*.md` with `markdownParser`; (b) rule-application block for `Documents-es/**/*.md` that reuses the existing `boundary` import (line 13) and applies `no-mojibake-in-docs` at severity `error`. Commit #1's fixture now is reachable by ESLint; `pnpm lint` exits non-zero on `Documents-es/docs/architecture.md` if a CJK char is added (round-trip). |
| 4 | `feat(lint-runner): support multi-invalid fixtures for no-mojibake-in-docs only` | GREEN-1/2. Per design §4.4 Option A: add `allowMultipleInvalids: true` boolean to the `RULES` array entry for `no-mojibake-in-docs`; guard the existing "ambiguous invalid" throw (lines 137-145) so multi-invalid is permitted only when the flag is set. Other 4 `.ts` rules retain their exactly-one invariant. |
| 5 | `feat(lint-runner): scan production Documents-es/**/*.md for CJK` | GREEN-2/2. Per design §4.5: after the per-rule fixture loop, glob `Documents-es/**/*.md`, run `findCjkInText` on each, exit 1 with the offending file path on any hit. Excludes `__fixtures__/` via the existing `eslint.config.mjs` line 30 ignore. |

- **Files touched** (with LOC delta):
  - `package.json` (root) — +1 devDep entry (`@eslint/markdown: 8.0.3`)
  - `eslint.config.mjs` — +1 import, +2 config blocks (~12 LOC)
  - `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` — multi-invalid branch + production-tree scan (~25 LOC)
  - `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md` — NEW (~6 LOC)
  - Total: ~44 LOC
- **Verification commands**:
  ```bash
  # Pin:
  node -e "const p=require('./package.json');console.log(p.devDependencies['@eslint/markdown'])" # "8.0.3" exact, no caret
  # Fixture (commits 1, 4):
  pnpm lint:fixtures
  # Expect all 5 entries PASS: invalid.md, secondCjkLine.invalid.md, valid.md, plus the 4 .ts rules.
  # Negative round-trip (commit 3):
  cp Documents-es/docs/architecture.md /tmp/x.md
  printf '\xe6\xbc\xa2' >> /tmp/x.md
  # Re-run production scan; expect FAIL with offending file + offset.
  mv /tmp/x.md Documents-es/docs/architecture.md
  pnpm lint:fixtures   # RED demonstration: must fail.
  # Reverse the mutation:
  git checkout Documents-es/docs/architecture.md
  pnpm lint:fixtures   # back to GREEN
  # Other 4 rules unaffected:
  grep -c '"invalid"' tools/eslint-plugin-boundary/__fixtures__/{no-prisma-outside-core,no-schemas-outside-shared,no-client-server-import,no-cross-module-import}/invalid.{ts,md} 2>&1 | grep -v ':1$' || echo "OTHER-RULES-INVARIANT-INTACT"
  ```
- **Out of scope for this PR**:
  - Refactoring `tools/eslint-plugin-boundary` to TypeScript (out-of-scope item 7)
  - Adding more rules beyond `no-mojibake-in-docs`
  - Touching `package.json` deps other than `@eslint/markdown`
  - Touching `docs/` or `Documents-es/` content (this PR adds NO new mirrors; only validates existing ones)

---

## PR #4 — Sub-slice 8.4 PR-A1 — Architecture prose §1-§6 (English only)

- **PR title**: `docs(architecture): slice 8 PR-4 — architecture prose sections 1-6 (EN)`
- **Branch name**: `feat/v1.1.2-slice-8-docs-arch-a1`
- **Base branch**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; parallelizable with PR #3 + PR #5-#8 after PR #1+PR #2 merge)
- **Sub-slice**: 8.4 PR-A1
- **Estimated LOC**: ~350 (sections 1-6 EN; no mirror in this PR)
- **ask-on-risk trigger**: **No** (Low/Med; ≤350 LOC is the user's threshold for auto-proceed; the `ask-on-risk` is for PR-A2 onwards)
- **Sub-slice atomic commits**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `docs(architecture): rewrite stub sections 1-3 (overview, repo layout, monorepo tooling)` | First half of PR-A1. Sections 1-3 per design §5.1 table: `# Architecture` + Overview + non-goals (~40 LOC), `## Repository layout` (~100 LOC), `## Monorepo tooling` (~60 LOC). Total ~200 LOC. No Spanish mirror yet (separate commit in PR-A2). |
| 2 | `docs(architecture): add sections 4-6 (auth, transactions, libs/core)` | Second half of PR-A1. Section 4 (`## Domain design — auth`), Section 5 (`## Domain design — transactions`), Section 6 (`## libs/core (database, events, config)`). ~150 LOC. Each section opens with an imperative invariant statement, ends with `{ #section-N }` anchor. PR-A1 total ~350 LOC. |

- **Files touched** (with LOC delta):
  - `docs/architecture.md` — REWRITE: 77 → ~350 LOC (+273 LOC)
  - Total: +273 LOC
- **Verification commands**:
  ```bash
  wc -l docs/architecture.md                                # expect ~350 (under 400, ≥300)
  grep -cE '^## ' docs/architecture.md                       # expect 6 section headings (1-6)
  grep -qE '^# Architecture' docs/architecture.md && echo "title-ok"
  for n in 1 2 3 4 5 6; do
    grep -qE "^## .*\\(section-$n\\)|{ #section-$n }" docs/architecture.md || echo "MISSING-anchor-$n"
  done
  # Section budgets (from spec §8.4 table 462):
  pnpm lint:fixtures                                        # docs untouched → still green
  git diff --stat bb25aab..HEAD -- docs/ Documents-es/ | tail -1   # architecture EN only
  ```
- **Out of scope for this PR**:
  - Sections 7-12 (PR-A2)
  - Any `Documents-es/` file (mirror in PR-A2 per AGENTS.md §13)
  - `docs/migration-playbook.md` and `scripts/migrate/*.sh`
  - Code/test changes anywhere outside `docs/architecture.md`

---

## PR #5 — Sub-slice 8.4 PR-A2 — Architecture prose §7-§12 (English) + Full Spanish mirror

- **PR title**: `docs(architecture): slice 8 PR-5 — architecture §7-12 EN + full ES mirror`
- **Branch name**: `feat/v1.1.2-slice-8-docs-arch-a2`
- **Base branch**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker)
- **Sub-slice**: 8.4 PR-A2
- **Estimated LOC**: ~550 (sections 7-12 EN ~200 LOC + full ~350 LOC mirror = ~550)
- **ask-on-risk trigger**: **Yes** (High; 550 LOC > 400 budget; orchestrator MUST stop before apply and ask the user per `delivery_strategy=ask-on-risk` — confirm the split OR accept a `size:exception`)
- **Sub-slice atomic commits**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `docs(architecture): add sections 7-12 (utils, slicing, BDD, ESLint, branches, glossary)` | Sections 7-12 per design §5.1: `## libs/shared-utils` (~25 LOC), `## Slicing contract` (~60 LOC), `## BDD colocated strategy` (~40 LOC), `## ESLint boundaries` (~60 LOC), `## Branch model + SDD workflow` (~40 LOC), `## Glossary + cross-references` (~25 LOC). Total ~250 LOC. Combined with PR-A1's ~350 LOC, `docs/architecture.md` lands at ~600 LOC (hard cap per spec). |
| 2 | `docs(architecture): mirror to Spanish (Documents-es/docs/architecture.md)` | AGENTS.md §13 hard rule: every EN doc ships with its ES mirror in the same atomic commit. Technical translation per design §5.4. Sections 7-12 translated freshly; sections 1-6 mirror PR-A1's wording. Industry-standard English terms stay in English (`commit`, `merge`, `branch`, `ADR`, `PR`, `slice`, `feature`, `workspace`, etc.). File paths and code-block contents stay verbatim. |

- **Files touched** (with LOC delta):
  - `docs/architecture.md` — append sections 7-12 (+250 LOC; total now ~600 LOC, at hard cap)
  - `Documents-es/docs/architecture.md` — NEW (mirror) ~600 LOC
  - Total: ~850 LOC (LOC delta of the PR is what triggers ask-on-risk; combined ~600 LOC EN expansion on top of PR-A1's already-merged ~350 LOC)
- **Verification commands**:
  ```bash
  # EN:
  wc -l docs/architecture.md                                       # 550-600 (cap per spec §8.4)
  grep -cE '^## ' docs/architecture.md                             # 12 section headings
  # ES mirror + CJK clean (AGENTS.md §13 + design §5.4):
  ls Documents-es/docs/architecture.md && wc -l Documents-es/docs/architecture.md   # exists, ~600
  grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture.md   # MUST exit 1 (no match)
  echo "mojibake-check: $?"                                        # 1
  # ESLint rule fires:
  pnpm lint && echo "ESLINT-OK"                                    # exits 0 with rule active
  # LOC distribution mirrors:
  diff <(awk '/^## /{print}' docs/architecture.md) <(awk '/^## /{print}' Documents-es/docs/architecture.md) | head -5
  # Expected: 0 diff lines (heading set identical)
  ```
- **Out of scope for this PR**:
  - `docs/migration-playbook.md` (PR-B1 starts that)
  - `scripts/migrate/*.sh` (PR-C)
  - Modifying the EN prose; this PR is append-only (sections 1-6 already merged in PR-A1)
  - Any non-doc/Markdown-es file

---

## PR #6 — Sub-slice 8.4 PR-B1 — Migration playbook §1-§7 (English only)

- **PR title**: `docs(playbook): slice 8 PR-6 — migration playbook sections 1-7 (EN)`
- **Branch name**: `feat/v1.1.2-slice-8-docs-playbook-b1`
- **Base branch**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; parallelizable with PR #3 / PR #7 / PR #8)
- **Sub-slice**: 8.4 PR-B1
- **Estimated LOC**: ~550 (sections 1-7 EN, including the 21 fenced-block pairs mandated by spec §8.4 scenario 575-577 for stages 00-50)
- **ask-on-risk trigger**: **Yes** (High; 550 LOC > 400 budget; orchestrator MUST stop per `ask-on-risk`)
- **Sub-slice atomic commits**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `docs(playbook): add sections 1-3 (purpose + stages 00, 10) with ≥3 before/after snippets each` | Section 1 (`# Migration playbook` + Purpose/audience) ~40 LOC. Section 2 (`## Stage 00 — preflight`) ~80 LOC with 3 before/after snippet pairs (72 LOC of fenced blocks). Section 3 (`## Stage 10 — extract domain`) ~120 LOC with 3 snippet pairs. Total ~240 LOC. |
| 2 | `docs(playbook): add sections 4-5 (stages 20, 30) with ≥3 before/after snippets each` | Section 4 (`## Stage 20 — create feature slice`) ~120 LOC. Section 5 (`## Stage 30 — wire routes`) ~100 LOC. Each with 3 before/after snippet pairs (≥42 fenced blocks cumulating). Total ~220 LOC. |
| 3 | `docs(playbook): add sections 6-7 (stages 40, 50) with ≥3 before/after snippets each` | Section 6 (`## Stage 40 — port tests (Vitest + BDD)`) ~100 LOC. Section 7 (`## Stage 50 — update docs`) ~80 LOC. 3 snippet pairs each. Total ~180 LOC. |

- **Files touched** (with LOC delta):
  - `docs/migration-playbook.md` — NEW ~640 LOC (3 commits land ~640 LOC; PR-B1 budget ~550 is the EN portion excluding the final sections 8-11)
  - Total: +640 LOC (exceeds the per-PR-#-6 row's ~550 estimate because the design table on line 513 budgeted for sections 1-7 only; PR #6 will land slightly over the design estimate if sections overlap. The orchestrator's ask-on-risk threshold is 400 LOC strict; this PR is well over and triggers ask-on-risk.)
- **Verification commands**:
  ```bash
  wc -l docs/migration-playbook.md                                  # expect ~640 (PR-B1 stops before sections 8-11)
  grep -cE '^## ' docs/migration-playbook.md                        # 7 section headings (1-7)
  # Spec §8.4 scenario 575: ≥42 fenced blocks (= 3 snippets × 2 fences × 7 stages)
  grep -cE '^\s*```' docs/migration-playbook.md                     # expect ≥42
  # Each stage has 3 before/after pairs:
  for s in 00 10 20 30 40 50; do
    n=$(awk "/^## Stage $s/,/^## Stage /" docs/migration-playbook.md | grep -cE '^\s*```')
    [ "$n" -ge 6 ] || echo "MISSING-snippets-stage-$s (got $n fences; need >= 6 = 3 pairs)"
  done
  pnpm lint:fixtures                                                 # ESLint clean (no EN-side change to Documents-es)
  git diff --stat bb25aab..HEAD -- Documents-es/ | tail -1          # Documents-es unchanged in PR-B1
  ```
- **Out of scope for this PR**:
  - Sections 8-11 of the playbook (PR-B2)
  - Spanish mirror of any section (PR-B2)
  - `scripts/migrate/*.sh` (PR-C; the prose references them by name only — see spec §8.4 line 564)
  - Any code/test/file outside `docs/migration-playbook.md`

---

## PR #7 — Sub-slice 8.4 PR-B2 — Migration playbook §8-§11 (English) + Full Spanish mirror

- **PR title**: `docs(playbook): slice 8 PR-7 — playbook §8-11 EN + full ES mirror`
- **Branch name**: `feat/v1.1.2-slice-8-docs-playbook-b2`
- **Base branch**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; parallelizable with PR #3 / PR #8)
- **Sub-slice**: 8.4 PR-B2
- **Estimated LOC**: ~700 (sections 8-11 EN ~330 LOC + full EN→ES mirror ~620 LOC = ~950 LOC)
- **ask-on-risk trigger**: **Yes** (High; 950 LOC net; orchestrator MUST stop per `ask-on-risk` — user confirms the split OR accepts `size:exception`)
- **Sub-slice atomic commits**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `docs(playbook): add sections 8-9 (stage 99 finalize, ESLint enforcement loop)` | Section 8 (`## Stage 99 — finalize`) ~75 LOC. Section 9 (`## ESLint boundaries as the enforcement loop`) ~40 LOC. Total ~115 LOC. |
| 2 | `docs(playbook): add sections 10-11 (when @core/events, glossary) + cross-refs` | Section 10 (`## When to introduce @core/events`) ~40 LOC. Section 11 (`## Cross-references + glossary`) ~25 LOC. Closes the playbook at ~750-820 LOC total (EN). |
| 3 | `docs(playbook): mirror to Spanish (Documents-es/docs/migration-playbook.md)` | AGENTS.md §13: ES mirror ships in the same atomic commit-or-commit-chain as the EN it mirrors. Full technical Spanish translation of the entire `docs/migration-playbook.md` (sections 1-11). Industry-standard English terms per design §5.4 list. Fenced code blocks remain verbatim (never translated). |

- **Files touched** (with LOC delta):
  - `docs/migration-playbook.md` — append sections 8-11 (+ ~180 LOC)
  - `Documents-es/docs/migration-playbook.md` — NEW ~750 LOC
  - Total: ~930 LOC
- **Verification commands**:
  ```bash
  # EN total:
  wc -l docs/migration-playbook.md                                   # 750-820 (cap 1000)
  grep -cE '^## ' docs/migration-playbook.md                         # 11 (sections 1-11)
  # Final fenced-block count:
  grep -cE '^\s*```' docs/migration-playbook.md                      # ≥ 42 (3 × 2 × 7 stages minimum per spec §8.4)
  # ES mirror:
  wc -l Documents-es/docs/migration-playbook.md                      # 700-900
  diff <(grep -E '^## ' docs/migration-playbook.md) <(grep -E '^## ' Documents-es/docs/migration-playbook.md) | head -5
  echo "heading-parity: $?"                                           # expect 0
  # CJK clean:
  grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/migration-playbook.md ; echo "mojibake-exit: $?"  # 1 = no match
  # ESLint fires (commit 3 of PR #3 + this PR's mirror both pass):
  pnpm lint && echo "ESLINT-OK"
  # Section §10 mentions @core/events:
  grep -E '^## When to introduce @core/events' docs/migration-playbook.md && echo "events-section-ok"
  ```
- **Out of scope for this PR**:
  - `scripts/migrate/*.sh` (PR-C)
  - Modifying EN sections 1-7 (already merged via PR-B1)
  - Code/test/Markdown-es changes other than the two named files
  - Migrating `gastos-personales/` (out-of-scope item 3)

---

## PR #8 — Sub-slice 8.4 PR-C — Seven idempotent migrate scripts + idempotency test

- **PR title**: `feat(migrate): slice 8 PR-8 — seven idempotent stage scripts + shell idempotency test`
- **Branch name**: `feat/v1.1.2-slice-8-migrate-scripts`
- **Base branch**: `feat/v1.1.2-slice-8-closing-bdd-and-docs` (tracker; parallelizable with PR #6 / PR #7 / PR #3)
- **Sub-slice**: 8.4 PR-C
- **Estimated LOC**: ~150 (7 × ~10 LOC shells + ~50 LOC idempotency bash test + shared `ensure-tools.sh` helper)
- **ask-on-risk trigger**: **No** (Low risk; net LOC well within budget)
- **Sub-slice atomic commits**:

| # | Commit | Subject | Why |
|---|--------|---------|-----|
| 1 | `feat(scripts): create scripts/migrate/ with ensure-tools.sh and 00-preflight.sh` | RED scaffold + first GREEN. Create `scripts/` directory + `scripts/migrate/ensure-tools.sh` (shared helper verifying `pnpm`/`docker`/`git`/Node 22 presence). `00-preflight.sh` runs `ensure-tools.sh` + `git status --porcelain` (empty required), prints `preflight: OK` on success, `preflight: already applied` on re-run. Idempotency: re-running on a clean branch is no-op. |
| 2 | `feat(scripts): add 10-extract-domain.sh and 20-create-feature-slice.sh` | Stages 10 and 20. Both follow the common header (`set -euo pipefail` + slice-1 Locked #4 header comment) and the idempotency contract from design §5.3. `10-extract-domain.sh <feature>` guards on non-empty target (exit 0 + `already applied`). `20-create-feature-slice.sh <feature>` guards on existing slice dir. |
| 3 | `feat(scripts): add 30-wire-routes.sh and 40-port-tests.sh` | Stages 30 and 40. `30-wire-routes.sh <feature>` is itself idempotent for the `tsconfig.base.json` paths append (skip if `@features/<feature>` already in file). `40-port-tests.sh <feature>` counts tests before/after; the second run prints `already applied` if count unchanged. |
| 4 | `feat(scripts): add 50-update-docs.sh and 99-finalize.sh` | Stages 50 and 99. `50-update-docs.sh <feature>` checks for the `{ #<feature> }` anchor in both `docs/architecture.md` and its ES mirror before exiting (idempotency). `99-finalize.sh <feature>` runs `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @features/<feature> bdd`; uses a marker file `.migration-<feature>-done` for idempotency. |
| 5 | `test(scripts): add idempotency.test.sh — every script runs twice, exits 0 both runs` | RED then GREEN. For each of the 7 scripts: spawn the script in a temp git worktree from a clean branch, run it twice, assert exit 0 on both. Assert the second invocation prints `already applied` (or stage-NN-equivalent). Use a minimal bash loop (no `bats` dependency per design §5.3 / open question §12.2 recommendation). |

- **Files touched** (with LOC delta):
  - `scripts/migrate/ensure-tools.sh` — NEW ~15 LOC
  - `scripts/migrate/00-preflight.sh` — NEW ~20 LOC
  - `scripts/migrate/10-extract-domain.sh` — NEW ~15 LOC
  - `scripts/migrate/20-create-feature-slice.sh` — NEW ~15 LOC
  - `scripts/migrate/30-wire-routes.sh` — NEW ~15 LOC
  - `scripts/migrate/40-port-tests.sh` — NEW ~15 LOC
  - `scripts/migrate/50-update-docs.sh` — NEW ~15 LOC
  - `scripts/migrate/99-finalize.sh` — NEW ~25 LOC
  - `scripts/migrate/__tests__/idempotency.test.sh` — NEW ~50 LOC
  - Total: ~185 LOC
- **Verification commands**:
  ```bash
  # Shellcheck (project policy + design §5.3):
  shellcheck scripts/migrate/*.sh scripts/migrate/__tests__/idempotency.test.sh && echo "shellcheck-ok"
  # Idempotency test runs twice per script:
  bash scripts/migrate/__tests__/idempotency.test.sh   # exits 0; reports 7 PASS
  # Round-trip a fake migration:
  bash scripts/migrate/00-preflight.sh                 # "preflight: OK"
  bash scripts/migrate/00-preflight.sh                 # "preflight: already applied" (or no-op equivalent)
  # Common header enforced on all 7:
  for f in scripts/migrate/*.sh; do
    head -5 "$f" | grep -q '^set -euo pipefail$' || echo "MISSING-strict-mode: $f"
  done
  # Each script's idempotency marker exists:
  grep -E 'already applied|already finalized' scripts/migrate/*.sh | wc -l   # expect ≥ 7 (one per script)
  # No regression to docs (lint-rule fixture still passes):
  pnpm lint:fixtures
  ```
- **Out of scope for this PR**:
  - `bats` as a test framework (design rejected; bash loop is used)
  - Actually migrating `gastos-personales/` (out-of-scope item 3)
  - Adding new slices — the scripts receive `<feature>` as a positional arg
  - Anything under `docs/` or `Documents-es/`
  - Changing YAML, ESLint config, or any code outside `scripts/migrate/`

---

## Dependency graph (after user splits 8.4 into 5 PRs)

```
                bb25aab (develop)
                       │
                       ▼
       [tracker] feat/v1.1.2-slice-8-closing-bdd-and-docs
                       │
        ┌──────────────┼───────────────────────────────┐
        │              │                               │
        ▼              ▼                               ▼
    PR #1            PR #2                         (remaining)
   8.1 auth          8.2 BDD                       PRs open
   bridge            CI gate                       against tracker
   (merge first)     (depends on                   in parallel
        │            PR #1 having
        │            merged — the
        │            `needs: [static,
        │            test]` job runs
        │            only if PR #1
        │            fix is on develop)
        ▼
  After both #1, #2 merge into develop,
  the tracker rebases/fast-forwards:
                  PR #3              PR #4           PR #5         PR #6          PR #7         PR #8
                  8.3 markdown       8.4 arch        8.4 arch      8.4 play-      8.4 play-     8.4 migrate
                  lint               §1-6 EN         §7-12 EN+ES   book §1-7 EN   book §8-11+ES scripts
                  (no deps)          (no deps)       (after #4)    (no deps)      (after #6)    (no deps)
                  └──────┬───────────┴──────┬────────┴──────┬──────┴──────┬───────┘
                         │                  │               │             │
                         └────── parallel against tracker after PR #1 + PR #2 merge ──────┘
                                                  │
                                                  ▼
                                       tracker stays open/draft
                                       until all 8 PRs merged
                                                  │
                                                  ▼
                                   squash-merge tracker → develop
```

- **Hard ordering**: PR #1 MUST land before PR #2 (CI BDD job would otherwise lock on broken auth).
- **Parallelizable**: PR #3, PR #4, PR #6, PR #8 — zero mutual dependencies; open against tracker.
- **Soft ordering**:
  - PR #5 depends on PR #4 (PR #5 appends to `docs/architecture.md`; PR #4 created it). If sequential the orchestrator MUST serialize.
  - PR #7 depends on PR #6 (PR #7 closes the playbook). If sequential the orchestrator MUST serialize.
- **All five 8.4 PRs can run independently** if the orchestrator is willing to overwrite the same file in parallel (UNSAFE — they touch the same English source); the dependency chain documents the safe order.

## PR-chain target branch

`feat/v1.1.2-slice-8-closing-bdd-and-docs` (mirror slice-7's tracker convention; minor version bump from `v1.0.x` because this is a feature slice, not a patch).

- Created off `develop` as the first action of the apply phase.
- Stays **draft / no-merge** until all 8 child PRs land (per chained-pr skill `feature-branch-chain` contract).
- **PR #1 targets `develop`** (the tracker is created right before PR #1 opens; PR #1 retargets to tracker for the second push, or PR #1 targets the freshly-created tracker from the start — the chained-pr skill instructs "child PR #1 targets the tracker branch"). Decision: **PR #1 targets the tracker**, not `develop`. Subsequent children also target the tracker; the tracker rebases onto `develop` after each merge.
- Final squash-merge of the tracker into `develop` closes slice 8; `develop` advances from `bb25aab`.

## Apply strategy

The orchestrator applies **one PR at a time** because each opens a GitHub PR and awaits merge. Order:

```
1. Create tracker: feat/v1.1.2-slice-8-closing-bdd-and-docs off develop
2. Open PR #1 (8.1) targeting tracker → wait merge
3. Open PR #2 (8.2) targeting tracker → wait merge
4. Rebase tracker onto develop (already ahead thanks to #1, #2)
5. Open PRs #3, #4, #6, #8 in parallel against tracker → wait merges (independent)
6. Open PR #5 (8.4 PR-A2) targeting tracker → ask-on-risk → wait merge
7. Open PR #7 (8.4 PR-B2) targeting tracker → ask-on-risk → wait merge
8. Squash-merge tracker → develop
9. Verify on develop:
   pnpm turbo run static build lint typecheck test bdd
   pnpm lint:fixtures
   grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md  # expect exit 1
```

Concrete `feat/*` branches:

```bash
# 1. tracker
git checkout -b feat/v1.1.2-slice-8-closing-bdd-and-docs develop
git push -u origin feat/v1.1.2-slice-8-closing-bdd-and-docs

# 2. PR #1 child off tracker
git checkout -b feat/v1.1.2-slice-8-auth-bridge feat/v1.1.2-slice-8-closing-bdd-and-docs
# ... commits 1-3 ...
git push -u origin feat/v1.1.2-slice-8-auth-bridge
gh pr create --base feat/v1.1.2-slice-8-closing-bdd-and-docs --title "feat(auth): slice 8 PR-1 — auth BDD bridge GREEN" --body-file .github/PULL_REQUEST_TEMPLATE.md

# 3. PR #2 child off tracker (after #1 merge)
git checkout -b feat/v1.1.2-slice-8-ci-bdd-gate feat/v1.1.2-slice-8-closing-bdd-and-docs
# ...

# 4. parallel PRs #3, #4, #6, #8
# ... all branched off the tracker, all opened at the same time ...

# 5-6. PR #5 and PR #7 each block on ask-on-risk; orchestrator MUST pause before apply

# 7. squash-merge tracker
gh pr merge --squash <tracker-PR-number>  # after all 8 children merged
```

## Review Workload Forecast

| PR  | Sub-slice                | Branch                                              | est. LOC | budget (400) | ask-on-risk |
| --- | ------------------------ | --------------------------------------------------- | -------: | :----------: | :---------: |
| 1   | 8.1 auth BDD bridge      | `feat/v1.1.2-slice-8-auth-bridge`                   |    ~180  |    OK        |     No      |
| 2   | 8.2 CI BDD gate          | `feat/v1.1.2-slice-8-ci-bdd-gate`                   |     ~20  |    OK        |     No      |
| 3   | 8.3 markdown lint wire   | `feat/v1.1.2-slice-8-markdown-lint`                 |     ~50  |    OK        |     No      |
| 4   | 8.4 PR-A1 (arch §1-6 EN) | `feat/v1.1.2-slice-8-docs-arch-a1`                  |    ~273  |    OK        |     No      |
| 5   | 8.4 PR-A2 (arch §7-12 + ES) | `feat/v1.1.2-slice-8-docs-arch-a2`               |    ~850  |   OVER       | **YES**     |
| 6   | 8.4 PR-B1 (playbook §1-7 EN) | `feat/v1.1.2-slice-8-docs-playbook-b1`           |    ~640  |   OVER       | **YES**     |
| 7   | 8.4 PR-B2 (playbook §8-11 + ES) | `feat/v1.1.2-slice-8-docs-playbook-b2`         |    ~930  |   OVER       | **YES**     |
| 8   | 8.4 PR-C (7 sh + test)   | `feat/v1.1.2-slice-8-migrate-scripts`               |    ~185  |    OK        |     No      |
|     | **TOTAL**                |                                                       |  **~3128** |             |             |

**Re-split option that the orchestrator MUST surface at apply time if ask-on-risk triggers** (per design §5.5 / spec §8.4 review-workload table 698-707):

| Alternative | Sub-slice contents | est. LOC |
| --- | --- | --- |
| alt-8.4 #6s | Split PR #6 into PR-#6a (playbook §1-4 EN) + PR-#6b (playbook §5-7 EN) | ~320 + ~320 |
| alt-8.4 #7s | Split PR #7 into PR-#7a (playbook §8-11 EN) + PR-#7b (full ES mirror) | ~180 + ~620 |
| alt-8.4 #5s | Split PR #5 into PR-#5a (arch §7-12 EN) + PR-#5b (full ES mirror) | ~250 + ~600 |
| `size:exception` | Accept PRs #5/#6/#7 at their natural sizes | +0 |

The orchestrator MUST present the user's three options (further-split, `size:exception`, or defer 8.4 docs to slice 9) per `delivery_strategy=ask-on-risk`.

## Out of scope (whole slice)

(Mirror of proposal §4 + spec §"Out of scope"; orchestrator MUST enforce.)

1. Anything in AGENTS.md §11 — i18n beyond en/es, Sentry, rate-limit, OAuth beyond Google, prod hardening, observability, audit log UI, coverage gate enforcement at CI, migration of `gastos-personales/`.
2. Adding new BDD scenarios (slice 8 only fixes the bridge).
3. Migrating `gastos-personales/` to vertical slicing.
4. Touching the slice-7 chain evidence (`a9b550d`, `bb25aab`).
5. Adding the Playwright e2e job to CI (deferred; the `e2e:` placeholder key in `ci.yml` after this slice is unchanged in name; this slice only adds `bdd:`).
6. Replacing the `a9b550d` bridge pattern with anything else.
7. Refactoring `tools/eslint-plugin-boundary` to TypeScript.
8. Non-English artifact language (UI strings, comments, identifiers remain English; Spanish lives only in the mirror).
9. Adding a coverage gate to CI.
10. Building the OneNote mirror automation.
11. Touching `openspec/changes/vertical-slicing-reference-scaffold/` (slice-1 umbrella is immutable).
12. Renaming conventions: `@eslint/markdown@8.0.3` exact pin (no other bumps).
13. PR-C is NOT a `feat:` commit for the production code base — it adds only `scripts/migrate/` and its test (no `src/` changes).

## Cross-references

- **Proposal**: `openspec/changes/slice-8-closing-bdd-and-docs/proposal.md` (Engram #2226)
- **Spec**: `openspec/changes/slice-8-closing-bdd-and-docs/spec.md` (Engram #2228)
- **Design**: `openspec/changes/slice-8-closing-bdd-and-docs/design.md` (Engram #2229)
- **Slice-7 close-out**: `bb25aab` on `develop` (squash of PR-51; 25/25 transactions BDD PASS)
- **Bridge-fix pattern**: commit `a9b550d` (`libs/features/transactions/docs/support/register.ts` lines 72-118 / 125-129 / 143-165)
- **Transactions test template**: `libs/features/transactions/docs/__tests__/register.test.ts` (177 LOC)
- **Slice-1 Locked Decision #4 (playbook dual format)**: `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` line 93
- **Slice-1 task T8.5 (7-script contract)**: `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` line 876
- **AGENTS.md §4 (strict TDD)**, **§5 (atomic commits)**, **§6 (conventional commits)**, **§7 (boundaries)**, **§8 (SSoT)**, **§11 (out-of-scope)**, **§13 (Spanish mirror hard rule)**
- **openspec/config.yaml**: `strict_tdd: true`, `delivery_strategy: ask-on-risk`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

## Status

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (work-unit-commits, branch-pr, chained-pr, tdd) · `risks`: R1 (INFO — auth world-contract divergence resolved at spec §"Resolved open questions" + design §2.6), R2 (WARNING — PRs #5/#6/#7 exceed 400; ask-on-risk triggers per design §10), R3 (SUGGESTION — `@eslint/markdown@8.0.3` pin exact; bump procedure in PR #3 commit body), R4 (WARNING — `vitest.config.ts` include bump is in-scope for PR #1 per design §2.5), R5 (SUGGESTION — runner multi-invalid branch is per-rule boolean per design §4.4; other 4 rules retain single-invalid discipline).

`next_recommended`: **`apply`** — orchestrator creates the tracker, then applies PRs in the order above (PR #1 first; PR #3+#4+#6+#8 parallel after PR #1+PR #2 merge; PR #5/#7 each gated by ask-on-risk).

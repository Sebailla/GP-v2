# Tasks — `slice-9-housekeeping` — `gastos-personales-reference`

**Project**: `gastos-personales-reference`
**Branch**: `develop` (working) · `main` (immutable)
**Tracker branch**: `feat/slice-9-housekeeping` (off develop)
**Artifact store**: hybrid (openspec files + Engram)
**Mode**: auto (gatekeeper validates between phases)
**Date**: 2026-07-15
**Author**: SDD orchestrator → `sdd-tasks` (executor)
**Status**: Planning complete; user will pause before sdd-apply
**PR count**: 1 (~37 net LOC; well under 400-line review budget)

> Four minor housekeeping items bundled into a single PR (~37 net LOC across 7 file operations): stale JSDoc line refs in `apps/web/__tests__/setup.ts`, SessionList DOM trailing-whitespace hardening (`apps/web/components/auth/SessionList.tsx`) + the matching `statusText: "Internal Server Error"` mock field in `apps/web/__tests__/components/transactions/state-coverage.test.tsx`, untracking the Next 16 auto-regen `apps/web/next-env.d.ts` (`.gitignore` entry + `git rm --cached`), and amending `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` R3 + Q3 + AC8 to drop the mandated `// turbo` JSON comments (RFC 8259 §2 — strict JSON has no comments) + creating the missing `Documents-es/` Spanish mirror (initial mirror per AGENTS.md §13). Strict TDD's RED step is satisfied vacuously per AGENTS.md §4 for the doc + config items; Item 2's HYBRID 2D shape (component guard + mock hardening) carries its own RED via the new `statusText` field. Baseline preserved: 22/22 apps/api + 145/145 apps/web + 43/43 BDD.

---

## Conventions used in this file

- **Work-unit commits**: every commit MUST be independently revertible. Tests land in the same commit as the behavior they verify. The change folder specs (`proposal.md`, `spec.md`, `design.md`, `tasks.md`) are coordination artifacts, not user-facing docs — no Spanish mirror required (orchestrator instruction + `fix-bdd-tsx-node22` + `fix-api-nestjs-di` + `fix-state-coverage-drift` + `fix-web-vitest-crash` + `fix-vitest-4-deprecation` precedents).
- **No "Co-Authored-By"** trailers (AGENTS.md §6 + persona hard rule).
- **Conventional Commits**: `type(scope): subject` — imperative, ≤72 chars, no trailing period.
- **RED before GREEN** (AGENTS.md §4): T1, T3, T4 are vacuously satisfied per the exception for pure config / docs files. T2 follows the HYBRID 2D shape from `design.md` §3 — the component hardening adds the `statusText` guard (DOM hygiene); the mock hardening ADDs the `statusText: "Internal Server Error"` field (regression guard). T5 is the gate marker.
- **`MUST / SHALL / MUST NOT`** are RFC 2119; anything weaker (should, may) is non-binding.
- The 5 tasks below map **1:1** to the 5 atomic commits in `design.md` §4. **No 6th commit. No merging of T1-T4.**
- T1-T4 are **mutually independent** (no shared files, no shared state). T4's initial ES mirror is bundled into the same atomic commit as the EN amend per AGENTS.md §13 — they belong together.

---

## §1. Dependency graph

```
T1 (apps/web/__tests__/setup.ts JSDoc)        — independent
T2 (SessionList DOM + test mock)              — independent
T3 (.gitignore + git rm --cached next-env)    — independent
T4 (archived spec amend + ES mirror)          — independent of T1-T3
    │
    ▼
T5 (chore verify marker)                      — depends on T1-T4
```

**Execution order invariant**: T1 → T2 → T3 → T4 → T5. Tasks T1-T4 MAY execute in any order (they touch disjoint files), but T5 MUST be last — it observes the cumulative GREEN state across all 4 work units and records the binary gates in a paper-trail commit body so a reviewer can verify each gate independently from the GREEN-causing changes.

---

## §2. Per-task tables (5 tasks)

### T1 — refresh `apps/web/__tests__/setup.ts` JSDoc to current `vitest.config.ts` line numbers

| Field | Value |
|-------|-------|
| Commit | `chore(test): apps/web/__tests__/setup.ts — refresh JSDoc line refs to current vitest config` |
| Files | `apps/web/__tests__/setup.ts` (EDIT, L32-37, net ~+4 / −4 raw) |
| Depends on | — (independent; first task on the branch) |
| LOC | ~0 net (paraphrase; small wording refresh) |
| TDD | n/a per AGENTS.md §4 (doc-only change inside test-infra file). RED = current JSDoc references `vitest.config.ts:62-66` for the `pool: "forks"` block which sits at L62-64 in the post-`fix-vitest-4-deprecation` config (post-PR #69). GREEN = post-edit JSDoc references `L62-64` and drops the now-defunct `singleFork: true` mention. No test count drift: 145/145 preserved. |
| Edit | **(A)** Replace the 3 stale lines at L32-34 (`vitest.config.ts:62-66 … poolOptions.forks.singleFork: true`) with the current shape: cite `vitest.config.ts:62-64` (the post-`fix-vitest-4-deprecation` `pool: "forks"` + `maxWorkers: 1` + `isolate: false` triple). **(B)** Drop the sentence at L36-37 about `singleFork: true` (no longer relevant after PR #69's vitest 4 migration). **(C)** Add a one-line breadcrumb pointing to the `fix-vitest-4-deprecation` slice and the upstream Vitest 4 migration guide (`https://vitest.dev/guide/migration#pool-rework`). **(D)** LEAVE the newer JSDoc block at L84-89 (the `fix-vitest-4-deprecation` post-migration paragraph) UNTOUCHED. The rest of the file (`vi.mock` for `next/navigation`, `vi.mock` for `@auth/prisma-adapter`, `beforeAll` setup) is UNTOUCHED. Spec R6 + R7 enforced. |
| Verify | **(G1)** `grep -n 'vitest.config.ts:' apps/web/__tests__/setup.ts` shows the new line-range reference `L62-64` (or current line numbers) for the `pool` block. **(G2)** `grep -c 'singleFork' apps/web/__tests__/setup.ts` returns 0. **(G3)** `grep -n 'migration#pool-rework' apps/web/__tests__/setup.ts` returns ≥1 hit. **(G4)** `pnpm --filter web test` exits 0 with `Tests 145 passed (145)` (baseline preserved). **(G5)** `grep -c 'singleFork' apps/web/vitest.config.ts` returns 0 (no accidental regression on the source of truth). **(G6)** `git diff --name-only origin/develop..HEAD | grep -E '__tests__/setup\.ts$'` returns exactly 1 line. **(G7)** `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json | grep -E '"vitest"\s*:'` is empty (vitest stays at 4.1.9). |

---

### T2 — SessionList DOM hardening + realistic mock `statusText` (HYBRID 2D)

| Field | Value |
|-------|-------|
| Commit | `fix(web): SessionList error render — guard against empty statusText + realistic mock Response statusText` |
| Files | `apps/web/components/auth/SessionList.tsx` (EDIT, L60, ~+1 / −1 raw) · `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (EDIT, L724-727, +3 lines additive) |
| Depends on | — (independent of T1, T3, T4) |
| LOC | ~+3 net (DOM guard + mock field) |
| TDD | HYBRID 2D per `design.md` §3: **(RED-1, component)** the existing `/500/i` test still passes (it was matching the trailing-space substring `"500 "` — empirically confirmed in `proposal.md` Engram `#2408` discovery). The new guard is **DOM hygiene**, not a behavior fix; verified by a post-edit snapshot that the rendered DOM contains `500` with a non-space separator. **(RED-2, mock)** the new `statusText: "Internal Server Error"` field is the regression guard: it makes the mock semantically faithful to a real `Response` so the component's guarded render path is exercised. If a future regression drops the guard, the rendered DOM regresses to `<span>500 </span>` (trailing space) — the next slice's spec author can spot this without an empirical Playwright run. Spec R1 + R2 enforced. |
| Edit — file A | `apps/web/components/auth/SessionList.tsx` at L60 (the `error.statusText` span). **(A)** Replace the current `{error.statusText}` with a guarded render that falls back to a literal `"Error"` token when `error.statusText` is empty/falsy/whitespace-only. The production path (`error.statusText === "Internal Server Error"`) MUST remain byte-identical; the guard only changes the rendering for empty/missing/whitespace values. **(B)** Preserve the surrounding `<span>` + className + surrounding JSX structure (Tailwind class `text-xs text-red-700` and any sibling text nodes). **(C)** Add a one-line JSDoc above the guarded expression citing Spec R1 and naming the regressed DOM shape it prevents (`<span>500 </span>` trailing-whitespace artifact). The rest of the file (imports, `useSession` calls, skeleton/loading branches) is UNTOUCHED. |
| Edit — file B | `apps/web/__tests__/components/transactions/state-coverage.test.tsx` at L724-727 (the 500-status mock in the error-response scenario). **(A)** ADD a `statusText: "Internal Server Error"` field to the `new Response(JSON.stringify(...), { status: 500 })` constructor's second argument (additive only — does not modify the existing `status: 500` or `headers`). **(B)** Do NOT modify the JSON body, the test name, the assertion, or the surrounding scenario structure. **(C)** The new field makes the mock semantically match what `fetch` returns in production for a 500 — this is the regression guard that exercises the new component code path. |
| Verify | **(G1)** `pnpm --filter web test` exits 0 with `Tests 145 passed (145)` (baseline preserved; 3 consecutive runs catch non-determinism). **(G2)** `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 0 with 25 PASS / 0 FAIL (state-coverage surface stays green). **(G3)** `pnpm --filter api test` exits 0 with 22/22 PASS (api untouched — SessionList is frontend-only). **(G4)** `grep -n 'statusText' apps/web/components/auth/SessionList.tsx` returns ≥2 hits (the prop type at the top + the guarded render at L60). **(G5)** `grep -n 'statusText' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns ≥1 hit in the 500 mock block. **(G6)** `git diff --name-only origin/develop..HEAD | grep -E 'SessionList\.tsx$'` returns exactly 1 line. **(G7)** `git diff --name-only origin/develop..HEAD | grep -E 'state-coverage\.test\.tsx$'` returns exactly 1 line. **(G8)** `pnpm turbo run typecheck` exits 0 (TS narrowing on the new guard holds). |

---

### T3 — untrack Next 16 auto-regen `apps/web/next-env.d.ts` (gitignore + `git rm --cached`)

| Field | Value |
|-------|-------|
| Commit | `chore(git): untrack apps/web/next-env.d.ts — Next 16 auto-regen file belongs in .gitignore` |
| Files | `.gitignore` (EDIT, append 1 line: `apps/web/next-env.d.ts`) · `git rm --cached apps/web/next-env.d.ts` (INDEX op) |
| Depends on | — (independent of T1, T2, T4) |
| LOC | +1 net (1 line in `.gitignore`; index op is 0 file content) |
| TDD | n/a per AGENTS.md §4 (`.gitignore` config + git index op). RED = pre-commit `git ls-files apps/web/next-env.d.ts` returns 1 line (file currently tracked at HEAD `0b4534b`). GREEN = post-commit `git ls-files apps/web/next-env.d.ts` returns empty AND `git status` shows the file as untracked. The file auto-regens on next `next build`; `git revert` of this commit cleanly re-tracks the file (revert undoes both the `.gitignore` entry AND the index op). Spec R4 enforced. |
| Edit — file A | `.gitignore`. **(A)** Append `apps/web/next-env.d.ts` as a new line at the END of the file (alphabetical placement OK; do NOT add to the existing `next-env.d.ts` block — currently absent, verified by grep). **(B)** Do NOT add wildcard patterns (`next-env.d.ts` is only emitted by `apps/web/`; other workspaces do not use Next). **(C)** Add a one-line comment above the new line citing the Next 16 docs URL for `next-env.d.ts` auto-generation. The rest of `.gitignore` (the ~30 existing entries: `node_modules/`, `.next/`, `dist/`, `.turbo/`, `coverage/`, `*.tsbuildinfo`, IDE folders, etc.) is UNTOUCHED. |
| Edit — file B | Git index only — NO working-tree change. **(A)** Run `git rm --cached apps/web/next-env.d.ts` to remove the file from the index WITHOUT deleting the working-tree copy. **(B)** The working-tree file (`apps/web/next-env.d.ts` ~165 bytes) remains on disk so `next dev` / `next build` does not break between commit and next regen. **(C)** Do NOT add the file's content to `.gitignore` comments; the pattern in `.gitignore` matches the file path. |
| Verify | **(G1)** `git ls-files apps/web/next-env.d.ts` returns empty (file untracked from index). **(G2)** `git status --porcelain apps/web/next-env.d.ts` returns `?? apps/web/next-env.d.ts` (untracked prefix `??`). **(G3)** `grep -n 'next-env\.d\.ts' .gitignore` returns ≥1 hit. **(G4)** `grep -n 'next-env\.d\.ts' .gitignore | wc -l` returns 1 (no duplicate line). **(G5)** `ls -la apps/web/next-env.d.ts` returns the file on disk (working-tree copy preserved). **(G6)** `pnpm turbo run build` exits 0 (`next build` regenerates the file; build succeeds even with the file absent from index). **(G7)** `git revert <this-commit-sha>` cleanly restores the tracking (smoke test: do NOT actually run revert; reason it would work: the commit contains the `.gitignore` append + the `git rm --cached` op; `git revert` undoes both). **(G8)** `pnpm --filter web test` exits 0 with 145/145 (the untracked file does not affect the test pipeline — `vitest` does not pick it up because it's outside the `include` glob). |

---

### T4 — amend archived `fix-ci-env-propagation` spec R3 + Q3 + AC8 + create initial ES mirror

| Field | Value |
|-------|-------|
| Commit | `docs(spec): fix-ci-env-propagation — amend R3 + Q3 + AC8 (drop mandated // in strict JSON) + initial ES mirror` |
| Files | `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` (EDIT, 3 sections) · `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` (NEW, hand-translated mirror) |
| Depends on | — (independent of T1, T2, T3) |
| LOC | ~+22 net (8 lines amend on EN side, ~60 lines NEW ES mirror, 0 lines deleted) |
| TDD | n/a per AGENTS.md §4 (docs only). RED = archived spec currently mandates `// turbo strict-mode strips undeclared env vars` + `// must stay in sync with .github/workflows/ci.yml BDD job env block` as in-line `turbo.json` comments (R3 L115-127, AC8 L399, Q3 L471-475) — INTERNAL CONTRADICTION with AC10's `cat turbo.json | python3 -m json.tool` exits 0 strict-JSON invariant. The apply phase correctly honored AC10 over R3; PR body carried the rationale. GREEN = post-amend spec mandates the rationale lives in the PR body (not in `turbo.json`), preserves the original R3 text verbatim under a `> **Superseded by**` blockquote (no information destruction), and the EN/ES pair is CJK-clean. Spec R5 + R8 + R9 enforced. |
| Edit — file A (EN) | `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md`. **(A)** Section R3 (L115-127): rewrite the SHALL to mandate that the rationale lives in the PR body (not in `turbo.json` source). Cite Spec AC10's strict-JSON invariant as the reason. Preserve the original R3 text verbatim under a `> **Superseded by** R3 amendment (slice 9): the rationale moves to the PR body, not to `turbo.json` source — strict JSON (RFC 8259 §2) does not permit `//` comments. Original text follows: ...` blockquote. **(B)** Section Q3 (L471-475): same treatment — preserve original verbatim, note the resolution moved to PR body. **(C)** AC8 row (L399): change the acceptance gate from "turbo.json source contains the rationale as `//` lines" to "PR body contains the rationale; `cat turbo.json | python3 -m json.tool` exits 0". **(D)** Update the spec header's "Last amended" footer to `2026-07-15 (slice-9-housekeeping: R3 + Q3 + AC8 amended — see Superseded by notes)`. **(E)** Do NOT touch other R1, R2, R4-R13, Q1, Q2, Q4-Q7, AC1-AC7, AC9-AC12 sections. The rest of the file is UNTOUCHED. |
| Edit — file B (ES mirror, NEW) | `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md`. **(A)** Create the directory `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/` (does not exist; verified by `ls`). **(B)** Hand-translate the amended EN spec to neutral/professional Spanish (NOT auto-translated). Established technical terms (commit, merge, branch, ADR, PR, build, deploy, RFC, JSON, BDD, CI) stay in English. **(C)** Mirror the structure 1:1 — same 12 sections, same heading levels, same Superseded-by blockquote placement, same Last-amended footer (translated). **(D)** Verify NO CJK / ideographic codepoints (Chinese, Japanese, Korean) appear anywhere in the file — `perl -ne 'print if /\p{Han}/'` MUST return empty. **(E)** Bundle this file in the SAME atomic commit as the EN amend (per AGENTS.md §13 — every `.md` produced under `openspec/` MUST have its `Documents-es/` mirror in the same commit). |
| Verify | **(G1)** `grep "// turbo" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty (no `// turbo` lines remain). **(G2)** `grep "// must stay" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty. **(G3)** `grep "Superseded by" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns ≥3 hits (R3 + Q3 + AC8 each carry one). **(G4)** `cat openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md | python3 -m json.tool` — N/A (file is Markdown, not JSON; instead run `pnpm lint:fixtures` which validates the EN mirror). **(G5)** `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty (CJK-clean). **(G6)** `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty (CJK-clean — AGENTS.md §13 hard-rule verification). **(G7)** `ls Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns the file path (ES mirror exists). **(G8)** `git diff --name-only origin/develop..HEAD | grep -E 'fix-ci-env-propagation/spec\.md$'` returns 2 lines (both EN and ES — same atomic commit). **(G9)** `pnpm lint:fixtures` exits 0 (boundary plugin stays silent on the new content). **(G10)** `git log --format=%B origin/develop..HEAD | grep -F "Co-authored-by"` returns empty (no AI attribution per AGENTS.md §6 + persona hard rule). |

---

### T5 — verification marker (all 4 work units green + clean working tree)

| Field | Value |
|-------|-------|
| Commit | `chore(verify): pnpm turbo run test bdd lint typecheck build exits 0 — slice 9 housekeeping green marker` |
| Files | (no file changes — empty verification marker commit) |
| Depends on | T1, T2, T3, T4 |
| LOC | 0 / 0 |
| TDD | n/a (gate marker). Captures the binary R6 + R7 + R9 + R10 + R11 acceptance in the commit body so a reviewer can verify each gate independently from the GREEN-causing changes in T1-T4. Body MUST cite the spec requirement IDs (`R1`-`R11`) and the design §3 steps 3-7. The orchestrator MAY elide this commit at apply time if the same verification runs in CI and reports the same facts; the design keeps it as an option per AGENTS.md §5 (atomic-commit hygiene — verification observations live on the commit that observed them, not on the commit that caused them). |
| Verify | **(VM1)** `pnpm --filter web test` exits 0 with `Tests 145 passed (145)` (re-confirms T1's G4 + T2's G1 baseline). **(VM2)** `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 0 with 25 PASS / 0 FAIL (re-confirms T2's G2). **(VM3)** `pnpm --filter api test` exits 0 with 22/22 PASS (re-confirms T2's G3). **(VM4)** `pnpm turbo run bdd` exits 0 with 43 scenarios (unchanged baseline). **(VM5)** `pnpm turbo run lint typecheck` exits 0 (re-confirms T2's G8). **(VM6)** `pnpm turbo run build` exits 0 (re-confirms T3's G6). **(VM7)** `pnpm lint:fixtures` exits 0 (boundary plugin silent on T4's mirror). **(VM8)** `git ls-files apps/web/next-env.d.ts` returns empty (re-confirms T3's G1). **(VM9)** `git status --porcelain | grep -v '^?? \.codegraph/' | wc -l` returns 0 (clean working tree modulo `.codegraph/`). **(VM10)** `git log feat/slice-9-housekeeping --pretty=format:"%B" | grep -i "co-authored-by"` returns empty (no AI attribution). **(VM11)** `git log feat/slice-9-housekeeping --pretty=format:"%s"` shows exactly 5 commits (T1 → T5), each subject matches `^(fix|chore|docs)(\(.+\))?: .+` and is ≤72 chars. **(VM12)** `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty (re-confirms T4's G5). |

---

## §3. PR plan (single PR)

**PR title**: `chore: slice 9 housekeeping — drain 4 minor maintenance items`

**Branch**: `feat/slice-9-housekeeping` (cut from `develop` at HEAD `0b4534b`)

**Base branch**: `develop` (NOT `main` — AGENTS.md §2)

**Merge strategy**: squash-merge at PR end. The 5-commit story lives in the PR description; the squash collapses to a single revertible change on `develop`. Per `design.md` §9: `git log origin/develop..HEAD --merges` ≤1.

**Pre-PR checklist**:

- [ ] All 5 commits land in order on `feat/slice-9-housekeeping` (T1 → T2 → T3 → T4 → T5).
- [ ] Each commit message is `type(scope): <subject>`, imperative present, ≤72 chars subject, no trailing period.
- [ ] No `Co-Authored-By` trailers in any commit (AGENTS.md §6 + persona hard rule).
- [ ] T1 commits ONLY `apps/web/__tests__/setup.ts` (single-file hygiene; no `vitest.config.ts` change).
- [ ] T2 commits exactly 2 files: `apps/web/components/auth/SessionList.tsx` + `apps/web/__tests__/components/transactions/state-coverage.test.tsx`.
- [ ] T3 commits exactly 2 operations: 1 `.gitignore` line + 1 `git rm --cached` index op on `apps/web/next-env.d.ts`.
- [ ] T4 commits exactly 2 files: the EN spec amend + the NEW ES mirror (same atomic commit per AGENTS.md §13).
- [ ] T5 has zero file changes (verification marker only).
- [ ] `pnpm --filter web test` exits 0 with `Tests 145 passed (145)` (baseline preserved).
- [ ] `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 0 with 25 PASS / 0 FAIL (T2 regression surface).
- [ ] `pnpm --filter api test` exits 0 with 22/22 PASS (api untouched).
- [ ] `pnpm turbo run bdd` exits 0 with 43/43 scenarios (BDD untouched).
- [ ] `pnpm turbo run lint typecheck` exits 0 (T2 typecheck narrowing holds).
- [ ] `pnpm turbo run build` exits 0 (T3 next-env.d.ts auto-regen works).
- [ ] `pnpm lint:fixtures` exits 0 (boundary plugin silent on T4's mirror).
- [ ] `git ls-files apps/web/next-env.d.ts` returns empty (T3 untrack confirmed).
- [ ] `git status --porcelain | grep -v '^?? \.codegraph/' | wc -l` returns 0 (clean working tree).
- [ ] `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty (T4 ES mirror is CJK-clean).
- [ ] `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json | grep -E '"vitest"\s*:'` returns empty (vitest stays at 4.1.9).
- [ ] `git diff --stat develop..feat/slice-9-housekeeping` reports ~+37 net LOC (well under 400-line review budget).
- [ ] PR description leads with the one-line statement from `spec.md` §2 and cites `fix-vitest-4-deprecation` PR #69 as the source of the post-migration vitest config line numbers (T1's breadcrumb source).
- [ ] GitHub Actions `BDD (Cucumber)` job reports `pass` after the squash.

---

## §4. Delivery strategy

- **Delivery strategy** (from `openspec/config.yaml`): `auto-chain` — auto-slices on >400 LOC.
- **This change's effective strategy**: **single PR**. ~37 net LOC sits at ~9% of the 400-line budget; no auto-chain trigger fires.
- **No chained PRs recommended**.
- **Branch**: `feat/slice-9-housekeeping` cut from `develop` at HEAD `0b4534b` after the user's "go" signal.
- **Reviewer**: maintainer (Sebastián Illa).
- **Risk profile**: 5 risks catalogued in `design.md` §6 (R1-R5); all have concrete mitigations already engineered into the 5 tasks (JSDoc refresh preserves attribution; component guard is byte-identical for non-empty statusText; mock change is additive only; `git rm --cached` paired with `.gitignore` + working-tree preservation; archived spec amend preserves original text under Superseded-by blockquote).

---

## §5. Apply order

1. **Create branch** `feat/slice-9-housekeeping` off `develop@0b4534b`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/slice-9-housekeeping
   ```
2. **Apply the 5 commits** in dependency order per §2 above (T1 → T2 → T3 → T4 → T5). Each commit lands ATOMICALLY — never split, never squash mid-stream. T1-T4 may execute in any order in principle, but the prescribed order above minimizes churn on `git status --porcelain` and matches the design §10 step order.
3. **Run local verification** with T1's 7 gates (G1-G7), T2's 8 gates (G1-G8), T3's 8 gates (G1-G8), T4's 10 gates (G1-G10), and T5's 12 gates (VM1-VM12):
   ```bash
   pnpm install                                                    # ensure vitest 4.1.9 is resolved
   pnpm --filter web test                                          # MUST exit 0; "Tests 145 passed (145)"
   pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx   # MUST exit 0; 25 PASS
   pnpm --filter api test                                          # MUST exit 0; 22 PASS
   pnpm turbo run bdd                                              # MUST exit 0; 43 scenarios
   pnpm turbo run lint typecheck                                   # MUST exit 0
   pnpm turbo run build                                            # MUST exit 0
   pnpm lint:fixtures                                              # MUST exit 0
   git ls-files apps/web/next-env.d.ts                             # MUST be empty
   perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md   # MUST be empty
   ```
4. **Pre-commit hygiene gates** (per AGENTS.md §12):
   ```bash
   grep -n 'vitest.config.ts:' apps/web/__tests__/setup.ts         # current L62-64 reference
   grep -c 'singleFork' apps/web/__tests__/setup.ts                # 0 expected
   grep -n 'statusText' apps/web/components/auth/SessionList.tsx   # ≥2 hits expected
   grep -n 'next-env\.d\.ts' .gitignore                            # ≥1 hit expected
   grep "Superseded by" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md   # ≥3 hits expected
   ```
5. **Push the branch**:
   ```bash
   git push -u origin feat/slice-9-housekeeping
   ```
6. **Open the PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/slice-9-housekeeping \
     --title "chore: slice 9 housekeeping — drain 4 minor maintenance items" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   PR body MUST lead with the one-line statement from `spec.md` §2: 4 maintenance items + 1 initial ES mirror, all bundled to drain remaining maintenance debt from `develop@0b4534b`. Cite Spec R1-R11 + the design §3 execution plan.
7. **Wait for CI**. The `BDD (Cucumber)` job MUST report `pass`. The `turbo` gate (build + lint + typecheck + test) MUST report exit 0.
8. **Review + squash-merge**:
   ```bash
   gh pr merge --squash feat/slice-9-housekeeping   # after maintainer approval
   ```
9. **`sdd-verify` runs on `develop` post-merge** to confirm the housekeeping gates stay green: 22/22 apps/api + 145/145 apps/web + 25/25 state-coverage + 43/43 BDD + `pnpm turbo run lint typecheck build` exits 0, AND `git ls-files apps/web/next-env.d.ts` stays empty, AND `perl -ne 'print if /\p{Han}/' Documents-es/...spec.md` stays empty.
10. **`sdd-archive` moves** `openspec/changes/slice-9-housekeeping/{proposal,spec,design,tasks}.md` to `openspec/changes/archive/2026-07-15-slice-9-housekeeping/` per the orchestrator's archive protocol.

---

## §6. Resolved design open questions

(All 5 deferred from proposal §8 were resolved in `spec.md` §11.)

- **Q1 (JSDoc refresh scope)**: YES — refreshed paragraph at L32-37 of `setup.ts` to cite current `vitest.config.ts:62-64` line numbers (post-`fix-vitest-4-deprecation` migration), dropped the stale `singleFork: true` mention, added a breadcrumb to PR #69 + the Vitest 4 migration guide URL. R6 + R7 enforce.
- **Q2 (HYBRID 2D shape for SessionList)**: YES — both the component render AND the mock `statusText` field get hardened (the component guard prevents the regressed DOM shape; the mock field exercises the guarded code path so future regressions are caught). R1 + R2 enforce.
- **Q3 (preservation of original R3 text)**: YES — original R3 text preserved verbatim under a `> **Superseded by**` blockquote per Q3 resolution. No information destruction. Documented architectural history.
- **Q4 (initial ES mirror of amended spec)**: YES — bundled into the same atomic commit as the EN amend per AGENTS.md §13. The ES mirror is hand-translated (not auto-translated) following the `0011-shared-as-workspace-packages.md` precedent; CJK-drift detector is the verification gate.
- **Q5 (single-PR vs chained)**: SINGLE-PR — ~37 net LOC sits at ~9% of the 400-line budget; one PR keeps the 4-item + ES-mirror story coherent (JSDoc refresh → DOM hardening → gitignore + untrack → spec amend + ES mirror → verify marker). No chained PRs recommended.

**No open questions remain at the tasks phase.** `sdd-apply` proceeds directly with the 5 tasks above.

---

## §7. Out of scope (whole change)

(Orchestrator-enforced; mirrors `spec.md` §10 + `proposal.md` §2.2 + AGENTS.md §11.)

1. No new features.
2. No changes to production code logic — Item 2's component hardening is byte-identical for non-empty `statusText` (the production path).
3. No new tests — AGENTS.md §4 exception covers this maintenance bundle; Item 2's `statusText` mock field IS the regression guard (it exercises the new code path, but does not add a new test case to the count).
4. No ESLint rule changes in `tools/eslint-plugin-boundary/`.
5. No ADR under `docs/architecture/decisions/`.
6. No vitest version bump (stays pinned at `4.1.9`).
7. No coverage gate enforcement at CI (AGENTS.md §11).
8. No migration of `gastos-personales/` to the vertical-slicing model (AGENTS.md §11).
9. i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth beyond Google, production hardening, observability, audit log UI (AGENTS.md §11).
10. No touching of any other `vitest.config.*` file (only `apps/web/__tests__/setup.ts` references `vitest.config.ts` line numbers; the config itself is unchanged).
11. No touching of any file in `apps/api/`, `apps/web/app/`, `apps/web/lib/`, `libs/features/*/`, `libs/core/*/` source.
12. No touching of `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash,fix-state-coverage-drift,fix-bdd-tsx-node22,fix-ci-env-propagation,fix-orphan-shared-directories-mirror,fix-vitest-4-deprecation}/` except for the targeted EN spec amend in T4.
13. No amending of any OTHER section in the archived `fix-ci-env-propagation/spec.md` — only R3 + Q3 + AC8 + the spec-header footer are touched in T4.
14. No amending of the `fix-bdd-ci-zod-resolution` archive's similar spec defect (deferred — out of scope for slice 9).
15. No `tsconfig.base.json` changes.
16. No `pnpm-workspace.yaml` changes.
17. No `.github/workflows/ci.yml` changes.
18. No Spanish mirror of any file under `openspec/changes/slice-9-housekeeping/` (change-folder specs are coordination artifacts, not user-facing docs; per orchestrator instruction + `fix-web-vitest-crash` + `fix-api-nestjs-di` + `fix-state-coverage-drift` + `fix-bdd-tsx-node22` + `fix-vitest-4-deprecation` precedents).

---

## §8. Risks

(Mirrors `proposal.md` §7 + `design.md` §6 R1-R5 with concrete task-level mitigations.)

- **R1 (setup.ts JSDoc drops context)** — Low. Mitigated by retaining the slice-7 PR-7 attribution context (renamed to "post-`fix-vitest-4-deprecation` PR #69") + naming the Vitest 4 migration guide URL + citing current line numbers (L62-64). T1's G1 + G2 + G3 verifications confirm the breadcrumb survives.
- **R2 (SessionList regression in api suite)** — None. SessionList is frontend-only (lives in `apps/web/components/auth/`); the 22/22 apps/api tests do not touch it. T2's G3 verification confirms.
- **R3 (mock `statusText` breaks setup.ts orchestration)** — Low. The change is additive only (new field in the `ResponseInit` second argument; `status: 500`, `headers`, and JSON body unchanged). The existing error-scenario call site is UNCHANGED. T2's G1 baseline (145/145) catches any orchestration regression.
- **R4 (`git rm --cached` is irreversible)** — Low. The file auto-regens on next `next build`. The `.gitignore` rule prevents future tracking. The working-tree copy is preserved (the file is removed from the index, not from disk). `git revert <this-commit-sha>` cleanly restores the index entry. T3's G5 + G6 verifications confirm.
- **R5 (amending an archived spec breaks traceability)** — Low. The original R3 + Q3 text is preserved VERBATIM under `> **Superseded by**` blockquotes per Q3 resolution. No information destruction; documented architectural history. T4's G3 verification confirms all 3 Superseded-by notes land.

---

## §9. Review Workload Forecast

| Field | Value |
|-------|-------|
| **Estimated changed lines** | ~37 net LOC across 7 file operations (T1 ~0 net + 8 lines paraphrase, T2 +3 net + 1 guard, T3 +1 net + 1 index op, T4 +22 net + 1 mirror create, T5 +0) |
| **400-line budget risk** | Low (37 ≪ 400; ~9% of budget used) |
| **Chained PRs recommended** | No |
| **Delivery strategy** | `auto-chain` (project default); auto-chain trigger NOT fired (37 < 400) |
| **Effective strategy** | single-pr |
| **Single-PR rationale** | 37 net LOC well under 400; one PR keeps the 4-item + ES-mirror story coherent (JSDoc refresh → DOM hardening → gitignore + untrack → spec amend + ES mirror → verify marker). All 4 items are mutually independent but share the maintenance-debt drain theme. |
| **Decision needed before apply** | No (no `ask-on-risk` trigger; all 5 risks have concrete mitigations already engineered into the 5 tasks) |
| **Chain strategy** | n/a (single-PR path) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

---

## §10. Status

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, source design §4) · `risks`: R1-R5 (concrete mitigations baked into the 5 tasks above)

`next_recommended`: **`apply`** — orchestrator creates `feat/slice-9-housekeeping` off `develop@0b4534b` and applies the 5 tasks in §2 sequentially.

---

## Cross-references

- **Proposal**: `openspec/changes/slice-9-housekeeping/proposal.md` (Engram `#2408`, 446 words; 4-item housekeeping bundle + Q4 initial ES mirror)
- **Spec**: `openspec/changes/slice-9-housekeeping/spec.md` (Engram `#2409`; 7 goals, 11 requirements, 7 scenarios, 11 acceptance criteria)
- **Design**: `openspec/changes/slice-9-housekeeping/design.md` (Engram `#2410`, ~1100 LOC, 13 sections; 6 file diffs, 5 atomic commits, 16 execution steps)
- **Explore brief**: `openspec/changes/slice-8-closing-bdd-and-docs/explore.md` (deferred 4-item maintenance debt identified)
- **Source-of-truth files** (must NOT be amended):
  - `apps/web/vitest.config.ts:62-64` (the post-`fix-vitest-4-deprecation` `pool: "forks"` + `maxWorkers: 1` + `isolate: false` triple — T1's JSDoc refresh cites this)
  - `apps/web/components/auth/SessionList.tsx:60` (current error render — T2's guard target)
  - `apps/web/__tests__/components/transactions/state-coverage.test.tsx:724-727` (current 500-status mock — T2's mock target)
  - `apps/web/next-env.d.ts` (auto-regen file — T3 untracks from index)
- **Archived spec amend target**: `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` (R3 L115-127, Q3 L471-475, AC8 L399 — T4 amends + creates initial ES mirror)
- **Predecessor commits cited in T1**: `fix-vitest-4-deprecation` slice (PR #69, post-PR-`develop@0b4534b` source of truth for `vitest.config.ts` line numbers)
- **Regression surface**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (25/25 PASS pre- and post-slice; the `statusText` mock field is the regression guard)
- **Untouched BDD surface**: all 12 `.feature` files, all 5 `.steps.ts` files, both `world.ts` files, both `support/register.ts` files, both `cucumber.mjs` files
- **CI workflow**: `.github/workflows/ci.yml` `BDD (Cucumber)` job — unchanged (Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, 30-min timeout)
- **Format reference**: `openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/tasks.md` (closest precedent — also a 1-PR config-only fix with TDD exception; mirrored the 10-section structure, expanded for the 4-item + ES-mirror bundle — 5 tasks vs 2, includes Spanish mirror creation, includes HYBRID 2D shape for Item 2)
- **ES mirror precedent**: `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` (closest hand-translated ES mirror precedent for the format)
- **Project conventions**: AGENTS.md §2 (branch model — `main` immutable, cut from `develop`), §4 (strict TDD — exception for config + docs, HYBRID 2D for Item 2), §5 (atomic commits — 5 work-unit commits), §6 (Conventional Commits — `fix`, `chore`, `docs` types; no AI attribution), §7 (boundary plugin — none affected), §8 (single source of truth — `vitest.config.ts` line numbers canonical there, not in `setup.ts` JSDoc), §10 (testing — vitest colocated, `clearMocks: true`), §11 (out-of-scope — none touched), §12 (pre-commit checklist), §13 (Spanish mirror — T4 bundles EN amend + initial ES mirror in same atomic commit)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

---

**END OF TASKS**.
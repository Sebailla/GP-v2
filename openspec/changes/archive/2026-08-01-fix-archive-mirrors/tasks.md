# Tasks — fix-archive-mirrors — gastos-personales-reference

**Project**: `gastos-personales-reference` (`gp-v2`)
**Branch**: `develop` (working) · `main` (immutable)
**Tracker branch**: `feat/fix-archive-mirrors-pr-N` (one per PR, 7 PRs total)
**Mode**: auto · **Artifact store**: hybrid · **Delivery strategy**: auto-chain
**Strict TDD**: N/A (pure documentation; no source code changes)
**Source artifacts**: proposal.md (Engram #2415), spec.md (#2417 — G1–G8, R1–R12, 12 scenarios), design.md (#2419 — 29 ES files, 7 chained PRs)
**Author**: SDD orchestrator → `sdd-tasks` (executor)
**Status**: Planning complete; user pauses before `sdd-apply`

## Conventions

- Work-unit commits: every PR touches a single archive subfolder under `Documents-es/openspec/changes/archive/<name>/`; reverting any PR removes ONLY that archive's ES mirrors (R8/R9).
- No `Co-Authored-By` trailers (AGENTS.md §6).
- Conventional Commits: `docs(mirrors): add retroactive ES mirrors for <archive>`, imperative, ≤72 chars, no trailing period.
- Hand translation only — no DeepL/OpenAI/Google Translate (R7/CJK-drift risk).
- Neutral, professional Spanish register; industry terms stay English (`commit`, `merge`, `PR`, `ADR`, `BDD`, `Vitest`, `NestJS`, `package.json`, `tsconfig`, `paths`, `slice`, `chore`, `monorepo`, `Turborepo`, `pnpm`, `slice`).
- Existing partial mirrors are PRESERVED, not overwritten — PRs 6/7 verify the existing ES file before adding siblings.
- RFC 2119 MAY/SHALL/MUST NOT for binding language in spec; here we honor SHALL (R1, R3, R8, R10, R12).

## §1. Dependency graph

```
T1 (PR 1: fix-api-nestjs-di) — independent (off develop)
 │
 ▼
T2 (PR 2: fix-bdd-tsx-node22) — depends on T1 merged
 │
 ▼
T3 (PR 3: fix-state-coverage-drift) — depends on T2 merged
 │
 ▼
T4 (PR 4: fix-vitest-4-deprecation) — depends on T3 merged
 │
 ▼
T5 (PR 5: fix-web-vitest-crash) — depends on T4 merged
 │
 ▼
T6 (PR 6: fix-ci-env-propagation) — depends on T5 merged (gap-fill on partial mirror)
 │
 ▼
T7 (PR 7: slice-8-closing-bdd-and-docs) — depends on T6 merged (gap-fill on partial mirror)
```

**Order invariant**: T1 → T2 → T3 → T4 → T5 → T6 → T7. Each PR merges independently before the next PR's branch is cut. PRs 1–5 are full mirrors (5/5/5/4/5 missing files); PRs 6–7 are gap-fills on existing partial mirrors (4 / 3 missing files). No PR mutates a file its archive is not responsible for — atomic regression boundary per archive (R8 atomic commits).

## §2. Per-task tables (7 tasks)

### T1 — PR 1: `2026-07-13-fix-api-nestjs-di` (5 NEW ES files)

- **Commit**: `docs(mirrors): add retroactive ES mirrors for fix-api-nestjs-di (PR 1 of 7)`
- **Branch**: `feat/fix-archive-mirrors-pr-1` (cut from `develop`)
- **Files**: `Documents-es/openspec/changes/archive/2026-07-13-fix-api-nestjs-di/{proposal,spec,design,tasks,explore}.md` (5 NEW)
- **Depends on**: —
- **LOC**: +~3,000 / 0
- **TDD**: N/A (docs-only commit). Hand-translate each EN file at `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/<name>.md` to neutral/professional Spanish at `Documents-es/openspec/changes/archive/2026-07-13-fix-api-nestjs-di/<name>.md`. Preserve paths, commands, identifiers, versions, dates, statuses. Keep established English industry terms (`commit`, `PR`, `ADR`, `BDD`, `Vitest`, `NestJS`, etc.) per slice-8/fix-ci-env-propagation ES mirrors as tone reference. Filename parity (R12): each EN file maps 1:1 to an ES file with the same basename.
- **Verify**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-13-fix-api-nestjs-di/` lists `proposal.md spec.md design.md tasks.md explore.md` (5 files, exactly the EN basename set).
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-13-fix-api-nestjs-di/*.md` returns empty (no CJK drift in any of the 5 ES files).
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-1` lists ONLY paths under `Documents-es/openspec/changes/archive/2026-07-13-fix-api-nestjs-di/` (no source-code touches).
  - R5: `pnpm lint:fixtures` exits 0.
  - R8: PR opens with title `docs(mirrors): add retroactive ES mirrors for fix-api-nestjs-di (PR 1 of 7)`, base `develop`, head `feat/fix-archive-mirrors-pr-1`.
  - PR CI green; squash-merge; `git log --oneline -1` shows merge commit landed.

### T2 — PR 2: `2026-07-14-fix-bdd-tsx-node22` (5 NEW ES files)

- **Commit**: `docs(mirrors): add retroactive ES mirrors for fix-bdd-tsx-node22 (PR 2 of 7)`
- **Branch**: `feat/fix-archive-mirrors-pr-2` (cut from `develop` AFTER T1 merged)
- **Files**: `Documents-es/openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/{proposal,spec,design,tasks,explore}.md` (5 NEW)
- **Depends on**: T1 merged
- **LOC**: +~1,500 / 0
- **TDD**: N/A. Same hand-translation contract as T1. NOTE: the stray `2026-07-14-fix-bdd-tsx-node22-mirror/` folder in the EN `archive/` directory is out of scope (R4 — separate cleanup change); do NOT mirror its contents and do NOT delete it.
- **Verify**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/` lists the 5 ES files.
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/*.md` returns empty.
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-2` lists ONLY paths under `Documents-es/openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/` (excludes `2026-07-14-fix-bdd-tsx-node22-mirror/`).
  - R5: `pnpm lint:fixtures` exits 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-2`; CI green; squash-merge.

### T3 — PR 3: `2026-07-14-fix-state-coverage-drift` (5 NEW ES files)

- **Commit**: `docs(mirrors): add retroactive ES mirrors for fix-state-coverage-drift (PR 3 of 7)`
- **Branch**: `feat/fix-archive-mirrors-pr-3` (cut from `develop` AFTER T2 merged)
- **Files**: `Documents-es/openspec/changes/archive/2026-07-14-fix-state-coverage-drift/{proposal,spec,design,tasks,explore}.md` (5 NEW)
- **Depends on**: T2 merged
- **LOC**: +~1,500 / 0
- **TDD**: N/A. Same hand-translation contract as T1/T2.
- **Verify**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-14-fix-state-coverage-drift/` lists the 5 ES files.
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-state-coverage-drift/*.md` returns empty.
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-3` lists ONLY paths under the archive subfolder.
  - R5: `pnpm lint:fixtures` exits 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-3`; CI green; squash-merge.

### T4 — PR 4: `2026-07-14-fix-vitest-4-deprecation` (4 NEW ES files)

- **Commit**: `docs(mirrors): add retroactive ES mirrors for fix-vitest-4-deprecation (PR 4 of 7)`
- **Branch**: `feat/fix-archive-mirrors-pr-4` (cut from `develop` AFTER T3 merged)
- **Files**: `Documents-es/openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/{proposal,spec,design,tasks}.md` (4 NEW — this archive legitimately has only 4 EN artifacts, no `explore.md`)
- **Depends on**: T3 merged
- **LOC**: +~1,500 / 0
- **TDD**: N/A. Same hand-translation contract. CONFIRM EN side has only 4 files (proposal/spec/design/tasks) before translating — do NOT fabricate an `explore.md` that does not exist in `openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/` (Q5 in proposal: actual 4-file batch, not 5).
- **Verify**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/` lists exactly 4 ES files matching EN basenames.
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/*.md` returns empty.
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-4` lists ONLY paths under the archive subfolder; no spurious `explore.md` appears.
  - R5: `pnpm lint:fixtures` exits 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-4`; CI green; squash-merge.

### T5 — PR 5: `2026-07-14-fix-web-vitest-crash` (5 NEW ES files)

- **Commit**: `docs(mirrors): add retroactive ES mirrors for fix-web-vitest-crash (PR 5 of 7)`
- **Branch**: `feat/fix-archive-mirrors-pr-5` (cut from `develop` AFTER T4 merged)
- **Files**: `Documents-es/openspec/changes/archive/2026-07-14-fix-web-vitest-crash/{proposal,spec,design,tasks,explore}.md` (5 NEW)
- **Depends on**: T4 merged
- **LOC**: +~2,500 / 0
- **TDD**: N/A. Same hand-translation contract.
- **Verify**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-14-fix-web-vitest-crash/` lists the 5 ES files.
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-web-vitest-crash/*.md` returns empty.
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-5` lists ONLY paths under the archive subfolder.
  - R5: `pnpm lint:fixtures` exits 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-5`; CI green; squash-merge.

### T6 — PR 6: `2026-07-14-fix-ci-env-propagation` (4 NEW ES files, 1 PRESERVED)

- **Commit**: `docs(mirrors): fill missing ES mirrors for fix-ci-env-propagation (PR 6 of 7)`
- **Branch**: `feat/fix-archive-mirrors-pr-6` (cut from `develop` AFTER T5 merged)
- **Files**: `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/{proposal,design,explore,tasks}.md` (4 NEW) — `spec.md` already mirrored at the existing path; PRESERVE it (G6, R5 verification contract)
- **Depends on**: T5 merged
- **LOC**: +~1,500 / 0
- **TDD**: N/A. Hand-translation contract applies to NEW files only. CONFIRM `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` exists before any commit; do NOT touch it (R5: existing partial mirror must remain intact).
- **Verify**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/` lists 5 files total (the 4 NEW + `spec.md` preserved).
  - G6 (R5): `git diff --name-only develop..feat/fix-archive-mirrors-pr-6 -- Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` is empty (existing file untouched).
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/*.md` returns empty (covers both NEW and preserved files).
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-6` lists ONLY the 4 NEW paths under the archive subfolder.
  - R5: `pnpm lint:fixtures` exits 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-6`; CI green; squash-merge.

### T7 — PR 7: `2026-07-13-slice-8-closing-bdd-and-docs` (3 NEW ES files, 1 PRESERVED)

- **Commit**: `docs(mirrors): fill missing ES mirrors for slice-8-closing-bdd-and-docs (PR 7 of 7)`
- **Branch**: `feat/fix-archive-mirrors-pr-7` (cut from `develop` AFTER T6 merged)
- **Files**: `Documents-es/openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/{proposal,spec,tasks}.md` (3 NEW) — `design.md` already mirrored at the existing path; PRESERVE it (G6, R5)
- **Depends on**: T6 merged
- **LOC**: +~1,500 / 0
- **TDD**: N/A. Hand-translation contract. CONFIRM `Documents-es/openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/design.md` exists before any commit; do NOT touch it (R5). The preserved `design.md` is the project's reference tone for neutral/professional Spanish.
- **Verify**:
  - G2: `ls Documents-es/openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/` lists 4 files total (the 3 NEW + `design.md` preserved).
  - G6 (R5): `git diff --name-only develop..feat/fix-archive-mirrors-pr-7 -- Documents-es/openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/design.md` is empty.
  - G3 (R7): `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/*.md` returns empty.
  - G5 (R12): `git diff --name-only develop..feat/fix-archive-mirrors-pr-7` lists ONLY the 3 NEW paths under the archive subfolder.
  - R5: `pnpm lint:fixtures` exits 0.
  - R8: PR base `develop`, head `feat/fix-archive-mirrors-pr-7`; CI green; squash-merge.
  - **Final chain check**: re-run `explore.md §2.1` audit table after PR 7 merges; expect 0 missing ES files for all 7 in-scope archives.

## §3. PR plan (7 chained PRs)

**Pattern per PR**:
- Title: `docs(mirrors): add retroactive ES mirrors for <archive> (PR N of 7)`
- Base: `develop`
- Head: `feat/fix-archive-mirrors-pr-N`
- Files: archive-specific NEW ES files (4 or 5 per PR; PR 6 adds 4 alongside 1 preserved; PR 7 adds 3 alongside 1 preserved)
- Merge: squash-merge after CI green
- Chain: PR N+1 targets `develop` AFTER PR N merges

| PR | Archive | Branch | Head→Base | Files (creates) | Preserved |
|----|---------|--------|-----------|-----------------|-----------|
| 1 | `2026-07-13-fix-api-nestjs-di` | `feat/fix-archive-mirrors-pr-1` | …→`develop` | 5 | — |
| 2 | `2026-07-14-fix-bdd-tsx-node22` | `feat/fix-archive-mirrors-pr-2` | …→`develop` | 5 | — |
| 3 | `2026-07-14-fix-state-coverage-drift` | `feat/fix-archive-mirrors-pr-3` | …→`develop` | 5 | — |
| 4 | `2026-07-14-fix-vitest-4-deprecation` | `feat/fix-archive-mirrors-pr-4` | …→`develop` | 4 | — |
| 5 | `2026-07-14-fix-web-vitest-crash` | `feat/fix-archive-mirrors-pr-5` | …→`develop` | 5 | — |
| 6 | `2026-07-14-fix-ci-env-propagation` | `feat/fix-archive-mirrors-pr-6` | …→`develop` | 4 | `spec.md` |
| 7 | `2026-07-13-slice-8-closing-bdd-and-docs` | `feat/fix-archive-mirrors-pr-7` | …→`develop` | 3 | `design.md` |
| **Σ** | **7 archives** | | | **29 creates + 2 preserves** | |

**PR body MUST include**: "Context" section naming the archive being mirrored, the files being created, the existing partial mirrors being preserved (PRs 6 & 7), and verification commands run.

## §4. Delivery strategy

- **7 PRs in chain** (oldest-first). One tracker branch per PR (`feat/fix-archive-mirrors-pr-N`), each targeting `develop`.
- Per-PR LOC envelope: ~1,500–3,000 net additions (well above the 400-line review budget UNCHAINED). The chained-PR structure is the explicit deliverable (R12 + orchestrator pre-flight `auto-chain` override of explore.md Approach A).
- Per-PR changed-line estimate (excluding goldens): ~1,500–3,000 net additions. Cross-PR regression is impossible because each PR touches a distinct archive subfolder under `Documents-es/openspec/changes/archive/` (R6: chain merge conflicts Very Low).
- Total: 29 ES file creates + 2 preserved-file verifications = **31 file operations** across 7 PRs.
- Net cross-chain: ~13,000 ES LOC. Source code: ZERO changes (G5).

## §5. Apply order

For each PR N (1 to 7, sequentially, oldest-first):

1. **Wait for PR N-1 merged** (skip this for N=1).
2. **Verify pre-state** with `git log --oneline -1 develop` showing the PR N-1 merge commit AND `ls Documents-es/openspec/changes/archive/<prev-archive>/` reflecting its' files.
3. **Cut branch** `feat/fix-archive-mirrors-pr-N` from current `develop` (`git fetch origin && git switch -c feat/fix-archive-mirrors-pr-N origin/develop`).
4. **Verify EN-side file list** at `openspec/changes/archive/<archive>/` — confirm 5 files (proposal/spec/design/tasks/explore) for full mirrors; confirm 4 files for `fix-vitest-4-deprecation`; confirm ES-existence baseline for PRs 6 (`spec.md` present) and 7 (`design.md` present).
5. **Hand-translate** each EN file to neutral/professional Spanish at `Documents-es/openspec/changes/archive/<archive>/<name>.md`. Preserve EN basename. Use the existing `slice-8/design.md` and `fix-ci-env-propagation/spec.md` ES mirrors as tone reference.
6. **Verify CJK drift** (G3, R7):
   `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/<archive>/*.md`
   MUST return empty (no Chinese-character drift, no translation-tool debris).
7. **Run lint fixtures** (R5): `pnpm lint:fixtures` MUST exit 0.
8. **Verify archive-only Markdown scope** (G5, R12):
   `git diff --name-only develop..feat/fix-archive-mirrors-pr-N`
   MUST list ONLY paths under `Documents-es/openspec/changes/archive/<archive>/`. For PRs 6 & 7 the existing partial mirror file is preserved, so its path MUST NOT appear in `--name-only`.
9. **Stage + commit atomically**:
   `git add Documents-es/openspec/changes/archive/<archive>`
   `git commit -m "docs(mirrors): add retroactive ES mirrors for <archive> (PR N of 7)"`
   Per AGENTS.md §6: imperative subject, ≤72 chars, no trailing period, no `Co-Authored-By` trailer, no AI attribution.
10. **Push branch**: `git push -u origin feat/fix-archive-mirrors-pr-N`.
11. **Open PR** via `gh pr create --base develop --head feat/fix-archive-mirrors-pr-N --title "docs(mirrors): add retroactive ES mirrors for <archive> (PR N of 7)" --body "<Context section + verification commands>"`.
12. **Wait for CI** (Static + Build + Unit + BDD + lint:fixtures all green).
13. **Squash-merge** via `gh pr merge --squash`.
14. **Verify merge landed**: `git fetch origin && git log --oneline -1 origin/develop` shows the squash commit.
15. **Continue** to PR N+1 (or stop after PR 7; final step: re-run `explore.md §2.1` audit table).

## §6. Resolved design open questions

- Q1 (7 PRs in chain vs. 1 mega-PR): **7 PRs (chain)** — orchestrator pre-flight `auto-chain` override of explore.md Approach A (locked).
- Q2 (per-archive PR order): **OLDEST FIRST** — PR 1 = `fix-api-nestjs-di`, PR 7 = `slice-8-closing-bdd-and-docs`.
- Q3 (PR titles marked as "mirror batch"): **YES** — consistent `docs(mirrors): add retroactive ES mirrors for <archive>` prefix + `(PR N of 7)` suffix.
- Q4 (verify+fill gaps in 2 partial mirrors in same chain): **YES** — T6 verifies `fix-ci-env-propagation/spec.md`; T7 verifies `slice-8/design.md`. Both preserved, never overwritten.
- Q5 (final PR-8 running full audit): **OPTIONAL — skip** — full audit command lives in T7 final-chain-check (built into PR 7 verify).
- Q6 (per-PR `git diff` path-scope check): **YES** — part of G5/R12 verification contract; see §5 step 8.

## §7. Out of scope

- **3 stray `-mirror/` folders** (`2026-07-14-fix-bdd-tsx-node22-mirror/`, `2026-07-14-fix-orphan-shared-directories-mirror/`, `2026-07-15-slice-9-housekeeping-mirror/`) — documented via Engram; their cleanup belongs in a separate change (R4 / proposal §Out of Scope).
- **3 active changes** (`fix-bdd-ci-zod-resolution`, `fix-orphan-shared-directories`, `slice-9-housekeeping`) — their ES mirrors will land with their own archive move; not handled here.
- **6 ADRs** already mirrored in slice-9-housekeeping.
- **Source code** — zero changes (G5/R12 verification).
- **ESLint rules** — `no-mojibake-in-docs` stays roadmap-deferred; no rule wiring in this change.
- **Auto-translation tooling** — forbidden per design (CJK drift risk).
- **Re-mirroring partial archives** — T6/T7 only fill gaps; existing files are preserved.
- **AGENTS.md §11 items** — i18n beyond en+es, Sentry, edge rate-limiting, multiple OAuth providers, production hardening, observability, coverage gates, audit log UI all remain out of scope.
- **Spanish mirror of `tasks.md`** — task documents are SDD coordination artifacts (per fix-orphan-shared-directories/tasks.md precedent); only ADR got mirrored previously.

## §8. Risks

| ID | Risk | Likelihood | Mitigation |
|----|------|------------|------------|
| R1 | Reviewer fatigue across 7 chained PRs (~13k ES LOC total) | Medium | Each PR ~1,500–3,000 net LOC; consistent `docs(mirrors):` prefix; auto-chain is the explicit delivery strategy for this workload class. |
| R2 | Regional-tone drift in Spanish (Rioplatense vs. neutral) | Medium | Use neutral/professional register; reference existing `slice-8/design.md` and `fix-ci-env-propagation/spec.md` ES mirrors as tone benchmarks; industry terms stay English. |
| R3 | Translation mistakes introduce technical inaccuracies | Low–Medium | EN is authoritative; mirror is a translation, not a meaning rewrite; spot-check cross-references (archive names, dates, R#s, file basenames) during pre-commit verify. |
| R4 | Stray `-mirror/` folders expand/contract mid-chain | Low | Documented but untouched (R4 in proposal §Out of Scope); revisit only in a dedicated cleanup PR. |
| R5 | Existing partial mirrors overwritten (PRs 6/7) | Low | Per-PR G6 verify: `git diff --name-only …` MUST NOT list the preserved file path; apply before commit. |
| R6 | Chain merge conflicts (same parent path) | Very Low | Each PR touches a distinct archive subfolder; default lineage read from develop only. |
| R7 | CJK drift slips in from auto-translation tooling (R7 in design) | Low | Hand translation only (no DeepL/OpenAI/Google); per-PR CJK check via `perl -ne 'print if /\p{Han}/'` is mandatory (§5 step 6). |
| R8 | Active changes archived mid-chain expand scope | Low | Re-scope at next PR boundary; naturally absorbed by AGENTS.md §13 (mirrors land with archive). |

## §9. Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~13,000 net ES additions across 7 PRs (~1,500–3,000 per PR) |
| 400-line budget risk | **High** per PR (each PR's authored net exceeds 400 lines) |
| Chained PRs recommended | **Yes** — `auto-chain` delivery strategy explicitly resolves it |
| Delivery strategy | `auto-chain` (orchestrator pre-flight locked) |
| Chain strategy | `feature-branch-chain` adapted to per-PR tracker branches (each PR N branch off `develop`, target `develop` after PR N-1 merge) — alternative naming: one tracker branch per PR; effectively `stacked-to-main` against `develop`. Document the chosen base lineage in §1 + §3. |
| Decision needed before apply | **No** — orchestrator already resolved via `auto-chain` |
| Effective strategy | 7 chained PRs (oldest-first) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

## Cross-references

- proposal.md (Engram #2415)
- spec.md (Engram #2417; G1–G8, R1–R12, 12 scenarios)
- design.md (Engram #2419; 7-PR chain, 29 ES files, preservation contract for 2 partial mirrors)
- explore.md (Engram #2414; Approach A override reasoning)
- Sibling precedents: fix-orphan-shared-directories/tasks.md (single-PR format), fix-state-coverage-drift/tasks.md (2-task, hybrid+auto), fix-web-vitest-crash/tasks.md (PR #66, 2-task), fix-api-nestjs-di/tasks.md (8 tasks), fix-vitest-4-deprecation/tasks.md (chained-PR)
- AGENTS.md §1/§2/§6/§7/§11/§13
- openspec/config.yaml: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`
- Domain context: engram `topic "sdd/fix-archive-mirrors/*"` covers proposal/spec/design/tasks; sdd-init stored `gp-v2` project, branch model (id 2129), doc-mirror-spanish (id 2132), ui-complete-not-scaffold (id 2133).

**What**: Wrote tasks.md for fix-archive-mirrors: 7 PRs in chain (one per archive), oldest-first, ~13k net ES LOC, zero source-code changes, two preserved partial mirrors.
**Why**: sdd-tasks phase artifact for sdd-apply handoff; mirrors fix-orphan-shared-directories/tasks.md format adapted to chained-PR auto-chain delivery.
**Where**: `openspec/changes/fix-archive-mirrors/tasks.md` (Engram topic key `sdd/fix-archive-mirrors/tasks`).
**Learned**: Per-archive fan-out keeps each PR rollback-bounded to a single `Documents-es/.../archive/<name>/` subfolder; the 7-PR chain is the explicit deliverable that satisfies the 400-line review budget under the `auto-chain` orchestration. CJK drift check is mandatory per PR via `perl -ne 'print if /\p{Han}/'` (R7). PRs 6 & 7 verify preserved partial mirrors before adding siblings to honor G6/R5.

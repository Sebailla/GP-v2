# Proposal — `fix-archive-mirrors`

> **Status**: draft · proposal phase · **Date**: 2026-07-14
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Mode**: auto · **Artifact store**: hybrid · **Delivery strategy**: `auto-chain` (deviates from `explore.md` §3 Approach A recommendation — see §3 below) · **Fix shape**: A (pure documentation)

## 1. Intent

`AGENTS.md §13` is a HARD RULE: every English `.md` produced under `openspec/` or `docs/` MUST have its Spanish mirror under `Documents-es/...` in the **same** atomic commit. Audit of `openspec/changes/archive/` (per `explore.md`) shows **7 archived change folders** are missing or only partially mirrored under `Documents-es/openspec/changes/archive/` — totaling **29 missing ES files** and ~13.5k ES lines of backlog. AGENTS.md §13 also forbids auto-translation (CJK-drift risk under `Documents-es/`); the only acceptable path is hand-translation. The fix: hand-translate each missing EN file to ES, then bundle the mirrors into **one atomic commit per archive** (NOT one mega-commit), and deliver as **chained PRs** because 13.5k LOC exceeds the 400-line review budget. Zero source-code changes; pure documentation.

## 2. Scope

### In Scope (29 ES files across 7 archives)

Per archive, the standard 5-file SDD set is `proposal.md`, `spec.md`, `design.md`, `tasks.md`, `explore.md`. Archives that are missing `explore.md` in EN only get translated to what EN actually has.

| Archive | Files in EN | ES files missing | Per-PR scope |
|---|---|---|---|
| `2026-07-13-fix-api-nestjs-di` | 5 | **5** (proposal, spec, design, tasks, explore) | All 5 |
| `2026-07-14-fix-bdd-tsx-node22` | 5 | **5** (proposal, spec, design, tasks, explore) | All 5 |
| `2026-07-14-fix-state-coverage-drift` | 5 | **5** (proposal, spec, design, tasks, explore) | All 5 |
| `2026-07-14-fix-vitest-4-deprecation` | 4 | **4** (proposal, spec, design, tasks) | All 4 |
| `2026-07-14-fix-web-vitest-crash` | 5 | **5** (proposal, spec, design, tasks, explore) | All 5 |
| `2026-07-14-fix-ci-env-propagation` | 5 | **4** (design, explore, proposal, tasks) — `spec.md` already mirrored | Fill 4 gaps |
| `2026-07-13-slice-8-closing-bdd-and-docs` | 4 | **3** (proposal, spec, tasks) — `design.md` already mirrored | Fill 3 gaps |
| **Totals** | **33 EN** | **29 ES files to create** | **~13,500 net LOC** |

### Out of Scope

- **3 stray `-mirror/` folders** (`fix-bdd-tsx-node22-mirror/`, `fix-orphan-shared-directories-mirror/`, `slice-9-housekeeping-mirror/`) — each contains only an `explore.md` planning artifact that was archived by mistake. Cleanup belongs in a separate change.
- **3 active changes** still in progress (`fix-bdd-ci-zod-resolution`, `fix-orphan-shared-directories`, `slice-9-housekeeping`) — their mirrors land in the same commit as their archive move, not here.
- **6 ADRs under `docs/architecture/decisions/`** — already mirrored per slice-9-housekeeping verification (per `explore.md §2.2`).
- **Re-mirroring** of the 2 partial archives (`slice-8-closing-bdd-and-docs` and `fix-ci-env-propagation`) — verify their existing ES files are intact; only fill gaps.
- **Source code**, ESLint rules, CI, pnpm scripts, or any `apps/`/`libs/`/`tools/` edits.

## 3. Approach

### Decision: 7 chained PRs (one per archive), NOT a single mega-commit

This is an intentional **deviation from `explore.md` §3 Approach A**, which recommended one atomic commit bundling all 29 ES files. The orchestrator's pre-flight re-evaluated against the 400-line review budget and selected `auto-chain`. Reasoning:

1. **Review budget compliance.** ~13.5k ES lines in a single PR violates §3 of AGENTS.md (400-line review budget). Each per-archive PR lands ~500–3000 net LOC (well within budget).
2. **Per-archive atomicity preserved.** AGENTS.md §13 says mirrors go in the same atomic commit as their source. For *retroactive* mirrors of already-archived changes, the atomic unit becomes "this archive's set of ES mirrors" — one commit per archive. This honors the spirit of §13.
3. **Independent review per archive.** Reviewers audit one bounded translation unit at a time, can compare to a single EN source, and can reject a single bad translation without blocking the rest.
4. **Chain order = oldest first** (per Q2 recommendation): the historical mirror order mirrors the order in which changes were archived.

### Translation method: hand-translation only (Approach A in explore.md)

- **No auto-translation tools** (DeepL, OpenAI, Google Translate). AGENTS.md §13 forbids it because of CJK drift risk. The `no-mojibake-in-docs` ESLint rule (roadmap) will eventually enforce `perl -ne 'print if /\p{Han}/'` returns empty.
- **Neutral/professional Spanish register**, matching the tone already established by `slice-8-closing-bdd-and-docs/design.md` and `fix-ci-env-propagation/spec.md` (the two existing ES mirrors). No Rioplatense voseo, no slang, no regional flourishes.
- **Industry terms stay English**: `commit`, `merge`, `PR`, `ADR`, `BDD`, `Vitest`, `NestJS`, `package.json`, `tsconfig`, `paths`, `slice`, `chore`, `monorepo`, `Turborepo`, `pnpm`. Per the existing mirrors and AGENTS.md §13, technical terms that are industry-standard English stay English.

### Quality gate per PR

Each PR must verify:
- `ls Documents-es/openspec/changes/archive/<name>/` shows the same `.md` files as the EN side (no extras, no missing).
- `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/<name>/*.md` returns empty (no CJK drift).
- `pnpm lint:fixtures` exits 0 (boundary plugin sanity).
- `git diff --name-only` shows ONLY files under `Documents-es/openspec/changes/archive/<name>/` for that PR.
- Commit message uses Conventional Commits (`docs(mirrors): add retroactive ES mirrors for <archive>`); no `Co-Authored-By` line; no AI attribution.

## 4. Affected Files Inventory

7 PRs × ~3–5 ES files each = 29 file creates. No edits, no deletes. No source-code blast radius.

| PR | Archive | Files to create | Net LOC est. | Chain order |
|----|---------|------------------|--------------|-------------|
| PR 1 | `2026-07-13-fix-api-nestjs-di` | 5 (proposal, spec, design, tasks, explore) | ~3,000 | oldest first |
| PR 2 | `2026-07-14-fix-bdd-tsx-node22` | 5 (proposal, spec, design, tasks, explore) | ~1,500 | ↑ |
| PR 3 | `2026-07-14-fix-state-coverage-drift` | 5 (proposal, spec, design, tasks, explore) | ~1,500 | ↑ |
| PR 4 | `2026-07-14-fix-vitest-4-deprecation` | 4 (proposal, spec, design, tasks) | ~1,500 | ↑ |
| PR 5 | `2026-07-14-fix-web-vitest-crash` | 5 (proposal, spec, design, tasks, explore) | ~2,500 | ↑ |
| PR 6 | `2026-07-14-fix-ci-env-propagation` | 4 (design, explore, proposal, tasks — `spec.md` already mirrored) | ~1,500 | ↑ |
| PR 7 | `2026-07-13-slice-8-closing-bdd-and-docs` | 3 (proposal, spec, tasks — `design.md` already mirrored) | ~1,500 | verify-only |
| **Total** | **7 archives** | **29 ES files** | **~13,000 ES LOC** | — |

**Shape A** — pure documentation, no source code. PR 1 creates the chain (per the orchestrator's `auto-chain` strategy).

## 5. Goals (G-numbered)

- **G1**: 7 PRs opened, one per archive, in oldest-first order (PR 1 = `fix-api-nestjs-di`, PR 7 = `slice-8-closing-bdd-and-docs`).
- **G2**: Each PR creates the missing ES files for its archive (or fills the gaps for the 2 partial mirrors).
- **G3**: Every ES file passes the CJK-drift check: `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/<name>/*.md` returns empty.
- **G4**: AGENTS.md §13 compliance restored for all 7 archives (the 3 stray `-mirror/` folders remain out of scope).
- **G5**: Zero source-code changes; `git diff --name-only` per PR shows ONLY files under `Documents-es/openspec/changes/archive/<name>/`.
- **G6**: The 2 existing partial mirrors (`slice-8-closing-bdd-and-docs/design.md`, `fix-ci-env-propagation/spec.md`) verified intact and not overwritten.
- **G7**: All 7 PRs merged without re-introducing the original gap (verified by re-running the audit table from `explore.md §2.1`).
- **G8**: Each PR's `pnpm lint:fixtures` exits 0; no CI regression.

## 6. Non-goals

- No new features, no refactors, no architectural changes.
- No source-code edits anywhere in `apps/`, `libs/`, `tools/`, `pnpm-workspace.yaml`, or root `package.json`.
- No ESLint rule changes; `no-mojibake-in-docs` stays in roadmap-deferred status (slice 8 wiring).
- No ES mirrors for the 6 ADRs already done in slice-9-housekeeping (per `explore.md §2.2`).
- No ES mirrors for the 3 stray `-mirror/` folders (separate cleanup change).
- No ES mirrors for the 3 active changes (`fix-bdd-ci-zod-resolution`, `fix-orphan-shared-directories`, `slice-9-housekeeping`) — their mirrors land with their archive move.
- No re-translation of EN files; mirrors reflect current EN content only.
- No automated translation tooling; hand-translation only.

## 7. Risks

| ID | Risk | Likelihood | Mitigation |
|----|------|------------|------------|
| R1 | 7 chained PRs add 13.5k LOC; reviewer fatigue or merge conflicts between chains. | Med | Each PR is reviewed independently on its own archive; chain is the review-friendly option (each PR is ~500–3000 LOC, well under the 400-line budget). PR titles use a consistent `docs(mirrors):` prefix and `[mirror-batch]` tag in description for tracking. |
| R2 | Regional-tone drift in Spanish across 7 PRs (Rioplatense voseo, slang, flourishes). | Med | All translators use neutral/professional Spanish register; refer to existing mirrors (`slice-8-closing-bdd-and-docs/design.md`, `fix-ci-env-propagation/spec.md`) as tone reference. Industry terms (commit, PR, ADR, BDD, etc.) stay English per AGENTS.md §13. |
| R3 | Translation mistakes introduce technical inaccuracies in ES mirrors. | Low–Med | EN is authoritative; ES mirrors are translations of meaning, not creative rewrites. Spot-check cross-references (file paths, package names, version numbers) against EN. Reviewers compare to EN side-by-side. |
| R4 | Active changes (fix-bdd-ci-zod-resolution, fix-orphan-shared-directories, slice-9-housekeeping) get archived mid-chain, expanding scope. | Low | If any active change is archived before this chain lands, re-scope at the next PR boundary; document in the proposal/apply report. AGENTS.md §13 already requires the mirror to land with the archive, so this is naturally absorbed. |
| R5 | The 2 existing partial mirrors get accidentally overwritten or skipped. | Low | PRs 6 and 7 explicitly verify the existing ES file (`design.md` for slice-8, `spec.md` for fix-ci-env-propagation) is intact before adding new files; `git status` per PR shows no unintended changes. |
| R6 | Chain merge conflicts because two PRs touch the same `Documents-es/openspec/changes/archive/` parent (unlikely — each PR has a distinct archive subfolder). | Very Low | Each PR targets a distinct archive subfolder; no overlapping paths. |
| R7 | CJK drift slips into a translated file (auto-translation residue, copy-paste artifact). | Low | Per-file CJK check (`perl -ne 'print if /\p{Han}/'`) is part of each PR's verification; if any file fails, regenerate that file by hand before merge. |

## 8. Open Questions for the Spec Phase

- **Q1**: 7 PRs in chain, or 1 mega-PR? **Recommendation: 7 PRs (chain)** — already decided by orchestrator pre-flight (`auto-chain` strategy) for 400-line review budget compliance. Spec phase confirms this shape.
- **Q2**: Per-archive PRs in dependency order (oldest first) or reverse? **Recommendation: OLDEST FIRST** — preserves historical mirror order; PR 1 = `fix-api-nestjs-di` (oldest), PR 7 = `slice-8-closing-bdd-and-docs` (newest of the 7).
- **Q3**: Should PRs be marked as a "mirror batch" in title/label for tracking? **Recommendation: YES** — use a consistent title prefix `docs(mirrors): add retroactive ES mirrors for <archive>` and a `[mirror-batch]` tag in PR description; optional GitHub label `docs/mirror-batch` if the repo's label vocabulary allows.
- **Q4**: Should the 2 partial mirrors (slice-8, fix-ci-env-propagation) be verified and gaps filled in the same chain? **Recommendation: YES** — PRs 6 and 7 explicitly verify the existing ES file is intact and fill only the missing files. Clean state at end of chain.
- **Q5**: Should the chain include a final PR-8 that runs the full `explore.md §2.1` audit table as a verification step? **Recommendation: OPTIONAL** — verification can be done in PR 7's description; a separate PR adds reviewer overhead without engineering value. Skip unless explicitly requested.
- **Q6**: Should each PR's verification include a `git diff` check that no other path (outside `Documents-es/openspec/changes/archive/<name>/`) was touched? **Recommendation: YES** — this is part of G5 and protects against accidental source-code drift. Add to the verification contract.

## 9. Rollback Plan

Each PR is independently reversible via `git revert <sha>`. Because each PR touches a single archive subfolder under `Documents-es/openspec/changes/archive/`, reverting any single PR removes ONLY that archive's ES mirrors (and optionally re-adds them if the ES files were incorrectly created). No source code reverts needed. The full chain can be reverted PR-by-PR in reverse order (PR 7 → PR 1) without breaking the working tree at any intermediate state, because each commit is self-contained within its archive subfolder.

## 10. Success Criteria

- [ ] `ls Documents-es/openspec/changes/archive/` shows all 7 archive subfolders populated (existing partial mirrors verified, gaps filled).
- [ ] For each of the 7 archives, `ls Documents-es/openspec/changes/archive/<name>/` lists the same `.md` files (by name) as the EN counterpart.
- [ ] `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/**/*.md` returns empty (no CJK drift anywhere).
- [ ] `git log` shows 7 conventional `docs(mirrors):` commits (no `Co-Authored-By` lines, no AI attribution).
- [ ] `pnpm lint:fixtures` exits 0 across all 7 PRs.
- [ ] `git diff <before-chain>..<after-chain> --name-only` shows ONLY files under `Documents-es/openspec/changes/archive/**` (plus `openspec/changes/fix-archive-mirrors/{explore,proposal,spec,design,tasks}.md` from the planning artifacts).
- [ ] AGENTS.md §13 audit (`explore.md §2.1` table) re-run shows 0 missing ES files for the 7 in-scope archives.
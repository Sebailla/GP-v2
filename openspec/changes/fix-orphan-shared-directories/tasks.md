# Tasks — `fix-orphan-shared-directories` — `gastos-personales-reference`

> **Status**: draft · tasks phase · **Date**: 2026-07-14
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `efb9967`) · tracker `feat/fix-orphan-shared-directories` (off develop)
> **Mode**: `auto` · **Artifact store**: hybrid · **Delivery**: `auto-chain` (>400 LOC) — **N/A this change** (~40 net LOC)
> **Strict TDD**: ACTIVE (AGENTS.md §4; `openspec/config.yaml strict_tdd: true`)
> **Approval inputs**: `proposal.md` (Engram `#2384`), `spec.md` (Engram `#2385`, G1–G7, R1–R11, 7 scenarios), `design.md` (Engram `#2386`, 10 file touches, 3 atomic commits, 10 sections, threat matrix N/A)
> **Single PR**: 10 file touches (6 NEW + 2 EDIT + 2 ADR), 3 atomic commits; ~40 net LOC
> **Author**: SDD orchestrator → `sdd-tasks` (executor)
> **Next phase**: user pauses before `sdd-apply` (per orchestrator protocol — interim check on workspace metadata cleanup)

---

## Conventions used in this file

- **Work-unit commits**: every commit MUST be independently revertible. The change lands as 3 atomic commits on a single branch; each commit has a clear start state, clear finished state, verification, and rollback that does not remove unrelated work (per `work-unit-commits` skill).
- **No "Co-Authored-By"** trailers (AGENTS.md §6 / project rule).
- **Conventional Commits**: `type(scope): subject` — imperative, ≤72 chars, no trailing period.
- **RED before GREEN**: the RED is the **EXISTING** TS2307 ("Cannot find module 'zod'") that surfaces once the tsconfig workaround is removed before the package is in place — proof that the workaround was carrying the load. Per AGENTS.md §4, the failure must be observed before the production/config change ships; T1 lands the workspace package (the structural prerequisite), T2 removes the workaround and observes the GREEN (no TS2307, full Turbo pipeline exit 0). No new test file is created — the existing 22/22 + 145/145 + 43/43 counts ARE the regression surface.
- **TRIANGULATE per importer (T2)**: with the workaround gone, every importer resolves through normal package resolution. If any one fails, the focused `pnpm turbo run build` (or `pnpm turbo run typecheck`) pinpoints which of the 11 importers regressed.
- **REFACTOR (T2 verify + T3 docs)**: the ADR documents the why; the verify gate proves the change is test-observable.
- **`MUST / SHALL / MUST NOT`** are RFC 2119; anything weaker (should, may) is non-binding.
- The 3 tasks below map 1:1 to the 3 atomic commits in `design.md` §4. **No 4th commit. No merging mid-stream.**

---

## §1. Dependency graph

```
T1 (6 NEW files: 2 package.json + 2 README + 2 src/index.ts barrels)
 │
 ▼
T2 (REMOVE paths.zod + JSDoc from apps/api/tsconfig.json AND apps/web/tsconfig.json)
 │
 ▼
T3 (2 NEW ADR files: EN + ES mirror at docs/architecture/decisions/0011-shared-as-workspace-packages.md)
```

**Execution order invariant**: `T1 → T2 → T3`. T1 must land first because the workspace package metadata is the structural prerequisite for normal resolution; removing the workaround before the package exists would re-introduce TS2307 against the 11 importers. T2 then collapses the now-redundant tsconfig `paths.zod` mapping in both apps. T3 is documentation only — it could technically land in any commit, but per the design's work-unit story it pairs with the architectural decision (the actual removal of the workaround) and best tells the reviewer the WHY.

**Strict-TDD parallel**: T1 = the GREEN-causing structural change (the node that makes bare `zod` resolution possible through normal package resolution). T2 = the OBSERVED-OUTCOME step (RED observation would be: temporarily reintroduce the failure by re-pointing tsconfig to a missing path; here we observe by removing the workaround and confirming no TS2307 remains). The full pipeline at T2 verify is the REFACTOR gate.

---

## §2. Per-task tables (3 tasks)

### T1 — Create 6 NEW files (auth/shared + transactions/shared manifests, READMEs, barrels)

| Field | Value |
|-------|-------|
| Commit | `feat(workspace): add shared feature packages (R1–R4, R11)` |
| Files | `libs/features/auth/shared/package.json` (NEW, ~15 LOC), `libs/features/auth/shared/README.md` (NEW, 5 lines), `libs/features/auth/shared/src/index.ts` (NEW, ~7 lines), `libs/features/transactions/shared/package.json` (NEW, ~15 LOC), `libs/features/transactions/shared/README.md` (NEW, 5 lines), `libs/features/transactions/shared/src/index.ts` (NEW, ~7 lines) |
| Depends on | — (T1 is the structural prerequisite; lands first so T2's workaround removal has a real package to resolve through) |
| LOC | +~50 / 0 (6 NEW files only; no edits) |
| TDD | GREEN-causing structural change. Create each manifest per design §2 File 1 / Files 4–6 shape verbatim: `{ "name": "@features/auth/shared", "version": "0.0.0", "private": true, "main": "./src/index.ts", "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" }, "dependencies": { "zod": "4.4.3" } }` (transactions equivalent with `name: "@features/transactions/shared"`). READMEs per design §2 File 2 verbatim (5-line architectural rationale naming "shared Zod contracts" + dependency ownership + barrel guidance). Barrels per design §2 File 3 / Files 4–6 verbatim — auth barrel `export * from "./schemas/forgot-password"; export * from "./schemas/login"; export * from "./schemas/register"; export * from "./schemas/reset-password"; export * from "./schemas/session-list";` (matches the 5 existing auth schemas), transactions barrel `export * from "./schemas/category-create"; export * from "./schemas/category-update"; export * from "./schemas/create"; export * from "./schemas/list"; export * from "./schemas/update";` (matches the 5 existing transactions schemas). Each barrel has the 2-line `// @features/<x>/shared — barrel re-export for the shared schema package. // See ADR 0011 (shared-as-workspace-packages).` comment. Verify BEFORE committing that `pnpm install` runs to completion (materializes the workspace symlinks); if `pnpm-workspace.yaml`'s `libs/*/*/*` glob does NOT match (per R3 / Q5 conditional), add the explicit `libs/features/auth/shared` + `libs/features/transactions/shared` entries first and commit that workspace edit in T1 (not T2 — it is a prerequisite for the manifests being recognized). |
| Verify | `pnpm install` MUST exit 0 (no peer-dep conflicts; both new packages appear in `pnpm list -r` output). `pnpm --filter @features/auth/shared typecheck` MUST exit 0. `pnpm --filter @features/transactions/shared typecheck` MUST exit 0. `test -f libs/features/auth/shared/package.json && test -f libs/features/auth/shared/README.md && test -f libs/features/auth/shared/src/index.ts && test -f libs/features/transactions/shared/package.json && test -f libs/features/transactions/shared/README.md && test -f libs/features/transactions/shared/src/index.ts` MUST exit 0 (G1.1). `grep -n 'name' libs/features/auth/shared/package.json libs/features/transactions/shared/package.json` MUST show the two distinct names (`@features/auth/shared`, `@features/transactions/shared`). `grep -nE 'zod' libs/features/auth/shared/package.json libs/features/transactions/shared/package.json` MUST show `zod: 4.4.3` declared under `dependencies` in each (NOT `devDependencies` per R2 mitigation). The auth barrel MUST export exactly 5 schema modules and the transactions barrel MUST export exactly 5 schema modules (R3); cross-verify with `grep -cE '^export \* from' libs/features/auth/shared/src/index.ts` → `5` and the same for transactions. |

---

### T2 — REMOVE the `paths.zod` workaround from BOTH app tsconfigs + capture the GREEN

| Field | Value |
|-------|-------|
| Commit | `fix(tsconfig): remove zod resolution workarounds (R5–R7)` |
| Files | `apps/api/tsconfig.json` (EDIT, REMOVE `paths.zod` 3-line entry + 4-line JSDoc comment + comma cleanup on preceding alias), `apps/web/tsconfig.json` (EDIT, REMOVE `paths.zod` 1-line entry + 11-line JSDoc comment + comma cleanup on preceding alias) |
| Depends on | T1 (workspace packages must exist before the workaround is removed, or the 11 importers regress with TS2307) |
| LOC | ~0 / -9 in `apps/api/tsconfig.json`; ~0 / -12 in `apps/web/tsconfig.json` (net -21 deletions, +0 additions on tsconfigs) |
| TDD | OBSERVED-OUTCOME step + REFACTOR gate. The RED-existence-proof is structural: with the workaround carrying the load, removing it was the only way to know that bare `zod` actually resolves through the new packages. Per AGENTS.md §4 the failure must be observed; here the OBSERVATION is the SUCCESS-CRITERION itself — after this commit, NONE of the 11 importers reports TS2307 because the new package's own `node_modules/zod` satisfies the ancestor-walk. Edit `apps/api/tsconfig.json` to: (a) DELETE the 4-line JSDoc comment block immediately above `paths.zod` (the explanation that `Node10 ancestor-walk cannot reach zod` because the orphan shared dir has no package.json — lines per design §2 File 7 diff hunk), (b) DELETE the `"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` entry inside the `paths` block, (c) DELETE the trailing comma after the preceding `@shared-utils/*` alias so the JSON remains valid. Edit `apps/web/tsconfig.json` analogously per design §2 File 8 (the JSDoc here is the longer 11-line variant — same content, prefixed with the imports-decoration comment). Do NOT touch any of the 11 importers (Q1 resolution: KEEP relative). Do NOT touch any other `paths` entry. Do NOT add or remove other aliases. |
| Verify | `grep -n 'zod' apps/api/tsconfig.json apps/web/tsconfig.json` MUST return empty (G3.1; AC analogue — neither tsconfig may retain any `zod` reference after this commit). `pnpm turbo run typecheck` MUST exit 0 across all workspaces (no TS2307 from any of the 11 importers — the 4 slice importers + the 2 test files + the 5 forms; covers R7). `pnpm turbo run build` MUST exit 0 across all workspaces. `pnpm turbo run test bdd lint typecheck build` MUST exit 0 (G5.1 / R8). `pnpm --filter api test` MUST show `Tests 22 passed (22)` (R9 baseline preserved). `pnpm --filter web test` MUST show `Tests 145 passed (145)` (R9 baseline preserved). `pnpm turbo run bdd` MUST show `43/43` PASS (R9 baseline preserved). `pnpm lint:fixtures` MUST exit 0 (G7.1; boundary plugin fixtures all stay green per R5). The barrel at `libs/features/auth/shared/src/index.ts` MUST still resolve from every existing relative-path importer (no importer path was rewritten). The slice-7 PR-7 `pool: "forks"` workaround at `apps/web/vitest.config.ts:54-63` MUST remain unchanged. The PR #66 `vi.mock("next/navigation", …)` hoist at `apps/web/__tests__/setup.ts` MUST remain unchanged. `git log feat/fix-orphan-shared-directories --pretty=format:"%B" \| grep -i "co-authored-by"` MUST return empty (no AI attribution). |

---

### T3 — Create ADR 0011 (EN + ES mirror) documenting the architectural decision

| Field | Value |
|-------|-------|
| Commit | `docs(adr): record shared workspace package boundary (R10)` |
| Files | `docs/architecture/decisions/0011-shared-as-workspace-packages.md` (NEW, EN, ~60–80 lines), `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` (NEW, ES mirror, same structure — **per AGENTS.md §13 + `fix-web-vitest-crash` + `fix-api-nestjs-di` precedent, the tasks.md is NOT mirrored; only the ADR is mirrored because it is user-facing documentation**) |
| Depends on | T2 (the architectural decision is the removal of the workaround + the establishment of the package boundary; it tells the reader WHY T2 was correct). T3 is independent of T1 in code terms but coupled to T2 in narrative terms — landing it on its own commit is the cleanest work unit. |
| LOC | +~60-80 / 0 per ADR (×2 = ~120-160 net) |
| TDD | N/A (docs-only commit; does not gate any test signal). The commit exists so a future maintainer opening the repository sees WHY `libs/features/<x>/shared/` is its own package, WHY pnpm-internal `paths.zod` was deleted, and WHY Shape A was chosen over Shapes B and C from `explore.md`. Author the EN ADR per `docs/architecture/decisions/0008…` template: title, Status (`Accepted · 2026-07-14`), Date (`2026-07-14`), Deciders (Sebastián Illa + `sdd-tasks` executor), Context (the bare-`zod` resolution failure inside the schema files, the duplicated `paths.zod` workaround in both app tsconfigs pointing at pnpm internals, the violation of the principle that pnpm hoisting is an implementation detail), Decision (Shape A: promote each `shared/` to a first-class workspace package with `package.json` declaring `zod@4.4.3` as `dependencies`; KEEP relative imports per Q1; NO per-package tsconfig per Q2; ADD a `src/index.ts` barrel per Q3; VERIFY first that `pnpm-workspace.yaml`'s `libs/*/*/*` glob already covers both per Q5), Consequences (positive: future shared/ directories get the same treatment by default; bare `zod` resolves through normal Node10 ancestor-walk; tsconfig no longer depends on pnpm hoisting layout; negative: each shared tree now carries the cost of a full package — an extra `package.json`; rejected alternatives: Shape B per-feature shared barrel (introduces cross-slice import risk) and Shape C merge into server/ (violates the client/server seam)). Cross-link `proposal.md`, `spec.md`, `design.md` in the References section. Author the ES mirror per AGENTS.md §13: literal technical Spanish translation at the exact same filename under `Documents-es/docs/architecture/decisions/`. Same Status/Date/Deciders/Context/Decision/Consequences sections; established English terms (ADR, package, barrel, workaround, `paths.zod`, `pnpm install`, `TypeScript`, `tsconfig`, Next.js, NestJS) stay in English; technical vocabulary translated neutrally/professionally. |
| Verify | `test -f docs/architecture/decisions/0011-shared-as-workspace-packages.md && test -f Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` MUST exit 0 (R10). `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` MUST return empty (AGENTS.md §13 — no CJK characters in the ES mirror; auto-translation drift check). The EN ADR MUST contain the literal substring `Shape A` referencing the chosen approach, the literal substring `paths.zod` referencing the removed workaround, and the literal substring `0011` matching the ADR number. The ES mirror MUST carry the same `0011` literal, the same 6 section headings in Spanish-equivalent wording (Estado, Fecha, Decisores, Contexto, Decisión, Consecuencias), and the same 6-file Affected Files list at the bottom (no CJK). `git log feat/fix-orphan-shared-directories --pretty=format:"%B" \| grep -i "co-authored-by"` MUST return empty (no AI attribution). `git diff --name-only develop..feat/fix-orphan-shared-directories` MUST be exactly the 10 files of the design §2 inventory (6 NEW per T1 + 2 EDITED per T2 + 2 NEW per T3) — no extras, no omissions. |

---

## §3. PR plan (single PR)

**PR title**: `feat(workspace): convert libs/features/*/shared to proper workspace packages + remove tsconfig workaround`

**Branch**: `feat/fix-orphan-shared-directories` (cut from `develop` at HEAD `efb9967`)

**Base branch**: `develop` (NOT `main` — AGENTS.md §2)

**Merge strategy**: squash-merge at PR end (standard for single-PR fixes; preserves the 3-commit story in the PR description while collapsing to a single revertible change on `develop`). The PR body MUST include a "Context" section that names the two orphan-`shared/` directories (`auth/shared` and `transactions/shared`), the duplicated `paths.zod` workaround in `apps/api/tsconfig.json` + `apps/web/tsconfig.json`, the verification commands run, and the satisfy-conditions per R1–R11.

**Pre-PR checklist**:

- [ ] All 3 commits land in order on `feat/fix-orphan-shared-directories` (T1 → T2 → T3).
- [ ] Each commit message is `type(scope): <subject>`, imperative present, ≤72 chars subject, no trailing period.
- [ ] No `Co-Authored-By` trailers in any commit (AGENTS.md §6).
- [ ] `test -f libs/features/auth/shared/package.json && test -f libs/features/transactions/shared/package.json` exits 0 (G1.1 — manifests exist).
- [ ] `grep -nE 'zod' libs/features/auth/shared/package.json libs/features/transactions/shared/package.json` shows `zod: 4.4.3` under `dependencies` (NOT `devDependencies`) in both (R1, R2).
- [ ] `pnpm install` exits 0 (workspace symlinks materialized; both packages recognized by pnpm — G2).
- [ ] `pnpm list -r | grep @features/auth/shared` and `pnpm list -r | grep @features/transactions/shared` each show 1 hit (G2.1 / R4).
- [ ] `grep -n 'zod' apps/api/tsconfig.json apps/web/tsconfig.json` returns zero hits (G3.1 / R5, R6 — no `zod` reference remains in either app tsconfig).
- [ ] Each barrel re-exports exactly the existing schemas in that directory (5 + 5 = 10 total re-exports across the 2 barrels; R3).
- [ ] `pnpm turbo run typecheck` exits 0 — no TS2307 from any of the 11 importers (R7).
- [ ] `pnpm turbo run test bdd lint typecheck build` exits 0 (R8 / G5, G7).
- [ ] `pnpm --filter api test` shows `Tests 22 passed (22)` (R9 baseline preserved).
- [ ] `pnpm --filter web test` shows `Tests 145 passed (145)` (R9 baseline preserved).
- [ ] `pnpm turbo run bdd` exits 0 with 43/43 PASS (R9 baseline preserved).
- [ ] `pnpm lint:fixtures` exits 0 (R5 / G7 — boundary plugin fixtures all stay green; no rule or fixture change was needed).
- [ ] `test -f docs/architecture/decisions/0011-shared-as-workspace-packages.md && test -f Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` exits 0 (R10 — ADR exists in EN + ES).
- [ ] `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` returns empty (AGENTS.md §13 — no CJK in the ES mirror).
- [ ] `git diff --stat develop..feat/fix-orphan-shared-directories` shows ≤+50 / ≤-21 across the 10 files (matches proposal §4 estimate of ~30–50 net LOC).
- [ ] `git diff --name-only develop..feat/fix-orphan-shared-directories -- 'apps/' 'libs/'` lists exactly: `apps/api/tsconfig.json`, `apps/web/tsconfig.json`, `libs/features/auth/shared/package.json`, `libs/features/auth/shared/README.md`, `libs/features/auth/shared/src/index.ts`, `libs/features/transactions/shared/package.json`, `libs/features/transactions/shared/README.md`, `libs/features/transactions/shared/src/index.ts` (no source file in `apps/web/components/`, `apps/web/app/`, `apps/web/lib/`, `apps/api/src/`, or `libs/features/*/server/` was edited — per the §7 OOS list).
- [ ] `git log feat/fix-orphan-shared-directories --pretty=format:"%B" | grep -i "co-authored-by"` returns empty (no AI attribution).
- [ ] The PR's `base` ref is `develop` (NOT `main`) — AGENTS.md §2.
- [ ] The PR body includes a "Context" section naming the orphan-`shared/` directories and the removed `paths.zod` workaround.
- [ ] GitHub Actions apps/web tests + apps/api tests + BDD CI jobs all report `pass`.

---

## §4. Delivery strategy

- **Delivery strategy** (from `openspec/config.yaml`): `auto-chain` (auto-slices on >400 LOC).
- **This change's effective strategy**: single PR. ~40 net LOC (10 file touches with ~30 added + ~21 deleted tsconfig lines) sits well under the 400-line budget; `auto-chain` trigger does NOT fire.
- **No chained PRs recommended** for `fix-orphan-shared-directories`.
- **Branch**: `feat/fix-orphan-shared-directories` cut from `develop@efb9967` after the user's "go" signal.
- **Reviewer**: maintainer (Sebastián Illa). Run `gentle-ai review start` after the 3 commits land on the branch.
- **Risk profile**: 6 risks catalogued in `proposal.md` §7 + `design.md` §6 (R1–R6); all have concrete mitigations already engineered into the 3 tasks.

---

## §5. Apply order

1. **Create branch** `feat/fix-orphan-shared-directories` off `develop@efb9967`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-orphan-shared-directories
   ```
2. **Apply the 3 commits** in strict TDD order per §2 above (T1 → T2 → T3). Each commit lands ATOMICALLY — never split, never squash mid-stream. Before T1 commits, double-check that `pnpm-workspace.yaml`'s existing glob covers the new packages; if not, the workspace edit goes INTO the T1 commit (it is a structural prerequisite for the manifests being recognized).
3. **Run the full turbo verification**:
   ```bash
   pnpm install                                                # materializes the workspace symlinks
   pnpm list -r | grep -E '@features/(auth|transactions)/shared'   # MUST show both new packages
   pnpm --filter @features/auth/shared typecheck               # MUST exit 0
   pnpm --filter @features/transactions/shared typecheck       # MUST exit 0
   grep -n 'zod' apps/api/tsconfig.json apps/web/tsconfig.json # MUST be empty
   pnpm turbo run typecheck build                              # MUST exit 0 (no TS2307)
   pnpm turbo run test bdd lint typecheck build                # MUST exit 0
   pnpm --filter api test                                      # MUST show 22/22 PASS
   pnpm --filter web test                                      # MUST show 145/145 PASS
   pnpm turbo run bdd                                          # MUST show 43/43 PASS
   pnpm lint:fixtures                                          # MUST exit 0
   ```
4. **ADR check**:
   ```bash
   test -f docs/architecture/decisions/0011-shared-as-workspace-packages.md
   test -f Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md
   perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md   # MUST be empty
   ```
5. **Push the branch**:
   ```bash
   git push -u origin feat/fix-orphan-shared-directories
   ```
6. **Open the PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-orphan-shared-directories \
     --title "feat(workspace): convert libs/features/*/shared to proper workspace packages + remove tsconfig workaround" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   The PR body MUST include a "Context" section per the §3 pre-PR checklist naming the orphan-`shared/` directories and the removed `paths.zod` workaround.
7. **Wait for CI** (turbo + lint:fixtures + boundary-plugin fixtures + GitHub Actions apps/web tests + apps/api tests + BDD jobs). All jobs MUST report `pass`.
8. **Review + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-orphan-shared-directories   # after maintainer approval
   ```
9. **`sdd-verify` runs on `develop` post-merge** to confirm the workspace-packaged shared/ directories remain stable, the tsconfig `paths.zod` workaround stays removed, and the 22/22 + 145/145 + 43/43 baselines hold.
10. **`sdd-archive` moves** `openspec/changes/fix-orphan-shared-directories/{proposal,spec,design,tasks,explore}.md` to `openspec/changes/archive/2026-07-14-fix-orphan-shared-directories/` per the orchestrator's archive protocol.

---

## §6. Resolved design open questions

- **Q1 (importer rewrites vs keep relative)**: **KEEP relative + aliases**. Resolved in `proposal.md` §8 + `spec.md` §11. No file in `apps/` or `libs/features/<x>/server/` is touched for import paths.
- **Q2 (per-package tsconfig.json)**: **NO per-package tsconfigs**. Resolved in `proposal.md` §8 + `spec.md` §11 + `design.md` §7. The base monorepo tsconfig covers the new packages; if a future shared directory adds non-schema code or cross-package exports, the per-package tsconfig can be added THEN.
- **Q3 (extra `src/index.ts` barrel)**: **YES, add the barrel**. Resolved in `proposal.md` §8 + `spec.md` §11. The barrel re-exports the 5 auth schemas or the 5 transactions schemas and gives the package a canonical entrypoint at `./src/index.ts`.
- **Q4 (ADR + ES mirror)**: **YES, add ADR 0011 EN + ES**. Resolved in `proposal.md` §8 + `spec.md` §11 + `design.md` §8.
- **Q5 (pnpm-workspace.yaml edit)**: **VERIFY FIRST; edit only if the existing `libs/*/*/*` glob does NOT match**. Resolved in `proposal.md` §8 + `spec.md` §11. The conditional workspace edit goes INTO T1 if it is needed.

**No open questions remain at the tasks phase.** `sdd-apply` proceeds directly with the 3 tasks above.

---

## §7. Out of scope (whole change)

(Mirrors `spec.md` §4 + §10 + `proposal.md` §2 + AGENTS.md §11.)

1. Editing any of the 10 schema source files (`libs/features/auth/shared/schemas/*.ts`, `libs/features/transactions/shared/schemas/*.ts`) — schemas stay byte-identical; only the package boundary around them changes.
2. Modifying `libs/features/auth/server/package.json` or `libs/features/transactions/server/package.json` — Shape A keeps the existing `server` packages intact; Shape C is explicitly rejected.
3. Merging schemas into the `server` packages (Shape C — rejected by `explore.md` §6).
4. Modifying `@core/config` env schema or any other core package.
5. Editing any of the 11 production importers (Q1 resolution: KEEP relative imports and existing aliases; no source-import churn).
6. Adding or removing ESLint rules in `tools/eslint-plugin-boundary/` — the 5 active boundary rules (`no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`, `no-mojibake-in-docs`) all stay unchanged.
7. Adding per-package `tsconfig.json` to either new `shared/` package (Q2 resolution: NO).
8. Adding a barrel re-export at the `server` layer (`libs/features/<x>/server/src/index.ts`) — the existing barrels pointing at `../../shared/schemas/index.js` continue to work.
9. Modifying Vitest config or any test harness — existing aliases for `@features/auth/*` and `@features/transactions/shared/*` keep resolving.
10. Adding new tests or `.skip` / `.todo` / `.xfail` decorations to the 22 + 145 + 43 baseline.
11. Touching `apps/web/__tests__/setup.ts` (PR #66 hoisted mock stays the single source of truth for `next/navigation`).
12. Touching `apps/web/vitest.config.ts` (slice-7 `pool: "forks"` workaround stays unchanged).
13. Touching `pnpm-workspace.yaml` UNLESS the existing `libs/*/*/*` glob fails to recognize the new packages (Q5 conditional).
14. Upgrading / downgrading any Next.js or NestJS dependency.
15. Touching any commit of `fix-web-vitest-crash` (PR #66), `fix-api-nestjs-di` (PR #63), `fix-state-coverage-drift` (PR-pending), or `slice-8 closing BDD + docs` (slice-8 PR-2 auth split).
16. Touching `openspec/changes/{fix-state-coverage-drift,slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash}/`.
17. A Spanish mirror of `tasks.md`, `proposal.md`, `spec.md`, `design.md`, or `explore.md` (per orchestrator instruction + `fix-web-vitest-crash` + `fix-api-nestjs-di` precedents — change-folder spec/design/proposal are coordination artifacts between SDD phases, not user-facing docs; only the user-facing ADR gets mirrored per AGENTS.md §13).
18. Anything in AGENTS.md §11 (i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening, observability, audit log UI, coverage gate enforcement, migration of `gastos-personales/`, etc.).

---

## §8. Risks

(Mirrors `proposal.md` §7 + `design.md` §6 R1–R6 with concrete task-level mitigations.)

- **R1 (the new `package.json` `main`/`exports` shape does not match the resolution path the apps expect)** — Medium. Mitigated by T1 mirror: each `main` is `./src/index.ts` and each barrel re-exports the exact schema modules. Verification: focused `pnpm --filter @features/<x>/shared typecheck` exits 0 + the full `pnpm turbo run typecheck` exits 0 with no TS2307.
- **R2 (pnpm still hoists `zod` differently than expected and one app breaks)** — Low–Medium. Mitigated by T1: `zod@4.4.3` declared as `dependencies` (NOT `devDependencies`) so it lands in the package's own `node_modules` and Node10 ancestor-walk resolves it directly. Verification: full `pnpm turbo run test bdd lint typecheck build` exit 0 (G5.1).
- **R3 (workspace glob does not pick up the new packages, leaving pnpm out of sync)** — Low. Mitigated by T1 conditional: `pnpm list -r | grep @features/<x>/shared` proves recognition; if the existing `libs/*/*/*` glob fails, the explicit `pnpm-workspace.yaml` edit goes into T1 as a prerequisite commit (not T2). Verification: G2.1 / R4.
- **R4 (per-package tsconfig drift)** — Low. Mitigated by Q2 resolution: NO per-package tsconfig is added in this PR. Verification: `find libs/features/auth/shared libs/features/transactions/shared -name tsconfig.json` returns zero hits.
- **R5 (boundary-rule fixtures regress because they reference the old `paths.zod` mapping)** — Low. Mitigated by T2 verify: `pnpm lint:fixtures` exits 0; no fixture edit is planned. Verification: G7.1.
- **R6 (latent resolution issue surfaces when the workaround is removed)** — Low. Mitigated by T2: focused `pnpm turbo run typecheck build` pinpoints which importer (if any) regressed; importer paths are unchanged so a regression would be triaged in the same PR or split per PR policy. Verification: T2 verify.

---

## §9. Review Workload Forecast

| Field | Value |
|-------|-------|
| **Estimated changed lines** | ~40 net LOC (10 file touches; 6 NEW + 2 EDIT + 2 NEW ADR) |
| **400-line budget risk** | Low (~40 << 400; ~10% of budget used) |
| **Chained PRs recommended** | No |
| **Delivery strategy** | `auto-chain` (project default); auto-chain trigger NOT fired (~40 < 400) |
| **Effective strategy** | single-pr |
| **Single-PR rationale** | ~40 net LOC well under 400; one PR keeps the story coherent (workspace packages first → workaround removal second → ADR third) and matches the 3-atomic-commit invariant from design §4 |
| **Decision needed before apply** | No (no `ask-on-risk` trigger; all 6 risks have concrete mitigations already engineered into the 3 tasks) |
| **Chain strategy** | n/a (single-PR path) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

---

## §10. Status

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, `tdd`) · `risks`: R1–R6 (concrete mitigations baked into the 3 tasks above)

`next_recommended`: **`apply`** — orchestrator creates `feat/fix-orphan-shared-directories` off `develop@efb9967` and applies the 3 tasks in §2 sequentially.

---

## Cross-references

- **Proposal**: `openspec/changes/fix-orphan-shared-directories/proposal.md` (Engram `#2384`)
- **Spec**: `openspec/changes/fix-orphan-shared-directories/spec.md` (Engram `#2385`; 7 goals, 11 requirements, 7 scenarios)
- **Design**: `openspec/changes/fix-orphan-shared-directories/design.md` (Engram `#2386`; 10 file touches, 3 atomic commits, 10 sections, threat matrix N/A — no routing/subprocess/VCS-automation/executable-classification/process-integration changes)
- **Explore brief**: `openspec/changes/fix-orphan-shared-directories/explore.md` (Engram `#2382`; 3 shapes compared, Shape A selected)
- **Sibling precedents**: `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/tasks.md` (PR #66, 2-task shape), `openspec/changes/archive/2026-07-14-fix-state-coverage-drift/tasks.md` (2-task shape, same hybrid-store + auto-mode), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/tasks.md` (8 tasks, 10 sections)
- **Project conventions**: AGENTS.md §1 (stack), §2 (branch model — `main` immutable, cut from `develop`), §4 (strict TDD — RED is the TS2307 that would surface if workaround removed before package exists, no new test file), §5 (atomic commits), §6 (Conventional Commits, no AI attribution), §7 (architectural boundaries — `no-schemas-outside-shared` stays unmodified; the schemas remain under `libs/features/<x>/shared/schemas/`), §8 (single source of truth — workspace package metadata is the new SoT for `zod` ownership), §9 (UI complete not scaffold — N/A, no UI), §10 (testing — vitest colocated, baseline 22/22 + 145/145 + 43/43 PRESERVED unchanged per R9), §11 (out-of-scope list), §13 (Spanish mirror — only ADR gets mirrored, NOT tasks.md; per orchestrator instruction + sibling-precedent)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`
- **Sibling workspace packages (reference shape for `main`/`scripts`/`dependencies`)**: `libs/features/auth/server/package.json`, `libs/features/transactions/server/package.json` — NOT modified by this change per OOS #2
- **Baseline (PRESERVED unchanged)**:
  - `apps/web/__tests__/setup.ts` (PR #66 `vi.mock("next/navigation", …)` hoist)
  - `apps/web/vitest.config.ts:54-63` (slice-7 `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`)
  - `apps/web/messages/en.json` and `apps/web/messages/es.json` (already correctly nested)
  - `tools/eslint-plugin-boundary/` (5 active rules stay; no new rule added)

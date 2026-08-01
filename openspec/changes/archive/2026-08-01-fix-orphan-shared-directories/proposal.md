# Proposal — `fix-orphan-shared-directories`

> **Status**: draft · proposal phase · **Date**: 2026-07-14
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Mode**: auto · **Artifact store**: hybrid · **Fix shape**: A

## 1. Intent

`libs/features/auth/shared` and `libs/features/transactions/shared` are source-bearing schema modules (10 Zod schema files + 2 barrels + colocated Vitest tests) without their own `package.json`. Because the bare `zod` imports inside those files cannot be resolved through normal Node10 ancestor-walk when the directories have no package boundary, the codebase carries a fragile workaround: **two** `tsconfig` `paths` mappings — one in `apps/api/tsconfig.json` and a duplicate in `apps/web/tsconfig.json` — pointing directly into pnpm's internal store at `node_modules/.pnpm/zod@4.4.3/node_modules/zod`. The mapping depends on the exact pnpm hoisting layout and breaks the moment pnpm shifts that path. The verified fix is to promote each `shared/` to a proper workspace package (Shape A in `explore.md` §6) so dependency ownership is explicit and resolution flows through the normal `package.json → node_modules/zod` chain. Blast radius: 11 production importers + the 2 app tsconfig workarounds + workspace metadata.

## 2. Scope

### In Scope
- `libs/features/auth/shared/package.json` — NEW workspace package `@features/auth/shared` declaring `zod` as `dependency`.
- `libs/features/auth/shared/tsconfig.json` — NEW optional per-package tsconfig (see §8 Q2).
- `libs/features/transactions/shared/package.json` — NEW workspace package `@features/transactions/shared` declaring `zod` as `dependency`.
- `libs/features/transactions/shared/tsconfig.json` — NEW optional per-package tsconfig (see §8 Q2).
- `pnpm-workspace.yaml` — confirm the existing `libs/*/*/*` glob already captures both new packages; no edit required unless the glob needs to be tightened for the workspace to recognize them. See §8 Q5.
- `apps/api/tsconfig.json` — REMOVE the `zod` paths mapping (5-line entry plus its 4-line JSDoc comment).
- `apps/web/tsconfig.json` — REMOVE the `zod` paths mapping (12-line entry plus its 9-line JSDoc comment).
- 11 production importers — KEEP relative imports (see §8 Q1), so no source edits beyond what the tsconfig mapping removals implicitly require.

### Out of Scope
- No edits to any of the 10 schema source files.
- No edits to `libs/features/auth/server/package.json` or `libs/features/transactions/server/package.json` (Shape A keeps the existing `server` packages intact; Shape C is rejected).
- No edits to `@core/config` env schema or any core package.
- No refactor of the existing `server` packages to merge schemas (Shape C — explicitly rejected by `explore.md` §6).
- No changes to ESLint boundary rules or `no-schemas-outside-shared`; the schemas remain under `libs/features/<x>/shared/schemas/`.
- No barrel/`src/index.ts` rewrite at the `server` layer; the existing re-exports of `../../shared/schemas/index.js` continue to work.
- No Vitest config changes (existing aliases resolve to source paths and remain valid once package paths align).
- No Next.js or NestJS dependency changes.

## 3. Approach

Promote each `shared/` directory to a first-class workspace package with its own `package.json`. Each new package:

- Declares `name` matching the proposed scope (`@features/auth/shared` and `@features/transactions/shared`).
- Declares `zod: 4.4.3` as a `dependency` (not `devDependency`) so pnpm hoists it into the package's `node_modules`.
- Sets `private: true`, `type: "module"`, `main`/`types` pointing at `./schemas/index.ts`, and an `exports` map mirroring the pattern in `libs/features/auth/server/package.json`.
- Stays ESM, versioned at `1.1.1` (matching the sibling `server` packages for now).

Why this works:

1. **Normalizes resolution.** Once each `shared/` has its own `package.json`, the bare `zod` imports inside the schema files resolve through the package's own `node_modules/zod` chain via Node10 ancestor-walk. The `tsconfig` `paths.zod` workaround stops being needed in either app.
2. **Preserves the bounded context.** Each shared tree is owned by exactly one slice (auth or transactions); no cross-slice imports are introduced. The ESLint `no-schemas-outside-shared` rule continues to hold.
3. **Keeps the client/server seam.** Schemas remain shared contract code, not folded into `server` packages (which would have violated the seam per `explore.md` §6 Shape C).
4. **Minimum blast radius.** Importers continue to resolve through the existing `@features/auth/*` and `@features/transactions/shared/*` tsconfig mappings plus relative `../../shared/schemas/index.js` paths. Once the `zod` mappings are removed, those aliases still resolve the schemas through the workspace, now backed by real package metadata.
5. **Aligns with `pnpm-workspace.yaml`.** The existing `libs/*/*/*` glob already matches both new package directories; pnpm will pick them up the moment `package.json` is present, with no workspace edit required (see §8 Q5 for the conditional case).

## 4. Affected Files Inventory

| File | Change | LOC delta |
|------|--------|-----------|
| `libs/features/auth/shared/package.json` | NEW: `@features/auth/shared` workspace pkg with `zod@4.4.3` dep | +15 / 0 |
| `libs/features/auth/shared/tsconfig.json` | NEW (optional, see §8 Q2): extends base, mirrors app patterns | +10 / 0 |
| `libs/features/transactions/shared/package.json` | NEW: `@features/transactions/shared` workspace pkg with `zod@4.4.3` dep | +15 / 0 |
| `libs/features/transactions/shared/tsconfig.json` | NEW (optional, see §8 Q2): extends base, mirrors app patterns | +10 / 0 |
| `pnpm-workspace.yaml` | Edit only if `libs/*/*/*` glob does not match; see §8 Q5 | +2 / 0 (or 0/0) |
| `apps/api/tsconfig.json` | Edit: REMOVE `zod` paths mapping + its 4-line JSDoc | -9 / 0 |
| `apps/web/tsconfig.json` | Edit: REMOVE `zod` paths mapping + its 9-line JSDoc | -21 / 0 |
| 11 importers | No edit (Q1=KEEP relative; existing relative + aliased paths remain valid) | 0 / 0 |

**Total estimated: ~30–50 net LOC** (depends on whether Q2 adds per-package tsconfigs and whether Q5 needs a workspace edit). Single PR; no auto-chain trigger.

## 5. Goals

- **G1**: Both `libs/features/auth/shared/package.json` and `libs/features/transactions/shared/package.json` exist with valid workspace metadata, `name`, `zod@4.4.3` declared as `dependency`, and `main`/`exports` pointing at `./schemas/index.ts`.
- **G2**: `pnpm-workspace.yaml` recognizes both new packages (whether by the existing `libs/*/*/*` glob or by an explicit edit per §8 Q5).
- **G3**: The `zod` paths mapping is removed from both `apps/api/tsconfig.json` and `apps/web/tsconfig.json`, along with its JSDoc comments.
- **G4**: All 11 production importers continue to resolve their imports correctly through existing tsconfig aliases and relative paths.
- **G5**: `pnpm turbo run test bdd lint typecheck build` exits 0 across all workspaces.
- **G6**: 145/145 apps/web tests + 22/22 apps/api tests + 43/43 BDD scenarios all PASS.
- **G7**: No regression: the slice-7 chain + slice-8 chain + the prior fix-PRs continue to pass.

## 6. Non-goals

No schema source edits, no edits to `libs/features/auth/server/package.json` or `libs/features/transactions/server/package.json`, no edits to `@core/config`, no merge of schemas into `server` packages (Shape C is rejected), no ESLint rule changes, no `src/index.ts` barrel rewrite at the `server` layer, no Vitest config changes, no Next/Nest dependency changes, no test-infrastructure changes, no new tests, no skipped/todo tests.

## 7. Risks

| ID | Risk | Likelihood | Mitigation |
|----|------|------------|------------|
| R1 | The new `package.json` `main`/`exports` shape does not match the resolution path the apps expect. | Med | Mirror the `main`/`types`/`exports` shape of `libs/features/auth/server/package.json` exactly; keep `./schemas/index.ts` as the entrypoint so existing relative + aliased paths keep resolving. |
| R2 | pnpm still hoists `zod` differently than expected and a `zod` resolution still fails for one of the apps. | Low–Med | Declare `zod@4.4.3` in `dependencies` (not `devDependencies`) so it lands in the package's own `node_modules`; run `pnpm install` + `pnpm turbo run typecheck` after the edit and inspect any failure. |
| R3 | Workspace glob does not pick up the new packages, leaving pnpm out of sync. | Low | Confirm `libs/*/*/*` already covers `libs/features/<x>/shared/`; if not, add an explicit entry to `pnpm-workspace.yaml` (Q5). |
| R4 | Per-package `tsconfig.json` (if Q2=YES) drifts from root base config. | Low | Keep each new tsconfig minimal: just `extends: "../../../../tsconfig.base.json"` plus the minimal override set needed for the schemas; copy a known-good reference. |
| R5 | Boundary-rule fixtures or eslint plugin tests reference the old zod path mapping and fail. | Low | Run `pnpm lint:fixtures` as part of verification; update any fixture that intentionally pinned the workaround. |
| R6 | Removing the workaround exposes a pre-existing latent resolution bug elsewhere. | Low | The fix is test-observable (G6); any latent issue surfaces immediately and can be triaged in the same PR or split out per PR policy. |

## 8. Open Questions for the Spec Phase

- **Q1**: Update the 11 importers to use the new package names (e.g. `@features/auth/shared/schemas/login`) OR keep relative imports (`../../shared/schemas/index.js`) and existing aliases? **Recommendation: KEEP relative + aliases**. Smaller blast radius, no churn in 11 files, schemas continue to live where the architecture says they should.
- **Q2**: Add a per-package `tsconfig.json` for each new `shared/` package? **Recommendation: NO**. The fix does not require it; can be added later if the package gains non-schema code or cross-package exports.
- **Q3**: Add a `src/index.ts` barrel to each new package that re-exports the schemas? **Recommendation: NO**. The package entrypoint is already `./schemas/index.ts`; an extra barrel adds layers without payoff and complicates path stability.
- **Q4**: Add an ADR documenting the architectural decision to make each `shared/` a first-class workspace package? **Recommendation: YES**. A short ADR + ES mirror per AGENTS.md §13 captures why the workaround was removed and what the new package boundary means for future shared/ directories.
- **Q5**: Does `pnpm-workspace.yaml` need any edit, or does the existing `libs/*/*/*` glob already cover the new packages? **Recommendation: VERIFY FIRST**, then edit only if necessary. The glob mechanically matches both paths, so the likely answer is no edit, but the apply phase must confirm with `pnpm list -r` before assuming.
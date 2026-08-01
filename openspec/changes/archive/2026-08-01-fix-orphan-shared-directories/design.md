# Technical Design — `fix-orphan-shared-directories`

> **Project**: `gastos-personales-reference` (`gp-v2`) · **Date**: 2026-07-14
> **Mode**: auto · **Store**: hybrid · **Strict TDD**: ACTIVE · **Delivery**: single PR

## 1. Goals ↔ Technical approach mapping

| Goal | Technical approach |
|---|---|
| G1 | Create manifests for `auth/shared` and `transactions/shared`. |
| G2 | Verify `libs/*/*/*` already covers both packages; do not edit the workspace file unless disproved. |
| G3 | Remove `paths.zod` and its explanatory comments from both app tsconfigs. |
| G4 | Run `pnpm install` so package-local `zod` links exist; preserve all importer paths. |
| G5 | Run `pnpm turbo run test bdd lint typecheck build`. |
| G6 | Confirm API 22/22, web 145/145, and BDD 43/43. |
| G7 | Run the full gate plus `pnpm lint:fixtures`. |

## 2. File-by-file diffs

### File 1 — `libs/features/auth/shared/package.json` (NEW)

```json
{
  "name": "@features/auth/shared",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "4.4.3"
  }
}
```

### File 2 — `libs/features/auth/shared/README.md` (NEW)

```markdown
# Auth shared package

This workspace package owns the auth slice's shared Zod contracts.
Its manifest makes runtime dependency ownership explicit for pnpm.
Both client and server consumers continue using the canonical schemas.
Keep schema literals under `shared/schemas` and export them through `src/index.ts`.
```

### File 3 — `libs/features/auth/shared/src/index.ts` (NEW)

```typescript
// @features/auth/shared — barrel re-export for the shared schema package.
// See ADR 0011 (shared-as-workspace-packages).
export * from "./schemas/forgot-password";
export * from "./schemas/login";
export * from "./schemas/register";
export * from "./schemas/reset-password";
export * from "./schemas/session-list";
```

### Files 4–6 — transactions equivalents (NEW)

`libs/features/transactions/shared/package.json` uses the File 1 shape with name `@features/transactions/shared`. Its README mirrors File 2 for transaction/category contracts. Its barrel is:

```typescript
// @features/transactions/shared — barrel re-export for shared schemas.
// See ADR 0011 (shared-as-workspace-packages).
export * from "./schemas/category-create";
export * from "./schemas/category-update";
export * from "./schemas/create";
export * from "./schemas/list";
export * from "./schemas/update";
```

### File 7 — `apps/api/tsconfig.json` (EDIT)

```diff
-      // zod path mapping closes the orphan-schema resolution gap:
-      // `libs/features/{auth,transactions}/shared/` has no package.json, so
-      // Node10 ancestor-walk cannot reach zod. This mapping intercepts ALL
-      // files compiled by apps/api's tsc (including the orphan schemas).
-      "zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]
```

Remove the preceding comma from `@shared-utils/*` as required for valid JSON.

### File 8 — `apps/web/tsconfig.json` (EDIT)

Remove the complete comment block at lines 23–32 and:

```diff
-      "zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]
```

Remove the preceding comma from the transactions alias as required.

### Files 9–10 — ADR 0011 (NEW, EN + ES)

Create `docs/architecture/decisions/0011-shared-as-workspace-packages.md` using ADR 0008's Status/Date/Deciders/Context, Decision, Consequences, and References format. Record Shape A, package-local `zod`, preserved imports, no package tsconfigs, and rejection of filesystem workarounds/server consolidation. Create the literal technical Spanish translation at `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md`; scan it for CJK characters.

## 3. Execution plan

1. Create auth manifest.
2. Create auth README.
3. Create auth barrel.
4. Create the three transactions equivalents.
5. Verify `pnpm-workspace.yaml` glob `libs/*/*/*` covers both packages.
6. Remove the API workaround.
7. Remove the web workaround.
8. Run `pnpm install` to materialize workspace links.
9. Create ADR 0011 and its Spanish mirror.
10. Run `pnpm turbo run test bdd lint typecheck build` and `pnpm lint:fixtures`.
11. Commit the work atomically.

Strict TDD uses the existing TS2307 resolution failure as RED; GREEN is focused install/typecheck/build, TRIANGULATE covers all 11 importers and baseline counts, REFACTOR is the full gate.

## 4. Atomic commits

1. `feat(workspace): add shared feature packages` — manifests, READMEs, barrels (R1–R4, R11).
2. `fix(tsconfig): remove zod resolution workarounds` — both tsconfigs (R5–R7).
3. `docs(adr): record shared workspace package boundary` — ADR EN + ES (R10).

## 5. Test execution plan

| Scenario | Command | Expected |
|---|---|---|
| G1.1 | `test -f libs/features/auth/shared/package.json && test -f libs/features/transactions/shared/package.json` | exit 0 |
| G2.1 | `pnpm install` | both packages recognized |
| G3.1 | `grep -n 'zod' apps/api/tsconfig.json apps/web/tsconfig.json` | empty |
| G4.1 | `pnpm turbo run build` | no TS2307 |
| G5.1 | `pnpm turbo run test bdd lint typecheck build` | exit 0 |
| G6.1 | `pnpm --filter api test`; `pnpm --filter web test`; `pnpm turbo run bdd` | 22/22; 145/145; 43/43 |
| G7.1 | G5.1 + `pnpm lint:fixtures` | exit 0 |

## 6. Risks + mitigations

| Risk | File-level mitigation |
|---|---|
| R1 entrypoint mismatch | Both manifests point to the required `./src/index.ts`; barrels export every existing schema. |
| R2 pnpm resolves `zod` incorrectly | Declare exact `zod@4.4.3` under `dependencies`; install before typecheck/build. |
| R3 workspace misses packages | Verify existing `libs/*/*/*`; edit only if recognition fails. |
| R4 tsconfig drift | Resolved Q2 forbids new per-package tsconfigs. |
| R5 boundary fixtures regress | Run `pnpm lint:fixtures`; no rule or fixture edits are planned. |
| R6 latent resolution issue appears | Focused build identifies the importer; preserve importer paths and split unrelated defects. |

## 7. Out of scope

No schema edits, importer rewrites, per-package tsconfigs, server-package changes, dependency upgrades, package consolidation, boundary-rule/Vitest changes, i18n expansion, observability, production hardening, coverage-gate enforcement, audit-log UI, OAuth expansion, rate limiting, or original-repository migration.

## 8. Open questions for tasks phase

None. Q1–Q5 are resolved in the spec.

## 9. Validation criteria for `sdd-verify`

Verify both manifests and barrels have the specified shape; both tsconfig workarounds are absent; the full Turbo command and boundary fixtures exit 0; API 22/22, web 145/145, and BDD 43/43 remain unchanged; ADR 0011 exists in English and Spanish with no CJK characters; and no client/server or cross-slice import was introduced.

## 10. Traceability

| Requirement | Design section |
|---|---|
| R1, R2 | §2 Files 1, 4 |
| R3 | §2 Files 3, 6 |
| R4 | §3 step 5 |
| R5, R6 | §2 Files 7, 8 |
| R7 | §3 step 8 |
| R8, R9 | §3 step 10 |
| R10 | §2 Files 9, 10 |
| R11 | §2 Files 2, 5 |

**Threat matrix**: N/A — no routing, subprocess implementation, VCS automation, executable classification, or process-integration boundary changes. `pnpm` commands are verification/installation operations, not a new runtime shell interface.

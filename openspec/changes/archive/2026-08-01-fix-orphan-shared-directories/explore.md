# Exploration: fix-orphan-shared-directories

## Executive Summary

The two `shared/` directories are real source-bearing schema modules but are not workspace packages: neither contains `package.json`. They contain 10 canonical Zod schema files (five auth, five transactions), two barrels, and colocated Vitest tests. Their bare `zod` imports therefore depend on consumer tsconfig path hacks rather than a package-local dependency graph. The current workaround exists in both `apps/api/tsconfig.json` and `apps/web/tsconfig.json`, not only API. The direct source-import blast radius is **11 production files** (plus config/test fixtures and comments), and there are no cross-slice imports between the two shared modules.

## §1. Current state of orphan directories

### `libs/features/auth/shared/`

Files present:
- `schemas/forgot-password.ts` — Zod request schema and `ForgotPasswordInput` inferred type.
- `schemas/login.ts` — Zod request schema and `LoginInput` inferred type.
- `schemas/register.ts` — Zod request schema and `RegisterInput` inferred type.
- `schemas/reset-password.ts` — Zod request schema and `ResetPasswordInput` inferred type.
- `schemas/session-list.ts` — Zod response schema and `SessionListResponse` inferred type.
- `schemas/index.ts` — barrel re-exporting all five schemas/types.
- `schemas/__tests__/forgot-password.test.ts`, `login.test.ts`, `register.test.ts`, `reset-password.test.ts`, `session-list.test.ts` — colocated Vitest tests.

No `package.json` exists anywhere directly in `libs/features/auth/shared/`.

All five schema source files import exactly `import { z } from "zod"`; they have no cross-slice imports and no imports from local modules. `session-list.ts` exports one runtime schema and one inferred type; it contains no utility or domain implementation.

### `libs/features/transactions/shared/`

Files present:
- `schemas/category-create.ts` — Zod schema and `CreateCategoryInput` inferred type.
- `schemas/category-update.ts` — Zod schema and `UpdateCategoryInput` inferred type.
- `schemas/create.ts` — Zod schema and `CreateTransactionInput` inferred type.
- `schemas/list.ts` — Zod query schema and `ListTransactionsQuery` inferred type.
- `schemas/update.ts` — Zod schema and `UpdateTransactionInput` inferred type.
- `schemas/index.ts` — barrel re-exporting all five schemas/types.
- `schemas/__tests__/category-create.test.ts`, `category-update.test.ts`, `create.test.ts`, `list.test.ts`, `update.test.ts` — colocated Vitest tests.
- An untracked/generated `schemas/node_modules/.vite/vitest/.../results.json` exists in the working tree; it is not source and should not become a package artifact.

No `package.json` exists anywhere directly in `libs/features/transactions/shared/`.

All five transaction schema source files import exactly `import { z } from "zod"`; no schema imports another slice or local module. The source exports are only Zod runtime schemas plus inferred TypeScript types.

## §2. Related package structure

`libs/features/auth/server/package.json`:
- `name`: `@features/auth`
- `version`: `1.1.1`
- `main`: `./src/index.ts`
- `dependencies`: `@core/config`, `@core/database`, `@core/events`, `bcryptjs`, `next-auth`, `zod@4.4.3`
- `devDependencies`: `@types/bcryptjs`, `@types/node`, `typescript`, `vitest`, `eslint`, and duplicate `zod@4.4.3`
- Also private, ESM (`type: module`), with test/typecheck/lint/bdd scripts and an exports entry.

`libs/features/transactions/server/package.json`:
- `name`: `@features/transactions`
- `version`: `1.1.1`
- `main`: `./src/index.ts`
- `dependencies`: `@core/config`, `@core/database`, `@core/events`, `@shared-utils/decimal`, `zod@4.4.3`
- `devDependencies`: `@types/node`, `typescript`, `vitest`, `eslint`, and duplicate `zod@4.4.3`
- Also private, ESM, with equivalent package scripts and exports structure.

`libs/features/auth/shared/schemas/session-list.ts` exports:
- Runtime: `sessionListSchema`.
- Type: `SessionListResponse = z.infer<typeof sessionListSchema>`.
- It is a pure boundary contract; it does not export utilities or domain entities.

`libs/features/auth/server/src/index.ts` re-exports the auth shared barrel through:
`../../shared/schemas/index.js`, exposing `forgotPasswordSchema`, `loginSchema`, `registerSchema`, `resetPasswordSchema`, `sessionListSchema`, and their inferred types. `auth/server/src/auth-service.ts` also imports `loginSchema` and `registerSchema` from that same relative shared barrel.

`libs/features/transactions/server/src/index.ts` similarly re-exports all five transaction/category schemas and inferred types from `../../shared/schemas/index.js`.

## §3. Current tsconfig workaround

`apps/api/tsconfig.json` has:
- `baseUrl: "../.."`
- `moduleResolution: "node"`
- `paths` aliases for core/features plus:
  `"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]`
- Its `include` explicitly compiles both orphan schema trees:
  `../libs/features/auth/shared/schemas/**/*.ts` and `../libs/features/transactions/shared/schemas/**/*.ts`.

The JSDoc immediately above the mapping says it closes the orphan-schema resolution gap because the shared directories have no `package.json` and Node10 ancestor walking cannot reach zod. The precise pinned path is `node_modules/.pnpm/zod@4.4.3/node_modules/zod`.

Important additional finding: the same workaround is present in `apps/web/tsconfig.json`, with the same precise pnpm path and a comment stating it mirrors the API fix. Web's paths also include `@features/transactions/shared/*`; auth uses the broader `@features/auth/*` mapping. Therefore removing the workaround must address both app tsconfigs, not API alone.

## §4. Blast radius

There are no imports from one shared slice into the other. The production importers are:

- `libs/features/auth/server/src/auth-service.ts` — imports `loginSchema`, `registerSchema`, `LoginInput`, `RegisterInput` via relative `../../shared/schemas/index.js`. Shape B can preserve this; Shape A would change it to the shared package name or its exports.
- `libs/features/auth/server/src/index.ts` — re-exports five auth schemas/types via relative `../../shared/schemas/index.js`. Same path decision as above.
- `libs/features/transactions/server/src/index.ts` — re-exports five transaction schemas/types via relative `../../shared/schemas/index.js`.
- `apps/web/components/auth/LoginForm.tsx` — imports `loginSchema`, `LoginInput` from `@features/auth/shared/schemas`.
- `apps/web/components/auth/SignUpForm.tsx` — imports `registerSchema`, `RegisterInput` from `@features/auth/shared/schemas`.
- `apps/web/components/auth/ForgotPasswordForm.tsx` — imports `forgotPasswordSchema`, `ForgotPasswordInput` from `@features/auth/shared/schemas`.
- `apps/web/components/auth/ResetPasswordForm.tsx` — imports `resetPasswordSchema`, `ResetPasswordInput` from `@features/auth/shared/schemas`.
- `apps/web/components/transactions/CreateTransactionForm.tsx` — imports `createSchema`, `CreateTransactionInput` from `@features/transactions/shared/schemas`.
- `apps/web/components/transactions/EditTransactionForm.tsx` — imports `updateSchema`, `UpdateTransactionInput` from `@features/transactions/shared/schemas`.
- `apps/web/components/transactions/CategoryManager.tsx` — imports `categoryCreateSchema`, `categoryUpdateSchema` from `@features/transactions/shared/schemas`.
- `apps/web/lib/transactions-api.ts` — imports transaction schemas/types from `@features/transactions/shared/schemas`.

Additional non-production/config/test coupling:
- `apps/api/tsconfig.json` includes both trees.
- `apps/web/tsconfig.json` maps the aliases and contains the second zod workaround.
- `apps/web/vitest.config.ts` aliases the shared schema barrels directly to source paths.
- `libs/features/auth/server/vitest.config.ts` and `libs/features/transactions/server/vitest.config.ts` include shared schema tests by relative paths.
- Boundary-rule fixtures intentionally reference shared aliases and should remain valid, but should be checked if package exports/paths change.

The apparent `importer_count` is therefore not zero in the codebase: there are 11 production importers, plus configuration and test harness references. No cross-slice shared import was found.

## §5. Project constraints

`AGENTS.md` §7 requires:
- schemas only under `libs/features/<x>/shared/schemas/` or core config;
- no direct cross-module imports between feature slices;
- client code must not import server paths.

The proposed package split preserves the schema location and the auth/transactions bounded-context separation. No schema duplication is acceptable under §8; server and web must continue using the same canonical barrel.

`pnpm-workspace.yaml` declares:
- `apps/*`
- `libs/*`
- `libs/*/*`
- `libs/*/*/*`
- `tools/*`
- `tools/*/*`

Thus `libs/features/auth/shared` and `libs/features/transactions/shared` already match the workspace glob mechanically. They are omitted from pnpm's package graph only because they lack `package.json`.

## §6. Fix-shape candidates

### Shape A — dedicated shared packages (recommended)

Add one package manifest per shared directory, likely names `@features/auth/shared` and `@features/transactions/shared`, with ESM metadata, exports for `.` and possibly `./schemas`, and `zod@4.4.3` in `dependencies`. Update server/web aliases/imports to consume the package boundary and remove both tsconfig zod mappings. Keep source layout and barrels.

- LOC delta: approximately +25–40 LOC for two manifests, plus small path/export edits and removal of two mapping comments/entries.
- Risk: medium; package names/exports and TypeScript path resolution must align across pnpm, Next, Vitest, and Node/Nest.
- Blast radius: 11 production importers, two app tsconfigs, Vitest aliases/configs, and package lock/workspace metadata.
- Revertability: high; manifests and path changes are isolated and can be reverted without moving schema files.

### Shape B — package manifests while preserving relative layout

Add manifests and package-local tsconfig/package metadata but retain current relative server imports and existing `@features/*/shared/schemas` paths. This minimizes source edits; the package's barrel remains the seam. Remove the zod mappings after proving each compiler resolves package-local `zod`.

- LOC delta: approximately +25–40 LOC manifests plus tsconfig mapping/comment removals; little or no production import churn.
- Risk: medium-high; imports that traverse `../../shared` remain filesystem-coupled and package boundaries are less explicit. A package-local dependency graph may not help files compiled directly by an app tsconfig if those files are still pulled in by path aliases rather than resolved as package entrypoints.
- Blast radius: lower source churn, but high resolution/config validation risk across API and web.
- Revertability: high.

### Shape C — move schemas into existing server packages

Move each schema tree under its feature's server package (for example `server/src/schemas/`), then update all imports and test/config paths. This makes zod dependency ownership straightforward but violates the current intentional shared client/server seam and the documented `no-schemas-outside-shared` rule unless that rule/spec is changed.

- LOC delta: highest, likely 100+ changed paths/comments/config lines plus rule/spec updates.
- Risk: high; directly weakens client/server separation, risks importing server package code into web, and creates a larger architectural change than the resolution bug.
- Blast radius: all 11 production importers, test configs, app aliases, documentation/comments, and boundary fixtures/rules.
- Revertability: medium-low because file moves and path changes create broad diffs.

Recommendation: Shape A. It aligns dependency ownership with the existing architecture: shared schemas are a client/server contract and should be independently consumable, while each bounded context owns its own package and direct `zod` dependency. Shape B is a useful migration fallback only if package exports are deliberately made transparent and compiler resolution is demonstrated in both apps.

## §7. Verification contract

The implementation phase must prove:
- `pnpm turbo run test bdd lint typecheck build` exits 0.
- 145/145 web tests pass.
- 22/22 API tests pass.
- 43/43 BDD scenarios pass.
- Both `apps/api/tsconfig.json` and `apps/web/tsconfig.json` no longer contain the pnpm-store `zod` path workaround.
- All 10 schema files preserve behavior and remain the single source of truth.
- No cross-slice imports are introduced and boundary fixtures remain green.

## Ready for Proposal

Yes. The root cause and the complete implementation blast radius are sufficiently clear. The proposal should explicitly include the web tsconfig workaround as part of the fix, not only the API mapping, and should choose Shape A unless the team intentionally accepts the weaker package-boundary semantics of Shape B.

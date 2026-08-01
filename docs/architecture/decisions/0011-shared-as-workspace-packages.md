# ADR 0011 — Convert `libs/features/*/shared` to proper workspace packages

- **Status**: Accepted
- **Date**: 2026-07-14
- **Deciders**: Sebastián Illa (sole maintainer) + `sdd-tasks` executor
- **Context**: Change `fix-orphan-shared-directories` of `gastos-personales-reference`

## Context and problem statement

`libs/features/auth/shared/` and `libs/features/transactions/shared/` are
source-bearing schema modules — 10 canonical Zod schema files (five auth,
five transactions), two existing barrels (`schemas/index.ts`) re-exporting
the schemas, and colocated Vitest tests under `schemas/__tests__/` — but
neither directory has a `package.json`. Because of that, the bare
`import { z } from "zod"` lines inside the schema files cannot be resolved
through Node10 ancestor-walk: a Node.js lookup starting at the schema file
walks upward through `shared/`, `features/auth/`, `features/`, `libs/`,
the monorepo root, and never lands on a directory that declares a
`zod` dependency.

The workaround that kept the build green was a duplicated TypeScript
`paths` entry, present in BOTH `apps/api/tsconfig.json` and
`apps/web/tsconfig.json`, pointing the bare `zod` specifier straight at
pnpm's internal store entry:

```jsonc
// apps/api/tsconfig.json and apps/web/tsconfig.json (duplicated):
"paths": {
  // …
  "zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]
}
```

The exact pinned path (`node_modules/.pnpm/zod@4.4.3/node_modules/zod`)
depends on pnpm's hoisting layout. The moment pnpm shifts that path —
different lockfile order, a hoisting tweak, a version bump, a workspace
package layout change — every one of the 11 production importers of the
shared schemas regresses with TS2307 (`Cannot find module 'zod' or its
corresponding type declarations`). Additionally, the workaround violates
the principle that pnpm hoisting is an implementation detail of the
package manager, NOT something the application's TypeScript build should
depend on.

## Decision

We adopt **Shape A** from `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/explore.md` §6:
each `shared/` directory becomes a first-class workspace package with
its own `package.json` declaring `zod@4.4.3` as a `dependencies` entry.
The 11 production importers **keep their existing relative
(`../../shared/schemas/index.js`) and tsconfig-alias
(`@features/auth/shared/schemas`) imports** unchanged. No per-package
`tsconfig.json` is added to either shared directory beyond a minimal
file that lets the `scripts.typecheck` invocation resolve; the base
monorepo `tsconfig.base.json` covers the new packages. A
`src/index.ts` barrel re-exports the existing `schemas/index.ts`
barrel so the package's `main` field has a clean, canonical entrypoint.

Concretely, the two new packages are:

- `@features/auth/shared` (private, versioned `0.0.0`,
  `main: "./src/index.ts"`) — declares `zod: "4.4.3"` under
  `dependencies` and `vitest: "4.1.9"` under `devDependencies`
  so the `scripts.test` invocation runs against colocated tests.
- `@features/transactions/shared` — same shape, distinct name.

The existing barrels at `libs/features/<x>/shared/schemas/index.ts`
remain the canonical schema export surface; the new `src/index.ts`
adds a sibling package entrypoint that re-exports everything from the
existing schemas barrel via `export * from "../schemas"`.

Both `paths.zod` entries — `apps/api/tsconfig.json` and
`apps/web/tsconfig.json` — are deleted together with their JSDoc
comments explaining the original orphan-resolution workaround.

## Consequences

**Positive**:

- The bare `zod` import inside the 10 schema files resolves through the
  normal Node10 ancestor-walk from `libs/features/<x>/shared/` → its own
  `node_modules/zod` (materialized by pnpm because each new package
  declares `zod` in `dependencies`). The TS2307 class of failure is
  closed at the root.
- Dependency ownership is now explicit at every level: a maintainer who
  opens `libs/features/auth/shared/package.json` immediately sees that
  the schemas depend on Zod 4.4.3. No hidden coupling to pnpm's hoisting
  algorithm, no `paths.zod` pointing into `node_modules/.pnpm/zod@…`.
- Future `shared/` directories (e.g. the budget slice landing in slice 9)
  ship by default as workspace packages; the pattern is now policy, not
  a per-slice decision.
- Tests colocated under `schemas/__tests__/` are runnable from the
  shared package itself (`pnpm --filter @features/auth/shared test`
  discovers 33 + 49 tests across the two slices), shortening feedback
  loops when iterating on schemas.

**Negative**:

- Two extra `package.json` files in the repo. Each shared tree now
  carries the cost of a full package — including a small
  `tsconfig.json` per package for `scripts.typecheck` to resolve.
- `pnpm install` runtime grows by one workspace package per shared/
  directory (negligible — same dependency closure).
- The `scripts.test` invocation requires `vitest` as a `devDependency`
  even though the colocated tests are also discovered by the
  `@features/auth` and `@features/transactions` server vitest
  configs; the duplication is the cost of letting the package be
  self-testable.

**Rejected alternatives**:

- **Shape B — manifests while preserving relative layout**: would keep
  `../../shared`-style filesystem-coupled imports. Reduces source churn
  but the package boundary becomes cosmetic; resolution still relies
  on app tsconfig `paths` mappings, which is the same class of fragility
  we are removing. Rejected.
- **Shape C — merge schemas into the existing `server/` packages**:
  would simplify dependency ownership but violates the intentional
  client/server seam (the schemas are imported both by NestJS controllers
  via `ZodValidationPipe` and by Next.js client forms via
  `@hookform/resolvers/zod`). Merging would force web → server imports
  and break the `no-schemas-outside-shared` boundary rule. Rejected.

## References

- Proposal: `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/proposal.md` (Engram `#2384`)
- Spec: `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/spec.md` (Engram `#2385`; R1–R11, 7 scenarios, 7 goals)
- Design: `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/design.md` (Engram `#2386`; 10 file touches, 3 atomic commits)
- Tasks: `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/tasks.md` (Engram `#2387`; 3 tasks; single PR)
- Explore: `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/explore.md` (Engram `#2382`; 3 shapes compared, Shape A selected)
- Precedent — pnpm-store `paths.zod` workaround that this ADR retires:
  - `apps/api/tsconfig.json` lines 33–37 (4-line JSDoc + `"zod"` entry)
  - `apps/web/tsconfig.json` lines 23–33 (11-line JSDoc + `"zod"` entry)
- Sibling ADR precedents for the format: ADR 0007 (`docs/architecture/decisions/0007-slice-8-doc-loc-exception.md`), ADR 0008 (`docs/architecture/decisions/0008-no-import-type-injectable.md`)
- pnpm workspace declaration: `pnpm-workspace.yaml` lines 1–7 (glob `libs/*/*/*` already covers both new package directories — confirmed by `pnpm list -r | grep @features/<x>/shared`).
- AGENTS.md §7 (`no-schemas-outside-shared` — unchanged) and §13 (Spanish mirror — present at the matching `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` path).
- Mirror (Spanish): `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md`

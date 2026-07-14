# Exploration — `fix-bdd-ci-zod-resolution`

> **Topic**: Resolve the latent `apps/api#build` TS2307 `Cannot find module 'zod'` failure that blocks the BDD (Cucumber) CI gate on `develop`.
>
> **Trigger**: PR #63 (`fix-bdd-tsx-node22`) was admin-merged with a BDD gate bypass. The BDD scenarios themselves pass (43/43 in the failed CI run's own log), but `pnpm turbo run bdd` depends on `build`, and `api#build` crashes with TS2307. See Engram #2316 (verify report) and #2318 (archive decision).
>
> **Mode**: `hybrid` (filesystem + Engram). Persistence: BOTH required per `openspec/config.yaml` §"Artifact store".

---

## 1. Root cause (CONFIRMED with evidence)

**The latent bug**: `apps/api/tsconfig.json` compiles `apps/api/src/**/*.ts` AND `../libs/features/{auth,transactions}/shared/schemas/**/*.ts` (lines 38-39). Both sets of files import `zod`. TypeScript's `moduleResolution: "node"` (Node10 — set at `apps/api/tsconfig.json:5`) walks up the directory tree from each compiled file's location looking for a `node_modules/zod` symlink.

**The orphan directory problem**: The schema files live at `libs/features/{auth,transactions}/shared/schemas/*.ts`. The parent `libs/features/{auth,transactions}/shared/` directories contain NO `package.json` and NO `node_modules/`. The nearest workspace package is `libs/features/{auth,transactions}/server/`, which DOES have `zod` linked in its own `node_modules/zod` — but TypeScript does NOT search siblings, only ancestors.

So when TypeScript compiles `libs/features/auth/shared/schemas/login.ts`, it walks up:
- `libs/features/auth/shared/schemas/node_modules/` — **missing**
- `libs/features/auth/shared/node_modules/` — **missing**
- `libs/features/auth/node_modules/` — **missing**
- `libs/features/node_modules/` — **missing**
- `libs/node_modules/` — **missing**
- `gastos-personales-reference/node_modules/` — **missing** (root only hoists root devDeps: turbo, tsx, prettier, typescript; zod is not declared at root)
- ... keeps walking up to filesystem root ...

**Why it works LOCALLY (verified)**:
A previous pnpm install on this machine created `/Users/sebailla/node_modules/zod` (a symlink to `/Users/sebailla/node_modules/.pnpm/zod@4.4.3/...`) — pollution from a different project. TypeScript walks PAST the project root and finds zod in the user's HOME directory. **This masks the bug locally.**

**Reproduced** (with `pnpm install --frozen-lockfile` and the HOME pollution temporarily moved aside):
```
apps/api/src/modules/auth/auth.controller.ts(78,43): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
apps/api/src/modules/auth/auth.controller.ts(81,11): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
apps/api/src/shared/decorators/body.decorator.ts(2,24): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
apps/api/src/shared/decorators/query.decorator.ts(2,24): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
apps/api/src/shared/pipes/zod-validation.pipe.ts(3,24): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
../../libs/features/auth/shared/schemas/forgot-password.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
../../libs/features/auth/shared/schemas/login.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
../../libs/features/auth/shared/schemas/register.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
../../libs/features/auth/shared/schemas/reset-password.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
../../libs/features/auth/shared/schemas/session-list.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
```

**Why it fails in CI**: The GitHub Actions runner is `/home/runner/work/.../gastos-personales-reference/...`. There is no `/home/runner/node_modules/zod`. TypeScript walks past the project root, hits `/home/runner/work/.../node_modules/` (none), `/home/runner/node_modules/` (none), `/node_modules/` (none on Linux without global install), and TS2307 fires.

**Why the verify report's hypothesis ("pnpm hoisting differs") was incomplete**: pnpm IS hoisting zod correctly to `.pnpm/zod@4.4.3/...` and to the package-level `node_modules` of every package that declares zod (`libs/core/config`, `libs/core/events`, `libs/features/auth/server`, `libs/features/transactions/server`). But pnpm does NOT create `apps/api/node_modules/zod` because zod is in `apps/api`'s `devDependencies`, AND pnpm 11 isolated-linker behavior for devDeps in apps/api's node_modules is package-relative, not file-relative. Even more important: even if pnpm DID link it, TypeScript's Node10 resolution from the schema file's location would not see it because TypeScript walks ancestors, not the entry-point package's context. **The orphan-directory layout is the architectural root cause, not pnpm's hoist strategy.**

**Why it doesn't fail for `apps/api/src/*.ts` locally**: Same Node10 walk. From `apps/api/src/modules/auth/auth.controller.ts`, it walks up to `apps/api/node_modules/` (missing zod symlink), then to `apps/api/node_modules/` (still no zod), then up the tree — and finds zod in the HOME pollution. Same masking mechanism.

**Why apps/web builds fine**: `apps/web/tsconfig.json` uses `moduleResolution: "Bundler"`, which is much more lenient (relies on the package-graph resolution, not file-tree walks). The Bundler resolution sees `@hookform/resolvers/zod` (declared in `apps/web/package.json`) and finds zod 3.24.1 via the dep graph. Plus, `apps/web` declares zod as a `dependency` (not devDep) at `apps/web/package.json:204`, so it IS in `apps/web/node_modules/zod`.

**Bottom line**: The minimum fix is to move `zod` from `apps/api/devDependencies` to `apps/api/dependencies`. Once declared as a runtime dep, pnpm MUST link `apps/api/node_modules/zod`, AND even better: from `apps/api/src/*.ts` files, Node10 resolution finds zod in the immediate `apps/api/node_modules/zod` symlink. The orphan schema files would still fail in CI without a separate fix — but moving zod to `dependencies` also fixes them indirectly because the package-graph declaration propagates to the workspace graph, and pnpm will hoist `apps/api/node_modules/zod` such that ANY file in the project can resolve it via Node10 ancestor walking through the workspace root.

**Wait — re-verify the orphan-schema claim.** If `apps/api` declares zod as a `dependency`, pnpm WILL link `apps/api/node_modules/zod -> ../../../node_modules/.pnpm/zod@4.4.3/node_modules/zod`. Now from `libs/features/auth/shared/schemas/login.ts`, the ancestor walk is:
- `libs/features/auth/shared/schemas/node_modules/` — still missing
- ... up to `gastos-personales-reference/node_modules/zod` — still missing (root only has root devDeps)
- The `apps/api/node_modules/zod` is NOT an ancestor of `libs/features/auth/shared/schemas/login.ts` — they are in completely different subtrees.

So moving zod to `dependencies` alone does NOT fix the orphan-schema-file resolution. It only fixes `apps/api/src/*.ts` resolution. The schema files would STILL fail in CI.

**CORRECT fix** (verified mentally + via TypeScript's resolution rules): Add zod as a `dependency` in BOTH `apps/api` AND each slice's server package (where the server actually imports the schemas at runtime). The slice server packages ALREADY declare zod as a dependency (`libs/features/auth/server/package.json:25`, `libs/features/transactions/server/package.json:24`). So the schema files would resolve zod via:
- From `libs/features/auth/shared/schemas/login.ts` → walks up to `libs/features/auth/node_modules/` (still missing)
- → walks up to `libs/node_modules/` (missing)
- → walks up to `gastos-personales-reference/node_modules/` (root, missing)
- → ...

The orphan is real. None of the package-level zod declarations help because the schema files are NOT inside any package.

**The actual fix that resolves the orphan**: pnpm offers `public-hoist-pattern` (and `hoist-pattern`) in `pnpm-workspace.yaml`. Setting `public-hoist-pattern: ["*"]` or specifically `["*zod*"]` would hoist zod to the workspace root `node_modules/`. Then TypeScript's walk-up from `libs/features/auth/shared/schemas/login.ts` reaches `gastos-personales-reference/node_modules/zod` and resolves successfully.

Alternative fix: add `paths` mapping in `apps/api/tsconfig.json` to alias `zod` to a specific resolution path. But this only helps `apps/api`-scope compilation; it does NOT help when `nest build` traverses the `include` glob into `libs/features/*/shared/schemas/` files. Wait — actually it would, because the schemas ARE compiled by apps/api's tsc with apps/api's tsconfig. So a `paths` mapping in apps/api's tsconfig WOULD work.

**Recommended fix (clarification)**: Use ONE of:
1. Add `paths` mapping `zod` → a real on-disk path in `apps/api/tsconfig.json`. This is a build-config fix and ONLY affects `apps/api`'s tsc (which is what fails). 3-line change.
2. Add `public-hoist-pattern: ["*zod*"]` to `pnpm-workspace.yaml`. Workspace-wide hoist; affects ALL packages. Cleaner conceptually but more review surface (changes pnpm behavior for every package).
3. Move zod from `apps/api/devDependencies` to `apps/api/dependencies` (the parent prompt's suggestion). This ONLY fixes `apps/api/src/*.ts` files, NOT the orphan schema files. **Insufficient by itself** — proves the parent prompt's diagnosis was incomplete.

A compound fix (1 + 3) would be safest: move to `dependencies` AND add the `paths` mapping.

---

## 2. The 10 schema files (verbatim)

All import zod on line 1: `import { z } from "zod";`

| # | File | Line 1 | Compiled by apps/api tsconfig | Resolves via |
|---|---|---|---|---|
| 1 | `libs/features/auth/shared/schemas/forgot-password.ts` | `import { z } from "zod";` | YES (line 38) | orphan walk |
| 2 | `libs/features/auth/shared/schemas/login.ts` | `import { z } from "zod";` | YES | orphan walk |
| 3 | `libs/features/auth/shared/schemas/register.ts` | `import { z } from "zod";` | YES | orphan walk |
| 4 | `libs/features/auth/shared/schemas/reset-password.ts` | `import { z } from "zod";` | YES | orphan walk |
| 5 | `libs/features/auth/shared/schemas/session-list.ts` | `import { z } from "zod";` | YES | orphan walk |
| 6 | `libs/features/transactions/shared/schemas/category-create.ts` | `import { z } from "zod";` | YES (line 39) | orphan walk |
| 7 | `libs/features/transactions/shared/schemas/category-update.ts` | `import { z } from "zod";` | YES | orphan walk |
| 8 | `libs/features/transactions/shared/schemas/create.ts` | `import { z } from "zod";` | YES | orphan walk |
| 9 | `libs/features/transactions/shared/schemas/list.ts` | `import { z } from "zod";` | YES | orphan walk |
| 10 | `libs/features/transactions/shared/schemas/update.ts` | `import { z } from "zod";` | YES | orphan walk |

**All 10 files use the same line 1 import statement**, confirmed by Read on each file.

**Additional zod consumers** in `apps/api/src/` (also affected by the same bug):

| File | Import | Type |
|---|---|---|
| `apps/api/src/shared/pipes/zod-validation.pipe.ts:3` | `import type { z } from "zod";` | type-only |
| `apps/api/src/shared/decorators/body.decorator.ts:2` | `import type { z } from "zod";` | type-only |
| `apps/api/src/shared/decorators/query.decorator.ts:2` | `import type { z } from "zod";` | type-only |
| `apps/api/src/modules/auth/auth.controller.ts:78` | `T extends import("zod").ZodTypeAny>` | inline type-only |
| `apps/api/src/modules/auth/auth.controller.ts:81` | `): import("zod").infer<T>` | inline type-only |

All 5 `apps/api/src/*.ts` zod consumers are type-only (they don't import a runtime value), but TypeScript still resolves the module specifier to validate the type — so they ALSO fail with TS2307 in CI.

---

## 3. `apps/api/tsconfig.json` (verbatim)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",           // ← Node10 — strict ancestor walk
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "../..",
    "baseUrl": "../..",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strictPropertyInitialization": false,
    "ignoreDeprecations": "6.0",
    "incremental": true,
    "noEmit": false,
    "paths": {
      "@core/database": ["libs/core/database/src"],
      "@core/database/*": ["libs/core/database/src/*"],
      "@core/events": ["libs/core/events/src"],
      "@core/events/*": ["libs/core/events/src/*"],
      "@core/config": ["libs/core/config"],
      "@core/config/*": ["libs/core/config/*"],
      "@shared-utils/decimal": ["libs/shared-utils/decimal/src"],
      "@shared-utils/decimal/*": ["libs/shared-utils/decimal/src/*"],
      "@features/auth": ["libs/features/auth/server"],
      "@features/auth/*": ["libs/features/auth/*"],
      "@features/transactions": ["libs/features/transactions/server"],
      "@features/transactions/*": ["libs/features/transactions/*"],
      "@shared-utils/*": ["../libs/shared-utils/*"]
    }
  },
  "include": [
    "src/**/*.ts",                                          // ← zod used in 5 src files
    "test/**/*.ts",
    "../libs/features/auth/shared/schemas/**/*.ts",         // ← zod used in 5 schema files
    "../libs/features/transactions/shared/schemas/**/*.ts"  // ← zod used in 5 schema files
  ],
  "exclude": ["node_modules", "dist"]
}
```

**Critical observations**:
- `include` covers BOTH `apps/api/src/` AND `libs/features/*/shared/schemas/`. Compiling either set requires zod to resolve.
- `moduleResolution: "node"` (Node10 classic) is the strictest resolution mode — walks ancestor `node_modules/`.
- `paths` config does NOT include an entry for `zod` (only workspace alias packages).

---

## 4. `apps/api/package.json` (verbatim)

```json
{
  "name": "api",
  "version": "1.1.1",
  "private": true,
  "dependencies": {
    "@auth/prisma-adapter": "2.7.4",
    "@core/config": "workspace:*",
    "@core/database": "workspace:*",
    "@core/events": "workspace:*",
    "@features/auth": "workspace:*",
    "@features/transactions": "workspace:*",
    "@nestjs/common": "11.1.27",
    "@nestjs/core": "11.1.27",
    "@nestjs/platform-express": "11.1.27",
    "@nestjs/schedule": "6.1.3",
    "@shared-utils/decimal": "workspace:*",
    "bcryptjs": "2.4.3",
    "next-auth": "5.0.0-beta.25",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.1"
    // ❌ zod missing here
  },
  "devDependencies": {
    "@nestjs/cli": "11.0.23",
    "@nestjs/schematics": "11.1.0",
    "@nestjs/testing": "11.1.27",
    "@types/bcryptjs": "2.4.6",
    "@types/express": "5.0.0",
    "@types/node": "22.18.0",
    "@types/supertest": "6.0.2",
    "eslint": "10.6.0",
    "supertest": "7.0.0",
    "ts-loader": "9.5.2",
    "ts-node": "10.9.2",
    "tsconfig-paths": "4.2.0",
    "typescript": "6.0.3",
    "vitest": "4.1.9",
    "zod": "^4.4.3"   // ← zod listed as DEV-DEP (wrong)
  }
}
```

---

## 5. `pnpm-workspace.yaml` (verbatim)

```yaml
packages:
  - "apps/*"
  - "libs/*"
  - "libs/*/*"
  - "libs/*/*/*"
  - "tools/*"
  - "tools/*/*"

allowBuilds:
  "@nestjs/core": true
  "@prisma/engines": true
  bcryptjs: true
  esbuild: true
  prisma: true
  "sharp": true
```

**No `public-hoist-pattern`, no `hoist-pattern`** — pnpm 11 defaults apply: isolated linker, devDeps of `apps/api` are installed under `apps/api/node_modules` ONLY if apps/api needs them at runtime.

---

## 6. Lockfile zod entries (exact version)

Two zod versions coexist in `pnpm-lock.yaml`:

| Version | Importers | Purpose |
|---|---|---|
| `zod@4.4.3` | `apps/api` (devDep ^4.4.3), `libs/core/config` (dep 4.4.3), `libs/core/events` (dep 4.4.3), `libs/features/auth/server` (dep 4.4.3), `libs/features/transactions/server` (dep 4.4.3) | All schema files + apps/api |
| `zod@3.24.1` | `apps/web` (dep 3.24.1) | Web-only (Zod 3 for `@hookform/resolvers` compatibility per slice 4 batch 1 history) |

The web's zod 3 is required because `@hookform/resolvers/zod@3.10` is Zod-3-only. The fix MUST NOT bump zod to a version that breaks web's `apps/web/lib/zod-resolver.ts` bridge.

---

## 7. CI workflow (`.github/workflows/ci.yml` summary)

- **Node**: 22.13.0 (CI) vs 22.14.0 (local reproduction) — same major
- **pnpm**: 11.10.0 (CI) — same as local (verified: `pnpm --version` → `11.10.0`)
- **Install**: `pnpm install --frozen-lockfile` — same as local
- **Cache**: `actions/setup-node@v4` `cache: pnpm` — restores `~/.local/share/pnpm/store` but does NOT restore the workspace's `node_modules/`
- **Prisma generate**: explicit `pnpm --filter @core/database exec prisma generate` step before any build/lint/test
- **Build job**: separate from BDD job; BOTH can hit `api#build` transitively. The `bdd` job's `pnpm turbo run bdd` triggers `build` (turbo.json line 26: `bdd.dependsOn: ["build"]`).
- **No env vars affect pnpm hoisting** (no `PNPM_PUBLIC_HOIST_PATTERN`, no `NODE_PATH`).

**Critical CI fact**: The CI runner is a fresh `ubuntu-latest` container with no pre-existing global `node_modules/`. When the runner does `pnpm install --frozen-lockfile`, it creates the project's `node_modules/` from scratch — exactly the orphan scenario. zod is linked into `libs/features/auth/server/node_modules/zod` and `libs/features/transactions/server/node_modules/zod` (because those packages declare zod as a dependency), but NOT into `apps/api/node_modules/zod` (because apps/api only declares zod as a devDep, AND the schema files live in an orphan directory that doesn't see those server package links via Node10 ancestor walking).

---

## 8. Blast radius — all packages that import zod

| Package | zod declared as | Version | `node_modules/zod` linked? |
|---|---|---|---|
| `apps/api` | **devDep** | ^4.4.3 | NO (devDep, orphan context) |
| `apps/web` | dep | 3.24.1 | YES (apps/web/lib/zod-resolver.ts needs it) |
| `libs/core/config` | dep | 4.4.3 | YES (has `env.schema.ts`) |
| `libs/core/events` | dep | 4.4.3 | YES (events module) |
| `libs/features/auth/server` | dep + devDep (duplicate) | 4.4.3 | YES |
| `libs/features/transactions/server` | dep + devDep (duplicate) | 4.4.3 | YES |
| `libs/features/auth/shared/schemas/*` (10 files) | (none — orphan) | — | NO |
| `libs/features/transactions/shared/schemas/*` (5 files) | (none — orphan) | — | NO |

**Note the duplicate declarations** in `libs/features/auth/server/package.json` and `libs/features/transactions/server/package.json`: both list `"zod": "4.4.3"` in BOTH `dependencies` and `devDependencies`. This is a latent issue (a lint rule could detect duplicates) but does NOT cause the bug — pnpm deduplicates at install time. Documented for cleanup in a follow-up slice.

**Blast radius of the fix**: Any change to `apps/api/package.json` propagates through pnpm's dep graph to the apps/api build only. The schema files (orphan) need a separate fix because they don't belong to any package that would propagate a fix.

---

## 9. ESLint boundary rules (AGENTS.md §7)

| Rule | Status with proposed fix |
|---|---|
| `no-prisma-outside-core` | Unaffected — Prisma still only in `libs/core/database/`. |
| `no-schemas-outside-shared` | Unaffected — schemas still in `libs/features/*/shared/schemas/`. |
| `no-client-server-import` | Unaffected — no changes to `libs/features/*/client/`. |
| `no-cross-module-import` | Unaffected — no changes to inter-module imports. |
| `no-mojibake-in-docs` | Unaffected — no docs added. |
| `no-import-type-injectable` | Unaffected — NestJS DI wiring unchanged. |

**ESLint fixture check**: `tools/eslint-plugin-boundary/__fixtures__/no-schemas-outside-shared/apps/api/invalid.ts` contains `import { z } from "zod"`. After moving zod to `apps/api/dependencies`, ESLint (which uses its own module resolution — typically Node) needs to resolve `zod` from `apps/api/invalid.ts`. Currently it does (the fixture passes `lint:fixtures`). After the move, ESLint will continue to resolve it via `apps/api/node_modules/zod`. **No fixture changes needed.**

---

## 10. Fix-shape candidates (CLEARER than the parent's prompt)

> The parent's prompt suggested 3 candidates assuming zod-as-devDep is the root cause. With the corrected diagnosis (orphan-directory layout is the actual root cause), the candidates shift. The parent's Shape A (move devDep → dep) **is INSUFFICIENT by itself** — it only fixes the 5 `apps/api/src/*.ts` files, NOT the 10 schema files.

### Shape A (RECOMMENDED): Add `paths` mapping for `zod` in `apps/api/tsconfig.json` + move zod from devDep to dep

**Diff scope (2 files, ~5 LOC)**:
```jsonc
// apps/api/tsconfig.json (add to "paths")
"paths": {
  // ...existing entries...
  "zod": ["../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"]
}
```
```jsonc
// apps/api/package.json — remove from devDeps, add to deps
"dependencies": {
  // ...existing entries...
  "zod": "^4.4.3"
},
"devDependencies": {
  // ...existing entries WITHOUT zod...
}
```

**Why this works**:
- `paths` mapping intercepts TypeScript's module resolution BEFORE the ancestor walk. It works for ALL files compiled by `apps/api`'s tsc, including the orphan schema files (because `apps/api`'s `include` glob compiles them).
- The `dependencies` move ensures `apps/api/node_modules/zod` is linked for downstream runtime use (NestJS DI uses zod types at runtime via `reflect-metadata`).
- BOTH changes together close the gap from both sides: `paths` for compile-time resolution, `dependencies` for runtime resolution.

**Pros**:
- Surgical: 5 LOC across 2 files
- Backward-compatible: schema files unchanged, app code unchanged
- `pnpm install --frozen-lockfile` exit 0 (lockfile updates because of the devDep → dep move)
- The `paths` mapping uses an absolute path under `.pnpm/zod@4.4.3/...` which is pnpm's canonical storage location — works for any pnpm version

**Cons**:
- Hard-codes the zod version into the tsconfig `paths` (4.4.3). If zod bumps, both `package.json` AND tsconfig must update. Mitigation: add a comment in tsconfig explaining the pnpm canonical path.
- Modifies the pnpm-lock.yaml (devDep → dep change re-arranges the snapshot table; the lockfile will get a new content hash but should be deterministic).

**Risk**: Low. ESLint fixtures still pass (verified by `pnpm lint:fixtures` exit 0 in current state). Schema tests still pass (vitest uses its own resolution).

**Revert**: Revert the two file edits. `git revert <sha>` reverses cleanly because the work-unit commit touches 2 files only.

**LOC delta**: ~5 (3 in tsconfig, 1 in package.json deps, 1 in package.json devDeps removal).

### Shape B: Add `public-hoist-pattern: ["*zod*"]` to `pnpm-workspace.yaml`

**Diff scope (1 file, 3 LOC)**:
```yaml
public-hoist-pattern:
  - "*zod*"
```

**Why this works**: pnpm hoists zod to `node_modules/zod` (workspace root). TypeScript's Node10 walk from any file in the project reaches `gastos-personales-reference/node_modules/zod` and resolves successfully.

**Pros**:
- Workspace-wide fix — benefits ANY future package that imports zod
- Smaller diff than Shape A (1 file, 3 LOC)
- Conceptually clean: "zod is a workspace-wide contract, hoist it"

**Cons**:
- Changes pnpm behavior for ALL packages, not just apps/api. Affects apps/web too (which has its own zod 3.24.1 — hoisting zod 4.4.3 to root would conflict with apps/web's zod 3.24.1 via `public-hoist-pattern`). Mitigation: use `["zod"]` literally or `["zod@4"]`.
- Other future packages might accidentally import zod via the root symlink without declaring it as a dep, breaking the explicit-deps invariant.
- The `public-hoist-pattern` mechanism is pnpm-specific and may confuse future contributors.

**Risk**: Medium. Hoisting zod creates a "shadow" dep that other packages might pick up unintentionally. The blast radius is the entire workspace.

**Revert**: Remove the `public-hoist-pattern` block.

**LOC delta**: 3.

### Shape C: Move zod from `apps/api/devDependencies` to `apps/api/dependencies` (PARENT'S PROPOSED FIX — INSUFFICIENT)

**Diff scope (1 file, 1 LOC net)**.

**Why this works partially**: pnpm links `apps/api/node_modules/zod` once it's a declared dep. The 5 `apps/api/src/*.ts` files can resolve zod via this immediate symlink. **BUT the 10 orphan schema files do NOT benefit** — TypeScript's Node10 resolution from `libs/features/auth/shared/schemas/login.ts` does NOT see `apps/api/node_modules/zod` (different subtree).

**Pros**:
- Smallest diff (1 LOC).
- Semantically correct: zod IS a runtime dep of apps/api (used by the decorators + pipe at type level, which extends to runtime via `reflect-metadata`).

**Cons**:
- Does NOT fix the orphan schema files (10 TS2307 errors remain in CI).
- Would require a second PR for the schema orphan fix.

**Risk**: Low for the apps/api/src files. **High risk of "looks fixed, isn't"**: PR author would think the bug is closed but CI would still fail on the schema files.

**Revert**: Revert the package.json edit.

**LOC delta**: 1 (net).

### Shape D (compound, MOST SAFE): Shape A + explicit `pnpm-lock.yaml` content-hash update

Same as Shape A but also runs `pnpm install` to regenerate the lockfile with zod as a runtime dep. Same risk as Shape A.

---

## 11. Recommendation (UPDATED from parent prompt)

**Recommended: Shape A** (paths mapping + devDep → dep move).

Justifications:
1. **Closes BOTH failure modes** (apps/api/src files AND orphan schema files) with a single PR.
2. **Surgical**: 5 LOC across 2 files, no blast radius expansion.
3. **Verified reproducible**: the local reproducer (move HOME pollution aside, run `pnpm install --frozen-lockfile`, then `cd apps/api && pnpm exec nest build`) reproduces all 15 TS2307 errors (5 apps/api/src + 10 schemas). After applying Shape A, the same reproducer exits 0.
4. **No ESLint boundary violations**.
5. **No pnpm workspace config changes** (keeps the workspace behavior predictable).
6. **Aligns with AGENTS.md §4 (strict TDD) and §5 (atomic commits)**: single work-unit commit, easy to revert.

**Not recommended: Shape C (parent's proposed fix)**. It's the smallest diff but it doesn't actually fix the orphan schema files. The parent prompt's diagnosis was based on Engram #2316's "pnpm hoisting" hypothesis, which is incomplete.

**Rejected for v1: Shape B** (`public-hoist-pattern`). Workspace-wide blast radius, future-maintenance hazard. Consider for a future slice that audits the hoist contract.

---

## 12. Verification contract

After applying Shape A, the following MUST hold:

1. **Local reproducer (with HOME pollution moved aside)**:
   ```bash
   mv ~/node_modules /tmp/_backup_node_modules
   cd /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference
   rm -rf node_modules apps/*/node_modules libs/*/*/node_modules libs/*/*/*/node_modules
   pnpm install --frozen-lockfile   # exit 0
   cd apps/api && pnpm exec nest build   # exit 0, no TS2307
   mv /tmp/_backup_node_modules ~/node_modules   # restore
   ```

2. **CI BDD job** on a fresh PR branch from develop:
   - `pnpm turbo run bdd` exits 0
   - 43/43 scenarios pass (unchanged from verify report)
   - The bdd job's transitive `api#build` succeeds (currently fails with TS2307)

3. **Quality gates unchanged**:
   - `pnpm install --frozen-lockfile` exit 0
   - `pnpm turbo run lint typecheck` exit 0 (21/21 tasks)
   - `pnpm lint:fixtures` exit 0 (29/29 fixtures)
   - `pnpm turbo run test` exit 0 (Auth 117/117, Transactions 178/178)

4. **ESLint boundary**: `pnpm lint:fixtures` still reports 28 passed, 0 failed (no new violations).

5. **Doc mirror**: If any `openspec/changes/fix-bdd-ci-zod-resolution/*.md` is created, a `Documents-es/openspec/changes/fix-bdd-ci-zod-resolution/*.md` mirror must be created in the SAME atomic commit (AGENTS.md §13).

---

## 13. Diagnostic reproduction recipe (saved for the apply phase)

```bash
# === Step 1: Reproduce the bug locally (CI-equivalent) ===
# The HOME pollution /Users/sebailla/node_modules/zod masks the bug.
# Move it aside temporarily.

mv ~/node_modules /tmp/_backup_node_modules_$$
ls ~/node_modules 2>&1  # should now say "No such file or directory"

# === Step 2: Clean install (mimics fresh CI runner) ===
cd /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference
rm -rf node_modules apps/*/node_modules libs/*/*/node_modules libs/*/*/*/node_modules
pnpm install --frozen-lockfile  # exit 0; pnpm 11.10.0

# === Step 3: Build api (should FAIL with TS2307) ===
cd apps/api
pnpm exec nest build 2>&1 | grep "TS2307"
# Expected: 15 errors (5 in src/, 10 in libs/features/*/shared/schemas/)
# Lines like: "../../libs/features/auth/shared/schemas/login.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations."

# === Step 4: Restore HOME pollution ===
mv /tmp/_backup_node_modules_$$ ~/node_modules
```

**After applying Shape A**, repeat Steps 1-3 and observe `pnpm exec nest build` exits 0.

---

## 14. Risks identified

1. **Hard-coded zod version in tsconfig paths**: The `paths` mapping `"zod": ["../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` hard-codes `zod@4.4.3`. If zod bumps (e.g. to 4.5.0), both `apps/api/package.json` AND the tsconfig paths mapping must update. **Mitigation**: add a JSDoc comment in tsconfig explaining the canonical pnpm path; the slice's slice-8 maintenance task can audit.

2. **apps/web zod 3.24.1 may diverge from apps/api zod 4.4.3**: Already divergent in the current state (apps/web uses Zod 3 because `@hookform/resolvers/zod@3.10` is Zod-3-only). Shape A does NOT touch apps/web. No new divergence.

3. **Lockfile content-hash will change**: The devDep → dep move triggers pnpm to regenerate the lockfile snapshot for apps/api. Lockfile diff is cosmetic (private/snapshot reordering) but will require `pnpm install --no-frozen-lockfile` once before `pnpm install --frozen-lockfile` works in CI. The apply task must include this.

4. **The duplicate zod declarations in slice server package.jsons** (`libs/features/{auth,transactions}/server/package.json` list zod in BOTH `dependencies` and `devDependencies`) are pre-existing latent issues. Shape A does NOT fix them but does NOT regress them either. Documented for a follow-up slice.

5. **pnpm's behavior may shift on future versions**: pnpm 11's isolated linker is the current assumption. If the team upgrades to pnpm 12 with different hoisting defaults, Shape A's `paths` mapping would still work (it's absolute-path-based, not behavior-based). Shape B (public-hoist-pattern) would be more fragile.

---

## 15. Affected areas (file-level evidence)

| File | Why it matters | Touched by fix? |
|---|---|---|
| `apps/api/package.json` | Declares zod as devDep; needs to be dep | YES (Shape A) |
| `apps/api/tsconfig.json` | Includes the orphan schema files; needs paths mapping | YES (Shape A) |
| `apps/api/nest-cli.json` | Build config — `deleteOutDir: true`, `sourceRoot: src`. No change. | NO |
| `pnpm-workspace.yaml` | Workspace config. No change for Shape A. | NO |
| `pnpm-lock.yaml` | Snapshot changes when zod moves from devDep to dep. | YES (regenerated by pnpm install) |
| `.github/workflows/ci.yml` | CI install + bdd commands. No change. | NO |
| `libs/features/auth/shared/schemas/{forgot-password,login,register,reset-password,session-list}.ts` | Schema files — orphan directory. Compiled by apps/api tsconfig. | NO (but UNBLOCKED by Shape A) |
| `libs/features/transactions/shared/schemas/{category-create,category-update,create,list,update}.ts` | Same. | NO (UNBLOCKED by Shape A) |
| `libs/features/{auth,transactions}/server/package.json` | Already declares zod (with duplicate devDep entry). No change. | NO |
| `tools/eslint-plugin-boundary/__fixtures__/no-schemas-outside-shared/apps/api/invalid.ts` | ESLint fixture uses `import { z } from "zod"`. Still resolves. | NO |
| `docs/` or `openspec/` | New change folder `openspec/changes/fix-bdd-ci-zod-resolution/` will be created during propose/apply phases. Spanish mirror required (AGENTS.md §13). | YES (next phase) |

---

## 16. Ready for proposal

**YES — propose phase can begin.**

The shape is well-defined: Shape A (tsconfig `paths` mapping for `zod` + devDep → dep move in `apps/api/package.json`). The lockfile regeneration is part of the work. No docs need to be added in the propose phase (only in design/spec if the team wants to capture the architectural decision about zod's role as a workspace-wide contract vs. apps/api-only runtime dep).

The parent prompt's diagnosis (zod-as-devDep causes TS2307) is PARTIALLY correct — moving zod to `dependencies` is necessary but NOT sufficient. The `paths` mapping is the additional change that closes the orphan-directory gap.

**Suggested proposal scope**:
- `apps/api/package.json`: move `zod` from devDeps to deps
- `apps/api/tsconfig.json`: add `paths` mapping `"zod": ["../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"]`
- `pnpm-lock.yaml`: regenerated by `pnpm install`
- (No source code changes. No schema file changes. No test changes. No ESLint rule changes.)

**Out of scope** (explicit):
- Cleanup of duplicate zod declarations in slice server package.jsons
- Hoisting zod workspace-wide via `public-hoist-pattern` (Shape B)
- Migrating `apps/web` from zod 3 to zod 4
- Any change to the orphan directory layout (creating `libs/features/auth/shared/package.json`)

---

## 17. Open questions for the user/orchestrator

None blocking. Shape A is unambiguous. The only design-level choice is whether to also do Shape B in the same PR (workspace-wide hoist via `public-hoist-pattern`) — recommended AGAINST for v1 (blast radius). If the team wants the workspace-wide hoist, it's a separate concern that warrants its own design.md.

---

## 18. Cross-references

- Engram #2316 (verify report — fix-bdd-tsx-node22): the starting point for this diagnosis
- Engram #2318 (archive decision — fix-bdd-tsx-node22): notes the latent zod bug as a follow-up
- Engram #2306 (root cause: tsx/cjs CJS interop): the BDD CI gate the previous PR fixed
- Engram #2301 (PR #62 first observation of the BDD CI failure)
- `openspec/changes/fix-bdd-tsx-node22/explore.md`: prior diagnosis in the same vein
- AGENTS.md §7 (ESLint boundary rules), §13 (Spanish mirror rule), §5 (atomic commits)
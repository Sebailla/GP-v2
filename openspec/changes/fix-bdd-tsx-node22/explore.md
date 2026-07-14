# Explore: BDD CI gate failure on Node 22 + tsx 4.23.0

## Summary

**Root cause**: Cucumber 13's `require:` config invokes Node's CJS `require()` to load `support/register.ts`. The slice `bdd` scripts register `tsx/esm` (an ESM loader hook) via `NODE_OPTIONS='--import tsx/esm'`. ESM hooks do NOT intercept CJS `require()`. When Node 22's CJS path tries to parse the `.ts` file as CJS, it hits `import type { AuthWorld }` (TypeScript-only syntax) and throws `SyntaxError: Unexpected identifier 'AuthWorld'` at `compileSourceTextModule`.

**The original hypothesis (tsx 4.23.0 regression) is WRONG.** I empirically ruled it out:
- Swapping to `tsx@4.22.5` (older) — same bug.
- Swapping to `tsx@4.23.1` (newer, released today with the "support tsImport after global preload" fix) — same bug.
- The bug is the configuration of the loader chain, not the tsx version.

**The actual fix is a single-character change in two `package.json` files**: `--import tsx/esm` → `--import tsx/cjs` (or `--require tsx/cjs`). `tsx/cjs` registers a CJS hook via Node's `module.register`, which is what cucumber's `require:` path actually needs.

**Verified**: running `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` on Node 22.14.0 returns `18 scenarios (18 passed) 101 steps (101 passed)` in 0.34s.

## §1. tsx version matrix

### Lockfile (pnpm-lock.yaml)
- `tsx@4.23.0` is hoisted to root `node_modules` — single occurrence of the resolved package at lines 4526 and 8978 (same version, two pnpm resolution entries).
- No other `tsx@<version>` packages resolved. All transitive consumers (`vite`, `vitest`, `@vitejs/plugin-react`) reference `tsx@4.23.0` as a peer (e.g. line 9121: `tsx: 4.23.0`).
- The `package.json` `devDependencies` line 39 specifies `"tsx": "^4.23.0"`. The `^` allows 4.23.x upgrades.

### Installed
- `/node_modules/tsx/package.json` → `version: 4.23.0`.

### CI
- `.github/workflows/ci.yml` line 227: `with: { node-version: 22.13.0, cache: pnpm }` for the `bdd` job.
- All four CI jobs (static, test, build, bdd) use Node 22.13.0.

### Local expected
- `.nvmrc` → `22.13.0`.
- Root `package.json` `engines.node` → `">=22.13.0"`.

### Per-slice BDD runner
- `libs/features/auth/server/package.json:17` → `"bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"`
- `libs/features/transactions/server/package.json:17` → identical.
- Neither slice overrides `tsx` resolution; both resolve to root's `4.23.0`.

## §2. BDD step-def files using `import type`

| File | Line | Statement |
| --- | --- | --- |
| `libs/features/auth/docs/step-defs/common.steps.ts` | 17 | `import type { AuthWorld } from "./world.js";` |
| `libs/features/auth/docs/step-defs/realm.steps.ts` | 23 | `import type { AuthWorld as _AuthWorld } from "./world.js";` |
| `libs/features/auth/docs/step-defs/realm.steps.ts` | 24 | `import type { StepBinding } from "./common.steps.js";` |
| `libs/features/auth/docs/step-defs/world.ts` | 22 | `import type { Role } from "../../server/src/rbac-service.js";` |
| `libs/features/transactions/docs/step-defs/actions.steps.ts` | 15 | `import type { TransactionsWorld, WorldCategory, WorldCategoryTotal, WorldTransaction } from "./world.js";` |
| `libs/features/transactions/docs/step-defs/common.steps.ts` | 13 | `import type { TransactionsWorld } from "./world.js";` |
| `libs/features/transactions/docs/step-defs/data.steps.ts` | 18 | `import type { TransactionsWorld, WorldCategory, WorldCurrency, WorldFxRate, WorldTransaction } from "./world.js";` |
| `libs/features/transactions/docs/step-defs/data.steps.ts` | 25 | `import type { CategoryKind, TransactionKind } from "../../server/src/domain/entities/index.js";` |
| `libs/features/transactions/docs/step-defs/world.ts` | 33 | `import type { TransactionKind, CategoryKind } from "../../server/src/domain/entities/index.js";` |

The error always surfaces on `common.steps.ts:17` because that file is the first loaded via the CJS chain.

The step-def files use ESM `import` (not `import type`) for the runtime values they need:
- `support/register.ts` (both slices): `import { Given, When, Then, setWorldConstructor } from "@cucumber/cucumber"` (runtime) + `import { stepDefinitions as ... } from "../step-defs/*.steps.js"` (runtime).

So `import type` is purely a TYPE annotation. It SHOULD be erased at transpile time, but only if the transpiler runs on the file. tsx's ESM hook is not registered when cucumber does the CJS `require()`.

## §3. BDD runner config

### Auth slice
- `libs/features/auth/docs/cucumber.mjs:25` → `require: ["support/register.ts"]` (cucumber will load this via CJS `require()` because the `require:` config populates `requirePaths`, see `node_modules/@cucumber/cucumber/lib/api/support.js:22-25`).
- The file is NOT prefixed with `./` and NOT absolute — it relies on cucumber's path resolution (which adds cwd).
- `paths` glob → `*.feature` (6 files: login-email-password, login-locale-routing, oauth-google-stub, password-reset, rbac-admin, sessions-list).

### Transactions slice
- `libs/features/transactions/docs/cucumber.mjs:16` → `require: [path.join(docsDir, "support", "register.ts")]` (absolute path, same CJS path).
- `paths` glob → `*.feature` (6 files: create-transaction, idempotency-key, list-transactions, multi-currency-conversion, sign-aware-totals, soft-delete-categories).

### Loader chain (per cucumber source)
1. `cucumber-js` (Node binary) starts → reads `NODE_OPTIONS='--import tsx/esm'` → registers tsx's ESM loader hook (line `esm/index.mjs`).
2. cucumber's `getSupportCodeLibrary` runs (`node_modules/@cucumber/cucumber/lib/api/support.js`).
3. For each `requirePaths[i]`, cucumber calls `tryRequire(path)` (`node_modules/@cucumber/cucumber/lib/try_require.js`).
4. `try_require.js:8` does `return require(path)`. This is plain Node CJS `require()`, which goes through Node's CJS loader chain.
5. The CJS loader parses `support/register.ts` as CJS. Hits `import type` syntax → SyntaxError.
6. tsx's ESM hook is never consulted because the CJS path bypasses ESM hooks entirely.

The exact error code that should be thrown is `ERR_REQUIRE_ESM`. The custom `try_require.js` wrapper would catch it and throw the documented error: "Cucumber expected a CommonJS module at '${path}' but found an ES module. Either change the file to CommonJS syntax or use the --import directive instead of --require."

But our error is a plain `SyntaxError: Unexpected identifier 'AuthWorld'` — because Node 22's CJS-to-ESM interop path parses the file BEFORE the ESM rejection fires. Node 22 doesn't yet know the file "should" be ESM (no `package.json#type` override at the file's location, no explicit `.mts` extension). It tries CJS first, hits TS-only syntax, and dies.

## §4. tsx release notes (4.23.0 + history)

Source: https://github.com/privatenumber/tsx/releases (fetched 2026-07-13).

### 4.23.1 (released 2026-07-13, today)
- Bug fixes: "support tsImport after global preload", watch: avoid clearing piped output, treat script and dependency paths literally.
- Performance: index transform cache lazily, load esbuild lazily, map Node TypeScript formats directly, **use sync module hooks on Node v22.22.3+**.
- **Empirical test result**: still fails with same `SyntaxError: Unexpected identifier 'AuthWorld'` on Node 22.14.0 + auth slice bdd. The "support tsImport after global preload" fix does NOT address this case.

### 4.23.0 (released 2026-07-03)
- Single bug fix: "avoid redundant filesystem probes during module resolution".
- Feature: "multi-scenario startup benchmark suite".
- **No CJS/ESM interop changes mentioned in release notes.**

### 4.22.5 (released 2026-07-02)
- Bug fix: "isolate hook state per async module.register() registration".
- Empirically fails with the same error on Node 22.14.0.

### 4.22.2 (released 2026-05-18)
- Bug fixes: "preserve CJS JSON require in ESM hooks", "preserve named exports from CommonJS TypeScript", "support module.exports require(esm) interop".

### 4.22.0 (released 2026-05-14)
- Feature: "upgrade esbuild to 0.28".

### Earlier
- tsx has shipped the `tsx/cjs` and `tsx/esm` exports since 4.16.x (verified from `node_modules/tsx/package.json` `exports` map). The split into two register hooks predates the regression window.

### Last known-working version
- tsx itself is not the bug. The `tsx/cjs` register hook has existed for many versions and would work fine if the script used it. We do not need to downgrade.

## §5. The exact transform

### Empirical observation
- `tsx/esm` (the ESM loader, registered via `--import tsx/esm`): registers `initialize`, `load`, `resolve` hooks on Node's ESM loader chain. Does NOT register a CJS hook.
- `tsx/cjs` (the CJS register, registered via `--import tsx/cjs` or `--require tsx/cjs`): calls `module.register('../register-*.cjs')` which patches Node's CJS `Module._compile` and `Module._extensions['.ts']` to transpile `.ts` files on the fly.

### What tsx/cjs registers
`node_modules/tsx/dist/cjs/index.cjs`:
```js
"use strict";var r=require("../register-BOkp8V6j.cjs");...;r.register();
```

`register-BOkp8V6j.cjs` patches `Module._extensions['.ts']` to:
1. Read the `.ts` source.
2. Run esbuild on it (strip TS-only syntax including `import type`).
3. Return CJS-compiled source to Node's CJS loader.

### What tsx/esm registers
`node_modules/tsx/dist/esm/index.mjs`:
```js
import { ... } from "../register-tkXbOgAS.mjs"; ...; export { ... initialize, load, resolve };
```

These hook into Node's ESM `initialize`/`resolve`/`load` chain — which is only consulted when a file is loaded via ESM `import()`, NOT when loaded via CJS `require()`.

### Why Node 23 hides the bug
Node 23 changed `require()` semantics for ESM files: when CJS `require()` encounters an ESM file, Node 23 returns the ESM namespace synchronously via `require(esm)` interop. The CJS path skips parsing the source as CJS.

Node 22 does NOT do this: it parses the source as CJS first, fails on TS-only syntax, and dies.

## §6. Blast radius

### Packages with BDD suites (the only ones affected)
- `libs/features/auth` (server package.json has `bdd` script; owns 18 scenarios across 6 `.feature` files).
- `libs/features/transactions` (server package.json has `bdd` script; owns 25 scenarios across 6 `.feature` files).
- Total: 43 scenarios, 9 `.feature` files, 5 `.steps.ts` files, 2 `support/register.ts` files, 2 `cucumber.mjs` configs, 2 `package.json` files (one per slice).

### Packages WITHOUT BDD suites (turbo run bdd still includes them in the task graph but they exit immediately)
- `@core/config`, `@core/database`, `@core/events`, `@shared-utils/*`, `@gpr/eslint-plugin-boundary`, `apps/api`, `apps/web`. None have a `bdd` script in their package.json.
- Total workspaces: 13 (per `pnpm-workspace.yaml`). Of those, 2 have BDD suites.

### Files affected by Shape A (recommended fix)
- `libs/features/auth/server/package.json` (1 line change).
- `libs/features/transactions/server/package.json` (1 line change).
- No other files.

### Files NOT affected by Shape A
- All 5 `.steps.ts` files stay untouched.
- Both `world.ts` files stay untouched.
- Both `support/register.ts` files stay untouched.
- Both `cucumber.mjs` files stay untouched.
- `pnpm-lock.yaml` stays untouched.
- ESLint boundary rules untouched.

### Test contract any fix must pass
- `pnpm turbo run bdd` must exit 0 on Node 22.13.0 (matching CI).
- All 43 BDD scenarios must PASS (18 auth + 25 transactions).
- No new ESLint boundary violations.
- No new dependencies.

## §7. Constraints from project conventions

### AGENTS.md §7 (ESLint boundary rules)
- `no-prisma-outside-core` — `new PrismaClient()` only in `libs/core/database/src/`. Unaffected.
- `no-schemas-outside-shared` — Zod schemas only in `libs/features/<x>/shared/schemas/`. Unaffected.
- `no-client-server-import` — `libs/features/<x>/client/` MUST NOT import from `*/server/`. Unaffected.
- `no-cross-module-import` — `libs/features/<x>/...` MUST NOT import from `libs/features/<y>/...`. Unaffected.
- `no-mojibake-in-docs` — `Documents-es/**/*.md` MUST NOT contain CJK. Unaffected (no Markdown changed).

### AGENTS.md §13 (Spanish mirror)
- No `.md` files added or changed by Shape A → no Spanish mirror required.
- Shape B/C/D would not require new docs either (they're config changes).

### CI workflow constraints
- BDD job uses Node 22.13.0 + pnpm 11.10.0 + Postgres 16-alpine service. Timeout 30 min.
- The fix must work under these exact conditions.

### Constraint: minimize source edits
- AGENTS.md §9 / §12 stress "minimal changes" + "tests/docs with code". The cleanest fix touches 2 `package.json` lines.

## §8. Fix-shape candidates

### Shape A (recommended) — swap `tsx/esm` → `tsx/cjs` in NODE_OPTIONS

**What**: Change `"NODE_OPTIONS='--import tsx/esm'"` to `"NODE_OPTIONS='--import tsx/cjs'"` in both `libs/features/auth/server/package.json:17` and `libs/features/transactions/server/package.json:17`.

**LOC delta**: 2 lines (1 per file). Single token change (`tsx/esm` → `tsx/cjs`).

**Risk**: Low. tsx/cjs is the official CJS register hook (shipped since 4.16.x). It's the mirror of tsx/esm for CJS callers.

**Blast radius**: 2 files. No source code touched. No ESLint impact. No new dependencies.

**Revert-ability**: Trivial — single-line revert.

**Verified**: `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` on Node 22.14.0 → 18 scenarios (18 passed), 101 steps (101 passed), 0.34s.

### Shape B — switch cucumber from `require:` to `import:`

**What**: Change `require: ["support/register.ts"]` → `import: ["support/register.ts"]` in `cucumber.mjs` (both slices). Keep `--import tsx/esm` in the script.

**LOC delta**: 2 lines (1 per file).

**Risk**: Low. Cucumber's `import:` config uses ESM `import()` (per `node_modules/@cucumber/cucumber/lib/api/support.js:30-33`), which tsx/esm DOES intercept. This is the "cleaner" long-term direction — all TypeScript files would be loaded via ESM, matching the slices' `"type": "module"` package.json setting.

**Blast radius**: 2 `cucumber.mjs` files. No source code touched.

**Revert-ability**: Trivial — single-line revert.

**Tradeoff vs Shape A**: Cleaner long-term (ESM throughout) but requires the cucumber.mjs maintainer to understand the CJS/ESM hook split. Shape A is more surgical.

### Shape C — rewrite `support/register.ts` as CJS

**What**: Rename `support/register.ts` → `support/register.cjs`. Rewrite each `import` as `require`. Rewrite each `import type` as JSDoc or type-only imports.

**LOC delta**: 60-80 lines per file (2 files) = 120-160 lines. Plus every `import type` in the 5 `.steps.ts` files would need to be inlined as type-only `.d.ts` or replaced with JSDoc.

**Risk**: High. Touches the file that PR-7 explicitly introduced (`feat(bdd): slice 7 PR-8 — transactions register.ts bridge GREEN (#51)` and `feat(auth): slice 8 PR-1 — auth BDD bridge GREEN (#52)`). Reverting to CJS erases the architectural decision the slice made.

**Blast radius**: High. 7 files touched (2 register.ts + 5 steps.ts + 2 world.ts).

**Revert-ability**: Difficult — many files involved.

### Shape D — replace tsx with another register (e.g. `@swc-node/register`)

**What**: Add `@swc-node/register` as a devDependency, replace `tsx` references in BDD scripts with `swc-node/register`.

**LOC delta**: 1 dep change + 2 `package.json` script lines. Plus `pnpm-lock.yaml` regeneration.

**Risk**: Medium. Introduces a new dependency that may have its own quirks. The `no-cross-module-import` boundary rule allows it (it's a dev dep, not cross-feature). The fix is more invasive than necessary.

**Blast radius**: 1 dep + 2 files.

**Revert-ability**: Moderate — needs dep removal + lockfile regeneration.

## §9. Verification contract

After the fix:
- `pnpm turbo run bdd` exits 0 on Node 22.13.0 (CI version).
- All 43 BDD scenarios continue to pass (18 auth + 25 transactions).
- `pnpm lint` exits 0.
- `pnpm lint:fixtures` exits 0.
- `pnpm typecheck` reports no new errors.
- No new dependencies in `pnpm-lock.yaml`.
- `git diff` against develop shows only the intended file changes (2 `package.json` lines for Shape A).

## §10. Diagnostic reproduction recipe

```bash
# Confirm Node 22 bug (use volta or nvm to pin to a Node 22.x)
export PATH=/Users/sebailla/.volta/tools/image/node/22.14.0/bin:$PATH
node --version  # should print v22.x.x

# Reinstall lockfile
pnpm install --frozen-lockfile

# Reproduce the bug
pnpm --filter @features/auth bdd

# Expected output:
#   SyntaxError: Unexpected identifier 'AuthWorld'
#       at compileSourceTextModule (node:internal/modules/esm/utils:338:16)
#       at ModuleLoader.importSyncForRequire (node:internal/modules/esm/loader:353:18)
#       at loadESMFromCJS (node:internal/modules/cjs/loader:1385:24)
#       at Module._compile (node:internal/modules/cjs/loader:1536:5)

# Confirm the fix works
NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd

# Expected output:
#   18 scenarios (18 passed)
#   101 steps (101 passed)
#   0m 0.34s
```

On Node 23.x the bug does NOT reproduce — local Node 23.8.0 (volta default) hides it. CI uses Node 22.13.0, which surfaces it.

## Recommendation

**Shape A** is the recommended fix:
- 2-line change (one per slice `package.json`).
- Zero source code touched.
- Zero ESLint impact.
- Zero new dependencies.
- Trivially revertable.
- Empirically verified to make all 18 auth scenarios pass on Node 22.14.0.

The original hypothesis (tsx 4.23.0 regression) is empirically falsified. The fix targets the actual root cause: cucumber's CJS `require()` bypasses tsx's ESM hook. tsx provides `tsx/cjs` for exactly this case; we just weren't using it.

## Next steps

1. **propose** — Create the SDD proposal with Shape A as the recommended fix, Shape B as the alternative, Shape C/D as rejected options.
2. The proposal should reference this explore.md and Engram #2306.
3. The proposal should include a 1-task apply (the 2-line `package.json` change + lockfile commit if any) with a verification gate of `pnpm turbo run bdd` on Node 22.x.
4. After apply, `pnpm turbo run bdd` must pass and the previously-failing CI run (29288016689) must turn green.
# Exploration: Fix CI environment propagation

## Executive summary

The reported failure is reproducible locally, but the initial hypothesis is only half correct. `next build` workers are not independently dropping GitHub Actions variables. Turborepo 2.10.3 runs in strict environment mode and removes every variable not declared in `turbo.json` before it starts `web#build`; the Next.js workers then correctly inherit that already-filtered environment. Direct `pnpm build` with the CI variables succeeds, while the same build through Turbo fails with all five required string variables missing. Running Turbo with `--env-mode=loose` succeeds, which isolates the failing boundary to Turbo.

`@core/config` amplifies the problem because `env.ts` eagerly executes `parseEnv(process.env)` at module load. During Next.js page-data/configuration collection, any page or auth route importing `@core/config` evaluates the full schema and fails immediately.

The minimum honest fix is to declare the required variables on Turbo's `build` task. `env` is preferred over `passThroughEnv` because these values affect build behavior and therefore must affect the cache key. Lazy validation is a broader architectural change and does not repair the undeclared Turbo environment/cache contract.

## §1. Turbo task graph

`turbo.json` is 42 lines and was read end-to-end.

### Global settings

- Schema: Turborepo 2.10.3.
- `globalEnv`: absent.
- `globalPassThroughEnv`: absent.
- `globalDependencies`: absent.
- Turbo reports `envMode: "strict"` in `--dry=json`.
- No task declares `inputs`; resolved inputs therefore use Turbo defaults.

### `bdd`

```json
"bdd": {
  "dependsOn": ["build"],
  "outputs": ["bdd-reports/**"]
}
```

- `dependsOn: ["build"]` means each package that owns a `bdd` script first runs its own `build` task. It does **not** mean all workspace packages build for each BDD package.
- `env`: absent; resolved to `[]`.
- `passThroughEnv`: absent/null.
- `inputs`: absent/default.
- `outputs`: `bdd-reports/**`.

Only `@features/auth` and `@features/transactions` own BDD scripts. Neither owns a build script, so their package-local `build` tasks are synthetic/no-command graph nodes. Their `build` nodes use the global `build.dependsOn: ["^build"]` and traverse their workspace dependencies.

### `build`

```json
"build": {
  "dependsOn": ["^build"],
  "outputs": ["dist/**", ".next/**", "!.next/cache/**", "!.next/dev/**"]
}
```

- `dependsOn: ["^build"]`: build workspace dependencies first.
- `env`: absent; resolved to `[]`.
- `passThroughEnv`: absent/null.
- `inputs`: absent/default.
- `outputs`: `dist/**`, `.next/**`, excluding `.next/cache/**` and `.next/dev/**`.
- Neither `API_URL` nor `WEB_ORIGIN` is declared. In fact, none of the seven CI variables is declared.

### Why `web#build` appeared in the unfiltered CI run

A full `pnpm turbo run bdd` scopes all 12 workspace packages. Turbo schedules the two real BDD scripts and also schedules `build` for packages in scope that have a build script, including `web#build` and `api#build`. This is confirmed by the local full run: exactly four executable tasks ran (`web#build`, `api#build`, auth BDD, transactions BDD).

A filtered `pnpm turbo run bdd --filter=@features/auth` does **not** include `web#build`; its dry graph contains auth plus `@core/config`, `@core/database`, and `@core/events` build nodes. Thus `web#build` is a consequence of the broad workspace command, not a dependency of the auth BDD package.

## §2. `@core/config` schema and web import path

Files:

- `libs/core/config/env.schema.ts`
- `libs/core/config/env.ts`
- `libs/core/config/index.ts`

Required fields:

- `DATABASE_URL`: URL string.
- `NEXTAUTH_URL`: URL string.
- `NEXTAUTH_SECRET`: string, minimum 32 characters.
- `API_URL`: URL string.
- `WEB_ORIGIN`: URL string.
- `NODE_ENV`: `development | test | production`.

Optional/defaulted fields:

- `GOOGLE_CLIENT_ID`: optional non-empty string.
- `GOOGLE_CLIENT_SECRET`: optional non-empty string.
- `PORT`: positive integer, coerced; optional with default `3001`.

Validation is eager and fail-fast:

```ts
export const env = parseEnv(process.env);
```

The public barrel re-exports `env`, so any runtime import of `@core/config` evaluates the entire schema at module load.

`apps/web` imports it directly from:

- `apps/web/auth.ts` (`env.NEXTAUTH_SECRET`), reached by `/api/auth/[...nextauth]`.
- `apps/web/app/[locale]/page.tsx` (`env.NODE_ENV`).
- Sign-in, sign-up, forgot-password, reset-password pages (`env.API_URL`).
- Dev mailbox page (`env.NODE_ENV`).

Therefore page-data/configuration collection loads the barrel and validates unrelated fields too. This explains why a route needing only `NODE_ENV` can fail on `API_URL` and `WEB_ORIGIN`.

## §3. CI workflow environment

`.github/workflows/ci.yml` is 240 lines and was read end-to-end.

The BDD job is ordered as YAML job keys:

1. runner/needs/timeout,
2. `services.postgres`,
3. job-level `env`,
4. `steps`.

The BDD job-level environment contains all requested values:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `WEB_ORIGIN`
- `API_URL`
- `PORT`
- `NODE_ENV`

The Build job has **no job-level application env block**. Only its Prisma generation step gets a placeholder `DATABASE_URL`. Its actual build is `continue-on-error: true`, so it does not prove a working env path and cannot be used as a green comparison. A failed build step still leaves the job green.

## §4. Local reproduction and boundary isolation

### Test 1: direct web build without env

Command equivalent to unsetting all seven variables and running `pnpm build` in `apps/web`.

Result: **failed**, as expected, during page-data collection. The local Zod error listed all five required strings: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, and `WEB_ORIGIN`.

### Test 2: direct web build with exact CI env

Result: **passed**. Next.js loaded `.env.test`, collected page data with 11 workers, generated all pages, and completed successfully.

This disproves the claim that Next.js workers inherently fail to inherit the GitHub Actions environment.

### Test 3: filtered auth BDD with exact CI env

`pnpm turbo run bdd --filter=@features/auth --force` passed 18/18 scenarios and did not run `web#build`. This command is not a faithful reproducer of the CI graph.

### Test 4: full BDD command with exact CI env

`pnpm turbo run bdd --force` reproduced the CI failure exactly:

- auth: 18/18 passed;
- transactions: 25/25 passed;
- total baseline: 43/43 passed;
- `web#build`: failed in page-data collection;
- Zod saw all five required string variables as undefined;
- Turbo summary: 3 successful, 4 total; failed `web#build`.

### Test 5: Turbo loose-mode control

`pnpm turbo run build --filter=web --force --env-mode=loose` with the exact CI env passed.

### Confirmed root cause

Turbo strict mode filters the seven job-level variables because `turbo.json` declares none under `build.env`, `build.passThroughEnv`, `globalEnv`, or `globalPassThroughEnv`. Next.js is downstream of the loss, not its source. Eager module-load validation makes the missing-variable contract fail during build collection.

## §5. Fix-shape candidates

| Shape | Estimated delta | Risk / blast radius | Revertability | Assessment |
|---|---:|---|---|---|
| A. Lazy-validate `@core/config` | 30–50 LOC plus tests | Medium/high: changes fail-fast semantics for API, web, Prisma config, auth services, and tests; property-proxy or getter design may introduce timing/cache surprises | Moderate | Not recommended for this gate. It masks undeclared Turbo inputs and weakens startup guarantees. Could be a separate architecture change. |
| B. Add placeholder `.env` values | ~5–10 LOC, plus Spanish mirror only if documented under OpenSpec/docs | High correctness/security risk: build may embed placeholders; duplicates CI/runtime configuration; `.env.test` already exists locally and did not help the Turbo task because strict mode filtered the shell and Next's production build behavior is environment-sensitive | Easy | Not recommended. Masks the task contract. |
| C. `continue-on-error: true` for BDD | 1 line | Very high governance risk: BDD remains red while the required gate appears green; breaks the stated four-green-job contract | Trivial | Reject. Pragmatic but dishonest. |
| D. Declare Turbo task env | 7–9 lines | Low. Makes build inputs explicit and cache-correct. Affects every `build` invocation but matches existing schema requirements | Trivial | **Recommended**, with `build.env` containing all seven validated variables. Use `env`, not `passThroughEnv`, because build outputs may depend on values and must be invalidated when values change. `bdd.env` is only necessary for BDD runtime variables; currently auth directly consumes `NEXTAUTH_SECRET`, so declaring the relevant runtime set there is defensible, but it does not fix `web#build`. |

The prompt proposed only `API_URL` and `WEB_ORIGIN` for Shape D. Local evidence shows that is insufficient: Turbo removed `DATABASE_URL`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET` too. The minimum complete build declaration must cover every required field evaluated by eager `@core/config`: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`, `PORT`, and `NODE_ENV`.

## §6. Blast radius and scenario contract

The command reports 12 packages in workspace scope:

1. `@core/config`
2. `@core/database`
3. `@core/events`
4. `@features/auth`
5. `@features/transactions`
6. `@gpr/eslint-plugin-boundary`
7. `@shared-utils/currency`
8. `@shared-utils/date-formatting`
9. `@shared-utils/decimal`
10. `@shared-utils/root`
11. `api`
12. `web`

Important correction: these are packages **in scope**, not 12 packages transitively depending on `web#build`. Only two packages own BDD scripts. The full unfiltered command independently schedules `web#build` and `api#build`; the BDD feature packages do not depend on web.

Environment validation/imports:

- `@core/config`: owns eager Zod validation.
- `@core/database`: Prisma config imports validated env.
- `@features/auth`: imports `env` in `auth-service.ts`.
- `api`: imports `env` from main/auth configuration/guard paths.
- `web`: imports `env` from auth and multiple RSC pages.
- Transactions declares `@core/config` as a package dependency, but no direct source import was found in the searched runtime source.
- Core events, shared utilities, and boundary plugin do not own environment validation.

Any fix must preserve:

- 43 total scenarios;
- auth 18/18;
- transactions 25/25;
- 239 total steps observed locally (101 + 138).

## §7. Project constraints

- AGENTS.md §7 boundary rules remain mandatory: Prisma only through core database, schemas only in approved shared/config locations, no client→server imports, and no direct cross-feature imports.
- Strict TDD applies to production-code changes. A Turbo-only config fix is exempt from test-first production-code rules but still requires a red reproducer and green verification.
- The minimum diff should change task configuration only; avoid refactoring `@core/config` in the same change.
- Any Markdown created or modified under `openspec/` must be mirrored under `Documents-es/` in the same commit, with no CJK characters. This executor's phase contract permits only the requested exploration artifact; the orchestrator must ensure the Spanish mirror before commit.

## §8. Verification contract

After the fix:

1. Run the exact red reproducer with the CI env and `--force`; `pnpm turbo run bdd` must exit 0.
2. Confirm auth 18/18 and transactions 25/25, totaling 43/43.
3. Confirm `web#build` and `api#build` both pass in the same graph.
4. Run CI and require all four jobs green: Static, Build, Unit, BDD.
5. Remove or revisit the Build job's `continue-on-error` if “all four green” is intended to mean the build step itself is gating; currently the job can be green despite a failed build step.

## Recommendation

Proceed to proposal with a narrow Turbo configuration fix: declare the complete validated environment set under `build.env`, and declare only genuinely runtime-consumed variables under `bdd.env` if needed. Do not use `passThroughEnv` for variables that affect build output because it omits them from cache hashing. Preserve eager validation for now; it exposed a real task contract violation.

## Risks

- Remote cache entries created before env hashing may have hidden environment assumptions; force the first verification run.
- Adding only the two variables named in the CI error will produce another layered failure for the remaining three required strings.
- The existing Build job is informational, so a green job does not establish a passing build until `continue-on-error` is removed or step outcome is asserted.

## Ready for proposal

Yes. The root cause is isolated with a red/green boundary test, the initial Next-worker hypothesis is disproven, and the minimum honest fix shape is identified.

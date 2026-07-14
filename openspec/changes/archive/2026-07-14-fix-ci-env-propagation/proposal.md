# Proposal — `fix-ci-env-propagation`

> **Status**: draft · proposal phase · **Date**: 2026-07-14
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` → tracker `feat/fix-ci-env-propagation`
> **Artifact store**: hybrid · **Mode**: auto
> **Fix shape**: **A** — `turbo.json` env declaration. Two `env` arrays (~14 LOC, 7 vars × 2 tasks).
> **Single PR**: 1 file in scope, 14 net LOC (well under the 400-line review budget) · `auto-chain` NOT triggered.

---

## 1. Intent

The BDD CI gate on `develop` is broken in a different way than the predecessor fixes addressed. `pnpm turbo run bdd` in the BDD job (`.github/workflows/ci.yml:239`) fails on `web#build` with Zod errors naming `API_URL` and `WEB_ORIGIN` as undefined. The actual root cause, verified empirically by the explore sub-agent and confirmed in five local replications, is **Turborepo 2.10.3 in default STRICT mode strips every env var that is not declared in `turbo.json` before launching child tasks**. The BDD job-level `env:` block declares 7 vars (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`, `PORT`, `NODE_ENV` — all confirmed in `ci.yml:214-221`), but `turbo.json`'s `build` task (line 5-8) and `bdd` task (line 25-28) declare NO `env` / `passThroughEnv` / `globalEnv` / `globalPassThroughEnv`. So Turbo strips all 7 from `web#build`'s process environment, then `@core/config`'s eager `parseEnv(process.env)` at module load (`libs/core/config/env.ts:89`) throws on all 5 required string fields. Next.js workers are NOT the source — direct `next build` with the same CI env vars succeeds (Next.js workers DO inherit env when it reaches them). `turbo --env-mode=loose` succeeds too. The fix is to declare the 7 vars in `turbo.json`'s `build.env` and `bdd.env` so the chain propagates them to `web#build`. 4 PRs have been admin-merged since PR #61 with BDD gates bypassed; fixing this unblocks the BDD gate permanently for the next green cycle.

---

## 2. Scope

### 2.1 In Scope

1. **`turbo.json`** — add `env` arrays to the `build` task (line 5-8) and the `bdd` task (line 25-28), each listing the 7 env vars declared in the BDD job (`ci.yml:214-221`). 2 arrays × 7 vars = 14 net LOC.
2. **Engram observation** at `topic_key sdd/fix-ci-env-propagation/proposal`, `type=architecture`, `project=gp-v2`, `scope=project`, `capture_prompt=false` persists the proposal in the hybrid artifact store (matches the OpenSpec file under §11).

### 2.2 Out of Scope

- **No changes to `@core/config`** (`libs/core/config/env.ts`, `env.schema.ts`, `index.ts`). Lazy validation (Shape B from explore brief §5) is a separate architectural concern; the eager fail-fast contract is sound and has already surfaced this real bug. Defer to a follow-up if desired.
- **No changes to `.github/workflows/ci.yml`** — the BDD job's env block is correct; the contract violation is in the Turbo task definition.
- **No changes to `apps/web/auth.ts`** or any RSC page (`apps/web/app/[locale]/**/*.tsx`).
- **No changes to `apps/api/**`**.
- **No changes to any source `.ts` file** (the fix is purely Turbo config).
- **No `.env*` file changes** (`apps/web/.env.test`, `apps/web/.env.example`, etc.). The env vars come from the BDD job's env block in CI; locally `apps/web/.env.test` already provides them.
- **No new dependency**, no version bumps, no lockfile regeneration.
- **No new ESLint rule**, no boundary-plugin fixture changes, no `pnpm lint:fixtures` impact.
- **No new BDD / unit / e2e tests**.
- **No ADR** (`docs/architecture/decisions/00XX-*.md`). Q1 in §10 asks the user; recommendation is **NO** (a 2-array config edit does not warrant an ADR; the JSDoc-style comment proposed in §3 is a better fit for this scale).
- **No `Documents-es/` mirror** — no English `.md` is added under `openspec/` or `docs/` by this change (per AGENTS.md §13; same precedent as `fix-bdd-tsx-node22` and `fix-bdd-ci-zod-resolution`).
- **No `globalEnv` / `globalPassThroughEnv`** at the top of `turbo.json` — Q2 in §10 asks the user; recommendation is **per-task** (`env` only in build + bdd) to avoid bloating `lint` / `test` / `typecheck` task hashes with env vars they don't actually consume.
- The 3 other follow-ups (apps/web vitest crash, orphan `libs/features/*/shared/` directories, `next-env.d.ts` dirty file) are **separate changes** and out of scope here.

---

## 3. Approach

Two `env` arrays added to `turbo.json`. 14 LOC, 1 file, no code, no tests, no infra.

### 3.1 Step 1 — Declare env vars in `build.env` and `bdd.env`

```diffc
   "tasks": {
     "build": {
       "dependsOn": ["^build"],
-      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "!.next/dev/**"]
+      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "!.next/dev/**"],
+      "env": [
+        "DATABASE_URL",
+        "NEXTAUTH_URL",
+        "NEXTAUTH_SECRET",
+        "API_URL",
+        "WEB_ORIGIN",
+        "PORT",
+        "NODE_ENV"
+      ]
     },
     "dev": {
       ...
     "bdd": {
       "dependsOn": ["build"],
-      "outputs": ["bdd-reports/**"]
+      "outputs": ["bdd-reports/**"],
+      "env": [
+        "DATABASE_URL",
+        "NEXTAUTH_URL",
+        "NEXTAUTH_SECRET",
+        "API_URL",
+        "WEB_ORIGIN",
+        "PORT",
+        "NODE_ENV"
+      ]
     },
```

### 3.2 Step 2 — Verify with the existing CI command locally

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gastos_reference_test \
NEXTAUTH_SECRET=ci-only-do-not-use-in-prod-32-chars-min \
NEXTAUTH_URL=http://localhost:3000 \
WEB_ORIGIN=http://localhost:3000 \
API_URL=http://localhost:3001 \
PORT=3001 \
NODE_ENV=test \
pnpm turbo run bdd --force
```

Expected: exit 0; auth 18/18 + transactions 25/25 = 43/43 scenarios; `web#build` and `api#build` both green in the same graph (per explore brief §4 Test 4 + Test 5).

### 3.3 Why `env` and not `passThroughEnv`

`env` is the **cache-correct** shape: values are included in the task's cache hash, so the build + bdd caches invalidate when any of the 7 vars changes (e.g., switching `API_URL` from staging to prod). `passThroughEnv` exposes values to child processes without hashing them, which would lead to silent cache misses/stales (Turbo would happily return a cached `.next/` build that was produced with different credentials). Since `@core/config`'s validation runs at module load and the build outputs embed the validated `API_URL` into page-data bundles (per Next.js behaviour), env changes MUST invalidate the cache.

### 3.4 Why declare BOTH `build` and `bdd` (not just one)

The failure surfaces in `web#build`, but `pnpm turbo run bdd` triggers `web#build` transitively via `dependsOn: ["build"]` (`turbo.json:26`). Turbo forwards declared env vars through the chain; undeclared tasks at any point in the chain (build OR bdd) would block propagation. Declaring `env` in BOTH ensures the vars survive the full chain. The `lint` / `test` / `typecheck` / `dev` / `e2e` tasks are NOT touched here — they don't need this env contract for CI gates; future-proofing their env arrays is scope creep.

### 3.5 Why list all 7 vars (not just the 2 named in the error)

The CI error surfaces `API_URL` and `WEB_ORIGIN` because `@core/config`'s Zod schema validates them eagerly at module load, and `apps/web/app/[locale]/**/page.tsx` is the first imported page during build collection. But the explore sub-agent verified empirically (Test 4 in explore brief §4) that ALL 5 required string fields are stripped by Turbo: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`. `PORT` and `NODE_ENV` are simpler types but also stripped. Declaring only `API_URL` and `WEB_ORIGIN` would produce the same Zod failure on `NEXTAUTH_URL` next run. Declaring all 7 is the minimum safe set.

### 3.6 Why this fix shape, not the alternatives

| Shape | Verdict | Reason |
|------|---------|--------|
| **A. `turbo.json` env arrays** (this proposal) | **Recommended** | Lowest-LOC, cache-correct, addresses the root cause directly. |
| B. Lazy validation in `@core/config` | Rejected | ~30-50 LOC + tests; changes fail-fast semantics; masks task contract violations instead of fixing them. Separate architectural change. |
| C. `continue-on-error: true` for the BDD step's `web#build` | Rejected | 1 line but dishonest; BDD would remain red while the gate appears green. |
| D. `passThroughEnv` instead of `env` | Rejected | Cache-incorrect; build outputs embed env-derived values but cache hashes would not include them. Stale-build risk. |

---

## 4. Capabilities

> Contract between this proposal and `sdd-spec`. Research `openspec/specs/` first to use correct existing capability names. Note: `openspec/specs/` does NOT exist on this branch yet (slices have shipped spec-proposals only, not standalone specs — same observation as in `fix-bdd-tsx-node22` and `fix-bdd-ci-zod-resolution`).

### 4.1 New Capabilities

**None.** This is a build-config fix that restores pre-existing expected Turbo env propagation. No new contract surfaces.

### 4.2 Modified Capabilities

**None.** No spec-level behaviour changes. The 43 BDD scenarios (18 auth + 25 transactions), step definitions, world types, Gherkin `.feature` files, Cucumber configs, support files, `@core/config` schema, apps/web source, apps/api source, and `libs/features/**` packages all stay byte-for-byte identical. The fix only changes which 7 env vars Turbo propagates from its parent shell to `build` / `bdd` task processes — a build-system mechanic with no observable product behaviour change.

> Note for `sdd-spec`: if the spec phase decides a capability is warranted (e.g. `ci-env-propagation` documenting "the BDD gate must pass with the BDD job's declared env vars reaching @core/config at build time"), it can introduce one. The proposal stays neutral because the existing `openspec/specs/` directory is empty and the proposal should not invent a capability name preemptively.

---

## 5. Affected Areas

| File | Change | LOC delta |
|------|--------|----------:|
| `turbo.json` | Edit (add `env` array of 7 vars to `build` task + `env` array of 7 vars to `bdd` task) | +14 / 0 |

**Total estimated**: +14 / 0 = **14 net LOC** of source edits. Well under the 400-line review budget → **single PR is appropriate**, `auto-chain` is NOT triggered.

**Files NOT touched (verified against explore brief §1, §3, §6, §7):**
- `.github/workflows/ci.yml` — BDD job env block stays as-is (`ci.yml:214-221`).
- `@core/config/**` (3 files: `env.schema.ts`, `env.ts`, `index.ts`).
- All 9 Gherkin `.feature` files (6 auth + 6 transactions — total 12 features as per slice-7 inventory).
- All 5 `.steps.ts` files (3 in auth, 2 in transactions).
- Both `world.ts` files.
- Both `support/register.ts` files.
- Both `cucumber.mjs` files.
- `apps/web/auth.ts` and all `apps/web/app/[locale]/**/*.tsx` pages.
- `apps/api/**` (controllers, services, Prisma schema, nest-cli.json).
- All `libs/**/package.json` files (no dep changes).
- `pnpm-lock.yaml` (no install needed).
- `pnpm-workspace.yaml` (no hoist change).
- `tools/eslint-plugin-boundary/**` (no rule, fixture, config, or runner edits).
- Any `.env*` files (`apps/web/.env.test`, `apps/web/.env.example`).
- `Documents-es/**` (no English `.md` added under `openspec/` or `docs/`).
- `docs/architecture/decisions/**` (no ADR — see Q1 in §10).

---

## 6. Success Criteria

`sdd-verify` will run these 6 gates.

**Functional (G1–G3)**: G1 — `pnpm turbo run bdd` exits 0 in CI with the BDD (Cucumber) job reporting `pass` for the first time since PR #61 merged. G2 — All 4 CI jobs green: Static, Build, Unit, BDD (the slice-7 "all 4 green" contract that the predecessor fixes tried to land). G3 — All 43 BDD scenarios continue to pass locally and in CI (18 auth + 25 transactions; 239 total steps observed locally: 101 auth + 138 transactions).

**Regression safety (G4)**: G4 — Direct `next build` (i.e., bypassing Turbo) with the CI env vars and `pnpm turbo run bdd` with the same env vars produce identical results — no behavioural change for local dev (per explore brief §4 Test 2 + Test 4).

**Cache hygiene (G5)**: G5 — Cache invalidation works as designed: changing any of the 7 declared env vars (e.g., `API_URL=http://staging` → `API_URL=http://prod`) invalidates the `build` and `bdd` task caches for affected packages. Verified by a local 2-iteration test: `pnpm turbo run bdd --force` with env A → success → rerun with env B (without `--force`) → cache MISS expected → success.

**Hygiene (G6)**: G6 — `git diff` against `develop` shows exactly the 1-file source edit to `turbo.json` in §5; no incidental edits to source code, lockfile, ESLint config, CI workflow, .env files, or BDD harness. Quality gates from AGENTS.md §3 still pass: `pnpm install --frozen-lockfile` exits 0, `pnpm turbo run build lint typecheck test` exits 0 across all workspaces, `pnpm lint:fixtures` exits 0 (no new boundary violations), `pnpm turbo run bdd e2e` exits 0.

---

## 7. Risks

| ID | Risk | Likelihood | Mitigation |
|----|------|------------|------------|
| R1 | Declaring all 7 env vars in `turbo.json` inflates the cache-key space and may invalidate caches more often than desired across matrix envs. | Low | This is the **intended behaviour**: env vars that flow through eager module-load validation SHOULD invalidate the cache. Any other env (e.g., `TURBO_TOKEN`, `PATH`) is hashed separately by Turbo itself and not affected by the `env` array. |
| R2 | Missing a required env var in the `env` array would surface as a different Zod failure mode than the original bug. | Low | Explore sub-agent enumerated all 5 required string fields + the 2 simpler types empirically (Test 4 + Test 5). The fix declares all 7 — the minimum complete contract. Adding `STRIPE_*` or other future vars is straightforward append. |
| R3 | Future env var additions require updating `turbo.json` (no automatic detection). | Low | Document this in the PR body and in `turbo.json` with a one-line `// see docs/runbooks/ci-env.md` style breadcrumb (Q3 in §10). Adding a CI lint check (`scripts/check-turbo-env.ts`) that diffs declared envs against `ci.yml` is out of scope; defer to a follow-up slice if it becomes a pattern. |
| R4 | A future contributor might pick `passThroughEnv` instead of `env` and silently break cache correctness. | Low | The §3.3 explanation documents the distinction explicitly. The PR body will include the same paragraph. A lint rule for "no `passThroughEnv` without explanatory comment" is future scope creep. |
| R5 | Remote cache entries created before this fix (with `--force` runs) may have hidden environment assumptions that don't match this fix's contract. | Low | The next CI run after merge is effectively a fresh populate — the only pre-existing remote cache for `web#build` is from the slice-7 lineage (all admin-merged with the gate bypassed, so no green remote caches exist for `web#build`). `--force` is not needed on first CI run. |
| R6 | The existing Build job's `continue-on-error: true` (`ci.yml:175-177`) means "Build job green" doesn't prove the build actually runs. | Med (pre-existing) | Out of scope: predecessor proposal `fix-bdd-ci-zod-resolution` §10 Q5 already deferred this. The BDD gate (G1) is the authoritative signal. A future slice can revisit the Build job's `continue-on-error`. |
| R7 | Turbo 2.x's `env` semantics changed across minors (e.g., 2.10 vs 2.11 might process `env` differently). | Very low | Turbo's `env` field has been stable since 2.0; `^2.10.3` (root `package.json`) pins to the same minor. A future Turbo major bump would require re-verification, but this is the standard contract for any Turbo config. |

---

## 8. Rollback Plan

**Whole-change**: `git revert <merge-sha>` on `develop` undoes the single PR cleanly. The 2 `env` arrays are removed from `turbo.json`; the BDD gate returns to the same Zod failure it shows today (5 required string vars stripped). Acceptable because the BDD gate was already broken on `develop` (the pre-fix state) — reverting only restores the known-bad baseline.

**Per-task rollback** (independent revert of either `env` array):
- Revert `build.env` only: `web#build` fails on the same 5 Zod errors; BDD gate fails. The `bdd.env` array alone is insufficient because `web#build` runs at the `build` layer. **NOT acceptable as a half-fix.**
- Revert `bdd.env` only: `web#build` passes (its own `env` is declared); `pnpm turbo run bdd` propagates the vars via the chain and the BDD steps run. Acceptable as a half-fix; the Build job continues to validate `web#build` standalone.

**Will NOT do**: force-push, rewrite history, touch `main`, modify `openspec/changes/{fix-bdd-tsx-node22,fix-bdd-ci-zod-resolution,fix-api-nestjs-di,slice-8-closing-bdd-and-docs}/`, amend any prior commit, bump Turbo version, swap to Shape B/C/D inline, add a `package.json` to `libs/features/*/shared/`, switch to `passThroughEnv`, add `globalEnv`/`globalPassThroughEnv`.

---

## 9. Dependencies

- **`turbo@^2.10.3`** (root `package.json`). Already installed. The `env` task field is stable since Turbo 2.0 and is documented at <https://v2-10-3.turborepo.dev/schema.json#properties/tasks/properties/env>. **No upgrade required.**
- **`@core/config@*`** — schema unchanged; the fix is purely about getting the env vars to it. Already installed.
- **Postgres 16-alpine** (CI service, `ci.yml:200-213` for BDD) — already provisioned. **No service change.**
- **Node 22.13.0** (CI) / Node 22.14.0 (local empirical) — both expose the same Turbo env-mode semantics. **No engine bump.**
- **pnpm 11.10.0** (CI) / pnpm 11.x (local) — Turbo bin lookup unchanged. **No installer change.**
- **OpenSpec change directory** `openspec/changes/fix-ci-env-propagation/` already exists with `explore.md` (Engram #2340). This proposal lands alongside.
- **Predecessor proposals** that have admin-merged with BDD gate bypassed: `fix-bdd-tsx-node22` (tsx/cjs hook) — gate bypassed because of THIS latent bug; the fix closes that gap. `fix-bdd-ci-zod-resolution` (zod resolution) — gate bypassed for the same reason.

---

## 10. Open Questions for `sdd-spec`

1. **Per-task `env` vs `globalEnv`** — per the explore recommendation, this proposal declares `env` on `build` and `bdd` only. Alternative: declare all 7 vars at the top level via `globalEnv` or `globalPassThroughEnv`. **Recommendation: per-task.** Global would propagate to `lint`, `test`, `typecheck`, `e2e`, `dev` as well, inflating their cache hashes with env vars they don't actually consume. Per-task scopes the contract to the gates that need it. **Q2 in the parent's prompt.**
2. **CI lint step for env completeness** — should a follow-up lint step assert that all vars declared in `ci.yml#bdd.env` are also declared in `turbo.json#bdd.env`? **Recommendation: NO** (out of scope; deferred to a future slice if the pattern recurs). The PR description documents the contract; reviewer awareness is sufficient for now.
3. **Comment breadcrumb in `turbo.json`** — should we add a 2-line JSON-comment-style breadcrumb above each `env` array explaining the contract (e.g., "// env vars required by @core/config — must match ci.yml#bdd.env")? **Recommendation: YES.** JSON does not support comments natively; the convention in this repo per `fix-bdd-ci-zod-resolution` is a JSDoc-style block above the array. 2 lines, zero runtime impact, high reviewer-debug value. **Q3 in the parent's prompt.**
4. **`openspec/specs/` capability creation** — per §4.2, the proposal claims no spec-level behaviour change. If `sdd-spec` disagrees and wants to formalise the Turbo env-propagation contract (e.g. `ci-env-propagation` capability: "Turbo must propagate declared env vars through the `build`/`bdd` task chain so `@core/config` validation passes without HOME pollution"), that capability would land as `openspec/specs/ci-env-propagation/spec.md`. **Recommendation: defer to `sdd-spec`'s judgement.** This proposal does not preemptively name a capability.
5. **Predecessor ADR for the Turbo env-vs-passThroughEnv distinction** — should we add a small ADR (`docs/architecture/decisions/00XX-turbo-env-vs-passthrough.md`) explaining the `env` choice so future contributors don't mistake it for `passThroughEnv`? **Recommendation: NO.** The 2-line configuration fix does not warrant an ADR; the §3.3 explanation in this proposal plus the PR body is sufficient. An ADR for this is bureaucratic. **Q1 in the parent's prompt.**

---

## 11. Cross-references

- Explore brief: `openspec/changes/fix-ci-env-propagation/explore.md` (Engram observation #2340). Contains the verified root cause (Turbo strict mode strips undeclared env vars), the local reproducer recipe (Test 1-5), the four-shape fix candidates, and the verbatim Zod error output.
- `turbo.json:5-8` — current `build` task definition with no `env` / `passThroughEnv`. The 7-line gap the fix closes.
- `turbo.json:25-28` — current `bdd` task definition with the same gap.
- `.github/workflows/ci.yml:214-221` — BDD job-level `env` block with the 7 vars (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `WEB_ORIGIN`, `API_URL`, `PORT`, `NODE_ENV`). The contract that `turbo.json` must propagate.
- `libs/core/config/env.ts:89` — `export const env = parseEnv(process.env)` (eager module-load validation that surfaces the bug).
- `libs/core/config/env.schema.ts` — Zod schema with the 5 required string fields (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`) + `NODE_ENV` enum + `PORT` positive integer.
- `apps/web/auth.ts` — first `/api/auth/[...nextauth]` consumer of `env.NEXTAUTH_SECRET` reached during page-data collection.
- `apps/web/app/[locale]/**/*.tsx` — pages that import `@core/config` and trigger the eager validation during build.
- BDD gate history: PR #61 merged the env-rich BDD job config; 4 subsequent PRs (slice-7 PR-7, slice-7 PR-8, slice-8 PR-1, slice-8 closeout) were admin-merged with BDD gate bypassed because of this latent bug. Fixing this proposal closes the underlying gate permanently.
- Predecessor proposal 1: `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/proposal.md` — mirrored this 12-section structure (proven format precedent for fix-shape proposals).
- Predecessor proposal 2: `openspec/changes/fix-bdd-ci-zod-resolution/proposal.md` — mirrored this 12-section structure (same fix-shape-A precedent, ~3× larger; same author, same hybrid artifact store).
- Project conventions: AGENTS.md §2 (branch model — develop → `feat/fix-ci-env-propagation` tracker), §3 (quality gates — all six must pass, particularly `pnpm turbo run bdd` exit 0), §4 (strict TDD — config-only fix, no RED test needed because there is no production code to test; the explore brief's Tests 1-5 ARE the empirical RED/GREEN boundary), §5 (atomic commits — single work-unit commit touching 1 source file), §6 (Conventional Commits — `fix(ci): declare turbo env for build + bdd tasks so @core/config validation receives the BDD job's env vars`), §7 (architectural boundaries — none affected; `tools/eslint-plugin-boundary/**` unchanged), §11 (out-of-scope list — none of its items touched), §12 (pre-commit checklist — single-purpose commit, rollback-trivial, ESLint untouched, no Spanish mirror required because no English `.md` is added under `openspec/` or `docs/` beyond the proposal itself), §13 (Spanish mirror — none required).

---

## 12. Next Phase

`next_recommended`: **`spec`**.

`sdd-spec` should:
- Confirm the "no capability change" stance from §4 (this is a build-config fix; no behavioural contract changes). If the spec phase disagrees, create `openspec/specs/ci-env-propagation/spec.md` per Q4 in §10.
- Resolve Q1 (per-task env vs globalEnv?), Q2 (CI lint step?), Q3 (JSON-comment breadcrumb?), Q5 (predecessor ADR?) with the user.
- Produce a delta spec in `openspec/changes/fix-ci-env-propagation/spec.md` capturing the G1–G6 success criteria as observable scenarios (the spec is essentially "Turbo propagates the BDD job's 7 env vars through `web#build` and `bdd`; all 43 BDD scenarios pass; no Zod validation failure on the 5 required string fields").

`status`: **`success`** · `skill_resolution`: **`paths-injected`** · `risks`: R1–R7 (see §7) · `goals_count`: 6 · `open_questions_count`: 5 (Q1–Q3 + Q5 from §10, Q4 from §4.2).

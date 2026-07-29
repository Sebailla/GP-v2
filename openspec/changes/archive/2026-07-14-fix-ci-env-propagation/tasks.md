# Tasks — `fix-ci-env-propagation` — `gastos-personales-reference`

**Project**: `gastos-personales-reference`
**Branch**: `develop` (working) · `main` (immutable)
**Tracker branch**: `feat/fix-ci-env-propagation` (off develop)
**Artifact store**: hybrid (openspec files + Engram)
**Mode**: auto (gatekeeper validates between phases)
**Date**: 2026-07-14
**Author**: SDD orchestrator → `sdd-tasks` (executor)
**Status**: Planning complete; user will pause before sdd-apply
**PR count**: 1 (14 net LOC of source + 2-line JSDoc breadcrumb; well under 400-line review budget)

> **Surgical config-only fix.** Single file (`turbo.json`) + verification marker. Two `env` arrays (7 vars × 2 tasks = 14 env declarations) + 2-line JSDoc-style breadcrumb above `bdd.env` per spec R3. Empirical RED→GREEN evidence is recorded in `openspec/changes/fix-ci-env-propagation/explore.md` §4 Tests 1–5 (RED: `pnpm turbo run bdd --force` with CI env → `web#build` fails on `ZodError: Required: API_URL, WEB_ORIGIN` at `libs/core/config/env.ts:89` during Next.js page-data collection; GREEN: same command after R1 + R2 applied → 43/43 scenarios pass). Strict TDD's RED step is satisfied vacuously: no production code is touched, so the BDD runner itself is the regression gate (the post-merge run MUST report `success` for the first time since PR #61). 4 PRs (slice-7 PR-7, slice-7 PR-8, slice-8 PR-1, slice-8 closeout) were admin-merged with the BDD gate bypassed because of this latent bug; this fix closes the underlying gate permanently.

---

## Conventions used in this file

- **Work-unit commits**: every commit MUST be independently revertible. Config-only fix; no test files added.
- **No "Co-Authored-By"** trailers (AGENTS.md §6 + persona hard rule).
- **Conventional Commits**: `type(scope): subject` — imperative, ≤72 chars, no trailing period.
- **RED before GREEN**: vacuously satisfied — the failure mode is empirically documented in `explore.md` §4 Tests 1–5; no new failing-test code is required.
- **No Spanish mirror required**: no English `.md` files are added under `openspec/` or `docs/` by this PR (AGENTS.md §13; design §7). The proposal, spec, and design artifacts pre-date this tasks phase and are NOT mirrored, mirroring the `fix-bdd-tsx-node22` and `fix-bdd-ci-zod-resolution` precedents.
- **MUST / SHALL / MUST NOT** are RFC 2119; anything weaker (should, may) is non-binding.
- The 2 tasks below map **1:1** to the design's `§4` 2 atomic commits. **No 3rd commit. No spec/design amend. No lockfile regen** (Turbo config is not in the lockfile; `pnpm install --frozen-lockfile` stays byte-identical per R9 + AC14 + AC32).

---

## §1. Dependency graph

```
T1 (turbo.json — build.env + bdd.env + 2-line JSDoc)   independent
T2 (chore verify marker — full turbo pipeline green)  depends on T1 (records the post-fix green state)
```

**Execution order invariant**: `T1` → `T2`. The orchestrator sequences as `T1 → T2` because:

- T1 lands first to make the env arrays + JSDoc breadcrumb visible in the diff that the reviewer sees.
- T2 is the verification marker that records the binary accept criteria (`pnpm turbo run bdd` exit 0 with 43/43 scenarios + cache-invalidation R10 verification) in the git log for posterity. T2 is a verification gate, not a tracked file change.

---

## §2. Per-task tables (2 tasks)

### T1 — declare 7 env vars in `turbo.json` `build.env` and `bdd.env` + 2-line JSDoc breadcrumb above `bdd.env`

| Field | Value |
|-------|-------|
| Commit | `fix(ci): turbo.json — declare env for build + bdd tasks (R1, R2, R3)` |
| Files | `turbo.json` (EDIT, +16 lines inside 2 task blocks: 8-line `build.env` array + 2-line JSDoc breadcrumb + 8-line `bdd.env` array; trailing commas appended on the prior `outputs` lines) |
| Depends on | — (independent; only touches `turbo.json`) |
| LOC | +16 / -0 (8 entries × 2 tasks + 2 breadcrumb lines; R1 + R2 + R3 satisfied in a single atomic commit per design §4) |
| TDD | n/a (config-only). RED state documented in `explore.md` §4 Tests 1–5 (Turbo strict-mode strips undeclared env vars; `web#build` Zod errors at `libs/core/config/env.ts:89`). GREEN state observed empirically with R1 + R2 + R3 applied: same reproducer command → exit 0, 43/43 scenarios. The CI BDD job itself is the regression gate (G1 + AC25). |
| Verify | (a) `node -e "JSON.parse(require('fs').readFileSync('turbo.json','utf-8'))"` MUST exit 0 — JSON is structurally valid (AC10). (b) `pnpm turbo run bdd --dry=json 2>&1 \| head -30` MUST exit 0 with a valid task graph and no schema validation warning (AC11). (c) `jq '.tasks.build.env' turbo.json` MUST return a 7-element array whose element order matches `.github/workflows/ci.yml:214–221` position-by-position (AC1 + AC4). (d) `jq '.tasks.bdd.env' turbo.json` MUST return a 7-element array identical to the build one (AC2 + AC3 + AC4). (e) `jq '.tasks.build \| has("passThroughEnv")'` AND `jq '.tasks.bdd \| has("passThroughEnv")'` MUST both return `false` (AC5). (f) `grep -c '"passThroughEnv"' turbo.json` MUST return `0` (AC6). (g) `jq 'has("globalEnv") or has("globalPassThroughEnv")' turbo.json` MUST return `false` (AC7). (h) `grep -B2 '"env": \[' turbo.json \| head -6` MUST show the 2-line JSDoc block (`turbo strict-mode` + `must stay in sync with`) immediately above the `bdd` task's `"env"` field (AC8). |

**Concrete edits** (per design §2 File 1, byte-exact):

1. In the `build` task block (current lines 5–8), change line 7:
   ```diff
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
   ```

2. In the `bdd` task block (current lines 25–28), change line 27:
   ```diff
   -      "outputs": ["bdd-reports/**"]
   +      "outputs": ["bdd-reports/**"],
   +      // turbo strict-mode strips undeclared env vars; declare all vars @core/config validates.
   +      // must stay in sync with .github/workflows/ci.yml BDD job env block.
   +      "env": [
   +        "DATABASE_URL",
   +        "NEXTAUTH_URL",
   +        "NEXTAUTH_SECRET",
   +        "API_URL",
   +        "WEB_ORIGIN",
   +        "PORT",
   +        "NODE_ENV"
   +      ]
   ```

**No other line in `turbo.json` changes.** The root `$schema`, `ui`, `tasks.dev`, `tasks.lint`, `tasks.test`, `tasks.typecheck`, `tasks.e2e`, `tasks.coverage`, `tasks.clean`, and the `bdd.dependsOn: ["build"]` line stay byte-identical (R4 + AC9).

**Var order invariant** (R1 + AC4): the 7 entries in both arrays MUST match `.github/workflows/ci.yml:214–221` position-by-position — `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`, `PORT`, `NODE_ENV`. Reordering breaks diff readability and contract auditability; reviewers will reject.

**Why `env` (not `passThroughEnv`)** — R3 + design §2 + spec §11 Q4: `env` participates in the task's cache hash (changing any of the 7 vars invalidates `web#build` and `bdd` caches); `passThroughEnv` does NOT participate (stale `.next/` build produced under `API_URL=staging` would be served for `API_URL=production`). Since `@core/config` validates at module load and Next.js page-data bundles embed the validated `API_URL` / `WEB_ORIGIN`, env changes MUST invalidate the cache. The 2-line JSDoc breadcrumb above `bdd.env` (and not above `build.env`) is the single-source-of-truth rationale; reviewers reading the diff see it once.

---

### T2 — verification marker (full turbo pipeline green on Node 22 + cache invalidation R10)

| Field | Value |
|-------|-------|
| Commit | `chore(ci): verify pnpm turbo run bdd exits 0 locally + cache invalidation (R5 + R10 marker)` |
| Files | (no file changes — empty verification marker; records the local GREEN proof in git log) |
| Depends on | T1 (must observe the post-T1 cumulative state) |
| LOC | 0 / 0 |
| TDD | n/a (verification gate). Records the binary accept criteria: `pnpm turbo run bdd` exits 0 with 43/43 BDD scenarios (18 auth + 25 transactions) + `pnpm turbo run build` exits 0 + cache invalidation R10 + R5 regression gate. Body MUST cite `explore.md §4 Tests 1–5` as the empirical RED→GREEN evidence (per spec §7.2 + design §3 step 4 + step 6 + step 7). No `Co-Authored-By` (AC29). Conventional Commit subject format (AC28). |
| Verify | `pnpm turbo run bdd --force` MUST exit 0 with stdout reporting `43 scenarios` (18 auth + 25 transactions; AC18 + AC19 + AC20 + AC21 + AC22). `pnpm turbo run build` MUST exit 0 (AC24). `pnpm lint:fixtures` MUST exit 0 (AC17 + AC24). Cache invalidation R10: populate cache with `DATABASE_URL=<A>` via `pnpm turbo run build --force`, then re-run with `DATABASE_URL=<B>` (no `--force`) — MUST be a cache miss for `web#build` + `api#build` (AC23). `git diff develop --name-only` MUST list exactly `turbo.json` (AC9; G6 + R4). `git diff develop --stat -- pnpm-lock.yaml` MUST show no changes (AC14). `git diff develop --name-only -- '*.ts' '*.tsx' 'package.json' '.github/workflows/**' '*.env*' 'tools/eslint-plugin-boundary/**'` MUST return empty (AC12 + AC13 + AC15 + AC16 + AC17). `git log feat/fix-ci-env-propagation --pretty=format:"%B" \| grep -i "co-authored-by"` MUST return empty (AC29). |

**Why T2 is a separate commit** — design §4 explicit: T1 is the "structural fix to review"; T2 is the "local proof it's correct". `git revert <sha>` of T1 alone cleanly reverts the fix; T2's message remains in the log as evidence of the pre-revert GREEN state. The work-unit-commit principle applies even to verification markers — they document intent at a specific point in history.

**Body template** for the T2 commit message (orchestrator fills in the actual command outputs):

> Empirical verification of R1 + R2 + R3. RED state (pre-fix) reproduced locally via `openspec/changes/fix-ci-env-propagation/explore.md §4 Test 4`: `pnpm turbo run bdd --force` with the BDD job env vars (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`, `PORT`, `NODE_ENV`) → `web#build` fails on `ZodError: Required: API_URL, WEB_ORIGIN` at `libs/core/config/env.ts:89` during Next.js page-data collection. GREEN state (post-fix, this commit): same reproducer command → exit 0; `web#build` and `api#build` both `> SUCCESS`; auth 18/18 + transactions 25/25 = 43/43 scenarios; 0 skipped / 0 pending / 0 todo. Cache invalidation R10 verified: `pnpm turbo run build` with `DATABASE_URL=<A>` populates the cache; re-run with `DATABASE_URL=<B>` (no `--force`) → cache MISS for `web#build` and `api#build` (env vars participate in the cache hash via the new `env` arrays — proves the `env` field is correctly named, not `passThroughEnv`). All AGENTS.md §3 quality gates pass: `pnpm install --frozen-lockfile` exits 0 (lockfile byte-identical, AC32), `pnpm turbo run build lint typecheck test` exits 0 across all workspaces (AC24), `pnpm lint:fixtures` exits 0 (no boundary violations). The CI BDD job itself is the formal regression gate (G1 + AC25): the post-merge run MUST report `success` for the first time since PR #61.

---

## §3. PR plan (single PR)

**PR title**: `fix(ci): turbo.json — declare env for build + bdd tasks (closes BDD gate)`

**Branch**: `feat/fix-ci-env-propagation` (cut from `develop` at HEAD `82611ba`)

**Base branch**: `develop` (NOT `main` — AGENTS.md §2)

**Merge strategy**: squash-merge at PR end. The 2-commit story lives in the PR description; the squash collapses to a single revertible change on `develop`.

**Pre-PR checklist**:

- [ ] Both commits land in order on `feat/fix-ci-env-propagation` (T1 → T2).
- [ ] Each commit message is `type(scope): <subject>`, imperative present, ≤72 chars subject, no trailing period.
- [ ] No `Co-Authored-By` trailers in any commit (AC29).
- [ ] **CRITICAL**: both `env` arrays contain exactly the 7 vars in the exact order `DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, API_URL, WEB_ORIGIN, PORT, NODE_ENV` (R1 + R2 + AC1 + AC2 + AC4).
- [ ] **CRITICAL**: the field name is `env`, NOT `passThroughEnv`, NOT `globalEnv`, NOT `globalPassThroughEnv` (R3 + AC5 + AC6 + AC7).
- [ ] **CRITICAL**: the 2-line JSDoc breadcrumb sits immediately above the `bdd` task's `"env"` field, naming "turbo strict-mode" + "must stay in sync with ci.yml" (R3 + AC8).
- [ ] `node -e "JSON.parse(...)"` exits 0 — `turbo.json` is valid JSON (AC10).
- [ ] `pnpm turbo run bdd --dry=json` exits 0 — schema parses cleanly (AC11).
- [ ] `pnpm turbo run bdd --force` exits 0 with 43/43 scenarios locally (AC18 + AC19 + AC20 + AC21 + AC22).
- [ ] `pnpm turbo run build` exits 0 locally (AC24).
- [ ] Cache invalidation R10 verified: `DATABASE_URL=<A>` → `<B>` → cache MISS for `web#build` + `api#build` (AC23).
- [ ] `pnpm lint:fixtures` exits 0 — no boundary violations (AC17 + AC24).
- [ ] `pnpm install --frozen-lockfile` exits 0 — lockfile byte-identical (AC14 + AC32).
- [ ] The diff does NOT include any `.ts` / `.tsx` / `.sh` file (R8 + AC12).
- [ ] The diff does NOT include any `.feature` / `.steps.ts` / `cucumber.mjs` / `support/register.ts` / `world.ts` file (R8 + AC12).
- [ ] The diff does NOT include `apps/api/**`, `apps/web/**`, `libs/**`, `tools/eslint-plugin-boundary/**`, `.github/workflows/**`, `package.json`, `pnpm-lock.yaml`, `tsconfig*.json`, or any `.env*` file (R4 + R8 + R9 + AC9 + AC13 + AC14 + AC15 + AC16 + AC17).
- [ ] `git diff develop --name-only` lists exactly 1 file: `turbo.json` (AC9 + G6).
- [ ] GitHub Actions BDD (Cucumber) job reports `success` on the PR (AC25 — **THE primary signal**, first time since PR #61).
- [ ] All 4 CI jobs report `success`: Static analysis, Build, Unit + integration, BDD (Cucumber) (AC26 + G2).
- [ ] PR body explicitly references the 4-PR BDD bypass history (slice-7 PR-7, slice-7 PR-8, slice-8 PR-1, slice-8 closeout) AND explains the structural fix (R11 + AC30).
- [ ] PR body includes the `env` vs `passThroughEnv` contrast paragraph explaining cache correctness (R12 + AC31).
- [ ] `git log --oneline develop..feat/fix-ci-env-propagation` shows exactly 2 commits (AC27 — relaxed from the spec's stricter 1-commit assumption because T2 is a verification marker; see design §4).

---

## §4. Delivery strategy

- **Delivery strategy** (from `openspec/config.yaml`): `auto-chain` — auto-slices on >400 LOC.
- **This change's effective strategy**: **single PR**. 14 net source LOC + 2 breadcrumb lines sits at ~4% of the 400-line budget; no auto-chain trigger fires.
- **No chained PRs recommended**.
- **Branch**: `feat/fix-ci-env-propagation` cut from `develop` after the user's "go" signal (HEAD `82611ba`).
- **Reviewer**: maintainer (Sebastián Illa).
- **Risk profile**: 7 risks catalogued in `proposal.md` §7 + `design.md` §6 (R1–R7); all have concrete mitigations already engineered into the 2 tasks (R1 — intended cache invalidation behaviour, enforced by R3 + R10 + AC23; R2 — all 7 vars enumerated empirically, declared explicitly; R3 — JSDoc breadcrumb + PR body document the contract; R4 — JSDoc + R12 paragraph document the distinction; R5 — first CI run repopulates the remote cache under the new contract; R6 — pre-existing governance issue, BDD gate is the authoritative signal; R7 — Turbo `env` field stable since 2.0).

---

## §5. Apply order

1. **Create branch** `feat/fix-ci-env-propagation` off `develop@82611ba`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-ci-env-propagation
   ```
2. **Apply T1** (commit `fix(ci): turbo.json — declare env for build + bdd tasks (R1, R2, R3)`):
   - Edit `turbo.json` per §2 T1 concrete edits (trailing comma after `outputs` arrays + `env` array of 7 vars in `build` task, then trailing comma + 2-line JSDoc breadcrumb + `env` array of 7 vars in `bdd` task).
   - Run `node -e "JSON.parse(require('fs').readFileSync('turbo.json','utf-8'))"` — should exit 0.
   - Run `pnpm turbo run bdd --dry=json 2>&1 | head -30` — should exit 0 with valid task graph; no schema validation error.
   - Run `jq '.tasks.build.env' turbo.json` and `jq '.tasks.bdd.env' turbo.json` — both should return 7-element arrays with the same element order.
   - Run `grep -c '"passThroughEnv"' turbo.json` — should return `0`.
   - Run `jq 'has("globalEnv") or has("globalPassThroughEnv")' turbo.json` — should return `false`.
   - Run `grep -B2 '"env": \[' turbo.json | head -6` — should show the 2-line JSDoc block above `bdd.env`.
3. **Apply T2** (commit `chore(ci): verify pnpm turbo run bdd exits 0 locally + cache invalidation (R5 + R10 marker)`):
   - Run the full BDD suite locally per the recipe in design §3 step 4:
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
     Expected: exit 0; auth 18/18 + transactions 25/25 = 43/43 scenarios; `web#build` + `api#build` both `> SUCCESS`; 0 skipped/pending/todo.
   - Run cache invalidation R10 per design §3 step 6 (DATABASE_URL=<A> → <B>; second run is cache miss).
   - Run quality gates per design §3 step 7 (`pnpm install --frozen-lockfile && pnpm turbo run build lint typecheck test && pnpm lint:fixtures`) — all exit 0.
   - Commit T2 with the body template from §2 T2 (orchestrator fills in actual command outputs).
4. **Pre-commit hygiene gates** (per AGENTS.md §12):
   ```bash
   pnpm lint:fixtures              # MUST exit 0; no ESLint changes
   pnpm typecheck                  # MUST exit 0; no .ts changes
   pnpm turbo run test             # MUST exit 0 across workspaces
   pnpm install --frozen-lockfile  # MUST exit 0; lockfile byte-identical
   ```
5. **Push the branch**:
   ```bash
   git push -u origin feat/fix-ci-env-propagation
   ```
6. **Open the PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-ci-env-propagation \
     --title "fix(ci): turbo.json — declare env for build + bdd tasks (closes BDD gate)" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   PR body MUST lead with: (a) the one-line statement that this restores the previously-broken BDD CI gate on `develop` (4 PRs — slice-7 PR-7, slice-7 PR-8, slice-8 PR-1, slice-8 closeout — were admin-merged with this gate bypassed because of this latent Turbo env-stripping bug), (b) the empirical reproducer recipe from explore §4 Tests 1–5 (move HOME pollution aside → run `pnpm turbo run bdd --force` with CI env → reproduce Zod errors at `web#build` → apply fix → 0 errors), (c) the design §2 `env` vs `passThroughEnv` contrast paragraph explaining why `env` is cache-correct and `passThroughEnv` would be a stale-build trap (R12 + AC31).
7. **Wait for CI**. The BDD (Cucumber) job MUST go from `FAIL` (the pre-fix state that was bypassed in the 4 predecessor PRs) to `PASS` on this PR (AC25 — the primary signal, first time green since PR #61). Other 3 CI jobs (`Static analysis`, `Build`, `Unit + integration`) MUST also report `success` (AC26 + G2).
8. **Review + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-ci-env-propagation   # after maintainer approval
   ```
9. **`sdd-verify` runs on `develop` post-merge** to confirm the gate stays green (43/43 BDD scenarios, `pnpm turbo run build` exits 0, cache invalidation R10 verified). All 32 acceptance criteria (AC1–AC32) MUST pass.
10. **`sdd-archive` moves** `openspec/changes/fix-ci-env-propagation/{explore,proposal,spec,design,tasks}.md` to `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/` per the orchestrator's archive protocol.

---

## §6. Resolved design open questions

(All 7 deferred from proposal §10 + spec §11 were resolved in `spec.md` §11 + design `§8`.)

- **Q1 (ADR for `env`-vs-`passThroughEnv` distinction)**: **NO ADR.** The change is 14 LOC of build-config in 1 file. An ADR for a config tweak of this size is bureaucratic overhead. The **2-line JSDoc-style breadcrumb in `turbo.json`** (R3) is a better fit for the size: it lives directly above the `bdd.env` array it documents, names the root cause (Turbo strict-mode strips undeclared env vars), and points future contributors to `ci.yml:214–221` for the contract. The R12 PR description requirement carries the full contrast paragraph. Same precedent as `fix-bdd-tsx-node22` and `fix-bdd-ci-zod-resolution` for analogous surgical build-config fixes.
- **Q2 (CI lint step for env completeness)**: **NO CI lint step.** A diff-based check (`scripts/check-turbo-env.ts` that asserts the 7 keys in `turbo.json#bdd.env` equal the 7 keys in `ci.yml#bdd.env`) would harden the contract against future drift, but it adds a new script + CI job step + maintenance burden for a one-line invariant. The R3 breadcrumb already names `ci.yml:214–221` as the source of truth, so any contributor who edits one without the other will see the breadcrumb flag both files in the diff. Defer to a separate `chore-add-turbo-env-completeness-lint` change if and when the pattern repeats.
- **Q3 (JSDoc-style breadcrumb in `turbo.json`)**: **YES** — R3 mandates a 2-line JSDoc-style breadcrumb immediately above the `bdd` task's `env` field. JSON does not support comments natively; the convention per `fix-bdd-ci-zod-resolution` is a JSDoc-style block placed inside the `.json` file as consecutive `//` lines. Two lines is the minimum sufficient content (root cause + contract source).
- **Q4 (`passThroughEnv` instead of `env`)**: **`env`**, not `passThroughEnv`. R3 enforces this by name, and AC5/AC6/AC7 verify it in CI. `env` is cache-correct (values invalidate the cache); `passThroughEnv` would silently serve stale `.next/` builds across env-var changes. Since `@core/config` validates at module load and Next.js page-data bundles embed env-derived values, env changes MUST invalidate the cache.
- **Q5 (regression test for the undeclared-env-var failure mode)**: **NO new test.** This is a config-only fix where the test IS the CI BDD job itself. Pre-fix: the BDD job fails with 5 Zod errors at `web#build` collection time. Post-fix: the BDD job passes with 43/43 scenarios. The contract is exercised end-to-end on every PR; adding a Vitest unit test for "Turbo declares the 7 env vars" would assert a structural property of `turbo.json` more cheaply asserted by `jq .tasks.bdd.env` (AC1, AC2, AC4).
- **Q6 (predecessor ADR on Turbo env semantics)**: **NO** (already covered by Q1 above). The 2-line JSDoc breadcrumb + R12 PR description paragraph is the entire "predecessor ADR" — at this scale, an actual ADR file would be documentation theatre, not signal.
- **Q7 (`openspec/specs/` capability creation)**: **NO new capability file.** Per proposal §4.2, no spec-level behaviour change. This fix is a build-system mechanics correction — the 43 BDD scenarios, slice server packages, schema content, app source code, step definitions, world types, Gherkin `.feature` files, Cucumber configs, `support/register.ts` files, `cucumber.mjs` files, and `@core/config` schema all stay byte-identical. The capabilities (`auth`, `transactions`, `api-runtime`, `web-runtime`) are unchanged.

**No open questions remain at the apply phase. The apply phase proceeds directly with the 2 tasks above.**

---

## §7. Out of scope (whole change)

(Orchestrator-enforced; mirrors `spec.md` §4 + §10 + `proposal.md` §2.2 + AGENTS.md §11.)

1. No changes to `@core/config/**` (`env.ts`, `env.schema.ts`, `index.ts`). Lazy validation (proposal Shape B; explore brief §5 Shape A; ~30–50 LOC + tests; changes fail-fast semantics; deferred to a separate architectural change).
2. No changes to `.github/workflows/ci.yml`. The BDD job's env block at lines 214–221 is correct as authored; the contract violation is in the Turbo task definition.
3. No changes to `apps/web/auth.ts` or any `apps/web/app/[locale]/**/*.tsx` RSC page.
4. No changes to `apps/api/**` (controllers, services, Prisma schema, `nest-cli.json`).
5. No changes to any source `.ts` / `.tsx` file (R8).
6. No `.env*` file changes (`apps/web/.env.test`, `apps/web/.env.example`). Env vars come from the BDD job's CI env block; locally `apps/web/.env.test` already provides them.
7. No new dependency, no version bump, no lockfile regen, no `pnpm install` of any kind. `pnpm install --frozen-lockfile` MUST exit 0 unchanged (R9 + AC14 + AC32).
8. No `globalEnv` / `globalPassThroughEnv` at the top of `turbo.json` (rejected per proposal §10 Q2 → spec Q2 — bloats `lint` / `test` / `typecheck` / `e2e` / `dev` / `coverage` / `clean` cache hashes with vars they don't consume).
9. No `passThroughEnv` anywhere in `turbo.json` (rejected for cache-correctness; R3 + AC5 + AC6).
10. No new ESLint rule, no `tools/eslint-plugin-boundary/**` edit, no `pnpm lint:fixtures` fixture change (R + AC17).
11. No new BDD scenario, unit test, integration test, or e2e test. The CI BDD job itself IS the regression gate (G1 + AC25; spec §7.2 vacuous-satisfaction of AGENTS.md §4 strict TDD).
12. No ADR (`docs/architecture/decisions/00XX-turbo-env-vs-passthrough.md`). The 2-line JSDoc breadcrumb (R3) plus the R12 PR description paragraph is the entire "ADR" at this scale (Q1 + Q6 rejected).
13. No CI smoke test that strips HOME pollution (`HOME=$(mktemp -d)`) or any other new CI step.
14. No `continue-on-error: false` on the Build job's `web#build` step (pre-existing governance issue from `fix-bdd-ci-zod-resolution` §10 R6; R6 mitigation; deferred).
15. No `Documents-es/` mirror (no English `.md` added under `openspec/` or `docs/` by this PR; AGENTS.md §13; design §7 + spec §7.6; same precedent as `fix-bdd-tsx-node22`, `fix-bdd-ci-zod-resolution`).
16. No removing or revisiting `fix-bdd-tsx-node22` (predecessor — loader hook token; that change is closed and unrelated).
17. No removing or revisiting `fix-bdd-ci-zod-resolution` (predecessor — orphan-schema zod resolution; that change is closed and unrelated).
18. No migration of `gastos-personales/` to the vertical-slicing model.
19. Nothing from AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth providers beyond Google, production hardening, observability, coverage gate, audit log UI).
20. No follow-up orphan-directory cleanup (the `libs/features/{auth,transactions}/shared/` architectural fix; deferred to a separate `fix-orphan-shared-directories` change — same breadcrumb as `fix-bdd-ci-zod-resolution` §11 Q5).
21. No `public-hoist-pattern: ["*zod*"]` in `pnpm-workspace.yaml` (Shape B from `fix-bdd-ci-zod-resolution` §3.5 — rejected; workspace-wide blast radius).

---

## §8. Risks

(Mirrors `proposal.md` §7 + `design.md` §6 R1–R7; no new risks introduced at the tasks phase.)

| ID | Risk | Likelihood | Concrete mitigation in this tasks plan |
|----|------|------------|---------------------------------------|
| **R1** | Declaring all 7 env vars in `turbo.json` inflates the cache-key space and may invalidate caches more often than desired across matrix envs. | Low | (a) This is the **intended behaviour**: env vars that flow through eager module-load validation SHOULD invalidate the cache. (b) Other env vars (`TURBO_TOKEN`, `PATH`, etc.) are hashed separately by Turbo's own internal mechanism and are NOT affected by the `env` array. (c) R3 + R10 + AC23 enforce cache correctness with explicit verification recipes in design §3 step 6. (d) T2 body records the empirical cache-invalidation verification for posterity. |
| **R2** | Missing a required env var in the `env` array would surface as a different Zod failure mode than the original bug (rotating Zod errors). | Low | (a) The explore sub-agent enumerated all 5 required string fields + the 2 simpler types empirically (`explore.md` §4, Tests 4 + 5). (b) The fix declares all 7 — the minimum complete contract. (c) Adding `STRIPE_*` or other future vars is a straightforward append to both `build.env` and `bdd.env`. (d) AC1 + AC2 (`jq` assertions on both arrays) verify the count; AC4 verifies the contract alignment with `ci.yml:214–221`. |
| **R3** | Future env var additions require updating `turbo.json` (no automatic detection). | Low | (a) The R3 JSDoc breadcrumb explicitly names the contract: *"must stay in sync with .github/workflows/ci.yml BDD job env block"*. (b) PR body (R11 paragraph) documents the contract. (c) Adding a CI lint check (`scripts/check-turbo-env.ts`) is out of scope per spec §11 Q2; defer to a follow-up slice if the pattern recurs. |
| **R4** | A future contributor might pick `passThroughEnv` instead of `env` and silently break cache correctness. | Low | (a) Design §2 explanation documents the distinction explicitly (proposal §3.3 + spec R3). (b) The R12 PR description paragraph contrasts `env` (cache-hashed) with `passThroughEnv` (not cache-hashed). (c) The R3 JSDoc breadcrumb above `bdd.env` names "turbo strict-mode strips undeclared env vars" so the next contributor reading the file understands the discipline. (d) AC5/AC6/AC7 verify the field name is `env` (not `passThroughEnv`, not `globalEnv`) at verify time. (e) The R10 cache-invalidation verification (T2 body) proves empirically that `env` is the correct field name (env vars DO participate in cache key). |
| **R5** | Remote cache entries created before this fix (with `--force` runs) may have hidden environment assumptions that don't match this fix's contract. | Low | (a) The next CI run after merge effectively repopulates the remote cache under the new contract. (b) No green remote cache for `web#build` exists in the slice-7/8 lineage (all predecessor green-CIs came from the bypassed gate path or were failures). (c) `--force` is NOT required on first CI run. (d) Cache invalidation works correctly going forward per G5 + AC23. |
| **R6** | Build job's `continue-on-error: true` (`.github/workflows/ci.yml:175–177`) means "Build job green" doesn't prove the build actually runs. | Med (pre-existing) | (a) Out of scope per spec §4 non-goal #15 + §11 Q6: predecessor proposal `fix-bdd-ci-zod-resolution` §10 Q5 already deferred this. (b) The BDD gate (G1 + AC25) is the authoritative signal — `pnpm turbo run bdd` transitively triggers `web#build`, and the post-fix GREEN proves the underlying fix works end-to-end. (c) A future slice can revisit the Build job's `continue-on-error` flag. |
| **R7** | Turbo 2.x's `env` semantics changed across minors (e.g., 2.10 vs 2.11 might process `env` differently). | Very low | (a) Turbo's `env` field has been stable since 2.0; `^2.10.3` (root `package.json`) pins to the same minor. (b) This is the standard contract for any Turbo config. (c) A future Turbo major bump would require re-verification of R1 + R2 + R3, but that's the same maintenance burden as any other Turbo config consumer. |

**Per-file rollback analysis** (from design §6 R6, restated):

- **Revert T1 only** (the whole PR): `turbo.json` returns to its pre-fix state; the BDD gate returns to the same Zod failure it shows today (5 required string vars stripped). `git revert <merge-sha>` (squash-merged single commit on `develop`) reverses the PR cleanly. Acceptable as a clean rollback target.
- **Revert `build.env` only** (hypothetical split; not how this PR is structured): `web#build` fails on the same 5 Zod errors; BDD gate fails. The `bdd.env` array alone is insufficient because `web#build` runs at the `build` layer (transitive via `bdd.dependsOn: ["build"]`). **NOT acceptable as a half-fix.**
- **Revert `bdd.env` only** (hypothetical split): `web#build` passes (its own `env` is declared); `pnpm turbo run bdd` propagates the vars via the chain and the BDD steps run. Acceptable as a half-fix; the Build job continues to validate `web#build` standalone.
- **Revert T1 + T2 together** (whole PR): same as "Revert T1 only" — T2 is a verification marker with no file edits, so reverting T2 is a no-op.

---

## §9. Review Workload Forecast

| Field | Value |
|-------|-------|
| **Estimated changed lines** | +16 / -0 net source LOC (`turbo.json` only; 14 env declarations + 2 JSDoc breadcrumb lines; lockfile byte-identical; no spec/design amend) |
| **400-line budget risk** | Low (~4% of budget used) |
| **Chained PRs recommended** | No |
| **Delivery strategy** | `auto-chain` (project default); auto-chain trigger NOT fired (16 ≪ 400) |
| **Effective strategy** | single-pr |
| **Single-PR rationale** | 16 net LOC well under 400; one PR keeps the env-contract fix + cache-invalidation verification marker coherent (config fix → verification marker) |
| **Decision needed before apply** | No (no `ask-on-risk` trigger; all 7 risks have concrete mitigations already engineered into the 2 tasks) |
| **Chain strategy** | n/a (single-PR path) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

---

## §10. Status

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, source design §4) · `risks`: R1–R7 (concrete mitigations baked into the 2 tasks above; no new risks introduced at this tasks phase)

`next_recommended`: **`apply`** — orchestrator creates `feat/fix-ci-env-propagation` off `develop@82611ba` and applies the 2 tasks in §2 sequentially.

---

## Cross-references

- **Proposal**: `openspec/changes/fix-ci-env-propagation/proposal.md` (Engram `#2343`)
- **Spec**: `openspec/changes/fix-ci-env-propagation/spec.md` (Engram `#2346`; 6 goals, 12 requirements, 6 Gherkin scenarios, 32 AC)
- **Design**: `openspec/changes/fix-ci-env-propagation/design.md` (Engram `#2347`; 1 source file in scope, 2 atomic commits, 8 execution steps, no open questions at §8)
- **Explore brief**: `openspec/changes/fix-ci-env-propagation/explore.md` (Engram `#2340`; empirical RED→GREEN evidence in §4 Tests 1–5 — Turbo strict-mode strips undeclared env vars; `web#build` Zod errors at `libs/core/config/env.ts:89` during Next.js page-data collection; `--env-mode=loose` control proves boundary is Turbo, not Next.js)
- **Smoking-gun error**: `ZodError: Required: DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, API_URL, WEB_ORIGIN at libs/core/config/env.ts:89` (eager module-load validation), surfaced during Next.js page-data collection at `web#build`
- **Empirical reproducer** (from `explore.md` §4):
  ```bash
  # RED — pre-fix:
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gastos_reference_test \
  NEXTAUTH_SECRET=ci-only-do-not-use-in-prod-32-chars-min \
  NEXTAUTH_URL=http://localhost:3000 \
  WEB_ORIGIN=http://localhost:3000 \
  API_URL=http://localhost:3001 \
  PORT=3001 \
  NODE_ENV=test \
  pnpm turbo run bdd --force
  # Expected on develop (RED): web#build fails on 5 Zod errors during page-data collection;
  # auth 18/18 + transactions 25/25 do NOT run because bdd.dependsOn: ["build"] blocks.

  # GREEN — post-fix (R1 + R2 + R3 applied):
  # Same command; expected: exit 0; web#build green; auth 18/18 + transactions 25/25 = 43/43.

  # Loose-mode control (proves the boundary is Turbo, not Next):
  pnpm turbo run build --filter=web --force --env-mode=loose
  # Pre-fix GREEN with the CI env — confirms Next.js is downstream of the loss, not its source.
  ```
- **BDD gate history** (per proposal §1 + §11): PR #61 merged the env-rich BDD job config; 4 subsequent PRs (slice-7 PR-7, slice-7 PR-8, slice-8 PR-1, slice-8 closeout) were admin-merged with the BDD gate bypassed because of this latent bug. Fixing this proposal closes the underlying gate permanently.
- **Loading-config references** (verified at design time):
  - `turbo.json:5–8` — current `build` task (no `env` / `passThroughEnv`); the 9-line gap the fix closes (R2)
  - `turbo.json:25–28` — current `bdd` task (no `env` / `passThroughEnv`); the 11-line gap the fix closes (R1 + R3)
  - `.github/workflows/ci.yml:214–221` — BDD job-level `env:` block with all 7 vars; the contract `turbo.json` must propagate (AC4 source)
  - `.github/workflows/ci.yml:175–177` — Build job's `web#build` step has `continue-on-error: true` (pre-existing; out of scope per R6 mitigation)
  - `libs/core/config/env.ts:89` — `export const env = parseEnv(process.env)` (eager module-load validation that surfaces the bug)
  - `libs/core/config/env.schema.ts` — Zod schema with the 5 required string fields (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `API_URL`, `WEB_ORIGIN`) + `NODE_ENV` enum + `PORT` positive integer
- **Modified files** (apply produces this 1 file in the PR diff):
  - `turbo.json` (42 LOC → 58 LOC; +16 lines inside 2 task blocks: trailing comma on `build.outputs` line 7 + 8 `build.env` entries; trailing comma on `bdd.outputs` line 27 + 2 JSDoc lines + 8 `bdd.env` entries)
- **Format reference**: `openspec/changes/fix-bdd-ci-zod-resolution/tasks.md` (mirrored the 10-section structure + per-task table style + dependency graph + applied-task invocation order; compressed for the smaller change scope — 2 tasks vs 5 because of the config-only single-file fix + the absence of a spec.md amend + the absence of a lockfile regen + the explicit verification marker)
- **Predecessor proposal 1**: `openspec/changes/archive/2026-07-14-fix-bdd-tsx-node22/tasks.md` — mirrored the 10-section structure for the analogous surgical config fix (mirrored the 1-file-diff pattern, the work-unit-commit split, the verification marker pattern)
- **Project conventions**: AGENTS.md §2 (branch — develop → tracker `feat/fix-ci-env-propagation`, no `main` mutation), §3 (quality gates — `pnpm install` exits 0, Postgres healthy, `turbo build lint typecheck test` exits 0, `lint:fixtures` exits 0, `turbo bdd e2e` exits 0 — all 6 must pass), §4 (strict TDD — config-only fix, vacuously RED→GREEN via `explore.md` §4 Tests 1–5), §5 (atomic commits — 2 work-unit commits), §6 (Conventional Commits — `fix(ci):` + `chore(ci):`, no AI attribution), §7 (boundary plugin — no rule, fixture, config, or runner edits), §8 (single source of truth — env contract declared in exactly one place per gate: `turbo.json` `tasks.{build,bdd}.env`; `ci.yml:214–221` authors the values), §11 (out-of-scope list — none of its items touched), §12 (pre-commit checklist — single-purpose commits, rollback-trivial, ESLint untouched), §13 (Spanish mirror — no English `.md` added under `openspec/` or `docs/` by this PR beyond the pre-existing proposal + spec + design, mirroring `fix-bdd-tsx-node22` and `fix-bdd-ci-zod-resolution` precedents)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain` (NOT triggered, 16 ≪ 400), `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

---

**END OF TASKS**.
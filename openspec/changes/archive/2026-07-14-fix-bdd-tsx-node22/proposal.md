# Proposal — `fix-bdd-tsx-node22`

> **Status**: draft · proposal phase · **Date**: 2026-07-13
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-bdd-tsx-node22`
> **Artifact store**: hybrid · **Mode**: auto
> **Fix shape**: **A** — 2-line config swap; trivially revertable.
> **Single PR**: 2 files in scope, ~82 net LOC cap (well under the 400-line review budget) · `auto-chain` NOT triggered.

---

## 1. Intent

The BDD CI gate on `develop` is broken on Node 22. CI run `29288016689` (linked from the explore brief) fails every BDD-validating PR with `SyntaxError: Unexpected identifier 'AuthWorld'` at `compileSourceTextModule` (Node `22.14.0`, identical stack at `22.13.0`). The root cause is verified empirically, not hypothesised: Cucumber 13's `require:` config invokes Node's **CJS** `require()` to load `support/register.ts` (`@cucumber/cucumber/lib/try_require.js:8`), while the slice `bdd` scripts register the **ESM** loader hook (`--import tsx/esm`). ESM hooks do NOT intercept CJS `require()`. Node 22 then parses the `.ts` file as CJS, hits TypeScript-only `import type { AuthWorld }` syntax, and throws. The hypothesis (Engram #2301) that pinned the bug on tsx 4.23.0 is empirically falsified: tsx 4.22.5, 4.23.0, and 4.23.1 all fail identically. The fix is a one-token-per-line swap: `--import tsx/esm` → `--import tsx/cjs` (the official tsx CJS register hook, shipped since tsx 4.16.x, currently at `4.23.0`). Empirically verified: `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` on Node `22.14.0` returns `18 scenarios (18 passed) 101 steps (101 passed)` in 0.34s. Blast radius: every BDD-validating PR from slice-7 onwards was either admin-merged or carries a broken BDD gate — fixing this unblocks the next green BDD CI cycle.

---

## 2. Scope

### 2.1 In Scope

1. `libs/features/auth/server/package.json` line 17 — change the `bdd` script's `NODE_OPTIONS` from `--import tsx/esm` to `--import tsx/cjs`. Single-token edit (`tsx/esm` → `tsx/cjs`).
2. `libs/features/transactions/server/package.json` line 17 — same single-token edit.
3. Engram observation at `topic_key sdd/fix-bdd-tsx-node22/proposal`, `type=architecture`, `project=gp-v2`, `scope=project`, `capture_prompt=false` persists the proposal in the hybrid artifact store (matches OpenSpec file under §11).

### 2.2 Out of Scope

- No changes to any `support/register.ts` file (both slices).
- No changes to any `cucumber.mjs` file (both slices).
- No changes to any `.steps.ts` / `.feature` / `world.ts` file (the slices' BDD surface stays untouched).
- No changes to `.github/workflows/ci.yml` (the BDD job configuration is correct: Node 22.13.0, pnpm 11.10.0, Postgres 16-alpine, 30-min timeout — it just needs the slice scripts to work).
- No tsx version pin (the bug is the wrong hook, not the version; `^4.23.0` already allows the full 4.23.x range).
- No Node version change (Node 22.13.0 is the CI target; the fix works on Node 22.x per `22.14.0` empirical test and is consistent on Node 23.x per the same hook contract).
- No changes to `apps/web` or `apps/api`.
- No new dev dependencies; no `pnpm-lock.yaml` regeneration.
- No new ESLint rules, no boundary plugin edits, no `pnpm lint:fixtures` impact.
- No new BDD scenarios, no new unit/e2e tests.
- No ADR (informally: the change is two `package.json` lines swapping between two official tsx entries documented at <https://tsx.is>; an ADR for this is bureaucratic). **Q1 in §11 asks the user to confirm.**
- No `Documents-es/` mirror — no English `.md` is added under `openspec/` or `docs/` by this change (per AGENTS.md §13; same precedent as `fix-api-nestjs-di` proposal which mirrored only the new ADR, not the proposal itself).
- Nothing from AGENTS.md §11's out-of-scope list (i18n beyond en/es, Sentry, rate-limiting, OAuth providers beyond Google, production hardening, observability, coverage gate, audit log UI).

---

## 3. Approach

Pure configuration swap. One token per file. No code, no tests, no infra. Two lines change; everything else stays.

### 3.1 Why `tsx/cjs` works

tsx 4.16.x onward ships TWO register hooks (verified in `node_modules/tsx/package.json` `exports` map):

- `tsx/esm` — registered via `--import tsx/esm`. Hooks Node's ESM `initialize`/`resolve`/`load` chain. Intercepted ONLY when a file is loaded via ESM `import()`.
- `tsx/cjs` — registered via `--import tsx/cjs` (or `--require tsx/cjs`). Calls `module.register('../register-*.cjs')` which patches `Module._extensions['.ts']` and `Module._compile` to run esbuild on `.ts` sources **before** Node's CJS parser sees them. This strips TS-only syntax (`import type`, parameter properties, enums) and returns transpiled CJS to Node. This is exactly the path Cucumber's `require:` config takes (`try_require.js:8` → `require(path)`).

The slice scripts were registering the wrong hook. Cucumber uses CJS `require()`; the script registered an ESM hook. No amount of version swap fixes that mismatch — only switching to the CJS hook does.

### 3.2 Why Node 22 surfaces the bug and Node 23 hides it

Node 22's CJS parser is strict: when CJS `require()` encounters a `.ts` file with no `package.json#type` override, it parses as CJS first and dies on TS-only syntax (`SyntaxError: Unexpected identifier 'AuthWorld'`). Node 23 changed `require()` semantics for ESM files (require(esm) interop), bypassing the CJS parse step for files that ESM-hooks have already registered — which is exactly why local Node 23.8.0 (volta default) hides the bug while CI Node 22.13.0 surfaces it.

### 3.3 What the fix changes (concretely)

```diff
- "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/esm' cucumber-js --config cucumber.mjs"
+ "bdd": "cd ../docs && NODE_OPTIONS='--import tsx/cjs' cucumber-js --config cucumber.mjs"
```

Identical diff applied to both `libs/features/auth/server/package.json:17` and `libs/features/transactions/server/package.json:17`. Two lines, one token each.

### 3.4 Why not Shape B (Cucumber's `import:` config)

Cucumber also supports an `import:` config that uses ESM `import()` instead of CJS `require()`, which would let `--import tsx/esm` work. This is the "cleaner long-term direction" (all TypeScript loaded via ESM, matching the slices' `"type": "module"` setting). It is rejected for this change because:
- It changes Cucumber's loader mechanism, which is more architecturally meaningful than a one-token script tweak.
- It is a different fix-shape (Shape B in the explore brief) and not what's been empirically verified.
- Shape A is the minimum-surgical intervention; Shape B can be revisited in a dedicated change if the team wants to standardise on ESM throughout.

---

## 4. Capabilities

> Contract between this proposal and `sdd-spec`. Research `openspec/specs/` first to use correct existing capability names. Note: `openspec/specs/` does NOT exist on this branch yet (slices have shipped spec-proposals only, not standalone specs).

### 4.1 New Capabilities

**None.** This is a configuration-only fix that restores pre-existing expected BDD runner behaviour. No new contract surfaces.

### 4.2 Modified Capabilities

**None.** No spec-level behaviour changes. The BDD scenarios, step definitions, world types, Gherkin `.feature` files, Cucumber configs, and `support/register.ts` files all stay byte-for-byte identical. The fix only changes WHICH Node loader hook transforms TypeScript at `require()` time — the scenarios and their semantics are unchanged.

> Note for `sdd-spec`: if the spec phase decides a capability is warranted (e.g. `bdd-runner-loader-chain` documenting "the BDD runner must transform TypeScript at the same loader path Cucumber uses"), it can introduce one. The proposal stays neutral because the existing `openspec/specs/` directory is empty and the proposal should not invent a capability name preemptively.

---

## 5. Affected Areas

| File | Change | LOC delta |
|------|--------|----------:|
| `libs/features/auth/server/package.json` | Edit (swap `--import tsx/esm` → `--import tsx/cjs` in `bdd` script, line 17) | +1 / -1 |
| `libs/features/transactions/server/package.json` | Edit (same swap, line 17) | +1 / -1 |

**Total estimated**: +2 / -2, **2 net LOC**. Far under the 400-line review budget → **single PR is appropriate**, `auto-chain` is NOT triggered.

**Files NOT touched (verified against explore brief §1, §2, §6):**
- All 9 `.feature` files (6 auth + 6 transactions — wait: explore §6 says 9 files for 12 features split as 6+6, totaling 12; this proposal does not need to enumerate them).
- All 5 `.steps.ts` files (3 in auth, 2 in transactions; explore §2 enumerates them).
- Both `world.ts` files.
- Both `support/register.ts` files.
- Both `cucumber.mjs` files.
- `pnpm-lock.yaml`.
- `tools/eslint-plugin-boundary/` (no rule, fixture, config, or runner edits).
- `.github/workflows/ci.yml`.
- `apps/web/**` and `apps/api/**`.
- `Documents-es/**`.
- Any `docs/architecture/decisions/*.md` (no ADR — see Q1 in §11).

---

## 6. Success Criteria

`sdd-verify` will run these 6 gates.

**Functional (G1–G3)**: G1 — `pnpm --filter @features/auth bdd` exits 0 on Node 22.13.0 (CI version); all 18 auth scenarios pass; all 101 auth steps pass. G2 — `pnpm --filter @features/transactions bdd` exits 0 on Node 22.13.0; all 25 transactions scenarios pass. G3 — `pnpm turbo run bdd` exits 0 across the workspace (the 11 workspaces without a `bdd` script exit immediately and do not contribute failures).

**Regression safety (G4)**: G4 — BDD scenario count remains 43/43 (18 auth + 25 transactions); no scenarios are skipped, marked pending, or removed by the fix.

**Hygiene (G5–G6)**: G5 — CI BDD job (`pnpm turbo run bdd`) on `feat/fix-bdd-tsx-node22` reports **PASS** (previously `FAIL`), confirming the end-to-end fix landed. G6 — `git diff` against `develop` shows exactly the 2-file, 2-line change in §5; no incidental edits to lockfile, ESLint config, CI workflow, or `.ts` files.

---

## 7. Risks

| ID | Risk | Likelihood | Mitigation |
|----|------|------------|------------|
| R1 | `tsx/cjs` could differ from `tsx/esm` for top-level await or async module loading, breaking some scenarios. | Low | The BDD scenarios do not use top-level await (verified by inspection in slice-7 PR-7). The empirical test on Node 22.14.0 already showed all 18 auth scenarios pass with `tsx/cjs` in 0.34s. The transactions slice has the same import shape — same expectation. |
| R2 | `tsx/cjs` may not be available in older tsx versions. | Low | tsx 4.16.x ships both hooks; `^4.23.0` (the package.json range) satisfies `>=4.16.0`. The hook is documented at <https://tsx.is/getting-started>. |
| R3 | A future tsx major could remove `tsx/cjs`. | Low | tsx's `exports` map has declared both hooks since 4.16.x with no deprecation note; both are documented entry points. If removed, the future fix would be a 2-line update mirroring today's fix — same shape, different token. |
| R4 | The fix could regress local dev environments running Node 23.x. | Low | `tsx/cjs` hooks into the CJS loader chain regardless of Node major; both Node 22 (CI target) and Node 23 (dev default) get the same hook contract. Empirical `tsx/cjs` test on Node 22.14.0 reproduces the same hook behavior documented for Node 22+ ESM/CJS interop. |
| R5 | A previous PR may have admin-merged a BDD gate override that assumes the old `tsx/esm` configuration; that override could now fail. | Low | Slice-7 / slice-8 PRs do not ship any `tsx` configuration overrides beyond the two `bdd` scripts. The admin-merge history (from slice-7 PR-7, PR-8, slice-8 PR-1) was a workaround for this exact gate — the fix now closes that gap and no override becomes stale. |

---

## 8. Rollback Plan

**Whole-change**: `git revert <merge-sha>` on `develop` undoes the single PR cleanly. The 2 `package.json` lines return to `--import tsx/esm`; the BDD gate fails on the same `SyntaxError` it fails on today. Acceptable because the BDD gate was already broken on `develop@ea7732f` (the pre-fix state) — reverting only restores the known-bad baseline.

**Per-line rollback** (independent revert of either slice):
- Revert `libs/features/auth/server/package.json:17` only: auth BDD fails as before; transactions BDD passes on its own. Acceptable if a single slice needs an emergency off-ramp.
- Revert `libs/features/transactions/server/package.json:17` only: symmetric.

**Will NOT do**: force-push, rewrite history, touch `main`, modify `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-api-nestjs-di}/`, amend any slice-7 or slice-8 commit, downgrade tsx, change Node version, swap to Shape B/C/D inline (those are separate changes).

---

## 9. Dependencies

- `tsx@^4.23.0` (declared in root `package.json` line 39). Already installed at `4.23.0` (single hoisted resolution in `pnpm-lock.yaml`). Ships both `tsx/cjs` and `tsx/esm` since 4.16.x. **No upgrade required.**
- `@cucumber/cucumber` 13.x (uses `require:` config → CJS `require()` path). Already installed. **No upgrade required.**
- Node 22.13.0 (CI) and Node 22.14.0 (local empirical). Both expose the `tsx/cjs` register hook contract identically. **No engine bump.**
- Existing BDD harness: `support/register.ts` (both slices) + `cucumber.mjs` (both slices) + step-def files (5 files) + `.feature` files (12 across both slices). All stay byte-identical. **No harness rewrite.**
- OpenSpec change directory `openspec/changes/fix-bdd-tsx-node22/` already exists with `explore.md` (Engram #2306).

---

## 10. Open Questions for `sdd-spec`

1. **ADR 0009** — should the change ship with a small ADR (`docs/architecture/decisions/0009-bdd-cjs-loader.md`) documenting the loader hook choice? **Recommendation: NO.** The change is two `package.json` lines swapping between two official tsx entries; an ADR for a config tweak of this size is bureaucratic. The proposal defers to the user. If the answer is YES, the ADR + Spanish mirror together add ~80 net LOC; both stay well under any size cap and follow the `0007-slice-8-doc-loc-exception.md` format precedent.
2. **`bdd:debug` script** — should we add a sibling `bdd:debug` script that uses `--import tsx/cjs --inspect` for local debugging? **Recommendation: NO.** Scope creep; not requested; the existing `bdd` script is sufficient for local debugging once it's working.
3. **CI `--bail` flag** — should we add `pnpm turbo run bdd --bail` to the CI job so the run fails fast on the first slice? **Recommendation: NO.** Out of scope; the BDD job already runs all slices and the existing setup is sufficient. The fix is independent of CI fast-fail semantics.
4. **`openspec/specs/` capability creation** — per §4.2, the proposal claims no spec-level behaviour change. If `sdd-spec` disagrees and wants to formalise the loader-hook contract (e.g. `bdd-runner-loader-chain` capability: "the BDD runner must transform TypeScript at the same loader path Cucumber uses"), that capability would land as `openspec/specs/bdd-runner-loader-chain/spec.md`. **Recommendation: defer to `sdd-spec`'s judgement.** This proposal does not preemptively name a capability.

---

## 11. Cross-references

- Explore brief: `openspec/changes/fix-bdd-tsx-node22/explore.md` (Engram observation #2306).
- Original (incorrect) hypothesis: Engram #2301 — "tsx 4.23.0 regression". Falsified empirically by the explore sub-agent; superseded by #2306.
- tsx exports map: `node_modules/tsx/package.json` `exports` field — declares both `tsx/esm` and `tsx/cjs` since 4.16.x (cited in explore §4 and §5).
- Loader chain anatomy: explore §3 (`@cucumber/cucumber/lib/try_require.js:8` + Node's CJS loader chain).
- Empirical test: explore §5 and §10 — `NODE_OPTIONS='--import tsx/cjs' pnpm --filter @features/auth bdd` → `18 scenarios (18 passed) 101 steps (101 passed)` in 0.34s on Node 22.14.0.
- Failing CI run (now fixed): `29288016689` (cited in explore §10 "Next steps").
- Slice-7 PR-7 (transactions `register.ts` bridge GREEN), Slice-7 PR-8, Slice-8 PR-1: the chain of admin-merged PRs that worked around this gate; this fix closes the underlying gate so future BDD-validating PRs do not need the workaround.
- Slice-8 verify report: Gate 3 / pre-existing slice-7 debt under observation F1 — this change is exactly that debt, finally paid down.
- Project conventions: AGENTS.md §4 (strict TDD — config-only fix, no RED test needed because there is no production code to test), §5 (atomic commits — the 2 `package.json` lines land in ONE commit), §6 (Conventional Commits — single `fix(bdd): use tsx/cjs loader hook so BDD runs on Node 22`), §7 (architectural boundaries — none affected), §11 (out-of-scope list — none of its items touched), §12 (pre-commit checklist — single-purpose commit, rollback-trivial, ESLint untouched), §13 (Spanish mirror — none required because no English `.md` is added under `openspec/` or `docs/`).
- Proposal-format precedent: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/proposal.md` (mirrored this structure).

---

## 12. Next Phase

`next_recommended`: **`spec`**.

`sdd-spec` should:
- Confirm the "no capability change" stance from §4 (this is a config-only fix). If the spec phase disagrees, create `openspec/specs/bdd-runner-loader-chain/spec.md` per Q4 in §10.
- Resolve Q1 (ADR?), Q2 (`bdd:debug`?), Q3 (CI `--bail`?) with the user.
- Produce a delta spec in `openspec/changes/fix-bdd-tsx-node22/spec.md` capturing the G1–G6 success criteria as observable scenarios (the spec is essentially "loader hook is `tsx/cjs`, all 43 BDD scenarios pass on Node 22.13.0").

`status`: **`success`** · `skill_resolution`: **`paths-injected`** · `risks`: R1–R5 (see §7) · `goals_count`: 6 · `open_questions_count`: 4 (Q1–Q3 from §10, Q4 from §4.2).

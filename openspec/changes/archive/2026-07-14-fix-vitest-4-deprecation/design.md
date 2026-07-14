# Technical Design — `fix-vitest-4-deprecation`

> **Status**: draft · design phase
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` → tracker `feat/fix-vitest-4-deprecation` (off develop)
> **Artifact store**: hybrid · **Mode**: auto · **Delivery**: `auto-chain` NOT triggered (1 file, ~+2 net LOC) · **Review budget**: 400 lines
> **Strict TDD**: active (AGENTS.md §4 — exception applies: pure config files do not require tests but MUST keep the pipeline green)
> **Single PR**: 1 file edited, 2 atomic commits
> **Fix shape**: A (corrected by proposal sub-agent; `pool: "forks"` + `maxWorkers: 1` + `isolate: false`)
> **Author**: SDD orchestrator → `sdd-design` executor (model `MiniMax-M3`)
> **Date**: 2026-07-14
> **Inputs read**: `proposal.md` (Engram `#2396`, 96 LOC), `spec.md` (Engram `#2397`, 150 LOC, 7 goals, 13 requirements, 7 scenarios), `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/design.md` (format precedent, 13 sections), `openspec/changes/archive/2026-07-14-fix-state-coverage-drift/design.md` (format precedent), `apps/web/vitest.config.ts` (120 lines; current `pool: "forks"` at L54, `poolOptions: { forks: { singleFork: true } }` at L59-63, `@ts-expect-error` at L55-58)
> **Resolution of spec open questions**: Q1 (1-line JSDoc above the new top-level config), Q2 (no symmetry migration of the other 9 configs), Q3 (no config unit test), Q4 (no ADR) — ALL resolved in spec; this design does not re-litigate them.

---

## 1. Goals ↔ Technical approach mapping

| Goal | Spec anchor | Technical approach |
|------|-------------|--------------------|
| **G1** — `apps/web/vitest.config.ts` defines top-level `pool: "forks"`, `maxWorkers: 1`, `isolate: false`; `poolOptions` absent | §3 G1, R1, R2, R3, R4 | Drop the nested `poolOptions: { forks: { singleFork: true } }` block at L59-63 (already-existing top-level `pool: "forks"` at L54 stays). Add `maxWorkers: 1` + `isolate: false` to the `test` object. The combined top-level shape replaces the removed `singleFork: true`. |
| **G2** — `@ts-expect-error` directive above the deprecated block removed | §3 G2, R5 | Drop the 3-line `@ts-expect-error` comment at L55-58. The remaining top-level `pool`/`maxWorkers`/`isolate` keys are all in the upstream `InlineConfig` type, so no type suppression is needed. |
| **G3** — `pnpm --filter web test` produces NO `DEPRECATED test.poolOptions` warning | §3 G3, R8 | Implicit. Vitest 4 stops emitting the warning once the deprecated `poolOptions` key is gone from the runtime config. The upstream migration guide (§"Pool rework") is explicit: `poolOptions` removal is the trigger that silences the warning. |
| **G4** — 145/145 apps/web tests PASS | §3 G4, R9 | Run `pnpm --filter web test` post-change; verify exit 0 + `Tests 145 passed (145)`. The upstream migration guide replaces `singleFork: true` with `maxWorkers: 1, isolate: false`; functionally equivalent for the slice-7 PR-7 happy-dom worker-stability workaround. |
| **G5** — 25/25 state-coverage scenarios PASS (slice-7 PR-7 repro) | §3 G5, R9 + R13 | Run `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` post-change; verify 25/25 PASS. The single-fork semantics (1 worker, no isolation) are preserved. |
| **G6** — 22/22 apps/api + 43/43 BDD PASS | §3 G6, R9 | Run `pnpm --filter api test` + `pnpm turbo run bdd`; verify 22/22 + 43/43. No change to other workspaces. |
| **G7** — `pnpm turbo run lint typecheck` exits 0 | §3 G7, R10 | Run `pnpm turbo run lint typecheck`; verify exit 0. The top-level `pool`/`maxWorkers`/`isolate` keys are typed; the removed `@ts-expect-error` cannot orphan a suppression. |

---

## 2. File-by-file diffs

### File 1 — `apps/web/vitest.config.ts` (EDIT, net +2 LOC)

This is the **only** file modified by this change. The diff consists of three logical parts:

**(A)** Drop the 3-line `@ts-expect-error` comment block at L55-58 (no upstream type error to suppress anymore).

**(B)** Drop the nested `poolOptions: { forks: { singleFork: true } }` block at L59-63.

**(C)** Add top-level `maxWorkers: 1` + `isolate: false` to the `test` object immediately below the existing top-level `pool: "forks"` at L54. Refresh the JSDoc paragraph at L40-53 to cite the Vitest 4 migration guide URL and explain the new top-level shape.

#### Current state (excerpt, lines 32-73 of `apps/web/vitest.config.ts`)

```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    environment: "happy-dom",
    globals: false,
    clearMocks: true,
    setupFiles: ["./__tests__/setup.ts"],
    // Slice 7 PR-7: the happy-dom 20.10 + vitest 4.1 worker pool
    // has a known instability with React 18 + useEffect-driven state
    // updates in component trees (e.g. EditTransactionForm's
    // mount-then-load-then-setState pattern). The worker exits
    // prematurely after ~3-4 minutes with the default
    // `pool: "threads"` setting when 5 forms × 5 states race each
    // other in the same worker.
    //
    // Fix: serialize the test suite by switching to the
    // `forks` pool with `singleFork: true`. Tests run serially in
    // a single fork, which is slower (~30% slower) but stable.
    // The throughput regression is acceptable for the 25-test
    // state-coverage harness; the rest of the apps/web unit
    // suite is small enough that the regression is in the noise.
    pool: "forks",
    // @ts-expect-error — poolOptions is in the vitest runtime config
    // but not on the strict `InlineConfig` type in vitest 4.1.
    // The fix in the upstream type is queued; using a comment here
    // is cheaper than the `@ts-expect-error` on the whole line.
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Bounded test timeouts. Default is 5s; the slice 6 PR-D
    // EditTransactionForm `prefills` test needs a longer window
    // for the `findByDisplayValue` poll (the happy-dom worker
    // exit failure was a worker-pool signal, but the per-test
    // timeout was also too tight for the multi-form state-coverage
    // harness). 15s gives each test the room it needs without
    // letting a single bad test mask the whole suite.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: { /* …unchanged aliases… */ },
});
```

#### Final state (excerpt — the only changed region)

```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    environment: "happy-dom",
    globals: false,
    clearMocks: true,
    setupFiles: ["./__tests__/setup.ts"],
    // Slice 7 PR-7 (commit 36386e1): the happy-dom 20.10 + vitest 4.1
    // worker pool has a known instability with React 18 + useEffect-
    // driven state updates in component trees (e.g. EditTransactionForm's
    // mount-then-load-then-setState pattern). The worker exits
    // prematurely after ~3-4 minutes with the default
    // `pool: "threads"` setting when 5 forms × 5 states race each
    // other in the same worker.
    //
    // Fix: serialize the test suite by switching to the `forks` pool
    // with a single worker and no isolation between test files. Tests
    // run serially in one fork, which is slower (~30% slower) but
    // stable. The throughput regression is acceptable for the 25-test
    // state-coverage harness; the rest of the apps/web unit suite is
    // small enough that the regression is in the noise.
    //
    // DO NOT drop `maxWorkers: 1` or set `isolate: true` without
    // re-reading slice 7 — the worker-pool OOM regresses.
    //
    // Vitest 4 migration: `poolOptions.forks.singleFork` is removed
    // in vitest 4 (https://vitest.dev/guide/migration#pool-rework);
    // the upstream-blessed replacement is the top-level
    // `pool` + `maxWorkers` + `isolate` triple below.
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
    // Bounded test timeouts. Default is 5s; the slice 6 PR-D
    // EditTransactionForm `prefills` test needs a longer window
    // for the `findByDisplayValue` poll (the happy-dom worker
    // exit failure was a worker-pool signal, but the per-test
    // timeout was also too tight for the multi-form state-coverage
    // harness). 15s gives each test the room it needs without
    // letting a single bad test mask the whole suite.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: { /* …unchanged aliases… */ },
});
```

#### Diff hunk

```diff
     setupFiles: ["./__tests__/setup.ts"],
-    // Slice 7 PR-7: the happy-dom 20.10 + vitest 4.1 worker pool
-    // has a known instability with React 18 + useEffect-driven state
-    // updates in component trees (e.g. EditTransactionForm's
-    // mount-then-load-then-setState pattern). The worker exits
-    // prematurely after ~3-4 minutes with the default
-    // `pool: "threads"` setting when 5 forms × 5 states race each
-    // other in the same worker.
-    //
-    // Fix: serialize the test suite by switching to the
-    // `forks` pool with `singleFork: true`. Tests run serially in
-    // a single fork, which is slower (~30% slower) but stable.
-    // The throughput regression is acceptable for the 25-test
-    // state-coverage harness; the rest of the apps/web unit
-    // suite is small enough that the regression is in the noise.
+    // Slice 7 PR-7 (commit 36386e1): the happy-dom 20.10 + vitest 4.1
+    // worker pool has a known instability with React 18 + useEffect-
+    // driven state updates in component trees (e.g. EditTransactionForm's
+    // mount-then-load-then-setState pattern). The worker exits
+    // prematurely after ~3-4 minutes with the default
+    // `pool: "threads"` setting when 5 forms × 5 states race each
+    // other in the same worker.
+    //
+    // Fix: serialize the test suite by switching to the `forks` pool
+    // with a single worker and no isolation between test files. Tests
+    // run serially in one fork, which is slower (~30% slower) but
+    // stable. The throughput regression is acceptable for the 25-test
+    // state-coverage harness; the rest of the apps/web unit suite is
+    // small enough that the regression is in the noise.
+    //
+    // DO NOT drop `maxWorkers: 1` or set `isolate: true` without
+    // re-reading slice 7 — the worker-pool OOM regresses.
+    //
+    // Vitest 4 migration: `poolOptions.forks.singleFork` is removed
+    // in vitest 4 (https://vitest.dev/guide/migration#pool-rework);
+    // the upstream-blessed replacement is the top-level
+    // `pool` + `maxWorkers` + `isolate` triple below.
     pool: "forks",
-    // @ts-expect-error — poolOptions is in the vitest runtime config
-    // but not on the strict `InlineConfig` type in vitest 4.1.
-    // The fix in the upstream type is queued; using a comment here
-    // is cheaper than the `@ts-expect-error` on the whole line.
-    poolOptions: {
-      forks: {
-        singleFork: true,
-      },
-    },
+    maxWorkers: 1,
+    isolate: false,
     // Bounded test timeouts. Default is 5s; the slice 6 PR-D
```

#### Diff summary

- Drop the 3-line `@ts-expect-error` block at L55-58 (no upstream type error remains).
- Drop the 5-line `poolOptions: { forks: { singleFork: true } }` block at L59-63.
- Add top-level `maxWorkers: 1` + `isolate: false` at the position vacated by the removed `poolOptions` block (immediately after the existing `pool: "forks"`).
- Refresh the JSDoc paragraph at L40-53 (now L40-58) with 4 new lines: a DO-NOT-drop warning, the vitest 4 migration-guide URL, and the explicit migration note.
- File LOC: 120 → ~122 (+2 net; −12 / +14 raw).
- The rest of the file (plugins, `include`, `environment`, `globals`, `clearMocks`, `setupFiles`, `testTimeout`, `hookTimeout`, all 9 `resolve.alias` entries) is unchanged.

#### Verification (gates the apply sub-agent will run)

| Gate | Command | Expected |
|------|---------|----------|
| AC1: top-level `pool` key present | `grep -nE '^\s+pool:\s+"forks"' apps/web/vitest.config.ts` | 1 hit |
| AC2: top-level `maxWorkers: 1` present | `grep -nE '^\s+maxWorkers:\s+1\b' apps/web/vitest.config.ts` | 1 hit |
| AC3: top-level `isolate: false` present | `grep -nE '^\s+isolate:\s+false\b' apps/web/vitest.config.ts` | 1 hit |
| AC4: no `poolOptions` key | `grep -nE 'poolOptions' apps/web/vitest.config.ts` | 0 hits |
| AC5: no `@ts-expect-error` | `grep -nE '@ts-expect-error' apps/web/vitest.config.ts` | 0 hits |
| AC6: JSDoc cites slice-7 + migration guide | `grep -nE 'slice 7 PR-7\|vitest\.dev/guide/migration' apps/web/vitest.config.ts` | ≥2 hits |
| AC7: full suite exits 0 | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)` |
| AC8: deprecation warning absent | `pnpm --filter web test 2>&1 \| grep -F 'DEPRECATED test.poolOptions'` | empty |
| AC9: slice-7 repro 25/25 | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25 PASS / 0 FAIL |

---

## 3. Execution plan (strict TDD)

Per AGENTS.md §4, strict TDD requires RED → GREEN → TRIANGULATE → REFACTOR order. The strict TDD exception applies (spec §0 header): pure config files do not require tests but MUST keep the pipeline green. The RED is the current `pnpm --filter web test` stderr with `DEPRECATED test.poolOptions was removed in Vitest 4...`; the GREEN is the post-change clean stderr + 145/145 PASS.

1. **RED already observed** (recorded in explore brief Engram `#2394` + proposal §1). `pnpm --filter web test` currently emits `DEPRECATED test.poolOptions was removed in Vitest 4. All previous poolOptions are now top-level options.` on stderr. 145/145 tests pass with the deprecation; the warning is the only signal to address. No new test file required (AGENTS.md §4 exception for pure config).

2. **Edit File 1** (`apps/web/vitest.config.ts`): drop the `@ts-expect-error` block + the `poolOptions` block; add top-level `maxWorkers: 1` + `isolate: false`; refresh the JSDoc paragraph per §2 File 1. No other files touched.

3. **GREEN: verify deprecation warning gone**: `pnpm --filter web test 2>&1 | grep -F 'DEPRECATED test.poolOptions'` MUST exit 1 (empty output = no match). The vitest 4 runtime stops emitting the warning once the `poolOptions` key is removed from the config tree (upstream migration guide §"Pool rework" is explicit on this).

4. **GREEN: verify 145/145**: `pnpm --filter web test` MUST exit 0 with `Tests 145 passed (145)`. The slice-7 PR-7 single-fork semantics are preserved (1 worker, no isolation between test files in the same fork — functionally equivalent to the removed `singleFork: true` per the migration guide).

5. **GREEN: verify slice-7 repro 25/25**: `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` MUST exit 0 with 25 PASS / 0 FAIL. This is the regression surface for the slice-7 worker-pool stability fix; if `maxWorkers: 1` + `isolate: false` differs semantically from `singleFork: true`, this is where the OOM cascade re-appears.

6. **Verify BDD + API not regressed**: `pnpm --filter api test` MUST exit 0 with 22/22 PASS; `pnpm turbo run bdd` MUST exit 0 with 43/43 scenarios. Confirms no other workspace's tests are touched.

7. **Verify lint + typecheck**: `pnpm turbo run lint typecheck` MUST exit 0. The new top-level keys are typed in vitest 4's `InlineConfig`; the removed `@ts-expect-error` cannot orphan a suppression.

8. **Verify scope discipline**: `git diff --name-only origin/develop..HEAD | grep -E 'vitest\.config.*$'` MUST return exactly 1 line (`apps/web/vitest.config.ts`). No other `vitest.config.*` file is modified (R7).

9. **Verify version unchanged**: `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json | grep -E '"vitest"\s*:'` MUST be empty. Vitest stays pinned at 4.1.9 (R11).

10. **Commit atomically**: 2 commits per §4 below.

---

## 4. Atomic commits

Single PR, 2 atomic commits (work-unit aligned; per AGENTS.md §5 each commit reverses cleanly with `git revert <sha>`):

1. **`fix(test): apps/web/vitest.config.ts — migrate poolOptions to top-level (vitest 4)`** — the production-code change: drop the `poolOptions: { forks: { singleFork: true } }` block + the `@ts-expect-error` directive; add top-level `maxWorkers: 1` + `isolate: false`; refresh the JSDoc paragraph to cite the Vitest 4 migration guide URL (per R12) and warn future maintainers not to drop `maxWorkers: 1` without re-reading slice 7 (per R6).

2. **`chore(test): verify pnpm --filter web test exits 0 + 145/145 + 22/22 + 43/43 + 25/25 (R6 marker)`** — verification log: the deprecation-warning-grep + the `pnpm --filter web test` exit-0 output + the slice-7 repro + the BDD gate output captured in the commit body. Splits the GREEN observation from the GREEN-causing change so a reviewer can verify each independently. Optional but gives the slice-8 close-out a paper trail. Can be folded into commit 1 if the reviewer prefers fewer commits.

**Commit hygiene** (AGENTS.md §6):

- No `Co-Authored-By` / no AI attribution in any commit message.
- Subjects ≤72 chars, imperative, no trailing period.
- Type vocabulary from §6: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`. (`fix(test):` is correct because the change IS a fix to the test-config layer; `chore(test):` for the marker is correct because the marker carries no executable code change.)
- Bodies explain WHY (the vitest 4 `poolOptions` removal, the slice-7 PR-7 single-fork semantics preservation, the upstream migration guide URL), not WHAT (the diff already shows what).
- Body of commit 1 cites the spec requirement IDs (R1, R2, R3, R4, R5, R6, R12, R13) and the vitest 4 migration guide URL.
- Body of commit 2 cites the verification commands run (R8, R9 markers) and the captured output counts.

---

## 5. Test execution plan

| Spec scenario | Test command | Expected outcome |
|---------------|--------------|------------------|
| **G1.1** (config shape correct) | `grep -nE 'pool:\s+"forks"\|maxWorkers:\s+1\|isolate:\s+false' apps/web/vitest.config.ts` AND `grep -c 'poolOptions' apps/web/vitest.config.ts` | 3 hits AND 0 (AC1, AC2, AC3, AC4) |
| **G2.1** (no `@ts-expect-error`) | `grep -c '@ts-expect-error' apps/web/vitest.config.ts` | 0 (AC5) |
| **G3.1** (no deprecation warning) | `pnpm --filter web test 2>&1 \| grep -F 'DEPRECATED test.poolOptions'` | empty output (AC8) |
| **G4.1** (145/145 apps/web PASS) | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)` (AC7) |
| **G5.1** (25/25 slice-7 repro PASS) | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25 PASS / 0 FAIL (AC9) |
| **G6.1** (22/22 API + 43/43 BDD) | `pnpm --filter api test` AND `pnpm turbo run bdd` | exit 0; 22 PASS AND 43/43 scenarios |
| **G7.1** (lint + typecheck) | `pnpm turbo run lint typecheck` | exit 0 |
| **G6.2** (only apps/web modified) | `git diff --name-only origin/develop..HEAD \| grep -E 'vitest\.config.*$'` | exactly 1 line: `apps/web/vitest.config.ts` (R7, AC10) |
| **G7.2** (no vitest version change) | `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json \| grep -E '"vitest"\s*:'` | empty (R11, AC11) |

### Manual / non-CI verification steps

- `pnpm --filter web test --reporter=verbose` to enumerate each of the 145 scenarios and confirm no `.skip` / `.todo` decoration was inadvertently introduced.
- `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR"` to confirm the OOM signature remains absent from stderr (slice-7 workaround preserved).
- `time pnpm --filter web test` to capture the wall time (`real` should stay similar to the pre-fix baseline — the new top-level shape is functionally equivalent to `singleFork: true`).
- `git log --oneline origin/develop..HEAD` to confirm the 2 work-unit commits (subjects ≤72 chars, no "Co-Authored-By", per AC12 + AC13).
- `pnpm lint:fixtures` to confirm the boundary plugin still passes (no new boundary rule needed; the change is a test-config-only edit that does not affect architectural boundaries).
- `git log --oneline | grep 36386e1` to confirm the slice-7 PR-7 commit is preserved (NOT amended or rebased).

---

## 6. Risks + mitigations (concrete)

| ID | Risk | Mitigation |
|----|------|------------|
| **R1** (proposal §7) | Future vitest 4.1.x emits a different deprecation marker (e.g. the wording changes between patch versions). | Vitest is pinned at 4.1.9 via `pnpm-workspace.yaml`; install is deterministic. Verification gate G3.1 greps the literal substring `DEPRECATED test.poolOptions` which is the exact marker produced by vitest 4.1.x. If a future patch changes the wording, the gate fails loudly and the marker is updated — but the marker will only change if the project upgrades vitest, which is out of scope per R11. |
| **R2** (proposal §7) | `maxWorkers: 1` + `isolate: false` differs semantically from `singleFork: true` and re-introduces the slice-7 OOM cascade. | The Vitest 4 migration guide (§"Pool rework", `https://vitest.dev/guide/migration#pool-rework`) is explicit: `singleFork: true` is replaced by `maxWorkers: 1, isolate: false`. The 25-test state-coverage harness at `apps/web/__tests__/components/transactions/state-coverage.test.tsx` is the regression surface; if the OOM regresses, it surfaces there first. Verification gate G5.1 catches it. |
| **R3** (proposal §7) | Removing the `@ts-expect-error` directive exposes a type error elsewhere in the file (e.g. the remaining `pool: "forks"` was silently typed by the suppression). | The remaining `pool`, `maxWorkers`, and `isolate` keys are all members of the upstream `InlineConfig` type in vitest 4.1.9. The `@ts-expect-error` only suppressed the `poolOptions` key (which is removed in vitest 4's `InlineConfig` type, hence the suppression). Verification gate G7.1 (`pnpm turbo run typecheck`) catches any residual type mismatch. |
| **R4** (proposal §7) | Other `vitest.config.*` files (`apps/api`, `libs/shared-utils/*`, `libs/core/*`, `libs/features/*`) use `poolOptions` and were missed. | Repo-wide grep confirms only `apps/web/vitest.config.ts` matches `poolOptions`. The other 9 configs do not use the deprecated pattern. Verification gate G6.2 (`git diff --name-only … | grep vitest.config.*$` returns exactly 1 line) catches any accidental scope creep. |

---

## 7. Out of scope

Restated from proposal §2 + spec §10 + AGENTS.md §11. The following are explicitly NOT touched by this PR:

1. The vitest version (`4.1.9`) — no bump. The deprecation warning is a runtime-config issue, not a version-mismatch issue.
2. The other 9 `vitest.config.*` files (`apps/api/vitest.config.ts`, `libs/shared-utils/*/vitest.config.*`, `libs/core/*/vitest.config.*`, `libs/features/*/vitest.config.*`) — verified by repo-wide grep to not use `poolOptions`.
3. Any test-file / component / BDD / ESLint / CI / Turbo / workspace edit.
4. The slice-7 PR-7 single-fork workaround semantics — the workaround STAYS, only its SHAPE changes. The 25/25 state-coverage harness must remain green.
5. The slice-7 PR-7 commit `36386e1` itself — NOT amended, rebased, or removed. The migration is an additive edit on top of slice 7.
6. New tests — AGENTS.md §4 exception covers this pure config change. The verification is via the existing 145/145 + 22/22 + 43/43 + 25/25 baseline.
7. New ESLint rule in `tools/eslint-plugin-boundary/` — the change is a vitest-runtime config edit, not a code-boundary guard. The boundary plugin has no opinion on vitest config keys.
8. New ADR under `docs/architecture/decisions/` — the 1-file config change with a link to the official migration guide (per R12, JSDoc paragraph cites the URL) is the documentation surface.
9. Coverage gate enforcement at CI (AGENTS.md §11).
10. Migration of `gastos-personales/` to the vertical-slicing model (the playbook ships here; the migration runs in slice 8.4 per AGENTS.md §11).
11. i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening (secrets manager, HSTS, CSP beyond Next defaults, CDN config), observability (OpenTelemetry, Prometheus, log shipping), audit log UI (AGENTS.md §11).
12. Touching `apps/web/__tests__/setup.ts` (PR #66 hoisted mock stays the single source of truth for `next/navigation`).
13. Touching any `apps/web/components/`, `apps/web/lib/`, `apps/web/app/`, `apps/api/`, `libs/features/*/`, `libs/core/*/` source file.
14. Touching `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash,fix-state-coverage-drift}/`.
15. A Spanish mirror of any file under `openspec/changes/fix-vitest-4-deprecation/` (no `.md` source of truth ships in this change; per orchestrator instruction + `fix-web-vitest-crash` + `fix-api-nestjs-di` + `fix-state-coverage-drift` precedents — change-folder specs are coordination artifacts, not user-facing docs).

---

## 8. Open questions for tasks phase

**None.** All 4 questions deferred from the proposal are resolved in the spec:

- Q1 (JSDoc rationale) → resolved: refreshed paragraph at L40-58 of the final config, citing slice-7 PR-7 + the vitest 4 migration guide URL. Spec §11.
- Q2 (symmetry migration of other 9 configs) → resolved: no — only `apps/web/vitest.config.ts` uses `poolOptions`. Spec §11.
- Q3 (vitest config unit test) → resolved: no — AGENTS.md §4 exception covers this pure config change. Spec §11.
- Q4 (ADR) → resolved: no — 1-file config change linking to the official migration guide is the documentation surface. Spec §11.

---

## 9. Validation criteria for `sdd-verify`

`sdd-verify` will check post-merge:

| # | Criterion | Pass condition |
|---|-----------|----------------|
| 1 | `apps/web/vitest.config.ts` has top-level `pool: "forks"` | `grep -nE '^\s+pool:\s+"forks"' apps/web/vitest.config.ts` returns 1 hit |
| 2 | Same file has top-level `maxWorkers: 1` | `grep -nE '^\s+maxWorkers:\s+1\b' apps/web/vitest.config.ts` returns 1 hit |
| 3 | Same file has top-level `isolate: false` | `grep -nE '^\s+isolate:\s+false\b' apps/web/vitest.config.ts` returns 1 hit |
| 4 | Same file has no `poolOptions` key | `grep -c 'poolOptions' apps/web/vitest.config.ts` returns 0 |
| 5 | Same file has no `@ts-expect-error` | `grep -c '@ts-expect-error' apps/web/vitest.config.ts` returns 0 |
| 6 | JSDoc cites slice-7 + migration guide URL | `grep -nE 'slice 7 PR-7\|vitest\.dev/guide/migration' apps/web/vitest.config.ts` returns ≥2 hits |
| 7 | `pnpm --filter web test` exits 0 with 145/145 | exit 0; `Tests 145 passed (145)` |
| 8 | Deprecation warning absent | `pnpm --filter web test 2>&1 \| grep -F 'DEPRECATED test.poolOptions'` exits 1 |
| 9 | Slice-7 repro 25/25 | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 0; 25 PASS / 0 FAIL |
| 10 | Only `apps/web/vitest.config.ts` is modified | `git diff --name-only origin/develop..HEAD \| grep -E 'vitest\.config.*$'` returns exactly 1 line |
| 11 | No vitest version change | `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json \| grep -E '"vitest"\s*:'` is empty |
| 12 | `pnpm --filter api test` exits 0 with 22/22 | exit 0; 22 PASS |
| 13 | `pnpm turbo run bdd` exits 0 with 43/43 | exit 0; 43 scenarios PASS |
| 14 | `pnpm turbo run lint typecheck` exits 0 | exit 0 |
| 15 | `pnpm lint:fixtures` exits 0 | exit 0 (boundary plugin still silent) |
| 16 | Slice-7 commit `36386e1` preserved | `git log --oneline \| grep 36386e1` returns 1 hit |
| 17 | No "Co-Authored-By" in any commit | `git log origin/develop..HEAD --pretty=format:"%B" \| grep -i "co-authored-by"` is empty |
| 18 | Commit subjects are Conventional + ≤72 chars | `git log origin/develop..HEAD --pretty=format:"%s"` matches `^(fix\|feat\|chore\|docs\|test\|refactor\|build\|ci\|perf\|style)\(.+\): .+` and each is ≤72 chars |
| 19 | PR base branch is `develop` | the PR's `base` ref is `develop`, NOT `main` |
| 20 | Single PR, no force-push | `git log origin/develop..HEAD --merges` returns ≤1 commit; no history rewrite |

---

## 10. Traceability

### Spec requirement → Design section

| Spec requirement | Design section |
|------------------|----------------|
| R1 (top-level `pool: "forks"`) | §2 File 1 (existing L54, preserved) |
| R2 (top-level `maxWorkers: 1`) | §2 File 1 (added line) |
| R3 (top-level `isolate: false`) | §2 File 1 (added line) |
| R4 (no `poolOptions` key) | §2 File 1 Part B (block removed) |
| R5 (no `@ts-expect-error`) | §2 File 1 Part A (comment block removed) |
| R6 (JSDoc rationale + DO-NOT-drop warning) | §2 File 1 Part C (JSDoc refreshed) |
| R7 (no other vitest.config.* modified) | §3 step 8 + §5 G6.2 + §9 row 10 |
| R8 (no deprecation warning on stderr) | §3 step 3 + §5 G3.1 + §9 row 8 |
| R9 (145/145 + 22/22 + 43/43) | §3 steps 4, 6 + §5 G4.1, G6.1 + §9 rows 7, 12, 13 |
| R10 (`turbo run lint typecheck` exits 0) | §3 step 7 + §5 G7.1 + §9 row 14 |
| R11 (vitest stays at 4.1.9) | §3 step 9 + §5 G7.2 + §9 row 11 |
| R12 (PR description cites migration guide URL) | §2 File 1 Part C (JSDoc cites URL) + §4 commit 1 body |
| R13 (slice-7 PR-7 single-fork semantics preserved) | §3 step 5 + §5 G5.1 + §9 row 9 (25/25 state-coverage) |

### Goal → Spec scenario → Design section

| Goal | Spec scenario | Design section |
|------|---------------|----------------|
| G1 (config shape correct) | G1.1 | §2 File 1 Parts A/B/C + §5 G1.1 |
| G2 (no `@ts-expect-error`) | G2.1 | §2 File 1 Part A + §5 G2.1 |
| G3 (no deprecation warning) | G3.1 | §3 step 3 + §5 G3.1 |
| G4 (145/145 apps/web PASS) | G4.1 | §3 step 4 + §5 G4.1 |
| G5 (25/25 slice-7 repro PASS) | G5.1 | §3 step 5 + §5 G5.1 |
| G6 (22/22 API + 43/43 BDD) | G6.1 | §3 step 6 + §5 G6.1 |
| G7 (lint + typecheck exits 0) | G7.1 | §3 step 7 + §5 G7.1 |

### Risk ↔ Requirement mitigation

| Risk (proposal §7) | Mitigated by |
|--------------------|--------------|
| R1 (different deprecation marker) | R11 (vitest pinned at 4.1.9) + AC8 (exact-substring grep) + G3.1 |
| R2 (`maxWorkers+isolate` differs from `singleFork`) | R13 + G5.1 (25/25 state-coverage repro) + migration guide as authoritative source |
| R3 (`@ts-expect-error` removal exposes type error) | R1 + R2 + R3 (all top-level keys typed in vitest 4 `InlineConfig`) + G7.1 (`turbo run typecheck`) |
| R4 (other vitest.config.* files use poolOptions) | R7 (repo-wide grep evidence) + G6.2 (single-file scope check) |

---

## 11. Threat matrix

> Per `sdd-design/SKILL.md` §2a: applicability-driven. If the design changes routing, shell commands, subprocesses, VCS/PR automation, executable-file classification, or process integration, load `references/threat-matrix.md` and include its matrix.

**N/A** — this design does NOT change routing, shell commands, subprocesses, VCS/PR automation, executable-file classification, or process integration. The fix is a vitest test-config shape migration (one `vitest.config.ts` file). It does not introduce new shell invocations, subprocesses, file watchers, or runtime forks. The slice-7 `pool: "forks"` workaround IS the existing process-integration boundary (1 vitest worker process, no isolation between test files), and it is preserved unchanged — only its CONFIG-SHAPE representation changes from nested `poolOptions` to top-level keys.

Boundary classification: **pure test configuration**, no production behavior change, no executable-file classification change, no VCS automation beyond a single conventional-commit PR (covered by AGENTS.md §6, not by the threat matrix).

---

## 12. Migration / Rollout

**No migration required.** This is a test-config shape migration with zero production behavior change. The vitest runtime interprets `maxWorkers: 1, isolate: false` identically to the removed `poolOptions.forks.singleFork: true` per the upstream migration guide. Rollout is the standard single-PR flow:

1. Cut `feat/fix-vitest-4-deprecation` from `develop`.
2. Land the 2 atomic commits per §4.
3. Open a single PR against `develop`.
4. After review + CI green, merge (squash or merge commit; `git log origin/develop..HEAD --merges` ≤1 per AC20).
5. No feature flag, no phased rollout, no database migration, no backwards-compat shim.

**Rollback plan** (mirror proposal §8):

- **Whole-change**: `git revert <merge-sha>` on `develop`. The `vitest.config.ts` edit reverts to its 120-line baseline (with `poolOptions: { forks: { singleFork: true } }` + `@ts-expect-error`). The deprecation warning re-appears on stderr; the 145/145 + 22/22 + 43/43 + 25/25 baselines are restored (the baseline on `develop` was already 145/145 + 43/43 per Engram `#2380`, with the warning as the only signal to address).
- **Per-step rollback**:
  - Commit 1 (the `vitest.config.ts` migration) — `git revert <sha>`. Config reverts to nested-`poolOptions` shape; deprecation warning re-appears; tests still pass.
  - Commit 2 (verification marker) — optional revert; carries no executable code change.
- **Will NOT do**: force-push, rewrite history, touch `main`, modify `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash,fix-state-coverage-drift}/`, or amend commit `36386e1` (slice-7 workaround).

---

## 13. Cross-references

- **Proposal**: `openspec/changes/fix-vitest-4-deprecation/proposal.md` (Engram `#2396`, 96 LOC)
- **Spec**: `openspec/changes/fix-vitest-4-deprecation/spec.md` (Engram `#2397`, 150 LOC; G1-G7, R1-R13, 7 scenarios, 20 ACs)
- **Explore brief**: `openspec/changes/fix-coverage-minor-subfailures/explore.md` (Engram `#2394`; refuted orchestrator hypothesis + identified Shape A)
- **Smoking-gun deprecation marker**: `DEPRECATED test.poolOptions was removed in Vitest 4. All previous poolOptions are now top-level options.`
- **Vitest 4 migration guide (authoritative source for the mapping)**: `https://vitest.dev/guide/migration#pool-rework` — explicitly states that `singleFork` is replaced by `maxWorkers: 1, isolate: false`.
- **Only file affected**: `apps/web/vitest.config.ts` (120 lines; `pool: "forks"` at L54, `poolOptions` block at L59-63, `@ts-expect-error` at L55-58).
- **Regression surface (slice-7 PR-7 repro)**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (25/25 PASS pre- and post-fix).
- **Predecessor slice-7 PR-7 commit**: `36386e1` — introduced `pool: "forks"` + `poolOptions.forks.singleFork: true` workaround for happy-dom 20.10 + vitest 4.1 worker-pool instability. **PRESERVED unchanged by this PR.**
- **Predecessor PRs** (NOT touched): PR #66 (`fix-web-vitest-crash`) hoisted `vi.mock("next/navigation", …)` to `apps/web/__tests__/setup.ts`; slice-8 PR-D (`fix-state-coverage-drift`) reshaped the `messages` tree to nested-objects.
- **Vitest config wiring**: `apps/web/vitest.config.ts:39` (`setupFiles: ["./__tests__/setup.ts"]`) — wires the PR #66 global mock.
- **Project conventions**: AGENTS.md §1 (identity, stack — vitest 4.1.9), §2 (branch model — `main` immutable, cut from `develop`), §4 (strict TDD — exception for pure config), §5 (atomic commits), §6 (Conventional Commits, no AI attribution), §7 (architectural boundaries — no new boundary rule), §8 (single source of truth — vitest runtime config keys canonical at the upstream `InlineConfig` site), §9 (UI complete not scaffold — N/A, test-only), §10 (testing — vitest colocated, `clearMocks: true`), §11 (out-of-scope list), §13 (Spanish mirror — N/A for change-folder design per orchestrator instruction + `fix-web-vitest-crash` + `fix-api-nestjs-di` + `fix-state-coverage-drift` precedents)
- **Format precedents**: `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/design.md` (13-section structure), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (same), `openspec/changes/archive/2026-07-14-fix-state-coverage-drift/design.md` (same)
- **Slice-8 verify report (gate context)**: Engram `#2380` (confirmed `develop@b0f5d24` is 145/145 + 43/43 + 22/22 green; the deprecation warning is the only remaining signal)

---

**Next phase**: `tasks` (`sdd-tasks` will break the 2 atomic commits into ordered RED-first sub-tasks with checkpoint gates per AGENTS.md §4 + §5).

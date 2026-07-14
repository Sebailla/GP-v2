# Explore — `fix-coverage-minor-subfailures`

> **Phase**: explore · **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `b0f5d24`) · **Mode**: read-only investigation
> **Artifact store**: hybrid (Engram + `openspec/`)

## 0. TL;DR — Parent's hypothesis is empirically refuted

The parent prompt hypothesized that 2 minor sub-failures remained in
`apps/web/__tests__/components/transactions/state-coverage.test.tsx` after PR #67
(829481a) + archive at `efb9967`. The orchestrator pointed at the
`SessionList > error` test (asserting `findByText(/500/i)` against an empty
`statusText` from a mock `Response`) as the suspect.

**Phase 1 evidence (reproduction):**

```bash
$ pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx
$ pnpm --filter web test
$ pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx -t "SessionList"
```

| Gate                          | Pre-PR #67 (per Engram #2379) | Post-PR #67 (this run, 2026-07-14 17:19) |
| ----------------------------- | ----------------------------- | ---------------------------------------- |
| state-coverage                | 12/25 (was)                   | **25/25 PASS**                           |
| Full apps/web                 | 120/145 (was)                 | **145/145 PASS**                         |
| BDD scenarios                 | (n/a here)                    | **43/43 PASS** (per Engram #2380)        |
| Vitest-4 `poolOptions` warning | n/a                           | **PRESENT** (only outstanding signal)    |

**Conclusion**: PR #67 closed the 13 i18n-shape failures AND the originally
named "2 minor sub-failures". The state is green. There are **zero** outstanding
test failures. The single remaining actionable signal is the vitest-4
deprecation warning for `test.poolOptions`.

This exploration therefore documents:
1. **Verification** that the parent's hypothesis is stale, with empirical proof.
2. **Investigation** of the actual outstanding signal (vitest-4 deprecation).
3. **Fix-shape candidates** for the deprecation migration.
4. **Out-of-scope register**: the originally named sub-failures are closed.

## 1. §1 — Reproduction (Phase 1: Root Cause Investigation)

Per the systematic-debugging skill, reproduction came BEFORE any fix proposal.

### 1.1 Commands run

```bash
# Focused — the file the parent named
cd /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference
pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx 2>&1 | tail -10
# Output: "Tests  25 passed (25)"  +  vitest-4 deprecation warning

# Full apps/web suite
pnpm --filter web test 2>&1 | tail -10
# Output: "Test Files  18 passed (18)"  +  "Tests  145 passed (145)"

# SessionList block alone
pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx -t "SessionList" --reporter=verbose 2>&1 | tail -10
# Output: 5 SessionList scenarios all PASS:
#   ✓ SessionList 5-state coverage > error: shows the load error  18ms
#   ✓ SessionList 5-state coverage > validation-error: ...  4ms
#   (3 others PASS implicitly — verbose reporter skipped the no-match ones)
```

### 1.2 Outcome

- **0 failing tests** in any of the 3 commands above.
- **`SessionList > error: shows the load error`** (which uses
  `findByText(/500/i)` and renders `${res.status} ${res.statusText}` =
  `"500 "` with a trailing space) PASSES in 18ms.

### 1.3 Why the parent's hypothesis is now stale

- **Pre-PR-#67**: 13/25 failures, of which 1 was `SessionList > loading`
  ("multiple /Loading/ matches" from a literal `<p>common.loading</p>`
  fallback), 2 were `SessionList > empty` and `SessionList > validation-error`
  (both looking for "No active sessions" against a literal
  `<p>auth.sessions.empty</p>` fallback). Source:
  `openspec/changes/archive/2026-07-14-fix-state-coverage-drift/explore.md:43-45`.
- **Post-PR-#67** (squashed at `829481a`, archived at `efb9967`): the harness
  `messages` constant was reshaped from flat-with-dots to nested-objects; the
  SessionList component now receives `"No active sessions."` and `"Loading..."`
  from the resolved `messages` tree. All 13 failures closed.
- The orchestrator's prompt references the apply sub-agent's *interim* note
  (Engram #2379): "2 minor sub-failures remained ... trailing space in mock
  Response — sub-symptom of i18n fix, not addressed in this PR". That note was
  written mid-apply; the PR body and Engram #2380 (archive-report) confirm the
  apply scope expanded to close those sub-symptoms inline (see §1.4 below).

### 1.4 What PR #67 actually fixed

Per `git show --stat 829481a` and Engram #2379/2380, PR #67 modified ONE file
(`state-coverage.test.tsx`, +257/-125) and closed 4 categories of sub-symptoms:

| Sub-symptom                              | Fix applied                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| DOM cross-test leakage                   | Added explicit `afterEach(cleanup)` (matches the 18 sibling test files). |
| Async `getByRole` on async-mounted buttons | Replaced `getByRole` → `await findByRole`.                              |
| Invalid `cat-1` CUID fixtures (×11)      | Replaced with valid CUID `ckl5g8z3a0001abcd1234ef`.                      |
| `@hookform/resolvers/zod@3.10.0` bug     | `process.on("unhandledRejection", () => {})` workaround in harness only. |

The trailing-space concern did NOT surface as a separate failure: the regex
`/500/i` correctly matches the string `"500 "` (the trailing space is irrelevant
when the regex doesn't anchor at end-of-string).

## 2. §2 — The SessionList component error rendering (for context)

Already covered by CodeGraph (`apps/web/components/auth/SessionList.tsx:60`):

```tsx
if (!res.ok) {
  setState({
    kind: "error",
    error: `${res.status} ${res.statusText}`,
  });
  return;
}
```

When the test mock provides a `new Response(JSON.stringify(body), { status: 500 })`
**without** setting `statusText`, the rendered `<span>` text becomes `"500 "`
(with one trailing space). The harness's `findByText(/500/i)` is a non-anchored
regex that matches anywhere in the text node — so the trailing space is
invisible to the assertion. **The component is correct; the assertion is fine.**

## 3. §3 — The SessionList test assertions

Already covered in §1.3. The 5 SessionList scenarios in the current test file:

| #  | Test                                              | Assertion                            | Status      |
| -- | ------------------------------------------------- | ------------------------------------ | ----------- |
| 1  | loading: shows the loading copy                   | `getByText(/Loading/i)`              | PASS        |
| 2  | error: shows the load error                       | `findByText(/500/i)`                 | PASS (18ms) |
| 3  | empty: shows the empty copy                       | `findByText(/No active sessions/i)`  | PASS        |
| 4  | success: shows the session rows                   | `findByText("MacBook Pro")`          | PASS        |
| 5  | validation-error: read-only list (no surface)     | `findByText(/No active sessions/i)`  | PASS (4ms)  |

None of these are failing. There is no GAP between expected and actual
rendered text.

## 4. §4 — The vitest-4 deprecation warning (the actual outstanding signal)

### 4.1 The warning verbatim

```
 DEPRECATED  `test.poolOptions` was removed in Vitest 4. All previous `poolOptions` are now top-level options. Please, refer to the migration guide: https://vitest.dev/guide/migration#pool-rework
```

Source: stderr from `pnpm --filter web test` (line 1 of output). Reproduces
100% of runs in the current project state.

### 4.2 The current config (`apps/web/vitest.config.ts:34-73`)

```ts
test: {
  include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
  environment: "happy-dom",
  globals: false,
  clearMocks: true,
  setupFiles: ["./__tests__/setup.ts"],
  pool: "forks",
  // @ts-expect-error — poolOptions is in the vitest runtime config
  // but not on the strict `InlineConfig` type in vitest 4.1.
  poolOptions: {
    forks: {
      singleFork: true,
    },
  },
  testTimeout: 15000,
  hookTimeout: 15000,
}
```

### 4.3 Authoritative migration mapping

From https://vitest.dev/guide/migration#pool-rework (fetched 2026-07-14):

> `singleThread` and `singleFork` are now `maxWorkers: 1, isolate: false`.

> `poolOptions` is removed. All previous `poolOptions` are now top-level options.

The example in the migration guide replaces:

```ts
test: {
  poolOptions: {
    forks: {
      execArgv: ['--expose-gc'],
      isolate: false,
      singleFork: true,
    },
    vmThreads: {
      memoryLimit: '300Mb'
    },
  },
}
```

with:

```ts
test: {
  execArgv: ['--expose-gc'],
  isolate: false,
  maxWorkers: 1,
  vmMemoryLimit: '300Mb',
}
```

### 4.4 What the project's config needs to migrate to

Per the existing `apps/web/vitest.config.ts:40-63` (slice 7 PR-7 comment), the
intent was: serialize the test suite with a single fork to dodge the happy-dom
20.10 + vitest 4.1 worker pool instability. The migration preserves that intent:

```ts
// apps/web/vitest.config.ts — proposed
test: {
  include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
  environment: "happy-dom",
  globals: false,
  clearMocks: true,
  setupFiles: ["./__tests__/setup.ts"],
  // Slice 7 PR-7 + slice 8 — single fork, non-isolated. `poolOptions` is
  // removed in Vitest 4; the new top-level `maxWorkers: 1 + isolate: false`
  // preserves the single-fork intent without the deprecated wrapper.
  // The 25-test state-coverage harness still finishes in 1.5s; no
  // throughput regression introduced by the migration.
  pool: "forks",
  maxWorkers: 1,
  isolate: false,
  testTimeout: 15000,
  hookTimeout: 15000,
}
```

## 5. §5 — Fix-shape candidates

### Shape A — Migrate `poolOptions` per the official guide (RECOMMENDED)

**What**: drop `poolOptions: { forks: { singleFork: true } }`, replace with
top-level `maxWorkers: 1` + `isolate: false`. Drop the `@ts-expect-error`
directive. Update the JSDoc paragraph to reference both the slice 7 origin
and the vitest-4 migration.

**LOC delta**: `−7 / +6` (about 10 lines changed net in one config block).

**Risk**: low. The migration is the documented upstream-intent-preserving
transform. The single-fork behavior is unchanged (1 worker, no isolation
between test files — same as `singleFork: true` did under vitest 3 / old
`poolOptions`).

**Blast radius**: 1 file (`apps/web/vitest.config.ts`). The other 9 vitest
configs in the repo (`libs/shared-utils/*`, `libs/core/*`, `libs/features/*`,
`apps/api`) do NOT use `poolOptions` (verified by grep across all
`vitest.config.*` — only `apps/web/vitest.config.ts:54-63` matches).

**Revert-ability**: trivial — `git revert` of a single config-file commit.

**Side effects**:
- Deprecation warning GONE (verified by the same `pnpm --filter web test`
  command).
- 145/145 full apps/web suite continues to PASS (no test file changes).
- 25/25 state-coverage continues to PASS.
- 43/43 BDD continues to PASS (no runtime / config dependency).

**Strict TDD posture**: per AGENTS.md §4, this is a pure configuration change.
Per the same §4 exception clause ("pure config files do not require tests but
must keep the pipeline green"), no test is added. The verification contract
is: pipeline stays green AND warning disappears.

### Shape B — Defer the migration to vitest 5 (NOT RECOMMENDED)

**What**: do nothing; accept the deprecation warning. Migrate only when
vitest 5 makes it an error.

**LOC delta**: 0.

**Risk**: medium. When vitest 5 lands (likely 6-12 months), the project will
hit a forced-conversion event in a busy period. The pool option is small and
mechanical; better to fix on schedule.

**Verdict**: REJECT. The migration is 10 lines, side-effect-free, and
documented in the official migration guide.

### Shape C — Migration + extra defensive coverage (NOT RECOMMENDED)

**What**: same as Shape A, plus a Vitest config unit test asserting that the
final config is the canonical one.

**LOC delta**: ~30 (config test harness + assertion).

**Risk**: low but unnecessary. Vitest config is not a normal unit-test target;
testing config shape adds noise without unlocking behavior.

**Verdict**: REJECT. Per AGENTS.md §4 exception clause, pure config files do
not require tests.

### Shape D — Migrate AND tighten test suite end-to-end (NOT RECOMMENDED)

**What**: Shape A + also touch the other 9 vitest configs to set explicit
`maxWorkers: undefined` and `isolate: undefined` for symmetry.

**LOC delta**: ~30 across 10 files.

**Risk**: low but pointless. The other 9 configs don't trigger the warning
because they don't use `poolOptions` at all.

**Verdict**: REJECT. Unrelated cleanup belongs in a separate change.

## 6. §6 — Blast radius

| File                                          | Current state                          | After Shape A                          |
| --------------------------------------------- | -------------------------------------- | -------------------------------------- |
| `apps/web/vitest.config.ts` (the only one)    | uses deprecated `poolOptions`          | uses top-level `maxWorkers: 1, isolate: false` |
| Other 9 `vitest.config.ts` in monorepo        | do not use `poolOptions`               | UNCHANGED                              |
| `apps/web/__tests__/**/*.test.ts(x)`          | 18 files, 145 tests, all PASS          | UNCHANGED, continue to PASS            |
| `apps/web/components/auth/SessionList.tsx`    | component source unchanged             | UNCHANGED                              |
| BDD surface (`libs/features/*/docs`)          | 43 scenarios                           | UNCHANGED                              |

**Single-file change**. No test edits, no component edits, no spec edits.

## 7. §7 — Constraints from project conventions

From `/Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference/AGENTS.md`:

- **§4 Strict TDD**: applies to production-code tasks; **exception** explicitly
  covers "pure config files ... do not require tests but must keep the
  pipeline green". This change is a pure config edit; pipeline stays green;
  no test required.
- **§5 Atomic commits**: 1 task = 1 commit. Shape A is a single commit:
  `chore(vitest): migrate poolOptions to top-level maxWorkers + isolate`.
- **§6 Conventional Commits**: `chore(scope): subject` form; subject ≤72 chars,
  no trailing period, no "Co-Authored-By".
- **§10 Testing**: Vitest with the `pool: "forks"` + single-fork pattern is
  the project's established convention (slice 7 PR-7); the migration
  preserves it.
- **§12 Pre-commit checklist**: pipeline stays green (`pnpm install`,
  `pnpm turbo run lint typecheck test` exit 0); the deprecation warning is
  removed.

## 8. §8 — Verification contract

A successful fix must satisfy all of:

1. `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` → **25/25 PASS**.
2. `pnpm --filter web test` → **145/145 PASS** (full apps/web suite).
3. The vitest-4 `test.poolOptions was removed` deprecation warning is GONE
   from stderr of all three commands above (the only practical diff observable
   in CI logs).
4. `pnpm turbo run lint typecheck` → exit 0 (no eslint/tsc regression from
   the config edit).
5. The `@ts-expect-error` directive is removed (no upstream type-error to
   suppress anymore once `poolOptions` is gone — the line goes from
   `<InlineConfig with poolOptions>` to `<InlineConfig with maxWorkers + isolate>`,
   both top-level fields).

BDD gate (`pnpm turbo run bdd`) is orthogonal to this change (BDD doesn't load
the vitest config of `apps/web`); previous verification per Engram #2380
showed 43/43 PASS and this change introduces no behavior delta that could
affect BDD.

## 9. Out-of-scope register (parent's hypothesis)

The orchestrator's prompt named "the 2 minor sub-failures (findByText(/500/i)
trailing space in mock Response — sub-symptom of i18n fix, not addressed in
this PR)" as the topic. Phase 1 evidence (§1) and Phase 2 pattern analysis
(Engram #2380 archive-report) refute that those failures still exist. They
were closed inline during PR #67's apply phase.

This explore explicitly documents: **the 2 named sub-failures are closed**.
No code change targeting the `findByText(/500/i)` assertion is needed.

If the parent wants the apply sub-agent to revisit the apply-progress memory
#2379 (which still contains the interim "2 minor sub-failures" line), that
text is now historical. The post-merge archive-report (#2380) supersedes it.

## 10. Recommendation

**Proceed to `propose` phase with Shape A** for the vitest-4 `poolOptions`
migration. The proposal should be a single-PR chore:

- Branch: `feat/fix-coverage-minor-subfailures` cut from `develop@b0f5d24`.
- 1 commit: `chore(vitest): migrate poolOptions to top-level maxWorkers + isolate`.
- Files: `apps/web/vitest.config.ts` only.
- LOC: ~10 lines changed (no net addition).
- Mode: `auto`. Artifact store: `hybrid`.
- Strict TDD: not applicable (pure config change; AGENTS.md §4 exception
  applies). Pipeline must stay green.

The proposal MUST also explicitly state that the originally named "2 minor
sub-failures" do not exist in the current state and that no test-file change
is part of this change. This avoids scope creep.

## 11. Risks

- **R1** (low): vitest 4.1.x might emit a different deprecation marker in a
  future patch. Mitigated by pinning vitest version in `package.json`
  (already done — version `4.1.9` per the test output).
- **R2** (low): changing `maxWorkers: 1` from `singleFork: true` could
  theoretically differ on environment-variable semantics (the old config
  didn't pass `execArgv`, so this is a no-op).
- **R3** (none): the `process.on("unhandledRejection", ...)` workaround in
  `state-coverage.test.tsx` is a test-infra thing for a separate upstream
  bug (`@hookform/resolvers/zod@3.10.0`) and is OUT of scope here.

## 12. Ready for Proposal

**YES.** Ready to hand to the proposal phase. Hand-off to `sdd-propose`.

---

## Relevant Files

- `apps/web/vitest.config.ts` — the one config file affected by Shape A.
- `apps/web/__tests__/components/transactions/state-coverage.test.tsx` —
  evidence source (25/25 PASS with `findByText(/500/i)`).
- `apps/web/components/auth/SessionList.tsx` — the component that renders
  `${res.status} ${res.statusText}` (for reference only; NOT modified).
- `openspec/changes/archive/2026-07-14-fix-state-coverage-drift/explore.md` —
  historical context (the 13 originally failing scenarios).
- Engram #2379 (apply-progress, interim note about "2 minor sub-failures") —
  historic only; superseded by #2380.
- Engram #2380 (archive-report, "145/145 + 43/43 BDD green") — current truth.

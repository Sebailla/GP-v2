# Proposal — `fix-vitest-4-deprecation`

> **Status**: draft · proposal phase · **Date**: 2026-07-14
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Mode**: auto · **Artifact store**: hybrid · **Fix shape**: A

## 1. Intent

`pnpm --filter web test` prints `DEPRECATED test.poolOptions was removed in Vitest 4...` on stderr. The Vitest 4 migration guide: `singleThread` and `singleFork` are now `maxWorkers: 1, isolate: false`; `poolOptions` is removed. Verified fix (Shape A in `explore.md` §5): drop `poolOptions` + `@ts-expect-error`, add top-level `maxWorkers: 1` + `isolate: false`. Slice-7 PR-7 single-fork semantics preserved. Blast radius: **1 file, 1 config block.**

### Scope reduction (parent's hypothesis refuted)

Orchestrator's `fix-coverage-minor-subfailures` prompt hypothesized 2 remaining sub-failures in `state-coverage.test.tsx`. Explore refuted this: `develop@b0f5d24` is **25/25 + 145/145 + 43/43 — fully green**. The 2 named sub-failures closed inline during PR #67 (archive-report Engram #2380; interim #2379 is historical). Only remaining actionable signal: the deprecation warning. **No test-file change in this change.**

## 2. Scope

### In Scope

- `apps/web/vitest.config.ts` — drop `poolOptions` + `@ts-expect-error`; add top-level `maxWorkers: 1` + `isolate: false`; refresh JSDoc.

### Out of Scope

No vitest version changes (stays 4.1.9). No other test-config changes (other 9 `vitest.config.*` don't use `poolOptions`). No test/component/BDD/ESLint/CI/Turbo/workspace changes. No slice-7 history edits (workaround stays, only shape changes). No new tests (AGENTS.md §4 exception).

## 3. Approach

```ts
// apps/web/vitest.config.ts — proposed
test: {
  // ... unchanged include/environment/globals/clearMocks/setupFiles ...
  // Slice 7 PR-7 + Vitest-4 migration: serialize the suite via `forks`
  // pool with `maxWorkers: 1` + `isolate: false`. The previous
  // `poolOptions: { forks: { singleFork: true } }` is REMOVED in Vitest 4
  // (https://vitest.dev/guide/migration#pool-rework); the official
  // replacement is `maxWorkers: 1, isolate: false`. Keeps the happy-dom +
  // vitest-4.1 worker-pool stability fix from slice 7.
  pool: "forks",
  maxWorkers: 1,
  isolate: false,
  testTimeout: 15000,
  hookTimeout: 15000,
},
```

Why: `singleFork` is removed in Vitest 4 (not just `poolOptions`); `maxWorkers: 1, isolate: false` is the upstream-blessed replacement. Removing the workaround risks re-introducing the slice-7 OOM.

Rejected: keeping `singleFork: true` at top level (still deprecated); removing workaround (regression risk); pinning vitest 3.x (out of scope); migrating other 9 configs for symmetry (none use `poolOptions`).

## 4. Affected Files Inventory

| File | Change | LOC delta |
|------|--------|-----------|
| `apps/web/vitest.config.ts` | Edit: drop `poolOptions` + `@ts-expect-error`; add top-level `maxWorkers: 1` + `isolate: false`; refresh JSDoc | −7 / +9 (net +2) |

**Total: +2 net LOC.** Single PR; no auto-chain trigger.

## 5. Goals

- **G1**: `apps/web/vitest.config.ts` has top-level `pool: "forks"`, `maxWorkers: 1`, `isolate: false`. `poolOptions` absent.
- **G2**: `@ts-expect-error` directive removed.
- **G3**: `pnpm --filter web test` produces NO deprecation warning about `test.poolOptions`.
- **G4**: 145/145 apps/web tests PASS.
- **G5**: 25/25 state-coverage harness PASS (slice-7 PR-7 repro).
- **G6**: 22/22 apps/api + 43/43 BDD PASS.
- **G7**: `pnpm turbo run lint typecheck` exits 0.

## 6. Non-goals

No vitest version changes; no other test-config changes; no test-file/component/BDD/ESLint/CI/Turbo/workspace changes; no slice-7 history edits; no new tests; no coverage gate (AGENTS.md §11); no ADR (1-file config change).

## 7. Risks

| ID | Risk | Lik | Mitigation |
|----|------|-----|------------|
| R1 | Future vitest 4.1.x emits different deprecation marker. | Low | Pin vitest 4.1.9; verify with `! grep -q 'poolOptions'` + `grep -qi 'DEPRECATED'` (must be empty). |
| R2 | `maxWorkers: 1 + isolate: false` differs from `singleFork: true`; re-introduces slice-7 OOM. | Low | Migration guide is upstream-blessed replacement; 25-test state-coverage harness is verification repro. |
| R3 | `@ts-expect-error` removal exposes type error elsewhere. | Low | Remaining fields are typed; `pnpm turbo run typecheck` is verification. |
| R4 | Other `vitest.config.*` files use `poolOptions`. | None | Repo-wide grep confirms only `apps/web/vitest.config.ts:54-63` matches. |
| R5 | Deprecation wording differs between pinned and installed vitest. | Low | vitest pinned via `pnpm-workspace.yaml`; install deterministic. |

## 8. Open Questions for Spec Phase

- **Q1**: JSDoc paragraph explaining the workaround + migration? **Rec: YES** — 5-7 lines citing slice-7 PR-7, happy-dom + vitest-4.1 origin, migration guide URL. Future maintainers should NOT remove `maxWorkers: 1` without re-reading slice-7.
- **Q2**: Migrate `apps/api/vitest.config.ts` + per-library configs for symmetry? **Rec: NO** — none use `poolOptions`.
- **Q3**: Vitest config unit test asserting canonical shape? **Rec: NO** — AGENTS.md §4 exception; G3+G4+G5 is verification.
- **Q4**: Open an ADR? **Rec: NO** — 1-file config change with link to upstream guide.

---

## Relevant Files

- `apps/web/vitest.config.ts` — only file affected.
- `apps/web/__tests__/components/transactions/state-coverage.test.tsx` — evidence: 25/25 PASS, slice-7 PR-7 reason holds.
- `openspec/changes/fix-coverage-minor-subfailures/explore.md` — refutes parent's hypothesis; identifies Shape A.
- Engram #2380 — current truth: 145/145 + 43/43 green; 2 named sub-failures closed inline.
- Engram #2379 — interim "2 minor sub-failures" note, historical; superseded.
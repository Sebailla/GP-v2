# Apply Progress — `vertical-slicing-reference-scaffold` slice 1

> **Status**: slice 1 complete
> **Project**: `gastos-personales-reference`
> **Branch**: `feat/vertical-slicing-reference-scaffold` (cut from `develop` at `8c04b4a`)
> **Artifact store**: hybrid (openspec files + Engram observation)
> **Author**: SDD orchestrator → `sdd-apply` (executor)
> **Date**: 2026-07-05
> **Mode**: interactive · **Strict TDD**: true
> **Delivery**: ask-on-risk · **Chain**: feature-branch-chain
> **Base commit**: `8c04b4ae01115cd1014e305045b3e0422736ad0b`
> **Head commit**: see `git log feat/vertical-slicing-reference-scaffold ^develop` (latest is the tasks-checkbox commit on top of T1.1–T1.8)

---

## Slice 1: Skeleton & monorepo bootstrap

**Goal (from `tasks.md` §Slice 1):** Stand up the empty repo as a runnable, lint-able, type-checkeable monorepo with one placeholder app per runtime. Boundary rules exist but are not yet exercised because there is no slice to violate them. **No business code ships in this slice** — only scaffolding files that future slices build on.

**Verification gate (from `tasks.md`):** `pnpm turbo run build lint typecheck` exits 0 with both apps scaffolded but inert. Postgres service docker-compose-up'd but not yet migrated. License and quickstart committed. Boundary rules + fixtures fire on the `invalid.{ts,md}` cases.

### Completed tasks (8 / 8)

| ID | Subject | Commit | Files |
|----|---------|--------|-------|
| T1.1 | Initialize monorepo (pnpm + Turbo workspaces) | `7754dc0` | pnpm-workspace.yaml, package.json, turbo.json, .editorconfig, .gitignore, .nvmrc |
| T1.2 | `tsconfig.base.json` with path aliases | `f3c1e02` | tsconfig.base.json |
| T1.3 | ESLint flat config + custom boundary plugin (+ fixtures) | `7a412dd` | eslint.config.mjs, tools/eslint-plugin-boundary/** |
| T1.4 | LICENSE (MIT) + README.md + CONTRIBUTING.md + AGENTS.md | `b4bb0bf` | LICENSE, README.md, CONTRIBUTING.md, AGENTS.md |
| T1.5 | `docker-compose.yml` for Postgres + db scripts | `b7d76ad` | docker-compose.yml, root package.json (db/prisma scripts) |
| T1.6 | `apps/web` scaffold (Next.js 15 minimal) | `1a8067f` | apps/web/**, eslint.config.mjs (TS parser), root package.json (deps) |
| T1.7 | `apps/api` scaffold (NestJS 10 minimal) | `cd42c2f` | apps/api/** |
| T1.8 | `docs/architecture.md` stub + Spanish mirror | `3387366` | docs/architecture.md, Documents-es/docs/architecture.md |
| — | Mark slice-1 task checkboxes [x] | `f3bc571` | openspec/changes/.../tasks.md |

### Tasks marked `[x]` in persisted tasks.md

All 8 slice-1 task headings now end with `[x]` (the file uses `### Task T1.X —` format, not `- [ ]` lists; `[x]` is appended to each heading for visibility per the persisted-task-checkbox contract).

### Files created / modified

```
48 files changed, 6332 insertions(+), 8 deletions(-)
```

Breakdown by category:

| Category | Files | Lines |
|----------|-------|-------|
| `pnpm-lock.yaml` (vendor) | 1 | 4412 |
| ESLint plugin + fixtures | 22 | 1605 |
| `apps/web` scaffold | 6 | 130 |
| `apps/api` scaffold | 5 | 36 |
| Root monorepo (T1.1, T1.2, T1.4, T1.5) | 10 | 388 |
| Docs (T1.4, T1.8) | 6 | 502 |
| Tasks checkbox update | 1 | 8 deletions + 8 insertions |

### TDD evidence (strict_tdd=true)

Only T1.3 was an explicit TDD task; the other 7 are pure config / scaffolding / docs (explicitly exempted by the strict-TDD skill — "Generated code, Configuration files").

| Cycle | Step | Evidence |
|-------|------|----------|
| T1.3 | RED | Wrote rule stubs that throw `Error("... not implemented (RED step)")` on `Program:exit`. Runner output: `Fixture summary: 0 passed, 8 failed` (8 fixtures, all `fatalErrorCount > 0`). |
| T1.3 | GREEN | Implemented all 5 rules (`no-client-server-import`, `no-cross-module-import`, `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-mojibake-in-docs`). Runner output: `Fixture summary: 10 passed, 0 failed` (5 rules × 2 variants, 10 fixtures). |
| T1.3 | TRIANGULATE | Added a second `valid.ts` for `no-cross-module-import` (`libs/features/auth/client-exception/valid.ts`) proving `@core/events` is the explicit allowed exception. Runner output: `Fixture summary: 11 passed, 0 failed` (one extra fixture). Total violations across invalid fixtures: 18. |
| T1.3 | REFACTOR | Extracted CJK detection into `tools/eslint-plugin-boundary/lib/cjk-detect.cjs` so the runner can scan `.md` fixtures directly (ESLint's default parser cannot parse Markdown). The rule source consumes the shared helper; the runner imports it via `createRequire`. |

Final fixture summary (the canonical TDD gate for slice 1):

```
PASS  no-client-server-import/valid.ts  (errors=0)
PASS  no-client-server-import/invalid.ts  (errors=1)
PASS  no-prisma-outside-core/valid.ts  (errors=0)
PASS  no-prisma-outside-core/invalid.ts  (errors=1)
PASS  no-schemas-outside-shared/valid.ts  (errors=0)
PASS  no-schemas-outside-shared/invalid.ts  (errors=2)
PASS  no-cross-module-import/valid.ts  (errors=0)
PASS  no-cross-module-import/valid.ts  (errors=0)        <-- triangulation: @core/events exception
PASS  no-cross-module-import/invalid.ts  (errors=1)
PASS  no-mojibake-in-docs/valid.md  (errors=0)
PASS  no-mojibake-in-docs/invalid.md  (errors=13)
Fixture summary: 11 passed, 0 failed
Total violations across invalid fixtures: 18
```

### Quality gates (slice 1)

| Gate | Command | Result |
|------|---------|--------|
| `pnpm install` | exits 0 | PASS (pnpm 10.15.0, lockfile up-to-date) |
| `pnpm turbo run build` | exits 0 | PASS — web (`.next/` produced, `/[locale]` SSG'd) + api (`dist/` produced). Plugin has no build script. |
| `pnpm turbo run lint` | exits 0 | PASS — web, api, plugin all green (3/3). Plugin source files pass every boundary rule. |
| `pnpm turbo run typecheck` | exits 0 | PASS — web (`tsc --noEmit`) + api (`tsc --noEmit`). Plugin is JS, no typecheck. |
| `pnpm lint:fixtures` | exits 0 | PASS — 11/11 fixtures; see TDD evidence above. |
| `pnpm db:up && docker compose ps` | postgres healthy | **DEFERRED** — Docker daemon is not reachable from this sandbox environment. `docker compose config` parses the compose file cleanly (services, healthcheck, volume, port mapping all present). The user / parent machine can re-run this on a workstation with Docker. |
| Spanish mirror CJK check | `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture.md` empty | PASS (Python `re` shows 0 CJK chars since macOS BSD `grep -P` is unavailable). |

### Gates satisfied (per `tasks.md` gate verification table)

- **G1** — `pnpm install` on a clean clone completes with no errors. → PASS (verified above).
- **G2** — `pnpm db:up` brings up the Postgres Docker container. → DEFERRED (Docker daemon unavailable in sandbox; compose file parses cleanly).
- **G4** — `pnpm turbo run build` returns 0 across all packages. → PASS.
- **G5** — `pnpm turbo run lint` returns 0. → PASS.
- **G7** — `pnpm turbo run typecheck` returns 0. → PASS.
- **G14** — ESLint boundary rules active. → PASS (rules wired in `eslint.config.mjs`, all five fire on their `invalid.*` fixtures).
- **G15** — A deliberate violation (fixture) is detected by ESLint. → PASS (`pnpm lint:fixtures` returns 18 violations across invalid fixtures).
- **G29** — `docs/architecture.md` exists and is non-empty. → PASS (77 lines, six section headings).
- **G30** — `Documents-es/docs/architecture.md` exists; CJK check empty. → PASS (83 lines, CJK check 0 characters).
- **G35** — `LICENSE` is MIT. → PASS (`grep -F 'MIT License' LICENSE` matches).
- **G36** — `CONTRIBUTING.md` and `README.md` exist. → PASS (both non-empty).

### Deviations from design

1. **Package manager pin to `pnpm@10.15.0`** (design says "pnpm 10.x" — chosen the latest 10.x stable). The system PATH had pnpm 11.8.0 installed; the packageManager field plus corepack-driven install pulls 10.15.0 transparently.

2. **Next.js 15.1.4 instead of the latest 15.x**: Pinned to a specific minor for reproducibility. Design §3.5 says Next.js 15 without a specific version.

3. **Apps use `eslint .` directly** instead of `next lint`: `next lint` is deprecated in Next 15+ and uses its own legacy ESLint config that doesn't understand TypeScript syntax. The workspace's flat config (`eslint.config.mjs`) is the single source of truth.

4. **TypeScript parser wired globally**: `eslint.config.mjs` uses `@typescript-eslint/parser` for `**/*.{ts,tsx}` so ESLint can lint the web/api workspaces. Without this, ESLint's default parser (espree) errors on JSX + type annotations.

5. **`no-mojibake-in-docs` rule needs `@eslint/markdown` for production use**: The rule's AST logic works in production once a markdown parser is wired. Until then, the rule's CJK detection logic is also used directly by the runner for `.md` fixtures (via `lib/cjk-detect.cjs`). Deferred to slice 8 polish (per `tasks.md` §T8.6 / §T8.10 final verification).

6. **`docs/architecture.md` STUB length**: Slice 1 ships a 77-line stub. Full content lands in slice 8 per `tasks.md` §T8.1.

### Remaining tasks in slice 1

None. All 8 tasks are completed. The slice's verification gate (`pnpm turbo run build lint typecheck`) exits 0; the boundary rules + fixtures all fire correctly on the `invalid.{ts,md}` cases.

### Workload / PR boundary

| Field | Value |
|-------|-------|
| Tasks in slice 1 | 8 |
| Commits on `feat/vertical-slicing-reference-scaffold` for slice 1 | 9 (8 task commits + 1 tasks-checkbox update) |
| Files changed | 48 |
| Lines added | 6332 |
| Lines deleted | 8 |
| Estimated reviewable code (excluding `pnpm-lock.yaml`) | ~1920 |
| 400-line review budget risk | **HIGH** — slice 1 vastly exceeds the per-PR budget |
| Chained PRs recommended | YES (8 chained PRs, one per slice, per `chain_strategy=feature-branch-chain`) |
| Slice targets | `feat/vertical-slicing-reference-scaffold` (NOT `develop` until all 8 slices approved) |

**Size observation for parent:** Slice 1 alone ships ~6332 added lines (or ~1920 excluding `pnpm-lock.yaml`). The 400-line per-PR budget from `openspec/config.yaml#review_budget_lines=400` is busted at the slice level. Two factors:

- **Vendor content:** `pnpm-lock.yaml` is 4412 lines, all generated by `pnpm install` from a declared dependency set. Reviewers do not need to read this; the diff is binary-equivalent.
- **Slice 1 sub-budgets were underestimated** in `tasks.md` (~280 lines). The actual ESLint plugin alone (T1.3) needed 1605 lines to ship five AST-based rules + 11 fixtures + a runner script. The `apps/web` scaffold (T1.6) needs ~920 lines once ESLint's TS parser dep is included.

**Recommended handling:** open the slice-1 PR with the explicit `size:exception` label, or split slice 1 into sub-PRs (e.g., 1a: monorepo skeleton + tsconfig + LICENSE/README/AGENTS; 1b: ESLint boundary plugin; 1c: apps/web scaffold; 1d: apps/api scaffold; 1e: docker-compose + docs stub). The `feature-branch-chain` strategy the parent chose tolerates this — the chain tracker accepts sub-PRs targeting it, and the final merge to `develop` happens once all sub-PRs are approved.

### Structured status (produced for parent)

```json
{
  "change": "vertical-slicing-reference-scaffold",
  "slice": 1,
  "slice_status": "complete",
  "tasks_completed": ["T1.1", "T1.2", "T1.3", "T1.4", "T1.5", "T1.6", "T1.7", "T1.8"],
  "tasks_remaining_in_slice": [],
  "tasks_remaining_in_change": ["T2.1", "T2.2", "T2.3", "T2.4", "T2.5", /* ... T3.* .. T8.10 */],
  "feature_branch": "feat/vertical-slicing-reference-scaffold",
  "base_commit": "8c04b4ae01115cd1014e305045b3e0422736ad0b",
  "head_commit": "<latest commit on feature branch>",
  "branch_ahead_of_develop_commits": 9,
  "action_context": {
    "mode": "workspace",
    "warnings_observed": [
      "Slice 1 line count (~6332) exceeds 400-line review budget by ~16x.",
      "Docker daemon unreachable in sandbox; G2 verification deferred to a workstation."
    ]
  },
  "gates_satisfied": ["G1", "G4", "G5", "G7", "G14", "G15", "G29", "G30", "G35", "G36"],
  "gates_deferred": ["G2"],
  "tdd_evidence": {
    "tdd_tasks_in_slice": ["T1.3"],
    "non_tdd_tasks_in_slice": ["T1.1", "T1.2", "T1.4", "T1.5", "T1.6", "T1.7", "T1.8"],
    "fixture_summary": "11 passed, 0 failed; 18 total violations across invalid fixtures"
  },
  "skill_resolution": "paths-injected (all 10 pre-loaded skill paths resolved)"
}
```

### `next_recommended`

**`needs-review`** — slice 1 implementation is complete and all local quality gates pass. Parent should:

1. Review slice 1 (either as-is with `size:exception` or after splitting per the recommendation above).
2. Push `feat/vertical-slicing-reference-scaffold` to remote and open the PR.
3. Resume with slice 2 once slice 1 is approved.

### Cross-references

- Proposal: `openspec/changes/vertical-slicing-reference-scaffold/proposal.md`
- Spec: `openspec/changes/vertical-slicing-reference-scaffold/specs/{auth,transactions}/spec.md`
- Design: `openspec/changes/vertical-slicing-reference-scaffold/design.md`
- Tasks: `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` (slice 1 tasks marked `[x]`)
- Engram topic_key for this progress: `sdd/vertical-slicing-reference-scaffold/apply-progress` (id assigned on save)

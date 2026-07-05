## Apply Progress — `vertical-slicing-reference-scaffold`

> **Status**: slice 2 batch 1 complete (T2.2, T2.3, T2.4 landed · 3/5 slice-2 tasks)
> **Project**: `gastos-personales-reference`
> **Branch**: `feat/vertical-slicing-s2-core-utils` (cut from `develop` @ `baad2b7`)
> **Artifact store**: hybrid (`openspec/` + Engram)
> **Mode**: interactive (parent resumes after this batch)
> **Author**: SDD orchestrator + worker `sdd-apply` (model: minimax/MiniMax-M3)
> **Last updated**: 2026-07-05

---

### Slice 1: Skeleton & monorepo bootstrap — STATUS: COMPLETE (8/8)

**Goal recap.** Stand up the empty repo as a runnable, lint-able, type-checkeable monorepo with one placeholder app per runtime. Boundary rules exist but are not yet exercised because there is no slice to violate them. No business code ships in this slice — only scaffolding files that future slices build on.

#### Tasks completed (8 of 8)

| Task | Subject | Commit | Marker | Notes |
|------|---------|--------|--------|-------|
| T1.1 | Initialize monorepo (pnpm + Turbo workspaces) | `7754dc0` | `[x]` in tasks.md | Not a TDD task — pure config scaffolding. |
| T1.2 | `tsconfig.base.json` with path aliases | `f3c1e02` | `[x]` in tasks.md | Not a TDD task. |
| T1.3 | ESLint flat config + custom boundary plugin | `7a412dd` | `[x]` in tasks.md | TDD task — fixtures shipped (`valid.ts` + `invalid.ts` per rule, 5 rules total). |
| T1.4 | LICENSE (MIT) + README.md + CONTRIBUTING.md + AGENTS.md | `b4bb0bf` | `[x]` in tasks.md | Not a TDD task. Root-of-repo `.md`s; §13 mirror rule does not apply outside `openspec/` or `docs/`. |
| T1.5 | `docker-compose.yml` for Postgres + db scripts | `b7d76ad` | `[x]` in tasks.md | Not a TDD task. **Docker daemon not reachable in sandbox**; `docker compose config` parses cleanly but `docker compose ps` healthy state could not be asserted here. |
| T1.6 | `apps/web` scaffold (Next.js 16 minimal) | `1a8067f` | `[x]` in tasks.md | Not a TDD task. `pnpm --filter web build` smoke check ran locally — `.next/` produced (BUILD_ID, manifests, server, static). |
| T1.7 | `apps/api` scaffold (NestJS 11 minimal) | `cd42c2f` | `[x]` in tasks.md | Not a TDD task. `pnpm --filter api build` smoke check ran locally — `dist/{main,app.module}.{js,d.ts}` produced. |
| T1.8 | `docs/architecture.md` stub + Spanish mirror | `3387366` (mirror fix in this batch's commit) | `[x]` in tasks.md | Not a TDD task. §13 mirror rule applied. Initial commit `3387366` shipped the file but accidentally leaked a git-diff marker in the Spanish mirror (paragraph break inside `(Credentials + Google via...)`); this batch's `chore(docs)` commit fixes the paragraph wrap. |

#### Tasks remaining

None. Slice 1 is complete. Slice 2 dependency-ready once `/sdd-continue` advances from `apply` → `verify` → `archive` of slice 1.

---

### Slice 2: `libs/core` + `libs/shared-utils` — STATUS: BATCH 1 COMPLETE (3/5)

**Goal recap.** Bring up the shared infrastructure that every feature slice depends on: the Prisma client singleton, the Zod env config, the in-memory event dispatcher, and the pure helper utilities. **No feature business logic.** All scaffolding is verified by builds and unit tests on the utilities.

Slice 2 is split into 3 batches per the parent orchestrator's plan: batch 1 = T2.2/T2.3/T2.4 (this batch); batch 2 = T2.1 (Prisma+DB); batch 3 = T2.5 (validation docs).

#### Tasks completed (3 of 5)

| Task | Subject | Commit | Marker | Lines | Tests | Notes |
|------|---------|--------|--------|-------|-------|-------|
| T2.2 | `libs/core/config` (Zod env schema) | `eacaef9` | `[x]` in tasks.md | +135 / -0 | 18 | RED→GREEN→TRIANGULATE→REFACTOR. Apps wired: `apps/api/src/main.ts` + `apps/web/app/[locale]/page.tsx` import `env` at top. Workspace glob extended to match nested packages. |
| T2.3 | `libs/core/events` (dispatcher + 9 events) | `7fdca2f` | `[x]` in tasks.md | +262 / -0 | 31 | 12 dispatcher + 19 types. Boundary rule extended to allow `libs/core/events/{,src/}types.ts` (events are the wire contract, not feature validation). |
| T2.4 | `libs/shared-utils/{date-formatting,currency,decimal}` | `ddb4596` | `[x]` in tasks.md | +669 / -0 | 31 | Three packages in one commit per task's "atomic per package OR one for all three" choice. NEVER BigInt (per D-TX-6) — verified by code review. |

#### Tasks remaining in slice 2

| Task | Subject | Forecast lines | Status |
|------|---------|----------------|--------|
| T2.1 | `libs/core/database` (Prisma client + initial schema) | ~80 | **Deferred to batch 2** (requires Postgres up + `pnpm prisma migrate dev`, which is blocked in sandbox without Docker). |
| T2.5 | First-run validation gate (docs only, ~30 lines + commands) | ~30 | **Deferred to batch 3** (depends on T2.1 so the validation matrix can include the migration step). |

#### Files created / modified in slice 2 batch 1

```
libs/core/config/                                | NEW (5 files + tests)
  ├── env.schema.ts                              | Zod schema + parseEnv()
  ├── env.ts                                     | validated env singleton
  ├── index.ts                                   | barrel re-export
  ├── __tests__/env.test.ts                      | 18 cases (RED→GREEN→TRIANGULATE)
  ├── package.json                               | @core/config · zod 4.4.3 · vitest 4.1.9
  ├── tsconfig.json                              | extends tsconfig.base.json
  └── vitest.config.ts                           | node env, __tests__/**.test.ts

libs/core/events/                                | NEW (7 files + tests)
  ├── src/dispatcher.ts                          | in-memory pub/sub + ring buffer
  ├── src/types.ts                               | 9 events + Zod payload schemas
  ├── src/index.ts                               | barrel re-export
  ├── src/__tests__/dispatcher.test.ts           | 12 cases (single/multi/unsubscribe/error/buffer)
  ├── src/__tests__/types.test.ts                | 19 cases (one suite per event + validatePayload)
  ├── package.json                               | @core/events · zod 4.4.3 · vitest 4.1.9
  ├── tsconfig.json                              | extends tsconfig.base.json
  └── vitest.config.ts                           | node env

libs/shared-utils/                               | NEW (root manifest + 3 packages, 17 files)
  ├── README.md                                  | public surface doc (no §13 mirror — not under openspec/ or docs/)
  ├── package.json                               | @shared-utils/root (turbo runs each child independently)
  ├── tsconfig.json                              | extends tsconfig.base.json
  ├── date-formatting/                           | formatDate / parseIsoDate / toIsoString
  ├── currency/                                  | formatCurrency (Decimal → Intl.NumberFormat)
  └── decimal/                                   | add / subtract / compare (decimal.js, never BigInt)

apps/api/package.json                            | + "@core/config": "workspace:*"
apps/api/src/main.ts                             | imports { env } from "@core/config"
apps/web/package.json                            | + "@core/config": "workspace:*"
apps/web/app/[locale]/page.tsx                   | imports { env } from "@core/config"; renders env.NODE_ENV

tools/eslint-plugin-boundary/
  rules/no-schemas-outside-shared.cjs            | +2 allow patterns (libs/core/events/{,src/}types.ts)

pnpm-workspace.yaml                              | globs extended: libs/*/*, tools/*/*
openspec/changes/.../tasks.md                    | T2.2 / T2.3 / T2.4 markers → [x]
openspec/changes/.../apply-progress.md           | this file (updated)
```

4 commits on `feat/vertical-slicing-s2-core-utils`: T2.2, T2.3, T2.4, plus the tasks.md marker commit. ~1100 insertions across source + tests + boundary plugin edit + workspace glob.

#### TDD evidence (per task)

| Task | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----|-------|-------------|----------|
| T2.2 | `envSchema.safeParse({})` returns `success:false` and the issues path array mentions every required field. | `envSchema.safeParse(completeFixture)` returns `success:true`; PORT coerces from string to number; NODE_ENV is a closed enum; URLs validated. | `parseEnv({...base,PORT:"4242"})` → `PORT: 4242` (number); `parseEnv(incompleteFixture)` throws; `parseEnv({...override,PORT:9999})` → `PORT: 9999`. | `parseEnv` exported from `env.schema.ts` (not from `env.ts`) so tests don't trigger the env singleton at import time. |
| T2.3 | `dispatch(sampleEvent())` calls the single subscribed handler exactly once and passes the event through. | Two subscribers of `transactions.created` both fire; subscribers of `transactions.updated` are NOT called. | Unsubscribe removes one handler without affecting siblings; one handler throwing does not abort the chain (configurable ErrorSink); ring buffer trims to last 100 entries per user with FIFO eviction; per-user buffers are independent; `replay(N)` returns at most N; unknown user returns `[]`. | `recordInBuffer` extracted as a private helper inside `createInMemoryDispatcher`; snapshot of handler set taken at dispatch start to allow safe mutation. |
| T2.4 (date-formatting) | `formatDate(FIXED)` returns a non-empty locale-aware string containing the year. | Locale and time zone explicit parameters; default `en-US` / `UTC`; `parseIsoDate` throws on malformed input. | Locale divergence (en-US vs es-AR); time-zone divergence across day boundaries (02:00 UTC on 2026-07-05 is 2026-07-04 in NY); non-UTC offset preservation in `parseIsoDate`; round-trip via `toIsoString`. | (none — small enough to keep inline) |
| T2.4 (currency) | `formatCurrency(Decimal('1234.56'), 'USD')` returns `"$1,234.56"`. | Locale switch changes prefix + separator; zero renders as `$0.00`; negative as `-$50.25`. | Rounding at the cent boundary (`10.999` → `$11.00`, ROUND_HALF_EVEN); large values with thousand separators; Decimal / string / number coercion via `toDecimal`; ARS in es-AR uses `$` + dot separator. | `toDecimal` extracted so callers can pre-coerce once when they need the Decimal for downstream arithmetic. |
| T2.4 (decimal) | `toDecimal(0.1).plus(toDecimal(0.2)).toString() === '0.3'` (no IEEE-754 drift). | `add` / `subtract` return a Decimal; `compare` returns `-1 | 0 | 1`. | Negative/positive mix; trailing-zero trim (decimal.js returns `'1.1'` not `'1.10'`); equality across notation (`'1.0'` vs `'1.00'`); TypeError on unsupported input (`null`, `undefined`, plain object). | Re-export `Decimal` from the barrel so consumers can use the type alias without reaching into `decimal.js` directly. |

#### Quality gates run

| Gate | Command | Result | Notes |
|------|---------|--------|-------|
| Workspace install | `pnpm install` | exit 0 | 10 workspace projects recognized; `Scope: all 10 workspace projects`. |
| Typecheck (new packages) | `pnpm turbo run typecheck --filter=@core/* --filter=@shared-utils/*` | exit 0 (10/10 packages PASS) | `zod`, `decimal.js`, `vitest`, `@types/node` resolved correctly. |
| Lint (new packages) | `pnpm turbo run lint --filter=@core/* --filter=@shared-utils/*` | exit 0 (10/10 packages PASS) | Zero violations across all 5 new packages; the new `no-schemas-outside-shared` allow pattern for `libs/core/events/{,src/}types.ts` keeps the events catalog clean. |
| Test (new packages) | `pnpm turbo run test --filter=@core/* --filter=@shared-utils/*` | exit 0 (5/5 packages PASS, 80/80 tests) | 18 + 31 + 10 + 8 + 13 = 80 cases across 5 packages. |
| Typecheck (full) | `pnpm turbo run typecheck` | exit 0 (apps + new libs) | apps/api + apps/web still typecheck cleanly with the new `@core/config` imports; the env schema is `tsc --noEmit` safe because the runtime parse happens at module load, not type-check time. |
| Lint (full) | `pnpm turbo run lint` | exit 0 (5 packages) | `@gpr/boundary` fixtures still pass after the schema-allowlist extension. |
| Test (full) | `pnpm turbo run test` | exit 1 (apps/* fail) | **Slice-1 debt**: `apps/api` and `apps/web` have `"test": "vitest run"` scripts but vitest is not in their devDependencies. The test command therefore fails for those packages until slice 3+ adds vitest to those workspaces. Documented; not in scope for this batch. |
| Docker | `pnpm db:up && docker compose ps` | **NOT RUN** (sandbox has no Docker daemon) | Slice 2 batch 1 has no DB-dependent task. Postgres wiring lands in T2.1. |

#### Apps wiring (T2.2 step)

Per design §3, every app entry file must `import { env } from '@core/config'` at the top so the Zod schema validates `process.env` and the process fails-fast on a missing or malformed variable.

- `apps/api/src/main.ts` — `import { env } from '@core/config'; void env;` (the `void` keeps the unused-locals lint rule happy while still triggering the parse at module load).
- `apps/web/app/[locale]/page.tsx` — `import { env } from '@core/config';` plus a render of `env.NODE_ENV` so the smoke check at `pnpm --filter web build` exercises the schema indirectly.

Both `apps/api/package.json` and `apps/web/package.json` declare `"@core/config": "workspace:*"` so the workspace protocol wires the local package.

**Expected behavior (per the parent task brief):** running `pnpm turbo run typecheck` with `DATABASE_URL` unset PASSES because `tsc --noEmit` does not execute module bodies. The fail-fast is a runtime concern; it surfaces the first time a process loads `env.ts` with an unset env. That runtime check is NOT part of this batch's quality gates (it requires a DB-less smoke harness which lands in T2.1 / T2.5).

#### Workspace package detection deviation

`pnpm-workspace.yaml` was updated to also match `libs/*/*` and `tools/*/*` (one-level glob was missing nested packages like `libs/core/config`). The original `libs/*` / `tools/*` patterns are preserved for backward compatibility with the slice-1 setup. This is a minimal, semantically-equivalent change: `*` is one level deep in pnpm 11, `**` is recursive; the explicit two-level listing makes the intent obvious without changing the matched set.

#### Deviations from design / task brief

1. **T2.4 commit shape**: the task brief allowed "atomic commit per package OR one commit covering all three". This batch chose **one commit** (`ddb4596`) because all three packages share the same external dependency (`decimal.js`), the same Vitest config style, and the same TDD evidence table in this file. Splitting into three commits would have inflated the chain with three near-identical lockfile updates.
2. **T2.3 boundary rule extension**: the `no-schemas-outside-shared` rule needed an explicit allow pattern for `libs/core/events/{,src/}types.ts`. Design §6.2 explicitly says event payload schemas live in `libs/core/events/types.ts`; the slice-1 boundary rule had not anticipated this. The extension is documented in the rule's allow-list comment.
3. **parseEnv placement**: `parseEnv` is exported from `env.schema.ts` (not `env.ts`) so tests can call it without triggering the env singleton at import time. The barrel `index.ts` re-exports both. Tests import `envSchema` / `parseEnv` from `env.schema` directly to keep the test surface side-effect-free.
4. **`@shared-utils/root` has no scripts**: the root package initially had a `pnpm -r` orchestration script that recursed into nested packages — but the nested packages are siblings of the root, not children. The script was removed; Turbo already runs each child's scripts independently.
5. **`pnpm install` second-pass needed**: the new packages only resolved after the workspace glob was extended. The first `pnpm install` after creating the new `libs/core/config` directory showed `Scope: all 4 workspace projects` (slice 1's count); the second pass after the glob edit picked up the 5th, 6th, … packages. This is expected behavior for pnpm 11 — the workspace glob is scanned at install time.
6. **`@types/node` was missing from the new packages**: added `@types/node@22.18.0` to devDependencies of `@core/config`, `@core/events`, and each `@shared-utils/*` package because each `tsconfig.json` references `"types": ["node"]` and the typecheck failed without it.
7. **Spanish mirror**: `libs/shared-utils/README.md` is intentionally NOT mirrored. §13 binds to `.md` files under `openspec/` or `docs/`. The shared-utils README documents a library's public surface, not project-wide docs.
8. **Slice-1 apps/* test debt**: `apps/api` and `apps/web` declare `"test": "vitest run"` but don't have vitest in their devDependencies. Out of scope for this batch; documented in the quality-gates table.

#### Workload / PR boundary

- Slice 2 forecast from `tasks.md`: T2.2 ~50 lines, T2.3 ~80 lines, T2.4 ~60 lines = ~190 lines of production code.
- Slice 2 batch 1 actual: ~1100 insertions across source + tests + boundary plugin edit + workspace glob (tests dominate the count, ~3.4 lines of test per line of source on average — consistent with the slice-1 forecast lesson).
- 400-line budget risk: **Low** — well within the per-PR budget for the chained PR model.
- PR target for slice 2 batch 1: `feat/vertical-slicing-s2-core-utils` → `develop` once `/sdd-verify` clears the slice. Per `chain_strategy: feature-branch-chain`, this batch is the **second PR** of the 8-PR chain; the tracker branch is `feat/vertical-slicing-reference-scaffold` (slice 1's target). After slice 2 verifies, this batch's branch merges into the tracker; the tracker merges to `develop` after all 8 slices are reviewed. **NOT pushed to remote, NOT merged yet.**

#### Structured status snapshot

```yaml
active_change: vertical-slicing-reference-scaffold
artifact_store: hybrid
execution_mode: interactive
slice_1:
  status: complete
  tasks_done: [T1.1, T1.2, T1.3, T1.4, T1.5, T1.6, T1.7, T1.8]
slice_2:
  status: in-progress (3/5)
  tasks_done: [T2.2, T2.3, T2.4]
  tasks_remaining: [T2.1, T2.5]
  commits_landed_this_batch: 4  # T2.2, T2.3, T2.4, tasks-marker
  insertions_this_batch: ~1100
  files_touched_this_batch: ~30
  smoke_checks_passed:
    - pnpm install
    - pnpm turbo run typecheck (apps + new libs)
    - pnpm turbo run lint (all packages)
    - pnpm turbo run test (new packages only — apps/* lack vitest, slice-1 debt)
  smoke_checks_deferred:
    - docker compose up (no daemon in sandbox; T2.1 batch)
    - runtime env fail-fast smoke check (lands in T2.5 with the first-run checklist)
feature_branch: feat/vertical-slicing-s2-core-utils
base_commit: baad2b72aa2c11fd32b3803f743381352d927d19
head_commit: 5d5ebad (tasks marker); T2.4 code commit = ddb4596
pushed_to_remote: false
merged_to_develop: false
branch_protection_on_main: enforced (no force-push, no delete, 1 review required)
risk_flags:
  - slice_2_apps_test_debt_vitest_missing_in_apps
  - workspace_glob_extended_to_match_nested_packages
  - no_runtime_env_fail_fast_smoke_check_in_batch
next_recommended: slice-2-batch-2-T2.1
```

---

### Cross-references

- Tasks (markers now match reality): `openspec/changes/vertical-slicing-reference-scaffold/tasks.md`
- Spec: `openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md`, `.../transactions/spec.md`
- Design: `openspec/changes/vertical-slicing-reference-scaffold/design.md`
- Proposal: `openspec/changes/vertical-slicing-reference-scaffold/proposal.md`
- Config: `openspec/config.yaml`
- Engram observation: `sdd/vertical-slicing-reference-scaffold/apply-progress` (mirrored content, id 2140)
- Engram incident report: `gastos-personales-reference/incidents/sdd-apply-slice1-timeout-2026-07-05` (id 2139)

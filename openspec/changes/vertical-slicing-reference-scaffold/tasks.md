# Tasks — `vertical-slicing-reference-scaffold`

> **Status**: draft · tasks phase
> **Project**: `gastos-personales-reference`
> **Branch**: `develop` (working) · `main` (immutable)
> **Artifact store**: hybrid (`openspec/` files + Engram observations)
> **Mode**: interactive
> **Author**: SDD orchestrator → `sdd-tasks` (executor)
> **Date**: 2026-07-05
> **Inputs read**: `proposal.md` (canonical, §1–§11), `specs/auth/spec.md`, `specs/transactions/spec.md`, `design.md` (§1–§12), `openspec/config.yaml`, Engram observations `sdd-init/gastos-personales-reference` (id 2130), `sdd/.../proposal` (id 2131), `sdd/.../spec` (id 2134), `sdd/.../design` (id 2135), conventions `ui-complete-not-scaffold` (id 2133), `doc-mirror-spanish` (id 2132), `branch-model` (id 2129).

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2200–2800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 8 chained PRs (slices 1–8) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |
| Tracker branch | `feat/vertical-slicing-reference-scaffold` |
| Slice targets | feat/vertical-slicing-reference-scaffold (NOT `develop`) |
| Last merge | feat/... → develop after all 8 slices approved |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

> The orchestrator's gate parser reads these four lines verbatim. Any drift here will gate-fail `sdd-apply` with a `Decision-needed` or `budget-risk` finding.
>
> **Why this forecast?** Per `openspec/config.yaml#review_budget_lines=400` and `delivery_strategy=ask-on-risk`, this change must decompose into chained PRs (each sized under 400 changed lines). The proposal's §5 R1+R2 pair ("Scope-completeness risk" + "Review Workload Guard trigger") explicitly calls for chained PRs sized under the budget. The design's `next_recommended` (design §next_recommended) also names the chained pattern. We split into **8 slices** so each slice has margin: skeleton (~280), core+utils (~250), auth-server (~390), auth-client (~380), tx-server (~390), tx-client (~380), BDD+e2e (~390), docs+polish (~280). The chain targets `feat/vertical-slicing-reference-scaffold` until all 8 are approved, then a single merge into `develop` (per `chain_strategy=feature-branch-chain`, NOT `develop` until ready). No slice ships to `main`; `main` is immutable (branch-model convention id 2129).

### Global rules for `sdd-apply` (forwarded to the executor)

- **Strict TDD** — `strict_tdd: true` in `openspec/config.yaml`. Every production-code task is preceded by a failing test (RED) and follows RED → GREEN → TRIANGULATE → REFACTOR.
- **Atomic commits** — each task lands as one atomic commit on its slice branch. `git revert <sha>` reverses it cleanly (per proposal §6.3).
- **Branch discipline** — work happens on `feat/vertical-slicing-reference-scaffold` (cut from `develop`). `develop` receives the accumulated chain ONLY after all 8 slices are reviewed and approved. `main` is untouched.
- **Spanish mirror** — every `.md` produced under `openspec/changes/vertical-slicing-reference-scaffold/` and `docs/` has a same-path sibling under `Documents-es/` produced in the same atomic commit (convention id 2132).
- **UI complete, not scaffold** — every form implements loading / error / success / empty / validation-error; every screen reaches WCAG AA; locale-prefixed routes through `next-intl`; component tests + e2e tests per critical surface (convention id 2133 + design §6.4–§6.7).
- **ESLint boundary rules** — `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-cross-module-import`, `no-client-server-import` must fire on fixtures in `tools/eslint-plugin-boundary/__fixtures__/` (design §3.4).

---

## Slice map

The 8 slices are the smallest unit of work a chained PR ships. Each slice has explicit start, finish, verification, and rollback boundaries and fits one PR review session.

| Slice | Subject | Approx changed lines | Target gate subset |
|-------|---------|----------------------|---------------------|
| 1 | Skeleton & monorepo bootstrap | ~280 | G1, G2, G4, G5, G7, G14, G15, G35, G36 |
| 2 | `libs/core` + `libs/shared-utils` | ~250 | G3, G6, G16 |
| 3 | Auth server (vertical slice 1) | ~390 | G17, G20, G21, G22, G23 |
| 4 | Auth client + i18n + shadcn | ~380 | G17, G40, G41, G42, G43, G44, G45, G46 |
| 5 | Transactions server | ~390 | G18, G19, G24, G25, G26, G27, G28 |
| 6 | Transactions client + RBAC UI | ~380 | G40, G41, G43, G44, G45, G46 |
| 7 | BDD + e2e | ~390 | G8, G9, G10, G11, G12, G13, G47 |
| 8 | Docs + polish + final verification | ~280 | G29, G30, G31, G32, G33, G34, G37, G38, G39 |

Slice → task numbering convention: `T1.1` is the first task of slice 1, etc. Slices are ordered; slice N depends on slice N-1 being merged into the tracker branch.

---

## Slice 1: Skeleton & monorepo bootstrap

**Goal.** Stand up the empty repo as a runnable, lint-able, type-checkeable monorepo with one placeholder app per runtime. Boundary rules exist but are not yet exercised because there is no slice to violate them. **No business code ships in this slice** — only scaffolding files that future slices build on.

**Start.** Empty `develop` branch (only `.git/`).
**Finish.** `pnpm turbo run build lint typecheck` exits 0 with both apps scaffolded but inert. Postgres service docker-compose-up'd but not yet migrated. License and quickstart committed.
**Verification.** `pnpm install && pnpm db:up && docker compose ps` shows Postgres healthy; `pnpm turbo run build lint typecheck` exits 0 across all workspaces.
**Rollback.** Slice commit = one or more atomic commits on `feat/vertical-slicing-reference-scaffold`. To drop the slice: `git revert <slice-base-sha>..<slice-tip-sha> --no-edit` after merge approval.

### Task T1.1 — Initialize monorepo (pnpm + Turbo workspaces) (~40 lines) [x]

- **Description.** Declare pnpm 10.x as the package manager, set up the workspace declaration, add the root `package.json` with workspace scripts (`db:up`, `db:down`, `prisma migrate dev`, dev, build, lint, test, typecheck, bdd, e2e), and create `turbo.json` declaring every pipeline with `dependsOn`/`outputs` per design §3.2.
- **Discovery / file targets.** Create `pnpm-workspace.yaml` (`packages: ['apps/*', 'libs/*', 'tools/*']`), root `package.json` (declares `packageManager: "pnpm@10.x"` and the workspace scripts), `turbo.json` (pipelines: `build`, `dev`, `lint`, `test`, `typecheck`, `bdd`, `e2e`), `.editorconfig`, `.gitignore` (excludes `.env*`, `node_modules`, `dist`, `.next`, `.turbo`, `coverage`, `bdd-reports`, `playwright-report`, `test-results`), `.nvmrc` (Node 22 LTS pin).
- **TDD sequence.** **Not a TDD task** — pure config scaffolding; no behavior to drive. Verification is the pipeline itself exiting 0.
- **Verification.** `pnpm install` exits 0 with the empty workspace layout; `pnpm turbo run build lint typecheck` exits 0 even with empty workspaces (Turbo short-circuits empty workspaces).
- **Rollback.** `git revert <T1.1-sha>`.
- **Files touched (rough).** `pnpm-workspace.yaml`, `package.json`, `turbo.json`, `.editorconfig`, `.gitignore`, `.nvmrc` (~40 lines total).

### Task T1.2 — `tsconfig.base.json` with path aliases (~50 lines) [x]

- **Description.** Strict TypeScript base config (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: "Bundler"`, `target: "ES2022"`, `module: "ESNext"`) plus the workspace path aliases documented in design §3.3 (`@core/database`, `@core/events`, `@core/config`, `@features/auth`, `@features/transactions`, `@shared-utils/*`).
- **Discovery / file targets.** Create `tsconfig.base.json` at repo root.
- **TDD sequence.** **Not a TDD task.** Verification is `tsc --noEmit` across the (still empty) workspace.
- **Verification.** Add the base to one workspace; `pnpm turbo run typecheck` exits 0.
- **Rollback.** `git revert <T1.2-sha>`.
- **Files touched (rough).** `tsconfig.base.json` (~50 lines).

### Task T1.3 — ESLint flat config + custom boundary plugin (~80 lines) [x]

- **Description.** Stand up the flat config (`eslint.config.mjs`) and the custom boundary plugin in `tools/eslint-plugin-boundary/`. Four non-negotiable rules: `no-client-server-import` (blocks `*/server/*` imports into `*/client/*`), `no-cross-module-import` (blocks direct `libs/features/<other>` imports except via `@core/events` or shared ports), `no-prisma-outside-core` (blocks `new PrismaClient(` outside `libs/core/database/src/`), `no-schemas-outside-shared` (blocks Zod schemas outside `libs/features/*/shared/schemas/*` and `libs/core/config/env.schema.ts`). Optional fifth: `no-mojibake-in-docs` (blocks CJK codepoints in `Documents-es/**/*.md`). Each rule has a `valid.ts` and `invalid.ts` fixture under `tools/eslint-plugin-boundary/__fixtures__/<rule>/`.
- **Discovery / file targets.** Create `tools/eslint-plugin-boundary/` with `package.json`, `index.cjs`, and per-rule files (`rules/no-client-server-import.cjs`, etc.); `eslint.config.mjs` extends the plugin's `recommended` export; add fixtures under `tools/eslint-plugin-boundary/__fixtures__/{no-client-server-import,no-cross-module-import,no-prisma-outside-core,no-schemas-outside-shared}/{valid,invalid}.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR for each rule using its fixture pair. Order: `no-client-server-import` first (simplest AST match on import paths), then `no-prisma-outside-core` (AST match on `NewExpression` callee.name === 'PrismaClient'), then `no-schemas-outside-shared` (AST match on `CallExpression` callee starting with `z.` outside allowed paths), then `no-cross-module-import` (most subtle — needs to know `libs/features/<x>` imports vs the exception list).
- **Verification.** `pnpm turbo run lint` exits 0 across the workspace (no source code yet to violate); running `eslint tools/eslint-plugin-boundary/__fixtures__/<rule>/invalid.ts` reports the expected violation per rule (4 + optional 5 positive assertions). Add a dedicated fixture-test script: `pnpm turbo run lint:fixtures` runs through all `invalid.ts` files and asserts a non-empty violation count per file.
- **Rollback.** `git revert <T1.3-sha>`.
- **Files touched (rough).** `eslint.config.mjs`, `tools/eslint-plugin-boundary/**` (~80 lines).

### Task T1.4 — LICENSE (MIT) + README.md + CONTRIBUTING.md + AGENTS.md (~60 lines) [x]

- **Description.** Per Locked Decision #6 (`LICENSE = MIT`) and `openspec/config.yaml#docs`. `README.md` documents the publicable intent and the quickstart: `pnpm install`, `pnpm db:up`, `pnpm prisma migrate dev`, `pnpm dev`. `CONTRIBUTING.md` is a lightweight one-pager. `AGENTS.md` is the project-local conventions file — it mirrors the relevant subset of `openspec/config.yaml` for any agent that doesn't traverse the openspec folder.
- **Discovery / file targets.** Create `LICENSE` (MIT body, full text), `README.md`, `CONTRIBUTING.md`, `AGENTS.md`. Reference Engram conventions id 2129 (`branch-model`), 2132 (`doc-mirror-spanish`), 2133 (`ui-complete-not-scaffold`).
- **TDD sequence.** **Not a TDD task.**
- **Verification.** File presence + `wc -l LICENSE README.md CONTRIBUTING.md AGENTS.md` reports non-zero per file; `grep -F 'MIT License'` succeeds in `LICENSE`.
- **Rollback.** `git revert <T1.4-sha>`.
- **Files touched (rough).** `LICENSE`, `README.md`, `CONTRIBUTING.md`, `AGENTS.md` (~60 lines).

### Task T1.5 — `docker-compose.yml` for Postgres + db scripts (~20 lines) [x]

- **Description.** Single-service compose file with a Postgres 16 image, exposed on the default `5432`, healthcheck, and a named volume. Root scripts (in `package.json`) wrap the compose lifecycle: `db:up`, `db:down`, `db:reset` (`down -v && up -d`), `db:logs`.
- **Discovery / file targets.** Create `docker-compose.yml`, add `scripts` entries in root `package.json` (`db:up`, `db:down`, `db:reset`, `db:logs`). Database connection string `DATABASE_URL=postgres://postgres:postgres@localhost:5432/gastos_reference` appears in `.env.example` (T1.6 / Slice 2 will reference it).
- **TDD sequence.** **Not a TDD task.** Verification is the service health check.
- **Verification.** `pnpm db:up && docker compose ps` reports the `postgres` service healthy; `pnpm db:down && docker compose ps` shows the service gone.
- **Rollback.** `git revert <T1.5-sha>`.
- **Files touched (rough).** `docker-compose.yml`, root `package.json` updates (~20 lines).

### Task T1.6 — `apps/web` scaffold (Next.js 15 minimal) (~30 lines) [x]

- **Description.** Bootstrap the Next.js 15 App Router workspace with the `app/[locale]/layout.tsx` shell — but with placeholders only: the layout renders `<html lang={locale}>` and `{children}`, no providers yet, no UI primitives yet (those land in Slice 4). `next.config.ts` is minimal (no `createNextIntlPlugin` yet — added in Slice 4). No `package.json` deps beyond what Next 15 requires (`next`, `react`, `react-dom`, `typescript`).
- **Discovery / file targets.** Create `apps/web/{package.json,tsconfig.json,next.config.ts,app/[locale]/layout.tsx,app/[locale]/page.tsx}`. The `tsconfig.json` extends `tsconfig.base.json` and declares path aliases. **`next.config.ts` and `package.json` get full deps in Slice 4** — this slice adds only the minimum to compile an empty landing page.
- **TDD sequence.** **Not a TDD task** here. Smoke check: `pnpm --filter web build` produces `.next/` artifacts; `pnpm --filter web dev` boots without throwing.
- **Verification.** `pnpm turbo run build` produces `apps/web/.next/`; `pnpm turbo run typecheck` exits 0; `pnpm turbo run lint` exits 0.
- **Rollback.** `git revert <T1.6-sha>`.
- **Files touched (rough).** `apps/web/**` (~30 lines).

### Task T1.7 — `apps/api` scaffold (NestJS 10 minimal) (~30 lines) [x]

- **Description.** Bootstrap the NestJS 10 workspace on port 3001 with a single `app.module.ts` that imports nothing yet (no feature modules wired — those land in Slices 3 and 5). `main.ts` calls `NestFactory.create(AppModule)` and listens on `process.env.PORT ?? 3001`. Add `@nestjs/{config,common,core}` and `reflect-metadata` to `apps/api/package.json`. Nest-cli.json + tsconfig.json as the boot needs.
- **Discovery / file targets.** Create `apps/api/{package.json,tsconfig.json,nest-cli.json,src/main.ts,src/app.module.ts}`. `tsconfig.json` extends `tsconfig.base.json`.
- **TDD sequence.** **Not a TDD task.** Smoke check: `pnpm --filter api build` emits `apps/api/dist/`; `pnpm --filter api start` boots `Nest application successfully started` on :3001 and exits 0 on `SIGTERM`.
- **Verification.** `pnpm turbo run build` produces `apps/api/dist/`; `pnpm turbo run typecheck` exits 0; `pnpm turbo run lint` exits 0.
- **Rollback.** `git revert <T1.7-sha>`.
- **Files touched (rough).** `apps/api/**` (~30 lines).

### Task T1.8 — `docs/architecture.md` stub + Spanish mirror (~30 lines) [x]

- **Description.** Stub `docs/architecture.md` with the six headings from design §1–§11 (`Overview`, `Repository layout`, `Monorepo tooling`, `Domain design: auth`, `Domain design: transactions`, `Cross-cutting concerns`). Each section gets 2–4 lines of placeholder prose; full content lands in Slice 8. Produce the Spanish mirror under `Documents-es/docs/architecture.md` in the **same atomic commit** (convention id 2132).
- **Discovery / file targets.** Create `docs/architecture.md` and `Documents-es/docs/architecture.md`.
- **TDD sequence.** **Not a TDD task.**
- **Verification.** Both files exist and are non-empty (`wc -l`); `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture.md` returns empty (CJK check, convention id 2132).
- **Rollback.** `git revert <T1.8-sha>`.
- **Files touched (rough).** `docs/architecture.md`, `Documents-es/docs/architecture.md` (~30 lines).

**Slice 1 total: ~280 changed lines.** Verification gate: `pnpm turbo run build lint typecheck` exits 0; both apps boot; Postgres is healthy; boundary rules + fixtures fire on the `invalid.ts` cases.

---

## Slice 2: `libs/core` + `libs/shared-utils`

**Goal.** Bring up the shared infrastructure that every feature slice depends on: the Prisma client singleton, the Zod env config, the in-memory event dispatcher, and the pure helper utilities. **No feature business logic.** All scaffolding is verified by builds and unit tests on the utilities.
**Start.** Slice 1 merged into `feat/vertical-slicing-reference-scaffold`.
**Finish.** `pnpm prisma migrate dev` creates the auth tables; `pnpm turbo run build lint typecheck test` exits 0; env schema is imported at the top of `apps/web` and `apps/api` startup.
**Verification.** `pnpm install && pnpm prisma migrate dev && pnpm turbo run build lint typecheck test` exits 0; a runtime smoke check on `apps/api` boot fails-fast if env vars are missing.
**Rollback.** Per atomic commit (`git revert <task-sha>`); the slice's commit chain is revertible as a group because no slice depends on this slice's internal details — only its public API.

### Task T2.1 — `libs/core/database` (Prisma client singleton + initial schema) (~80 lines) [x]

- **Description.** Create the Prisma schema covering the auth slice tables (`User`, `Account`, `Session`, `VerificationToken`, `PasswordResetToken`, `Role` enum). Transactions tables land in Slice 5. The schema lives at `libs/core/database/prisma/schema.prisma`; the client singleton lives in `libs/core/database/src/client.ts` and is the **only** place `new PrismaClient()` is permitted. Re-export the typed client from `libs/core/database/src/index.ts` as `@core/database`.
- **Discovery / file targets.** Create `libs/core/database/{package.json,tsconfig.json,prisma/schema.prisma,src/client.ts,src/index.ts}`. Migrations live under `libs/core/database/prisma/migrations/`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: write a Vitest unit test (`libs/core/database/src/__tests__/client.test.ts`) that imports `@core/database` twice and asserts the same identity (singleton). GREEN: implement the singleton with the `globalThis` cache pattern. TRIANGULATE: add a test that `pnpm prisma generate` produces `@prisma/client` types referenced by `client.ts`. REFACTOR: ensure no business code imports `new PrismaClient()` anywhere (the ESLint rule from T1.3 will catch a regression).
- **Verification.** `pnpm --filter @core/database exec prisma migrate dev --name init` applies the migration; `pnpm turbo run test --filter @core/database` passes; `pnpm turbo run lint` reports zero violations across the workspace.
- **Rollback.** `git revert <T2.1-sha>` removes the migration + client; `pnpm prisma migrate reset` if the DB was applied locally before revert.
- **Files touched (rough).** `libs/core/database/**` (~80 lines).

### Task T2.2 — `libs/core/config` (Zod env schema at startup) (~50 lines) [x]

- **Description.** Validate `process.env` at startup with a Zod schema; export a typed `env` object. Required vars: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PORT` (default 3001), `WEB_ORIGIN` (CORS origin), `NODE_ENV`. The schema **fails-fast** at import time — a missing or malformed var throws with a descriptive error.
- **Discovery / file targets.** Create `libs/core/config/{env.schema.ts,env.ts,index.ts,__tests__/env.test.ts}`. Add `libs/core/config` as a dependency of `apps/api` and `apps/web` so they import `env` at the top of their entry files.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: write a test for `envSchema.safeParse({})` returning `success: false` with the expected field paths; GREEN: implement the schema; TRIANGULATE: add a test for `process.env` mutation across tests (the schema caches the parse result by default — confirm behavior); REFACTOR: extract a `parseEnv()` helper to allow test-time overrides.
- **Verification.** `pnpm turbo run test --filter @core/config` passes; `pnpm --filter api build` rejects the build when `DATABASE_URL` is missing (set `DATABASE_URL=` and confirm `tsc --noEmit` errors or runtime import throws a `ZodError`).
- **Rollback.** `git revert <T2.2-sha>`.
- **Files touched (rough).** `libs/core/config/**` (~50 lines).

### Task T2.3 — `libs/core/events` (in-memory dispatcher + event types) (~80 lines) [x]

- **Description.** Tiny pub/sub dispatcher with `dispatch(event)` and `subscribe(name, handler)` returning an unsubscribe function. `types.ts` declares the **9 domain events** from design §4.7 + §5.9: `auth.password-reset.requested`, `auth.password-reset.completed`, `auth.session.revoked`, `auth.rbac.denied`, `transactions.created`, `transactions.updated`, `transactions.soft-deleted`, `transactions.fx.stale`, `transactions.threshold.exceeded`. Each event has a Zod payload schema. The dispatcher keeps a 100-entry ring buffer per user (used by the dev mailbox in Slice 4).
- **Discovery / file targets.** Create `libs/core/events/{package.json,tsconfig.json,src/dispatcher.ts,src/types.ts,src/index.ts,src/__tests__/dispatcher.test.ts,src/__tests__/types.test.ts}`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: write a test that `dispatch({name:'x',payload:{}})` calls a subscribed handler exactly once; GREEN: implement the dispatcher; TRIANGULATE: multiple subscribers, unsubscribe, error in one subscriber doesn't break the others; REFACTOR: separate event-name validation from dispatch (single `parse` call at the boundary).
- **Verification.** `pnpm turbo run test --filter @core/events` passes (≥6 cases: single subscriber, multiple subscribers, unsubscribe, error isolation, ring-buffer trim, replay of last N events).
- **Rollback.** `git revert <T2.3-sha>`.
- **Files touched (rough).** `libs/core/events/**` (~80 lines).

### Task T2.4 — `libs/shared-utils/{date-formatting,currency,decimal}` (~60 lines) [x]

- **Description.** Three pure-helper packages: `date-formatting` (timezone-safe formatting using `Intl.DateTimeFormat`, ISO 8601 parsing), `currency` (format `Decimal` to localized currency strings), `decimal` (wrappers around `decimal.js` for monetary math — per D-TX-6, **never `BigInt`**). Each is exported via barrel `index.ts`. Pure functions, no I/O, no framework deps.
- **Discovery / file targets.** Create `libs/shared-utils/{package.json,date-formatting/{tsconfig.json,src/index.ts,src/__tests__/date-formatting.test.ts},currency/{tsconfig.json,src/index.ts,src/__tests__/currency.test.ts},decimal/{tsconfig.json,src/index.ts,src/__tests__/decimal.test.ts}}`. Root `tsconfig.base.json` exposes `@shared-utils/*` aliases (T1.2).
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR per package. RED: tests for each public function (format ISO string, format in a specified locale, parse + emit; format `Decimal('1234.56')` to `'$1,234.56'`; `add`/`subtract`/`compare` of `Decimal` values with the expected behavior). GREEN: implement with `decimal.js` for `decimal`, native `Intl` for the rest. TRIANGULATE: edge cases (negative values, locale fallbacks, `decimal.js` precision settings). REFACTOR: extract a shared `toDecimal(input: string | number | Decimal)` guard.
- **Verification.** `pnpm turbo run test --filter @shared-utils/*` passes for all three packages; `pnpm turbo run lint` reports zero violations; `pnpm turbo run typecheck` exits 0.
- **Rollback.** Per atomic commit (`git revert <T2.4-sha>`); each helper package's commit is independent.
- **Files touched (rough).** `libs/shared-utils/**` (~60 lines).

### Task T2.5 — First-run validation gate (~0 new lines, ~50 verification-only commands) [x]

- **Description.** Run the full pipeline end-to-end on a clean clone to prove the skeleton + core libs work together. This task is **verification-only** — no new code beyond the validation matrix itself; if a check fails, file a fix-task against the offending slice's task.
- **Discovery / file targets.** No new files; produce `docs/first-run-checklist.md` (≤30 lines) capturing the commands so `sdd-verify` can replay them. The checklist must end with the success criterion: **"all exit 0"**.
- **TDD sequence.** **Not a TDD task.** This task is a gate-check.
- **Verification.** `pnpm install && pnpm prisma migrate dev && pnpm turbo run build lint typecheck test` exits 0; `docker compose ps` shows Postgres healthy; `pnpm db:down && pnpm db:up` round-trips cleanly.
- **Rollback.** N/A (verification only).
- **Files touched (rough).** `docs/first-run-checklist.md` (~30 lines of doc, plus the verification commands).

**Slice 2 total: ~250 changed lines.** Verification gate: env schema fails-fast at startup; dispatcher unit tests pass; pure helpers have ≥80% line coverage; build/lint/typecheck/test all exit 0.

---

## Slice 3: Auth server (vertical slice 1)

**Goal.** Implement every auth requirement from `specs/auth/spec.md` **on the server side only** (no UI yet). The slice ships AuthService, SessionService, RbacService, PasswordResetService, NextAuth v5 config, NestJS thin wrapper, and the four emitted events. BDD and UI land in Slices 4 and 7.
**Start.** Slice 2 merged into the tracker branch.
**Finish.** `POST /auth/login`, `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/sessions`, `DELETE /auth/sessions/:id` all return correct status codes on every coded scenario; the four auth events are emitted; `RbacService.can(user, action, resource)` rejects non-permitted actions.
**Verification.** `pnpm turbo run lint typecheck test --filter @features/auth --filter api` exits 0; manual `curl` against `apps/api:3001` matches expectations on the six endpoints.
**Rollback.** Per atomic commit (`git revert <task-sha>`); reverting any single task drops the corresponding service surface.

### Task T3.1 — RED: write failing Vitest tests for `AuthService.login` (~30 lines) [x]

- **Description.** Write the failing test FIRST for the AuthService login happy + invalid-credential paths (per strict-tdd.md). The tests import the service from `@features/auth/server` and assert the contract — `verifyPassword(email, password)` returns the user record on a match and `null` on mismatch/absence.
- **Discovery / file targets.** Create `libs/features/auth/server/services/__tests__/auth.service.test.ts`. Use Vitest; mock `UserRepository` (interface declared in T3.4). Bcrypt cost factor is fixed at 10 (design §4.1).
- **TDD sequence.** **This task is the RED step for T3.4.** The test fails because `AuthService` doesn't exist yet.
- **Verification.** `pnpm --filter @features/auth exec vitest run services/__tests__/auth.service.test.ts` exits non-zero (RED).
- **Rollback.** `git revert <T3.1-sha>`.
- **Files touched (rough).** 1 test file (~30 lines).

### Task T3.2 — `libs/features/auth/shared/schemas` (Zod single source of truth) (~50 lines)

- **Description.** Create the five Zod schemas declared in design §4.2 (`login.ts`, `register.ts`, `forgot-password.ts`, `reset-password.ts`, `session-list.ts`). Each exports `{ schema, type }` inferred from the schema. NO class-validator anywhere (design §6.1).
- **Discovery / file targets.** Create `libs/features/auth/shared/schemas/{login,register,forgot-password,reset-password,session-list}.ts` and `libs/features/auth/shared/schemas/index.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: a unit test (`libs/features/auth/shared/schemas/__tests__/schemas.test.ts`) asserts each schema rejects malformed input (bad email, short password, etc.) and accepts well-formed input. GREEN: implement the schemas. TRIANGULATE: edge cases (Unicode names, very long inputs at the validation boundary). REFACTOR: extract a `passwordPolicy()` helper.
- **Verification.** `pnpm turbo run test --filter @features/auth` passes the schema tests; `pnpm turbo run lint` reports zero violations and the `no-schemas-outside-shared` rule does NOT fire (because the schemas are inside `shared/schemas/`).
- **Rollback.** `git revert <T3.2-sha>`.
- **Files touched (rough).** `libs/features/auth/shared/**` (~50 lines).

### Task T3.3 — `libs/features/auth/server/auth.config.ts` (NextAuth v5) (~50 lines)

- **Description.** NextAuth v5 config: `CredentialsProvider` (delegates to `AuthService.verifyPassword`), `GoogleProvider` (uses `clientId`/`clientSecret` from env; happy-stub via `NEXTAUTH_URL` switch), `@auth/prisma-adapter` against `@core/database`, JWT strategy, callbacks (`jwt` embeds `role` + `userId`; `session` projects them). `pages.signIn` is a locale-aware factory resolved at runtime.
- **Discovery / file targets.** Create `libs/features/auth/server/auth.config.ts` and `libs/features/auth/server/__tests__/auth.config.test.ts` (asserts the providers array contains exactly `credentials` + `google`, that the adapter is wired, and that the JWT callback populates `token.role` on first sign-in).
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: tests as above (failing). GREEN: implement the config. TRIANGULATE: assert session projection (`session({session,token})` returns `session.user.role === 'admin'` for an admin token). REFACTOR: extract a `buildAuthOptions()` factory so tests can vary env.
- **Verification.** `pnpm turbo run test --filter @features/auth` passes; `pnpm turbo run lint` exits 0; the `no-prisma-outside-core` rule does NOT fire (adapter is the boundary, but `new PrismaClient()` is never imported here).
- **Rollback.** `git revert <T3.3-sha>`.
- **Files touched (rough).** `libs/features/auth/server/auth.config.ts` + test (~50 lines).

### Task T3.4 — Auth services (AuthService, SessionService, RbacService, PasswordResetService) (~150 lines)

- **Description.** Implement the four services per design §4.1. `AuthService`: `verifyPassword`, `register`, `linkGoogleAccount`, `getCurrentUser`. `SessionService`: `listActiveSessions`, `revokeSession`, `purgeExpired`. `RbacService`: permission table per design §4.1, single `can(user, action, resource)` entry point used by every guard. `PasswordResetService`: `requestReset` mints a token + dispatches `auth.password-reset.requested`; `consumeReset` validates + replaces `passwordHash` + marks consumed + dispatches `auth.password-reset.completed`. Define `UserRepository`, `SessionRepository`, `PasswordResetTokenRepository` interfaces in this slice (adapters land in a follow-up task within the same slice).
- **Discovery / file targets.** Create `libs/features/auth/server/services/{auth.service.ts,session.service.ts,rbac.service.ts,password-reset.service.ts}`, interface files under `libs/features/auth/server/domain/interfaces/{user,session,password-reset-token}.repository.ts`, and tests under `libs/features/auth/server/services/__tests__/{auth,session,rbac,password-reset}.service.test.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR per service. GREEN lands the interfaces and concrete classes wired to in-memory fake repos (real Prisma repos land in T3.5's neighbor — keep concerns separate). TRIANGULATE: RBAC scenarios (admin may `transaction:read:any`, user may NOT; cross-user session revoke rejected for `user`, allowed for `admin`); password reset race (same token twice); session expiry; mocked email capture produced.
- **Verification.** `pnpm turbo run test --filter @features/auth` passes all four service suites; at least 12 RBAC scenarios are exercised; `pnpm turbo run lint` exits 0.
- **Rollback.** `git revert <T3.4-sha>`.
- **Files touched (rough).** `libs/features/auth/server/{services,domain/interfaces}/**` + tests (~150 lines).
- **Sub-progress (slice 3 batch 1 + batch 2).** AuthService covered across two slices: T3.1+T3.2 (slice 3 batch 1) landed `login`; slice 3 batch 2 (PR #6) added `register` (5 tests passing) + `Email verification` + `Email uniqueness check` + `bcrypt cost factor 10`. SessionService shape landed in slice 3 batch 2 (PR #6) with `getCurrentUser` + `revokeSession` + `revokeAllSessions` (7 tests passing); NextAuth adapter call sites deferred. **RbacService and PasswordResetService remain pending.**
- **Sub-progress (slice 3 batch 3).** `RbacService` landed (PR #7 pending) — `can(actor, action, resource)` with the full permission table per design §4.1 (USER + 4 `*:own` actions; ADMIN + all 8). 11 tests passing. `Action` type is a closed string-literal union (`Action` defense in depth at type level; runtime lookup returns `false` for unknown values).
- **Sub-progress (slice 3 batch 4 — PR pending this batch).** `PasswordResetService` landed at `libs/features/auth/server/src/password-reset.service.ts` (239 lines, 7 tests). `requestReset(email)` mints a 32-byte random token (64 hex chars, always ≥32), persists a `PasswordResetToken` row with `tokenHash = sha256(rawToken)` + `expiresAt = now + 1h`, and dispatches `auth.password-reset.requested` with the RAW token in the payload (dev mailbox only). Unknown-email lookup returns silently (no event, no row). `consumeReset(rawToken, newPassword)` shas the raw, looks up the row, throws `AuthError('INVALID_RESET_TOKEN')` with the GENERIC message `"invalid reset token"` for unknown / expired / consumed (no enumeration side-channel), else `userRepo.updatePassword(userId, await bcrypt.hash(newPassword, 10))` + `tokenRepo.markConsumed` + dispatches `auth.password-reset.completed`. `INVALID_RESET_TOKEN` added to the `AuthErrorCode` union. `UserRepository` port extended with `updatePassword(id, hashedPassword)` (consumed only by the GREEN commit of this batch — AuthService still calls `prisma.user.create` directly; the refactor is a batch 5+ concern).
- **Task stays open** until all four services (AuthService + SessionService + RbacService + PasswordResetService) are complete AND the canonical `shared/schemas/` lands (T3.2). After slice 3 batch 4: AuthService (login, register, getCurrentUser, linkGoogleAccount deferred) + SessionService (list, revoke, getCurrentUser) + RbacService + **PasswordResetService (DONE in slice 3 batch 4)**.
- **Sub-task brief-T3.4 (RbacService) [x]** — slice 3 batch 3. Permission table matrix exactly per design §4.1; no extra actions invented. Files: `src/rbac-service.ts` (140 lines), `src/__tests__/rbac-service.test.ts` (11 tests).
- **Sub-task brief-T3.4 (PasswordResetService) [x]** — slice 3 batch 4. `requestReset` + `consumeReset` per design §4.1 with the four security invariants (raw token never persisted, unknown-email silent return, generic error copy for consumed/expired/unknown, bcrypt cost factor 10 asserted by the exact `bcrypt.hash(newPassword, 10)` shape). 7 tests passing; service lives at `src/password-reset.service.ts` (239 lines, all four services in this slice are flat under `src/`, NOT in a `services/` subdirectory — the brief's `services/` path was inconsistent with the established pattern; the GREEN commit honored the existing flat layout).

### Task T3.5 — `libs/features/auth/server/events.ts` (event emission wiring) (~30 lines)

- **Description.** Wire the four auth events (`auth.password-reset.requested`, `auth.password-reset.completed`, `auth.session.revoked`, `auth.rbac.denied`) to the dispatcher. The wiring is a thin subscription file imported at NestJS startup. Add a `PrismaUserRepository`, `PrismaSessionRepository`, `PrismaPasswordResetTokenRepository` so the NestJS module can wire real implementations in T3.6.
- **Discovery / file targets.** Create `libs/features/auth/server/events.ts`, `libs/features/auth/server/infrastructure/repositories/{prisma-user,prisma-session,prisma-password-reset-token}.repository.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: a test asserts `PasswordResetService.requestReset` dispatches `auth.password-reset.requested` exactly once with the expected payload. GREEN: implement the dispatcher injection. TRIANGULATE: `consumeReset` dispatches `auth.password-reset.completed`; `revokeSession` dispatches `auth.session.revoked`; failed `RbacService.can` (returning `false` after evaluation) dispatches `auth.rbac.denied`. REFACTOR: extract a `dispatchAuthEvent(name, payload)` helper.
- **Verification.** `pnpm turbo run test --filter @features/auth` passes the new event tests; `pnpm turbo run lint` exits 0.
- **Rollback.** `git revert <T3.5-sha>`.
- **Files touched (rough).** `libs/features/auth/server/{events.ts,infrastructure/repositories/**}` + tests (~30 lines).
- **Sub-progress (slice 3 batch 3).** `wireAuthEvents` landed (PR #7 pending) — monkey-patches `SessionService.revokeSession` to dispatch `auth.session.revoked` and wraps `RbacService.can` to dispatch `auth.rbac.denied` on `false`. `PrismaUserRepository` shipped as the first `@core/database` integration adapter (the rest land in batch 4+). 4 event tests passing. PasswordResetService-driven events (`auth.password-reset.requested` / `.completed`) deferred to slice 3 batch 4+.
- **Sub-progress (slice 3 batch 4 — PR pending this batch).** Pattern A adopted for the password-reset events (canonical design §4.1): `PasswordResetService` takes the dispatcher in its constructor and dispatches directly. `wireAuthEvents` is unchanged — it still wraps only SessionService.revokeSession + RbacService.can. The slice 3 batch 4 events.test.ts extension adds 4 new cases (requestReset with known / unknown email → 0 or 1 dispatch with the canonical payload; consumeReset valid / invalid → the `completed` event only fires on the valid path). Total events.test.ts count: 8 (4 batch 3 + 4 batch 4). `PrismaPasswordResetTokenRepository` shipped as the second `@core/database` integration adapter (6 tests covering create / findByHash / markConsumed against the sandboxed Prisma mock — no real Postgres required for the unit-level coverage). JSDoc on `events.ts` and `events.test.ts` aligned with the canonical `@core/events` Zod schemas (cross-ref to `libs/core/events/src/types.ts` added).
- **Sub-task brief-T3.5 (events wiring partial) [x]** — slice 3 batch 3. Wired SessionService.revokeSession + RbacService.can. userId recovered via `sessionService.getCurrentUser(token)` before the delete. PrismaUserRepository implements UserRepository port (findById + findByEmail); AuthService / SessionService NOT yet refactored to use the port — that's a batch 4+ concern.
- **Sub-task brief-T3.5b (PasswordResetTokenRepository port + Prisma adapter) [x]** — slice 3 batch 4. Port at `domain/interfaces/password-reset-token.repository.ts` with `PasswordResetTokenRecord` (id, userId, tokenHash, expiresAt, consumedAt). Prisma adapter at `infrastructure/repositories/prisma-password-reset-token.repository.ts` (124 lines, 6 tests covering create / findByHash / markConsumed; P2025 on markConsumed is idempotent no-op; FK violation propagates). `markConsumed` swallows P2025 for idempotency. Brief divergence: project uses PostgreSQL (docker-compose.yml), not sqlite as the brief assumed; the existing test pattern uses `vi.mock('@core/database')` which the new tests follow (record this for the slice-3 verify batch).
- **Sub-task brief-T3.5c (events extension) [x]** — slice 3 batch 4. 4 new event tests in `events.test.ts` covering the password-reset dispatch path (Pattern A — service dispatches directly via the constructor-injected dispatcher, no `wireAuthEvents` wrapper). The 4 tests cover: requestReset known email → 1 dispatch with auth.password-reset.requested and the canonical payload (token matches sha256(persisted tokenHash)); requestReset unknown email → 0 dispatches; consumeReset valid token → 2 dispatches (requested from the prior requestReset + completed with { userId, resetAt }); consumeReset invalid token → 1 dispatch (only the prior requested, NO completed). Pattern A is the post-cleanup shape called out in slice 3 batch 3 apply-progress risk_flag #3; the new service is the first to model it from day one.

### Task T3.6 — `apps/api/modules/auth` (NestJS thin wrapper) (~50 lines)

- **Description.** Per design §2: `apps/api/modules/auth` is a **thin NestJS wrapper** that does DI wiring + route binding only — no business code. It declares the six routes (T3 design §4.1's `auth.controller.ts` table) using `@Body(<zodSchema>)` decorator helper (design §6.1) to wire `ZodValidationPipe`.
- **Discovery / file targets.** Create `apps/api/modules/auth/{auth.module.ts,auth.controller.ts}` and `apps/api/src/shared/pipes/zod-validation.pipe.ts` + `apps/api/src/shared/decorators/body.decorator.ts`. Add NestJS guards: `apps/api/src/shared/guards/jwt.guard.ts` that validates the NextAuth session JWT.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR at the controller level. RED: a Nest e2e test (`apps/api/test/auth.e2e-spec.ts`) calls `POST /auth/login` with valid credentials and asserts 201 + cookie. GREEN: implement the controller. TRIANGULATE: invalid creds → 401; missing JWT → 401; expired JWT → 401; `DELETE /auth/sessions/:id` → 204; `GET /auth/sessions` → 200 with the array. REFACTOR: extract `AppModule` to compose `AuthModule` + `ThrottlerModule` (deferred).
- **Verification.** `pnpm turbo run test --filter api` passes the e2e suite (with Postgres spun up via docker-compose for the prisma adapters); `pnpm turbo run lint typecheck` exits 0.
- **Rollback.** `git revert <T3.6-sha>`.
- **Files touched (rough).** `apps/api/modules/auth/**` + `apps/api/src/shared/**` (~50 lines).

### Task T3.7 — TRIANGULATE: full happy-path + RBAC enforcement scenarios (~40 lines)

- **Description.** Add the cross-cutting scenarios that aren't single-service: e.g., "registered user signs in via Credentials then later via Google — both resolve to the same `User.id`", "expired session JWT returns 401", "forgot-password for an unknown email returns 202 (idempotent, no enumeration leak)". Each scenario already maps to a spec scenario; this task wires the test bodies that span multiple services.
- **Discovery / file targets.** Add tests to `libs/features/auth/server/__tests__/integration/` (new folder): `multi-provider.test.ts`, `session-expiry.test.ts`, `forgot-password-idempotency.test.ts`.
- **TDD sequence.** All three tests written first (RED for any failures from earlier GREEN), then exercise the assertions. Where earlier slices (T3.3–T3.6) already implemented the behavior, this task is a regression net.
- **Verification.** `pnpm turbo run test --filter @features/auth` passes the three integration suites; `pnpm turbo run lint typecheck` exits 0.
- **Rollback.** `git revert <T3.7-sha>`.
- **Files touched (rough).** Test files (~40 lines).

### Task T3.8 — REFACTOR: extract duplication + ensure ESLint boundaries clean (~10 lines + refactor)

- **Description.** Pure refactor task: scan the slice for duplication (e.g., `bcrypt.compare` calls, `findByEmail` patterns); extract helpers; rerun the boundary rule fixtures to prove no rule regressed.
- **Discovery / file targets.** No new files; refactors touch `libs/features/auth/server/services/**/*.ts`.
- **TDD sequence.** **Refactor only.** Test suite must stay green across all changes (per testing-standards: refactoring is not part of the RED-GREEN loop).
- **Verification.** `pnpm turbo run test --filter @features/auth` stays green; `pnpm turbo run lint` reports zero violations AND the fixture sanity check (`pnpm turbo run lint:fixtures`) still passes for all four boundary rules.
- **Rollback.** `git revert <T3.8-sha>`.
- **Files touched (rough).** ~10 net-new lines.

### Task T3.9 — Slice-wide `turbo run lint typecheck test` green (~0 lines, gate check)

- **Description.** Final gate check for Slice 3. No new code; produce a one-page checklist in `docs/slice-3-checklist.md` so `sdd-verify` can replay it. Includes the four forced-violation ESLint checks against the fixtures.
- **Discovery / file targets.** Create `docs/slice-3-checklist.md`.
- **TDD sequence.** **Not a TDD task** — verification gate.
- **Verification.** `pnpm turbo run lint typecheck test` exits 0 across `apps/api` and `libs/features/auth`.
- **Rollback.** N/A.
- **Files touched (rough).** `docs/slice-3-checklist.md` (~30 lines of doc).

**Slice 3 total: ~390 changed lines.** Verification gate: G17 (shared Zod schemas reused on server), G20 (Credentials + Google in parallel against `@auth/prisma-adapter`), G21 (password reset + mocked email), G22 (sessions list + revoke), G23 (RBAC in domain layer).

---

## Slice 4: Auth client + i18n + shadcn

**Goal.** Surface every server slice from Slice 3 on the web app with locale-prefixed routes through `next-intl`, shadcn-style primitives installed locally (no CLI), extracted design tokens, and **complete-final UI per convention id 2133** (5 form states, WCAG AA, responsive, component tests).
**Start.** Slice 3 merged.
**Finish.** Every auth screen (`sign-in`, `sign-up`, `forgot-password`, `reset-password/[token]`, `dev/mailbox/[userId]`) renders in `/en/...` and `/es/...`; each form implements all 5 states; WCAG AA audit passes per screen; the four-state component tests pass per form.
**Verification.** `pnpm turbo run lint typecheck test --filter web` exits 0; `@axe-core/playwright` audit reports zero violations per critical screen; manual keyboard tab-test passes on each form.
**Rollback.** Per atomic commit; the slice's commit chain is revertible as a group because no slice depends on internal CSS-class names.

### Task T4.1 — RED: component test for `LoginForm` happy path (~25 lines)

- **Description.** Write the failing test FIRST: a Vitest + Testing Library test that mounts `LoginForm` with `next-intl` provider stubbed, asserts the empty state is visible on initial render, types a valid email + password, submits, and asserts the loading state transitions to the success state's destination redirect mock.
- **Discovery / file targets.** Test file at `libs/features/auth/client/components/__tests__/login-form.test.tsx`; component file at `libs/features/auth/client/components/LoginForm.tsx` is just a stub for now.
- **TDD sequence.** RED (test fails because stub form has no behavior).
- **Verification.** `pnpm --filter @features/auth exec vitest run client/components/__tests__/login-form.test.tsx` exits non-zero (RED).
- **Rollback.** `git revert <T4.1-sha>`.
- **Files touched (rough).** Test + stub (~25 lines).

### Task T4.2 — `apps/web/messages/{en,es}.json` (i18n catalogs) (~40 lines)

- **Description.** Boot the `next-intl` catalogs with the auth-slice keys: `auth.signIn.title`, `auth.signIn.email`, `auth.signIn.password`, `auth.signIn.submit`, `auth.signIn.error.invalidCredentials`, `auth.signUp.*`, `auth.forgotPassword.*`, `auth.resetPassword.*`, `auth.sessions.*`, `auth.devMailbox.*` (later slices add the transactions keys). Minimum coverage: every screen has at least a title + one CTA + one error string in both locales.
- **Discovery / file targets.** Create `apps/web/messages/en.json` and `apps/web/messages/es.json`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: a snapshot test asserts both catalogs contain the expected keys. GREEN: implement the keys. TRIANGULATE: assert `es.json` does not contain English-only keys (i.e., the catalogs are kept in sync). REFACTOR: split into per-namespace files if catalogs grow.
- **Verification.** `pnpm turbo run test --filter web` passes; `pnpm turbo run lint` exits 0.
- **Rollback.** `git revert <T4.2-sha>`.
- **Files touched (rough).** `apps/web/messages/**` (~40 lines).

### Task T4.3 — `apps/web/middleware.ts` (next-intl locale detection) (~25 lines)

- **Description.** Per design §6.3: `createMiddleware` from `next-intl/middleware` with `locales: ['en', 'es']`, `defaultLocale: 'en'`, `localePrefix: 'always'`. Routes `/sign-in` redirect to `/en/sign-in`; visiting `/es/sign-in` keeps Spanish.
- **Discovery / file targets.** Create `apps/web/middleware.ts`. Add `next-intl` to `apps/web/package.json` (deps from design §6.5).
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: an integration test asserts a request to `/sign-in` produces a 307/308 to `/en/sign-in`. GREEN: implement the middleware. TRIANGULATE: `/es/sign-in` is unchanged; deep paths like `/en/sign-in/foo` redirect to canonical. REFACTOR: extract the locale list to a constant.
- **Verification.** `pnpm turbo run test --filter web` passes the locale tests; `pnpm --filter web dev` boots and a `curl /sign-in` returns the locale redirect.
- **Rollback.** `git revert <T4.3-sha>`.
- **Files touched (rough).** `apps/web/middleware.ts` + `apps/web/i18n.ts` + test (~25 lines).

### Task T4.4 — `apps/web/components/ui/{button,input,form,card}.tsx` (~25 lines)

- **Description.** Hand-written shadcn-style primitives (per UI-1 in proposal §11.1). Each is a thin wrapper over `@radix-ui/react-*` (slot, label) with `class-variance-authority` for variants and `tailwind-merge` for the merge step. **NO `shadcn-ui` CLI** — files are committed and editable. Install peer deps: `@radix-ui/react-slot`, `@radix-ui/react-label`, `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`.
- **Discovery / file targets.** Create `apps/web/components/ui/{button,input,form,card}.tsx`. Update `apps/web/package.json`.
- **TDD sequence.** Not a TDD task — but each primitive has a Vitest + Testing Library snapshot test asserting class names render correctly (`button.test.tsx`: render `<Button>`, expect `data-slot="button"`; ref-merging works for `className="bg-red-500"` overriding the default variant, etc.).
- **Verification.** `pnpm turbo run test --filter web` passes the primitive tests; `pnpm turbo run lint` exits 0; `pnpm --filter web build` succeeds (Tailwind classes survive the build).
- **Rollback.** `git revert <T4.4-sha>`.
- **Files touched (rough).** `apps/web/components/ui/**` + `apps/web/package.json` (~25 lines of source — most files are well-established shadcn patterns).

### Task T4.5 — `apps/web/lib/utils.ts` (cn helper) (~5 lines)

- **Description.** `cn(...inputs: ClassValue[]) = twMerge(clsx(inputs))`. Used by every primitive and every form.
- **Discovery / file targets.** Create `apps/web/lib/utils.ts`. Add a tiny unit test that asserts `cn('p-2','p-4')` resolves to `'p-4'`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR (per testing-standards: this is a pure helper; one test is enough).
- **Verification.** `pnpm turbo run test --filter web` passes; `pnpm turbo run lint` exits 0.
- **Rollback.** `git revert <T4.5-sha>`.
- **Files touched (rough).** `apps/web/lib/utils.ts` + test (~5 lines).

### Task T4.6 — `apps/web/components.json` (minimal shadcn manifest) (~10 lines)

- **Description.** Per UI-1: a minimal shadcn-style manifest documenting the primitive set so a future operator knows the configuration. **The CLI is NOT used**; this is a documentation artifact (per design §6.5).
- **Discovery / file targets.** Create `apps/web/components.json` matching design §6.5.
- **TDD sequence.** Not a TDD task. Verification is presence + structural JSON validity.
- **Verification.** `node -e "JSON.parse(require('fs').readFileSync('apps/web/components.json','utf8'))"` exits 0.
- **Rollback.** `git revert <T4.6-sha>`.
- **Files touched (rough).** `apps/web/components.json` (~10 lines).

### Task T4.7 — Design tokens extraction (from `gastos-personales/`) (~25 lines)

- **Description.** Per UI-2: read `gastos-personales/tailwind.config.*` and `gastos-personales/app/globals.css` to capture colors/spacing/typography. Write the tokens into `apps/web/app/globals.css` as CSS variables under `:root` and `[data-theme="dark"]`. Reference the source via a comment at the top.
- **Discovery / file targets.** Create `apps/web/app/globals.css`; update `apps/web/tailwind.config.ts` to reference the CSS variables. The source repo path is referenced in a comment, not imported.
- **TDD sequence.** Not a TDD task — visual diff is the verification (manual in Slice 8).
- **Verification.** `apps/web/app/globals.css` contains `--background`, `--foreground`, `--primary`, etc.; `apps/web/tailwind.config.ts` references these via `hsl(var(--background))`.
- **Rollback.** `git revert <T4.7-sha>`.
- **Files touched (rough).** `apps/web/app/globals.css`, `apps/web/tailwind.config.ts` (~25 lines net).

### Task T4.8 — `sign-in` page + `LoginForm` (~50 lines)

- **Description.** Implement `apps/web/app/[locale]/(auth)/sign-in/page.tsx` and the **full** `LoginForm` (T4.1's stub). Implement all 5 states (loading, error, success, empty, validation-error) per spec §UI requirement "Complete Form States". Wire `react-hook-form` + `@hookform/resolvers/zod` against `loginSchema` from `@features/auth/shared/schemas/login`.
- **Discovery / file targets.** `apps/web/app/[locale]/(auth)/sign-in/page.tsx`; `libs/features/auth/client/components/LoginForm.tsx` (replace stub).
- **TDD sequence.** RED (T4.1's test) → GREEN (implement form) → TRIANGULATE (state-coverage tests in T4.14) → REFACTOR (extract form-state hook).
- **Verification.** `pnpm turbo run test --filter @features/auth --filter web` passes; manual `pnpm --filter web dev` + browser test of all 5 states.
- **Rollback.** `git revert <T4.8-sha>`.
- **Files touched (rough).** Page + form + tests (~50 lines).

### Task T4.9 — `sign-up` page + `SignUpForm` (~30 lines)

- **Description.** Same shape as T4.8: register screen resolves `registerSchema` from `@features/auth/shared/schemas/register`; 5-state form.
- **Discovery / file targets.** `apps/web/app/[locale]/(auth)/sign-up/page.tsx`; `libs/features/auth/client/components/SignUpForm.tsx`; tests under `libs/features/auth/client/components/__tests__/sign-up-form.test.tsx`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** `pnpm turbo run test --filter @features/auth --filter web` passes.
- **Rollback.** `git revert <T4.9-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T4.10 — `forgot-password` page + `ForgotPasswordForm` (~30 lines)

- **Description.** Resolves `forgotPasswordSchema`; success state shows generic "if this email is registered, you will receive instructions" copy.
- **Discovery / file targets.** `apps/web/app/[locale]/(auth)/forgot-password/page.tsx`; `libs/features/auth/client/components/ForgotPasswordForm.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** Tests pass.
- **Rollback.** `git revert <T4.10-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T4.11 — `reset-password/[token]` page + `ResetPasswordForm` (~30 lines)

- **Description.** Reads `[token]` from the route (per Next 15 async params). Resolves `resetPasswordSchema`. Error path shows "invalid or expired token" on unknown token.
- **Discovery / file targets.** `apps/web/app/[locale]/(auth)/reset-password/[token]/page.tsx`; `libs/features/auth/client/components/ResetPasswordForm.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** Tests pass; `pnpm --filter web dev` + manual visit to `/{en|es}/reset-password/<fake-token>` shows the error state.
- **Rollback.** `git revert <T4.11-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T4.12 — `dev/mailbox/[userId]` page + `DevMailbox` component (~25 lines)

- **Description.** DEV ONLY — `NODE_ENV !== 'production'` enforced at the route boundary and in the component. Reads the latest `auth.password-reset.requested` event for `userId` from the dispatcher's ring buffer (T2.3). Surfaces the **token only** (never passwords or email contents). Per design §4.5.
- **Discovery / file targets.** `apps/web/app/[locale]/(auth)/dev/mailbox/[userId]/page.tsx`; `libs/features/auth/client/components/DevMailbox.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: a test asserts the page returns a 404 / not-rendered in production mode (mock `NODE_ENV`).
- **Verification.** Page is hidden in production build (`pnpm --filter web build`); `pnpm turbo run test` passes.
- **Rollback.** `git revert <T4.12-sha>`.
- **Files touched (rough).** ~25 lines.

### Task T4.13 — WCAG AA audit per auth screen via `@axe-core/playwright` (~30 lines)

- **Description.** Per UI-4 / G43: `@axe-core/playwright` runs against each critical auth screen (sign-in, sign-up, forgot-password, reset-password) and asserts zero AA violations. Tests live under `apps/web/e2e/auth/axe.spec.ts` per screen.
- **Discovery / file targets.** `apps/web/e2e/auth/axe-*.spec.ts` (5 files: sign-in, sign-up, forgot-password, reset-password, dev-mailbox).
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: each spec asserts zero violations on a freshly rendered screen.
- **Verification.** `pnpm turbo run e2e --filter web -- --grep "@axe"` exits 0.
- **Rollback.** `git revert <T4.13-sha>`.
- **Files touched (rough).** Specs + axe config (~30 lines).

### Task T4.14 — State-coverage tests per form (loading, error, success, empty, validation-error) (~25 lines)

- **Description.** For each auth form, write a state-coverage component test (5 tests per form × 4 forms = 20 tests; reduces to ~25 net-new lines via a small render-helper). Asserts each state is reachable and visually distinct.
- **Discovery / file targets.** Tests live alongside each form's test file under `libs/features/auth/client/components/__tests__/`.
- **TDD sequence.** TRIANGULATE phase for the form tasks (T4.8–T4.12).
- **Verification.** `pnpm turbo run test --filter @features/auth` runs ≥ 20 state-coverage tests passing.
- **Rollback.** `git revert <T4.14-sha>`.
- **Files touched (rough).** ~25 lines.

### Task T4.15 — REFACTOR + lint + typecheck + final state coverage check (~10 lines)

- **Description.** Refactor any duplication across the 4 forms (e.g., common `<FormField>` wrapper). Re-run ESLint fixture check (`pnpm turbo run lint:fixtures`) to prove no boundary regression. Add the responsive viewport test (mobile 360px / desktop 1440px) for at least one form.
- **Discovery / file targets.** Refactor targets under `libs/features/auth/client/components/` and the route pages.
- **TDD sequence.** Refactor only — tests stay green.
- **Verification.** All commands exit 0; the sign-in screen renders without overflow at 360px / 1440px viewports.
- **Rollback.** `git revert <T4.15-sha>`.
- **Files touched (rough).** ~10 lines.

**Slice 4 total: ~380 changed lines.** Verification gate: G17 (shared Zod schemas reused on client), G40 (`apps/web/components.json` + primitives), G41 (design tokens extracted), G42 (`next-intl` configured), G43 (axe-core audit passes per critical auth screen), G44 (5 form states per form), G45 (responsive), G46 (component tests per screen).

---

## Slice 5: Transactions server

**Goal.** Implement every transaction requirement from `specs/transactions/spec.md` on the server side. Extend the Prisma schema with the transaction tables and `IdempotencyKey`; build the domain layer (entities + ports + services), infrastructure layer (Prisma adapters + in-memory FX provider), and the NestJS controllers with idempotency-key handling.
**Start.** Slice 3 merged (auth services exist so RbacService is available).
**Finish.** Every endpoint from design §5.3 returns correct status codes; multi-currency conversion + stale-FX warning works; idempotency-key prevents duplicates; soft-delete filter applies to every category query (non-negotiable); the five transactions events are emitted.
**Verification.** `pnpm turbo run lint typecheck test --filter @features/transactions --filter api` exits 0.
**Rollback.** Per atomic commit.

### Task T5.1 — Extend Prisma schema: Currency, FxRate, Category, Transaction, IdempotencyKey, AuditLog (~30 lines)

- **Description.** Add the transactions tables per spec §Data Model and design §5.1. Per D-TX-6, `Transaction.amount` is Prisma `Decimal` — **never `BigInt`** (this is enforced by the type system and verified in T5.2's migration review). Add indexes per spec (§Data Model "Indexes" section).
- **Discovery / file targets.** Update `libs/core/database/prisma/schema.prisma`.
- **TDD sequence.** Not a TDD task — schema migration is the verification.
- **Verification.** `pnpm prisma migrate dev --name transactions_init` applies cleanly; `pnpm prisma format` reports no diff; the resulting `schema.sql` shows `Decimal` for monetary columns.
- **Rollback.** `git revert <T5.1-sha>` + drop the migration file (`libs/core/database/prisma/migrations/<timestamp>_transactions_init/`).
- **Files touched (rough).** Schema file (~30 net-new lines).

### Task T5.2 — Run `pnpm prisma migrate dev` (~0 lines, gate check)

- **Description.** Apply the migration from T5.1. Verify the migration produces the expected tables (`Currency`, `FxRate`, `Category`, `Transaction`, `IdempotencyKey`, `AuditLog`) with the expected types (per D-TX-6, monetary columns are `DECIMAL` not `BIGINT`).
- **Discovery / file targets.** No new files; verification only.
- **TDD sequence.** Not a TDD task.
- **Verification.** `psql -U postgres -d gastos_reference -c '\d+ "Transaction"'` shows `amount DECIMAL`.
- **Rollback.** `pnpm prisma migrate reset` (only locally; never on shared DBs).
- **Files touched (rough).** ~0 lines (migration commit produced by the prior task).

### Task T5.3 — RED: Vitest test for `TransactionService.create` with FX conversion (~25 lines)

- **Description.** Write the failing test FIRST: a test that mocks the four ports (Transaction/Category/Currency/FxRate repositories), submits `create({ amount: 1000, currencyCode: 'ARS', reportingCurrencyCode: 'USD', kind: 'expense', categoryId: 'cat_1', occurredAt: now })`, and asserts: `reportingAmount` equals `1000 * 1.001 = 1001` (with the in-memory FX provider's seeded rate); `audit log` row created with the right `actorId`; idempotency-key replay returns the same `Transaction`.
- **Discovery / file targets.** Test at `libs/features/transactions/server/domain/services/__tests__/transaction.service.test.ts`.
- **TDD sequence.** RED step for T5.9.
- **Verification.** Test exits non-zero (RED).
- **Rollback.** `git revert <T5.3-sha>`.
- **Files touched (rough).** ~25 lines.

### Task T5.4 — `libs/features/transactions/shared/schemas` (Zod) (~50 lines)

- **Description.** Per spec §Data Model and design §5.5: `create.ts`, `update.ts`, `list.ts` (cursor pagination + filters), `category-create.ts`, `category-update.ts`. Each is the canonical Zod schema reused by client forms AND the NestJS ZodValidationPipe.
- **Discovery / file targets.** `libs/features/transactions/shared/schemas/{create,update,list,category-create,category-update}.ts` and a barrel.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR (parallel to T3.2).
- **Verification.** Tests pass; `pnpm turbo run lint` reports zero violations and `no-schemas-outside-shared` does not fire.
- **Rollback.** `git revert <T5.4-sha>`.
- **Files touched (rough).** ~50 lines.

### Task T5.5 — `libs/features/transactions/server/domain/entities` (TypeScript types) (~30 lines)

- **Description.** Plain TS interfaces/types for `Transaction`, `Category`, `Currency`, `FxRate`, `IdempotencyKey` per design §5.1. **Type-only, not classes** — keeps the domain layer serialization-friendly and the dependency surface minimal.
- **Discovery / file targets.** `libs/features/transactions/server/domain/entities/{transaction,category,currency,fx-rate,idempotency-key}.entity.ts`.
- **TDD sequence.** Not a TDD task — types are static.
- **Verification.** `pnpm turbo run typecheck` exits 0 across the slice.
- **Rollback.** `git revert <T5.5-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T5.6 — `libs/features/transactions/server/domain/interfaces` (ports) (~40 lines)

- **Description.** Declare the six ports per design §5.1: `TransactionRepository`, `CategoryRepository`, `CurrencyRepository`, `FxRateRepository`, `IdempotencyRepository`, `FxRateProvider`. **Critical**: `CategoryRepository` JSDoc MUST state the non-opt-out soft-delete invariant (D-TX-5) so adapters and call-sites cannot claim ignorance.
- **Discovery / file targets.** `libs/features/transactions/server/domain/interfaces/*.repository.ts` + `fx-rate.provider.ts`.
- **TDD sequence.** RED (T5.3) → GREEN (interfaces here).
- **Verification.** `pnpm turbo run typecheck` exits 0; the JSDoc invariant is committed verbatim.
- **Rollback.** `git revert <T5.6-sha>`.
- **Files touched (rough).** ~40 lines.

### Task T5.7 — `libs/features/transactions/server/infrastructure/repositories` (Prisma adapters) (~80 lines)

- **Description.** Five Prisma adapters implementing the ports. **`CategoryRepository` ALWAYS adds `where: { deletedAt: null }` to every read query** — no escape hatch. The adapter's `findById(id)` rejects soft-deleted categories with `null`; `list(filter)` filters out soft-deleted rows; the same predicate is added to the `JOIN` for transaction listings.
- **Discovery / file targets.** `libs/features/transactions/server/infrastructure/repositories/{transaction,category,currency,fx-rate,idempotency}.repository.ts` + tests under `__tests__/`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. Per repo: RED (write a test that asserts the soft-delete filter applies for `CategoryRepository`); GREEN (implement the Prisma adapter); TRIANGULATE (test that adding a `bypassFilter` flag does NOT exist — compile-time guarantee); REFACTOR (extract a shared `notDeleted()` helper).
- **Verification.** Tests pass; `pnpm turbo run lint` exits 0; the `no-prisma-outside-core` rule does NOT fire (Prisma client is accessed only via the `@core/database` singleton).
- **Rollback.** `git revert <T5.7-sha>`.
- **Files touched (rough).** ~80 lines.

### Task T5.8 — `libs/features/transactions/server/infrastructure/fx/in-memory-fx-rate.provider.ts` (~25 lines)

- **Description.** Default `FxRateProvider` implementation per D-TX-2. Seeded at startup with `USD→ARS`, `EUR→ARS`, `ARS→USD`, `ARS→EUR`. Provides an `advanceClock()` test helper so the staleness boundary (24h) is exercise-able in unit tests.
- **Discovery / file targets.** `libs/features/transactions/server/infrastructure/fx/in-memory-fx-rate.provider.ts` + tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** Tests pass; NestJS DI token `FX_RATE_PROVIDER` resolves to this class in T5.10.
- **Rollback.** `git revert <T5.8-sha>`.
- **Files touched (rough).** ~25 lines.

### Task T5.9 — `libs/features/transactions/server/domain/services` (TransactionService, CategoryService, TotalsService, ThresholdService) (~80 lines)

- **Description.** Implement the four services per design §5.1. `TransactionService.create` orchestrates: validate → FX lookup (with staleness dispatch) → persist → audit log → idempotency-key upsert. `CategoryService` soft-deletes. `TotalsService.forUser` + `forCategory` enforce sign-aware math (income +N, expense −N) and per-category grouping. `ThresholdService.evaluate` emits `transactions.threshold.exceeded`.
- **Discovery / file targets.** `libs/features/transactions/server/domain/services/{transaction,category,totals,threshold}.service.ts` + tests.
- **TDD sequence.** GREEN step for T5.3's RED test. Additional RED → GREEN → TRIANGULATE → REFACTOR per service.
- **Verification.** Tests pass; the events (`transactions.created`, `transactions.fx.stale`, `transactions.threshold.exceeded`) are dispatched at the right points.
- **Rollback.** `git revert <T5.9-sha>`.
- **Files touched (rough).** ~80 lines.

### Task T5.10 — Nest DI token `FX_RATE_PROVIDER` wired in `apps/api/modules/transactions` (~10 lines)

- **Description.** Provide the FX_RATE_PROVIDER token from `apps/api/modules/transactions/transactions.module.ts`; bind it to `InMemoryFxRateProvider` for the reference repo.
- **Discovery / file targets.** Update `apps/api/modules/transactions/transactions.module.ts`.
- **TDD sequence.** Not a TDD task; verification is the NestJS container resolving the token.
- **Verification.** Boot `apps/api`; logs show `FX_RATE_PROVIDER bound to InMemoryFxRateProvider`.
- **Rollback.** `git revert <T5.10-sha>`.
- **Files touched (rough).** ~10 lines.

### Task T5.11 — `apps/api/modules/transactions` controllers (~50 lines)

- **Description.** REST surface per design §5.3 (POST/GET/PATCH/DELETE `/transactions`, GET/POST/PATCH/DELETE `/categories`). All endpoints apply `ZodValidationPipe` with the schemas in T5.4. POST `/transactions` requires the `Idempotency-Key` header.
- **Discovery / file targets.** `apps/api/modules/transactions/{transactions.module.ts,transactions.controller.ts}`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: e2e test for `POST /transactions` with a valid payload. GREEN: implement the controller. TRIANGULATE: idempotency replay, fingerprint mismatch, soft-deleted category rejection, stale-FX warning, threshold emission.
- **Verification.** `pnpm turbo run test --filter api` passes the e2e suite.
- **Rollback.** `git revert <T5.11-sha>`.
- **Files touched (rough).** ~50 lines.

### Task T5.12 — TRIANGULATE: full happy-path + edge-case test suite (~50 lines)

- **Description.** Cross-cutting scenarios: (a) idempotency replay returns the same payload, (b) fingerprint mismatch returns 409, (c) expired key allows a fresh request, (d) stale FX rate emits `transactions.fx.stale` AND persists the transaction, (e) same-currency transaction skips FX (D-TX-3), (f) sign-aware totals split income vs expense, (g) per-category totals exclude soft-deleted categories, (h) threshold exceeded emits `transactions.threshold.exceeded`. Each maps to a spec scenario.
- **Discovery / file targets.** `libs/features/transactions/server/__tests__/integration/{idempotency,fx-stale,sign-aware-totals,per-category-totals,threshold}.test.ts`.
- **TDD sequence.** TRIANGULATE for services (T5.9) and repos (T5.7).
- **Verification.** All pass.
- **Rollback.** `git revert <T5.12-sha>`.
- **Files touched (rough).** ~50 lines.

### Task T5.13 — REFACTOR + lint + typecheck + test green (~10 lines)

- **Description.** Refactor duplication, ensure ESLint boundaries are clean (no `client/` importing from `server/` etc.). Re-run the fixture sanity check.
- **Discovery / file targets.** Refactor targets across the slice.
- **TDD sequence.** Refactor only.
- **Verification.** All commands exit 0; fixtures still fire.
- **Rollback.** `git revert <T5.13-sha>`.
- **Files touched (rough).** ~10 lines.

**Slice 5 total: ~390 changed lines.** Verification gate: G18 (FX + staleness), G19 (soft-delete filter in all category queries), G24 (validation), G25 (idempotency), G26 (Decimal not BigInt), G27 (audit log), G28 (sign-aware + per-category + threshold).

---

## Slice 6: Transactions client + RBAC UI

**Goal.** Surface every server slice from Slice 5 on the web app with full UI per convention id 2133. Add the remaining shadcn-style primitives (`dialog`, `dropdown-menu`, `select`, `toast`, `table`).
**Start.** Slice 5 merged.
**Finish.** `/{locale}/(app)/transactions[/new|/[id]]` and `/{locale}/(app)/categories` routes render in both locales; every form has 5 states; TotalsCard and ThresholdAlert surface the sign-aware rollup + threshold warn; axe-core passes; responsive diff holds.
**Verification.** `pnpm turbo run lint typecheck test --filter web --filter @features/transactions` exits 0; axe-core audit clean.
**Rollback.** Per atomic commit.

### Task T6.1 — RED: component test for `TransactionsList` (~30 lines)

- **Description.** Failing test FIRST: mount `TransactionsList` with a stubbed empty dataset; assert the empty state is visible; with a populated dataset assert rows render; with a deleted-while-loading state, assert a re-render to empty after the next poll.
- **Discovery / file targets.** `libs/features/transactions/client/components/__tests__/transactions-list.test.tsx` + a stub component.
- **TDD sequence.** RED for T6.4.
- **Verification.** Test exits non-zero (RED).
- **Rollback.** `git revert <T6.1-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T6.2 — `apps/web/app/[locale]/(app)/layout.tsx` (session guard) (~25 lines)

- **Description.** Server component that reads the NextAuth session via `auth()` helper; redirects to `/{locale}/sign-in` if null. Wraps children in any locale-scoped providers needed.
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/layout.tsx`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR (test asserts the guard redirects unauthenticated users, allows authenticated users).
- **Verification.** Tests pass; manual `curl` to `/{locale}/transactions` returns 307 to `/en/sign-in` for an unauthenticated request.
- **Rollback.** `git revert <T6.2-sha>`.
- **Files touched (rough).** ~25 lines.

### Task T6.3 — `/{locale}/(app)/sessions/page.tsx` + `SessionList` component (~30 lines)

- **Description.** Per spec §Requirement "Sessions List and Revoke": table of sessions with device label + last-active timestamp; revoke action per row (button → `DELETE /auth/sessions/:id`); success/empty/error states.
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/sessions/page.tsx`; `libs/features/auth/client/components/SessionList.tsx` (canonical location for the auth-slice component); tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** Tests pass; manual flow clears the loading state and renders the list.
- **Rollback.** `git revert <T6.3-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T6.4 — `/{locale}/(app)/transactions/page.tsx` + `TransactionsList` (~40 lines)

- **Description.** Per design §5.6: table of transactions with filters (date range, category, currency), pagination via cursor, empty / error / loading states. Wire to `GET /transactions` (auth headers). Render `TotalsCard` and `ThresholdAlert` if the totals endpoint signals a threshold event.
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/transactions/page.tsx`; `libs/features/transactions/client/components/TransactionsList.tsx` (replace stub from T6.1); tests.
- **TDD sequence.** GREEN step for T6.1's RED; TRIANGULATE with state-coverage tests.
- **Verification.** All commands exit 0; manual flow navigates list → create → list-update.
- **Rollback.** `git revert <T6.4-sha>`.
- **Files touched (rough).** ~40 lines.

### Task T6.5 — `/{locale}/(app)/transactions/new/page.tsx` + `CreateTransactionForm` (~40 lines)

- **Description.** Per spec §Requirement "Transaction Validation" + §UI "Complete Form States": resolves `createSchema`, auto-generates an `Idempotency-Key` UUID per submit (re-used on re-submit of the same form entry), 5-state coverage, submit → POST `/transactions` with header.
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/transactions/new/page.tsx`; `libs/features/transactions/client/components/CreateTransactionForm.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** Tests pass; the form's success state shows the converted amount + the stale-rate warning if applicable.
- **Rollback.** `git revert <T6.5-sha>`.
- **Files touched (rough).** ~40 lines.

### Task T6.6 — `/{locale}/(app)/transactions/[id]/page.tsx` + `EditTransactionForm` (~30 lines)

- **Description.** Resolves `updateSchema`; prefilled; 5-state coverage.
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/transactions/[id]/page.tsx`; `libs/features/transactions/client/components/EditTransactionForm.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** Tests pass.
- **Rollback.** `git revert <T6.6-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T6.7 — `/{locale}/(app)/categories/page.tsx` + `CategoryManager` (~35 lines)

- **Description.** List + create + rename + soft-delete for categories. The soft-delete action warns ("transactions referencing this category will keep their data, but the category will be hidden from selectors").
- **Discovery / file targets.** `apps/web/app/[locale]/(app)/categories/page.tsx`; `libs/features/transactions/client/components/CategoryManager.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** Tests pass.
- **Rollback.** `git revert <T6.7-sha>`.
- **Files touched (rough).** ~35 lines.

### Task T6.8 — `TotalsCard` (~30 lines)

- **Description.** Per spec: sign-aware income / expense / net + per-category rollups in the reporting currency. Uses the totals API. Renders in the active locale (labels via `next-intl`).
- **Discovery / file targets.** `libs/features/transactions/client/components/TotalsCard.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** Tests pass; snapshot matches `+100 / -40 / net +60` for the seed input.
- **Rollback.** `git revert <T6.8-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T6.9 — `ThresholdAlert` (~20 lines)

- **Description.** Subscribes to `transactions.threshold.exceeded` (the event bus carries this in dev; in production a toast would be the consumer). Renders the threshold-crossed affordance in the active locale.
- **Discovery / file targets.** `libs/features/transactions/client/components/ThresholdAlert.tsx`; tests.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** Tests pass.
- **Rollback.** `git revert <T6.9-sha>`.
- **Files touched (rough).** ~20 lines.

### Task T6.10 — WCAG AA + responsive + state coverage (mirror slice 4 pattern) (~30 lines)

- **Description.** Per UI-4 + G43/G44/G45: `@axe-core/playwright` audit per transactions screen (list, create, edit, categories); responsive diff at 360px and 1440px; 5-state coverage for `CreateTransactionForm` and `EditTransactionForm`.
- **Discovery / file targets.** `apps/web/e2e/transactions/axe-*.spec.ts`; state-coverage tests under the components.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** All commands exit 0.
- **Rollback.** `git revert <T6.10-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T6.11 — REFACTOR + lint + typecheck green (~10 lines)

- **Description.** Refactor duplication, ensure boundaries clean, fixtures still fire.
- **Discovery / file targets.** Refactor targets across the slice.
- **TDD sequence.** Refactor only.
- **Verification.** All commands exit 0; fixtures still fire.
- **Rollback.** `git revert <T6.11-sha>`.
- **Files touched (rough).** ~10 lines.

**Slice 6 total: ~380 changed lines.** Verification gate: G40 (primitives), G41 (tokens), G43 (axe-core per tx screen), G44 (5 form states), G45 (responsive), G46 (component tests).

---

## Slice 7: BDD + e2e

**Goal.** Add the Gherkin feature files and the Playwright e2e tests that bind the slices into shippable behavior. **No new business code** — this slice is glue.
**Start.** Slices 4 and 6 merged (UI exists for both modules).
**Finish.** 12 `.feature` files (6 auth + 6 transactions) with shared step defs. Playwright runs the two critical flows for both locales. axe-core is integrated and asserts zero violations on the critical screens.
**Verification.** `pnpm turbo run bdd e2e` exits 0.
**Rollback.** Per atomic commit.

### Task T7.1 — `libs/features/auth/docs/step-defs/` (shared step definitions) (~30 lines)

- **Description.** Set up the shared step-defs directory with the canonical phrasing for the most common steps (`Given a registered user exists with role '<role>'`, `When the user submits the sign-in form at /{locale}/sign-in with email '<email>' and password '<password>'`, `Then a session is created`). Single source of truth for the six feature files in T7.2.
- **Discovery / file targets.** `libs/features/auth/docs/step-defs/{common.steps.ts,realm.steps.ts}`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: a Cucumber dry-run fails because no steps match; GREEN: implement the most common step; TRIANGULATE: handle parameterized locale, role, and email. REFACTOR: extract a `registerUser({ email, role, password })` test helper.
- **Verification.** `pnpm turbo run bdd --filter @features/auth` exits 0 (after T7.2 adds the .feature files); a `--dry-run` reports every Scenario as `undefined` until the corresponding step is implemented.
- **Rollback.** `git revert <T7.1-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T7.2 — `libs/features/auth/docs/*.feature` (6 files per Locked Decision #3) (~60 lines)

- **Description.** Per auth spec §Gherkin feature inventory: `login-email-password.feature`, `oauth-google-stub.feature`, `password-reset.feature`, `sessions-list.feature`, `rbac-admin.feature`, `login-locale-routing.feature`. Each holds the spec's scenarios verbatim.
- **Discovery / file targets.** Six files under `libs/features/auth/docs/`.
- **TDD sequence.** RED step for T7.1 (no matching steps).
- **Verification.** `pnpm turbo run bdd --filter @features/auth` exits 0; ≥ 14 scenarios pass (per G10's ≥30 total, with ≥30 scenarios split across auth + transactions + at least one spec-level scenario).
- **Rollback.** `git revert <T7.2-sha>`.
- **Files touched (rough).** ~60 lines.

### Task T7.3 — `libs/features/transactions/docs/step-defs/` (shared step definitions) (~40 lines)

- **Description.** Per spec: shared step defs for the 6 transactions `.feature` files. `Given a category <name> with kind <kind> exists`, `Given an FxRate from <from> to <to> at rate <rate> recorded <time> ago`, `When the user submits the create-transaction form at /{locale}/transactions/new with idempotency key <key> and amount <amount>`, etc.
- **Discovery / file targets.** `libs/features/transactions/docs/step-defs/{common,data,actions}.steps.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** After T7.4, `pnpm turbo run bdd --filter @features/transactions` exits 0.
- **Rollback.** `git revert <T7.3-sha>`.
- **Files touched (rough).** ~40 lines.

### Task T7.4 — `libs/features/transactions/docs/*.feature` (6 files per Locked Decision #3) (~60 lines)

- **Description.** Per transactions spec §Gherkin feature inventory: `create-transaction.feature`, `list-transactions.feature`, `multi-currency-conversion.feature`, `idempotency-key.feature`, `soft-delete-categories.feature`, `sign-aware-totals.feature`. Each holds the spec's scenarios verbatim.
- **Discovery / file targets.** Six files under `libs/features/transactions/docs/`.
- **TDD sequence.** RED step for T7.3.
- **Verification.** `pnpm turbo run bdd --filter @features/transactions` exits 0; ≥ 14 transactions scenarios pass; **total across both modules ≥ 30 scenarios** (per G10).
- **Rollback.** `git revert <T7.4-sha>`.
- **Files touched (rough).** ~60 lines.

### Task T7.5 — `apps/web/playwright.config.ts` (two projects: `en`, `es`) (~20 lines)

- **Description.** Per design §8.4: two Playwright projects (`en`, `es`) so axe-core runs per locale and the report is split. `@axe-core/playwright` is wired per project.
- **Discovery / file targets.** `apps/web/playwright.config.ts`; add `apps/web/e2e/utils/axe.ts` as the assertion helper.
- **TDD sequence.** Not a TDD task per se — but a smoke spec (`e2e/health.spec.ts`) asserts `pnpm dev` is up.
- **Verification.** `pnpm turbo run e2e --filter web -- --list` shows two projects; running each project exits 0 on the smoke test.
- **Rollback.** `git revert <T7.5-sha>`.
- **Files touched (rough).** ~20 lines.

### Task T7.6 — `apps/web/e2e/auth/login-and-landing.spec.ts` (1 critical flow × 2 locales) (~30 lines)

- **Description.** G47 + design §8.4: clean session → fill the sign-in form → submit → assert the authenticated landing route is reached for both locales.
- **Discovery / file targets.** `apps/web/e2e/auth/login-and-landing.spec.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** `pnpm turbo run e2e --filter web -- --grep "login-and-landing"` exits 0.
- **Rollback.** `git revert <T7.6-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T7.7 — `apps/web/e2e/transactions/login-list-create.spec.ts` (~40 lines)

- **Description.** G47 + design §8.4: sign in → navigate to the transactions list → open the create form → fill it → submit → assert the new row appears. Runs under both `en` and `es` projects.
- **Discovery / file targets.** `apps/web/e2e/transactions/login-list-create.spec.ts`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** `pnpm turbo run e2e --filter web -- --grep "login-list-create"` exits 0.
- **Rollback.** `git revert <T7.7-sha>`.
- **Files touched (rough).** ~40 lines.

### Task T7.8 — `apps/web/e2e/utils/axe.ts` + per-screen axe specs (~30 lines)

- **Description.** A reusable helper `expectNoAxeViolations(page)` that runs `@axe-core/playwright` against the current page and asserts zero violations. Wired into the auth `axe-*.spec.ts` (Slice 4) and the transactions `axe-*.spec.ts` (Slice 6) to be exercised here.
- **Discovery / file targets.** `apps/web/e2e/utils/axe.ts`; rely on slices 4/6 specs.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR.
- **Verification.** `pnpm turbo run e2e --filter web -- --grep "@axe"` exits 0.
- **Rollback.** `git revert <T7.8-sha>`.
- **Files touched (rough).** ~30 lines.

### Task T7.9 — Final `pnpm turbo run bdd e2e` gate (~30 lines)

- **Description.** Verification task: `pnpm turbo run bdd e2e` exits 0 across both modules and both locales. Produce `docs/slice-7-checklist.md` for `sdd-verify` to replay.
- **Discovery / file targets.** `docs/slice-7-checklist.md`.
- **TDD sequence.** Not a TDD task — gate check.
- **Verification.** All exit 0; reports emitted under `bdd-reports/` and `playwright-report/`.
- **Rollback.** N/A.
- **Files touched (rough).** Doc + verification (~30 lines).

**Slice 7 total: ~390 changed lines.** Verification gate: G8 (`turbo run bdd` exits 0), G9 (≥9 .feature files — we ship 12), G10 (≥30 scenarios), G11 (shared step defs per-feature), G12 (email+pw E2E + OAuth happy stubbed covered), G13 (real Google OAuth NOT in Gherkin), G47 (e2e for login → list → create).

---

## Slice 8: Docs + polish + final verification

**Goal.** Complete the `docs/architecture.md` and `docs/migration-playbook.md` (with Spanish mirrors); ship the 7 idempotent `scripts/migrate/*.sh` files; run the final validation matrix; produce the first `CHANGELOG.md` entry.
**Start.** Slice 7 merged.
**Finish.** Every gate G1–G47 satisfied on a fresh clone. Spanish mirrors in place. Playbook stages are individually idempotent.
**Verification.** `pnpm turbo run build lint typecheck test bdd e2e coverage` all exit 0; each `scripts/migrate/*.sh` is idempotent (`run twice on a fresh branch` = no-op exit 0 the second time).
**Rollback.** Per atomic commit.

### Task T8.1 — `docs/architecture.md` (English, full content) (~40 lines)

- **Description.** Replace the Slice 1 stub with the full document: monorepo layout, module boundaries, event taxonomy (the 9 events), ESLint boundary rules, design tokens extraction, sdd-* chain summary, deferred slices note.
- **Discovery / file targets.** `docs/architecture.md`.
- **TDD sequence.** Not a TDD task.
- **Verification.** File exists; `wc -l docs/architecture.md` ≥ 200.
- **Rollback.** `git revert <T8.1-sha>`.
- **Files touched (rough).** ~40 lines net (replaces stub).

### Task T8.2 — `Documents-es/docs/architecture.md` (Spanish mirror) (~40 lines)

- **Description.** Per convention id 2132: produce the Spanish mirror in the **same atomic commit** as T8.1. Translate prose; keep technical terms, file paths, identifiers in English.
- **Discovery / file targets.** `Documents-es/docs/architecture.md`.
- **TDD sequence.** Not a TDD task.
- **Verification.** File exists; `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture.md` returns empty.
- **Rollback.** `git revert <T8.2-sha>`.
- **Files touched (rough).** ~40 lines net.

### Task T8.3 — `docs/migration-playbook.md` (English) (~40 lines)

- **Description.** One section per playbook stage (00-preflight, 10-extract-domain, 20-create-feature-slice, 30-wire-routes, 40-port-tests, 50-update-docs, 99-finalize). Each section: purpose, inputs, commands (idempotent), expected outputs, decision points.
- **Discovery / file targets.** `docs/migration-playbook.md`.
- **TDD sequence.** Not a TDD task.
- **Verification.** File exists; section count is exactly 7 (one per stage).
- **Rollback.** `git revert <T8.3-sha>`.
- **Files touched (rough).** ~40 lines net.

### Task T8.4 — `Documents-es/docs/migration-playbook.md` (Spanish mirror) (~40 lines)

- **Description.** Spanish mirror per convention id 2132, same atomic commit as T8.3.
- **Discovery / file targets.** `Documents-es/docs/migration-playbook.md`.
- **TDD sequence.** Not a TDD task.
- **Verification.** File exists; CJK check empty.
- **Rollback.** `git revert <T8.4-sha>`.
- **Files touched (rough).** ~40 lines net.

### Task T8.5 — `scripts/migrate/*.sh` (7 idempotent scripts per Locked Decision #4) (~70 lines)

- **Description.** Per playbook stage: `00-preflight.sh`, `10-extract-domain.sh`, `20-create-feature-slice.sh`, `30-wire-routes.sh`, `40-port-tests.sh`, `50-update-docs.sh`, `99-finalize.sh`. **Each MUST be idempotent**: re-running on an empty branch is a no-op or prints `already applied` and exits 0.
- **Discovery / file targets.** `scripts/migrate/*.sh`.
- **TDD sequence.** RED → GREEN → TRIANGULATE → REFACTOR. RED: a test (bash with `bats` or a tiny shell-test runner) asserts each script exits 0 when run twice; GREEN: implement. TRIANGULATE: handle missing `pnpm`, missing `docker`, missing `.git`. REFACTOR: share a common `ensure-tools.sh` and guard pattern across the seven.
- **Verification.** Run each script twice on a fresh clone; both runs exit 0.
- **Rollback.** `git revert <T8.5-sha>`.
- **Files touched (rough).** ~70 lines (≈10 lines per script).

### Task T8.6 — Final validation matrix (`docs/final-validation.md`) (~10 lines)

- **Description.** `pnpm turbo run build lint typecheck test bdd e2e` on a fresh clone — all exit 0. Document the command sequence in `docs/final-validation.md`.
- **Discovery / file targets.** `docs/final-validation.md`.
- **TDD sequence.** Not a TDD task — gate check.
- **Verification.** The validation matrix executes to completion with exit code 0.
- **Rollback.** N/A.
- **Files touched (rough).** ~10 lines of doc.

### Task T8.7 — Coverage gate check (~0 lines, gate check)

- **Description.** Per `openspec/config.yaml#coverage_threshold` (60% lines/branches/functions/statements): `pnpm turbo run coverage` reports ≥ 60% across all four metrics. **Not enforced as a CI gate** (per proposal §5 minor risk and the explicit `coverage_gate_enforced: false`); the report is committed to the test artifacts.
- **Discovery / file targets.** N/A.
- **TDD sequence.** Not a TDD task.
- **Verification.** Coverage report at `coverage/` shows 60% minimums across all metrics.
- **Rollback.** N/A.
- **Files touched (rough).** ~0 lines (verification only).

### Task T8.8 — WCAG AA manual tab-test + responsive diff per critical screen (~0 lines, verification)

- **Description.** Per UI-4: manual keyboard tab-test confirms every interactive element is reachable and named on each critical screen. Visual diff confirms mobile (≤640px) and desktop (≥1024px) rendering with no overflow.
- **Discovery / file targets.** Verification only; document the procedure in `docs/accessibility-manual-checks.md`.
- **TDD sequence.** Not a TDD task — manual verification.
- **Verification.** Procedure document passes review; automated axe-core (Slice 4 / 6 / 7) is the primary gate; this task adds the manual record.
- **Rollback.** N/A.
- **Files touched (rough).** ~0 lines + the procedure doc.

### Task T8.9 — `CHANGELOG.md` first entry (~5 lines)

- **Description.** Per publicable intent (Locked Decision #1): first entry `## [Unreleased] — Initial reference scaffold` summarizing the eight slices.
- **Discovery / file targets.** `CHANGELOG.md` at repo root.
- **TDD sequence.** Not a TDD task.
- **Verification.** File exists; entry present.
- **Rollback.** `git revert <T8.9-sha>`.
- **Files touched (rough).** ~5 lines.

### Task T8.10 — Gate verification table embedded in `tasks.md` (~80 lines)

- **Description.** Final task: re-verify every gate G1–G47 against the slice plan and embed the gate verification table at the bottom of `tasks.md` (this file). Each gate links to its slice + task(s) and the verification command. **This task's output is the table in the next section.**
- **Discovery / file targets.** `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` (this file).
- **TDD sequence.** Not a TDD task.
- **Verification.** All 47 gates mapped; each row has a non-empty "How verified" cell with a command or fixture reference.
- **Rollback.** `git revert <T8.10-sha>`.
- **Files touched (rough).** ~80 lines (the table itself).

**Slice 8 total: ~280 changed lines.** Verification gate: G29–G36 (docs), G37–G39 (hygiene), and the all-gates run-through per §10 below.

---

## Final merge into `develop`

After all 8 slices are reviewed and approved on `feat/vertical-slicing-reference-scaffold`:

1. Open ONE PR from `feat/vertical-slicing-reference-scaffold` → `develop` with the title `chore(reference): initial vertical-slicing scaffold (8-slice chain)`.
2. The PR description lists the merged PRs (one per slice) as co-authors of the chain.
3. `sdd-verify` runs the verification matrix (per task #T8.6) one last time on the integrated branch.
4. Merge to `develop` with `--no-ff` to preserve the chain history.
5. **No merge to `main`** — `main` is immutable (branch-model convention id 2129). Promotion to `main` happens only on explicit user request and per the AGENTS.md release flow.

---

## Gate verification table

Every gate G1–G47 from `proposal.md` §7 + §11.3, mapped to the slice + task(s) that satisfy it and the verification command. This is the source of truth for `sdd-verify`'s final run.

| Gate | Description (proposal §7.X / §11.3) | Slice | Task(s) | How verified |
|------|--------------------------------------|-------|---------|--------------|
| G1 | `pnpm install` on a clean clone completes with no errors | 1 | T1.1 | `pnpm install` → exit 0 |
| G2 | `pnpm db:up` brings up the Postgres Docker container | 1 | T1.5 | `docker compose ps` → service `postgres` healthy |
| G3 | `pnpm prisma migrate dev` applies all migrations cleanly | 2 | T2.1, T5.2 | `prisma/migrations/` populated; `psql \d+ "Transaction"` shows `amount DECIMAL` |
| G4 | `pnpm turbo run build` returns 0 across all packages | 1, 8 | T1.6, T1.7, T8.6 | `pnpm turbo run build` → exit 0; `apps/web/.next/` and `apps/api/dist/` produced |
| G5 | `pnpm turbo run lint` returns 0 | 1 | T1.3, T8.6 | `pnpm turbo run lint` → exit 0; ESLint flat config + boundary plugin active |
| G6 | `pnpm turbo run test` returns 0 | 2, 3, 4, 5, 6, 8 | T2.4, T3.*, T4.*, T5.*, T6.*, T8.6 | Vitest exit 0 across workspaces |
| G7 | `pnpm turbo run typecheck` returns 0 | 1, 8 | T1.2, T8.6 | `tsc --noEmit` → exit 0 across the workspace |
| G8 | `pnpm turbo run bdd` returns 0 | 7, 8 | T7.1, T7.2, T7.3, T7.4, T7.9, T8.6 | `@cucumber/cucumber` → exit 0; ≥ 30 scenarios pass |
| G9 | ≥ 9 `.feature` files exist (12 in this design) | 7 | T7.2, T7.4 | `find libs/features -name '*.feature' \| wc -l` ≥ 9 (actual: 12) |
| G10 | ≥ 30 scenarios total across the `.feature` files | 7 | T7.2, T7.4 | grep-count `Scenario:` lines ≥ 30 |
| G11 | Step definitions are shared per-feature under `libs/features/<feature>/docs/step-defs/` | 7 | T7.1, T7.3 | path check for `step-defs/` directories; no duplicate step bodies across feature files |
| G12 | BDD covers email+password E2E (happy + invalid creds) AND OAuth Google happy stubbed path | 7 | T7.2 | `libs/features/auth/docs/{login-email-password,oauth-google-stub}.feature` exist and contain the required scenarios |
| G13 | OAuth callback against real Google is NOT in Gherkin (manual/integration only) | 7 | T7.2 (negative assertion) | grep `real google\|google oauth callback` across `libs/features/**/docs/*.feature` returns empty |
| G14 | ESLint boundary rules active (no `*/server/*` from `*/client/*`; no cross-module imports) | 1 | T1.3 | `pnpm turbo run lint` → 0 errors; `no-client-server-import` and `no-cross-module-import` rules produce violations on the fixtures |
| G15 | A deliberate violation (test fixture) is detected by ESLint | 1 | T1.3 | `pnpm turbo run lint:fixtures` asserts each `invalid.ts` triggers its rule |
| G16 | `libs/core/database` is the only place `new PrismaClient()` is instantiated | 2 | T2.1 | `grep -rn 'new PrismaClient(' apps libs apps/api` returns 0 matches outside `libs/core/database/src/`; ESLint rule `no-prisma-outside-core` enforces it |
| G17 | Shared Zod schemas are reused by both client (forms) and server (validation pipe); no duplicated validators | 3, 4, 5 | T3.2, T3.6, T4.8–T4.12, T5.4, T5.11 | client form imports the same `@features/<slice>/shared/schemas/*` module as the NestJS ZodValidationPipe |
| G18 | Multi-currency: `Currency` and `FxRate` tables exist; FX conversion has a staleness warning at > 24 h | 5 | T5.1, T5.3, T5.8, T5.9, T5.12 | schema inspection (tables exist); unit test on `TransactionService.create` asserts `transactions.fx.stale` is dispatched when the rate is older than 24 h |
| G19 | Soft-delete categories: every category query filters `deletedAt: null` (non-opt-out) | 5 | T5.6, T5.7, T5.12 | JSDoc invariant on `CategoryRepository` ports; unit tests assert `findById` returns `null` for soft-deleted categories; integration test asserts soft-deleted categories do not appear in selectors or per-category totals |
| G20 | Email+password + Google OAuth providers run in parallel against `@auth/prisma-adapter` | 3 | T3.3 | unit test on `auth.config.ts` asserts providers array contains exactly `credentials` + `google` and that the adapter is wired |
| G21 | Password reset (forgot + reset) implemented with email mocked | 3, 4 | T3.4, T4.10, T4.11 | BDD covers the flow (`libs/features/auth/docs/password-reset.feature`); unit test on `PasswordResetService.requestReset` asserts the mocked email capture is produced |
| G22 | Sessions list + revoke implemented | 3, 4, 6 | T3.4, T4.6, T6.3 | BDD covers it; `SessionService.revokeSession` unit test asserts the session can no longer authenticate |
| G23 | RBAC roles (admin / user) enforced in the **domain** layer | 3 | T3.4, T3.7 | permission check lives in `RbacService`, called from controllers; BDD covers the user-denied and admin-allowed scenarios |
| G24 | Tx validation: `amount > 0`, currency valid, category exists | 5 | T5.4, T5.9, T5.12 | Zod schema rejects `amount <= 0`; repository tests assert the category lookup applies the soft-delete filter |
| G25 | Idempotency-key on POST prevents duplicates on retry | 5 | T5.4, T5.9, T5.11, T5.12 | unit tests on `IdempotencyService.lookup` cover: hit + fingerprint match → cached response; hit + mismatch → 409; miss → fresh insert; expired → fresh request |
| G26 | Decimal precision: `Transaction.amount` is Prisma `Decimal`, not `BigInt` | 5 | T5.1, T5.5 | schema inspection (column is `DECIMAL`, not `BIGINT`); test asserts `12.34` round-trips as `12.34` exactly |
| G27 | Audit log: `createdBy` / `updatedBy` on every Transaction write | 5 | T5.1, T5.9, T5.12 | schema inspection (columns present); unit test on `TransactionService.create` asserts the `AuditLog` row carries `actorId = userId` |
| G28 | Sign-aware totals (income vs expense) + per-category totals + threshold alerts | 5, 6 | T5.9, T5.12, T6.8, T6.9 | unit tests on `TotalsService.forUser` split income/expense correctly; `perCategory` excludes soft-deleted categories; `ThresholdService.evaluate` emits `transactions.threshold.exceeded` |
| G29 | `docs/architecture.md` exists and is non-empty | 1, 8 | T1.8, T8.1 | `wc -l docs/architecture.md` ≥ 200 |
| G30 | `Documents-es/docs/architecture.md` exists; same content (sans locale delta) | 1, 8 | T1.8, T8.2 | diff between the two files differs only in locale-specific strings; CJK check empty |
| G31 | `docs/migration-playbook.md` exists with one section per playbook stage | 8 | T8.3 | section count = 7 (one per stage) |
| G32 | `Documents-es/docs/migration-playbook.md` exists | 8 | T8.4 | file check + CJK check empty |
| G33 | `scripts/migrate/*.sh` exists; one `.sh` per playbook stage | 8 | T8.5 | `ls scripts/migrate/*.sh \| wc -l` = 7 |
| G34 | Each `*.sh` is idempotent: re-running on an empty branch is a no-op or prints `already applied` | 8 | T8.5 | run each script twice on a fresh clone; exit 0 both times |
| G35 | `LICENSE` is MIT | 1 | T1.4 | `head -1 LICENSE` reports MIT; `grep 'MIT License'` matches |
| G36 | `CONTRIBUTING.md` and `README.md` exist | 1 | T1.4 | file check |
| G37 | All commits are on `develop` (no commits to `main`) | 1–8 | chain strategy + T8 final merge | `git log main` shows no new commits beyond the sdd-init baseline |
| G38 | `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` is the canonical proposal | cross-cutting | chain strategy | file exists; matches the Engram observation at topic_key `sdd/vertical-slicing-reference-scaffold/proposal` |
| G39 | Engram observation at topic_key `sdd/vertical-slicing-reference-scaffold/proposal` exists and is retrievable | cross-cutting | chain strategy | `mem_search` + `mem_get_observation` returns the proposal |
| G40 | `apps/web/components.json` exists; shadcn-style components present at `apps/web/components/ui/{button,input,form,card,dialog,dropdown-menu,toast}.tsx` | 4, 6 | T4.4, T4.6 | path check on all eight primitives |
| G41 | Design tokens (colors, spacing, typography) extracted from `gastos-personales/` and applied via `apps/web/tailwind.config.ts` (or CSS variables in `apps/web/app/globals.css`) | 4, 6 | T4.7 | grep + visual diff; `apps/web/app/globals.css` contains the expected `--background`, `--foreground`, `--primary` variables; `apps/web/tailwind.config.ts` references them |
| G42 | `next-intl` configured; `apps/web/messages/{en,es}.json` exist | 4 | T4.2, T4.3 | file check; `pnpm --filter web dev` shows `/en` and `/es` routes; at least one string renders in both locales |
| G43 | Every screen in `apps/web/app/(auth)/*` and `apps/web/app/(app)/*` is WCAG AA compliant | 4, 6, 7 | T4.13, T6.10, T7.8 | `@axe-core/playwright` audit passes for each critical screen; manual keyboard tab-test passes |
| G44 | Every form has loading / error / success / empty / validation-error states implemented | 4, 6 | T4.14, T6.10 | component review per form; state-coverage tests pass |
| G45 | All pages are responsive: mobile (≤640px) and desktop (≥1024px) breakpoints covered; layout doesn't break in between | 4, 6 | T4.13, T6.10 | responsive visual diff; no horizontal overflow at 360px and 1440px |
| G46 | Component tests with Vitest + Testing Library: at least one test per critical screen for the happy path | 4, 6 | T4.1, T4.8–T4.12, T6.1, T6.4–T6.9 | vitest run reports passing component tests per critical screen |
| G47 | E2E tests with Playwright: at least one critical flow (login → transactions list → create transaction) passes | 7 | T7.6, T7.7, T7.9 | `pnpm turbo run e2e` exits 0; both projects (`en`, `es`) pass |

### Gate coverage completeness

- **G1–G8 (build + infrastructure)**: 8/8 covered.
- **G9–G13 (BDD coverage)**: 5/5 covered.
- **G14–G17 (architecture / boundaries)**: 4/4 covered.
- **G18–G28 (domain rules)**: 11/11 covered.
- **G29–G36 (documentation)**: 8/8 covered.
- **G37–G39 (hygiene)**: 3/3 covered.
- **G40–G47 (UI gates, §11.3)**: 8/8 covered.

Total: 47/47 gates mapped to a concrete slice + task and a verifiable command. None are aspirational; every gate ties to a test or a file/path check that `sdd-verify` can replay from a fresh clone.

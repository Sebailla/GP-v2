# Proposal — `vertical-slicing-reference-scaffold`

> **Status**: draft · proposal phase
> **Project**: `gastos-personales-reference`
> **Branch**: `develop` (working) · `main` (immutable)
> **Change convention**: kebab-case
> **Artifact store**: hybrid (`openspec/` files + Engram observations)
> **Mode**: interactive
> **Author**: SDD orchestrator → `sdd-propose` (executor)
> **Date**: 2026-07-04

---

## 1. Intent

This change scaffolds the **`gastos-personales-reference`** repository end-to-end so it can stand on its own as a publicable, runnable, reproducible **vertical-slicing reference / spike** for a Next.js 15 + NestJS 10 + Prisma monorepo.

**Pain it solves (for the team and the wider ecosystem):**

1. **Architectural decision without a working artifact.** The team has been discussing "vertical slicing per feature module" as a target architecture for migrating `gastos-personales/` away from its current Clean-Architecture-per-module layout. Without a working reference repo, every architectural review re-litigates the same questions. This change produces a concrete, runnable example so future debates are grounded in code.
2. **No shared playbook for migrations.** When the real migration starts, we will need to move a module from the existing `src/modules/*/{domain,application,infrastructure}` layout into a self-contained `libs/features/<feature>/{client,server,shared}` slice. Without an executable playbook, every migration is bespoke. This change ships the playbook (`docs/migration-playbook.md` + sibling `scripts/migrate/*.sh`) so the first real migration slice is the _second_ time we do it, not the first.
3. **Implicit architecture → explicit boundaries.** The vertical-slicing model is enforced by ESLint flat-config boundary rules. Without the rules, the architecture is a polite suggestion. With them, the architecture is enforced by `pnpm turbo run lint`.
4. **Lock-in risk on the real repo.** The existing `gastos-personales/` repo is the team's source of truth. Experimenting with a new architecture directly in it would couple the experiment to production data and create reverts that hurt morale. A _separate reference repo_ lets the experiment fail safely.

**What this change is NOT.** It is **not** a 1:1 copy of the existing `gastos-personales/` repo. It is **not** production. It does **not** migrate `gastos-personales/`. The two repos coexist; both artifact stores are independent. See [Cross-references](#10-cross-references) and `sdd-init/gastos-personales-reference` for the boundary statement.

---

## 2. Scope

### 2.1 In scope

Everything below must be present, working, and runnable on a clean clone once this change is verified.

#### 2.1.1 Monorepo skeleton

| Item                                    | Where     | Notes                                                                                                                                                |
| --------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml`                   | repo root | Declares `apps/*` and `libs/*` workspaces.                                                                                                           |
| `turbo.json`                            | repo root | Pipelines: `build`, `dev`, `lint`, `test`, `typecheck`, `bdd`.                                                                                       |
| `package.json` (root)                   | repo root | pnpm 10.x; TS 5 strict; workspace scripts (`pnpm db:up`, `pnpm db:down`, `pnpm prisma migrate dev`, `pnpm turbo run build lint test typecheck bdd`). |
| `tsconfig.base.json`                    | repo root | Strict mode; path aliases for workspace imports.                                                                                                     |
| `.editorconfig`, `.gitignore`, `.nvmrc` | repo root | Standard hygiene.                                                                                                                                    |
| `LICENSE` (MIT)                         | repo root | **Publicable repo.** MIT per Locked Decision #6.                                                                                                     |
| `README.md`                             | repo root | Quickstart (`pnpm install`, `pnpm db:up`, `pnpm prisma migrate dev`, `pnpm dev`).                                                                    |
| `CONTRIBUTING.md`                       | repo root | Lightweight guide; matches the publicable intent.                                                                                                    |
| `docker-compose.yml`                    | repo root | Postgres service only.                                                                                                                               |

#### 2.1.2 Apps

| App        | Stack                                                                                  | Responsibility                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web` | Next.js 15 App Router, no i18n                                                         | Auth screens (sign-in, sign-up, forgot/reset password, sessions list), transactions list + create + edit + delete + categories, RBAC-gated admin view. Server Components by default; Server Actions for mutations; Route Handlers only where needed. |
| `apps/api` | NestJS 10 with `@nestjs/config`, `@nestjs/jwt`, `class-validator`, Zod validation pipe | REST endpoints consumed by `apps/web`; emits events to `libs/core/events` for cross-module side effects.                                                                                                                                             |

#### 2.1.3 Libraries

| Library                      | Layout                                               | Purpose                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/core/database`         | Prisma client + schema as the single source of truth | Shared data access; migrations live here.                                                                                                                                 |
| `libs/core/events`           | Tiny event dispatcher                                | Per `architecture-standards`: cross-module side effects via events only.                                                                                                  |
| `libs/features/auth`         | `client/`, `server/`, `shared/`, `docs/*.feature`    | NextAuth v5 (Auth.js) + `@auth/prisma-adapter`. Email+password + Google OAuth, both providers in parallel against `@auth/prisma-adapter`.                                 |
| `libs/features/transactions` | `client/`, `server/`, `shared/`, `docs/*.feature`    | Transactions module with multi-currency (Currency + FxRate tables, FX conversion with staleness warning >24h), soft-delete categories (`deletedAt` filtering in queries). |
| `libs/shared-utils`          | pure helpers                                         | Date formatting, currency formatting, decimal-safe arithmetic (no `BigInt`).                                                                                              |
| `libs/core/config`           | Zod env schema                                       | Validates `process.env` at startup; fail-fast.                                                                                                                            |

#### 2.1.4 Cross-cutting concerns

- **Validation**: Zod is the single source of truth; schemas in `libs/features/*/shared/schemas/*.ts` are reused on both client (forms) and server (NestJS validation pipe). No duplicated validators.
- **Auth**: NextAuth v5 with `@auth/prisma-adapter`. Two providers configured in parallel: **email+password (Credentials)** and **Google OAuth**. See Locked Decisions #2 and #5.
- **Auth edges in scope** (Locked Decision #8):
  - login email+password — happy path **and** invalid credentials
  - OAuth Google — happy path with provider stub (NEXTAUTH_URL-switchable)
  - password reset — forgot + reset flow with email mocked
  - sessions list + revoke
  - RBAC roles (admin / user) with permissions enforced in the **domain** layer, not the UI
- **Tx rules** (Locked Decision #7):
  - **multi-currency** via `Currency` and `FxRate` tables; FX conversion at write-time with a **staleness warning when the FX rate is older than 24 hours**
  - **soft-delete categories** with `deletedAt` filtering in _every_ category query (no opt-out)
- **Tx edges in scope** (Locked Decision #9):
  - validation: `amount > 0`, currency valid, category exists
  - FX conversion with stale-rate warning surfaced as a domain event
  - **idempotency-key on POST** to prevent duplicate transactions on retry
  - **decimal precision** via Prisma `Decimal` (never `BigInt` — `BigInt` would silently truncate cents)
  - **audit log**: every Transaction row carries `createdBy` / `updatedBy` user IDs
  - soft-delete filter applied in all category queries
  - **sign-aware totals** (income vs expense) + per-category totals + threshold alerts
- **OAuth testing strategy** (Locked Decision #5):
  - provider stub via `NEXTAUTH_URL`-switchable config (a fake auth server URL makes NextAuth believe it is talking to Google)
  - BDD covers **email+password end-to-end** + **OAuth Google happy path only**
  - OAuth callback against the real Google OAuth server is **integration-only / manual**, not in Gherkin
- **BDD coverage** (Locked Decision #3): **4–6 `.feature` files per module** (auth + transactions). Step definitions shared per-feature (e.g. `libs/features/auth/docs/step-defs/`).
- **Playbook dual format** (Locked Decision #4): each playbook stage ships as **one `.md` (prose for humans) paired with one sibling `.sh` (idempotent for AI agents)**.
- **Tests**: Vitest (`pnpm test`) for unit + integration; `@cucumber/cucumber` (`pnpm bdd`) reading `libs/features/*/docs/*.feature`. **Strict TDD mode** (`strict_tdd: true` in `openspec/config.yaml`).
- **Lint**: ESLint flat config (`eslint.config.mjs`) with custom boundary rules:
  - no imports from `*/server/*` into `*/client/*`
  - no direct cross-module imports (route through events or shared ports)
- **Coverage**: 60% across lines / branches / functions / statements (declared in `openspec/config.yaml`; **not** enforced at sdd-init per the preflight cache; this proposal **opts out of enforcement** for the first slice — see §5 Risks).
- **Env**: validated with a Zod schema at startup; secrets via `.env` (gitignored) + `.env.example` (committed).

#### 2.1.5 Documentation (mirrored English + Spanish)

| Path                                      | Purpose                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture.md`                    | Architecture overview (English, primary).                                                                                 |
| `Documents-es/docs/architecture.md`       | Spanish mirror of `architecture.md`. Same content, locale-only delta.                                                     |
| `docs/migration-playbook.md`              | Human-readable playbook (English). One section per playbook stage.                                                        |
| `Documents-es/docs/migration-playbook.md` | Spanish mirror.                                                                                                           |
| `scripts/migrate/*.sh`                    | Idempotent scripts paired with each playbook stage. Re-running on an empty branch is a no-op or prints `already applied`. |
| `docs/decisions/` (optional)              | ADR(s) for the vertical-slicing decision.                                                                                 |

#### 2.1.6 Acceptance target for the playbook

Per Locked Decision #10, the _acceptance criterion_ for the playbook (not for this proposal — the playbook will be used later on a real repo) is: **slice piloto where `gastos-personales/`'s transactions module is migrated module-by-module using the playbook; "done" = feature parity 1:1 with the migrated slice + reference test suite passing against the migrated code.** This proposal defines the _executable form_ of that playbook; it does not run it against `gastos-personales/` yet.

#### 2.1.7 Repo lifecycle

Per Locked Decision #11: this reference repo **stays alive until the team starts the first real migration slice from `gastos-personales/` to the vertical-slice target**. After that, archive. In the meantime, security and typo fixes are accepted; feature additions are not.

### 2.2 Out of scope (explicit non-goals)

Anything below is **deliberately excluded** from this change. Future changes may add them.

1. **i18n** — `apps/web` ships Spanish + English only at the _docs/_ level (architecture + playbook). UI strings remain English.
2. **Sentry / error reporting SaaS** — no third-party APM.
3. **Rate limiting** at the API edge (NestJS guard, NGINX, or CDN).
4. **Multiple OAuth providers beyond Google** — no Facebook / GitHub / Apple.
5. **Production hardening**: no secrets manager integration, no HSTS, no CSP beyond Next.js defaults, no CDN config.
6. **Observability** stack (OpenTelemetry, Prometheus, structured log shipping).
7. **Performance tuning** beyond what `pnpm turbo run build` produces by default.
8. **CI workflows beyond basic lint + test + typecheck + BDD** — no deploy pipelines, no staging, no release automation. CI workflows for these pipelines may be added in a _separate_ later change.
9. **Email delivery** — password-reset emails are **mocked** in the reference repo. A real SMTP integration is out of scope.
10. **Real Google OAuth handshake** — only the stubbed happy path is covered in BDD (see Locked Decision #5). Manual integration against real Google is documented in `docs/architecture.md` but not automated.
11. **Coverage gate enforcement** — the 60% target is documented, not enforced as a CI failure (see §5 Risks for rationale).
12. **Migration of `gastos-personales/`** — that is a separate repo with its own SDD lifecycle.

---

## 3. Affected areas

The following directories / files / concepts will be **created** (the repo is currently bare):

```
gastos-personales-reference/                 # repo root
├── .editorconfig                            # NEW
├── .env.example                             # NEW
├── .gitignore                               # NEW
├── .nvmrc                                   # NEW
├── AGENTS.md                                # NEW (project-local conventions, derived from openspec/config.yaml)
├── CONTRIBUTING.md                          # NEW
├── LICENSE                                  # NEW (MIT, Locked Decision #6)
├── README.md                                # NEW (quickstart)
├── docker-compose.yml                       # NEW (Postgres service only)
├── eslint.config.mjs                        # NEW (flat config + boundary rules)
├── package.json                             # NEW (root workspace package)
├── pnpm-workspace.yaml                      # NEW
├── tsconfig.base.json                       # NEW
├── turbo.json                               # NEW (build/dev/lint/test/typecheck/bdd pipelines)
├── apps/
│   ├── api/                                 # NEW — NestJS 10
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       └── modules/                     # thin Nest module wrappers around libs/features/*/server
│   └── web/                                 # NEW — Next.js 15 App Router
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.mjs
│       └── app/
│           ├── layout.tsx
│           ├── page.tsx                     # landing
│           ├── (auth)/                      # route group: sign-in, sign-up, forgot/reset
│           ├── (app)/                       # route group: transactions, categories, sessions, admin
│           └── api/                         # route handlers when Server Actions don't fit
├── libs/
│   ├── core/
│   │   ├── config/                          # NEW — Zod env schema + env.ts entry
│   │   ├── database/                        # NEW — Prisma schema + client + migrations
│   │   │   ├── prisma/schema.prisma         # User, Account, Session, VerificationToken, Currency, FxRate, Category, Transaction, AuditLog
│   │   │   ├── prisma/migrations/
│   │   │   └── src/
│   │   └── events/                          # NEW — tiny event dispatcher
│   ├── features/
│   │   ├── auth/                            # NEW
│   │   │   ├── package.json
│   │   │   ├── client/                      # React components, hooks, forms
│   │   │   ├── server/                      # NextAuth config + auth service + RBAC
│   │   │   ├── shared/                      # Zod schemas, shared types
│   │   │   └── docs/
│   │   │       ├── *.feature                # 4–6 Gherkin files
│   │   │       └── step-defs/               # shared step definitions
│   │   └── transactions/                    # NEW
│   │       ├── package.json
│   │       ├── client/
│   │       ├── server/
│   │       ├── shared/
│   │       └── docs/
│   │           ├── *.feature
│   │           └── step-defs/
│   └── shared-utils/                        # NEW — date-formatting, currency, decimal helpers
├── docs/
│   ├── architecture.md                      # NEW (English)
│   ├── migration-playbook.md                # NEW (English)
│   └── decisions/                           # NEW (optional ADRs)
├── Documents-es/
│   └── docs/
│       ├── architecture.md                  # NEW (Spanish mirror)
│       └── migration-playbook.md            # NEW (Spanish mirror)
├── scripts/
│   └── migrate/                             # NEW — *.sh paired with playbook stages
│       ├── 00-preflight.sh
│       ├── 10-extract-domain.sh
│       ├── 20-create-feature-slice.sh
│       ├── 30-wire-routes.sh
│       ├── 40-port-tests.sh
│       ├── 50-update-docs.sh
│       └── 99-finalize.sh
├── openspec/
│   ├── config.yaml                          # EXISTS (declared by sdd-init)
│   └── changes/
│       └── vertical-slicing-reference-scaffold/
│           └── proposal.md                  # THIS FILE
└── .atl/                                    # optional: local registry cache (not required)
```

### Concepts that change

- **Module structure**: from "no code" to the vertical-slicing layout above.
- **Data model**: Prisma schema is _new_ (not migrated from `gastos-personales/`); includes `User`, `Account`, `Session`, `VerificationToken` (NextAuth), `Currency`, `FxRate`, `Category` (with `deletedAt`), `Transaction` (with `amount Decimal`, `currency`, `idempotencyKey`, `createdBy`, `updatedBy`), `AuditLog`.
- **Tooling**: introduce pnpm workspaces, Turbo, Vitest, Cucumber, ESLint flat config, Zod, Docker compose.
- **Documentation contract**: every doc has an English primary + Spanish mirror under `Documents-es/`.

### Concepts that DO NOT change

- The branch model (`develop` working, `main` immutable).
- The artifact store (`hybrid`).
- The SDD pipeline declared in `openspec/config.yaml`.
- The existing `gastos-personales/` repo (separate repo, separate lifecycle).

---

## 4. Pre-existing project context (from `sdd-init`)

The following context is established by `sdd-init/gastos-personales-reference` and is the baseline this proposal builds on. Do not re-litigate; treat as given.

| Field              | Value                                                                                                                                                                                                                      | Source                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Project root       | `/Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference/`                                                                                                                                            | `sdd-init`                                |
| Intent             | Reference / spike validating the vertical-slicing model. NOT production. Coexists with `gastos-personales/`.                                                                                                               | `sdd-init`                                |
| Branch model       | `develop` working · `main` immutable                                                                                                                                                                                       | `openspec/config.yaml#branch_model`       |
| Artifact store     | `hybrid` (openspec + Engram)                                                                                                                                                                                               | `openspec/config.yaml#artifact_store`     |
| Change convention  | kebab-case                                                                                                                                                                                                                 | `openspec/config.yaml#change_convention`  |
| Strict TDD         | **enabled** (`strict_tdd: true`)                                                                                                                                                                                           | `openspec/config.yaml`                    |
| Test runner        | `pnpm test` (Vitest)                                                                                                                                                                                                       | `openspec/config.yaml`                    |
| BDD runner         | `pnpm bdd` (`@cucumber/cucumber`)                                                                                                                                                                                          | `openspec/config.yaml`                    |
| Coverage threshold | 60% (lines/branches/functions/statements) — **not enforced** at sdd-init                                                                                                                                                   | `openspec/config.yaml`                    |
| Delivery strategy  | `ask-on-risk`                                                                                                                                                                                                              | `openspec/config.yaml`                    |
| Chain strategy     | `feature-branch-chain`                                                                                                                                                                                                     | `openspec/config.yaml`                    |
| Review budget      | 400 changed lines                                                                                                                                                                                                          | `openspec/config.yaml`                    |
| Execution mode     | `interactive`                                                                                                                                                                                                              | `openspec/config.yaml`                    |
| Pipeline           | proposal → spec → design → tasks → apply → verify → sync → archive                                                                                                                                                         | `openspec/config.yaml`                    |
| Planned stack      | TypeScript 5 strict, pnpm 10.x, Turbo, Next.js 15 App Router (no i18n), NestJS 10, Prisma + Postgres (Docker), `@auth/prisma-adapter`, Vitest, Cucumber, ESLint flat config + boundary rules, Zod, Docker compose Postgres | `openspec/config.yaml#stack` + `sdd-init` |

**Cross-reference**: `sdd-init/gastos-personales-reference` (Engram observation, id 2130, topic_key `sdd-init/gastos-personales-reference`).

**Preflight cache**: `gastos-personales-reference/decisions/sdd-preflight` (Engram observation, id 2128). Records the user choices (interactive + hybrid + ask-on-risk + feature-branch-chain) and the rationale for choosing Opción A (separate reference repo) over Opción C (full migration of the existing repo).

---

## 5. Risks

Five risks are named. Each is paired with a _mitigation_, not a _cure_ — proposal-phase mitigations are honest about what is achievable without yet running the apply phase.

### Risk R1 — Scope-completeness risk (large refactor)

**Description**: This is a **greenfield scaffold** with two apps, six libraries, ~9+ Gherkin `.feature` files, an executable playbook, and bilingual docs. Even with vertical slicing, the first slice will touch most of the monorepo. Locked Decisions #7 + #9 (multi-currency, soft-delete, all auth/tx edges in scope) push this firmly past 400 changed lines.

**Mitigation**:

- sdd-tasks must split work into sub-slices sized under the 400-line budget (skeleton → auth → transactions → playbook → docs → polish).
- sdd-apply must use `feature-branch-chain` (declared in `openspec/config.yaml`): chained PRs accumulate on a tracker branch before merging to `develop`.
- The orchestrator's `Review Workload Guard` fires before `sdd-apply`; if a sub-slice exceeds 400 changed lines, escalate to the user per `ask-on-risk`.
- The dual-format playbook (`*.md` + `*.sh`) means a single playbook stage is itself a sub-slice — we have a natural decomposition already.

### Risk R2 — Review Workload Guard trigger (>400 lines / chained required)

**Description**: Per `delivery_strategy=ask-on-risk` and `review_budget_lines=400`, any single PR or diff over 400 lines triggers the orchestrator to pause and ask the user how to proceed.

**Mitigation**:

- sdd-tasks decomposes the work so each chained PR is ≤400 changed lines.
- sdd-apply carries `delivery_strategy=ask-on-risk` and `chain_strategy=feature-branch-chain` in its prompt (the orchestrator must forward these).
- If a chain slips over budget, the orchestrator either escalates to the user (default) or accepts an explicit `size:exception` from the user.

### Risk R3 — Engram / Hybrid mode fragility

**Description**: Downstream phases (`sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`) must read this proposal. With `hybrid` mode, they can read either `openspec/changes/.../proposal.md` (always available, committed) **or** the Engram observation at topic_key `sdd/vertical-slicing-reference-scaffold/proposal`. If Engram is unavailable mid-session and a phase reads the wrong source, downstream artifacts drift.

**Mitigation**:

- The proposal is written to **both** stores (file + observation). The file is the source of truth if a conflict ever arises; Engram is the recovery cache.
- All phase prompts must include `topic_key: sdd/vertical-slicing-reference-scaffold/proposal` AND the file path. The phase executor falls back to the file if Engram returns empty.
- The orchestrator's `skill_resolution` contract requires sub-agents to declare `paths-injected` for openspec reads; a `none` report means the cache was lost and the file should be re-read.

### Risk R4 — Scope growth between Decisión 7 and Decisión 9

**Description**: Locked Decisions #7 (multi-currency + soft-delete) and #9 (every auth/tx edge in scope) together turn this from a "scaffold" into a "feature-complete reference." A naive apply phase may try to ship everything in one batch.

**Mitigation**:

- sdd-spec must enumerate the edges as **explicit acceptance criteria** so they cannot be silently dropped.
- sdd-tasks must produce **one task per edge** (e.g. "implement idempotency-key handling", "implement stale-FX warning"). That gives the orchestrator a checklist to monitor apply progress against.
- Coverage threshold at 60% (not 80%) is a deliberate scope guard: we are not chasing 80% on every library.

### Risk R5 — English/Spanish doc drift

**Description**: `docs/architecture.md` and `Documents-es/docs/architecture.md` must stay in lock-step. Same for the playbook. Drift makes the bilingual contract a lie.

**Mitigation**:

- Both files are updated **in the same commit** (atomic commit rule for doc pairs).
- sdd-verify checks the existence + non-emptiness of both files. A drift in _content_ is harder to detect automatically; we accept that risk and document it.
- The playbook's Spanish mirror is shorter where appropriate (e.g. examples in English); the _structure_ (stage headings, command names) must remain identical.

### Additional minor risks (logged, not blocking)

- **Coverage not enforced at CI**: 60% is a _target_, not a gate. We accept the risk that drift could lower real coverage. Trade-off: enforcing the gate at this slice would force the team to write test scaffolding faster than the architecture matures; we prioritize architectural clarity over coverage metrics. **Future change** may flip the gate on once the slice stabilizes.
- **Stack churn during apply**: pnpm/Turbo/NestJS/Next.js minor versions may shift between proposal and apply. Apply phase is allowed to pin exact versions in `package.json` to keep the snapshot reproducible.
- **OAuth provider stub misconfiguration**: a wrong `NEXTAUTH_URL` could route real-looking OAuth requests to a fake host. Mitigated by documenting the env var clearly in `.env.example` and asserting it in the Zod env schema.

---

## 6. Rollback

### 6.1 Whole-change rollback

This is a **greenfield scaffold**: the repo is brand new and contains no production data. Whole-change rollback is **delete the repo**.

```bash
# from a parent directory
rm -rf /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference
```

The sibling `gastos-personales/` repo is untouched. Both repos are independent git trees.

### 6.2 Per-feature rollback

If only one feature slice is wrong (e.g. `libs/features/auth`), drop just that library:

```bash
git rm -rf libs/features/auth
# adjust eslint.config.mjs to drop auth-specific overrides
# adjust apps/web and apps/api to drop auth imports
# adjust scripts/migrate/* to drop auth stages
# commit the removal on develop
```

Because `apps/web` and `apps/api` import features via path aliases (`@features/auth`, `@features/transactions`), removing one library is a _compile error_ in the apps — a desirable failure mode that forces a coherent revert.

### 6.3 Per-task rollback

Each task in `tasks.md` corresponds to a small commit on `develop`. To roll back a single task:

```bash
git revert <commit-sha-of-that-task>
```

Strict TDD mode + atomic commits per task make this safe.

### 6.4 What we will NOT do

- We will **not** force-push to `develop`.
- We will **not** rewrite git history on `develop`.
- We will **not** reset `develop` to a pre-scaffold commit (the repo is brand new — there is no pre-scaffold commit that has any business value).

---

## 7. Success criteria

This change is **done** when **all** of the following are true. These are the gates `sdd-verify` will run.

### 7.1 Build + infrastructure gates

| #   | Criterion                                                | How verified                                                    |
| --- | -------------------------------------------------------- | --------------------------------------------------------------- |
| G1  | `pnpm install` on a clean clone completes with no errors | `pnpm install` exit code 0                                      |
| G2  | `pnpm db:up` brings up the Postgres Docker container     | `docker compose ps` shows the service healthy                   |
| G3  | `pnpm prisma migrate dev` applies all migrations cleanly | `prisma/migrations/` populated, schema matches DB               |
| G4  | `pnpm turbo run build` returns 0 across all packages     | exit code 0; `apps/web/.next` + `apps/api/dist` produced        |
| G5  | `pnpm turbo run lint` returns 0                          | exit code 0; ESLint flat config enforces boundary rules         |
| G6  | `pnpm turbo run test` returns 0                          | Vitest exit code 0                                              |
| G7  | `pnpm turbo run typecheck` returns 0                     | `tsc --noEmit` exit code 0 across the workspace                 |
| G8  | `pnpm turbo run bdd` returns 0                           | `@cucumber/cucumber` exit code 0; all `.feature` scenarios pass |

### 7.2 BDD coverage gates

| #   | Criterion                                                                                                                                                                                                                                        | How verified                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| G9  | At least **9 `.feature` files** exist (4 auth + 4 transactions + at least 1 spec-level; the +1 is a reasonable over-allocation if a feature naturally splits). Locked Decision #3 allows 4–6 per module; we target 4+4 with optional extensions. | `find libs/features -name '*.feature' \| wc -l` ≥ 9 |
| G10 | At least **30 scenarios** total across the `.feature` files                                                                                                                                                                                      | grep-and-count on `Scenario:` lines                 |
| G11 | Step definitions are **shared per-feature** under `libs/features/<feature>/docs/step-defs/`                                                                                                                                                      | path check                                          |
| G12 | BDD covers **email+password end-to-end** (happy + invalid creds) **and** OAuth Google happy stubbed path                                                                                                                                         | feature-content inspection                          |
| G13 | OAuth callback against real Google is **NOT** in Gherkin (manual/integration only)                                                                                                                                                               | feature-content inspection; absence assertion       |

### 7.3 Architecture / boundaries gates

| #   | Criterion                                                                                                                        | How verified                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| G14 | ESLint boundary rules are **active**: no `*/server/*` imports from `*/client/*`; no direct cross-module imports                  | `./node_modules/.bin/eslint .` reports 0 errors                  |
| G15 | A **deliberate violation** (test fixture) is detected by ESLint and reported                                                     | fixture-based sanity check                                       |
| G16 | `libs/core/database` is the **only** place Prisma client is instantiated                                                         | grep `new PrismaClient(` returns 1 (inside `libs/core/database`) |
| G17 | `libs/features/*/shared/` schemas are **reused** by both client (forms) and server (validation pipe) — no duplicated Zod schemas | grep for the canonical schema path                               |

### 7.4 Domain rules gates (Locked Decisions #7, #8, #9)

| #   | Criterion                                                                                               | How verified                                                       |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| G18 | **Multi-currency**: `Currency` and `FxRate` tables exist; FX conversion has a staleness warning at >24h | schema inspection + unit test on the conversion service            |
| G19 | **Soft-delete categories**: every category query filters `deletedAt: null`                              | grep for `deletedAt: null` in repositories; absence = bug          |
| G20 | **Email+password + Google OAuth** providers run in parallel against `@auth/prisma-adapter`              | `libs/features/auth/server/auth.config.ts` declares both providers |
| G21 | **Password reset** (forgot + reset) is implemented with **email mocked**                                | BDD covers it; mock is documented                                  |
| G22 | **Sessions list + revoke** is implemented                                                               | BDD covers it                                                      |
| G23 | **RBAC roles** (admin / user) are enforced in the **domain** layer (not just the UI)                    | permission check lives in a domain service, not a React component  |
| G24 | **Tx validation**: `amount > 0`, currency valid, category exists                                        | Zod schema + unit tests                                            |
| G25 | **Idempotency-key on POST** prevents duplicates on retry                                                | unit test on the action                                            |
| G26 | **Decimal precision**: `Transaction.amount` is Prisma `Decimal`, not `BigInt`                           | schema inspection                                                  |
| G27 | **Audit log**: `createdBy` / `updatedBy` on every Transaction write                                     | schema + service test                                              |
| G28 | **Sign-aware totals** (income vs expense) + per-category totals + threshold alerts                      | unit tests on the totals service                                   |

### 7.5 Documentation gates

| #   | Criterion                                                                                           | How verified                                              |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| G29 | `docs/architecture.md` exists and is non-empty                                                      | file check                                                |
| G30 | `Documents-es/docs/architecture.md` exists; **same content** (sans locale delta)                    | diff should differ only in locale-specific strings        |
| G31 | `docs/migration-playbook.md` exists with one section per playbook stage                             | file check + section count check                          |
| G32 | `Documents-es/docs/migration-playbook.md` exists                                                    | file check                                                |
| G33 | `scripts/migrate/*.sh` exists; **one `.sh` per playbook stage**                                     | file count check                                          |
| G34 | Each `*.sh` is **idempotent**: re-running on an empty branch is a no-op or prints `already applied` | run each script twice on a fresh clone; exit 0 both times |
| G35 | `LICENSE` is **MIT**                                                                                | file contents                                             |
| G36 | `CONTRIBUTING.md` and `README.md` exist (publicable repo)                                           | file check                                                |

### 7.6 Branch / hygiene gates

| #   | Criterion                                                                                                    | How verified                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| G37 | All commits are on `develop` (no commits to `main`)                                                          | `git log main` shows no new commits beyond the sdd-init baseline                                                          |
| G38 | `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` is the **canonical** proposal             | file exists; this proposal's content matches the Engram observation at `sdd/vertical-slicing-reference-scaffold/proposal` |
| G39 | Engram observation at topic_key `sdd/vertical-slicing-reference-scaffold/proposal` exists and is retrievable | `mem_search` + `mem_get_observation`                                                                                      |

### 7.7 Locked-decisions coverage (Locked Decisions #1–#11)

All 11 locked product assumptions are reflected in this proposal text. The mapping:

| Locked # | Decision                                                                                                                | Reflected at                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| #1       | Publicable; needs LICENSE + ADR + diagram + contributing guide                                                          | §2.1.1, §2.1.5, G29–G36                                    |
| #2       | email+password (Credentials) + Google OAuth, both providers against `@auth/prisma-adapter`                              | §2.1.4, G20                                                |
| #3       | 4–6 `.feature` per module; shared step defs per-feature                                                                 | §2.1.4, G9–G11                                             |
| #4       | Playbook dual format (`.md` prose + sibling `.sh` for AI agents)                                                        | §2.1.5, G31–G34                                            |
| #5       | OAuth provider stub via `NEXTAUTH_URL`; BDD covers email+pw + OAuth happy stubbed; real OAuth = integration-only/manual | §2.1.4, G12, G13                                           |
| #6       | LICENSE = MIT                                                                                                           | §2.1.1, G35                                                |
| #7       | Multi-currency (Currency + FxRate, staleness warning >24h) + soft-delete categories                                     | §2.1.4, G18, G19                                           |
| #8       | Auth edges in scope (login +/-, OAuth stub, password reset, sessions, RBAC)                                             | §2.1.4, G20–G23                                            |
| #9       | Tx edges in scope (validation, FX warning, idempotency-key, Decimal, audit log, soft-delete filter, sign-aware totals)  | §2.1.4, G19, G24–G28                                       |
| #10      | Playbook acceptance = 1:1 feature parity on a slice piloto from `gastos-personales/`                                    | §2.1.6 (out of scope for this proposal; defined for later) |
| #11      | Repo lifecycle: alive until first real migration slice; accepts security/typo fixes only                                | §2.1.7                                                     |

---

## 8. Open questions

**None** that block the proposal. The parent orchestrator ran three product question rounds and a senior-architect pushback before this proposal was drafted; the 11 locked decisions above are the canonical input. Specific implementation choices (e.g. password-hashing algorithm, JWT-vs-session for NextAuth, exact Cucumber step phrasing) are deliberately deferred to the **sdd-spec** phase, which is the right level of abstraction for them.

Two items are flagged here for sdd-spec to address explicitly, but they are _spec-level_ decisions, not _proposal-level_ blockers:

1. **Idempotency-key storage strategy** — keep a separate `IdempotencyKey` table with TTL, or piggyback on `Transaction` with a unique index? Both work; the spec phase should pick one based on storage cost vs query simplicity.
2. **FX rate source** — for the reference repo, an injected `FxRateProvider` interface with a default in-memory implementation is enough. The spec phase should declare this as a port so a real provider can be slotted in later.

---

## 9. Cross-references

| Reference                                             | Where                                                                                                                                   | Notes                                                                                                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdd-init/gastos-personales-reference`                | Engram observation, id 2130, topic_key `sdd-init/gastos-personales-reference`                                                           | Project context, planned stack, SDD configuration, branch model, strict_tdd, skills cache. **Authoritative** for §4 of this proposal.                 |
| `gastos-personales-reference/decisions/sdd-preflight` | Engram observation, id 2128, topic_key `gastos-personales-reference/decisions/sdd-preflight`                                            | Preflight cache: execution_mode, artifact_store.mode, delivery_strategy, chain_strategy, review_budget. Authoritative for §1 and §5 of this proposal. |
| `openspec/config.yaml`                                | `openspec/config.yaml` (repo root)                                                                                                      | Declares branch_model, strict_tdd, delivery_strategy, chain_strategy, review_budget_lines, execution_mode, planned stack.                             |
| Locked product assumptions (this proposal)            | §2.1.4, §2.1.6, §2.1.7, §7.7                                                                                                            | 11 decisions, agreed in three product question rounds.                                                                                                |
| Skills loaded for this proposal                       | `architecture-standards`, `next-best-practices`, `database-strategy`, `testing-standards`, `env-config`, `auth-implementation-patterns` | Each is read before writing this proposal.                                                                                                            |
| Downstream phases                                     | sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-archive                                                                | This proposal is the input to sdd-spec.                                                                                                               |

---

---

## 10. Next phase

`next_recommended`: **`spec`**

`sdd-spec` should:

- Enumerate the auth and transactions edges from §2.1.4 and §7.4 as **explicit acceptance criteria** (one criterion per edge).
- Pick the two deferred decisions in §8 (idempotency-key storage; FX rate provider port).
- Declare the data-model schema in more detail (column types, indexes, constraints).
- Specify the Gherkin feature file inventory (which 4+ files per module, what scenarios in each).
- Specify the migration playbook stages (which stages, in what order, with what commands).

`sdd-design` then answers _how_ (vertical slice structure, event taxonomy, NestJS module boundaries, Next.js route groups).

`sdd-tasks` decomposes into batches sized ≤400 changed lines, respecting `delivery_strategy=ask-on-risk` and `chain_strategy=feature-branch-chain`.

---

---

## 11. Locked UI addendum (post-`sdd-propose` supplement)

Per user feedback captured during the `sdd-propose` interactive gate, the UI scope was upgraded beyond the original §2.2.1 (i18n out of scope) and §2.2.5 (no production hardening). Four product/UI decisions were locked in after a senior-architect pushback (all four taken as recommended options).

### 11.1 Locked UI decisions (UI-1 through UI-4)

| #    | Decision                                                                                                                                                                                                                                                                                                                                                                  | How verified                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-1 | **shadcn/ui + Tailwind v4** as component primitives. shadcn-style components are copied into the repo (CLI not used; manual `<component>.tsx` files under `apps/web/components/ui/`) so they are customizable. Dependencies: `@radix-ui/react-*` (vanilla Radix under the hood), `class-variance-authority`, `tailwind-merge`.                                            | `apps/web/components.json` present; at least Button, Input, Form, Card, Dialog, DropdownMenu, Toast present                                       |
| UI-2 | **Design tokens extracted from `gastos-personales/`** (colors, spacing, typography) and reused via `apps/web/tailwind.config.ts` or CSS variables in `apps/web/app/globals.css`. Visual consistency with the existing app is a deliberate feature.                                                                                                                        | Token files reference the source repo via a brief comment; key colors match the existing app                                                      |
| UI-3 | **English + Spanish** UI strings via `next-intl` (matches the i18n stack already used in `gastos-personales/`). `apps/web/messages/en.json` and `apps/web/messages/es.json` exist; locale routing present (`apps/web/app/[locale]/`).                                                                                                                                     | `pnpm dev` shows `/en` and `/es` routes; at least one string is rendered in both locales                                                          |
| UI-4 | **Production-ready polish**: WCAG **AA enforced** (4.5:1 text contrast, keyboard navigation working, semantic HTML, ARIA only when semantic HTML is insufficient). Responsive: mobile (≤640px) and desktop (≥1024px) breakpoints covered; layout doesn't break in between. Every form has loading / error / success / empty / validation-error states (no raw HTML dump). | axe-core automated audit passes for every critical screen; manual keyboard tab-test passes; visual diff for at least one form across the 5 states |

### 11.2 Implications for the proposal text

- §2.2.1 (Out of scope: i18n) is **amended**: UI strings ARE bilingual via `next-intl`.
- §2.2.5 (Out of scope: production hardening includes design polish) is **amended**: design polish IS in scope and required.
- §2.1.4 (Cross-cutting concerns) gains: shadcn/ui installed; tokens migrated; `next-intl` configured; axe-core lint enabled.
- New gates G40–G47 are added (see §11.3).
- §7.7 (Locked-decisions coverage) gains rows UI-1..UI-4; §7.5 (Documentation gates) is unchanged (docs stay Spanish/English mirrored).

### 11.3 New success criteria (UI gates G40–G47)

| #   | Criterion                                                                                                                                                                       | How verified                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| G40 | `apps/web/components.json` exists; shadcn-style components present at `apps/web/components/ui/{button,input,form,card,dialog,dropdown-menu,toast}.tsx`                          | file path check                                                |
| G41 | Design tokens (colors, spacing, typography) referenced from `gastos-personales/` and applied via `apps/web/tailwind.config.ts` (or CSS variables in `apps/web/app/globals.css`) | grep + visual diff                                             |
| G42 | `next-intl` configured in `apps/web`; `apps/web/messages/en.json` and `apps/web/messages/es.json` exist                                                                         | file check + locale routing works                              |
| G43 | Every screen in `apps/web/app/(auth)/*` and `apps/web/app/(app)/*` is WCAG AA compliant: 4.5:1 text contrast; keyboard navigation; semantic HTML; ARIA only when necessary      | `@axe-core/playwright` audit passes for each critical screen   |
| G44 | Every form has loading / error / success / empty / validation-error states implemented (no raw HTML form dump)                                                                  | component review per form                                      |
| G45 | All pages are responsive: mobile (≤640px) and desktop (≥1024px) breakpoints covered; layout doesn't break in between                                                            | responsive visual diff                                         |
| G46 | Component tests with Vitest + Testing Library: at least one test per critical screen for the happy path                                                                         | vitest run reports passing component tests per critical screen |
| G47 | E2E tests with Playwright: at least one critical flow (login → transactions list → create transaction) passes                                                                   | `pnpm turbo run e2e` exits 0; the critical flow test passes    |

### 11.4 Cross-reference

Convention source-of-truth: Engram observation id 2133, topic_key `gastos-personales-reference/conventions/ui-complete-not-scaffold`. Contains the same UI rules and the rule's lineage.

### 11.5 Implications for downstream SDD phases

- **`sdd-spec`**: enumerate UI acceptance criteria per screen in the auth and transactions specs. Treat shadcn/ui extraction as a dependency of any UI task; treat `next-intl` configuration as a pre-requisite for any task that renders user-facing strings.
- **`sdd-design`**: include UI module decomposition (route groups `(auth)/`, `(app)/`, page components, layouts) and the i18n routing strategy (locale prefix or cookie-based — pick one and document the choice in design).
- **`sdd-tasks`**: include UI tasks per module with explicit state coverage (loading, error, success, empty, validation) and test coverage (component + e2e).
- **`sdd-apply` + `sdd-verify`**: use G40–G47 as final acceptance in addition to G1–G39.

---

**End of proposal.**

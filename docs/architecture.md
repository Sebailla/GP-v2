# Architecture

> **Status**: expanded sections 1-6 (slice 8 PR-A1). Sections 7-12 land in
> slice 8 PR-A2 (`feat/v1.1.2-slice-8-docs-arch-a2`); Spanish mirror
> (`Documents-es/docs/architecture.md`) ships with PR-A2 per
> AGENTS.md §13.
> **Project**: `gastos-personales-reference`.
> **Source of truth**: `openspec/changes/vertical-slicing-reference-scaffold/`
> (slice-1 umbrella) + `openspec/changes/slice-8-closing-bdd-and-docs/`
> (this slice).

This document is the architectural map of the
`gastos-personales-reference` monorepo. Read it before adding a
feature, refactoring a slice, or wiring a new ESLint boundary. The
intent is to let a reviewer verify intent from one document rather
than reconstruct it from fifty files.

## 1. Overview + non-goals

The repo is a runnable, publicable reference scaffold that validates
the vertical-slicing monorepo model documented in
`openspec/changes/vertical-slicing-reference-scaffold/proposal.md`.
It is **not** a 1:1 copy of the existing `gastos-personales/`
project; it exists to validate the model before any production
migration. Slice-1 Locked Decision #11 keeps the repo alive only
until the first real migration slice from `gastos-personales/` is
started — at which point this repo archives.

**What this repo IS**: two runnable apps (`apps/web` Next.js 15,
`apps/api` NestJS 10), three shared library roots (`libs/core`,
`libs/features`, `libs/shared-utils`), an executable migration
playbook, bilingual docs, and a custom ESLint plugin that enforces
the architectural boundaries at lint time.

**What this repo IS NOT** (AGENTS.md §11, locked at slice-1):

- A production deployment target (no secrets manager, no HSTS, no
  CDN, no rate limiting, no observability beyond what Node logs).
- i18n beyond `en` + `es`.
- A migration of `gastos-personales/` — the playbook ships here;
  the migration runs in a separate change.
- An opinion on every OAuth provider, error-reporting SaaS, or
  coverage-gate policy.

{ #section-1 }

## 2. Repository layout

The workspace is `pnpm`-based with three roots (`apps/`, `libs/`,
`tools/`) plus planning artifacts under `openspec/` and `docs/`.
Every workspace is a path-aliased package; consumers import via the
alias, never by relative path into another workspace.

```text
.
├── apps/
│   ├── api/                # NestJS 10 — thin module wrappers around @features/*
│   └── web/                # Next.js 15 App Router
├── libs/
│   ├── core/
│   │   ├── config/         # Zod env schema + env.ts entry
│   │   ├── database/       # Prisma client singleton + schema + migrations
│   │   └── events/         # In-memory dispatcher + 9-event catalog
│   ├── features/
│   │   ├── auth/           # { server, shared, docs }
│   │   └── transactions/   # { server, shared, docs }
│   └── shared-utils/
│       ├── currency/
│       ├── date-formatting/
│       └── decimal/        # decimal.js wrapper (D-TX-6)
├── tools/
│   └── eslint-plugin-boundary/   # the five boundary rules + fixtures
├── docs/                   # English documentation
├── Documents-es/docs/      # Spanish mirror of docs/
├── openspec/               # SDD artifacts (proposal, spec, design, tasks)
├── scripts/migrate/        # 7 idempotent .sh scripts (Locked Decision #4)
├── AGENTS.md               # project-local conventions
├── docker-compose.yml      # Postgres 16-alpine only
├── eslint.config.mjs       # flat config + boundary rules
├── package.json            # root workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json      # strict + 11 path aliases
└── turbo.json              # 8 pipelines: build/dev/lint/test/typecheck/bdd/e2e/clean
```

**Why three library roots, not one.** `libs/core` holds the
non-feature infrastructure (Prisma client, env config, event
dispatcher) that every slice consumes. `libs/features/<x>` holds
domain slices whose `client/server/shared/docs` boundary is the
reference's core architectural contract. `libs/shared-utils` holds
pure helpers (no I/O, no framework deps) — the `decimal.js` wrapper
here is what D-TX-6 requires for monetary math.

**The `client/` anomaly in this slice's current state.** Slice-1's
proposal design (lines 189-202) and the `tsconfig.base.json` paths
(`@features/auth/*` → `libs/features/auth/*`) declare a `client/`
subdirectory under every feature slice. The current scaffold does
NOT yet have `libs/features/<x>/client/` — client components live
under `apps/web/components/auth/` and `apps/web/components/transactions/`.
The migration playbook (`docs/migration-playbook.md`, PR-B) is what
fixes that asymmetry for the first real migration slice from
`gastos-personales/`. The `@features/auth/*` alias already covers
both the future `client/` path and the current `server/` path, so
no path-alias change is needed when the `client/` directories land.

{ #section-2 }

## 3. Monorepo tooling

The monorepo is `pnpm` 10.x workspaces orchestrated by `turbo.json`.
TypeScript 5 strict, with `noUncheckedIndexedAccess` +
`exactOptionalPropertyTypes`, is the single source of type truth
across every workspace.

**Path aliases** (`tsconfig.base.json`):

| Alias | Resolves to |
|---|---|
| `@core/database` | `libs/core/database/src` |
| `@core/database/*` | `libs/core/database/src/*` |
| `@core/events` | `libs/core/events/src` |
| `@core/events/*` | `libs/core/events/src/*` |
| `@core/config` | `libs/core/config` |
| `@core/config/*` | `libs/core/config/*` |
| `@features/auth` | `libs/features/auth/server` |
| `@features/auth/*` | `libs/features/auth/*` |
| `@features/transactions` | `libs/features/transactions/server` |
| `@features/transactions/*` | `libs/features/transactions/*` |
| `@shared-utils/*` | `libs/shared-utils/*` |

Every workspace consumes dependencies via these aliases, never by
relative `../../../libs/...` reach-throughs. The boundary ESLint
plugin enforces the same rule at the AST level (§10).

**Turbo pipelines** (`turbo.json`):

| Task | `dependsOn` | Cacheable | Notes |
|---|---|---|---|
| `build` | `^build` | yes | outputs `dist/**` + `.next/**` (excluding `.next/cache` and `.next/dev`) |
| `dev` | — | no | persistent; never cached |
| `lint` | `^build` | yes | flat config + boundary rules |
| `test` | `^build` | yes | Vitest, output `coverage/**` |
| `typecheck` | `^build` | yes | `tsc --noEmit` per workspace |
| `bdd` | `build` | yes | Cucumber; output `bdd-reports/**` (slice 7+) |
| `e2e` | `build` | yes | Playwright; output `playwright-report/**` + `test-results/**` |
| `coverage` | `^build` | yes | output `coverage/**` |
| `clean` | — | no | nukes `dist`, `.next`, `.turbo`, `coverage`, `bdd-reports`, `playwright-report` |

`dependsOn: ["^build"]` means "build my dependencies before I
build." Combined with `turbo`'s content-hash cache, this gives
PR-level incremental rebuilds.

**ESLint**: flat config (`eslint.config.mjs`) wires the
custom `eslint-plugin-boundary` for the five boundary rules plus
the standard TypeScript and Prettier rules. The `no-mojibake-in-docs`
rule ships with slice 8 PR #3 (#56): it scans
`Documents-es/**/*.md` for CJK / ideographic codepoints so
auto-translation drift fails at lint time, not in production.

**Prettier**: `prettier.config.mjs` at the root, applied via
`pnpm format`. Slice 7 PR #3 (#43) anchored a repo-wide format pass
so subsequent diffs stay readable.

{ #section-3 }

## 4. Domain design — auth

The auth slice lives under `libs/features/auth/{server,shared,docs}`.
It is the most mature slice in the repo — slice 3 (batches 1-6) +
slice 7 + slice 8 PR-1 (#52, auth BDD bridge GREEN) all landed
here. Per Locked Decision #8, the auth slice covers every edge the
existing `gastos-personales/` app uses today; the reference
scaffold does not narrow the surface for simplicity.

**`server/`** (NestJS business code):

| File | Role |
|---|---|
| `auth-service.ts` | `AuthService.login` + `AuthService.register`; the entry points both client forms call |
| `session-service.ts` | `SessionService.getCurrent` + `SessionService.revokeSession`; dispatches `auth.session.revoked` on revoke |
| `rbac-service.ts` | `RbacService.can(action, actor, resource)`; dispatches `auth.rbac.denied` on `false` |
| `password-reset.service.ts` | `PasswordResetService.requestReset` + `PasswordResetService.consumeReset`; dispatches the two `auth.password-reset.*` events |
| `domain/interfaces/{user,session,password-reset-token}.repository.ts` | The three repository ports — consumers depend on these, never on the Prisma adapters directly |
| `infrastructure/repositories/prisma-*.repository.ts` | The three Prisma adapters implementing the ports |
| `events.ts` | The `AuthEventDispatcher` type contract |
| `index.ts` | The public barrel: `AuthService`, `SessionService`, `RbacService`, `PasswordResetService`, the three `Prisma*Repository` classes, and the error classes |

**`shared/schemas/`** — five Zod schemas, one per logical input:

- `login.ts` (`loginSchema`, `LoginInput`)
- `register.ts` (`registerSchema`, `RegisterInput`)
- `forgot-password.ts` (`forgotPasswordSchema`, `ForgotPasswordInput`)
- `reset-password.ts` (`resetPasswordSchema`, `ResetPasswordInput`)
- `session-list.ts` (`sessionListSchema`, `SessionListResponse`)

Every schema is exported through a single barrel
(`libs/features/auth/shared/schemas/index.ts`). The
`no-schemas-outside-shared` ESLint rule makes that the only legal
home for Zod `z.object(...)` literals in the slice.

**`docs/`** — six `.feature` files + shared step definitions:

- 6 Gherkin files (`login-email-password.feature`,
  `login-locale-routing.feature`, `oauth-google-stub.feature`,
  `password-reset.feature`, `rbac-admin.feature`,
  `sessions-list.feature`) per Locked Decision #3.
- 3 step-defs (`common.steps.ts`, `realm.steps.ts`, `world.ts`).
- 4 support files (`env-bootstrap.js`, `register.ts`,
  `service-context.ts`, `cucumber.mjs`).

Slice 8 PR #1 (#52) wired the `register.ts` bridge that lets
cucumber 13's `callbackInterface` branch fire (the `(world, ...args)`
rest-args wrapper was the slice-7-era bug). Auth now runs 18/18
BDD scenarios under 2 seconds.

**Events emitted** (Pattern A — services dispatch directly via the
constructor-injected dispatcher; no monkey-patch wrapper):

| Event | When | Payload |
|---|---|---|
| `auth.password-reset.requested` | `PasswordResetService.requestReset` | `{ userId, token (dev-only), requestedAt }` |
| `auth.password-reset.completed` | `PasswordResetService.consumeReset` | `{ userId, resetAt }` |
| `auth.session.revoked` | `SessionService.revokeSession` | `{ userId, sessionId, revokedAt }` |
| `auth.rbac.denied` | `RbacService.can` returning `false` | `{ userId, action, resourceType, at }` |

Payload schemas are declared in `libs/core/events/src/types.ts`
(the canonical 9-event catalog); the slice's `events.ts` file is a
consumer, not the source of truth.

{ #section-4 }

## 5. Domain design — transactions

The transactions slice lives under
`libs/features/transactions/{server,shared,docs}`. It is the second
mature slice; slice 5 (PRs #1-#3) + slice 7 PR-8 (#51) landed
here. Per Locked Decision #7 the slice ships multi-currency totals
+ soft-delete categories + idempotency-key support; per Locked
Decision #9 every transactions edge in the existing app is in
scope.

**`server/`** (NestJS business code):

| Layer | Files |
|---|---|
| Domain services | `domain/services/{transaction,category,totals,threshold}.service.ts` |
| Domain entities | `domain/entities/{transaction,category,audit-log,fx-rate,currency,idempotency-key}.entity.ts` |
| Domain ports | `domain/interfaces/{transaction,category,audit-log,fx-rate,currency,idempotency,unit-of-work}.{repository,provider}.ts` |
| Prisma adapters | `infrastructure/repositories/prisma-{transaction,category,fx-rate,currency,audit-log,idempotency-key}.repository.ts` |
| FX provider | `infrastructure/fx/in-memory-fx-rate.provider.ts` (dev/test only — production must swap via `FX_RATE_PROVIDER_TOKEN`) |
| Unit of work | `infrastructure/unit-of-work/prisma-unit-of-work.ts` |

**`shared/schemas/`** — five Zod schemas:

- `create.ts` (`createSchema`, `CreateTransactionInput`)
- `update.ts` (`updateSchema`, `UpdateTransactionInput`)
- `list.ts` (`listSchema`, `ListTransactionsQuery`)
- `category-create.ts` (`categoryCreateSchema`, `CreateCategoryInput`)
- `category-update.ts` (`categoryUpdateSchema`, `UpdateCategoryInput`)

**`docs/`** — six `.feature` files + 4 step-defs + 3 support files.
Slice 7 PR #8 (#51) closed the bridge fix for transactions; all
25/25 scenarios pass under 5 seconds.

**Soft-delete invariant (D-TX-5)**. Every category query filters
out `deletedAt != null` rows by default. There is no
`includeDeleted: true` escape hatch in the public API — recovery
flows go through the audit log + admin tooling, not through the
default read path. The repository port enforces this; the Prisma
adapter enforces it; the unit tests assert it.

**Decimal handling (D-TX-6)**. All monetary math routes through
`@shared-utils/decimal`. Prisma's runtime `Decimal` (from
`@core/database`) is converted at the repository boundary via
`toDecimal(row.field.toString())`. No primitive `number` math
anywhere on money — IEEE-754 drift is not acceptable for audit
trails.

**Events emitted**:

| Event | When | Payload |
|---|---|---|
| `transactions.created` | `TransactionService.create` succeeds | `{ transactionId, userId, amount (Decimal string), currency, at }` |
| `transactions.updated` | `TransactionService.update` succeeds | `{ transactionId, userId, at }` |
| `transactions.soft-deleted` | `TransactionService.softDelete` succeeds | `{ transactionId, userId, at }` |
| `transactions.fx.stale` | `TotalsService` notices an FX rate > N hours old | `{ baseCurrency, quoteCurrency, asOf, ageHours }` |
| `transactions.threshold.exceeded` | `ThresholdService.check` trips a user-configured cap | `{ userId, threshold, totalAtCurrency, at }` |

{ #section-5 }

## 6. `libs/core` (database, events, config)

`libs/core` holds the non-feature infrastructure: the single Prisma
client, the in-memory event dispatcher, and the Zod-validated env
schema. Everything in `libs/core` is consumed via the `@core/*`
aliases — there are no direct relative imports of `libs/core/...`
from feature slices.

### 6.1 `libs/core/database/` — Prisma client singleton

`libs/core/database/src/client.ts` instantiates one
`PrismaClient`. The `no-prisma-outside-core` ESLint rule forbids
`new PrismaClient()` anywhere else in the workspace, so every
consumer — `apps/api`, `apps/web`, every feature slice's
`infrastructure/repositories/prisma-*.ts` — imports
`{ prisma }` from `@core/database`. Drift on the singleton
(connection limits, logging hooks, schema version) is impossible by
construction.

Public surface (`libs/core/database/src/index.ts`):

- `prisma` — the singleton.
- `PrismaClient` (type) — for adapter signatures that need it.
- `Prisma` (namespace, type-only) — `Prisma.CategoryWhereInput`
  etc. without reaching into the generated internal paths.
- `PrismaClientKnownRequestError`,
  `TransactionIsolationLevel` — for `instanceof` narrowing in
  repository adapters.
- `Prisma.Decimal` (type-only) — the Prisma runtime `Decimal`
  class; adapters convert to `@shared-utils/decimal` at the
  boundary.
- `isPrismaUniqueViolation`, `isPrismaNotFound` — shared guards
  for `P2002` / `P2025` translations. Handles both `string` and
  `string[]` `meta.target` shapes (single-field vs. compound
  unique constraints).

The Prisma schema lives at
`libs/core/database/prisma/schema.prisma` and migrations at
`libs/core/database/prisma/migrations/`.

### 6.2 `libs/core/events/` — in-memory dispatcher + 9-event catalog

`libs/core/events/src/dispatcher.ts` exports
`createInMemoryDispatcher`, a synchronous, fan-out dispatcher with
a bounded ring buffer for dev introspection. Slice 4+ will swap
this for a real broker (out of scope per AGENTS.md §11); for now
every slice dispatches into the in-memory instance and tests inject
`vi.fn()` dispatchers with the same shape.

`libs/core/events/src/types.ts` declares the **9 domain events**
(4 auth + 5 transactions) with their Zod payload schemas and
inferred TS types. The catalog is the source of truth — feature
slices import `DomainEvent`, `EventName`, and the per-event payload
types from here, never re-declare them.

The `redactSensitive()` helper replaces `payload.token` with the
`REDACTED_TOKEN_SENTINEL = "***REDACTED***"` literal at the
ring-buffer boundary. Handlers receive the raw event (the email
handler needs the real token); only the buffer holds the redacted
copy. F3 critical-severity fix from the slice-3 4R review.

### 6.3 `libs/core/config/` — Zod env schema

`libs/core/config/env.schema.ts` declares `envSchema` — the
Zod-validated shape of the workspace's runtime environment.
Validated at import time by `env.ts`; any missing or malformed
variable throws a `ZodError` listing every offending field, so the
process fails fast at startup instead of crashing later when the
first consumer reads `process.env.DATABASE_URL`.

Required variables (slice-4 + slice-3-7 additions):

- `DATABASE_URL` (URL), `NEXTAUTH_URL` (URL), `NEXTAUTH_SECRET`
  (≥32 chars), `API_URL` (URL, slice-4 batch-4c — client form
  uses it for `POST /auth/login` + `POST /auth/register`).
- `PORT` coerces from string to number; `NODE_ENV` is a closed
  enum (`development | test | production`).
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are optional
  non-empty strings; both must be present for the Google OAuth
  provider to register.

The schema and `parseEnv` are exported separately from the
import-time-evaluated `env.ts` so tests can call `parseEnv({})`
without poisoning `process.env`.

{ #section-6 }

---

_Next: sections 7-12 land in slice 8 PR-A2
(`feat/v1.1.2-slice-8-docs-arch-a2`): `libs/shared-utils`,
slicing contract, BDD colocated strategy, ESLint boundaries,
branch model + SDD workflow, glossary + cross-references._


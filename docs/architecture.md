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

## 7. `libs/shared-utils` — pure helpers rule

Every package under `libs/shared-utils/<x>/` MUST be a **pure helper**:
no I/O, no framework dependencies, no Prisma, no NestJS, no Next.js,
no React. Anything that touches the outside world (disk, network, env,
time, randomness) belongs in a slice's `server/` or `infrastructure/`,
not here. This rule is what keeps `libs/shared-utils` cheap to test
(Vitest only, no container spin-up) and safe to import from any
package — including `client/` code.

**The three packages that exist today** (slice 4 batch-4a added
`date-formatting`; slice 5 PR-1 added `currency`; slice 5 PR-3 added
`decimal` per D-TX-6):

| Package | Purpose | Why it has to live here |
|---|---|---|
| `@shared-utils/date-formatting` | Locale-aware `Intl.DateTimeFormat` wrappers, ISO-8601 round-trip | Both client forms and server validation need identical date formatting |
| `@shared-utils/currency` | ISO-4217 currency-code list + display-formatter | Transactions slice displays currency codes; auth slice displays amounts on password-reset receipts |
| `@shared-utils/decimal` | `decimal.js` wrappers — `toDecimal`, `fromPrismaDecimal`, `sum`, `roundHalfEven` | D-TX-6 forbids IEEE-754 math on money; wrapper gives one canonical home for the conversion rules |

All three are consumed via the `@shared-utils/*` alias declared in
`tsconfig.base.json`. Adding a fourth is a deliberate move; see §11
for the branch-naming convention when a new package lands.

### 7.1 When to add a new `@shared-utils` package

A new helper package is the right call when **all three** of these
hold:

1. The helper is consumed from **at least two workspaces**
   (e.g. `@features/auth` and `@features/transactions`, or
   `@features/<x>` plus `apps/web`).
2. The helper has **no side effects** — no I/O, no env reads, no
   framework hooks.
3. The helper would create a **circular import or duplication**
   if it were instead placed inside one slice's `shared/` folder.

If only condition 1 holds: keep it inline in the consuming slice
first; promote to `@shared-utils` on the first duplication. If
condition 2 fails: the helper belongs in a slice's `server/` or
`infrastructure/`, not in `libs/shared-utils`. AGENTS.md §8 names
"single source of truth" as the reason this rule exists: every
financial calculation that ever happens on the same input MUST
route through the same code path or audit trails break.

### 7.2 Why `decimal.js` (not `BigInt`, not `number`)

D-TX-6 locked the choice: money is `@shared-utils/decimal`. The
rationale (preserved verbatim from slice-5 design §4.1 so future
contributors can find it):

- **`number`** is IEEE-754 double. `0.1 + 0.2 !== 0.3`. Drift on
  totals + threshold checks = real money lost from a user's
  ledger. Not acceptable for audit trails.
- **`BigInt`** has no decimal point. Satoshis-as-bigint is the
  only viable use; ARS/USD/EUR decimal amounts are not.
- **`decimal.js`** is the smallest sane wrapper. Fixed scale
  (28 digits default), configurable rounding mode
  (`roundHalfEven` for half-to-even / banker's rounding,
  matching IFRS), string serialization that survives JSON
  without precision loss.

The Prisma runtime `Decimal` (imported as type-only via
`@core/database`) is converted at the **repository boundary**
via `fromPrismaDecimal(row.field.toString())`. Adapters do NOT
return a Prisma `Decimal` upward into the domain layer; they
return a `@shared-utils/decimal` value object. This is the
boundary that makes `number` math on money impossible by
construction.

{ #section-7 }

## 8. Slicing contract — `libs/features/<x>/{server,shared,docs}`

Every feature slice owns **four top-level folders**, and the ESLint
plugin enforces each one. The reference scaffold currently has
`server/`, `shared/`, and `docs/` populated; `client/` is reserved
for the next slice (slice-1 Locked Decision #12 extends the path
alias without forcing a `client/` directory today — see §2's "client/
anomaly" note).

### 8.1 The four-folder contract

| Folder | Lives there | MUST NOT import |
|---|---|---|
| `client/` | React components, hooks, browser-only glue (later slice) | anything from `server/`, anything from `apps/api/*` |
| `server/` | NestJS services, controllers, infrastructure adapters, repository ports | anything from `client/`, `apps/web/*` |
| `shared/` | Zod schemas, pure types, isomorphic helpers (no React, no NestJS) | `server/`, `client/`, `@core/database`, `@core/events` |
| `docs/` | `.feature` files, step definitions, cucumber bridge, world state, BDD support | `client/`, `apps/*` (BDD is a test concern, not a runtime concern) |

Two axioms follow:

1. **`shared/` is the only folder that every other folder may
   import from.** `client/`, `server/`, and `docs/` may all import
   from `shared/`. `shared/` may import from nothing inside the
   slice except other `shared/` modules.
2. **`docs/` is the only folder that may import from everywhere
   inside the slice.** BDD scenarios test the integration; the
   bridge (`register.ts`) calls `server/` services through their
   public barrel. `docs/` does NOT leak back into `server/` or
   `client/`.

The exceptions are deliberate, not absences: `shared/` is the
seam where schemas cross the wire, so it has the right to depend
upward on nothing else inside the slice.

### 8.2 Path aliases carry the contract

`tsconfig.base.json` declares the aliases; `eslint.config.mjs`
inspects imports against them. Every `import` into another
workspace goes through an alias — never a relative `../../../`
reach-through. The aliases in use today (slice-4 batch-4a +
slice-5 PR-1):

- `@features/auth` → `libs/features/auth/server` (default; pair
  with `/*` for sub-paths)
- `@features/auth/shared` → `libs/features/auth/shared` (explicit;
  lets `server/` import `shared/schemas/login` without round-trip
  through default)
- `@features/auth/docs` → `libs/features/auth/docs` (explicit;
  BDD step-defs and `.feature` files use this)
- Same triplet for `@features/transactions`

The `no-cross-module-import` rule (§10) catches the bad case:
`import { authService } from "@features/auth/server"` is fine
inside the slice's own `docs/support/`; it is NOT fine inside
`@features/transactions/server/`. The ESLint layer reads the
containing file's path and refuses the import before it reaches
the type-checker.

### 8.3 The public barrel is the API

Every `server/` package declares its public surface through
`src/index.ts`. Consumers — the same slice's `docs/support/` and
external slices — `import { AuthService, SessionService, … }` from
the barrel only. The rule forces a discipline: nothing inside the
barrel reaches across to another slice; nothing outside reaches
past the barrel into internals.

The auth slice's `src/index.ts` is the canonical example:

- Exports the four services (`AuthService`, `SessionService`,
  `RbacService`, `PasswordResetService`) plus the three
  repository adapter classes (`PrismaUserRepository`,
  `PrismaSessionRepository`,
  `PrismaPasswordResetTokenRepository`).
- Exports the slice's error classes
  (`InvalidCredentialsError`, `SessionNotFoundError`, etc.)
  so the BDD step assertions can `expect(...).toBeInstanceof(...)`
  without reaching into `domain/errors/`.
- Does NOT export the `@auth/prisma-adapter` wrapper (slice
  8.1.2 narrowed that to client-only; see commit `2e05fc5`).

### 8.4 Worked example — extracting `notifications` from a monolith

Suppose the next migration slice pulls a `notifications` module out
of `gastos-personales/src/notifications/`. The trajectory it should
follow:

**Step 1 — pre-flight (`scripts/migrate/00-preflight.sh`).**
Verify `pnpm`, `docker`, `git`, Node 22. Bail if the working tree
is dirty. The full pre-flight is a separate script (Locked
Decision #4 dual-format); the architecture says only that PRs
without a clean pre-flight MUST not start the slice.

**Step 2 — extract domain (`10-extract-domain.sh`).** Move
`src/notifications/{domain,application,infrastructure}` into
`libs/features/notifications/server/src/`. Adjust the
`tsconfig.base.json` paths: add `@features/notifications` →
`libs/features/notifications/server`. Note that this is THE place
the slicing contract is created; after this step there are two
code paths to the same logic, and the duplicate MUST be deleted
before merging (consumers of the old path orphan at that point).

**Step 3 — create the slice skeleton (`20-create-feature-slice.sh`).
** Materialize `libs/features/notifications/{client,server,shared,docs}`
with `package.json`, `tsconfig.json`, `vitest.config.ts`,
`cucumber.mjs`, and an empty `src/index.ts` in each. The slice's
`package.json` declares the four subpath entries
(`.` for server, `/shared`, `/docs`, `/client`).

**Step 4 — write the feature files (`docs/*.feature` per Locked
Decision #3).** Four to six `.feature` files minimum; every
business rule in the source module maps to at least one
scenario. Step definitions go under `docs/step-defs/{common,
<feature>}.steps.ts`. The cucumber bridge lives at
`docs/support/register.ts` and follows the same `a9b550d`
build-wrapper pattern as auth and transactions.

**Step 5 — add a `shared/schemas/` barrel.** Whatever inputs the
new slice validates get a Zod schema under
`shared/schemas/<input>.ts`, re-exported from
`shared/schemas/index.ts`. The `no-schemas-outside-shared` rule
turns this into a non-negotiable structural invariant.

**Step 6 — wire the routes (`30-wire-routes.sh`).**
`apps/api/src/app.module.ts` registers the slice's NestJS
module; `apps/web` adds the slice's UI surface (deferred for
this scaffold — see §2's "client/ anomaly"). The tsconfig path
addition is idempotent: re-running the script with the alias
already present exits 0 + `already applied`.

**Step 7 — port tests + BDD (`40-port-tests.sh`).** Vitest suites
copy across with `cp -r`; `.feature` files come from step 4.
`pnpm --filter @features/notifications test` and
`pnpm --filter @features/notifications bdd` both exit 0.

**Step 8 — update the docs (`50-update-docs.sh`).** Append a
`## Domain design — notifications` section to
`docs/architecture.md` (the section lands in slice 8's docs
prose, mirroring the structure of §4 and §5). Mirror the new
section to `Documents-es/docs/architecture.md` in the same
atomic commit (AGENTS.md §13).

**Step 9 — finalize (`99-finalize.sh`).** Run lint, typecheck,
test, BDD. If all four exit 0, write the marker file
`.migration-notifications-done`. Subsequent re-runs of
`99-finalize.sh` short-circuit on the marker.

The eight-stage trajectory is the canonical "monolith → slice"
recipe. It runs once per slice during the real migration out of
`gastos-personales/` (separate change, not slice 8's scope per
AGENTS.md §11).

{ #section-8 }

## 9. BDD colocated strategy

BDD lives **next to the code it tests**, in `libs/features/<x>/docs/`,
not in a top-level `tests/` or `features-e2e/` folder. The choice
is structural — colocated scenarios and step-defs survive
copy/paste across the slice migration, and the cucumber runner
discovers them with the same Vitest config that already exists
in the slice (added in slice 7 PR-7 + slice 8 PR-1's
`vitest.config.ts` include bump).

### 9.1 The directory shape

```
libs/features/<x>/docs/
├── cucumber.mjs                      # cucumber binary entry; require()s register.ts
├── *.feature                         # 4-6 Gherkin files per Locked Decision #3
├── __tests__/                        # vitest in-slice tests for the bridge + step-defs
│   └── register.test.ts              # the RED → GREEN bridge contract test
├── step-defs/                        # shared step definitions
│   ├── common.steps.ts               # generic ("Given I am logged in", …)
│   ├── <feature>.steps.ts            # 4-6 files mirroring the .feature files
│   └── world.ts                      # declares <X>World + create<X>World()
└── support/                          # non-step glue; loaded once
    ├── env-bootstrap.js              # sets DATABASE_URL etc. before bridge load
    ├── register.ts                   # the cucumber 13 bridge (a9b550d pattern)
    ├── service-context.ts            # module-level singleton: repos + services
    └── register.cjs                  # optional; required when cucumber.mjs can't .ts
```

The split is deliberate. **`step-defs/*.steps.ts` carries the
human-language steps** ("Given the user logs in with valid
credentials"). **`support/*.ts` carries the mechanism that wires
those steps into cucumber** (the bridge, the world, the
module-level service context, environment bootstrapping).

### 9.2 The cucumber-13 bridge pattern (`a9b550d`)

The bridge at `libs/features/<x>/docs/support/register.ts`
publishes every entry from `step-defs/*.steps.ts` into cucumber
13's `Given`/`When`/`Then` registries, using a callback-style
wrapper whose `fn.length === argsArray.length`. The key insight
(captured from the transactions bridge at `a9b550d`, now mirrored
in auth via slice 8 PR-1 / commit `af56075`):

Cucumber 13 inspects every registered step's arity. If
`fn.length === argsArray.length`, it takes the
`callbackInterface` branch and pushes a `(err, result) =>
void` callback onto `argsArray`. If `fn` returns a thenable, it
takes the `promiseInterface` branch. If both flags match, it
throws the "function uses multiple asynchronous interfaces"
error and the entire suite freezes.

The slice-7 transactions fix solved this by building a thin
callback-style wrapper:

```ts
function buildWrapper(numCaptures: number, stepFn: StepFn): CallbackWrapper {
  if (numCaptures === 0) {
    return function (done) { /* world via this.inner; resolve/stepFn */ };
  }
  // Synthesize a function with numCaptures capture parameters + done;
  // new Function is the only way to set fn.length dynamically.
  const paramNames = Array.from({ length: numCaptures }, (_, i) => `c${i + 1}`).join(", ");
  const stringCalls = Array.from({ length: numCaptures }, (_, i) => `String(c${i + 1})`).join(", ");
  const factory = new Function("stepFn",
    `return function (${paramNames}, done) { /* …world=this.inner; Promise.resolve(stepFn(world, …)).then(…); */ };`,
  );
  return factory(stepFn);
}
```

The wrapper declares exactly `numCaptures` named capture
parameters plus a trailing `done` callback. `fn.length ===
numCaptures + 1`, which matches `argsArray.length`, so cucumber
takes the callback branch exclusively. The wrapper never returns
a Promise from its synchronous body, so the dual-interface guard
cannot fire.

Slice 8 PR-1 ported this verbatim to the auth slice
(`libs/features/auth/docs/support/register.ts`) with five
substitutions documented in the file's header comment. The
auth-only change is `AuthWorld` replaces `TxWorld`; everything
else is byte-identical.

### 9.3 The bridge contract — what every test asserts

Every slice's `docs/__tests__/register.test.ts` asserts three
things (mirrored from
`libs/features/transactions/docs/__tests__/register.test.ts`,
177 LOC, into auth at slice 8 PR-1):

1. **Wrapper arity matches `argsArray.length`.** Mock cucumber
   (`Given`, `When`, `Then`, `setWorldConstructor` spies).
   Register a 2-capture binding. Invoke the registered wrapper
   with `thisArg = new AuthWorldWrapper()` and
   `argsArray = ["first", "second", callback]`. Assert the
   inner `fn` is called with
   `(world.inner, "first", "second")` exactly, length 3. Assert
   the `callback` is invoked once with no error arg.
2. **Capture-group regex exposes both captures.** Assert the
   `RegExp` registered to cucumber exposes `match[1]` and
   `match[2]` when matched against a sample string. This is the
   RED assertion that proves the bridge transforms
   `{string}` placeholders into real capturing groups, not
   non-capturing alternations.
3. **`setWorldConstructor` is called once at bridge load.**
   Assert the spy is invoked at least once when
   `import "../support/register.js"` runs, with a class whose
   prototype exposes `.inner: <X>World`.

Three assertions, three regression classes. The fix that turned
the slice-7 transactions suite green (`a9b550d`) covers all
three; the slice-8 auth port (`af56075`) preserves them.

### 9.4 World state — mutable, per-scenario reset

`AuthWorld` and `TxWorld` are **mutable** state objects passed
as `world` to every step binding. Each scenario gets a fresh
`AuthWorldWrapper`/`TransactionsWorldWrapper` (the class
registered with `setWorldConstructor`); each scenario sees a
clean world.

World fields carry **step-level** state: `lastErrorMessage`,
`sessionCreated`, `lastUserId`. They do NOT carry
cross-scenario persistence — that lives in `service-context.ts`,
a module-level singleton constructed once per bridge load.
`service-context.ts` holds the in-memory user repository and
service instance (`{ users, authService }` in auth,
`{ prismaUnitOfWork, fxProvider, … }` in transactions), so
state created in scenario A genuinely persists into scenario B
when the test wants it to (e.g. "Given I previously logged in"
inside a multi-scenario rule).

**The two-tier separation is intentional.** Crossing the layers
would force one of two failures:

- If `service-context` was per-scenario, then scenarios that
  depend on prior state (the password-reset flow's
  "Given a reset token was issued earlier" pattern) would
  have to re-seed state in every step — verbose and brittle.
- If `World` was the cross-scenario store, then cucumber's
  per-scenario reset would break the entire persistence
  guarantee — and `setWorldConstructor` exists precisely to
  prevent that pattern.

The bridge (`register.ts`) is the **indirection** that lets
cucumber's `thisArg` carry a fresh wrapper per scenario while
the singleton lives on. The slice-8 PR-1 fix preserved this
two-tier design verbatim; do not collapse it.

### 9.5 Discovery — `vitest.config.ts` include arrays

For a slice's Vitest to discover `docs/__tests__/*.test.ts`, the
slice's `server/vitest.config.ts` MUST include the path:

```ts
include: [
  "src/__tests__/**/*.test.ts",
  "../shared/schemas/__tests__/**/*.test.ts",
  "../docs/__tests__/**/*.test.ts",   // BDD bridge contract test
],
```

Transactions had this line at slice 7 PR-7 (commit `36386e1`).
Auth did not — slice 8 PR-1 added the third entry. Future
slices inherit the pattern from the canonical
`libs/features/transactions/server/vitest.config.ts`; an
absent entry means the bridge contract test never runs and a
regression to `(world, ...args) => ...` style would not be
caught in unit tests.

{ #section-9 }

## 10. ESLint boundary rules — the five-rule enforcement loop

The custom ESLint plugin at `tools/eslint-plugin-boundary/` encodes
the architectural contract as a flat-config ESLint plugin. Five
rules cover the four code-side boundaries plus the one docs-side
boundary. Each rule ships with a fixture pair (an `invalid.<ext>`
that must fire the rule, and a `valid.<ext>` that must stay silent);
the rule sanity check is `pnpm lint:fixtures`, which MUST exit 0
on every commit that touches the plugin or its fixtures.

### 10.1 The four code-side rules

| Rule | Forbidden shape | Where it fires | Why it exists |
|---|---|---|---|
| `no-prisma-outside-core` | `new PrismaClient()`, `new Prisma.<Model>Delegate`, `Prisma.dmmf`, etc. anywhere except `libs/core/database/src/` | All `*.ts` / `*.tsx` / `*.js` / `*.cjs` / `*.mjs` | AGENTS.md §7 — single Prisma client; consumer adapters reach for `@core/database` only |
| `no-schemas-outside-shared` | Zod `z.object(...)`, `z.enum(...)`, `z.discriminatedUnion(...)`, etc. outside `libs/features/<x>/shared/schemas/` + `libs/core/config/env.schema.ts` | All code-side files | AGENTS.md §7 — single home for schema literals; client form + server ZodValidationPipe import the same schema |
| `no-cross-module-import` | `from "@features/<x>/..."` across slices (e.g. transactions imports from auth) | All code-side files | AGENTS.md §7 — cross-slice reach-throughs must go through `@core/events` or a shared port, never a direct file path |
| `no-client-server-import` | `from "*/server/..."` inside `libs/features/<x>/client/*` (and the symmetric `from "*/client/..."` inside `libs/features/<x>/server/*`) | The `client/` folder when it exists; the symmetric guard fires once the `client/` directories ship | Split-architecture enforcement — the boundary exists for a reason |

For `no-cross-module-import`, the rule reads the importing file's
path and refuses the import before it reaches the type-checker.
Same logic for `no-client-server-import` once `client/` lands.

### 10.2 The one docs-side rule

The fifth rule, `no-mojibake-in-docs`, scans
`Documents-es/**/*.md` for CJK / ideographic codepoints (the
auto-translation drift that polluted the mirror before slice 8).
It uses an ESLint `Program` visitor plus `sourceCode.getText()` to
report every offending codepoint with the file path and offset.
Wired in slice 8 PR #3 (`b2f3401`) with `@eslint/markdown@8.0.3`
(exact pin — no caret — per slice-1 §5 Stack-churn mitigation).

The rule is scoped to `Documents-es/**/*.md` in `eslint.config.mjs`,
not to `*.ts` / `*.tsx`: without the scoping, Spanish prose in
TypeScript comments would erroneously fire the rule (a regression
class the runner caught during slice-8 PR #3's triangulation).
The `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/`
folder holds `invalid.md` (CJK on lines 6 and 8 — pre-existing),
`secondCjkLine.invalid.md` (CJK on line 5 — added in slice 8 PR #3
to triangulate line-position dependency), and `valid.md` (no CJK).

### 10.3 Fixture-runner contract

`tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` is a tiny
single-purpose runner — no `jest`, no `vitest`. For each rule in
the `RULES` array, it:

1. globs `__fixtures__/<rule-name>/{valid,invalid}.<ext>`,
2. invokes ESLint programmatically on each fixture,
3. asserts `valid.*` reports 0 errors and `invalid.*` reports ≥1
   error, and
4. prints a `PASS` / `FAIL` line per fixture.

For `no-mojibake-in-docs`, an extra step scans every production
`Documents-es/**/*.md` (excluding `__fixtures__/`) and asserts
zero CJK codepoints — exit 1 with the offending path on a hit.
`pnpm lint:fixtures` MUST exit 0 in CI; the slice-8 PR #3 commit
made it part of the merge gate via the BDD gate + the rule
triangulation.

The runner's per-rule `allowMultipleInvalids` flag
(slice-8 PR #3 design §4.4) keeps the four `.ts` rules on the
single-invalid-fixture invariant while allowing the `.md` rule
to accumulate triangulation cases (today:
`invalid.md` + `secondCjkLine.invalid.md`).

### 10.4 Why ESLint, not a separate CI check

The natural temptation is to enforce these rules in a separate
linter — a bash script, a custom CLI, a pre-commit hook. Three
reasons the rules live as ESLint:

1. **Editor feedback.** ESLint integrates with every editor
   the team uses (VSCode, JetBrains). The same rule fires on
   save AND in CI AND in `pnpm lint`. A standalone script has
   CI feedback but no editor feedback; the round-trip from
   "I just broke the boundary" to "VSCode squiggly" is the only
   fast enough signal humans pick up.
2. **Auto-fix where applicable.** Some ESLint rules can ship
   `--fix`-able suggestions. None of the five boundary rules
   do today (the fixes would be invasive), but the door is
   open — and an ESLint shape is the prerequisite.
3. **One config, one command.** `eslint.config.mjs` is the
   single source of truth. Adding a sixth rule is a PR to the
   plugin + a fixture pair; no separate linter to wire up.

The ESLint plugin is intentionally CommonJS `.cjs` (not
TypeScript) — per spec §"Out of scope" item 7, refactoring it
to TypeScript is its own change with its own SDD lifecycle.

{ #section-10 }

## 11. Branch model + SDD workflow

The reference scaffold's branch model and commit conventions are
the two docs that determine whether new work lands in a way the
team can review. The shape is two-sided:

- **Branching** is a deliberate chain that keeps `main` clean
  and `develop` shippable.
- **Committing** follows Conventional Commits so every commit
  message answers "what changed and why" in one line; every
  commit is atomic so `git revert <sha>` reverses one logical
  unit of behavior.

### 11.1 The branch graph

```
main                 (immutable — GitHub-protected)
  │
  └── develop         (working branch — every PR targets here
       │              until the slice-1 / slice-8 chain closes,
       │              then forks off `feat/...` chains)
       │
       ├── feat/<version>-slice-<N>-<name>-<stage>     (child
       │                                                  chains;
       │                                                  each targets
       │                                                  the tracker)
       │     │
       │     └── feat/<version>-slice-<N>-<name>-<stage>-<X>
       │           (sub-child; targets the immediate parent)
       │
       └── fix/<short-name> / chore/<short-name> / docs/<short-name>
             (single-shot PRs that target `develop` directly)
```

**`main` is immutable.** AGENTS.md §2 plus the GitHub
branch-protection rule (`no force-push, no delete`) makes
`main` write-once from the team's perspective. Every release
tag is a squash-merge from `develop`; the tag itself is
immutable history (`v1.1.1` is the current G2 release; `v1.1.2`
lands when slice 8 closes).

**`develop` is the integration branch.** Every PR that isn't
explicitly chained onto a `feat/...` tracker merges directly
into `develop`. The BDD gate (slice 8 PR-2, commit `c9d3112`)
runs on every PR-to-`develop`; failure blocks merge.

**Feature branches target the tracker.** When a change (a
slice) is large enough to need chained PRs, the orchestrator
opens a `feat/v<version>-slice-<N>-<name>` branch off `develop`
and child PRs target that tracker. The tracker stays open /
draft until every child PR has merged, then squash-merges to
`develop` to close the slice. This is the `feature-branch-chain`
strategy (defined in `openspec/config.yaml`); slice-7 and slice-8
both follow it.

**Branch naming convention** (slice 7 locked, slice 8 carried):
`feat/<semver-bumped-major.minor>-slice-<N>-<short-name>`. The
version bump reflects the change's semantics: `v1.1.x` series for
backward-compatible features; `v1.2.x` for breaking changes;
`v2.x` for major rewrites. Child branches append the stage:
`feat/v1.1.2-slice-8-docs-arch-a2` is the second-stage child of
the slice-8 tracker.

### 11.2 Conventional Commits, atomic, no AI trailer

Every commit message follows Conventional Commits (AGENTS.md §6):

- **Type**: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`,
  `build`, `ci`, `perf`, `style`. PR titles use the same
  vocabulary.
- **Scope**: the package or surface the change touches (auth,
  bdd, web, architecture, lint, migrate). Required for slice
  work; optional for one-line chores.
- **Subject**: imperative present, ≤72 chars, no trailing
  period. "Add foo" not "Added foo" or "Adds foo".
- **Body**: explains WHY, not WHAT. The diff is the WHAT.

Atomic commits (AGENTS.md §5): each commit represents one
deliverable behavior, fix, migration, or docs unit. `git revert
<sha>` reverses a task cleanly. Tests and docs stay with the
code they verify.

**No AI-attribution trailer.** AGENTS.md §6 hard rule. Commit
messages MUST NOT contain `Co-Authored-By: <anything-AI>` or
equivalent AI co-author lines. The committer is the human;
the AI was the executor; the human owns the merge.

### 11.3 Chained-PR + tracker pattern

When a slice exceeds the 400-line review budget, the orchestrator
applies the `ask-on-risk` delivery strategy (declared in
`openspec/config.yaml`): stop, surface the workload forecast to the
user, get an explicit split or a `size:exception` recorded before
implementing. Slice 8 used this twice — once for PR-A2 (architecture
§7-§12 + Spanish mirror, ~850 LOC), once for PR-B2 (playbook §8-§11 +
Spanish mirror, ~950 LOC). The user accepted `size:exception` in
both cases; the architecture and playbook shipped as single PRs
with that annotation in the PR body.

The chained-PR pattern uses **three rhythms**:

1. **Simple chain (1 → 2 → 3)**: ordered, dependent. PR #1 must
   land before PR #2; PR #2 must land before PR #3. The
   auth-bridge → BDD-gate chain in slice 8 is this shape.
2. **Parallel fan-out**: independent children, all targeting the
   same tracker. Slice 8's `PR #3 + PR #4 + PR #6 + PR #8` were
   a fan-out — zero mutual deps, all opened after PR #1+PR #2
   merged.
3. **Sequenced despite parallel-deps**: the file targets overlap.
   `PR #5` (architecture §7-§12 EN) sequenced after `PR #4`
   (architecture §1-§6 EN) because they touch the same file;
   `PR #7` (playbook §8-§11) sequenced after `PR #6` (playbook
   §1-§7) for the same reason.

The chained-pr skill (`feature-branch-chain`) is the canonical
reference for the merge-bookkeeping steps.

{ #section-11 }

## 12. Glossary + cross-references

The full glossary lives in `openspec/changes/vertical-slicing-reference-scaffold/`
as part of slice-1's locked decisions (decisions 1-11). This section
re-states only the terms every reader of this document needs, plus
links to the deeper material.

### 12.1 Glossary (workspace-local)

| Term | Meaning |
|---|---|
| Slice | A feature module under `libs/features/<x>/` with the four-folder contract (§8.1) |
| Slice-package | One of `client/`, `server/`, `shared/`, `docs/` inside a slice; corresponds to a TypeScript subpath export |
| Boundary | An enforced rule (ESLint or `tsconfig.base.json` path alias) that prevents one location from importing from another |
| Bridge | The cucumber-step-binding factory at `libs/features/<x>/docs/support/register.ts`; the `a9b550d` callback-style wrapper pattern |
| `AuthWorld` / `TxWorld` / `<X>World` | Per-scenario mutable state object passed as the first argument to every cucumber step binding |
| World-wrapper | The class registered with `setWorldConstructor` in the bridge; exposes a typed `.inner: <X>World` and reads the world via `this` |
| Service context | Module-level singleton constructed once per bridge load; carries cross-scenario persistence (`{ users, authService }`, etc.) |
| Path alias | A `@scope/name` import alias declared in `tsconfig.base.json`; the only legal way to cross workspace boundaries |
| Pure helper | A package under `libs/shared-utils/`; no I/O, no framework deps, no env reads (§7) |
| D-TX-N | A Locked Decision number from slice-1's transactions design (D-TX-5: soft-delete; D-TX-6: decimal.js) |
| G-N | A proposal-level outcome gate (G8: bridge fix; G14-18: docs slice outcome gates) |

### 12.2 Cross-references

- **Slice-1 source of truth** (locked decisions 1-11, all 9-domain-event
  catalog, transaction design D-TX-1 through D-TX-6):
  `openspec/changes/vertical-slicing-reference-scaffold/`
- **Slice-8 change folder** (this slice's proposal / spec / design / tasks):
  `openspec/changes/slice-8-closing-bdd-and-docs/`
- **Migration playbook** (lands in `docs/migration-playbook.md`):
  slice 8 PR-B1 (sections 1-7) + PR-B2 (sections 8-11 + Spanish mirror);
  the playbook is the executable companion to §8.4's "extract
  notifications" worked example.
- **AGENTS.md** (project-local conventions — branch model,
  strict TDD, atomic commits, conventional commits, boundary
  rules, SSoT, UI-complete-not-scaffold, Spanish mirror hard
  rule): `AGENTS.md` at the repo root.
- **README.md** (entry point — stack summary, scripts,
  one-shot setup): `README.md` at the repo root.
- **G2 GitHub release tag** (the milestone this slice rounds
  out toward): `v1.1.1` on `main`. Slice-8 closes by
  incrementing to `v1.1.2`.
- **Existing Spanish mirrors** (kept in sync per AGENTS.md §13):
  `Documents-es/openspec/changes/slice-8-closing-bdd-and-docs/design.md`
  (the design's Spanish mirror, established in slice 8's
  design phase). This PR adds `Documents-es/docs/architecture.md`
  for the new sections §7-§12.
- **Slice-7 chain evidence** (squash `bb25aab` on `develop`;
  bridge-fix commit `a9b550d` on `libs/features/transactions/docs/support/register.ts`):
  the canonical pattern every new bridge ports from.

{ #section-12 }



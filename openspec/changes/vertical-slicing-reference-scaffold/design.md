# Technical Design — `vertical-slicing-reference-scaffold`

> **Status**: draft · design phase
> **Project**: `gastos-personales-reference`
> **Branch**: `develop` (working) · `main` (immutable)
> **Artifact store**: hybrid (`openspec/` files + Engram observations)
> **Mode**: interactive
> **Author**: SDD orchestrator → `sdd-design` (executor)
> **Date**: 2026-07-04
> **Inputs read**: `proposal.md` (canonical, §1–§11), `specs/auth/spec.md`, `specs/transactions/spec.md`, Engram observations `sdd-init/gastos-personales-reference` (id 2130), `sdd/.../proposal` (id 2131), `sdd/.../spec` (id 2134), conventions `ui-complete-not-scaffold` (id 2133), `doc-mirror-spanish` (id 2132), `branch-model` (id 2129).
> **Open questions inherited**: R-SPEC-1 (locale route-group shape — **locked below**), R-SPEC-2 / D-TX-7 (admin cross-user mutation — **deferred to §11**).

---

## 1. Overview

This document turns the proposal and the two domain specs (`auth`, `transactions`) into a concrete technical design for the `gastos-personales-reference` monorepo. It reaffirms the proposal's locked choices: **vertical slicing per feature module**, a **pnpm + Turbo monorepo** with two runnable apps and a small set of libraries, **Next.js 15 App Router + NestJS 10 + Prisma + Postgres**, **next-intl** for locale-prefixed routing, **shadcn-style hand-written primitives**, **Vitest + Cucumber + Playwright** for testing, **ESLint flat config with custom boundary rules** to enforce the architecture, and **Zod** as the single source of truth for validation on both sides of the wire. The slice ships as a publicable, runnable reference repo for the team to validate the vertical-slicing model before migrating `gastos-personales/`.

The design is intentionally tight: it solves the edges locked by the proposal (§2.1.4) and the requirements enumerated by the specs (16 auth + 21 transactions), nothing more. Anything beyond that surface is listed in §11 as a deferred slice for future changes.

---

## 2. Repository layout (concrete paths)

```
gastos-personales-reference/                          # repo root (bare at sdd-init; populated by this change)
├── .editorconfig                                     # hygiene
├── .env.example                                      # committed template
├── .gitignore                                        # excludes .env*, node_modules, dist, .next, .turbo
├── .nvmrc                                            # Node 22 LTS pin
├── AGENTS.md                                         # project-local conventions (mirrors openspec/config.yaml)
├── CONTRIBUTING.md                                   # publicable intent
├── LICENSE                                           # MIT (Locked Decision #6)
├── README.md                                         # quickstart
├── docker-compose.yml                                # Postgres only
├── eslint.config.mjs                                 # flat config + boundary rules
├── package.json                                      # root workspace
├── pnpm-workspace.yaml                               # apps/*, libs/*, tools/*
├── tsconfig.base.json                                # strict; path aliases
├── turbo.json                                        # build / dev / lint / test / typecheck / bdd / e2e
├── apps/
│   ├── web/                                          # Next.js 15 App Router
│   │   ├── app/
│   │   │   ├── [locale]/                             # locale-prefixed segment (next-intl)
│   │   │   │   ├── layout.tsx                        # next-intl provider + theme + locale-scoped <html lang>
│   │   │   │   ├── (auth)/                           # unauthenticated route group (see §4)
│   │   │   │   │   ├── sign-in/page.tsx
│   │   │   │   │   ├── sign-up/page.tsx
│   │   │   │   │   ├── forgot-password/page.tsx
│   │   │   │   │   ├── reset-password/[token]/page.tsx
│   │   │   │   │   └── dev/mailbox/[userId]/page.tsx  # DEV ONLY — mocked email inspector
│   │   │   │   ├── (app)/                            # authenticated route group
│   │   │   │   │   ├── layout.tsx                    # session guard
│   │   │   │   │   ├── sessions/page.tsx
│   │   │   │   │   ├── transactions/page.tsx
│   │   │   │   │   ├── transactions/new/page.tsx
│   │   │   │   │   ├── transactions/[id]/page.tsx
│   │   │   │   │   └── categories/page.tsx
│   │   │   │   └── page.tsx                          # landing
│   │   │   └── api/auth/[...nextauth]/route.ts       # NextAuth v5 handler (proxied from apps/api via env)
│   │   ├── components/ui/                            # shadcn-style primitives (hand-written)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── form.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── select.tsx
│   │   │   └── table.tsx
│   │   ├── components.json                           # minimal shadcn config (no CLI)
│   │   ├── e2e/                                      # Playwright suites
│   │   ├── lib/utils.ts                              # cn(...) helper (clsx + tailwind-merge)
│   │   ├── messages/{en,es}.json                     # next-intl catalogs
│   │   ├── middleware.ts                             # next-intl locale detection
│   │   ├── next.config.ts                            # next-intl plugin + image + env validation
│   │   ├── tailwind.config.ts                        # tokens → CSS variables
│   │   ├── app/globals.css                           # CSS variables (design tokens)
│   │   └── package.json
│   └── api/                                          # NestJS 10
│       ├── nest-cli.json
│       ├── tsconfig.json
│       └── src/
│           ├── main.ts                               # bootstrap on :3001
│           ├── app.module.ts                         # imports thin wrappers from modules/*
│           ├── modules/
│           │   ├── auth/                             # thin wrapper → @features/auth/server
│           │   │   ├── auth.module.ts
│           │   │   └── auth.controller.ts
│           │   └── transactions/                     # thin wrapper → @features/transactions/server
│           │       ├── transactions.module.ts
│           │       └── transactions.controller.ts
│           └── shared/
│               ├── pipes/zod-validation.pipe.ts     # ZodValidationPipe (§6.1)
│               ├── filters/global-exception.filter.ts
│               ├── interceptors/request-id.interceptor.ts
│               └── guards/jwt.guard.ts              # verifies the NextAuth session JWT
├── libs/
│   ├── core/
│   │   ├── config/
│   │   │   ├── env.schema.ts                         # Zod schema for process.env
│   │   │   └── env.ts                                # env = envSchema.parse(process.env)
│   │   ├── database/
│   │   │   ├── prisma/
│   │   │   │   ├── schema.prisma                     # User, Account, Session, VerificationToken,
│   │   │   │   │                                     # PasswordResetToken, Currency, FxRate, Category,
│   │   │   │   │                                     # Transaction, IdempotencyKey, AuditLog
│   │   │   │   └── migrations/
│   │   │   └── src/
│   │   │       ├── client.ts                         # PrismaClient singleton (ONLY place)
│   │   │       └── index.ts
│   │   └── events/
│   │       ├── dispatcher.ts                         # in-memory pub/sub
│   │       ├── types.ts                              # DomainEvent catalog
│   │       └── index.ts
│   ├── features/
│   │   ├── auth/
│   │   │   ├── package.json
│   │   │   ├── tsconfig.json
│   │   │   ├── client/
│   │   │   │   ├── components/
│   │   │   │   │   ├── LoginForm.tsx
│   │   │   │   │   ├── SignUpForm.tsx
│   │   │   │   │   ├── ForgotPasswordForm.tsx
│   │   │   │   │   ├── ResetPasswordForm.tsx
│   │   │   │   │   ├── SessionList.tsx
│   │   │   │   │   ├── RoleBadge.tsx
│   │   │   │   │   └── DevMailbox.tsx                # DEV ONLY — uses route under app/[locale]/(auth)/dev/mailbox
│   │   │   │   ├── hooks/
│   │   │   │   └── index.ts                          # public client API
│   │   │   ├── server/
│   │   │   │   ├── auth.config.ts                    # NextAuth v5 config (Credentials + Google)
│   │   │   │   ├── services/
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── session.service.ts
│   │   │   │   │   ├── rbac.service.ts               # role/permission table — all guards route through this
│   │   │   │   │   └── password-reset.service.ts
│   │   │   │   ├── controllers/
│   │   │   │   │   └── auth.controller.ts            # mounted via apps/api/modules/auth
│   │   │   │   └── index.ts
│   │   │   ├── shared/
│   │   │   │   ├── schemas/
│   │   │   │   │   ├── login.ts
│   │   │   │   │   ├── register.ts
│   │   │   │   │   ├── forgot-password.ts
│   │   │   │   │   ├── reset-password.ts
│   │   │   │   │   └── session-list.ts
│   │   │   │   ├── types/role.ts                    # `admin` | `user`
│   │   │   │   └── index.ts
│   │   │   └── docs/
│   │   │       ├── *.feature                         # 6 files (per §4 inventory)
│   │   │       └── step-defs/                        # shared step definitions
│   │   └── transactions/
│   │       ├── package.json
│   │       ├── tsconfig.json
│   │       ├── client/
│   │       │   ├── components/
│   │       │   │   ├── TransactionsList.tsx
│   │       │   │   ├── CreateTransactionForm.tsx
│   │       │   │   ├── EditTransactionForm.tsx
│   │       │   │   ├── CategoryManager.tsx
│   │       │   │   ├── TotalsCard.tsx
│   │       │   │   └── ThresholdAlert.tsx
│   │       │   ├── hooks/
│   │       │   └── index.ts
│   │       ├── server/
│   │       │   ├── domain/
│   │       │   │   ├── entities/
│   │       │   │   │   ├── transaction.entity.ts
│   │       │   │   │   ├── category.entity.ts
│   │       │   │   │   ├── currency.entity.ts
│   │       │   │   │   ├── fx-rate.entity.ts
│   │       │   │   │   └── idempotency-key.entity.ts
│   │       │   │   ├── services/
│   │       │   │   │   ├── transaction.service.ts
│   │       │   │   │   ├── category.service.ts
│   │       │   │   │   ├── totals.service.ts
│   │       │   │   │   └── threshold.service.ts
│   │       │   │   └── interfaces/                   # ports
│   │       │   │       ├── transaction.repository.ts
│   │       │   │       ├── category.repository.ts
│   │       │   │       ├── currency.repository.ts
│   │       │   │       ├── fx-rate.repository.ts
│   │       │   │       ├── idempotency.repository.ts
│   │       │   │       └── fx-rate.provider.ts       # FxRateProvider port
│   │       │   ├── infrastructure/
│   │       │   │   ├── repositories/                 # Prisma adapters implementing the ports
│   │       │   │   │   ├── transaction.repository.ts
│   │       │   │   │   ├── category.repository.ts    # ALWAYS filters deletedAt: null (§5 invariant)
│   │       │   │   │   ├── currency.repository.ts
│   │       │   │   │   ├── fx-rate.repository.ts
│   │       │   │   │   └── idempotency.repository.ts
│   │       │   │   └── fx/
│   │       │   │       └── in-memory-fx-rate.provider.ts  # default impl, DI token FX_RATE_PROVIDER
│   │       │   ├── controllers/
│   │       │   │   └── transactions.controller.ts    # mounted via apps/api/modules/transactions
│   │       │   └── index.ts
│   │       ├── shared/
│   │       │   ├── schemas/
│   │       │   │   ├── create.ts
│   │       │   │   ├── update.ts
│   │       │   │   ├── list.ts                       # cursor pagination + filters
│   │       │   │   ├── category-create.ts
│   │       │   │   └── category-update.ts
│   │       │   └── index.ts
│   │       └── docs/
│   │           ├── *.feature                         # 6 files (per §5 inventory)
│   │           └── step-defs/
│   └── shared-utils/
│       ├── date-formatting/
│       ├── currency/
│       └── decimal/                                  # never BigInt (per D-TX-6)
├── docs/
│   ├── architecture.md                               # English (canonical)
│   ├── migration-playbook.md                         # English
│   └── decisions/                                    # ADRs (optional)
├── Documents-es/
│   ├── docs/
│   │   ├── architecture.md                           # Spanish mirror
│   │   └── migration-playbook.md                     # Spanish mirror
│   └── openspec/changes/vertical-slicing-reference-scaffold/
│       ├── proposal.md                               # Spanish mirror (exists)
│       ├── design.md                                 # Spanish mirror (THIS run)
│       └── specs/{auth,transactions}/spec.md         # Spanish mirror (exists)
├── scripts/
│   └── migrate/                                      # one .sh per playbook stage (Locked Decision #4)
│       ├── 00-preflight.sh
│       ├── 10-extract-domain.sh
│       ├── 20-create-feature-slice.sh
│       ├── 30-wire-routes.sh
│       ├── 40-port-tests.sh
│       ├── 50-update-docs.sh
│       └── 99-finalize.sh
├── tools/
│   └── eslint-plugin-boundary/                       # custom ESLint plugin (alternative: inline in eslint.config.mjs)
└── openspec/
    ├── config.yaml
    └── changes/vertical-slicing-reference-scaffold/
        ├── proposal.md                              # canonical
        ├── design.md                                # THIS file
        ├── specs/{auth,transactions}/spec.md
        └── state.yaml
```

**Boundary rules.** `apps/api/modules/*` are **thin NestJS wrappers** that only do DI wiring and route binding; they import their controllers, services, and schemas from `libs/features/*/server` and `libs/features/*/shared`. The custom ESLint plugin (§3) prevents anyone from inlining business logic into the wrappers and from creating a third "shared business" layer.

**Single-source invariants.**

- `new PrismaClient()` is permitted **only** in `libs/core/database/src/client.ts`. ESLint rule `no-prisma-outside-core` enforces it.
- Zod schemas live **only** under `libs/features/*/shared/schemas/*.ts` and `libs/core/config/env.schema.ts`. ESLint rule `no-schemas-outside-shared` enforces it.
- The cross-module communication primitive is `libs/core/events`; direct module-to-module imports are forbidden by `no-cross-module-import`.

---

## 3. Monorepo tooling

### 3.1 Package manager and workspaces

- **pnpm 10.x** with a workspace declaration (`pnpm-workspace.yaml`):
  ```yaml
  packages:
    - "apps/*"
    - "libs/*"
    - "tools/*"
  ```
- Root `package.json` declares `packageManager: "pnpm@10.x"` and the workspace scripts:
  - `pnpm db:up` / `pnpm db:down` → `docker compose up -d postgres` / `docker compose down`.
  - `pnpm prisma migrate dev` → `pnpm --filter @core/database exec prisma migrate dev`.
  - `pnpm turbo run build|lint|test|typecheck|bdd|e2e` → pipeline orchestration.
  - `pnpm dev` → runs `apps/web` (Next.js) and `apps/api` (NestJS) concurrently.

### 3.2 Turbo pipelines

`turbo.json` declares the following tasks. Each entry lists its `dependsOn` and `outputs` so Turbo caches build artifacts correctly and `bdd`/`e2e` only run after a clean build.

| Task          | `dependsOn`                  | `outputs`                                 | Notes                                                                                |
|---------------|------------------------------|-------------------------------------------|--------------------------------------------------------------------------------------|
| `build`       | `^build`                     | `dist/**`, `.next/**`                     | Compiles TypeScript (`tsc -b`) and runs `next build` for `apps/web`.                 |
| `dev`         | `^build` (cache: false)      | —                                         | Long-running; not cached.                                                            |
| `lint`        | `^build`                     | —                                         | Runs `eslint .` per workspace using the shared flat config.                          |
| `test`        | `^build`                     | `coverage/**`                             | Vitest in `run` mode; emits a workspace-merged coverage report (gate NOT enforced). |
| `typecheck`   | `^build`                     | —                                         | `tsc --noEmit` per workspace.                                                        |
| `bdd`         | `build`                      | `bdd-reports/**`                          | `@cucumber/cucumber` against `libs/features/*/docs/*.feature`.                       |
| `e2e`         | `build`                      | `playwright-report/**`, `test-results/**`  | Playwright with `@axe-core/playwright` integrated.                                   |

### 3.3 TypeScript

- `tsconfig.base.json` at the root with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: "Bundler"`, and the path aliases that downstream packages consume:
  ```jsonc
  {
    "compilerOptions": {
      "paths": {
        "@core/database":      ["libs/core/database/src"],
        "@core/database/*":    ["libs/core/database/src/*"],
        "@core/events":        ["libs/core/events/src"],
        "@core/events/*":      ["libs/core/events/src/*"],
        "@core/config":        ["libs/core/config"],
        "@features/auth":      ["libs/features/auth/server"],
        "@features/auth/*":    ["libs/features/auth/*"],
        "@features/transactions":     ["libs/features/transactions/server"],
        "@features/transactions/*":   ["libs/features/transactions/*"],
        "@shared-utils/*":     ["libs/shared-utils/*"]
      }
    }
  }
  ```
  Each workspace extends the base via its own `tsconfig.json`.

### 3.4 ESLint flat config + custom boundary plugin

The flat config (`eslint.config.mjs`) imports the custom rules from `tools/eslint-plugin-boundary/` (or, if the plugin folder is empty at first slice, the rules live inline in `eslint.config.mjs` and are extracted later). The four non-negotiable rules and their selectors:

| Rule                       | Selector (applies to)                                                                                              | Violation pattern                                                                                                       |
|----------------------------|--------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `no-client-server-import`  | `libs/features/*/client/**/*.{ts,tsx}`                                                                            | Import path containing `/server/`.                                                                                      |
| `no-cross-module-import`   | `libs/features/**/*.ts`                                                                                           | Importing from a sibling `libs/features/<other>/...` except via `@core/events` or a shared port.                        |
| `no-prisma-outside-core`   | `**/*.{ts,tsx}`                                                                                                   | `new PrismaClient(` outside `libs/core/database/src/`.                                                                  |
| `no-schemas-outside-shared`| `**/*.{ts,tsx}`                                                                                                   | `import { z } from 'zod'` AND a Zod object literal (`z.object(`, `z.string(`, etc.) outside `*/shared/schemas/*` or `libs/core/config/env.schema.ts`. |

Optional fifth rule for the doc-mirror convention:

| Rule                       | Selector (applies to)                  | Violation pattern                                                       |
|----------------------------|----------------------------------------|-------------------------------------------------------------------------|
| `no-mojibake-in-docs`      | `Documents-es/**/*.md`                 | Any CJK Unicode codepoint (`\u4e00`–`\u9fff`) — usually auto-translation drift. |

Each rule is paired with a sanity fixture (a deliberately violating file committed under `tools/eslint-plugin-boundary/__fixtures__/`) and the fixture is wired into a one-shot script so `pnpm turbo run lint` proves the rule actually fires.

### 3.5 Other tooling

- **Vitest** — `vite.config.ts` per workspace; root-level orchestration runs every workspace's tests under `pnpm turbo run test`. Coverage collected via `c8`/`@vitest/coverage-v8`.
- **Cucumber** — `@cucumber/cucumber` invoked per feature module; one HTML + one JSON report per module, merged by `scripts/merge-bdd-reports.mjs` into a single workspace summary.
- **Playwright** — `apps/web/playwright.config.ts` with two projects (`en`, `es`) per G43/G47; `@axe-core/playwright` injected per project.
- **Prisma** — schema lives in `libs/core/database/prisma/schema.prisma`; the `PrismaClient` is re-exported as `@core/database`.

---

## 4. Domain design: auth

### 4.1 Server slice

#### `libs/features/auth/server/auth.config.ts`

NextAuth v5 configuration. Both providers wired against `@auth/prisma-adapter`:

- **`CredentialsProvider`** — `authorize()` calls `AuthService.verifyPassword(email, password)`. Returns a `{ id, email, name, role }` user object or `null`.
- **`GoogleProvider`** — uses `clientId`/`clientSecret` from env. In the reference repo, **`NEXTAUTH_URL` is switchable**: pointing it at a local stub (`http://localhost:3000/__stub/oauth`) makes NextAuth believe the OAuth handshake is going to Google. The stub handler lives at `apps/web/app/__stub/oauth/[provider]/route.ts` (development-only; gated by `NODE_ENV !== 'production'` in the route handler).
- **Adapter** — `@auth/prisma-adapter` against `libs/core/database`.
- **Strategy** — `jwt` (required for NextAuth credentials provider).
- **Callbacks**:
  - `jwt({ token, user })` — embeds `role` and `userId` into the token on first sign-in.
  - `session({ session, token })` — projects `role` and `userId` onto the session object so client components read `session.user.role` directly.
- **`pages`** — `{ signIn: '/[locale]/(auth)/sign-in' }` (locale-aware via next-intl; resolved at runtime).

#### `libs/features/auth/server/services/`

- **`AuthService`** — `verifyPassword(email, password)` (bcrypt `compare`), `register(input)`, `linkGoogleAccount(userId, profile)`, `getCurrentUser(sessionToken)`. Holds the bcrypt cost factor as a module constant (10 for the reference repo; configurable via env in production).
- **`SessionService`** — `listActiveSessions(userId)`, `revokeSession(userId, sessionId)`, `purgeExpired()`. Reads/writes via `SessionRepository` (NextAuth adapter provides the underlying model; we wrap it for typed access).
- **`RbacService`** — owns the role/permission table:
  ```
  admin → { session:read, session:revoke:any, user:read, user:read:any, transaction:read:any, category:* }
  user  → { session:read:self, session:revoke:self, transaction:read:self, transaction:write:self, category:read, category:write:self }
  ```
  Every server-side guard (controllers, NestJS guards, NextAuth `authorize` callbacks) routes through `RbacService.can(user, action, resource)`. **Client-side role checks are sugar only — they hide affordances, they do not enforce.**
- **`PasswordResetService`** — `requestReset(email)` mints a single-use token (raw token never persisted; only its hash), persists a `PasswordResetToken` row with `expiresAt = now + 1h`, and dispatches a `auth.password-reset.requested` event. `consumeReset(token, newPassword)` validates the token (not expired, not consumed), replaces the user's `passwordHash`, marks the token `consumedAt = now`, and dispatches `auth.password-reset.completed`. `PasswordResetService` also seeds the **dev-only mailbox** with the raw token (see §4.4).

#### `libs/features/auth/server/controllers/auth.controller.ts`

REST surface mounted by `apps/api/modules/auth/auth.controller.ts`. Endpoints:

| Method | Path                              | Notes                                                                                  |
|--------|-----------------------------------|----------------------------------------------------------------------------------------|
| POST   | `/auth/login`                     | Wraps NextAuth credentials authorize; returns the NextAuth session JWT.                 |
| POST   | `/auth/register`                  | Creates the `User`, hashes password, returns 201.                                      |
| POST   | `/auth/forgot-password`           | Idempotent — always returns 202 to avoid email enumeration. Triggers event.            |
| POST   | `/auth/reset-password`            | `{ token, password }`. 200 on success, 410 on expired/invalid.                         |
| GET    | `/auth/sessions`                  | Lists the caller's active sessions. Requires JWT.                                      |
| DELETE | `/auth/sessions/:id`              | Revokes one session; ownership check via `RbacService`.                                |

The controllers use `ZodValidationPipe` (§6.1) with the schemas from `libs/features/auth/shared/schemas/*.ts`.

### 4.2 Shared schemas

`libs/features/auth/shared/schemas/` — the single source of truth. Each file exports a Zod schema and an inferred TS type:

- `login.ts` — `{ email: z.string().email(), password: z.string().min(8) }`.
- `register.ts` — `{ email, password (min 8), name }`.
- `forgot-password.ts` — `{ email }`.
- `reset-password.ts` — `{ token: z.string().min(32), password: z.string().min(8) }`.
- `session-list.ts` — response shape (list of `{ id, deviceLabel, lastActiveAt }`).

Client and server import the same module. No duplicated validators.

### 4.3 Client components

`libs/features/auth/client/components/`:

- **`LoginForm.tsx`** — `react-hook-form` + `@hookform/resolvers/zod` resolving `loginSchema`. Renders `Button`, `Input`, `Form`, `Card` primitives. Implements all five states (loading / error / success / empty / validation-error).
- **`SignUpForm.tsx`** — same shape as login; resolves `registerSchema`.
- **`ForgotPasswordForm.tsx`** — resolves `forgotPasswordSchema`; on submit, shows the success state with the "if this email is registered..." copy.
- **`ResetPasswordForm.tsx`** — reads `[token]` from the route; resolves `resetPasswordSchema`.
- **`SessionList.tsx`** — fetches `GET /auth/sessions`; renders a table with a revoke action per row.
- **`RoleBadge.tsx`** — visual only; reads `session.user.role`. Hides admin-only affordances from non-admins but does not enforce.
- **`DevMailbox.tsx`** — dev-only component rendered by `app/[locale]/(auth)/dev/mailbox/[userId]/page.tsx`. Lists the latest `auth.password-reset.requested` event for that user, exposing the **token only** (never the password).

### 4.4 Route shape — **LOCKED per R-SPEC-1**

Locale-prefixed routes via `next-intl`. The `(auth)` route group is the unauthenticated surface; the `(app)` route group is the authenticated surface (guarded by a server-side session check in `app/[locale]/(app)/layout.tsx`).

```
/[locale]/(auth)/sign-in
/[locale]/(auth)/sign-up
/[locale]/(auth)/forgot-password
/[locale]/(auth)/reset-password/[token]
/[locale]/(auth)/dev/mailbox/[userId]              # DEV ONLY — gated by NODE_ENV !== 'production'

/[locale]/(app)/sessions
```

- `app/[locale]/layout.tsx` wraps every page in `NextIntlClientProvider` and resolves the active locale.
- `app/[locale]/(app)/layout.tsx` enforces the session: redirects to `/{locale}/sign-in` if `auth()` returns `null`.
- `middleware.ts` handles locale detection (URL prefix preferred; falls back to `Accept-Language`).

### 4.5 Dev mailbox inspection — DELIBERATELY INCOMPLETE

`libs/core/events/dispatcher.ts` keeps an in-memory ring buffer (last N events per user) in development. The route `/[locale]/(auth)/dev/mailbox/[userId]` renders the latest `auth.password-reset.requested` event for the user, surfacing only the token (never the user's password or email contents). The page is gated by `process.env.NODE_ENV !== 'production'` and a runtime assertion so it never ships to production. **This is a reference-repo affordance, not a real SMTP integration** (see §11).

### 4.6 BDD step definitions

`libs/features/auth/docs/step-defs/` — six `.feature` files share a single set of step definitions (per Locked Decision #3):

- `login-email-password.feature`, `oauth-google-stub.feature`, `password-reset.feature`, `sessions-list.feature`, `rbac-admin.feature`, `login-locale-routing.feature`.
- Step defs cover: `Given a registered user …`, `When the user submits the sign-in form …`, `Then a session is created …`, etc. Exact phrasing lives at the `sdd-tasks` step.

### 4.7 Events emitted

| Event                              | Payload (Zod-validated)                                              | Emitted by                                |
|------------------------------------|------------------------------------------------------------------------|-------------------------------------------|
| `auth.password-reset.requested`    | `{ userId: string, token: string (raw, dev only), requestedAt: Date }` | `PasswordResetService.requestReset`       |
| `auth.password-reset.completed`    | `{ userId: string, resetAt: Date }`                                   | `PasswordResetService.consumeReset`       |
| `auth.session.revoked`             | `{ userId: string, sessionId: string, revokedAt: Date }`               | `SessionService.revokeSession`            |
| `auth.rbac.denied`                 | `{ userId: string, action: string, resourceType: string, at: Date }`  | `RbacService.can` (audit; observable)      |

All four are declared in `libs/core/events/types.ts` and consumed by an in-memory subscriber that logs to the dev mailbox (§4.5) and writes a structured `pino` log line in production.

---

## 5. Domain design: transactions

### 5.1 Domain layer (`libs/features/transactions/server/domain/`)

#### Entities

- **`Transaction`** — `{ id, amount (Decimal), currencyCode, kind ('income'|'expense'), reportingAmount?, reportingCurrencyCode?, fxRateId?, categoryId, notes?, occurredAt, createdBy, updatedBy, createdAt, updatedAt, deletedAt? }`. Sign is derived from `kind` (expense → negative for totals; income → positive).
- **`Category`** — `{ id, name, slug, kind, deletedAt?, createdAt, updatedAt }`. **Non-negotiable invariant: every query in `CategoryRepository` filters `where: { deletedAt: null }`** (D-TX-5).
- **`Currency`** — `{ code, name, symbol, decimals, createdAt }`.
- **`FxRate`** — `{ id, fromCode, toCode, rate (Decimal), recordedAt }`.
- **`IdempotencyKey`** — `{ id, key, userId, requestFingerprint, responsePayload, responseStatus, transactionId?, expiresAt, createdAt }`.

#### Services

- **`TransactionService.create(input, ctx)`** — orchestrates: load `Category` (must be active), load FX rate if currency ≠ reporting, compute `reportingAmount`, persist `Transaction`, persist `IdempotencyKey` (when the request carries an `Idempotency-Key` header), write `AuditLog`.
- **`TransactionService.update(id, input, ctx)`** — partial update; recompute FX if currency changed; refresh `updatedBy`/`updatedAt`.
- **`TransactionService.softDelete(id, ctx)`** — sets `deletedAt = now`, refreshes `updatedBy`. (Per D-TX, transactions are soft-deletable; categories also soft-delete via the same pattern but the controller routes for transactions and categories are separate.)
- **`CategoryService.{list, create, update, softDelete}`** — every read returns only active categories.
- **`TotalsService.forUser(userId, range)`** — sign-aware income / expense / net totals in reporting currency.
- **`TotalsService.perCategory(userId, range)`** — grouped by active category.
- **`ThresholdService.evaluate(transaction, threshold)`** — emits `transactions.threshold.exceeded` when the absolute amount exceeds the configured threshold.

#### Ports (`domain/interfaces/`)

```ts
export interface TransactionRepository {
  findById(id: string): Promise<Transaction | null>;
  list(filter: ListFilter): Promise<{ rows: Transaction[]; total: number; cursor: string | null }>;
  create(input: TransactionCreate): Promise<Transaction>;
  update(id: string, input: TransactionUpdate): Promise<Transaction>;
  softDelete(id: string, actorId: string): Promise<void>;
}

export interface CategoryRepository {
  findById(id: string): Promise<Category | null>;          // MUST filter deletedAt: null
  list(filter: CategoryFilter): Promise<Category[]>;       // MUST filter deletedAt: null
  create(input: CategoryCreate): Promise<Category>;
  update(id: string, input: CategoryUpdate): Promise<Category>;
  softDelete(id: string, actorId: string): Promise<void>;
}

export interface CurrencyRepository { findByCode(code: string): Promise<Currency | null>; list(): Promise<Currency[]>; }

export interface FxRateRepository {
  findMostRecent(fromCode: string, toCode: string): Promise<FxRate | null>;
  insert(rate: FxRateInsert): Promise<FxRate>;
}

export interface IdempotencyRepository {
  find(userId: string, key: string): Promise<IdempotencyKey | null>;
  upsert(input: IdempotencyKeyInsert): Promise<void>;
  purgeExpired(now: Date): Promise<number>;
}

export interface FxRateProvider {                        // port — D-TX-2
  getRate(fromCode: string, toCode: string): Promise<{ rate: Decimal; recordedAt: Date } | null>;
}
```

### 5.2 Infrastructure layer (`libs/features/transactions/server/infrastructure/`)

- **`repositories/*.repository.ts`** — Prisma adapters. Each implements the corresponding port and respects the soft-delete invariant (`CategoryRepository` always adds `where: { deletedAt: null }`).
- **`fx/in-memory-fx-rate.provider.ts`** — default `FxRateProvider`. Seeded at startup with `USD→ARS`, `EUR→ARS`, `ARS→USD`, `ARS→EUR` starting values; rates carry `recordedAt`. Staleness warning fires when `now - recordedAt > 24h` (per D-TX-4). Wired via the NestJS DI token `FX_RATE_PROVIDER`.

### 5.3 Controllers

`libs/features/transactions/server/controllers/transactions.controller.ts` — REST endpoints mounted by `apps/api/modules/transactions/`:

| Method | Path                          | Notes                                                                                  |
|--------|-------------------------------|----------------------------------------------------------------------------------------|
| POST   | `/transactions`               | Requires `Idempotency-Key` header; 200/201 on first call, 200 on replay.               |
| GET    | `/transactions`               | Cursor pagination; filters: `categoryId`, `fromDate`, `toDate`, `currencyCode`.        |
| PATCH  | `/transactions/:id`           | Partial update; ownership check via `RbacService`.                                     |
| DELETE | `/transactions/:id`           | Soft-delete; 204 on success.                                                            |
| GET    | `/categories`                 | Active categories only.                                                                 |
| POST   | `/categories`                 | Create; uniqueness on `slug`.                                                           |
| PATCH  | `/categories/:id`             | Update name / kind.                                                                     |
| DELETE | `/categories/:id`             | Soft-delete (`deletedAt = now`).                                                        |

All endpoints apply `ZodValidationPipe` with the schemas in §5.5.

### 5.4 Idempotency-key handling (D-TX-1)

- Client sends `Idempotency-Key: <uuid>` on `POST /transactions`.
- Server: lookup `IdempotencyKey` by `(userId, key)` (UNIQUE composite index).
  - **Hit + `expiresAt > now`**: compare the stored `requestFingerprint` (SHA-256 of the canonical request payload) with the current request:
    - **Match** → return the cached `responsePayload` with the cached `responseStatus`.
    - **Mismatch** → reject with `409 Conflict` (`IDEMPOTENCY_KEY_REUSED`) — fingerprint reuse with a different body is an error, not a retry.
  - **Miss**: validate, run the FX lookup, persist the transaction, then **insert the `IdempotencyKey`** row with `expiresAt = now + 1h` (TTL default) and the cached response.
- Cleanup: `IdempotencyRepository.purgeExpired(now)` runs on a cron-like interval inside the NestJS process (configurable via env; default every 15 minutes). The first-slice does not ship an external scheduler.

### 5.5 Shared schemas

`libs/features/transactions/shared/schemas/`:

- `create.ts` — `{ amount: z.coerce.number().positive().multipleOf(0.01), currencyCode: z.string().length(3), kind: z.enum(['income','expense']), categoryId: z.string().cuid(), notes: z.string().max(500).optional(), occurredAt: z.coerce.date() }`.
- `update.ts` — partial of `create` (all fields optional except `id`).
- `list.ts` — `{ cursor?: string, pageSize?: z.coerce.number().int().min(1).max(100).default(20), categoryId?: string, fromDate?: z.coerce.date(), toDate?: z.coerce.date(), currencyCode?: z.string().length(3) }`.
- `category-create.ts` — `{ name, kind, slug }`.
- `category-update.ts` — `{ id, name?, kind? }`.

### 5.6 Client components

- **`TransactionsList.tsx`** — table of `Transaction` rows; filters (date range, category, currency); pagination via cursor; empty / error / loading states.
- **`CreateTransactionForm.tsx`** — `react-hook-form` + `createSchema`; auto-generates an `Idempotency-Key` UUID per submit (kept in component state so a re-submit of the same form uses the same key, but a fresh form entry generates a new one).
- **`EditTransactionForm.tsx`** — same shape as create, prefilled.
- **`CategoryManager.tsx`** — list + create + rename + soft-delete for categories; warns on soft-delete ("transactions referencing this category will keep their data, but the category will be hidden from selectors").
- **`TotalsCard.tsx`** — sign-aware (income / expense / net) and per-category rollups; renders in the active locale.
- **`ThresholdAlert.tsx`** — renders when a freshly created transaction crossed its threshold; subscribes to the `transactions.threshold.exceeded` event via Server-Sent Events or a simple toast (decided at `sdd-tasks`).

### 5.7 Route shape

```
/[locale]/(app)/transactions              # list
/[locale]/(app)/transactions/new          # create
/[locale]/(app)/transactions/[id]         # detail / edit / delete
/[locale]/(app)/categories                # category manager
```

All under `(app)`, so the auth guard applies. The active locale drives labels, validation messages, and threshold warning text.

### 5.8 BDD step definitions

`libs/features/transactions/docs/step-defs/` — six `.feature` files share a single step-defs tree:

- `create-transaction.feature`, `list-transactions.feature`, `multi-currency-conversion.feature`, `idempotency-key.feature`, `soft-delete-categories.feature`, `sign-aware-totals.feature`.

### 5.9 Events emitted

| Event                                  | Payload                                                                                                              | Emitted by                                |
|----------------------------------------|----------------------------------------------------------------------------------------------------------------------|-------------------------------------------|
| `transactions.created`                  | `{ transactionId, userId, amount (Decimal as string), currency, occurredAt }`                                        | `TransactionService.create`               |
| `transactions.updated`                  | `{ transactionId, userId, changedFields: string[], at: Date }`                                                       | `TransactionService.update`               |
| `transactions.soft-deleted`             | `{ transactionId, userId, at: Date }`                                                                               | `TransactionService.softDelete`           |
| `transactions.fx.stale`                 | `{ from, to, recordedAt, observedAt, ageHours }`                                                                     | `TransactionService.create` when age > 24h|
| `transactions.threshold.exceeded`      | `{ userId, categoryId, threshold, total, observedAt }`                                                              | `ThresholdService.evaluate`               |

All five are declared in `libs/core/events/types.ts`. The `transactions.fx.stale` event is **informational** — D-TX-4 mandates that staleness does NOT block the write; downstream subscribers (audit, notification, toast) decide policy.

---

## 6. Cross-cutting concerns

### 6.1 Shared Zod schemas (no-duplication rule)

- **One canonical schema per logical input.** Every schema lives under `libs/features/*/shared/schemas/*.ts` or `libs/core/config/env.schema.ts`. ESLint rule `no-schemas-outside-shared` enforces the location.
- **Client** imports the schema directly and feeds it to `@hookform/resolvers/zod` for form validation.
- **Server (NestJS)** imports the same schema and runs it through `ZodValidationPipe`. **No `class-validator`** — the reference repo uses Zod exclusively per Locked Decisions #2/#7/#9 and the proposal's §2.1.4 cross-cutting list.
- **`ZodValidationPipe` body (pseudocode):**
  ```ts
  @Injectable()
  export class ZodValidationPipe implements PipeTransform {
    constructor(private readonly schema: ZodTypeAny) {}
    transform(value: unknown) {
      const result = this.schema.safeParse(value);
      if (!result.success) {
        throw new BadRequestException({
          error: "VALIDATION_FAILED",
          issues: result.error.issues,
        });
      }
      return result.data;
    }
  }
  ```
  Each controller binds the schema to the pipe via a small decorator helper:
  ```ts
  export const Body = (schema: ZodTypeAny) =>
    (target: any, key: string, index: number) =>
      UsePipes(new ZodValidationPipe(schema))(target, key, index);
  ```

### 6.2 Event dispatcher (`libs/core/events`)

Minimal interface — no external broker, in-memory pub/sub for the reference repo.

```ts
export interface EventDispatcher {
  dispatch(event: DomainEvent): Promise<void>;
  subscribe(name: string, handler: (event: DomainEvent) => Promise<void>): () => void;
}
```

- **Events declared** in `libs/core/events/types.ts`. Each event has `name` (kebab-case), `payload` (Zod schema), `emittedBy` (module id), `consumedBy` (list of consumer ids).
- **In-memory implementation** keeps a ring buffer per user (capped at 100 entries) for the dev mailbox inspector (§4.5).
- A future change may swap this for a real broker (Redis, NATS); the interface is the seam.

### 6.3 i18n routing (`next-intl`)

- `apps/web/messages/en.json` and `apps/web/messages/es.json` — UI string catalogs. Keyed by feature module + screen, e.g. `auth.login.title`, `transactions.list.empty`.
- `apps/web/middleware.ts` — `createMiddleware` from `next-intl/middleware` with `locales: ['en','es']`, `defaultLocale: 'en'`, `localePrefix: 'always'` (the route is ALWAYS prefixed; `/sign-in` redirects to `/en/sign-in`).
- `next.config.ts` — wraps the Next config with `createNextIntlPlugin('./i18n.ts')`.
- `apps/web/i18n.ts` — loads the catalog for the active locale and exposes `getRequestConfig`.
- **Locale-aware server actions** — any action that touches user-visible copy must read from the active locale's catalog; actions never hard-code English copy.
- The locale switcher lives in `apps/web/components/ui/locale-switcher.tsx`; on switch it pushes the user to the same surface in the new locale, preserving any path-stable query params.

### 6.4 Design tokens (extracted from `gastos-personales`)

- **Read** during apply:
  - `gastos-personales/tailwind.config.*` — extract `theme.extend.colors`, `theme.extend.fontFamily`, `theme.extend.spacing` (whichever exists).
  - `gastos-personales/app/globals.css` — extract CSS variables under `:root` (`--background`, `--foreground`, `--primary`, etc.).
- **Write** in this repo:
  - `apps/web/app/globals.css` — CSS variables under `:root` and `[data-theme="dark"]`, mirroring the source palette. A short comment at the top documents the source path.
  - `apps/web/tailwind.config.ts` — `theme.extend.colors` references the CSS variables (`'background': 'hsl(var(--background))'` etc.). The file references the source repo via a comment.
- This is a token-level extract only (colors / spacing / typography). It does NOT import or wire component code from `gastos-personales/`.

### 6.5 shadcn/ui setup

- **Not installed via CLI.** Primitives are hand-written `.tsx` files under `apps/web/components/ui/` to keep them editable. `apps/web/components.json` is a minimal shadcn-style manifest:
  ```json
  {
    "$schema": "https://ui.shadcn.com/schema.json",
    "style": "default",
    "rsc": true,
    "tsx": true,
    "tailwind": { "config": "tailwind.config.ts", "css": "app/globals.css", "baseColor": "slate" },
    "aliases": { "components": "@/components", "utils": "@/lib/utils" }
  }
  ```
- **Peer deps** installed at `apps/web`: `@radix-ui/react-*` (slot, label, dialog, dropdown-menu, select, toast), `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`.
- **Helpers** — `apps/web/lib/utils.ts` exports `cn(...inputs) = twMerge(clsx(inputs))`.

### 6.6 ESLint boundary rules (custom plugin)

The plugin lives at `tools/eslint-plugin-boundary/` (fallback: inline in `eslint.config.mjs` if the folder is empty at first slice). Each rule is documented with its selector and the violation pattern (§3.4). The plugin also exposes a `recommended` config that `eslint.config.mjs` extends.

**Fixture-driven sanity check.** Each rule has a matching fixture under `tools/eslint-plugin-boundary/__fixtures__/<rule>/`:
- `valid.ts` — does not trigger.
- `invalid.ts` — triggers; committed so the test suite asserts the rule actually fires.

The CI pipeline runs `pnpm turbo run lint` after `build`; if a rule regresses silently, the fixtures catch it.

### 6.7 Validation, error handling, logging

- **Validation** — `ZodValidationPipe` (§6.1).
- **Error codes** — cross-module vocabulary in `libs/shared-utils/errors/codes.ts`:
  ```
  AUTH_INVALID_CREDENTIALS, AUTH_TOKEN_EXPIRED, AUTH_RESET_TOKEN_INVALID, AUTH_FORBIDDEN,
  TX_VALIDATION_FAILED, TX_CATEGORY_NOT_FOUND, TX_CATEGORY_DELETED, TX_CURRENCY_NOT_FOUND,
  TX_FX_RATE_STALE, TX_FX_PAIR_UNKNOWN, TX_NOT_FOUND, TX_FORBIDDEN,
  IDEMPOTENCY_KEY_REUSED, IDEMPOTENCY_KEY_CONFLICT,
  VALIDATION_FAILED, NOT_FOUND, INTERNAL_ERROR.
  ```
- **Filters** — `apps/api/src/shared/filters/global-exception.filter.ts` translates thrown errors to a stable JSON shape `{ code, message, issues?, requestId }`.
- **Logging** — `pino` (lightweight; aligns with the env-config skill). Structured JSON logs; `requestId` propagated by `request-id.interceptor.ts` (reads from `x-request-id` header or mints one). **PII exclusion** — passwords, raw tokens, and email contents are NEVER logged. The `pino` redact paths cover `password`, `*.password`, `token`, `*.token`, `headers.authorization`, `headers.cookie`.
- **Request IDs** — every response carries `x-request-id`; client-side errors surface the ID for support.

---

## 7. Data flow examples

### 7.1 auth — sign-in

1. User visits `/{locale}/sign-in` (locale defaults to `en` if no `Accept-Language` match; `middleware.ts` redirects from `/sign-in`).
2. `LoginForm.tsx` mounts with `useForm({ resolver: zodResolver(loginSchema) })` from `@features/auth/shared/schemas/login`.
3. Submit → `signIn('credentials', { email, password, redirect: false })` from `next-auth/react`.
4. NextAuth v5 handler at `apps/web/app/api/auth/[...nextauth]/route.ts` calls `auth.config.ts#authorize`, which delegates to `AuthService.verifyPassword(email, password)`. On success, NextAuth mints the JWT session via the `jwt` callback.
5. Client redirects to `/{locale}/(app)/transactions` (authenticated landing for this slice; future changes may add a `/dashboard` route).

The proxy mechanism is **NextAuth's own handler** hosted in `apps/web`. The standalone `apps/api` NestJS service exposes the same `POST /auth/login` endpoint for non-NextAuth clients (curl, integration tests) using the same `AuthService` underneath — both routes share the service via `@features/auth/server`. Single source of business logic; two transport surfaces.

### 7.2 transactions — create with FX + idempotency

1. User opens `/{locale}/(app)/transactions/new`.
2. `CreateTransactionForm.tsx` mounts with `useForm({ resolver: zodResolver(createSchema) })`.
3. User submits `{ amount, currencyCode, kind, categoryId, occurredAt, notes? }`.
4. Client mints an idempotency key (`crypto.randomUUID()`), captured in component state so the same form re-submit (e.g. user hits Enter twice) reuses the key.
5. `POST /transactions` with `Idempotency-Key: <uuid>` and the body.
6. Server pipeline:
   a. `JwtGuard` validates the session token → user context.
   b. `RbacService.can(user, 'transaction:write:self', null)` → allow.
   c. `ZodValidationPipe(createSchema)` parses the body.
   d. `IdempotencyService.lookup(userId, key)`:
      - **Hit + fingerprint match + not expired** → return cached response.
      - **Hit + fingerprint mismatch** → `409 IDEMPOTENCY_KEY_REUSED`.
      - **Miss** → proceed.
   e. `CategoryRepository.findById(categoryId)` — soft-delete filter applies; reject with `TX_CATEGORY_DELETED` if absent.
   f. `CurrencyRepository.findByCode(currencyCode)` — reject with `TX_CURRENCY_NOT_FOUND` if absent.
   g. If `currencyCode !== user.reportingCurrencyCode`:
      - `FxRateProvider.getRate(currencyCode, user.reportingCurrencyCode)`.
      - **null** → reject with `TX_FX_PAIR_UNKNOWN`.
      - **Stale** (`now - recordedAt > 24h`) → dispatch `transactions.fx.stale`; do NOT block.
   h. `TransactionRepository.create({ ...input, reportingAmount, reportingCurrencyCode, fxRateId, createdBy, updatedBy })`.
   i. `AuditLog.create({ entityType: 'Transaction', entityId, action: 'create', actorId: userId })`.
   j. `IdempotencyService.upsert({ key, userId, requestFingerprint, responsePayload, responseStatus: 201, transactionId, expiresAt: now + 1h })`.
   k. `events.dispatch({ name: 'transactions.created', payload: ... })`.
   l. `ThresholdService.evaluate(transaction, threshold)` → if crossed, `events.dispatch({ name: 'transactions.threshold.exceeded', payload: ... })`.
7. Server returns `201` with the transaction payload.
8. Client navigates to `/{locale}/(app)/transactions`; the new row appears in the list. If the response carried a stale-rate warning, a toast surfaces it for ~5 seconds.

---

## 8. Test strategy

### 8.1 Unit + integration (Vitest)

- Colocated in `libs/features/*/server/.../__tests__/` and `libs/core/*/src/__tests__/`.
- **Service-level** coverage on every service (auth + transactions). One file per service.
- **Repository-level** coverage against an isolated test database (Vitest global setup spins up Postgres via docker-compose or an ephemeral Postgres for the suite; service-level tests prefer in-memory ports where possible).
- **Shared TDD discipline** — strict TDD mode is enabled per `openspec/config.yaml`. Every public method gets a failing test before the implementation lands.

### 8.2 BDD (`@cucumber/cucumber`)

- Reads `libs/features/*/docs/*.feature` (12 files total — see §4.6, §5.8).
- Step definitions are shared per-feature under `libs/features/*/docs/step-defs/`. No duplicate step bodies across `.feature` files.
- `pnpm turbo run bdd` orchestrates the run and merges per-module HTML + JSON reports.

### 8.3 Component tests (Vitest + Testing Library)

- `libs/features/*/client/components/__tests__/`.
- One happy-path test per critical screen (sign-in, sign-up, forgot/reset password, sessions list, transactions list, create-transaction form, category manager, totals card).
- Asserts: empty state visible; form renders all five states (loading, error, success, empty, validation-error) on the canonical inputs.

### 8.4 E2E (Playwright)

- `apps/web/e2e/`.
- Two projects (`en`, `es`) per `playwright.config.ts`; `axe-core` is integrated via `@axe-core/playwright`.
- Critical-flow tests:
  - `auth-login.spec.ts` — clean session → fill sign-in form → assert landing reached in the right locale.
  - `transactions-crud.spec.ts` — sign-in → transactions list → create-transaction form → assert new row appears.
- `pnpm turbo run e2e` runs both projects.

### 8.5 Accessibility audit

- `@axe-core/playwright` runs after each critical-screen render and fails the e2e on any AA violation (G43).
- `@axe-core/cli` runs against standalone routes during `pnpm turbo run bdd` for screens not covered by e2e.

### 8.6 Coverage

- 60% across lines / branches / functions / statements — declared in `openspec/config.yaml`, **NOT enforced as a CI gate** for this slice (proposal §5 minor risk). Coverage is collected and surfaced in the test report; the gate may be flipped on in a future change.

---

## 9. Rollout

Per proposal §6:

- **Whole-change rollback** — `rm -rf /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference`. Greenfield; no production data. Sibling `gastos-personales/` is untouched.
- **Per-feature rollback** — `git rm -rf libs/features/<feature>` + drop imports in `apps/web` and `apps/api`. The boundary rules make a half-removed feature a compile error (desirable failure).
- **Per-task rollback** — `git revert <sha>`. Atomic commits per task (per `sdd-tasks`) make this safe.
- **No migration needed** — greenfield.

---

## 10. Open questions for `sdd-tasks`

These are spec-resolved but implementation-shape decisions the tasks phase will pin:

1. **Exact tsconfig path aliases** — default `@core/*`, `@features/*`, `@shared-utils/*` documented in §3.3. Tasks should declare whether `@features/<slice>` resolves to `client`, `server`, or `shared` based on the import boundary rule, and whether a `client.ts` / `server.ts` barrel in each feature clarifies the intent.
2. **Exact Cucumber step phrasing per feature** — spec-level Given/When/Then is fixed; tasks decide the imperative phrasing (`Given a registered user exists with role "user"` vs `Given the following user exists: …`).
3. **Playwright config shape** — single project with parameterized locale vs two distinct projects (`en`, `es`). Recommendation: two projects (`en`, `es`) per `playwright.config.ts` so `@axe-core` runs per locale and the report is split. Tasks should commit the chosen shape.
4. **Bcrypt cost factor** — fixed at 10 in the reference repo per §4.1; tasks may surface an env knob if needed.
5. **Idempotency-key TTL** — 1h default per §5.4; tasks decide whether the cron interval (default 15min) lives in `apps/api` startup or a separate script.

---

## 11. Deferred to future changes

These are **explicitly OUT-OF-SCOPE** for this slice. They are reaffirmed here so future work has a single source of truth.

1. **Real SMTP integration** for password-reset emails. The reference repo ships the dev mailbox inspection (§4.5) as a deliberately incomplete affordance. A real provider (SES, Postmark, Resend) ships in a later change with a config-driven adapter.
2. **Real OAuth handshake against Google.** Only the stubbed happy path is in Gherkin (Locked Decision #5). A real OAuth integration is manual/integration only.
3. **Admin cross-user mutation capability** — D-TX-7's "admin may mutate other users' transactions" is **deferred to a future change** per R-SPEC-2. In this slice, **admins CANNOT mutate other users' transactions** — both `admin` and `user` may only mutate their own. The `RbacService` permission table (§4.1) reflects this by exposing only `transaction:write:self` for both roles; an admin cross-user capability is a follow-up.
4. **i18n beyond English + Spanish.** Locales are fixed to `en` and `es`.
5. **CI/CD beyond basic lint + test + typecheck + BDD + e2e.** No deploy pipelines, no staging, no release automation.
6. **Production hardening** — no secrets manager, no HSTS, no CSP beyond Next.js defaults, no CDN config.
7. **Observability** — no OpenTelemetry, no Prometheus, no log shipping. Structured `pino` logs only.
8. **Multiple OAuth providers** beyond Google.
9. **Sentry / error reporting SaaS.**
10. **API edge rate-limiting.**
11. **Coverage gate enforcement** at CI.
12. **Migration of `gastos-personales/`** to the vertical-slicing model. The playbook ships here; the migration runs in a separate change with its own SDD lifecycle.
13. **Audit log UI** — the data model persists `AuditLog` rows; surfacing them in the UI is a later slice.

---

## 12. Cross-references

| Reference                                                | Where                                                                                                              |
|----------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| Proposal (canonical)                                     | `openspec/changes/vertical-slicing-reference-scaffold/proposal.md`                                                |
| Proposal (Spanish mirror)                                | `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/proposal.md`                                    |
| Auth spec                                                | `openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md`                                          |
| Transactions spec                                        | `openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md`                                  |
| Engram: project context                                  | `sdd-init/gastos-personales-reference` (id 2130)                                                                   |
| Engram: proposal summary                                 | `sdd/vertical-slicing-reference-scaffold/proposal` (id 2131)                                                       |
| Engram: spec summary                                     | `sdd/vertical-slicing-reference-scaffold/spec` (id 2134)                                                           |
| Engram: UI complete-not-scaffold convention              | `gastos-personales-reference/conventions/ui-complete-not-scaffold` (id 2133)                                       |
| Engram: doc-mirror-spanish convention (HARD RULE)        | `gastos-personales-reference/conventions/doc-mirror-spanish` (id 2132)                                             |
| Engram: branch-model convention                          | `gastos-personales-reference/conventions/branch-model` (id 2129)                                                   |
| Skills loaded                                            | `architecture-standards`, `architecture-patterns`, `next-best-practices`, `database-strategy`, `auth-implementation-patterns`, `env-config`, `api-design-principles` |
| Downstream phases                                        | `sdd-tasks` → `sdd-apply` → `sdd-verify` → `sdd-archive`                                                            |
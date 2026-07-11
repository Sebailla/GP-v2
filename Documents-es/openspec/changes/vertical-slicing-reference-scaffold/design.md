# Diseño Técnico — `vertical-slicing-reference-scaffold`

> **Estado**: borrador · fase de diseño
> **Proyecto**: `gastos-personales-reference`
> **Branch**: `develop` (trabajo) · `main` (inmutable)
> **Artifact store**: hybrid (archivos `openspec/` + observaciones Engram)
> **Modo**: interactive
> **Autor**: SDD orchestrator → `sdd-design` (executor)
> **Fecha**: 2026-07-04
> **Inputs leídos**: `proposal.md` (canónico, §1–§11), `specs/auth/spec.md`, `specs/transactions/spec.md`, observaciones Engram `sdd-init/gastos-personales-reference` (id 2130), `sdd/.../proposal` (id 2131), `sdd/.../spec` (id 2134), convenciones `ui-complete-not-scaffold` (id 2133), `doc-mirror-spanish` (id 2132), `branch-model` (id 2129).
> **Preguntas abiertas heredadas**: R-SPEC-1 (forma del route group con locale — **bloqueada abajo**), R-SPEC-2 / D-TX-7 (mutación cross-user de admin — **diferida a §11**).

---

## 1. Overview

Este documento convierte la propuesta y los dos specs de dominio (`auth`, `transactions`) en un diseño técnico concreto para el monorepo de `gastos-personales-reference`. Reafirma las decisiones locked de la propuesta: **vertical slicing por módulo de feature**, un **monorepo con pnpm + Turbo** con dos apps ejecutables y un conjunto pequeño de librerías, **Next.js 15 App Router + NestJS 10 + Prisma + Postgres**, **next-intl** para routing con prefijo de locale, **primitivas shadcn-style escritas a mano**, **Vitest + Cucumber + Playwright** para testing, **ESLint flat config con reglas custom de boundary** para enforce la arquitectura, y **Zod** como single source of truth para validación en ambos lados del wire. El slice se entrega como un repositorio de referencia publicable y ejecutable para que el equipo valide el modelo de vertical slicing antes de migrar `gastos-personales/`.

El diseño es deliberadamente ajustado: resuelve los edges locked por la propuesta (§2.1.4) y los requirements enumerados por los specs (16 auth + 21 transactions), nada más. Cualquier cosa más allá de esa superficie se lista en §11 como slice diferido para cambios futuros.

---

## 2. Repository layout (paths concretos)

```
gastos-personales-reference/                          # repo root (vacío en sdd-init; poblado por este cambio)
├── .editorconfig                                     # hygiene
├── .env.example                                      # template commiteado
├── .gitignore                                        # excluye .env*, node_modules, dist, .next, .turbo
├── .nvmrc                                            # pin de Node 22 LTS
├── AGENTS.md                                         # convenciones locales del proyecto (mirror de openspec/config.yaml)
├── CONTRIBUTING.md                                   # intención publicable
├── LICENSE                                           # MIT (Locked Decision #6)
├── README.md                                         # quickstart
├── docker-compose.yml                                # sólo Postgres
├── eslint.config.mjs                                 # flat config + boundary rules
├── package.json                                      # root workspace
├── pnpm-workspace.yaml                               # apps/*, libs/*, tools/*
├── tsconfig.base.json                                # strict; path aliases
├── turbo.json                                        # build / dev / lint / test / typecheck / bdd / e2e
├── apps/
│   ├── web/                                          # Next.js 15 App Router
│   │   ├── app/
│   │   │   ├── [locale]/                             # segmento con prefijo de locale (next-intl)
│   │   │   │   ├── layout.tsx                        # next-intl provider + theme + <html lang> scoped por locale
│   │   │   │   ├── (auth)/                           # route group no autenticado (ver §4)
│   │   │   │   │   ├── sign-in/page.tsx
│   │   │   │   │   ├── sign-up/page.tsx
│   │   │   │   │   ├── forgot-password/page.tsx
│   │   │   │   │   ├── reset-password/[token]/page.tsx
│   │   │   │   │   └── dev/mailbox/[userId]/page.tsx  # SOLO DEV — inspector de email mockeado
│   │   │   │   ├── (app)/                            # route group autenticado
│   │   │   │   │   ├── layout.tsx                    # session guard
│   │   │   │   │   ├── sessions/page.tsx
│   │   │   │   │   ├── transactions/page.tsx
│   │   │   │   │   ├── transactions/new/page.tsx
│   │   │   │   │   ├── transactions/[id]/page.tsx
│   │   │   │   │   └── categories/page.tsx
│   │   │   │   └── page.tsx                          # landing
│   │   │   └── api/auth/[...nextauth]/route.ts       # handler de NextAuth v5 (proxy desde apps/api vía env)
│   │   ├── components/ui/                            # primitivas shadcn-style (escritas a mano)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── form.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── select.tsx
│   │   │   └── table.tsx
│   │   ├── components.json                           # config mínima de shadcn (sin CLI)
│   │   ├── e2e/                                      # suites de Playwright
│   │   ├── lib/utils.ts                              # helper cn(...) (clsx + tailwind-merge)
│   │   ├── messages/{en,es}.json                     # catálogos de next-intl
│   │   ├── middleware.ts                             # detección de locale de next-intl
│   │   ├── next.config.ts                            # plugin de next-intl + image + validación de env
│   │   ├── tailwind.config.ts                        # tokens → CSS variables
│   │   ├── app/globals.css                           # CSS variables (design tokens)
│   │   └── package.json
│   └── api/                                          # NestJS 10
│       ├── nest-cli.json
│       ├── tsconfig.json
│       └── src/
│           ├── main.ts                               # bootstrap en :3001
│           ├── app.module.ts                         # importa wrappers finos desde modules/*
│           ├── modules/
│           │   ├── auth/                             # wrapper fino → @features/auth/server
│           │   │   ├── auth.module.ts
│           │   │   └── auth.controller.ts
│           │   └── transactions/                     # wrapper fino → @features/transactions/server
│           │       ├── transactions.module.ts
│           │       └── transactions.controller.ts
│           └── shared/
│               ├── pipes/zod-validation.pipe.ts     # ZodValidationPipe (§6.1)
│               ├── filters/global-exception.filter.ts
│               ├── interceptors/request-id.interceptor.ts
│               └── guards/jwt.guard.ts              # verifica el JWT de sesión de NextAuth
├── libs/
│   ├── core/
│   │   ├── config/
│   │   │   ├── env.schema.ts                         # Zod schema para process.env
│   │   │   └── env.ts                                # env = envSchema.parse(process.env)
│   │   ├── database/
│   │   │   ├── prisma/
│   │   │   │   ├── schema.prisma                     # User, Account, Session, VerificationToken,
│   │   │   │   │                                     # PasswordResetToken, Currency, FxRate, Category,
│   │   │   │   │                                     # Transaction, IdempotencyKey, AuditLog
│   │   │   │   └── migrations/
│   │   │   └── src/
│   │   │       ├── client.ts                         # singleton de PrismaClient (ÚNICO lugar)
│   │   │       └── index.ts
│   │   └── events/
│   │       ├── dispatcher.ts                         # pub/sub in-memory
│   │       ├── types.ts                              # catálogo de DomainEvent
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
│   │   │   │   │   └── DevMailbox.tsx                # SOLO DEV — usa la ruta bajo app/[locale]/(auth)/dev/mailbox
│   │   │   │   ├── hooks/
│   │   │   │   └── index.ts                          # API pública del client
│   │   │   ├── server/
│   │   │   │   ├── auth.config.ts                    # config de NextAuth v5 (Credentials + Google)
│   │   │   │   ├── services/
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── session.service.ts
│   │   │   │   │   ├── rbac.service.ts               # tabla role/permission — todos los guards pasan por acá
│   │   │   │   │   └── password-reset.service.ts
│   │   │   │   ├── controllers/
│   │   │   │   │   └── auth.controller.ts            # montado vía apps/api/modules/auth
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
│   │   │       ├── *.feature                         # 6 archivos (según inventario §4)
│   │   │       └── step-defs/                        # step definitions compartidas
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
│   │       │   │       └── fx-rate.provider.ts       # port FxRateProvider
│   │       │   ├── infrastructure/
│   │       │   │   ├── repositories/                 # adapters de Prisma que implementan los ports
│   │       │   │   │   ├── transaction.repository.ts
│   │       │   │   │   ├── category.repository.ts    # SIEMPRE filtra deletedAt: null (invariante §5)
│   │       │   │   │   ├── currency.repository.ts
│   │       │   │   │   ├── fx-rate.repository.ts
│   │       │   │   │   └── idempotency.repository.ts
│   │       │   │   └── fx/
│   │       │   │       └── in-memory-fx-rate.provider.ts  # impl por defecto, DI token FX_RATE_PROVIDER
│   │       │   ├── controllers/
│   │       │   │   └── transactions.controller.ts    # montado vía apps/api/modules/transactions
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
│   │           ├── *.feature                         # 6 archivos (según inventario §5)
│   │           └── step-defs/
│   └── shared-utils/
│       ├── date-formatting/
│       ├── currency/
│       └── decimal/                                  # nunca BigInt (según D-TX-6)
├── docs/
│   ├── architecture.md                               # Inglés (canónico)
│   ├── migration-playbook.md                         # Inglés
│   └── decisions/                                    # ADRs (opcional)
├── Documents-es/
│   ├── docs/
│   │   ├── architecture.md                           # mirror en español
│   │   └── migration-playbook.md                     # mirror en español
│   └── openspec/changes/vertical-slicing-reference-scaffold/
│       ├── proposal.md                               # mirror en español (existe)
│       ├── design.md                                 # mirror en español (ESTA ejecución)
│       └── specs/{auth,transactions}/spec.md         # mirror en español (existe)
├── scripts/
│   └── migrate/                                      # un .sh por stage del playbook (Locked Decision #4)
│       ├── 00-preflight.sh
│       ├── 10-extract-domain.sh
│       ├── 20-create-feature-slice.sh
│       ├── 30-wire-routes.sh
│       ├── 40-port-tests.sh
│       ├── 50-update-docs.sh
│       └── 99-finalize.sh
├── tools/
│   └── eslint-plugin-boundary/                       # plugin custom de ESLint (alternativa: inline en eslint.config.mjs)
└── openspec/
    ├── config.yaml
    └── changes/vertical-slicing-reference-scaffold/
        ├── proposal.md                              # canónico
        ├── design.md                                # ESTE archivo
        ├── specs/{auth,transactions}/spec.md
        └── state.yaml
```

**Boundary rules.** `apps/api/modules/*` son **wrappers finos de NestJS** que sólo hacen wiring de DI y binding de rutas; importan sus controllers, services y schemas desde `libs/features/*/server` y `libs/features/*/shared`. El plugin custom de ESLint (§3) impide que alguien inline lógica de negocio en los wrappers y que cree una tercera capa "shared business".

**Invariantes single-source.**

- `new PrismaClient()` está permitido **sólo** en `libs/core/database/src/client.ts`. La regla ESLint `no-prisma-outside-core` lo enforce.
- Los Zod schemas viven **sólo** bajo `libs/features/*/shared/schemas/*.ts` y `libs/core/config/env.schema.ts`. La regla ESLint `no-schemas-outside-shared` lo enforce.
- La primitiva de comunicación cross-module es `libs/core/events`; los imports directos module-a-module están prohibidos por `no-cross-module-import`.

---

## 3. Monorepo tooling

### 3.1 Package manager y workspaces

- **pnpm 10.x** con la declaración del workspace (`pnpm-workspace.yaml`):
  ```yaml
  packages:
    - "apps/*"
    - "libs/*"
    - "tools/*"
  ```
- El `package.json` raíz declara `packageManager: "pnpm@10.x"` y los scripts del workspace:
  - `pnpm db:up` / `pnpm db:down` → `docker compose up -d postgres` / `docker compose down`.
  - `pnpm prisma migrate dev` → `pnpm --filter @core/database exec prisma migrate dev`.
  - `pnpm turbo run build|lint|test|typecheck|bdd|e2e` → orquestación del pipeline.
  - `pnpm dev` → corre `apps/web` (Next.js) y `apps/api` (NestJS) en paralelo.

### 3.2 Turbo pipelines

`turbo.json` declara las siguientes tasks. Cada entrada lista su `dependsOn` y `outputs` para que Turbo cache los build artifacts correctamente y `bdd`/`e2e` sólo corran después de un build limpio.

| Task        | `dependsOn`             | `outputs`                                 | Notas                                                                                          |
| ----------- | ----------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `build`     | `^build`                | `dist/**`, `.next/**`                     | Compila TypeScript (`tsc -b`) y corre `next build` para `apps/web`.                            |
| `dev`       | `^build` (cache: false) | —                                         | Long-running; sin cache.                                                                       |
| `lint`      | `^build`                | —                                         | Corre `eslint .` por workspace usando la flat config compartida.                               |
| `test`      | `^build`                | `coverage/**`                             | Vitest en modo `run`; emite un reporte de cobertura mergeado del workspace (gate NO enforced). |
| `typecheck` | `^build`                | —                                         | `tsc --noEmit` por workspace.                                                                  |
| `bdd`       | `build`                 | `bdd-reports/**`                          | `@cucumber/cucumber` contra `libs/features/*/docs/*.feature`.                                  |
| `e2e`       | `build`                 | `playwright-report/**`, `test-results/**` | Playwright con `@axe-core/playwright` integrado.                                               |

### 3.3 TypeScript

- `tsconfig.base.json` en la raíz con `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: "Bundler"`, y los path aliases que consumen los packages downstream:
  ```jsonc
  {
    "compilerOptions": {
      "paths": {
        "@core/database": ["libs/core/database/src"],
        "@core/database/*": ["libs/core/database/src/*"],
        "@core/events": ["libs/core/events/src"],
        "@core/events/*": ["libs/core/events/src/*"],
        "@core/config": ["libs/core/config"],
        "@features/auth": ["libs/features/auth/server"],
        "@features/auth/*": ["libs/features/auth/*"],
        "@features/transactions": ["libs/features/transactions/server"],
        "@features/transactions/*": ["libs/features/transactions/*"],
        "@shared-utils/*": ["libs/shared-utils/*"],
      },
    },
  }
  ```
  Cada workspace extiende la base mediante su propio `tsconfig.json`.

### 3.4 ESLint flat config + plugin custom de boundary

La flat config (`eslint.config.mjs`) importa las reglas custom desde `tools/eslint-plugin-boundary/` (o, si la carpeta del plugin está vacía en el primer slice, las reglas viven inline en `eslint.config.mjs` y se extraen después). Las cuatro reglas non-negotiable y sus selectores:

| Regla                       | Selector (aplica a)                    | Patrón de violación                                                                                                                                     |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-client-server-import`   | `libs/features/*/client/**/*.{ts,tsx}` | Path de import que contiene `/server/`.                                                                                                                 |
| `no-cross-module-import`    | `libs/features/**/*.ts`                | Importar de un `libs/features/<other>/...` hermano excepto vía `@core/events` o un port compartido.                                                     |
| `no-prisma-outside-core`    | `**/*.{ts,tsx}`                        | `new PrismaClient(` fuera de `libs/core/database/src/`.                                                                                                 |
| `no-schemas-outside-shared` | `**/*.{ts,tsx}`                        | `import { z } from 'zod'` Y un literal de objeto Zod (`z.object(`, `z.string(`, etc.) fuera de `*/shared/schemas/*` o `libs/core/config/env.schema.ts`. |

Quinta regla opcional para la convención doc-mirror:

| Regla                 | Selector (aplica a)    | Patrón de violación                                                                  |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `no-mojibake-in-docs` | `Documents-es/**/*.md` | Cualquier codepoint CJK (`\u4e00`–`\u9fff`) — típicamente drift de auto-translation. |

Cada regla está aparejada con un fixture de sanity (un archivo que viola deliberadamente commiteado bajo `tools/eslint-plugin-boundary/__fixtures__/`) y el fixture está conectado a un script one-shot para que `pnpm turbo run lint` pruebe que la regla efectivamente dispara.

### 3.5 Otro tooling

- **Vitest** — `vite.config.ts` por workspace; la orquestación a nivel root corre los tests de cada workspace bajo `pnpm turbo run test`. Cobertura recolectada con `c8`/`@vitest/coverage-v8`.
- **Cucumber** — `@cucumber/cucumber` invocado por módulo de feature; un reporte HTML + un reporte JSON por módulo, mergeados por `scripts/merge-bdd-reports.mjs` en un único resumen del workspace.
- **Playwright** — `apps/web/playwright.config.ts` con dos projects (`en`, `es`) según G43/G47; `@axe-core/playwright` inyectado por project.
- **Prisma** — el schema vive en `libs/core/database/prisma/schema.prisma`; el `PrismaClient` se re-exporta como `@core/database`.

---

## 4. Domain design: auth

### 4.1 Server slice

#### `libs/features/auth/server/auth.config.ts`

Configuración de NextAuth v5. Ambos providers conectados contra `@auth/prisma-adapter`:

- **`CredentialsProvider`** — `authorize()` llama a `AuthService.verifyPassword(email, password)`. Devuelve un objeto user `{ id, email, name, role }` o `null`.
- **`GoogleProvider`** — usa `clientId`/`clientSecret` desde env. En el repositorio de referencia, **`NEXTAUTH_URL` es switcheable**: apuntarlo a un stub local (`http://localhost:3000/__stub/oauth`) hace que NextAuth crea que el handshake OAuth está yendo a Google. El handler del stub vive en `apps/web/app/__stub/oauth/[provider]/route.ts` (sólo desarrollo; gateado por `NODE_ENV !== 'production'` en el route handler).
- **Adapter** — `@auth/prisma-adapter` contra `libs/core/database`.
- **Strategy** — `jwt` (requerido por el Credentials provider de NextAuth).
- **Callbacks**:
  - `jwt({ token, user })` — embebe `role` y `userId` en el token en el primer sign-in.
  - `session({ session, token })` — proyecta `role` y `userId` sobre el objeto session para que los client components lean `session.user.role` directamente.
- **`pages`** — `{ signIn: '/[locale]/(auth)/sign-in' }` (locale-aware vía next-intl; resuelto en runtime).

#### `libs/features/auth/server/services/`

- **`AuthService`** — `verifyPassword(email, password)` (bcrypt `compare`), `register(input)`, `linkGoogleAccount(userId, profile)`, `getCurrentUser(sessionToken)`. Tiene el cost factor de bcrypt como constante del módulo (10 para el repositorio de referencia; configurable vía env en producción).
- **`SessionService`** — `listActiveSessions(userId)`, `revokeSession(userId, sessionId)`, `purgeExpired()`. Lee/escribe vía `SessionRepository` (el adapter de NextAuth provee el modelo subyacente; lo wrappeamos para acceso tipado).
- **`RbacService`** — dueño de la tabla role/permission:
  ```
  admin → { session:read, session:revoke:any, user:read, user:read:any, transaction:read:any, category:* }
  user  → { session:read:self, session:revoke:self, transaction:read:self, transaction:write:self, category:read, category:write:self }
  ```
  Cada guard del lado servidor (controllers, guards de NestJS, callbacks `authorize` de NextAuth) pasa por `RbacService.can(user, action, resource)`. **Los chequeos de rol del lado cliente son sólo sugar — ocultan affordances, no enforce.**
- **`PasswordResetService`** — `requestReset(email)` genera un token de un solo uso (el token raw nunca se persiste; sólo su hash), persiste una fila `PasswordResetToken` con `expiresAt = now + 1h`, y dispara el evento `auth.password-reset.requested`. `consumeReset(token, newPassword)` valida el token (no expirado, no consumido), reemplaza el `passwordHash` del usuario, marca el token con `consumedAt = now`, y dispara `auth.password-reset.completed`. `PasswordResetService` también siembra el **mailbox de dev** con el token raw (ver §4.4).

#### `libs/features/auth/server/controllers/auth.controller.ts`

Superficie REST montada por `apps/api/modules/auth/auth.controller.ts`. Endpoints:

| Method | Path                    | Notas                                                                                    |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------- |
| POST   | `/auth/login`           | Envuelve el authorize de credentials de NextAuth; devuelve el JWT de sesión de NextAuth. |
| POST   | `/auth/register`        | Crea el `User`, hashea el password, devuelve 201.                                        |
| POST   | `/auth/forgot-password` | Idempotente — siempre devuelve 202 para evitar enumeración de emails. Dispara evento.    |
| POST   | `/auth/reset-password`  | `{ token, password }`. 200 en éxito, 410 en expirado/inválido.                           |
| GET    | `/auth/sessions`        | Lista las sesiones activas del caller. Requiere JWT.                                     |
| DELETE | `/auth/sessions/:id`    | Revoca una sesión; chequeo de ownership vía `RbacService`.                               |

Los controllers usan `ZodValidationPipe` (§6.1) con los schemas de `libs/features/auth/shared/schemas/*.ts`.

### 4.2 Shared schemas

`libs/features/auth/shared/schemas/` — el single source of truth. Cada archivo exporta un Zod schema y un tipo TS inferido:

- `login.ts` — `{ email: z.string().email(), password: z.string().min(8) }`.
- `register.ts` — `{ email, password (min 8), name }`.
- `forgot-password.ts` — `{ email }`.
- `reset-password.ts` — `{ token: z.string().min(32), password: z.string().min(8) }`.
- `session-list.ts` — response shape (lista de `{ id, deviceLabel, lastActiveAt }`).

Client y server importan el mismo módulo. Sin validadores duplicados.

### 4.3 Client components

`libs/features/auth/client/components/`:

- **`LoginForm.tsx`** — `react-hook-form` + `@hookform/resolvers/zod` resolviendo `loginSchema`. Renderiza primitivas `Button`, `Input`, `Form`, `Card`. Implementa los cinco estados (loading / error / success / empty / validation-error).
- **`SignUpForm.tsx`** — misma forma que login; resuelve `registerSchema`.
- **`ForgotPasswordForm.tsx`** — resuelve `forgotPasswordSchema`; al submit, muestra el success state con el copy "if this email is registered...".
- **`ResetPasswordForm.tsx`** — lee `[token]` de la ruta; resuelve `resetPasswordSchema`.
- **`SessionList.tsx`** — fetchea `GET /auth/sessions`; renderiza una tabla con una acción de revoke por fila.
- **`RoleBadge.tsx`** — sólo visual; lee `session.user.role`. Oculta affordances de admin a no-admins pero no enforce.
- **`DevMailbox.tsx`** — componente dev-only renderizado por `app/[locale]/(auth)/dev/mailbox/[userId]/page.tsx`. Lista el último evento `auth.password-reset.requested` para ese usuario, exponiendo **sólo el token** (nunca el password).

### 4.4 Forma de rutas — **BLOQUEADA por R-SPEC-1**

Rutas con prefijo de locale vía `next-intl`. El route group `(auth)` es la superficie no autenticada; el route group `(app)` es la superficie autenticada (con guard server-side de sesión en `app/[locale]/(app)/layout.tsx`).

```
/[locale]/(auth)/sign-in
/[locale]/(auth)/sign-up
/[locale]/(auth)/forgot-password
/[locale]/(auth)/reset-password/[token]
/[locale]/(auth)/dev/mailbox/[userId]              # SOLO DEV — gateado por NODE_ENV !== 'production'

/[locale]/(app)/sessions
```

- `app/[locale]/layout.tsx` envuelve cada página en `NextIntlClientProvider` y resuelve el locale activo.
- `app/[locale]/(app)/layout.tsx` enforce la sesión: redirige a `/{locale}/sign-in` si `auth()` devuelve `null`.
- `middleware.ts` maneja la detección de locale (prefiere prefijo en URL; cae a `Accept-Language`).

### 4.5 Inspección del dev mailbox — DELIBERADAMENTE INCOMPLETA

`libs/core/events/dispatcher.ts` mantiene un ring buffer in-memory (últimos N eventos por usuario) en desarrollo. La ruta `/[locale]/(auth)/dev/mailbox/[userId]` renderiza el último evento `auth.password-reset.requested` del usuario, exponiendo sólo el token (nunca el password ni los contenidos del email). La página está gateada por `process.env.NODE_ENV !== 'production'` y una aserción en runtime para que nunca llegue a producción. **Esta es una affordance del repositorio de referencia, no una integración SMTP real** (ver §11).

### 4.6 Step definitions BDD

`libs/features/auth/docs/step-defs/` — seis archivos `.feature` comparten un único set de step definitions (según Locked Decision #3):

- `login-email-password.feature`, `oauth-google-stub.feature`, `password-reset.feature`, `sessions-list.feature`, `rbac-admin.feature`, `login-locale-routing.feature`.
- Los step defs cubren: `Given a registered user …`, `When the user submits the sign-in form …`, `Then a session is created …`, etc. El phrasing exacto vive en el step de `sdd-tasks`.

### 4.7 Eventos emitidos

| Event                           | Payload (validado por Zod)                                             | Emitido por                           |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| `auth.password-reset.requested` | `{ userId: string, token: string (raw, solo dev), requestedAt: Date }` | `PasswordResetService.requestReset`   |
| `auth.password-reset.completed` | `{ userId: string, resetAt: Date }`                                    | `PasswordResetService.consumeReset`   |
| `auth.session.revoked`          | `{ userId: string, sessionId: string, revokedAt: Date }`               | `SessionService.revokeSession`        |
| `auth.rbac.denied`              | `{ userId: string, action: string, resourceType: string, at: Date }`   | `RbacService.can` (audit; observable) |

Los cuatro están declarados en `libs/core/events/types.ts` y son consumidos por un subscriber in-memory que loggea al dev mailbox (§4.5) y escribe una línea de log estructurada con `pino` en producción.

---

## 5. Domain design: transactions

### 5.1 Domain layer (`libs/features/transactions/server/domain/`)

#### Entities

- **`Transaction`** — `{ id, amount (Decimal), currencyCode, kind ('income'|'expense'), reportingAmount?, reportingCurrencyCode?, fxRateId?, categoryId, notes?, occurredAt, createdBy, updatedBy, createdAt, updatedAt, deletedAt? }`. El sign se deriva de `kind` (expense → negativo para los totales; income → positivo).
- **`Category`** — `{ id, name, slug, kind, deletedAt?, createdAt, updatedAt }`. **Invariante non-negotiable: cada query en `CategoryRepository` filtra `where: { deletedAt: null }`** (D-TX-5).
- **`Currency`** — `{ code, name, symbol, decimals, createdAt }`.
- **`FxRate`** — `{ id, fromCode, toCode, rate (Decimal), recordedAt }`.
- **`IdempotencyKey`** — `{ id, key, userId, requestFingerprint, responsePayload, responseStatus, transactionId?, expiresAt, createdAt }`.

#### Services

- **`TransactionService.create(input, ctx)`** — orquesta: carga `Category` (debe estar activa), carga el FX rate si currency ≠ reporting, computa `reportingAmount`, persiste `Transaction`, persiste `IdempotencyKey` (cuando el request lleva el header `Idempotency-Key`), escribe `AuditLog`.
- **`TransactionService.update(id, input, ctx)`** — update parcial; recomputa FX si cambió la currency; refresca `updatedBy`/`updatedAt`.
- **`TransactionService.softDelete(id, ctx)`** — setea `deletedAt = now`, refresca `updatedBy`. (Según D-TX, las transactions son soft-deletable; las categorías también soft-deletan con el mismo patrón pero el controller enruta para transactions y categorías está separado.)
- **`CategoryService.{list, create, update, softDelete}`** — cada read devuelve sólo categorías activas.
- **`TotalsService.forUser(userId, range)`** — totales sign-aware income / expense / net en reporting currency.
- **`TotalsService.perCategory(userId, range)`** — agrupado por categoría activa.
- **`ThresholdService.evaluate(transaction, threshold)`** — emite `transactions.threshold.exceeded` cuando el monto absoluto supera el threshold configurado.

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
  findById(id: string): Promise<Category | null>; // MUST filtrar deletedAt: null
  list(filter: CategoryFilter): Promise<Category[]>; // MUST filtrar deletedAt: null
  create(input: CategoryCreate): Promise<Category>;
  update(id: string, input: CategoryUpdate): Promise<Category>;
  softDelete(id: string, actorId: string): Promise<void>;
}

export interface CurrencyRepository {
  findByCode(code: string): Promise<Currency | null>;
  list(): Promise<Currency[]>;
}

export interface FxRateRepository {
  findMostRecent(fromCode: string, toCode: string): Promise<FxRate | null>;
  insert(rate: FxRateInsert): Promise<FxRate>;
}

export interface IdempotencyRepository {
  find(userId: string, key: string): Promise<IdempotencyKey | null>;
  upsert(input: IdempotencyKeyInsert): Promise<void>;
  purgeExpired(now: Date): Promise<number>;
}

export interface FxRateProvider {
  // port — D-TX-2
  getRate(fromCode: string, toCode: string): Promise<{ rate: Decimal; recordedAt: Date } | null>;
}
```

### 5.2 Infrastructure layer (`libs/features/transactions/server/infrastructure/`)

- **`repositories/*.repository.ts`** — adapters de Prisma. Cada uno implementa el port correspondiente y respeta la invariante de soft-delete (`CategoryRepository` siempre agrega `where: { deletedAt: null }`).
- **`fx/in-memory-fx-rate.provider.ts`** — `FxRateProvider` por defecto. Semeado al startup con valores iniciales para `USD→ARS`, `EUR→ARS`, `ARS→USD`, `ARS→EUR`; las rates llevan `recordedAt`. La warning de staleness dispara cuando `now - recordedAt > 24h` (según D-TX-4). Conectado vía el DI token de NestJS `FX_RATE_PROVIDER`.

### 5.3 Controllers

`libs/features/transactions/server/controllers/transactions.controller.ts` — endpoints REST montados por `apps/api/modules/transactions/`:

| Method | Path                | Notas                                                                           |
| ------ | ------------------- | ------------------------------------------------------------------------------- |
| POST   | `/transactions`     | Requiere header `Idempotency-Key`; 200/201 en el primer call, 200 en replay.    |
| GET    | `/transactions`     | Cursor pagination; filters: `categoryId`, `fromDate`, `toDate`, `currencyCode`. |
| PATCH  | `/transactions/:id` | Update parcial; chequeo de ownership vía `RbacService`.                         |
| DELETE | `/transactions/:id` | Soft-delete; 204 en éxito.                                                      |
| GET    | `/categories`       | Sólo categorías activas.                                                        |
| POST   | `/categories`       | Create; unicidad sobre `slug`.                                                  |
| PATCH  | `/categories/:id`   | Update name / kind.                                                             |
| DELETE | `/categories/:id`   | Soft-delete (`deletedAt = now`).                                                |

Todos los endpoints aplican `ZodValidationPipe` con los schemas en §5.5.

### 5.4 Manejo de idempotency-key (D-TX-1)

- El cliente envía `Idempotency-Key: <uuid>` en `POST /transactions`.
- Server: lookup `IdempotencyKey` por `(userId, key)` (UNIQUE composite index).
  - **Hit + `expiresAt > now`**: comparar el `requestFingerprint` almacenado (SHA-256 del payload canónico del request) con el request actual:
    - **Match** → devuelve el `responsePayload` cacheado con el `responseStatus` cacheado.
    - **Mismatch** → rechaza con `409 Conflict` (`IDEMPOTENCY_KEY_REUSED`) — reuse del fingerprint con un body diferente es un error, no un retry.
  - **Miss**: valida, corre el lookup de FX, persiste la transaction, luego **inserta la fila `IdempotencyKey`** con `expiresAt = now + 1h` (TTL default) y la response cacheada.
- Cleanup: `IdempotencyRepository.purgeExpired(now)` corre en un intervalo tipo cron dentro del proceso de NestJS (configurable vía env; default cada 15 minutos). El primer slice no entrega un scheduler externo.

### 5.5 Shared schemas

`libs/features/transactions/shared/schemas/`:

- `create.ts` — `{ amount: z.coerce.number().positive().multipleOf(0.01), currencyCode: z.string().length(3), kind: z.enum(['income','expense']), categoryId: z.string().cuid(), notes: z.string().max(500).optional(), occurredAt: z.coerce.date() }`.
- `update.ts` — parcial de `create` (todos los campos opcionales excepto `id`).
- `list.ts` — `{ cursor?: string, pageSize?: z.coerce.number().int().min(1).max(100).default(20), categoryId?: string, fromDate?: z.coerce.date(), toDate?: z.coerce.date(), currencyCode?: z.string().length(3) }`.
- `category-create.ts` — `{ name, kind, slug }`.
- `category-update.ts` — `{ id, name?, kind? }`.

### 5.6 Client components

- **`TransactionsList.tsx`** — tabla de filas `Transaction`; filters (date range, category, currency); pagination vía cursor; estados empty / error / loading.
- **`CreateTransactionForm.tsx`** — `react-hook-form` + `createSchema`; auto-genera un UUID de `Idempotency-Key` por submit (mantenido en state del componente para que un re-submit del mismo form reuse la key, pero un ingreso de form nuevo genera una nueva).
- **`EditTransactionForm.tsx`** — misma forma que create, prefilled.
- **`CategoryManager.tsx`** — list + create + rename + soft-delete para categorías; advierte en el soft-delete ("transactions referencing this category will keep their data, but the category will be hidden from selectors").
- **`TotalsCard.tsx`** — sign-aware (income / expense / net) y rollups por categoría; renderiza en el locale activo.
- **`ThresholdAlert.tsx`** — renderiza cuando una transaction recién creada cruzó su threshold; se subscribe al evento `transactions.threshold.exceeded` vía Server-Sent Events o un simple toast (decidido en `sdd-tasks`).

### 5.7 Forma de rutas

```
/[locale]/(app)/transactions              # list
/[locale]/(app)/transactions/new          # create
/[locale]/(app)/transactions/[id]         # detail / edit / delete
/[locale]/(app)/categories                # category manager
```

Todas bajo `(app)`, por lo que aplica el guard de auth. El locale activo conduce los labels, los validation messages y el texto de la warning de threshold.

### 5.8 Step definitions BDD

`libs/features/transactions/docs/step-defs/` — seis archivos `.feature` comparten un único árbol de step-defs:

- `create-transaction.feature`, `list-transactions.feature`, `multi-currency-conversion.feature`, `idempotency-key.feature`, `soft-delete-categories.feature`, `sign-aware-totals.feature`.

### 5.9 Eventos emitidos

| Event                             | Payload                                                                         | Emitido por                                  |
| --------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| `transactions.created`            | `{ transactionId, userId, amount (Decimal como string), currency, occurredAt }` | `TransactionService.create`                  |
| `transactions.updated`            | `{ transactionId, userId, changedFields: string[], at: Date }`                  | `TransactionService.update`                  |
| `transactions.soft-deleted`       | `{ transactionId, userId, at: Date }`                                           | `TransactionService.softDelete`              |
| `transactions.fx.stale`           | `{ from, to, recordedAt, observedAt, ageHours }`                                | `TransactionService.create` cuando age > 24h |
| `transactions.threshold.exceeded` | `{ userId, categoryId, threshold, total, observedAt }`                          | `ThresholdService.evaluate`                  |

Los cinco están declarados en `libs/core/events/types.ts`. El evento `transactions.fx.stale` es **informativo** — D-TX-4 manda que la staleness NO bloquee el write; los subscribers downstream (audit, notification, toast) deciden la policy.

---

## 6. Cross-cutting concerns

### 6.1 Shared Zod schemas (regla de no-duplicación)

- **Un schema canónico por input lógico.** Cada schema vive bajo `libs/features/*/shared/schemas/*.ts` o `libs/core/config/env.schema.ts`. La regla ESLint `no-schemas-outside-shared` enforce la ubicación.
- El **client** importa el schema directamente y lo alimenta a `@hookform/resolvers/zod` para validación de formularios.
- El **server (NestJS)** importa el mismo schema y lo corre a través de `ZodValidationPipe`. **Sin `class-validator`** — el repositorio de referencia usa Zod exclusivamente según las Locked Decisions #2/#7/#9 y la lista cross-cutting de §2.1.4 de la propuesta.
- **Cuerpo del `ZodValidationPipe` (pseudocódigo):**
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
  Cada controller vincula el schema al pipe vía un pequeño helper decorator:
  ```ts
  export const Body = (schema: ZodTypeAny) => (target: any, key: string, index: number) =>
    UsePipes(new ZodValidationPipe(schema))(target, key, index);
  ```

### 6.2 Event dispatcher (`libs/core/events`)

Interface mínima — sin broker externo, pub/sub in-memory para el repositorio de referencia.

```ts
export interface EventDispatcher {
  dispatch(event: DomainEvent): Promise<void>;
  subscribe(name: string, handler: (event: DomainEvent) => Promise<void>): () => void;
}
```

- **Eventos declarados** en `libs/core/events/types.ts`. Cada evento tiene `name` (kebab-case), `payload` (Zod schema), `emittedBy` (module id), `consumedBy` (lista de consumer ids).
- La **implementación in-memory** mantiene un ring buffer por usuario (cap de 100 entries) para el inspector del dev mailbox (§4.5).
- Un cambio futuro puede swappear esto por un broker real (Redis, NATS); la interface es el seam.

### 6.3 i18n routing (`next-intl`)

- `apps/web/messages/en.json` y `apps/web/messages/es.json` — catálogos de strings de UI. Claveados por módulo de feature + pantalla, e.g. `auth.login.title`, `transactions.list.empty`.
- `apps/web/middleware.ts` — `createMiddleware` desde `next-intl/middleware` con `locales: ['en','es']`, `defaultLocale: 'en'`, `localePrefix: 'always'` (la ruta SIEMPRE va prefijada; `/sign-in` redirige a `/en/sign-in`).
- `next.config.ts` — envuelve la config de Next con `createNextIntlPlugin('./i18n.ts')`.
- `apps/web/i18n.ts` — carga el catálogo para el locale activo y expone `getRequestConfig`.
- **Server actions locale-aware** — cualquier action que toque copy user-visible debe leer del catálogo del locale activo; las actions nunca hard-codean copy en inglés.
- El locale switcher vive en `apps/web/components/ui/locale-switcher.tsx`; al switchear empuja al usuario a la misma superficie en el nuevo locale, preservando cualquier query param path-stable.

### 6.4 Design tokens (extraídos de `gastos-personales`)

- **Lee** durante apply:
  - `gastos-personales/tailwind.config.*` — extraer `theme.extend.colors`, `theme.extend.fontFamily`, `theme.extend.spacing` (el que exista).
  - `gastos-personales/app/globals.css` — extraer las CSS variables bajo `:root` (`--background`, `--foreground`, `--primary`, etc.).
- **Escribe** en este repo:
  - `apps/web/app/globals.css` — CSS variables bajo `:root` y `[data-theme="dark"]`, espejando la paleta fuente. Un comentario corto en el top documenta el path fuente.
  - `apps/web/tailwind.config.ts` — `theme.extend.colors` referencia las CSS variables (`'background': 'hsl(var(--background))'` etc.). El archivo referencia al repo fuente vía un comentario.
- Esto es un extract a nivel de tokens sólo (colors / spacing / typography). NO importa ni conecta código de componentes desde `gastos-personales/`.

### 6.5 Setup de shadcn/ui

- **No se instala vía CLI.** Las primitivas son archivos `.tsx` escritos a mano bajo `apps/web/components/ui/` para mantenerlos editables. `apps/web/components.json` es un manifiesto mínimo estilo shadcn:
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
- **Peer deps** instaladas en `apps/web`: `@radix-ui/react-*` (slot, label, dialog, dropdown-menu, select, toast), `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`.
- **Helpers** — `apps/web/lib/utils.ts` exporta `cn(...inputs) = twMerge(clsx(inputs))`.

### 6.6 Reglas de boundary de ESLint (plugin custom)

El plugin vive en `tools/eslint-plugin-boundary/` (fallback: inline en `eslint.config.mjs` si la carpeta está vacía en el primer slice). Cada regla está documentada con su selector y el patrón de violación (§3.4). El plugin también expone una config `recommended` que `eslint.config.mjs` extiende.

**Sanity check driven por fixtures.** Cada regla tiene un fixture matching bajo `tools/eslint-plugin-boundary/__fixtures__/<rule>/`:

- `valid.ts` — no dispara.
- `invalid.ts` — dispara; commiteado para que la suite de tests asegure que la regla efectivamente dispara.

El pipeline de CI corre `pnpm turbo run lint` después de `build`; si una regla regresiona silenciosamente, los fixtures lo catchean.

### 6.7 Validation, error handling, logging

- **Validation** — `ZodValidationPipe` (§6.1).
- **Error codes** — vocabulario cross-module en `libs/shared-utils/errors/codes.ts`:
  ```
  AUTH_INVALID_CREDENTIALS, AUTH_TOKEN_EXPIRED, AUTH_RESET_TOKEN_INVALID, AUTH_FORBIDDEN,
  TX_VALIDATION_FAILED, TX_CATEGORY_NOT_FOUND, TX_CATEGORY_DELETED, TX_CURRENCY_NOT_FOUND,
  TX_FX_RATE_STALE, TX_FX_PAIR_UNKNOWN, TX_NOT_FOUND, TX_FORBIDDEN,
  IDEMPOTENCY_KEY_REUSED, IDEMPOTENCY_KEY_CONFLICT,
  VALIDATION_FAILED, NOT_FOUND, INTERNAL_ERROR.
  ```
- **Filters** — `apps/api/src/shared/filters/global-exception.filter.ts` traduce los errores thrown a un shape JSON estable `{ code, message, issues?, requestId }`.
- **Logging** — `pino` (lightweight; alineado con la skill env-config). Logs JSON estructurados; `requestId` propagado por `request-id.interceptor.ts` (lee desde el header `x-request-id` o genera uno). **Exclusión de PII** — los passwords, los raw tokens y los contenidos de email NUNCA se loggean. Los redact paths de `pino` cubren `password`, `*.password`, `token`, `*.token`, `headers.authorization`, `headers.cookie`.
- **Request IDs** — cada response lleva `x-request-id`; los errores client-side exponen el ID para soporte.

---

## 7. Data flow examples

### 7.1 auth — sign-in

1. El usuario visita `/{locale}/sign-in` (locale por default `en` si no hay match de `Accept-Language`; `middleware.ts` redirige desde `/sign-in`).
2. `LoginForm.tsx` se monta con `useForm({ resolver: zodResolver(loginSchema) })` desde `@features/auth/shared/schemas/login`.
3. Submit → `signIn('credentials', { email, password, redirect: false })` desde `next-auth/react`.
4. El handler de NextAuth v5 en `apps/web/app/api/auth/[...nextauth]/route.ts` llama a `auth.config.ts#authorize`, que delega a `AuthService.verifyPassword(email, password)`. En éxito, NextAuth acuña el JWT de sesión vía el callback `jwt`.
5. El cliente redirige a `/{locale}/(app)/transactions` (landing autenticado para este slice; cambios futuros pueden agregar una ruta `/dashboard`).

El mecanismo de proxy es **el handler propio de NextAuth** hosteado en `apps/web`. El servicio NestJS standalone `apps/api` expone el mismo endpoint `POST /auth/login` para clientes no-NextAuth (curl, integration tests) usando el mismo `AuthService` por debajo — ambas rutas comparten el service vía `@features/auth/server`. Single source de lógica de negocio; dos superficies de transporte.

### 7.2 transactions — create con FX + idempotencia

1. El usuario abre `/{locale}/(app)/transactions/new`.
2. `CreateTransactionForm.tsx` se monta con `useForm({ resolver: zodResolver(createSchema) })`.
3. El usuario submitea `{ amount, currencyCode, kind, categoryId, occurredAt, notes? }`.
4. El cliente acuña una idempotency key (`crypto.randomUUID()`), capturada en state del componente para que el mismo form re-submit (e.g. usuario presiona Enter dos veces) reuse la key.
5. `POST /transactions` con `Idempotency-Key: <uuid>` y el body.
6. Pipeline del server:
   a. `JwtGuard` valida el session token → user context.
   b. `RbacService.can(user, 'transaction:write:self', null)` → allow.
   c. `ZodValidationPipe(createSchema)` parsea el body.
   d. `IdempotencyService.lookup(userId, key)`:
   - **Hit + fingerprint match + no expirado** → devuelve la response cacheada.
   - **Hit + fingerprint mismatch** → `409 IDEMPOTENCY_KEY_REUSED`.
   - **Miss** → procede.
     e. `CategoryRepository.findById(categoryId)` — aplica el filter de soft-delete; rechaza con `TX_CATEGORY_DELETED` si ausente.
     f. `CurrencyRepository.findByCode(currencyCode)` — rechaza con `TX_CURRENCY_NOT_FOUND` si ausente.
     g. Si `currencyCode !== user.reportingCurrencyCode`:
   - `FxRateProvider.getRate(currencyCode, user.reportingCurrencyCode)`.
   - **null** → rechaza con `TX_FX_PAIR_UNKNOWN`.
   - **Stale** (`now - recordedAt > 24h`) → dispatch `transactions.fx.stale`; NO bloquea.
     h. `TransactionRepository.create({ ...input, reportingAmount, reportingCurrencyCode, fxRateId, createdBy, updatedBy })`.
     i. `AuditLog.create({ entityType: 'Transaction', entityId, action: 'create', actorId: userId })`.
     j. `IdempotencyService.upsert({ key, userId, requestFingerprint, responsePayload, responseStatus: 201, transactionId, expiresAt: now + 1h })`.
     k. `events.dispatch({ name: 'transactions.created', payload: ... })`.
     l. `ThresholdService.evaluate(transaction, threshold)` → si cruzó, `events.dispatch({ name: 'transactions.threshold.exceeded', payload: ... })`.
7. El server devuelve `201` con el payload de la transaction.
8. El cliente navega a `/{locale}/(app)/transactions`; la nueva fila aparece en la lista. Si la response llevó una warning de stale-rate, un toast la surface por ~5 segundos.

---

## 8. Test strategy

### 8.1 Unit + integration (Vitest)

- Colocados en `libs/features/*/server/.../__tests__/` y `libs/core/*/src/__tests__/`.
- Cobertura **a nivel de service** sobre cada service (auth + transactions). Un archivo por service.
- Cobertura **a nivel de repository** contra una base de datos de test aislada (el setup global de Vitest levanta Postgres vía docker-compose o un Postgres efímero para la suite; los tests a nivel de service prefieren ports in-memory cuando es posible).
- **Disciplina TDD compartida** — strict TDD mode está habilitado según `openspec/config.yaml`. Cada método público recibe un test rojo antes de que aterrice la implementación.

### 8.2 BDD (`@cucumber/cucumber`)

- Lee `libs/features/*/docs/*.feature` (12 archivos en total — ver §4.6, §5.8).
- Las step definitions están compartidas por feature bajo `libs/features/*/docs/step-defs/`. Sin cuerpos de step duplicados entre archivos `.feature`.
- `pnpm turbo run bdd` orquesta la corrida y mergea los reportes HTML + JSON por módulo.

### 8.3 Component tests (Vitest + Testing Library)

- `libs/features/*/client/components/__tests__/`.
- Un test de happy-path por pantalla crítica (sign-in, sign-up, forgot/reset password, sessions list, transactions list, create-transaction form, category manager, totals card).
- Asserta: empty state visible; el form renderiza los cinco estados (loading, error, success, empty, validation-error) sobre los inputs canónicos.

### 8.4 E2E (Playwright)

- `apps/web/e2e/`.
- Dos projects (`en`, `es`) según `playwright.config.ts`; `axe-core` está integrado vía `@axe-core/playwright`.
- Tests de critical-flow:
  - `auth-login.spec.ts` — sesión limpia → llena sign-in form → asserta landing alcanzado en el locale correcto.
  - `transactions-crud.spec.ts` — sign-in → transactions list → create-transaction form → asserta que aparece la nueva fila.
- `pnpm turbo run e2e` corre ambos projects.

### 8.5 Accessibility audit

- `@axe-core/playwright` corre después del render de cada pantalla crítica y falla el e2e ante cualquier violación AA (G43).
- `@axe-core/cli` corre contra rutas standalone durante `pnpm turbo run bdd` para pantallas no cubiertas por e2e.

### 8.6 Coverage

- 60% sobre lines / branches / functions / statements — declarado en `openspec/config.yaml`, **NO enforced como gate de CI** para este slice (riesgo menor §5 de la propuesta). La cobertura se recolecta y se surface en el reporte de tests; el gate puede flipearse a on en un cambio futuro.

---

## 9. Rollout

Según §6 de la propuesta:

- **Rollback whole-change** — `rm -rf /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference`. Greenfield; sin datos de producción. El sibling `gastos-personales/` queda intacto.
- **Rollback por feature** — `git rm -rf libs/features/<feature>` + drop de imports en `apps/web` y `apps/api`. Las boundary rules vuelven un feature medio removido un compile error (failure mode deseable).
- **Rollback por task** — `git revert <sha>`. Los commits atómicos por task (según `sdd-tasks`) hacen esto seguro.
- **Sin migration necesaria** — greenfield.

---

## 10. Open questions para `sdd-tasks`

Estas son decisiones resueltas a nivel de spec pero de implementation-shape que la fase de tasks va a pinear:

1. **Path aliases exactos de tsconfig** — default `@core/*`, `@features/*`, `@shared-utils/*` documentados en §3.3. Tasks debe declarar si `@features/<slice>` resuelve a `client`, `server` o `shared` según la regla de import boundary, y si un barrel `client.ts` / `server.ts` en cada feature clarifica la intención.
2. **Phrasing exacto de los steps de Cucumber por feature** — el Given/When/Then a nivel de spec está fijo; tasks decide el phrasing imperativo (`Given a registered user exists with role "user"` vs `Given the following user exists: …`).
3. **Forma del config de Playwright** — un único project con locale parametrizado vs dos projects distintos (`en`, `es`). Recomendación: dos projects (`en`, `es`) según `playwright.config.ts` para que `@axe-core` corra por locale y el reporte quede separado. Tasks debe commitear la forma elegida.
4. **Cost factor de bcrypt** — fijo en 10 para el repositorio de referencia según §4.1; tasks puede surfacear un knob de env si hace falta.
5. **TTL de idempotency-key** — 1h default según §5.4; tasks decide si el intervalo del cron (default 15min) vive en el startup de `apps/api` o en un script separado.

---

## 11. Deferred to future changes

Estos son **explícitamente OUT-OF-SCOPE** para este slice. Se reafirman acá para que el trabajo futuro tenga un single source of truth.

1. **Integración SMTP real** para los emails de password-reset. El repositorio de referencia entrega la inspección del dev mailbox (§4.5) como una affordance deliberadamente incompleta. Un provider real (SES, Postmark, Resend) llega en un cambio posterior con un adapter config-driven.
2. **Handshake OAuth real contra Google.** Sólo el happy path stubeado está en Gherkin (Locked Decision #5). Una integración OAuth real es manual/integration only.
3. **Capacidad de mutación cross-user para admin** — la "admin may mutate other users' transactions" de D-TX-7 está **diferida a un cambio futuro** según R-SPEC-2. En este slice, **los admins NO pueden mutar transactions de otros usuarios** — tanto `admin` como `user` sólo pueden mutar las propias. La tabla de permisos de `RbacService` (§4.1) refleja esto exponiendo sólo `transaction:write:self` para ambos roles; una capacidad admin cross-user es un follow-up.
4. **i18n más allá de Inglés + Español.** Los locales están fijos a `en` y `es`.
5. **CI/CD más allá de lint + test + typecheck + BDD + e2e básico.** Sin deploy pipelines, sin staging, sin release automation.
6. **Production hardening** — sin secrets manager, sin HSTS, sin CSP más allá de los defaults de Next.js, sin config de CDN.
7. **Observability** — sin OpenTelemetry, sin Prometheus, sin log shipping. Sólo logs estructurados con `pino`.
8. **Múltiples OAuth providers** más allá de Google.
9. **Sentry / error reporting SaaS.**
10. **Rate-limiting en el edge de la API.**
11. **Enforcement del gate de coverage** en CI.
12. **Migración de `gastos-personales/`** al modelo vertical-slicing. El playbook se entrega acá; la migración corre en un cambio separado con su propio ciclo de vida SDD.
13. **UI del audit log** — el data model persiste filas `AuditLog`; surfacearlas en la UI es un slice posterior.

---

## 12. Cross-references

| Referencia                                        | Where                                                                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proposal (canónico)                               | `openspec/changes/vertical-slicing-reference-scaffold/proposal.md`                                                                                                   |
| Proposal (mirror en español)                      | `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/proposal.md`                                                                                      |
| Auth spec                                         | `openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md`                                                                                            |
| Transactions spec                                 | `openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md`                                                                                    |
| Engram: project context                           | `sdd-init/gastos-personales-reference` (id 2130)                                                                                                                     |
| Engram: resumen de proposal                       | `sdd/vertical-slicing-reference-scaffold/proposal` (id 2131)                                                                                                         |
| Engram: resumen de spec                           | `sdd/vertical-slicing-reference-scaffold/spec` (id 2134)                                                                                                             |
| Engram: convención UI complete-not-scaffold       | `gastos-personales-reference/conventions/ui-complete-not-scaffold` (id 2133)                                                                                         |
| Engram: convención doc-mirror-spanish (HARD RULE) | `gastos-personales-reference/conventions/doc-mirror-spanish` (id 2132)                                                                                               |
| Engram: convención branch-model                   | `gastos-personales-reference/conventions/branch-model` (id 2129)                                                                                                     |
| Skills loaded                                     | `architecture-standards`, `architecture-patterns`, `next-best-practices`, `database-strategy`, `auth-implementation-patterns`, `env-config`, `api-design-principles` |
| Downstream phases                                 | `sdd-tasks` → `sdd-apply` → `sdd-verify` → `sdd-archive`                                                                                                             |

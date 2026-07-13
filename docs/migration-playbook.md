# Migration playbook

> **Status**: sections 1-7 written in slice 8 PR-B1 (English). Sections 8-11
> (Stage 99 finalize + ESLint enforcement loop + `@core/events` + glossary)
> land in PR-B2. The Spanish mirror (`Documents-es/docs/migration-playbook.md`)
> and the seven idempotent `scripts/migrate/<stage>.sh` shells land in PR-B2
> and PR-C respectively.
> **Project**: `gastos-personales-reference`.
> **Audience**: a human reviewer who needs to verify the migration
> shape end-to-end **and** an AI agent that will execute the recipe
> against an unfamiliar monolith.

This playbook is the executable form of the migration target that
`gastos-personales-reference` validates. The sibling shells in
`scripts/migrate/<NN>-<stage>.sh` (PR-C) perform the same work
idempotently for an AI consumer; this document is the human prose
explaining what each shell does and why. When the prose here and
[`docs/architecture.md`](./architecture.md) disagree, **architecture
wins**; flag the discrepancy in a PR.

## Who this is for

- **Human reviewer.** You want to know what a "done" migration looks
  like, what evidence each stage produces, and which invariants the
  ESLint boundary plugin guards. Read top-to-bottom on a 30-minute
  timer.
- **AI agent.** You receive a request to migrate module `<feature>`
  out of a monolith. You run `scripts/migrate/00-preflight.sh` first,
  then `10-extract-domain.sh`, `20-create-feature-slice.sh`, and so
  on, in order. Each script is idempotent: re-running on an empty
  branch exits `0` and prints `stage NN: already applied`.

Both audiences share one rule: **do not skip Stage 00**. Preflight
catches dirty trees, missing tools, and unverified Postgres health
before any domain code moves.

Each stage follows the same shape: **Goal**, **Inputs**, **Actions**,
**Before / after** (≥3 paired snippets per stage per spec §8.4), and
**Done when** (the smallest command that proves the stage finished).
Stages form a DAG: 00 first, 10–50 in numeric order against the same
feature, 99 (PR-B2) closes with a pre-PR validation pass.

{ #stage-00 }

## Stage 00 — preflight

**Goal**: confirm the host, the repo, and the database are in the
state the rest of the stages assume.

**Inputs**: `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, the top-level
`package.json`, and `docker-compose.yml`. The stage MAY scan the
source tree to inventory file counts and `import` edges but MUST NOT
modify any tracked file.

**Actions**:

1. Read `AGENTS.md` from the repo root. Record the project's locked
   decisions (vertical slicing, ESLint boundaries, branch model).
2. Inventory the source tree: file count, LOC per top-level
   directory, forward-import graph (e.g. `npx madge --json`),
   current coverage per module.
3. Decide slice order using the inventory: prefer the module with
   the **smallest dependency fan-out** first (auth usually wins
   because it depends on `@core/database` only).
4. Establish the baseline:
   - `pnpm install --frozen-lockfile` exits `0`.
   - `pnpm db:up && docker compose ps` shows Postgres healthy.
   - `pnpm turbo run build lint typecheck test` exits `0`.
   - `pnpm lint:fixtures` exits `0`.
5. Record the baseline in a `MIGRATION-<feature>.md` scratch file
   (gitignored is fine — this is a one-shot artifact).

**Before — `pnpm turbo run build lint typecheck test`** on a clean
branch:

```text
 Tasks:    5 successful, 5 total
Cached:    0 cached, 5 total
  Time:    4.871s
```

**After — same command, recorded as the baseline**:

```text
# baseline.txt
# 2026-07-13T14:22:00Z
# Tasks:    5 successful, 5 total
# Cached:    0 cached, 5 total
#   Time:    4.871s
```

**Before — `apps/api/src/app.module.ts`** (typical monolith module
bag):

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { TransactionsModule } from "./modules/transactions/transactions.module";
import { UsersModule } from "./modules/users/users.module";
import { CategoriesModule } from "./modules/categories/categories.module";

@Module({
  imports: [AuthModule, TransactionsModule, UsersModule, CategoriesModule],
})
export class AppModule {}
```

**After — same file, with the migration tag annotated** (no code
change yet; Stage 00 is read-only):

```ts
// MIGRATION-ID: 2026-q3-auth-first
// SLICES-PLANNED: auth, transactions
// BASELINE-RECORDED: 2026-07-13T14:22:00Z
import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { TransactionsModule } from "./modules/transactions/transactions.module";
import { UsersModule } from "./modules/users/users.module";
import { CategoriesModule } from "./modules/categories/categories.module";

@Module({
  imports: [AuthModule, TransactionsModule, UsersModule, CategoriesModule],
})
export class AppModule {}
```

**Before — `find src -name '*.ts' | wc -l`** (records the starting
file count):

```text
382
```

**After — `MIGRATION-<feature>.md`** (the scratch file captures the
inventory that Stage 00 produces):

```md
# Migration scratch — auth (Stage 00 complete)

- baseline-recorded: 2026-07-13T14:22:00Z
- src file count: 382
- dependency fan-out (auth): 12 files, 3 features
- coverage (auth): 71% lines, 64% branches
- baseline: pnpm turbo run build lint typecheck test → exit 0
```

**Done when**:

```bash
pnpm install --frozen-lockfile && pnpm turbo run build lint typecheck test
echo $?   # must be 0
```

If the baseline is NOT green, fix it before Stage 10. Migrating
against a red baseline moves broken code around and produces broken
slices.

{ #stage-10 }

## Stage 10 — extract domain

**Goal**: move the `<feature>` domain layer from
`src/modules/<feature>/` into `libs/features/<feature>/server/src/`
without changing semantics.

**Inputs**: source-of-truth domain code under
`src/modules/<feature>/{domain,application,infrastructure}/`. The
`no-prisma-outside-core` boundary rule (`tools/eslint-plugin-boundary/rules/no-prisma-outside-core.cjs`)
will reject any new `new PrismaClient()` outside `@core/database`.

**Actions**:

1. Create `libs/features/<feature>/server/src/` (empty).
2. Move `domain/`, `application/`, and `infrastructure/` from
   `src/modules/<feature>/` into `server/src/`. Preserve the tree.
3. Rewrite every `from "@/lib/prisma"` and `new PrismaClient()` to
   `from "@core/database"`. The boundary rule fires on
   `new PrismaClient()` *anywhere*; the migration routes through the
   barrel.
4. Move every Zod schema literal to
   `libs/features/<feature>/shared/schemas/` and import back. The
   `no-schemas-outside-shared` rule forbids `z.object(...)`,
   `z.string(...)` literals outside that folder or
   `libs/core/config/env.schema.ts`.
5. Re-run `pnpm turbo run build lint typecheck test`; lint MUST
   exit `0`. If not, the boundary plugin caught a forgotten
   `PrismaClient` or schema literal.

**Before — `src/modules/auth/domain/user.entity.ts`** (domain
entity coupled to a local Prisma import):

```ts
import { Prisma, User } from "@prisma/client";

export class UserEntity {
  constructor(public readonly user: User) {}

  isAdmin(): boolean {
    return this.user.role === "admin";
  }

  static fromPrisma(user: User): UserEntity {
    return new UserEntity(user);
  }
}
```

**After — `libs/features/auth/server/src/domain/user.entity.ts`**
(decoupled — the slice talks to `@core/database`):

```ts
import type { User } from "@core/database";

export class UserEntity {
  constructor(public readonly user: User) {}

  isAdmin(): boolean {
    return this.user.role === "admin";
  }

  static fromPrisma(user: User): UserEntity {
    return new UserEntity(user);
  }
}
```

**Before — `src/modules/auth/infrastructure/auth.repository.ts`**:

```ts
import { PrismaClient } from "@prisma/client";
import { UserEntity } from "../domain/user.entity";

const prisma = new PrismaClient();

export class AuthRepository {
  async findByEmail(email: string): Promise<UserEntity | null> {
    const u = await prisma.user.findUnique({ where: { email } });
    return u ? UserEntity.fromPrisma(u) : null;
  }
}
```

**After — `libs/features/auth/server/src/infrastructure/auth.repository.ts`**:

```ts
import { prisma, type User } from "@core/database";
import { UserEntity } from "../domain/user.entity";

export class AuthRepository {
  async findByEmail(email: string): Promise<UserEntity | null> {
    const u: User | null = await prisma.user.findUnique({ where: { email } });
    return u ? UserEntity.fromPrisma(u) : null;
  }
}
```

**Before — `src/modules/auth/application/dto/create-user.input.ts`**:

```ts
import { z } from "zod";

export const CreateUserInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export type CreateUserInput = z.infer<typeof CreateUserInput>;
```

**After — `libs/features/auth/shared/schemas/create-user.schema.ts`**
(the literal moves to `shared/schemas/`; the call site re-exports):

```ts
import { z } from "zod";

export const CreateUserInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export type CreateUserInput = z.infer<typeof CreateUserInput>;
```

The `application/dto/create-user.input.ts` after Stage 10 re-exports
from the shared location:

```ts
export {
  CreateUserInput,
  type CreateUserInput as CreateUserInputType,
} from "../../../shared/schemas/create-user.schema.js";
```

**Done when**:

```bash
pnpm turbo run build lint typecheck test
pnpm lint:fixtures
echo $?   # must be 0
```

Stage 10 ends with the slice's domain code living at
`libs/features/<feature>/server/src/`, importing Prisma through
`@core/database`, and importing Zod schemas from the shared
schemas folder. Exports are NOT yet wired into `tsconfig.base.json`
paths; Stage 20 does that.

{ #stage-20 }

## Stage 20 — create feature slice

**Goal**: scaffold the four-folder contract (`client/`, `server/`,
`shared/`, `docs/`) for the slice and add `package.json`,
`tsconfig.json`, and a public barrel to each.

**Inputs**: the moved domain code from Stage 10.

**Actions**:

1. Create the four folders:
   `libs/features/<feature>/{client,server,shared}/src/` and
   `libs/features/<feature>/docs/`.
2. For each of `client/`, `server/`, `shared/` scaffold:
   - `package.json` with `name: "@features/<feature>-<role>"`,
     `private: true`, `exports` → `./src/index.ts`.
   - `tsconfig.json` extending `../../../../tsconfig.base.json`
     with `composite: true` (Turbo tracks build order via project
     references).
   - `src/index.ts` — the public barrel (per architecture.md §8.3
     the barrel IS the API).
3. Add `libs/features/<feature>/docs/cucumber.mjs` and an empty
   `docs/__tests__/` directory; both come for free here even
   though Stage 40 populates them.
4. Add `@features/<feature>` and the three role sub-packages to
   `tsconfig.base.json` `compilerOptions.paths`.
5. Verify the `no-prisma-outside-core` and
   `no-schemas-outside-shared` rules still pass.

**Before — `libs/features/auth/` does not have the four-folder
shape**:

```text
libs/features/auth/
└── README.md
```

**After — `libs/features/auth/` follows the four-folder contract**:

```text
libs/features/auth/
├── client/
│   ├── package.json     # @features/auth-client
│   ├── src/
│   │   └── index.ts     # public barrel
│   └── tsconfig.json
├── server/
│   ├── package.json     # @features/auth-server
│   ├── src/
│   │   ├── application/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── index.ts     # public barrel
│   └── tsconfig.json
├── shared/
│   ├── package.json     # @features/auth-shared
│   ├── schemas/
│   │   └── create-user.schema.ts
│   ├── src/
│   │   └── index.ts
│   └── tsconfig.json
├── docs/
│   ├── cucumber.mjs
│   ├── features/        # populated in Stage 40
│   ├── step-defs/       # populated in Stage 40
│   └── __tests__/       # populated in Stage 40
└── README.md
```

**Before — `tsconfig.base.json`** does not include `@features/auth/*`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@core/*": ["libs/core/*"],
      "@shared-utils/*": ["libs/shared-utils/*"]
    }
  }
}
```

**After — `tsconfig.base.json`** declares all four sub-packages:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@core/*": ["libs/core/*"],
      "@shared-utils/*": ["libs/shared-utils/*"],
      "@features/auth": ["libs/features/auth/server/src"],
      "@features/auth-server": ["libs/features/auth/server/src"],
      "@features/auth-client": ["libs/features/auth/client/src"],
      "@features/auth-shared": ["libs/features/auth/shared/src"]
    }
  }
}
```

**Before — `libs/features/auth/server/src/index.ts`** (empty):

```ts
export {};
```

**After — `libs/features/auth/server/src/index.ts`** (the public
barrel, manually maintained):

```ts
export { AuthService } from "./application/services/auth.service.js";
export { AuthRepository } from "./infrastructure/auth.repository.js";
export { AuthController } from "./controllers/auth.controller.js";
export type { UserEntity } from "./domain/user.entity.js";
```

Anything NOT exported from this file is internal to the slice and
not covered by the public contract; importing it directly is a
`no-cross-module-import` violation per AGENTS.md §7.

**Done when**:

```bash
pnpm install --frozen-lockfile
pnpm --filter @features/auth-server build
pnpm lint:fixtures
echo $?   # must be 0
```

{ #stage-30 }

## Stage 30 — wire routes

**Goal**: make the slice reachable from `apps/api` (NestJS) and
`apps/web` (Next.js) through the established module conventions.

**Inputs**: the four-folder slice from Stage 20.

**Actions**:

1. **NestJS**: in `apps/api/src/app.module.ts`, replace
   `import { AuthModule } from "./modules/auth/auth.module"` with
   `import { AuthModule } from "@features/auth-server"`. The NestJS
   module-per-feature convention stays: the slice exports a NestJS
   module that the API app imports.
2. **Next.js**: in `apps/web/`, create the route group
   `apps/web/app/[locale]/(<feature>)/` if absent. Server
   components import from `@features/<feature>-server` (server
   actions) and `@features/<feature>-client` (client components).
3. The `no-client-server-import` boundary rule fires when
   `libs/features/<feature>/client/*` imports from `*/server/*`.
   Routes in `apps/web/` are NOT inside `libs/features/<feature>/`,
   so the rule does not apply to them.

**Before — `apps/api/src/app.module.ts`** (imports the monolith
auth module):

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { TransactionsModule } from "./modules/transactions/transactions.module";

@Module({
  imports: [AuthModule, TransactionsModule],
})
export class AppModule {}
```

**After — `apps/api/src/app.module.ts`** (imports the slice's
NestJS module):

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "@features/auth-server";
import { TransactionsModule } from "@features/transactions-server";

@Module({
  imports: [AuthModule, TransactionsModule],
})
export class AppModule {}
```

**Before — `apps/web/app/[locale]/(auth)/sign-in/page.tsx`**:

```tsx
import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
  return <SignInForm />;
}
```

**After — `apps/web/app/[locale]/(auth)/sign-in/page.tsx`** (route
group stays; imports route through the slice):

```tsx
import { SignInForm } from "@features/auth-client";
import { signInAction } from "@features/auth-server";

export default function SignInPage() {
  return <SignInForm action={signInAction} />;
}
```

**Before — `apps/api/src/modules/auth/auth.controller.ts`**
(declared inside the monolith):

```ts
import { Controller, Post, Body } from "@nestjs/common";
import { AuthService } from "./services/auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("sign-in")
  signIn(@Body() input: unknown) {
    return this.auth.signIn(input);
  }
}
```

**After — `libs/features/auth/server/src/controllers/auth.controller.ts`**
(declared inside the slice):

```ts
import { Controller, Post, Body } from "@nestjs/common";
import { AuthService } from "../application/services/auth.service.js";
import { CreateUserInput } from "../../../shared/schemas/create-user.schema.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("sign-in")
  signIn(@Body() input: CreateUserInput) {
    return this.auth.signIn(input);
  }
}
```

The `apps/api/src/modules/auth/auth.module.ts` file is the LAST
monolith file removed — Stage 99 deletes it once the slice proves
itself.

**Done when**:

```bash
pnpm --filter apps/api build && pnpm --filter apps/web build && pnpm lint:fixtures
echo $?   # must be 0
```

{ #stage-40 }


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

## Stage 40 — port tests (Vitest + BDD)

**Goal**: move Vitest suites and Cucumber `.feature` files into the
slice's `__tests__/` and `docs/` directories without losing coverage
or scenarios.

**Inputs**: Vitest files under `src/modules/<feature>/__tests__/` and
BDD files under `src/modules/<feature>/bdd/`. The slice's
`vitest.config.ts` MUST include `../docs/__tests__/**/*.test.ts` for
the BDD bridge tests to be discovered — see architecture.md §9.5 and
the discovery gap closed by slice-8 PR #1.

**Actions**:

1. Move every `*.test.ts` from `src/modules/<feature>/__tests__/`
   into `libs/features/<feature>/server/src/__tests__/` (Vitest) or
   `libs/features/<feature>/docs/__tests__/` (BDD bridge tests).
2. Move every `*.feature` into
   `libs/features/<feature>/docs/*.feature`. Per slice-1 Locked
   Decision #3 each slice ships **4–6 `.feature` files**; create
   stubs if the monolith has fewer.
3. Move `step-defs/` into
   `libs/features/<feature>/docs/step-defs/`. Each binding is its
   own file (`common.steps.ts`, `realm.steps.ts`, etc.).
4. Add `../docs/__tests__/**/*.test.ts` to
   `libs/features/<feature>/server/vitest.config.ts` `include`.
   Without this line the BDD bridge test is silently skipped by
   `pnpm --filter @features/<feature> test`.
5. Port the BDD bridge per the **cucumber-13 callback-style
   wrapper** (architecture.md §9.2). The wrapper class
   `<Feature>WorldWrapper` exposes per-scenario `World.inner`;
   `setWorldConstructor` MUST be called from the bridge so
   cucumber's `thisArg` mechanism works.
6. Run `pnpm --filter @features/<feature> test` until GREEN; then
   `pnpm --filter @features/<feature> bdd` until all scenarios
   pass. Apply the **RED → GREEN → TRIANGULATE → REFACTOR**
   discipline (AGENTS.md §4) to every new test added during the
   port.

**Before — `src/modules/auth/__tests__/auth.service.test.ts`**:

```ts
import { AuthService } from "../services/auth.service";
import { AuthRepository } from "../infrastructure/auth.repository";

describe("AuthService", () => {
  it("verifies a password", async () => {
    const repo = new AuthRepository();
    const svc = new AuthService(repo);
    expect(await svc.verifyPassword("a@b.c", "hunter2")).toBe(true);
  });
});
```

**After — `libs/features/auth/server/src/__tests__/auth.service.test.ts`**:

```ts
import { describe, it, expect } from "vitest";
import { AuthService } from "../application/services/auth.service.js";
import { AuthRepository } from "../infrastructure/auth.repository.js";

describe("AuthService", () => {
  it("verifies a password", async () => {
    const repo = new AuthRepository();
    const svc = new AuthService(repo);
    expect(await svc.verifyPassword("a@b.c", "hunter2")).toBe(true);
  });
});
```

**Before — `apps/api/src/modules/auth/auth.steps.ts`** (bindings
live with the monolith module):

```ts
import { Given } from "@cucumber/cucumber";
import type { AuthWorld } from "./auth.world";

Given("a user with email {string}", function (email: string) {
  this.user = { email, password: "hunter2" };
});
```

**After — `libs/features/auth/docs/step-defs/common.steps.ts`**
(bindings live with the slice; the bridge re-publishes them):

```ts
import { Given } from "@cucumber/cucumber";
import type { AuthWorld } from "./world.js";

export const stepDefinitions = [
  Given("a user with email {string}", function (this: AuthWorld, email: string) {
    this.user = { email, password: "hunter2" };
  }),
  // ... 34 more entries
];
```

**Before — `src/modules/auth/auth.hooks.ts`** (legacy cucumber
bootstrap; replaced by the bridge):

```ts
import { Before } from "@cucumber/cucumber";

Before(function () {
  this.startTime = Date.now();
});
```

**After — `libs/features/auth/docs/support/register.ts`** (the
bridge file; sets up `setWorldConstructor` for the wrapper):

```ts
import { Given, When, Then, setWorldConstructor } from "@cucumber/cucumber";
import { stepDefinitions as authCommon } from "../step-defs/common.steps.js";
import { stepDefinitions as authRealm } from "../step-defs/realm.steps.js";
import { createAuthWorld, type AuthWorld } from "../step-defs/world.js";

const ALL_BINDINGS = [...authCommon, ...authRealm];

for (const { keyword, pattern, fn } of ALL_BINDINGS) {
  const register = { Given, When, Then }[keyword];
  if (!register) continue;
  register(pattern, function (this: AuthWorldWrapper, ...args: unknown[]) {
    return fn.call(this.inner, ...args);
  });
}

class AuthWorldWrapper {
  public readonly inner: AuthWorld = createAuthWorld();
}

setWorldConstructor(AuthWorldWrapper as unknown as new () => AuthWorld);

export function registerBinding(): void {
  /* bindings registered at module load */
}
```

The bridge re-publishes every entry from `ALL_BINDINGS` so
cucumber's loader sees them at startup. `AuthWorldWrapper` is the
indirection cucumber's `thisArg` mechanism requires — it carries the
per-scenario `AuthWorld` while the module-level singleton
(`service-context.ts`) keeps cross-scenario state.

**Done when**:

```bash
pnpm --filter @features/<feature> test      # all vitest PASS
pnpm --filter @features/<feature> bdd       # all cucumber PASS
```

{ #stage-50 }

## Stage 50 — update docs

**Goal**: keep `docs/architecture.md` honest about what the slice
ships, so the next person (or AI agent) does not have to reverse-
engineer the layout from fifty files.

**Inputs**: the slice from Stage 40 + `docs/architecture.md`. The
Spanish mirror under `Documents-es/docs/architecture.md` MUST ship
in the same atomic commit-or-chain (AGENTS.md §13; PR-B2 ships the
mirror).

**Actions**:

1. Read `docs/architecture.md` §2 (Repository layout) and §8
   (Slicing contract). Confirm the slice's path appears in §2 and
   the four-folder contract is reflected in §8.
2. If the slice introduced a new pattern (e.g. a new event
   category in `@core/events`), update the relevant section in the
   SAME atomic commit as the slice code.
3. If the slice uncovered a new boundary rule violation pattern,
   document the finding as an addendum to architecture.md §10.
4. If the slice needed a new `tsconfig.base.json` path alias,
   mention it in architecture.md §3 (Monorepo tooling).
5. Run the mojibake verification —
   `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture.md`
   MUST exit `1` (no match). AGENTS.md §13 enforces this contract.

**Before — `docs/architecture.md` §2** (the slice does not exist):

```text
libs/
├── core/                # database, events, config
├── features/
│   ├── auth/            # { server, shared, docs }
│   └── transactions/    # { server, shared, docs }
└── shared-utils/        # currency, date-formatting, decimal
```

**After — `docs/architecture.md` §2** (the new slice appears in the
tree):

```text
libs/
├── core/                # database, events, config
├── features/
│   ├── auth/            # { server, shared, docs }
│   ├── notifications/   # NEW — extracted from monolith via the playbook
│   └── transactions/    # { server, shared, docs }
└── shared-utils/        # currency, date-formatting, decimal
```

**Before — `docs/architecture.md` §8.4** has a placeholder for the
worked example:

```md
### 8.4 Worked example — extracting `notifications` from a monolith

_Pending. This worked example lands when the first non-auth,
non-transactions slice migrates._
```

**After — `docs/architecture.md` §8.4** documents the migration:

```md
### 8.4 Worked example — extracting `notifications` from a monolith

The `notifications` slice was migrated on 2026-07-13 following
[`docs/migration-playbook.md`](./migration-playbook.md) §1-§7.
Original tree: `apps/api/src/modules/notifications/` (4 files,
~120 LOC). Migrated tree:
`libs/features/notifications/{client,server,shared,docs}/` (16 files,
~620 LOC including the bridge test). Stages 10-50 took ~3 hours
including the bridge port. The slice's only external surface is
`@features/notifications-server`, exporting `NotificationsService`
and `NotificationsController`. The `no-cross-module-import` boundary
rule fires on any attempt to import the slice from a sibling slice
directly — consumers MUST route through `@core/events`.
```

**Before — `docs/architecture.md` §9** (BDD colocated strategy):

```md
## 9. BDD colocated strategy

The reference repo ships BDD in `libs/features/<feature>/docs/`.
The current slices are:

- `auth` — 18 scenarios across 4 `.feature` files.
- `transactions` — 25 scenarios across 5 `.feature` files.
```

**After — `docs/architecture.md` §9** (the new slice adds its
scenario count):

```md
## 9. BDD colocated strategy

The reference repo ships BDD in `libs/features/<feature>/docs/`.
The current slices are:

- `auth` — 18 scenarios across 4 `.feature` files.
- `transactions` — 25 scenarios across 5 `.feature` files.
- `notifications` — 11 scenarios across 4 `.feature` files (new).
```

**Done when**:

```bash
git diff --stat -- 'docs/architecture.md'
grep -E 'libs/features/<feature>' docs/architecture.md
echo $?   # must be 0
```

Stage 50 is the last stage PR-B1 ships. PR-B2 adds §8-§11 (Stage 99
finalize + ESLint enforcement loop + `@core/events` + glossary);
PR-C adds the seven idempotent `scripts/migrate/<stage>.sh` shells.
Until those land, treat the prose in this document as the
authoritative recipe and translate each stage into shell commands
by hand.

---

> **Next**: PR-B2 appends [§8 Stage 99 — finalize](./architecture.md#section-11)
> (the pre-PR checklist + rollback boundary), §9 (ESLint boundaries
> as the enforcement loop), §10 (when to introduce `@core/events`),
> and §11 (glossary + cross-references). PR-B2 also ships
> `Documents-es/docs/migration-playbook.md` per AGENTS.md §13.
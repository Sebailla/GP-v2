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


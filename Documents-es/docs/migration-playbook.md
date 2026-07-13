# Playbook de migración

> **Estado**: secciones 1-7 escritas en slice 8 PR-B1 (inglés).
> Las secciones 8-11 (stage 99 finalize + ESLint enforcement loop +
> `@core/events` + glosario) llegan en PR-B2. El espejo en español
> (`Documents-es/docs/migration-playbook.md`) y los siete shells
> idempotentes `scripts/migrate/<stage>.sh` aterrizan en PR-B2 y
> PR-C respectivamente.
> **Proyecto**: `gastos-personales-reference`.
> **Audiencia**: una persona revisora que necesita verificar la
> forma de la migración de extremo a extremo **y** un agente de IA
> que ejecutará la receta contra un monolito desconocido.

Este playbook es la forma ejecutable del target de migración que
`gastos-personales-reference` valida. Los shells hermanos en
`scripts/migrate/<NN>-<stage>.sh` (PR-C) realizan el mismo trabajo
de forma idempotente para un consumidor IA; este documento es la
prosa humana que explica qué hace cada shell y por qué. Cuando la
prosa de aquí y la de [`docs/architecture.md`](./architecture.md)
difieren, **gana architecture**; señalá la discrepancia en un PR.

## A quién está dirigido

- **Persona revisora**. Querés saber cómo se ve una migración
  "lista", qué evidencia produce cada stage y qué invariantes
  custodia el plugin de límites de ESLint. Leelo de arriba abajo
  con un cronómetro de 30 minutos.
- **Agente de IA**. Recibís el pedido de migrar el módulo `<feature>`
  fuera de un monolito. Corrés `scripts/migrate/00-preflight.sh`
  primero, después `10-extract-domain.sh`,
  `20-create-feature-slice.sh`, y así siguiendo, en orden. Cada
  script es idempotente: re-ejecutarlo en una rama vacía sale con
  `0` e imprime `stage NN: already applied`.

Ambas audiencias comparten una regla: **no te saltees el stage 00**.
Preflight detecta árboles sucios, herramientas faltantes y salud
de Postgres no verificada antes de mover cualquier código de
dominio.

Cada stage sigue la misma forma: **Goal**, **Inputs**, **Actions**,
**Before / after** (≥3 pares de snippets por stage según spec §8.4),
y **Done when** (el comando más chico que prueba que el stage
terminó). Los stages forman un DAG: 00 primero, 10-50 en orden
numérico contra la misma feature, 99 (PR-B2) cierra con un pase de
validación pre-PR.

{ #stage-00 }

## Stage 00 — preflight

**Goal**: confirmar que el host, el repo y la base de datos están
en el estado que el resto de los stages asume.

**Inputs**: `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, el
`package.json` raíz, y `docker-compose.yml`. El stage PUEDE
escanear el árbol de fuentes para inventariar conteos de archivos
y aristas de `import` pero NO DEBE modificar ningún archivo
trackeado.

**Actions**:

1. Leé `AGENTS.md` desde la raíz del repo. Registrá las locked
   decisions del proyecto (vertical slicing, ESLint boundaries,
   branch model).
2. Inventariá el árbol de fuentes: conteo de archivos, LOC por
   directorio raíz, grafo de imports forward (p.ej. `npx madge --json`),
   cobertura actual por módulo.
3. Decidí el orden de los slices usando el inventario: preferí
   el módulo con el **menor fan-out de dependencias** primero
   (auth suele ganar porque depende solo de `@core/database`).
4. Establecé la baseline:
   - `pnpm install --frozen-lockfile` sale con `0`.
   - `pnpm db:up && docker compose ps` muestra Postgres healthy.
   - `pnpm turbo run build lint typecheck test` sale con `0`.
   - `pnpm lint:fixtures` sale con `0`.
5. Registrá la baseline en un archivo scratch
   `MIGRATION-<feature>.md` (gitignored está bien — es un
   artefacto de un solo uso).

**Before — `pnpm turbo run build lint typecheck test`** en una
rama limpia:

```text
 Tasks:    5 successful, 5 total
Cached:    0 cached, 5 total
  Time:    4.871s
```

**After — el mismo comando, registrado como baseline**:

```text
# baseline.txt
# 2026-07-13T14:22:00Z
# Tasks:    5 successful, 5 total
# Cached:    0 cached, 5 total
#   Time:    4.871s
```

**Before — `apps/api/src/app.module.ts`** (bolsa típica de módulos
del monolito):

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

**After — el mismo archivo, con la etiqueta de migración anotada**
(sin cambio de código todavía; el stage 00 es read-only):

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

**Before — `find src -name '*.ts' | wc -l`** (registra el conteo
inicial de archivos):

```text
382
```

**After — `MIGRATION-<feature>.md`** (el archivo scratch captura
el inventario que produce el stage 00):

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
echo $?   # debe ser 0
```

Si la baseline NO es verde, arreglala antes del stage 10. Migrar
contra una baseline roja mueve código roto y produce slices rotos.

{ #stage-10 }

## Stage 10 — extract domain

**Goal**: mover la capa de dominio de `<feature>` desde
`src/modules/<feature>/` a `libs/features/<feature>/server/src/`
sin cambiar la semántica.

**Inputs**: código de dominio fuente de verdad bajo
`src/modules/<feature>/{domain,application,infrastructure}/`. La
regla de límite `no-prisma-outside-core`
(`tools/eslint-plugin-boundary/rules/no-prisma-outside-core.cjs`)
va a rechazar cualquier `new PrismaClient()` nuevo fuera de
`@core/database`.

**Actions**:

1. Creá `libs/features/<feature>/server/src/` (vacío).
2. Mové `domain/`, `application/` e `infrastructure/` desde
   `src/modules/<feature>/` a `server/src/`. Preservá el árbol.
3. Reescribí cada `from "@/lib/prisma"` y `new PrismaClient()` a
   `from "@core/database"`. La regla de límite dispara sobre
   `new PrismaClient()` *en cualquier parte*; la migración enruta
   por el barrel.
4. Mové cada literal de esquema Zod a
   `libs/features/<feature>/shared/schemas/` y re-importá desde
   ahí. La regla `no-schemas-outside-shared` prohíbe literales
   `z.object(...)`, `z.string(...)` fuera de esa carpeta o de
   `libs/core/config/env.schema.ts`.
5. Re-corré `pnpm turbo run build lint typecheck test`; lint DEBE
   salir con `0`. Si no, el plugin de límites atrapó un
   `PrismaClient` o un literal de esquema olvidado.

**Before — `src/modules/auth/domain/user.entity.ts`** (entidad de
dominio acoplada a un import local de Prisma):

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
(desacoplado — el slice habla con `@core/database`):

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
(el literal se mueve a `shared/schemas/`; el call site re-exporta):

```ts
import { z } from "zod";

export const CreateUserInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export type CreateUserInput = z.infer<typeof CreateUserInput>;
```

El `application/dto/create-user.input.ts` después del stage 10
re-exporta desde la ubicación compartida:

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
echo $?   # debe ser 0
```

El stage 10 termina con el código de dominio del slice viviendo
en `libs/features/<feature>/server/src/`, importando Prisma a
través de `@core/database`, e importando esquemas Zod desde la
carpeta de esquemas compartidos. Los exports aún NO están
cableados en los aliases de `tsconfig.base.json`; el stage 20 lo
hace.

{ #stage-20 }

## Stage 20 — create feature slice

**Goal**: scaffoldear el contrato de cuatro carpetas (`client/`,
`server/`, `shared/`, `docs/`) para el slice y agregar `package.json`,
`tsconfig.json` y un barrel público a cada uno.

**Inputs**: el código de dominio movido en el stage 10.

**Actions**:

1. Creá las cuatro carpetas:
   `libs/features/<feature>/{client,server,shared}/src/` y
   `libs/features/<feature>/docs/`.
2. Para cada uno de `client/`, `server/`, `shared/` scaffoldeá:
   - `package.json` con `name: "@features/<feature>-<role>"`,
     `private: true`, `exports` → `./src/index.ts`.
   - `tsconfig.json` extendiendo `../../../../tsconfig.base.json`
     con `composite: true` (Turbo rastrea el orden de build vía
     project references).
   - `src/index.ts` — el barrel público (según architecture.md §8.3
     el barrel ES el API).
3. Agregá `libs/features/<feature>/docs/cucumber.mjs` y un
   directorio vacío `docs/__tests__/`; ambos vienen gratis acá
   aunque el stage 40 los puebla.
4. Agregá `@features/<feature>` y los tres sub-paquetes de rol a
   `compilerOptions.paths` en `tsconfig.base.json`.
5. Verificá que las reglas `no-prisma-outside-core` y
   `no-schemas-outside-shared` sigan pasando.

**Before — `libs/features/auth/` no tiene la forma de cuatro
carpetas**:

```text
libs/features/auth/
└── README.md
```

**After — `libs/features/auth/` sigue el contrato de cuatro
carpetas**:

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

**Before — `tsconfig.base.json`** no incluye `@features/auth/*`:

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

**After — `tsconfig.base.json`** declara los cuatro sub-paquetes:

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

**Before — `libs/features/auth/server/src/index.ts`** (vacío):

```ts
export {};
```

**After — `libs/features/auth/server/src/index.ts`** (el barrel
público, mantenido a mano):

```ts
export { AuthService } from "./application/services/auth.service.js";
export { AuthRepository } from "./infrastructure/auth.repository.js";
export { AuthController } from "./controllers/auth.controller.js";
export type { UserEntity } from "./domain/user.entity.js";
```

Cualquier cosa NO exportada desde este archivo es interna al slice
y no está cubierta por el contrato público; importarla directamente
es una violación de `no-cross-module-import` según AGENTS.md §7.

**Done when**:

```bash
pnpm install --frozen-lockfile
pnpm --filter @features/auth-server build
pnpm lint:fixtures
echo $?   # debe ser 0
```

{ #stage-30 }

## Stage 30 — wire routes

**Goal**: hacer que el slice sea alcanzable desde `apps/api` (NestJS)
y `apps/web` (Next.js) a través de las convenciones de módulo
establecidas.

**Inputs**: el slice de cuatro carpetas del stage 20.

**Actions**:

1. **NestJS**: en `apps/api/src/app.module.ts`, reemplazá
   `import { AuthModule } from "./modules/auth/auth.module"` por
   `import { AuthModule } from "@features/auth-server"`. La
   convención de módulo-por-feature de NestJS se mantiene: el
   slice exporta un módulo de NestJS que la app de API importa.
2. **Next.js**: en `apps/web/`, creá el route group
   `apps/web/app/[locale]/(<feature>)/` si no existe. Los server
   components importan desde `@features/<feature>-server` (server
   actions) y `@features/<feature>-client` (client components).
3. La regla de límite `no-client-server-import` dispara cuando
   `libs/features/<feature>/client/*` importa desde rutas
   `*/server/*`. Las rutas en `apps/web/` NO están dentro de
   `libs/features/<feature>/`, así que la regla no aplica a ellas.

**Before — `apps/api/src/app.module.ts`** (importa el módulo auth
del monolito):

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { TransactionsModule } from "./modules/transactions/transactions.module";

@Module({
  imports: [AuthModule, TransactionsModule],
})
export class AppModule {}
```

**After — `apps/api/src/app.module.ts`** (importa el módulo NestJS
del slice):

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

**After — `apps/web/app/[locale]/(auth)/sign-in/page.tsx`** (el
route group se mantiene; los imports enrutan por el slice):

```tsx
import { SignInForm } from "@features/auth-client";
import { signInAction } from "@features/auth-server";

export default function SignInPage() {
  return <SignInForm action={signInAction} />;
}
```

**Before — `apps/api/src/modules/auth/auth.controller.ts`**
(declarado dentro del monolito):

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
(declarado dentro del slice):

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

El archivo `apps/api/src/modules/auth/auth.module.ts` es el ÚLTIMO
archivo del monolito en eliminarse — el stage 99 lo borra una vez
que el slice se prueba a sí mismo.

**Done when**:

```bash
pnpm --filter apps/api build && pnpm --filter apps/web build && pnpm lint:fixtures
echo $?   # debe ser 0
```

{ #stage-40 }

## Stage 40 — port tests (Vitest + BDD)

**Goal**: mover las suites de Vitest y los archivos `.feature` de
Cucumber a los directorios `__tests__/` y `docs/` del slice sin
perder cobertura ni escenarios.

**Inputs**: archivos de Vitest bajo `src/modules/<feature>/__tests__/`
y archivos de BDD bajo `src/modules/<feature>/bdd/`. El
`vitest.config.ts` del slice DEBE incluir
`../docs/__tests__/**/*.test.ts` para que los tests del bridge de
BDD sean descubiertos — ver architecture.md §9.5 y el gap de
discovery que cerró slice-8 PR #1.

**Actions**:

1. Mové cada `*.test.ts` desde `src/modules/<feature>/__tests__/`
   a `libs/features/<feature>/server/src/__tests__/` (Vitest) o
   `libs/features/<feature>/docs/__tests__/` (tests del bridge
   de BDD).
2. Mové cada `*.feature` a
   `libs/features/<feature>/docs/*.feature`. Según la Locked
   Decision #3 de slice 1 cada slice entrega **4–6 archivos
   `.feature`**; creá stubs si el monolito tiene menos.
3. Mové `step-defs/` a
   `libs/features/<feature>/docs/step-defs/`. Cada binding es su
   propio archivo (`common.steps.ts`, `realm.steps.ts`, etc.).
4. Agregá `../docs/__tests__/**/*.test.ts` al `include` de
   `libs/features/<feature>/server/vitest.config.ts`. Sin esta
   línea el test del bridge de BDD queda silenciosamente skipeado
   por `pnpm --filter @features/<feature> test`.
5. Portá el bridge de BDD según el **wrapper cucumber-13
   callback-style** (architecture.md §9.2). La clase wrapper
   `<Feature>WorldWrapper` expone `World.inner` por escenario;
   `setWorldConstructor` DEBE llamarse desde el bridge para que
   el mecanismo de `thisArg` de cucumber funcione.
6. Corré `pnpm --filter @features/<feature> test` hasta GREEN;
   después `pnpm --filter @features/<feature> bdd` hasta que
   todos los escenarios pasen. Aplicá la disciplina **RED →
   GREEN → TRIANGULATE → REFACTOR** (AGENTS.md §4) a cada test
   nuevo que se agregue durante el port.

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

**Before — `apps/api/src/modules/auth/auth.steps.ts`** (los
bindings viven con el módulo del monolito):

```ts
import { Given } from "@cucumber/cucumber";
import type { AuthWorld } from "./auth.world";

Given("a user with email {string}", function (email: string) {
  this.user = { email, password: "hunter2" };
});
```

**After — `libs/features/auth/docs/step-defs/common.steps.ts`**
(los bindings viven con el slice; el bridge los re-publica):

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

**Before — `src/modules/auth/auth.hooks.ts`** (bootstrap legacy de
cucumber; reemplazado por el bridge):

```ts
import { Before } from "@cucumber/cucumber";

Before(function () {
  this.startTime = Date.now();
});
```

**After — `libs/features/auth/docs/support/register.ts`** (el
archivo del bridge; configura `setWorldConstructor` para el
wrapper):

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

El bridge re-publica cada entrada de `ALL_BINDINGS` para que el
loader de cucumber las vea al arrancar. `AuthWorldWrapper` es la
indirección que requiere el mecanismo de `thisArg` de cucumber —
lleva el `AuthWorld` por escenario mientras el singleton a nivel
de módulo (`service-context.ts`) mantiene el estado cross-scenario.

**Done when**:

```bash
pnpm --filter @features/<feature> test      # todo vitest PASS
pnpm --filter @features/<feature> bdd       # todo cucumber PASS
```

{ #stage-50 }

## Stage 50 — update docs

**Goal**: mantener a `docs/architecture.md` honesto sobre lo que
entrega el slice, así la próxima persona (o agente de IA) no tiene
que hacer reverse-engineering del layout a partir de cincuenta
archivos.

**Inputs**: el slice del stage 40 + `docs/architecture.md`. El
espejo en español bajo `Documents-es/docs/architecture.md` DEBE
entregarse en el mismo commit-o-cadena atómica (AGENTS.md §13;
PR-B2 entrega el espejo).

**Actions**:

1. Leé `docs/architecture.md` §2 (Repository layout) y §8
   (Slicing contract). Confirmá que el path del slice aparezca en
   §2 y que el contrato de cuatro carpetas esté reflejado en §8.
2. Si el slice introdujo un patrón nuevo (p.ej. una nueva categoría
   de eventos en `@core/events`), actualizá la sección relevante
   en el MISMO commit atómico que el código del slice.
3. Si el slice descubrió un nuevo patrón de violación de reglas
   de límite, documentá el hallazgo como adenda al §10 de
   architecture.md.
4. Si el slice necesitó un nuevo alias de path en
   `tsconfig.base.json`, mencionalo en el §3 de architecture.md
   (Monorepo tooling).
5. Corré la verificación de mojibake —
   `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture.md`
   DEBE salir con `1` (sin match). AGENTS.md §13 enforcea este
   contrato.

**Before — `docs/architecture.md` §2** (el slice no existe):

```text
libs/
├── core/                # database, events, config
├── features/
│   ├── auth/            # { server, shared, docs }
│   └── transactions/    # { server, shared, docs }
└── shared-utils/        # currency, date-formatting, decimal
```

**After — `docs/architecture.md` §2** (el nuevo slice aparece en
el árbol):

```text
libs/
├── core/                # database, events, config
├── features/
│   ├── auth/            # { server, shared, docs }
│   ├── notifications/   # NEW — extracted from monolith via the playbook
│   └── transactions/    # { server, shared, docs }
└── shared-utils/        # currency, date-formatting, decimal
```

**Before — `docs/architecture.md` §8.4** tiene un placeholder para
el worked example:

```md
### 8.4 Worked example — extracting `notifications` from a monolith

_Pending. This worked example lands when the first non-auth,
non-transactions slice migrates._
```

**After — `docs/architecture.md` §8.4** documenta la migración:

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

**After — `docs/architecture.md` §9** (el nuevo slice suma su
conteo de escenarios):

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
echo $?   # debe ser 0
```

El stage 50 es el último stage que entrega PR-B1. PR-B2 agrega
§8-§11 (Stage 99 finalize + ESLint enforcement loop + `@core/events`
+ glosario); PR-C agrega los siete shells idempotentes
`scripts/migrate/<stage>.sh`. Hasta que esos aterricen, tratá la
prosa de este documento como la receta autoritativa y traducí cada
stage a comandos de shell a mano.

---

{ #stage-99 }

## Stage 99 — finalize

**Goal**: probar que el slice es entregable de extremo a extremo,
capturar la traza de artefactos que la persona revisora necesita,
y remover el último residuo del monolito para que la próxima
migración arranque en un árbol limpio.

**Inputs**: el slice de los stages 10-50, los siete shells
`scripts/migrate/<stage>.sh` de PR-C, y la rama `develop`
upstream (el target del squash-merge).

**Actions**:

1. Corré la gate completa localmente sobre un clon limpio de la
   rama de feature. Cada comando DEBE salir con `0` antes de abrir
   el PR:

   ```bash
   pnpm install --frozen-lockfile
   pnpm db:up && docker compose ps             # Postgres healthy
   pnpm turbo run build lint typecheck test bdd
   pnpm lint:fixtures
   ```

2. Actualizá [`docs/architecture.md`](./architecture.md) §6
   **Slice inventory** con el nuevo slice: nombre, path de cuatro
   carpetas, contenidos del barrel público, conteo de escenarios
   BDD. El espejo en español bajo
   `Documents-es/docs/architecture.md` DEBE llevar la misma fila
   en el mismo commit (AGENTS.md §13 regla dura).
3. Tageá el release. Las adiciones de slice bumpean el segmento
   **minor** porque introducen una nueva superficie pública
   (`@features/<feature>-server` et al.); el formato es
   `vN.M.<X+1>`:

   ```bash
   git tag -a v1.1.<X+1> -m "feat: add <feature> slice (slice 8 PR-B2)"
   git push origin v1.1.<X+1>
   ```

4. Borrá la rama de migración cuando el PR mergea. El trabajo de
   la rama terminó; el slice vive en `develop` vía el
   squash-merge:

   ```bash
   git push origin --delete feat/migrate-<feature>-v1
   git branch -d feat/migrate-<feature>-v1
   ```

5. Archivá la carpeta del cambio de OpenSpec. Mové
   `openspec/changes/<change-id>/` a
   `openspec/changes/.archive/YYYY-MM-DD-<change-id>/` una vez
   que el cambio entrega — el orchestrator hace esto después del
   squash-merge a `develop` (ver `sdd-archive`).

**Before — output de terminal de
`pnpm turbo run build lint typecheck test`** en la rama del slice
(una línea de task por workspace):

```text
  × Extend ⇢ pnpm turbo run build lint typecheck test
  Tasks:    7 successful, 7 total
Cached:    0 cached, 7 total
  Time:    9.412s
```

**After — el mismo comando** después de que corre la gate pre-PR
del stage 99 sobre la rama del slice (notá que el nuevo slice
suma un workspace al task list):

```text
  × Extend ⇢ pnpm turbo run build lint typecheck test
  Tasks:    8 successful, 8 total
Cached:    0 cached, 8 total
  Time:   11.084s
```

**Before — `docs/architecture.md` §6 (Slice inventory)** antes del
tag de release:

```md
| Slice         | Public barrel                                | BDD |
|---------------|----------------------------------------------|-----|
| auth          | @features/auth-server                        | 18  |
| transactions  | @features/transactions-server                | 25  |
```

**After — `docs/architecture.md` §6 (Slice inventory)** una vez
que el slice aterriza:

```md
| Slice         | Public barrel                                | BDD |
|---------------|----------------------------------------------|-----|
| auth          | @features/auth-server                        | 18  |
| transactions  | @features/transactions-server                | 25  |
| notifications | @features/notifications-server               | 11  |
```

**Before — `apps/api/src/modules/notifications/notifications.module.ts`**
(el último archivo del monolito de esta migración, todavía
presente en el repo):

```ts
import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
```

**After — `git rm apps/api/src/modules/notifications/`** (el stage
99 remueve el residuo del monolito; `app.module.ts` ya no lo
importa):

```text
$ git rm -r apps/api/src/modules/notifications/
rm 'apps/api/src/modules/notifications/notifications.controller.ts'
rm 'apps/api/src/modules/notifications/notifications.module.ts'
rm 'apps/api/src/modules/notifications/notifications.service.ts'

$ grep -n NotificationsModule apps/api/src/app.module.ts || echo "no-monolith-import"
no-monolith-import
```

**Before — `git tag`** (todavía no existe un tag de release del
slice):

```text
v1.0.0
v1.0.1
v1.1.0
v1.1.1
```

**After — `git tag`** después de que el stage 99 tagea el release:

```text
v1.0.0
v1.0.1
v1.1.0
v1.1.1
v1.1.2
```

**Done when**:

```bash
pnpm turbo run build lint typecheck test bdd && pnpm lint:fixtures
echo $?   # debe ser 0
```

Si alguna gate falla, **pará**. NO tagees, NO abras el PR. Arreglá
la falla en la rama de feature, pusheá de nuevo, y re-corré la
gate. El slice es entregable solo cuando cada comando sale con
`0`.

---

{ #eslint-enforcement-loop }

## ESLint boundaries como el enforcement loop

**Goal**: hacer que las cuatro reglas de límite sean la única
fuente de verdad que evita que la migración regrese silenciosamente.
Una persona revisora nunca debería tener que preguntar "¿este PR
mantiene la arquitectura honesta?" — el plugin de límites
responde la pregunta en tiempo de lint.

Las cuatro reglas que entregan hoy
([`tools/eslint-plugin-boundary/`](../../tools/eslint-plugin-boundary/))
cubren cada invariante cross-cutting que toca la migración:

| Regla                          | Qué prohíbe                                                              | Dónde vive la regla                                                          |
|--------------------------------|--------------------------------------------------------------------------|------------------------------------------------------------------------------|
| `no-prisma-outside-core`       | `new PrismaClient()` en cualquier parte excepto `libs/core/database/src/` | `tools/eslint-plugin-boundary/rules/no-prisma-outside-core.cjs`               |
| `no-schemas-outside-shared`    | Literal Zod (`z.object(...)`, `z.string(...)`) fuera de `*/shared/schemas/` y `libs/core/config/env.schema.ts` | `tools/eslint-plugin-boundary/rules/no-schemas-outside-shared.cjs`            |
| `no-client-server-import`      | `libs/features/<x>/client/*` importando desde paths `*/server/*`         | `tools/eslint-plugin-boundary/rules/no-client-server-import.cjs`              |
| `no-cross-module-import`       | `libs/features/<x>/...` importando directo desde `libs/features/<y>/...` | `tools/eslint-plugin-boundary/rules/no-cross-module-import.cjs`               |
| `no-mojibake-in-docs`          | Codepoints CJK / ideográficos en `Documents-es/**/*.md`                  | `tools/eslint-plugin-boundary/rules/no-mojibake-in-docs.cjs` (slice 8 PR-3)   |

`pnpm lint:fixtures` es la gate que prueba que cada regla
**dispara sobre su fixture `invalid.{ts,md}`** y **se queda
callada sobre su `valid.{ts,md}`**. Slice 8 PR-3 cableó el parser
de markdown para que la regla de mojibake dispare sobre archivos
`.md`; el runner también globea `Documents-es/**/*.md` de
producción y asserta CJK-free en cada PR. La gate DEBE salir con
`0` antes de que cualquier PR de migración pueda aterrizar.

**Cuándo agregar una nueva regla de límite**: una regla nueva se
gana su lugar cuando el mismo ciclo de fix-o-revert PR se repite
tres veces para la misma clase de import. El patrón se ve así en
review:

1. PR-1 entrega una feature que importa entre slices directamente.
2. PR-2 agrega el mismo tipo de import.
3. PR-3 (o el auditor de migración) lo vuelve a flaggear.

En ese punto la regla deja de ser "gusto de la persona revisora" y
se vuelve "infraestructura". Presentá un decision record estilo
ADR chico bajo `docs/architecture/decisions/` (o bajo
`openspec/changes/<id>/design.md` si la regla aterriza en el mismo
cambio), agregá la regla bajo
`tools/eslint-plugin-boundary/rules/`, escribí el par
`valid.{ts,md}` + `invalid.{ts,md}` bajo
`tools/eslint-plugin-boundary/__fixtures__/`, y registrá la regla
en `tools/eslint-plugin-boundary/index.cjs`. El runner de fixtures
la levanta automáticamente.

**Worked example — extraer un slice `notifications`** (este
ejemplo es hipotético; precede a la migración real de
`notifications`):

```text
MIGRATION: notifications (from apps/api/src/modules/notifications/)
SLICE:      libs/features/notifications/{client,server,shared,docs}/

Stage 00 → preflight: baseline green on develop.
Stage 10 → move src/modules/notifications/{domain,application,infrastructure}
           into libs/features/notifications/server/src/.
           Fix every `new PrismaClient()` → `import { prisma } from "@core/database"`.
           no-prisma-outside-core fires 3 times during the port; each one is a fix.
Stage 20 → scaffold the four folders; add path aliases.
Stage 30 → wire `apps/api/src/app.module.ts` to `@features/notifications-server`;
           wire `apps/web/app/[locale]/(notifications)/...` to the client barrel.
Stage 40 → port Vitest + 11 Cucumber scenarios; add the bridge wrapper
           mirroring the auth slice (slice 8 PR-1 pattern).
Stage 50 → add §6 row to docs/architecture.md; mirror to Documents-es/.
Stage 99 → run all gates; tag v1.1.2; archive the change folder.
```

Si, en medio de la migración, te encontrás queriendo un import
directo `notifications-client → auth-server`, **pará**. Ese import
es lo que la regla de límite prohíbe; enrutá por `@core/events`
(ver §10) o por un port compartido bajo `libs/core/`. La regla
es el diseño, no una cerca.

---

{ #core-events }

## Cuándo introducir `@core/events`

**Goal**: darle a los slices un canal único, async-friendly, para
efectos secundarios cross-module, así las reglas de límite en §9
se mantienen enforceables. Los imports cross-slice directos están
prohibidos por `no-cross-module-import`; los eventos son la única
puerta de escape sancionada.

El canal de eventos vive en `libs/core/events/`. Es una superficie
delgada de port-and-adapter: los slices **emiten** eventos
tipados vía `emitEvent(name, payload)`, y otros slices **se
suscriben** vía `onEvent(name, handler)`. El transporte es
in-process hoy (no Redis, no Kafka — esos están explícitamente
fuera de scope según AGENTS.md §11) pero la interfaz está
formada para que un futuro bus adapter sea drop-in.

El **catálogo de 9 eventos** que entrega hoy (Locked Decision #5
de slice 1 + adiciones de slice 4) es el contrato. Cada evento
declara un payload tipado y un slice dueño:

| Nombre del evento                 | Slice dueño    | Payload (resumen)                                            | Consumidores (típicos)        |
|-----------------------------------|----------------|--------------------------------------------------------------|-------------------------------|
| `auth.user.signed-up`             | `auth`         | `{ userId, email, locale }`                                   | `notifications`, `transactions`|
| `auth.session.created`            | `auth`         | `{ sessionId, userId, expiresAt }`                           | `notifications` (audit trail)  |
| `auth.password.reset.requested`   | `auth`         | `{ userId, resetToken, expiresAt }`                          | `notifications`               |
| `auth.password.reset.completed`   | `auth`         | `{ userId, completedAt }`                                    | `notifications`               |
| `transactions.created`            | `transactions` | `{ transactionId, userId, amount, currency, categoryId }`    | `notifications`, `auth`        |
| `transactions.updated`            | `transactions` | `{ transactionId, userId, diff, at }`                        | `notifications`               |
| `transactions.deleted`            | `transactions` | `{ transactionId, userId, at }`                              | `notifications`               |
| `transactions.threshold.crossed`  | `transactions` | `{ userId, thresholdId, month, total, currency }`            | `notifications`               |
| `transactions.fxrate.updated`     | `transactions` | `{ baseCurrency, quoteCurrency, rate, at }`                  | (ninguno hoy; consumidores futuros) |

**Cuándo agregar un evento nuevo**: cuando un slice no dueño
pregunta "necesito reaccionar a `<X>`", y la respuesta es "sí,
pero no via un import directo". El consumidor pide el evento a
través del port de eventos (`@core/events`), el slice dueño suma
el evento a su catálogo, y ambos lados compilan contra el payload
tipado. La regla de límite se queda verde; la integración se
queda loose.

**Worked example — `transactions.created` consumido por
`notifications`**:

```ts
// libs/features/transactions/server/src/application/services/transaction.service.ts
import { emitEvent } from "@core/events";

export class TransactionService {
  async create(input: CreateTransactionInput): Promise<Transaction> {
    const tx = await this.repo.create(input);
    emitEvent("transactions.created", {
      transactionId: tx.id,
      userId: tx.userId,
      amount: tx.amount,
      currency: tx.currency,
      categoryId: tx.categoryId,
    });
    return tx;
  }
}
```

```ts
// libs/features/notifications/server/src/application/services/notification.service.ts
import { onEvent } from "@core/events";

export class NotificationsService {
  init(): void {
    onEvent("transactions.created", async (payload) => {
      await this.deliver({
        userId: payload.userId,
        template: "transaction.created",
        data: { amount: payload.amount, currency: payload.currency },
      });
    });
  }
}
```

`notifications` nunca importa desde `transactions`; `transactions`
nunca importa desde `notifications`. El port de eventos es el
único handshake. Si surge una necesidad futura de respuesta
sincrónica (la creación de transaction debería **fallar** si el
sistema de notificaciones está caído), revisitá este contrato bajo
un nuevo ADR — las llamadas cross-slice síncronas reabren el
acoplamiento que los eventos cierran.

---

{ #glossary }

## Cross-references + glossary

### Glossary

| Término                       | Definición                                                                                                                       |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| **Slice**                     | Un único módulo de feature bajo `libs/features/<x>/`; la unidad vertical de la arquitectura.                                     |
| **Feature module**            | La forma de cuatro carpetas (`client/`, `server/`, `shared/`, `docs/`) que cada slice entrega.                                    |
| **Bridge**                    | El archivo `docs/support/register.ts` que re-publica cada binding de Cucumber en los registros `Given`/`When`/`Then` de cucumber; setea `setWorldConstructor(<Feature>WorldWrapper)`. |
| **BDD**                       | Behaviour-Driven Development — acá, escenarios de Cucumber colocalizados con cada slice bajo `docs/*.feature`.                   |
| **RED → GREEN → TRIANGULATE → REFACTOR** | El ciclo de TDD (AGENTS.md §4). RED: existe un test que falla. GREEN: mínimo código para pasar. TRIANGULATE: más casos pinean el comportamiento de borde. REFACTOR: limpieza sin cambiar comportamiento. |
| **Mojibake**                  | Codepoints CJK / ideográficos sueltos en `Documents-es/**/*.md` (drift de auto-traducción). La regla `no-mojibake-in-docs` dispara en cada hit. |
| **`fn.length`**               | `Function.prototype.length` de JavaScript — el conteo de parámetros **declarados** antes del primer default o rest. El wrapper de cucumber-13 depende de que esto coincida exactamente con el conteo de capturas del binding. |
| **Arity-matched wrapper**     | Una función cuyo `fn.length` es igual al `argsArray.length` del binding de cucumber; cualquier otra cosa dispara el error de dual-interface de cucumber 13. |
| **`@core/events`**            | La superficie de port-and-adapter en `libs/core/events/` que es el único camino sancionado para efectos secundarios cross-slice. |
| **Tracker branch**            | La rama `feat/<change-name>` que gatea un set de PRs de SDD encadenados; los hijos targetean el tracker, el tracker targetea `develop`. |
| **Slice inventory**           | La tabla del §6 de `docs/architecture.md` que lista cada slice entregado, su barrel público y su conteo de escenarios BDD.          |

### Cross-references

- [`docs/architecture.md`](./architecture.md) — la fuente de
  verdad del layout al que apunta este playbook. Las secciones 2
  (Repository layout), 8 (Slicing contract), 9 (BDD colocated
  strategy), 10 (ESLint boundaries) y 11 (Branch model + SDD
  workflow) son las partes contra las que opera el playbook.
- `openspec/changes/vertical-slicing-reference-scaffold/proposal.md`
  — la propuesta umbrella de slice 1; las Locked Decisions #4
  (formato dual del playbook) y #5 (catálogo de 9 eventos) son
  los contratos upstream que honra este playbook.
- `openspec/changes/vertical-slicing-reference-scaffold/design.md`
  §3.4 — la tabla selectora de las boundary rules; §4 (los
  diseños originales de los slices `auth` y `transactions`).
- `openspec/changes/slice-8-closing-bdd-and-docs/proposal.md`,
  `spec.md`, `design.md`, `tasks.md` — el cambio que entregó este
  playbook (PR-B1 escribió §1-§7, PR-B2 escribió §8-§11 + el
  espejo en español, PR-C entrega los siete shells).
- [AGENTS.md §13](../../AGENTS.md#13-spanish-mirror-hard-rule) —
  la regla dura del espejo en español que obedece el espejo de
  este documento.
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — las convenciones de
  naming de branches y conventional-commit referenciadas por el
  stage 99 y la disciplina de work-unit commit.
- Los siete shells idempotentes: `scripts/migrate/00-preflight.sh`,
  `10-extract-domain.sh`, `20-create-feature-slice.sh`,
  `30-wire-routes.sh`, `40-port-tests.sh`, `50-update-docs.sh`,
  `99-finalize.sh`. PR-C los entrega.
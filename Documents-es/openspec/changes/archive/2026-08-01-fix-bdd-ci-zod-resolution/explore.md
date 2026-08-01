# Exploración — `fix-bdd-ci-zod-resolution`

> **Tema**: Resolver la falla latente `apps/api#build` TS2307 `Cannot find module 'zod'` que bloquea el gate BDD (Cucumber) CI en `develop`.
>
> **Disparador**: PR #63 (`fix-bdd-tsx-node22`) fue mergeada con bypass del gate BDD. Los escenarios BDD pasan (43/43 en el log del propio CI fallido), pero `pnpm turbo run bdd` depende de `build`, y `api#build` cae con TS2307. Ver Engram #2316 (verify report) y #2318 (archive decision).
>
> **Modo**: `hybrid` (filesystem + Engram). Persistencia: AMBOS requeridos según `openspec/config.yaml` §"Artifact store".

---

## 1. Causa raíz (CONFIRMADA con evidencia)

**El bug latente**: `apps/api/tsconfig.json` compila `apps/api/src/**/*.ts` Y `../libs/features/{auth,transactions}/shared/schemas/**/*.ts` (líneas 38-39). Ambos conjuntos de archivos importan `zod`. La `moduleResolution: "node"` de TypeScript (Node10 — establecida en `apps/api/tsconfig.json:5`) sube por el árbol de directorios desde la ubicación de cada archivo compilado buscando un symlink `node_modules/zod`.

**El problema del directorio huérfano**: Los archivos de schemas viven en `libs/features/{auth,transactions}/shared/schemas/*.ts`. El directorio padre `libs/features/{auth,transactions}/shared/` NO contiene `package.json` ni `node_modules/`. El workspace package más cercano es `libs/features/{auth,transactions}/server/`, que SÍ tiene `zod` linkeado en su propio `node_modules/zod` — pero TypeScript NO busca en hermanos, solo en ancestros.

Entonces, cuando TypeScript compila `libs/features/auth/shared/schemas/login.ts`, sube por:
- `libs/features/auth/shared/schemas/node_modules/` — **falta**
- `libs/features/auth/shared/node_modules/` — **falta**
- `libs/features/auth/node_modules/` — **falta**
- `libs/features/node_modules/` — **falta**
- `libs/node_modules/` — **falta**
- `gastos-personales-reference/node_modules/` — **falta** (la raíz solo hoistea devDeps de raíz: turbo, tsx, prettier, typescript; zod no está declarado en la raíz)
- ... sigue subiendo hasta la raíz del filesystem ...

**Por qué funciona LOCALMENTE (verificado)**:
Una instalación previa de pnpm en esta máquina creó `/Users/sebailla/node_modules/zod` (un symlink a `/Users/sebailla/node_modules/.pnpm/zod@4.4.3/...`) — contaminación de otro proyecto. TypeScript sube PASANDO la raíz del proyecto y encuentra zod en el HOME del usuario. **Esto enmascara el bug localmente.**

**Reproducido** (con `pnpm install --frozen-lockfile` y la contaminación del HOME temporalmente movida):
```
apps/api/src/modules/auth/auth.controller.ts(78,43): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
apps/api/src/modules/auth/auth.controller.ts(81,11): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
apps/api/src/shared/decorators/body.decorator.ts(2,24): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
apps/api/src/shared/decorators/query.decorator.ts(2,24): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
apps/api/src/shared/pipes/zod-validation.pipe.ts(3,24): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
../../libs/features/auth/shared/schemas/forgot-password.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
../../libs/features/auth/shared/schemas/login.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
../../libs/features/auth/shared/schemas/register.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
../../libs/features/auth/shared/schemas/reset-password.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
../../libs/features/auth/shared/schemas/session-list.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
```

**Por qué falla en CI**: El runner de GitHub Actions es `/home/runner/work/.../gastos-personales-reference/...`. No hay `/home/runner/node_modules/zod`. TypeScript sube pasando la raíz del proyecto, llega a `/home/runner/work/.../node_modules/` (ninguno), `/home/runner/node_modules/` (ninguno), `/node_modules/` (ninguno en Linux sin instalación global), y TS2307 se dispara.

**Por qué la hipótesis del verify report ("pnpm hoisting differs") estaba incompleta**: pnpm SÍ está hoisteando zod correctamente a `.pnpm/zod@4.4.3/...` y al `node_modules` a nivel de paquete de cada paquete que declara zod (`libs/core/config`, `libs/core/events`, `libs/features/auth/server`, `libs/features/transactions/server`). Pero pnpm NO crea `apps/api/node_modules/zod` porque zod está en `devDependencies` de `apps/api`, Y el comportamiento del isolated-linker de pnpm 11 para devDeps en node_modules de apps/api es package-relative, no file-relative. Aún más importante: incluso si pnpm SÍ lo linkeara, la resolución Node10 de TypeScript desde la ubicación del archivo de schema no lo vería porque TypeScript sube por ancestros, no por el contexto del paquete entry-point. **El layout de directorio huérfano es la causa raíz arquitectónica, no la estrategia de hoist de pnpm.**

**Por qué no falla para `apps/api/src/*.ts` localmente**: Misma subida Node10. Desde `apps/api/src/modules/auth/auth.controller.ts`, sube a `apps/api/node_modules/` (falta el symlink de zod), luego a `apps/api/node_modules/` (sigue sin zod), luego sube por el árbol — y encuentra zod en la contaminación del HOME. Mismo mecanismo de enmascaramiento.

**Por qué apps/web compila bien**: `apps/web/tsconfig.json` usa `moduleResolution: "Bundler"`, que es mucho más permisivo (confía en la resolución del grafo de paquetes, no en subidas por árbol de archivos). La resolución Bundler ve `@hookform/resolvers/zod` (declarado en `apps/web/package.json`) y encuentra zod 3.24.1 vía el grafo de deps. Además, `apps/web` declara zod como `dependency` (no devDep) en `apps/web/package.json:204`, así que SÍ está en `apps/web/node_modules/zod`.

**Conclusión**: El fix mínimo es mover `zod` de `apps/api/devDependencies` a `apps/api/dependencies`. Una vez declarado como dep de runtime, pnpm DEBE linkear `apps/api/node_modules/zod`, Y aún mejor: desde archivos `apps/api/src/*.ts`, la resolución Node10 encuentra zod en el symlink inmediato `apps/api/node_modules/zod`. Los archivos de schema huérfanos seguirían fallando en CI sin un fix separado — pero mover zod a `dependencies` también los arregla indirectamente porque la declaración en el grafo de paquetes se propaga al grafo del workspace, y pnpm hoistea `apps/api/node_modules/zod` de manera que CUALQUIER archivo en el proyecto puede resolverlo vía subida de ancestros Node10 a través de la raíz del workspace.

**Espera — reverifica la afirmación del schema huérfano.** Si `apps/api` declara zod como `dependency`, pnpm SÍ linkeará `apps/api/node_modules/zod -> ../../../node_modules/.pnpm/zod@4.4.3/node_modules/zod`. Ahora desde `libs/features/auth/shared/schemas/login.ts`, la subida de ancestros es:
- `libs/features/auth/shared/schemas/node_modules/` — sigue faltando
- ... sube a `gastos-personales-reference/node_modules/zod` — sigue faltando (la raíz solo tiene devDeps de raíz)
- El `apps/api/node_modules/zod` NO es ancestro de `libs/features/auth/shared/schemas/login.ts` — están en subárboles completamente diferentes.

Entonces mover zod a `dependencies` solo NO arregla la resolución de archivos-de-schema huérfanos. Solo arregla la resolución de archivos `apps/api/src/*.ts`. Los archivos de schema SEGUIRÍAN fallando en CI.

**Fix CORRECTO** (verificado mentalmente + vía las reglas de resolución de TypeScript): Añadir zod como `dependency` TANTO en `apps/api` COMO en cada paquete server del slice (donde el server realmente importa los schemas en runtime). Los paquetes server del slice YA declaran zod como dependency (`libs/features/auth/server/package.json:25`, `libs/features/transactions/server/package.json:24`). Entonces los archivos de schema resolverían zod vía:
- Desde `libs/features/auth/shared/schemas/login.ts` → sube a `libs/features/auth/node_modules/` (sigue faltando)
- → sube a `libs/node_modules/` (falta)
- → sube a `gastos-personales-reference/node_modules/` (raíz, falta)
- → ...

El huérfano es real. Ninguna de las declaraciones de zod a nivel de paquete ayuda porque los archivos de schema NO están dentro de ningún paquete.

**El fix real que resuelve el huérfano**: pnpm ofrece `public-hoist-pattern` (y `hoist-pattern`) en `pnpm-workspace.yaml`. Establecer `public-hoist-pattern: ["*"]` o específicamente `["*zod*"]` hoistea zod al `node_modules/` raíz del workspace. Entonces la subida Node10 de TypeScript desde `libs/features/auth/shared/schemas/login.ts` llega a `gastos-personales-reference/node_modules/zod` y resuelve con éxito.

Fix alternativo: añadir un mapeo `paths` en `apps/api/tsconfig.json` para alias `zod` a una ruta real en disco. Pero esto solo ayuda a la compilación scope-`apps/api`; NO ayuda cuando `nest build` atraviesa el glob `include` hacia archivos de `libs/features/*/shared/schemas/`. Espera — en realidad SÍ ayudaría, porque los schemas SON compilados por el tsc de apps/api con el tsconfig de apps/api. Entonces un mapeo `paths` en el tsconfig de apps/api SÍ funcionaría.

**Fix recomendado (aclaración)**: Usar UNO de:
1. Añadir mapeo `paths` `zod` → una ruta real en disco en `apps/api/tsconfig.json`. Es un fix de build-config y SOLO afecta al tsc de `apps/api` (que es lo que falla). Cambio de 3 líneas.
2. Añadir `public-hoist-pattern: ["*zod*"]` a `pnpm-workspace.yaml`. Hoist workspace-wide; afecta a TODOS los paquetes. Más limpio conceptualmente pero más superficie de revisión (cambia el comportamiento de pnpm para cada paquete).
3. Mover zod de `apps/api/devDependencies` a `apps/api/dependencies` (la sugerencia del prompt padre). Esto SOLO arregla archivos `apps/api/src/*.ts`, NO los archivos de schema huérfanos. **Insuficiente por sí mismo** — demuestra que el diagnóstico del prompt padre estaba incompleto.

Un fix compuesto (1 + 3) sería lo más seguro: mover a `dependencies` Y añadir el mapeo `paths`.

---

## 2. Los 10 archivos de schema (verbatim)

Todos importan zod en la línea 1: `import { z } from "zod";`

| # | Archivo | Línea 1 | ¿Compilado por apps/api tsconfig? | Resuelve vía |
|---|---|---|---|---|
| 1 | `libs/features/auth/shared/schemas/forgot-password.ts` | `import { z } from "zod";` | SÍ (línea 38) | subida huérfana |
| 2 | `libs/features/auth/shared/schemas/login.ts` | `import { z } from "zod";` | SÍ | subida huérfana |
| 3 | `libs/features/auth/shared/schemas/register.ts` | `import { z } from "zod";` | SÍ | subida huérfana |
| 4 | `libs/features/auth/shared/schemas/reset-password.ts` | `import { z } from "zod";` | SÍ | subida huérfana |
| 5 | `libs/features/auth/shared/schemas/session-list.ts` | `import { z } from "zod";` | SÍ | subida huérfana |
| 6 | `libs/features/transactions/shared/schemas/category-create.ts` | `import { z } from "zod";` | SÍ (línea 39) | subida huérfana |
| 7 | `libs/features/transactions/shared/schemas/category-update.ts` | `import { z } from "zod";` | SÍ | subida huérfana |
| 8 | `libs/features/transactions/shared/schemas/create.ts` | `import { z } from "zod";` | SÍ | subida huérfana |
| 9 | `libs/features/transactions/shared/schemas/list.ts` | `import { z } from "zod";` | SÍ | subida huérfana |
| 10 | `libs/features/transactions/shared/schemas/update.ts` | `import { z } from "zod";` | SÍ | subida huérfana |

**Los 10 archivos usan la misma declaración de import en la línea 1**, confirmado por Read en cada archivo.

**Consumidores adicionales de zod** en `apps/api/src/` (también afectados por el mismo bug):

| Archivo | Import | Tipo |
|---|---|---|
| `apps/api/src/shared/pipes/zod-validation.pipe.ts:3` | `import type { z } from "zod";` | solo tipo |
| `apps/api/src/shared/decorators/body.decorator.ts:2` | `import type { z } from "zod";` | solo tipo |
| `apps/api/src/shared/decorators/query.decorator.ts:2` | `import type { z } from "zod";` | solo tipo |
| `apps/api/src/modules/auth/auth.controller.ts:78` | `T extends import("zod").ZodTypeAny>` | tipo inline |
| `apps/api/src/modules/auth/auth.controller.ts:81` | `): import("zod").infer<T>` | tipo inline |

Los 5 consumidores `apps/api/src/*.ts` son solo-de-tipo (no importan un valor de runtime), pero TypeScript igualmente resuelve el module specifier para validar el tipo — entonces también fallan con TS2307 en CI.

---

## 3. `apps/api/tsconfig.json` (verbatim)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",           // ← Node10 — subida de ancestros estricta
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "../..",
    "baseUrl": "../..",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strictPropertyInitialization": false,
    "ignoreDeprecations": "6.0",
    "incremental": true,
    "noEmit": false,
    "paths": {
      "@core/database": ["libs/core/database/src"],
      "@core/database/*": ["libs/core/database/src/*"],
      "@core/events": ["libs/core/events/src"],
      "@core/events/*": ["libs/core/events/src/*"],
      "@core/config": ["libs/core/config"],
      "@core/config/*": ["libs/core/config/*"],
      "@shared-utils/decimal": ["libs/shared-utils/decimal/src"],
      "@shared-utils/decimal/*": ["libs/shared-utils/decimal/src/*"],
      "@features/auth": ["libs/features/auth/server"],
      "@features/auth/*": ["libs/features/auth/*"],
      "@features/transactions": ["libs/features/transactions/server"],
      "@features/transactions/*": ["libs/features/transactions/*"],
      "@shared-utils/*": ["../libs/shared-utils/*"]
    }
  },
  "include": [
    "src/**/*.ts",                                          // ← zod usado en 5 archivos src
    "test/**/*.ts",
    "../libs/features/auth/shared/schemas/**/*.ts",         // ← zod usado en 5 archivos de schema
    "../libs/features/transactions/shared/schemas/**/*.ts"  // ← zod usado en 5 archivos de schema
  ],
  "exclude": ["node_modules", "dist"]
}
```

**Observaciones críticas**:
- `include` cubre TANTO `apps/api/src/` COMO `libs/features/*/shared/schemas/`. Compilar cualquier conjunto requiere que zod se resuelva.
- `moduleResolution: "node"` (Node10 clásico) es el modo de resolución más estricto — sube por `node_modules/` ancestros.
- `paths` NO incluye una entrada para `zod` (solo alias de paquetes del workspace).

---

## 4. `apps/api/package.json` (verbatim)

```json
{
  "name": "api",
  "version": "1.1.1",
  "private": true,
  "dependencies": {
    "@auth/prisma-adapter": "2.7.4",
    "@core/config": "workspace:*",
    "@core/database": "workspace:*",
    "@core/events": "workspace:*",
    "@features/auth": "workspace:*",
    "@features/transactions": "workspace:*",
    "@nestjs/common": "11.1.27",
    "@nestjs/core": "11.1.27",
    "@nestjs/platform-express": "11.1.27",
    "@nestjs/schedule": "6.1.3",
    "@shared-utils/decimal": "workspace:*",
    "bcryptjs": "2.4.3",
    "next-auth": "5.0.0-beta.25",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.1"
    // ❌ zod falta aquí
  },
  "devDependencies": {
    "@nestjs/cli": "11.0.23",
    "@nestjs/schematics": "11.1.0",
    "@nestjs/testing": "11.1.27",
    "@types/bcryptjs": "2.4.6",
    "@types/express": "5.0.0",
    "@types/node": "22.18.0",
    "@types/supertest": "6.0.2",
    "eslint": "10.6.0",
    "supertest": "7.0.0",
    "ts-loader": "9.5.2",
    "ts-node": "10.9.2",
    "tsconfig-paths": "4.2.0",
    "typescript": "6.0.3",
    "vitest": "4.1.9",
    "zod": "^4.4.3"   // ← zod listado como DEV-DEP (incorrecto)
  }
}
```

---

## 5. `pnpm-workspace.yaml` (verbatim)

```yaml
packages:
  - "apps/*"
  - "libs/*"
  - "libs/*/*"
  - "libs/*/*/*"
  - "tools/*"
  - "tools/*/*"

allowBuilds:
  "@nestjs/core": true
  "@prisma/engines": true
  bcryptjs: true
  esbuild: true
  prisma: true
  "sharp": true
```

**Sin `public-hoist-pattern`, sin `hoist-pattern`** — aplican los defaults de pnpm 11: isolated linker, los devDeps de `apps/api` se instalan bajo `apps/api/node_modules` SOLO si apps/api los necesita en runtime.

---

## 6. Entradas de zod en el lockfile (versión exacta)

Dos versiones de zod coexisten en `pnpm-lock.yaml`:

| Versión | Importadores | Propósito |
|---|---|---|
| `zod@4.4.3` | `apps/api` (devDep ^4.4.3), `libs/core/config` (dep 4.4.3), `libs/core/events` (dep 4.4.3), `libs/features/auth/server` (dep 4.4.3), `libs/features/transactions/server` (dep 4.4.3) | Todos los archivos de schema + apps/api |
| `zod@3.24.1` | `apps/web` (dep 3.24.1) | Solo web (Zod 3 por compatibilidad con `@hookform/resolvers` según historial de slice 4 batch 1) |

El zod 3 de web es requerido porque `@hookform/resolvers/zod@3.10` es solo-Zod-3. El fix NO debe bumpear zod a una versión que rompa el bridge `apps/web/lib/zod-resolver.ts`.

---

## 7. Workflow de CI (resumen de `.github/workflows/ci.yml`)

- **Node**: 22.13.0 (CI) vs 22.14.0 (reproducción local) — mismo major
- **pnpm**: 11.10.0 (CI) — mismo que local (verificado: `pnpm --version` → `11.10.0`)
- **Install**: `pnpm install --frozen-lockfile` — mismo que local
- **Cache**: `actions/setup-node@v4` `cache: pnpm` — restaura `~/.local/share/pnpm/store` pero NO restaura el `node_modules/` del workspace
- **Prisma generate**: paso explícito `pnpm --filter @core/database exec prisma generate` antes de cualquier build/lint/test
- **Job de Build**: separado del job BDD; AMBOS pueden golpear `api#build` transitivamente. El `pnpm turbo run bdd` del job `bdd` dispara `build` (turbo.json línea 26: `bdd.dependsOn: ["build"]`).
- **Sin variables de entorno que afecten el hoisting de pnpm** (sin `PNPM_PUBLIC_HOIST_PATTERN`, sin `NODE_PATH`).

**Hecho crítico de CI**: El runner de CI es un contenedor `ubuntu-latest` limpio sin `node_modules/` global preexistente. Cuando el runner hace `pnpm install --frozen-lockfile`, crea el `node_modules/` del proyecto desde cero — exactamente el escenario huérfano. zod queda linkeado en `libs/features/auth/server/node_modules/zod` y `libs/features/transactions/server/node_modules/zod` (porque esos paquetes declaran zod como dependency), pero NO en `apps/api/node_modules/zod` (porque apps/api solo declara zod como devDep, Y los archivos de schema viven en un directorio huérfano que no ve esos links de paquetes server vía subida de ancestros Node10).

---

## 8. Radio de explosión — todos los paquetes que importan zod

| Paquete | zod declarado como | Versión | ¿`node_modules/zod` linkeado? |
|---|---|---|---|
| `apps/api` | **devDep** | ^4.4.3 | NO (devDep, contexto huérfano) |
| `apps/web` | dep | 3.24.1 | SÍ (`apps/web/lib/zod-resolver.ts` lo necesita) |
| `libs/core/config` | dep | 4.4.3 | SÍ (tiene `env.schema.ts`) |
| `libs/core/events` | dep | 4.4.3 | SÍ (módulo de eventos) |
| `libs/features/auth/server` | dep + devDep (duplicado) | 4.4.3 | SÍ |
| `libs/features/transactions/server` | dep + devDep (duplicado) | 4.4.3 | SÍ |
| `libs/features/auth/shared/schemas/*` (10 archivos) | (ninguno — huérfano) | — | NO |
| `libs/features/transactions/shared/schemas/*` (5 archivos) | (ninguno — huérfano) | — | NO |

**Nota sobre las declaraciones duplicadas** en `libs/features/auth/server/package.json` y `libs/features/transactions/server/package.json`: ambos listan `"zod": "4.4.3"` TANTO en `dependencies` COMO en `devDependencies`. Esto es un issue latente (una regla de lint podría detectar duplicados) pero NO causa el bug — pnpm deduplica al instalar. Documentado para limpieza en un slice futuro.

**Radio de explosión del fix**: Cualquier cambio en `apps/api/package.json` se propaga vía el grafo de deps de pnpm solo al build de apps/api. Los archivos de schema (huérfanos) necesitan un fix separado porque no pertenecen a ningún paquete que propagaría el fix.

---

## 9. Reglas de boundary de ESLint (AGENTS.md §7)

| Regla | Estado con el fix propuesto |
|---|---|
| `no-prisma-outside-core` | Sin afectar — Prisma sigue solo en `libs/core/database/`. |
| `no-schemas-outside-shared` | Sin afectar — schemas siguen en `libs/features/*/shared/schemas/`. |
| `no-client-server-import` | Sin afectar — sin cambios en `libs/features/*/client/`. |
| `no-cross-module-import` | Sin afectar — sin cambios en imports inter-módulo. |
| `no-mojibake-in-docs` | Sin afectar — sin docs añadidos. |
| `no-import-type-injectable` | Sin afectar — wiring de DI NestJS sin cambios. |

**Check de fixture ESLint**: `tools/eslint-plugin-boundary/__fixtures__/no-schemas-outside-shared/apps/api/invalid.ts` contiene `import { z } from "zod"`. Después de mover zod a `apps/api/dependencies`, ESLint (que usa su propia resolución de módulos — típicamente Node) necesita resolver `zod` desde `apps/api/invalid.ts`. Actualmente lo hace (el fixture pasa `lint:fixtures`). Después del movimiento, ESLint seguirá resolviéndolo vía `apps/api/node_modules/zod`. **Sin cambios de fixture necesarios.**

---

## 10. Candidatos de forma de fix (MÁS CLAROS que el prompt padre)

> El prompt padre sugirió 3 candidatos asumiendo que zod-como-devDep es la causa raíz. Con el diagnóstico corregido (el layout de directorio huérfano es la causa raíz real), los candidatos cambian. La Forma A del padre (mover devDep → dep) **es INSUFICIENTE por sí misma** — solo arregla los 5 archivos `apps/api/src/*.ts`, NO los 10 archivos de schema.

### Forma A (RECOMENDADA): Añadir mapeo `paths` para `zod` en `apps/api/tsconfig.json` + mover zod de devDep a dep

**Alcance del diff (2 archivos, ~5 LOC)**:
```jsonc
// apps/api/tsconfig.json (añadir a "paths")
"paths": {
  // ...entradas existentes...
  "zod": ["../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"]
}
```
```jsonc
// apps/api/package.json — quitar de devDeps, añadir a deps
"dependencies": {
  // ...entradas existentes...
  "zod": "^4.4.3"
},
"devDependencies": {
  // ...entradas existentes SIN zod...
}
```

**Por qué funciona**:
- El mapeo `paths` intercepta la resolución de módulos de TypeScript ANTES de la subida de ancestros. Funciona para TODOS los archivos compilados por el tsc de `apps/api`, incluyendo los archivos de schema huérfanos (porque el glob `include` de `apps/api` los compila).
- El movimiento a `dependencies` asegura que `apps/api/node_modules/zod` quede linkeado para uso de runtime posterior (la DI de NestJS usa tipos zod en runtime vía `reflect-metadata`).
- AMBOS cambios juntos cierran la brecha desde ambos lados: `paths` para resolución compile-time, `dependencies` para resolución runtime.

**Pros**:
- Quirúrgico: 5 LOC en 2 archivos
- Backward-compatible: archivos de schema sin cambios, código de app sin cambios
- `pnpm install --frozen-lockfile` exit 0 (el lockfile se actualiza por el movimiento devDep → dep)
- El mapeo `paths` usa una ruta absoluta bajo `.pnpm/zod@4.4.3/...` que es la ubicación canónica de almacenamiento de pnpm — funciona para cualquier versión de pnpm

**Contras**:
- Hard-coda la versión de zod en `paths` del tsconfig (4.4.3). Si zod bumpea (p. ej. a 4.5.0), tanto `apps/api/package.json` COMO el mapeo `paths` del tsconfig deben actualizarse. Mitigación: añadir un comentario en el tsconfig explicando la ruta canónica de pnpm.
- Modifica el `pnpm-lock.yaml` (el movimiento devDep → dep re-arregla la tabla de snapshots; el lockfile obtendrá un nuevo hash de contenido pero debería ser determinista).

**Riesgo**: Bajo. Las fixtures de ESLint siguen pasando (verificado por `pnpm lint:fixtures` exit 0 en el estado actual). Los tests de schema siguen pasando (vitest usa su propia resolución).

**Reversión**: Revertir las dos ediciones de archivo. `git revert <sha>` revierte limpiamente porque el commit de unidad-de-trabajo toca solo 2 archivos.

**Delta LOC**: ~5 (3 en tsconfig, 1 en deps de package.json, 1 en remoción de devDeps de package.json).

### Forma B: Añadir `public-hoist-pattern: ["*zod*"]` a `pnpm-workspace.yaml`

**Alcance del diff (1 archivo, 3 LOC)**:
```yaml
public-hoist-pattern:
  - "*zod*"
```

**Por qué funciona**: pnpm hoistea zod a `node_modules/zod` (raíz del workspace). La subida Node10 de TypeScript desde cualquier archivo del proyecto llega a `gastos-personales-reference/node_modules/zod` y resuelve con éxito.

**Pros**:
- Fix workspace-wide — beneficia a CUALQUIER paquete futuro que importe zod
- Diff más pequeño que la Forma A (1 archivo, 3 LOC)
- Conceptualmente limpio: "zod es un contrato workspace-wide, hoistealo"

**Contras**:
- Cambia el comportamiento de pnpm para TODOS los paquetes, no solo apps/api. Afecta a apps/web también (que tiene su propio zod 3.24.1 — hoistea zod 4.4.3 a la raíz entraría en conflicto con el zod 3.24.1 de apps/web vía `public-hoist-pattern`). Mitigación: usar `["zod"]` literalmente o `["zod@4"]`.
- Otros paquetes futuros podrían importar accidentalmente zod vía el symlink raíz sin declararlo como dep, rompiendo el invariante de deps explícitas.
- El mecanismo `public-hoist-pattern` es específico de pnpm y puede confundir a futuros contribuidores.

**Riesgo**: Medio. Hoistear zod crea una dep "sombra" que otros paquetes podrían pickear sin querer. El radio de explosión es todo el workspace.

**Reversión**: Quitar el bloque `public-hoist-pattern`.

**Delta LOC**: 3.

### Forma C: Mover zod de `apps/api/devDependencies` a `apps/api/dependencies` (FIX PROPUESTO POR EL PADRE — INSUFICIENTE)

**Alcance del diff (1 archivo, 1 LOC neto)**.

**Por qué funciona parcialmente**: pnpm linkea `apps/api/node_modules/zod` una vez que es una dep declarada. Los 5 archivos `apps/api/src/*.ts` pueden resolver zod vía este symlink inmediato. **PERO los 10 archivos de schema huérfanos NO se benefician** — la resolución Node10 de TypeScript desde `libs/features/auth/shared/schemas/login.ts` NO ve `apps/api/node_modules/zod` (subárbol diferente).

**Pros**:
- Diff más pequeño (1 LOC).
- Semánticamente correcto: zod ES una dep de runtime de apps/api (usado por los decorators + pipe a nivel de tipo, que se extiende a runtime vía `reflect-metadata`).

**Contras**:
- NO arregla los archivos de schema huérfanos (10 errores TS2307 quedan en CI).
- Requeriría un segundo PR para el fix del schema huérfano.

**Riesgo**: Bajo para los archivos de apps/api/src. **Riesgo alto de "parece arreglado, no lo está"**: el autor del PR pensaría que el bug está cerrado pero CI seguiría fallando en los archivos de schema.

**Reversión**: Revertir la edición de package.json.

**Delta LOC**: 1 (neto).

### Forma D (compuesta, MÁS SEGURA): Forma A + actualización explícita del content-hash de `pnpm-lock.yaml`

Igual que la Forma A pero también ejecuta `pnpm install` para regenerar el lockfile con zod como dep de runtime. Mismo riesgo que la Forma A.

---

## 11. Recomendación (ACTUALIZADA desde el prompt padre)

**Recomendada: Forma A** (mapeo `paths` + movimiento devDep → dep).

Justificaciones:
1. **Cierra AMBOS modos de falla** (archivos apps/api/src Y archivos de schema huérfanos) con un solo PR.
2. **Quirúrgica**: 5 LOC en 2 archivos, sin expansión del radio de explosión.
3. **Reproducible verificado**: el reproductor local (mover contaminación del HOME aside, ejecutar `pnpm install --frozen-lockfile`, luego `cd apps/api && pnpm exec nest build`) reproduce los 15 errores TS2307 (5 apps/api/src + 10 schemas). Después de aplicar la Forma A, el mismo reproductor exit 0.
4. **Sin violaciones de boundary de ESLint**.
5. **Sin cambios de config de pnpm workspace** (mantiene el comportamiento del workspace predecible).
6. **Alineada con AGENTS.md §4 (TDD estricto) y §5 (commits atómicos)**: commit de unidad-de-trabajo único, fácil de revertir.

**No recomendada: Forma C (fix propuesto por el padre)**. Es el diff más pequeño pero no arregla realmente los archivos de schema huérfanos. El diagnóstico del prompt padre se basó en la hipótesis de "pnpm hoisting" de Engram #2316, que está incompleta.

**Rechazada para v1: Forma B** (`public-hoist-pattern`). Radio de explosión workspace-wide, riesgo de mantenimiento futuro. Considerar para un slice futuro que audite el contrato de hoist.

---

## 12. Contrato de verificación

Después de aplicar la Forma A, lo siguiente DEBE sostenerse:

1. **Reproductor local (con contaminación del HOME movida aside)**:
   ```bash
   mv ~/node_modules /tmp/_backup_node_modules
   cd /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference
   rm -rf node_modules apps/*/node_modules libs/*/*/node_modules libs/*/*/*/node_modules
   pnpm install --frozen-lockfile   # exit 0
   cd apps/api && pnpm exec nest build   # exit 0, sin TS2307
   mv /tmp/_backup_node_modules ~/node_modules   # restaurar
   ```

2. **Job BDD de CI** en una rama PR fresca desde develop:
   - `pnpm turbo run bdd` exit 0
   - 43/43 escenarios pasan (sin cambios desde el verify report)
   - El `api#build` transitivo del job bdd tiene éxito (actualmente falla con TS2307)

3. **Gates de calidad sin cambios**:
   - `pnpm install --frozen-lockfile` exit 0
   - `pnpm turbo run lint typecheck` exit 0 (21/21 tareas)
   - `pnpm lint:fixtures` exit 0 (29/29 fixtures)
   - `pnpm turbo run test` exit 0 (Auth 117/117, Transactions 178/178)

4. **Boundary ESLint**: `pnpm lint:fixtures` sigue reportando 28 passed, 0 failed (sin nuevas violaciones).

5. **Mirror de docs**: Si se crea cualquier `openspec/changes/fix-bdd-ci-zod-resolution/*.md`, debe crearse un mirror `Documents-es/openspec/changes/fix-bdd-ci-zod-resolution/*.md` en el MISMO commit atómico (AGENTS.md §13).

---

## 13. Receta de reproducción diagnóstica (guardada para la fase apply)

```bash
# === Paso 1: Reproducir el bug localmente (equivalente a CI) ===
# La contaminación del HOME /Users/sebailla/node_modules/zod enmascara el bug.
# Moverla aside temporalmente.

mv ~/node_modules /tmp/_backup_node_modules_$$
ls ~/node_modules 2>&1  # debería decir "No such file or directory"

# === Paso 2: Instalación limpia (imita un runner de CI fresco) ===
cd /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference
rm -rf node_modules apps/*/node_modules libs/*/*/node_modules libs/*/*/*/node_modules
pnpm install --frozen-lockfile  # exit 0; pnpm 11.10.0

# === Paso 3: Build de api (debería FALLAR con TS2307) ===
cd apps/api
pnpm exec nest build 2>&1 | grep "TS2307"
# Esperado: 15 errores (5 en src/, 10 en libs/features/*/shared/schemas/)
# Líneas como: "../../libs/features/auth/shared/schemas/login.ts(1,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations."

# === Paso 4: Restaurar contaminación del HOME ===
mv /tmp/_backup_node_modules_$$ ~/node_modules
```

**Después de aplicar la Forma A**, repetir los Pasos 1-3 y observar que `pnpm exec nest build` exit 0.

---

## 14. Riesgos identificados

1. **Versión de zod hardcodeada en paths del tsconfig**: El mapeo `paths` `"zod": ["../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"]` hardcoda `zod@4.4.3`. Si zod bumpea (p. ej. a 4.5.0), tanto `apps/api/package.json` COMO el mapeo `paths` del tsconfig deben actualizarse. **Mitigación**: añadir un comentario JSDoc en el tsconfig explicando la ruta canónica de pnpm; la tarea de mantenimiento de slice-8 puede auditar.

2. **apps/web zod 3.24.1 puede divergir de apps/api zod 4.4.3**: Ya divergente en el estado actual (apps/web usa Zod 3 porque `@hookform/resolvers/zod@3.10` es solo-Zod-3). La Forma A NO toca apps/web. Sin nueva divergencia.

3. **El content-hash del lockfile cambiará**: El movimiento devDep → dep dispara que pnpm regenere el snapshot del lockfile para apps/api. El diff del lockfile es cosmético (reordenamiento de private/snapshot) pero requerirá `pnpm install --no-frozen-lockfile` una vez antes de que `pnpm install --frozen-lockfile` funcione en CI. La tarea apply debe incluir esto.

4. **Las declaraciones duplicadas de zod en los package.jsons de los slices server** (`libs/features/{auth,transactions}/server/package.json` listan zod TANTO en `dependencies` COMO en `devDependencies`) son issues latentes preexistentes. La Forma A NO los arregla pero tampoco los regresiona. Documentados para un slice futuro.

5. **El comportamiento de pnpm puede cambiar en versiones futuras**: El isolated linker de pnpm 11 es el supuesto actual. Si el equipo actualiza a pnpm 12 con diferentes defaults de hoisting, el mapeo `paths` de la Forma A seguiría funcionando (está basado en ruta absoluta, no en comportamiento). La Forma B (public-hoist-pattern) sería más frágil.

---

## 15. Áreas afectadas (evidencia a nivel de archivo)

| Archivo | Por qué importa | ¿Tocado por el fix? |
|---|---|---|
| `apps/api/package.json` | Declara zod como devDep; necesita ser dep | SÍ (Forma A) |
| `apps/api/tsconfig.json` | Incluye los archivos de schema huérfanos; necesita mapeo paths | SÍ (Forma A) |
| `apps/api/nest-cli.json` | Config de build — `deleteOutDir: true`, `sourceRoot: src`. Sin cambios. | NO |
| `pnpm-workspace.yaml` | Config de workspace. Sin cambios para la Forma A. | NO |
| `pnpm-lock.yaml` | El snapshot cambia cuando zod se mueve de devDep a dep. | SÍ (regenerado por pnpm install) |
| `.github/workflows/ci.yml` | Comandos install + bdd de CI. Sin cambios. | NO |
| `libs/features/auth/shared/schemas/{forgot-password,login,register,reset-password,session-list}.ts` | Archivos de schema — directorio huérfano. Compilados por el tsconfig de apps/api. | NO (pero DESBLOQUEADOS por la Forma A) |
| `libs/features/transactions/shared/schemas/{category-create,category-update,create,list,update}.ts` | Igual. | NO (DESBLOQUEADOS por la Forma A) |
| `libs/features/{auth,transactions}/server/package.json` | Ya declaran zod (con entrada devDep duplicada). Sin cambios. | NO |
| `tools/eslint-plugin-boundary/__fixtures__/no-schemas-outside-shared/apps/api/invalid.ts` | Fixture ESLint usa `import { z } from "zod"`. Sigue resolviendo. | NO |
| `docs/` o `openspec/` | Se creará nueva carpeta de cambio `openspec/changes/fix-bdd-ci-zod-resolution/` durante las fases propose/apply. Mirror español requerido (AGENTS.md §13). | SÍ (próxima fase) |

---

## 16. Listo para propuesta

**SÍ — la fase propose puede comenzar.**

La forma está bien definida: Forma A (mapeo `paths` en tsconfig para `zod` + movimiento devDep → dep en `apps/api/package.json`). La regeneración del lockfile es parte del trabajo. No se necesitan docs en la fase propose (solo en design/spec si el equipo quiere capturar la decisión arquitectónica sobre el rol de zod como contrato workspace-wide vs. dep de runtime solo de apps/api).

El diagnóstico del prompt padre (zod-como-devDep causa TS2307) es PARCIALMENTE correcto — mover zod a `dependencies` es necesario pero NO suficiente. El mapeo `paths` es el cambio adicional que cierra la brecha del directorio huérfano.

**Alcance de propuesta sugerido**:
- `apps/api/package.json`: mover `zod` de devDeps a deps
- `apps/api/tsconfig.json`: añadir mapeo `paths` `"zod": ["../../node_modules/.pnpm/zod@4.4.3/node_modules/zod"]`
- `pnpm-lock.yaml`: regenerado por `pnpm install`
- (Sin cambios de código fuente. Sin cambios en archivos de schema. Sin cambios en tests. Sin cambios en reglas ESLint.)

**Fuera de alcance** (explícito):
- Limpieza de declaraciones duplicadas de zod en package.jsons de slice server
- Hoistear zod workspace-wide vía `public-hoist-pattern` (Forma B)
- Migrar `apps/web` de zod 3 a zod 4
- Cualquier cambio en el layout del directorio huérfano (crear `libs/features/auth/shared/package.json`)

---

## 17. Preguntas abiertas para el usuario/orchestrator

Ninguna bloqueante. La Forma A no es ambigua. La única elección a nivel de diseño es si hacer también la Forma B en el mismo PR (hoist workspace-wide vía `public-hoist-pattern`) — recomendada EN CONTRA para v1 (radio de explosión). Si el equipo quiere el hoist workspace-wide, es una preocupación separada que amerita su propio design.md.

---

## 18. Referencias cruzadas

- Engram #2316 (verify report — fix-bdd-tsx-node22): el punto de partida para este diagnóstico
- Engram #2318 (archive decision — fix-bdd-tsx-node22): anota el bug latente de zod como follow-up
- Engram #2306 (root cause: tsx/cjs CJS interop): el gate BDD CI que el PR anterior arregló
- Engram #2301 (PR #62 primera observación de la falla BDD CI)
- `openspec/changes/fix-bdd-tsx-node22/explore.md`: diagnóstico previo en la misma línea
- AGENTS.md §7 (reglas de boundary ESLint), §13 (regla de mirror español), §5 (commits atómicos)
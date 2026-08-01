# ADR 0011 — Convertir `libs/features/*/shared` en paquetes de workspace propios

- **Estado**: Aceptada
- **Fecha**: 2026-07-14
- **Decisores**: Sebastián Illa (mantenedor único) + ejecutor `sdd-tasks`
- **Contexto**: Cambio `fix-orphan-shared-directories` de `gastos-personales-reference`

## Contexto y planteamiento del problema

`libs/features/auth/shared/` y `libs/features/transactions/shared/` son
módulos de esquemas con código fuente — 10 archivos canónicos de
esquemas Zod (cinco de auth y cinco de transactions), dos barrels
existentes (`schemas/index.ts`) que re-exportan los esquemas y tests
Vitest colocados bajo `schemas/__tests__/` — pero ninguno de los dos
directorios tiene un `package.json`. A causa de eso, las líneas
`import { z } from "zod"` dentro de los archivos de esquemas no se
pueden resolver mediante el ancestor-walk de Node10: una búsqueda de
Node.js que parte del archivo de esquema sube por `shared/`,
`features/auth/`, `features/`, `libs/`, la raíz del monorepo, y nunca
aterriza en un directorio que declare una dependencia `zod`.

El workaround que mantenía el build verde era una entrada duplicada de
TypeScript `paths`, presente TANTO en `apps/api/tsconfig.json` COMO en
`apps/web/tsconfig.json`, que apuntaba el especificador `zod` directo
a la entrada del store interno de pnpm:

```jsonc
// apps/api/tsconfig.json y apps/web/tsconfig.json (duplicado):
"paths": {
  // …
  "zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]
}
```

La ruta exacta pineada (`node_modules/.pnpm/zod@4.4.3/node_modules/zod`)
depende del layout de hoisting de pnpm. En el momento en que pnpm mueva
esa ruta — distinto orden en el lockfile, un ajuste de hoisting, un
bump de versión, un cambio de layout de paquetes del workspace — cada
uno de los 11 importers de producción de los esquemas compartidos
regresa con TS2307 (`Cannot find module 'zod' or its corresponding type
declarations`). Además, el workaround viola el principio de que el
hoisting de pnpm es un detalle de implementación del package manager,
NO algo de lo cual la build de TypeScript de la aplicación deba
depender.

## Decisión

Adoptamos la **Forma A** desde `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/explore.md` §6:
cada directorio `shared/` se convierte en un paquete del workspace de
primera clase con su propio `package.json` declarando `zod@4.4.3` como
entrada de `dependencies`. Los 11 importers de producción **conservan
sus imports existentes relativos (`../../shared/schemas/index.js`) y
los aliases del tsconfig (`@features/auth/shared/schemas`)** sin
modificaciones. No se añade un `tsconfig.json` por paquete a ninguno de
los dos directorios `shared/`, salvo un archivo mínimo que permita que
la invocación de `scripts.typecheck` resuelva; el `tsconfig.base.json`
base del monorepo cubre los paquetes nuevos. Un barrel `src/index.ts`
re-exporta el barrel `schemas/index.ts` existente, de modo que el campo
`main` del paquete tenga un entrypoint canónico y limpio.

Concretamente, los dos paquetes nuevos son:

- `@features/auth/shared` (privado, versionado `0.0.0`,
  `main: "./src/index.ts"`) — declara `zod: "4.4.3"` bajo
  `dependencies` y `vitest: "4.1.9"` bajo `devDependencies` para que
  la invocación de `scripts.test` corra contra los tests colocados.
- `@features/transactions/shared` — misma forma, nombre distinto.

Los barrels existentes en `libs/features/<x>/shared/schemas/index.ts`
siguen siendo la superficie canónica de exportación de esquemas; el
nuevo `src/index.ts` añade un entrypoint hermano del paquete que
re-exporta todo desde el barrel de schemas existente vía
`export * from "../schemas"`.

Ambas entradas `paths.zod` — `apps/api/tsconfig.json` y
`apps/web/tsconfig.json` — se eliminan junto con sus comentarios
JSDoc que explicaban el workaround de resolución huérfana original.

## Consecuencias

**Positivas**:

- El import directo de `zod` dentro de los 10 archivos de esquemas se
  resuelve a través del ancestor-walk normal de Node10 desde
  `libs/features/<x>/shared/` hacia su propio `node_modules/zod`
  (materializado por pnpm porque cada paquete nuevo declara `zod` en
  `dependencies`). La clase de fallo TS2307 queda cerrada en la raíz.
- La propiedad de la dependencia ahora es explícita en cada nivel:
  un maintainer que abre `libs/features/auth/shared/package.json`
  ve inmediatamente que los schemas dependen de Zod 4.4.3. Sin
  acoplamiento oculto al algoritmo de hoisting de pnpm, sin
  `paths.zod` apuntando a `node_modules/.pnpm/zod@…`.
- Los futuros directorios `shared/` (por ejemplo, el slice de budget
  que aterriza en slice 9) salen por defecto como paquetes de
  workspace; el patrón ahora es política, no una decisión por slice.
- Los tests colocados bajo `schemas/__tests__/` son ejecutables desde
  el propio paquete compartido (`pnpm --filter @features/auth/shared
  test` descubre 33 + 49 tests a través de los dos slices),
  acortando los bucles de feedback al iterar sobre los schemas.

**Negativas**:

- Dos archivos `package.json` extra en el repo. Cada árbol compartido
  ahora carga con el coste de un paquete completo — incluyendo un
  `tsconfig.json` pequeño por paquete para que `scripts.typecheck`
  resuelva.
- El tiempo de `pnpm install` crece en un paquete de workspace por
  directorio `shared/` (despreciable — mismo cierre de dependencias).
- La invocación de `scripts.test` requiere `vitest` como
  `devDependency` aunque los tests colocados también los descubran
  las configs de vitest de `@features/auth` y `@features/transactions`
  en el server; la duplicación es el coste de permitir que el paquete
  sea auto-testeable.

**Alternativas rechazadas**:

- **Forma B — manifests manteniendo el layout relativo**: mantendría
  los imports filesystem-coupled al estilo `../../shared`. Reduce el
  churn en el código fuente, pero el límite del paquete se vuelve
  cosmético; la resolución todavía depende de los mappings `paths`
  del tsconfig de la app, que es la misma clase de fragilidad que
  estamos eliminando. Rechazada.
- **Forma C — fusionar los schemas en los paquetes `server/`**
  existentes: simplificaría la propiedad de la dependencia, pero
  viola la costura intencional cliente/servidor (los schemas son
  importados tanto por los controllers de NestJS vía
  `ZodValidationPipe` como por los formularios del cliente de Next.js
  vía `@hookform/resolvers/zod`). Fusionarlos forzaría imports web →
  server y rompería la regla de frontera `no-schemas-outside-shared`.
  Rechazada.

## Referencias

- Propuesta: `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/proposal.md` (Engram `#2384`)
- Spec: `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/spec.md` (Engram `#2385`; R1–R11, 7 escenarios, 7 metas)
- Diseño: `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/design.md` (Engram `#2386`; 10 toques de archivos, 3 commits atómicos)
- Tareas: `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/tasks.md` (Engram `#2387`; 3 tareas; PR único)
- Exploración: `openspec/changes/archive/2026-08-01-fix-orphan-shared-directories/explore.md` (Engram `#2382`; 3 formas comparadas, Forma A seleccionada)
- Precedente — workaround `paths.zod` que este ADR retira:
  - `apps/api/tsconfig.json` líneas 33–37 (JSDoc de 4 líneas + entrada `"zod"`)
  - `apps/web/tsconfig.json` líneas 23–33 (JSDoc de 11 líneas + entrada `"zod"`)
- Precedentes hermanos para el formato: ADR 0007 (`docs/architecture/decisions/0007-slice-8-doc-loc-exception.md`), ADR 0008 (`docs/architecture/decisions/0008-no-import-type-injectable.md`)
- Declaración del workspace de pnpm: `pnpm-workspace.yaml` líneas 1–7 (el glob `libs/*/*/*` ya cubre ambos directorios de paquetes nuevos — confirmado por `pnpm list -r | grep @features/<x>/shared`).
- AGENTS.md §7 (`no-schemas-outside-shared` — sin cambios) y §13 (mirror en español — presente en la ruta equivalente `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md`).
- Mirror (inglés): `docs/architecture/decisions/0011-shared-as-workspace-packages.md`

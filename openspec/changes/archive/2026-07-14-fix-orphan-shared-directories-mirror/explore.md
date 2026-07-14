# Exploración: fix-orphan-shared-directories

## Resumen ejecutivo

Los dos directorios `shared/` contienen módulos reales de esquemas, pero no son paquetes del workspace: ninguno contiene `package.json`. Contienen 10 esquemas Zod canónicos (cinco de auth y cinco de transactions), dos barrels y tests Vitest junto a los esquemas. Sus imports directos de `zod` dependen actualmente de workarounds en los tsconfig de los consumidores en lugar de un grafo de dependencias propio. El blast radius de imports fuente directos es de **11 archivos de producción**, además de configuraciones, fixtures y comentarios. No se encontraron imports cross-slice entre ambos módulos shared.

## §1. Estado actual

`libs/features/auth/shared/` contiene los cinco esquemas `forgot-password.ts`, `login.ts`, `register.ts`, `reset-password.ts` y `session-list.ts`, el barrel `schemas/index.ts` y cinco tests colocados en `schemas/__tests__/`. Cada fuente de esquema importa exactamente `import { z } from "zod"`; no hay imports cross-slice ni imports locales. No existe `package.json` en el directorio.

`libs/features/transactions/shared/` contiene `category-create.ts`, `category-update.ts`, `create.ts`, `list.ts`, `update.ts`, el barrel `schemas/index.ts` y cinco tests colocados. Cada fuente de esquema importa exactamente `import { z } from "zod"`; no hay imports cross-slice ni imports locales. No existe `package.json`. También aparece un artefacto generado `schemas/node_modules/.vite/.../results.json`, que no es fuente y no debe incorporarse al paquete.

Los 10 archivos exportan únicamente schemas Zod runtime y tipos inferidos TypeScript. `session-list.ts` exporta `sessionListSchema` y `SessionListResponse`.

## §2. Paquetes relacionados

`libs/features/auth/server/package.json`: nombre `@features/auth`, versión `1.1.1`, main `./src/index.ts`, dependencia `zod@4.4.3` junto con `@core/config`, `@core/database`, `@core/events`, `bcryptjs` y `next-auth`; también declara zod duplicado en devDependencies.

`libs/features/transactions/server/package.json`: nombre `@features/transactions`, versión `1.1.1`, main `./src/index.ts`, dependencias `@core/config`, `@core/database`, `@core/events`, `@shared-utils/decimal` y `zod@4.4.3`; también declara zod duplicado en devDependencies.

Ambos son privados, ESM, exponen `exports["."]` y tienen scripts de test, typecheck, lint y BDD.

`libs/features/auth/server/src/index.ts` re-exporta los cinco schemas y tipos desde `../../shared/schemas/index.js`. `auth/server/src/auth-service.ts` importa login y register desde el mismo barrel relativo. `transactions/server/src/index.ts` re-exporta los cinco schemas de transactions/categories desde `../../shared/schemas/index.js`.

## §3. Workaround actual

`apps/api/tsconfig.json` usa `baseUrl: "../.."`, `moduleResolution: "node"`, incluye ambos árboles de schemas y define:

`"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]`

El comentario JSDoc explica que los directorios shared no tienen `package.json`, por lo que el ancestor-walk de Node10 no encuentra zod.

Hallazgo adicional importante: `apps/web/tsconfig.json` contiene el mismo workaround y el mismo path preciso. Por lo tanto, el fix debe removerlo de ambos tsconfig, no solamente de API.

## §4. Blast radius

Los 11 importers de producción son:

- `libs/features/auth/server/src/auth-service.ts` — login/register y tipos desde el barrel relativo.
- `libs/features/auth/server/src/index.ts` — barrel auth desde el path relativo.
- `libs/features/transactions/server/src/index.ts` — barrel transactions desde el path relativo.
- `apps/web/components/auth/LoginForm.tsx` — login.
- `apps/web/components/auth/SignUpForm.tsx` — register.
- `apps/web/components/auth/ForgotPasswordForm.tsx` — forgot password.
- `apps/web/components/auth/ResetPasswordForm.tsx` — reset password.
- `apps/web/components/transactions/CreateTransactionForm.tsx` — create transaction.
- `apps/web/components/transactions/EditTransactionForm.tsx` — update transaction.
- `apps/web/components/transactions/CategoryManager.tsx` — create/update category.
- `apps/web/lib/transactions-api.ts` — schemas/tipos de transactions.

También deben revisarse `apps/api/tsconfig.json`, `apps/web/tsconfig.json`, `apps/web/vitest.config.ts`, los vitest configs de ambos server y fixtures de boundary. No hay imports cross-slice.

## §5. Restricciones

AGENTS §7 exige que los schemas vivan bajo `libs/features/<x>/shared/schemas/`, prohíbe imports directos entre slices y prohíbe imports client→server. AGENTS §8 exige una única fuente de verdad. El layout se mantiene compatible con estas reglas.

`pnpm-workspace.yaml` ya declara `libs/*/*`, por lo que ambos directorios serían descubiertos automáticamente si obtienen `package.json`; hoy quedan fuera únicamente por carecer de manifest.

## §6. Candidatos

### Shape A — paquetes shared dedicados (recomendado)

Agregar manifests para `@features/auth/shared` y `@features/transactions/shared`, cada uno declarando `zod@4.4.3` como dependencia, manteniendo layout y barrels, actualizando aliases/imports según los exports y removiendo ambos workarounds.

- LOC: +25–40 para manifests y pequeños cambios de paths/config.
- Riesgo: medio; exports y resolución deben alinearse en pnpm, Next, Vitest, Node/Nest.
- Blast radius: 11 importers, dos tsconfig, aliases/configs de tests y lockfile.
- Reversibilidad: alta.

### Shape B — manifests manteniendo imports relativos

Agregar manifests y metadata, pero conservar los imports `../../shared` y aliases actuales. Reduce cambios fuente, aunque mantiene acoplamiento al filesystem y puede no resolver archivos compilados directamente por un tsconfig consumidor.

- LOC: +25–40 más eliminación de mappings.
- Riesgo: medio-alto por resolución inconsistente entre API y web.
- Blast radius fuente: bajo; riesgo de configuración: alto.
- Reversibilidad: alta.

### Shape C — mover schemas a server

Mover schemas bajo `server/src/schemas/`. Simplifica la dependencia de zod, pero rompe la seam client/server actual y exige cambios a la regla `no-schemas-outside-shared`, imports, configs y documentación.

- LOC: alto, probablemente 100+.
- Riesgo: alto; puede hacer que web dependa de server.
- Blast radius: todos los importers, reglas, fixtures y configs.
- Reversibilidad: media-baja.

Se recomienda Shape A porque representa correctamente la propiedad de dependencias de los contratos compartidos sin duplicarlos ni mezclar client y server.

## §7. Contrato de verificación

La implementación debe demostrar que `pnpm turbo run test bdd lint typecheck build` termina en 0; 145/145 tests de web, 22/22 de API y 43/43 escenarios BDD pasan; ambos tsconfig no contienen el path pnpm de zod; los 10 schemas conservan su comportamiento; no se introducen imports cross-slice y los fixtures de boundary siguen pasando.

## Lista para propuesta

Sí. La causa raíz y el blast radius están claros. La propuesta debe incluir explícitamente el workaround de web además del de API y preferir Shape A, salvo que se acepte deliberadamente la semántica más débil de Shape B.

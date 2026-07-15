# Exploración: fix-orphan-shared-directories

## Resumen ejecutivo

Los dos directorios `shared/` son módulos de esquemas reales con código fuente, pero no son paquetes del workspace: ninguno contiene `package.json`. Contienen 10 archivos de esquemas Zod canónicos (cinco de auth, cinco de transactions), dos barrels y tests Vitest colocados junto al código. Sus imports directos de `zod` dependen por lo tanto de hacks de path en los tsconfig de los consumidores en lugar de un grafo de dependencias propio del paquete. El workaround actual existe tanto en `apps/api/tsconfig.json` como en `apps/web/tsconfig.json`, no solo en API. El blast radius de imports fuente directos es de **11 archivos de producción** (más fixtures de config/test y comentarios), y no hay imports cross-slice entre los dos módulos shared.

## §1. Estado actual de los directorios huérfanos

### `libs/features/auth/shared/`

Archivos presentes:
- `schemas/forgot-password.ts` — esquema de request Zod y tipo inferido `ForgotPasswordInput`.
- `schemas/login.ts` — esquema de request Zod y tipo inferido `LoginInput`.
- `schemas/register.ts` — esquema de request Zod y tipo inferido `RegisterInput`.
- `schemas/reset-password.ts` — esquema de request Zod y tipo inferido `ResetPasswordInput`.
- `schemas/session-list.ts` — esquema de response Zod y tipo inferido `SessionListResponse`.
- `schemas/index.ts` — barrel que re-exporta los cinco esquemas/tipos.
- `schemas/__tests__/forgot-password.test.ts`, `login.test.ts`, `register.test.ts`, `reset-password.test.ts`, `session-list.test.ts` — tests Vitest colocados junto al código.

No existe `package.json` en ninguna parte directamente en `libs/features/auth/shared/`.

Los cinco archivos fuente de esquemas importan exactamente `import { z } from "zod"`; no tienen imports cross-slice ni imports de módulos locales. `session-list.ts` exporta un esquema runtime y un tipo inferido; no contiene implementación de utilidades ni de dominio.

### `libs/features/transactions/shared/`

Archivos presentes:
- `schemas/category-create.ts` — esquema Zod y tipo inferido `CreateCategoryInput`.
- `schemas/category-update.ts` — esquema Zod y tipo inferido `UpdateCategoryInput`.
- `schemas/create.ts` — esquema Zod y tipo inferido `CreateTransactionInput`.
- `schemas/list.ts` — esquema de query Zod y tipo inferido `ListTransactionsQuery`.
- `schemas/update.ts` — esquema Zod y tipo inferido `UpdateTransactionInput`.
- `schemas/index.ts` — barrel que re-exporta los cinco esquemas/tipos.
- `schemas/__tests__/category-create.test.ts`, `category-update.test.ts`, `create.test.ts`, `list.test.ts`, `update.test.ts` — tests Vitest colocados junto al código.
- Existe un `schemas/node_modules/.vite/vitest/.../results.json` sin trackear/generado en el árbol de trabajo; no es código fuente y no debe convertirse en un artefacto del paquete.

No existe `package.json` en ninguna parte directamente en `libs/features/transactions/shared/`.

Los cinco archivos fuente de esquemas de transactions importan exactamente `import { z } from "zod"`; ningún esquema importa otro slice o módulo local. Las exportaciones de fuente son solo esquemas runtime Zod más tipos TypeScript inferidos.

## §2. Estructura de paquetes relacionados

`libs/features/auth/server/package.json`:
- `name`: `@features/auth`
- `version`: `1.1.1`
- `main`: `./src/index.ts`
- `dependencies`: `@core/config`, `@core/database`, `@core/events`, `bcryptjs`, `next-auth`, `zod@4.4.3`
- `devDependencies`: `@types/bcryptjs`, `@types/node`, `typescript`, `vitest`, `eslint`, y `zod@4.4.3` duplicado
- También privado, ESM (`type: module`), con scripts test/typecheck/lint/bdd y una entrada de exports.

`libs/features/transactions/server/package.json`:
- `name`: `@features/transactions`
- `version`: `1.1.1`
- `main`: `./src/index.ts`
- `dependencies`: `@core/config`, `@core/database`, `@core/events`, `@shared-utils/decimal`, `zod@4.4.3`
- `devDependencies`: `@types/node`, `typescript`, `vitest`, `eslint`, y `zod@4.4.3` duplicado
- También privado, ESM, con scripts de paquete equivalentes y estructura de exports.

`libs/features/auth/shared/schemas/session-list.ts` exporta:
- Runtime: `sessionListSchema`.
- Tipo: `SessionListResponse = z.infer<typeof sessionListSchema>`.
- Es un contrato puro de frontera; no exporta utilidades ni entidades de dominio.

`libs/features/auth/server/src/index.ts` re-exporta el barrel shared de auth mediante:
`../../shared/schemas/index.js`, exponiendo `forgotPasswordSchema`, `loginSchema`, `registerSchema`, `resetPasswordSchema`, `sessionListSchema`, y sus tipos inferidos. `auth/server/src/auth-service.ts` también importa `loginSchema` y `registerSchema` desde ese mismo barrel shared relativo.

`libs/features/transactions/server/src/index.ts` re-exporta análogamente los cinco esquemas/tipos de transactions/categories desde `../../shared/schemas/index.js`.

## §3. Workaround actual de tsconfig

`apps/api/tsconfig.json` tiene:
- `baseUrl: "../.."`
- `moduleResolution: "node"`
- aliases `paths` para core/features más:
  `"zod": ["node_modules/.pnpm/zod@4.4.3/node_modules/zod"]`
- Su `include` compila explícitamente ambos árboles de esquemas huérfanos:
  `../libs/features/auth/shared/schemas/**/*.ts` y `../libs/features/transactions/shared/schemas/**/*.ts`.

El JSDoc inmediatamente arriba del mapping dice que cierra la brecha de resolución de esquemas huérfanos porque los directorios shared no tienen `package.json` y el ancestor-walk de Node10 no puede llegar a zod. El path exacto pineado es `node_modules/.pnpm/zod@4.4.3/node_modules/zod`.

Hallazgo adicional importante: el mismo workaround está presente en `apps/web/tsconfig.json`, con el mismo path exacto de pnpm y un comentario que afirma que espeja el fix de API. Los paths de web también incluyen `@features/transactions/shared/*`; auth usa el mapping más amplio `@features/auth/*`. Por lo tanto, quitar el workaround debe abordar ambos tsconfig de las apps, no solo API.

## §4. Blast radius

No hay imports de un slice shared al otro. Los importadores de producción son:

- `libs/features/auth/server/src/auth-service.ts` — importa `loginSchema`, `registerSchema`, `LoginInput`, `RegisterInput` mediante el path relativo `../../shared/schemas/index.js`. La Forma B puede preservarlo; la Forma A lo cambiaría al nombre del paquete shared o sus exports.
- `libs/features/auth/server/src/index.ts` — re-exporta los cinco esquemas/tipos de auth mediante el path relativo `../../shared/schemas/index.js`. Misma decisión de path que arriba.
- `libs/features/transactions/server/src/index.ts` — re-exporta los cinco esquemas/tipos de transactions mediante el path relativo `../../shared/schemas/index.js`.
- `apps/web/components/auth/LoginForm.tsx` — importa `loginSchema`, `LoginInput` desde `@features/auth/shared/schemas`.
- `apps/web/components/auth/SignUpForm.tsx` — importa `registerSchema`, `RegisterInput` desde `@features/auth/shared/schemas`.
- `apps/web/components/auth/ForgotPasswordForm.tsx` — importa `forgotPasswordSchema`, `ForgotPasswordInput` desde `@features/auth/shared/schemas`.
- `apps/web/components/auth/ResetPasswordForm.tsx` — importa `resetPasswordSchema`, `ResetPasswordInput` desde `@features/auth/shared/schemas`.
- `apps/web/components/transactions/CreateTransactionForm.tsx` — importa `createSchema`, `CreateTransactionInput` desde `@features/transactions/shared/schemas`.
- `apps/web/components/transactions/EditTransactionForm.tsx` — importa `updateSchema`, `UpdateTransactionInput` desde `@features/transactions/shared/schemas`.
- `apps/web/components/transactions/CategoryManager.tsx` — importa `categoryCreateSchema`, `categoryUpdateSchema` desde `@features/transactions/shared/schemas`.
- `apps/web/lib/transactions-api.ts` — importa esquemas/tipos de transactions desde `@features/transactions/shared/schemas`.

Acoplamiento adicional de no-producción/config/test:
- `apps/api/tsconfig.json` incluye ambos árboles.
- `apps/web/tsconfig.json` mapea los aliases y contiene el segundo workaround de zod.
- `apps/web/vitest.config.ts` aliasa los barrels de los esquemas shared directamente a paths fuente.
- `libs/features/auth/server/vitest.config.ts` y `libs/features/transactions/server/vitest.config.ts` incluyen los tests de esquemas shared por paths relativos.
- Las fixtures de las reglas de frontera referencian los aliases shared a propósito y deben seguir siendo válidas, pero deben chequearse si los exports/paths del paquete cambian.

El aparente `importer_count` no es por lo tanto cero en el codebase: hay 11 importadores de producción, más referencias de harness de test y de configuración. No se encontró ningún import shared cross-slice.

## §5. Restricciones del proyecto

`AGENTS.md` §7 requiere:
- schemas solo bajo `libs/features/<x>/shared/schemas/` o core config;
- ningún import cross-module directo entre slices de features;
- el código client no debe importar paths de server.

La división de paquetes propuesta preserva la ubicación de los esquemas y la separación de bounded-context de auth/transactions. No se acepta duplicación de schemas bajo §8; server y web deben seguir usando el mismo barrel canónico.

`pnpm-workspace.yaml` declara:
- `apps/*`
- `libs/*`
- `libs/*/*`
- `libs/*/*/*`
- `tools/*`
- `tools/*/*`

Por lo tanto `libs/features/auth/shared` y `libs/features/transactions/shared` ya matchean el glob del workspace mecánicamente. Quedan fuera del grafo de paquetes de pnpm solo porque les falta `package.json`.

## §6. Candidatos de forma del fix

### Forma A — paquetes shared dedicados (recomendada)

Agregar un manifiesto de paquete por directorio shared, probablemente con nombres `@features/auth/shared` y `@features/transactions/shared`, con metadata ESM, exports para `.` y posiblemente `./schemas`, y `zod@4.4.3` en `dependencies`. Actualizar los aliases/imports de server/web para consumir la frontera del paquete y eliminar ambos mappings de zod de los tsconfig. Mantener el layout de fuente y los barrels.

- Delta de LOC: aproximadamente +25–40 LOC para dos manifiestos, más pequeñas ediciones de path/export y eliminación de dos entradas/comentarios de mapping.
- Riesgo: medio; los nombres de paquete/exports y la resolución de paths de TypeScript deben alinearse entre pnpm, Next, Vitest, y Node/Nest.
- Blast radius: 11 importadores de producción, dos tsconfig de las apps, aliases/configs de Vitest, y metadata de lock/workspace del paquete.
- Reversibilidad: alta; los manifiestos y cambios de path están aislados y pueden revertirse sin mover archivos de esquemas.

### Forma B — manifiestos de paquete preservando el layout relativo

Agregar manifiestos y metadata de tsconfig/paquete propia, pero retener los imports relativos de server actuales y los paths `@features/*/shared/schemas` existentes. Esto minimiza las ediciones de fuente; el barrel del paquete sigue siendo la costura. Quitar los mappings de zod después de probar que cada compilador resuelve el `zod` local del paquete.

- Delta de LOC: aproximadamente +25–40 LOC de manifiestos más eliminación de mapping/comentario de tsconfig; poco o ningún churn de imports de producción.
- Riesgo: medio-alto; los imports que atraviesan `../../shared` siguen acoplados al filesystem y las fronteras de paquete son menos explícitas. Un grafo de dependencias local al paquete puede no ayudar a los archivos compilados directamente por un tsconfig de app si esos archivos siguen siendo traídos por aliases de path en lugar de resolverse como entrypoints de paquete.
- Blast radius: menor churn de fuente, pero alto riesgo de validación de resolución/config entre API y web.
- Reversibilidad: alta.

### Forma C — mover los esquemas a los paquetes server existentes

Mover cada árbol de esquemas bajo el paquete server de su feature (por ejemplo `server/src/schemas/`), luego actualizar todos los imports y paths de test/config. Esto hace que la propiedad de la dependencia de zod sea directa, pero viola la costura client/server compartida intencional actual y la regla documentada `no-schemas-outside-shared` a menos que esa regla/spec se cambie.

- Delta de LOC: la más alta, probablemente 100+ paths/líneas de comentarios/config cambiados más actualizaciones de reglas/spec.
- Riesgo: alto; debilita directamente la separación client/server, arriesga importar código del paquete server en web, y crea un cambio arquitectónico más grande que el bug de resolución.
- Blast radius: los 11 importadores de producción, configs de test, aliases de las apps, documentación/comentarios, y fixtures/reglas de frontera.
- Reversibilidad: media-baja porque los movimientos de archivos y cambios de path crean diffs amplios.

Recomendación: Forma A. Alinea la propiedad de las dependencias con la arquitectura existente: los esquemas shared son un contrato client/server y deben ser consumibles de forma independiente, mientras que cada bounded context posee su propio paquete y dependencia directa de `zod`. La Forma B es un fallback de migración útil solo si los exports del paquete se hacen deliberadamente transparentes y la resolución del compilador se demuestra en ambas apps.

## §7. Contrato de verificación

La fase de implementación debe probar:
- `pnpm turbo run test bdd lint typecheck build` sale con 0.
- 145/145 tests de web pasan.
- 22/22 tests de API pasan.
- 43/43 escenarios BDD pasan.
- Tanto `apps/api/tsconfig.json` como `apps/web/tsconfig.json` ya no contienen el workaround del path de zod del store de pnpm.
- Los 10 archivos de esquemas preservan el comportamiento y siguen siendo la fuente única de verdad.
- No se introducen imports cross-slice y las fixtures de frontera siguen verdes.

## Listo para Propuesta

Sí. La causa raíz y el blast radius completo de implementación están suficientemente claros. La propuesta debe incluir explícitamente el workaround del tsconfig de web como parte del fix, no solo el mapping de API, y debe elegir la Forma A a menos que el equipo acepte intencionalmente la semántica más débil de frontera de paquete de la Forma B.

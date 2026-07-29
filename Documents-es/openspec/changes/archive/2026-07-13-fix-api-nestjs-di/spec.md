# Especificación Delta — `fix-api-nestjs-di`

> **Cambio**: `fix-api-nestjs-di` · **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-api-nestjs-di`
> **Modo**: interactivo · **Almacén de artefactos**: hybrid
> **Fecha**: 2026-07-13
> **Forma del fix (decisión interactiva)**: **C** — quitar `type` + restaurar ancla en AMBOS controllers + cubrir transactions + nueva regla ESLint.
> **PR único**: 10 archivos, ~245 LOC netas, bien bajo el presupuesto de revisión de 400 líneas.
> **Propuesta**: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`, `sdd/fix-api-nestjs-di/proposal`)
> **Brief de exploración**: `openspec/changes/fix-api-nestjs-di/explore.md` (Engram `#2286`)
> **Commit de causa raíz**: `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor")

---

## 1. Encabezado

| Campo | Valor |
|-------|-------|
| Proyecto | `gastos-personales-reference` |
| Clave del proyecto | `gp-v2` |
| Rama | `feat/fix-api-nestjs-di` (cortada desde `develop@ea7732f`) |
| Fecha | 2026-07-13 |
| Autor | Orquestador SDD → `sdd-spec` (ejecutor · modelo `MiniMax-M3`) |
| Estado | borrador · fase de spec |
| Fuente | Propuesta Engram `#2287`; Exploración Engram `#2286`; commit `3db761f` del PR-2 del slice-7 |
| Forma del fix | C (decisión interactiva capturada en proposal §0) |
| Almacén de artefactos | hybrid (Engram + OpenSpec) |
| Estrategia de entrega | `auto-chain` (>400 LOC auto-chains) — **N/A este cambio**; 245 LOC se queda en PR único |

---

## 2. Intención

El PR-2 del slice-7 (`3db761f`) reescribió `import { AuthService, … }` → `import { type AuthService, … }` en `apps/api/src/modules/auth/auth.controller.ts` Y eliminó el ancla de runtime `private static readonly _ServiceAnchor` en el mismo commit, pero mantuvo el comentario que prometía el ancla. Bajo `isolatedModules: true` (`tsconfig.base.json` línea 10) la forma `import type` se borra completamente en tiempo de compilación, por lo que el DI reflexivo de NestJS ve `undefined` para el parámetro del constructor en el índice `[0]` y lanza `Nest can't resolve dependencies of the AuthController (?, Object, Object, Object)` — su propio error explícitamente dice "This commonly occurs when using 'import type' instead of 'import' for injectable classes". El controller latente de transactions tiene el mismo patrón `import { type Foo }` en 3 servicios (`CategoryService`, `ThresholdService`, `TransactionService` en L22, 25, 27) pero no entrega ningún test e2e, por lo que el bug está a una regresión de re-emerger. Esta spec bloquea el fix en 6 metas testeables: quitar `type` + restaurar el ancla en AMBOS controllers, escribir un spec e2e RED-first de transactions que pruebe el bug latente, añadir una nueva regla ESLint del plugin de boundary `no-import-type-injectable` para que la regresión no pueda regresar sin ser detectada, escribir la ADR 0008 + su espejo en español documentando la decisión, y probar todo lo anterior con un pipeline turbo en verde.

---

## 3. Metas

### G1 — Los tests e2e de auth cambian de RED a GREEN

Los 21 escenarios e2e actualmente fallando en `apps/api/test/{auth,jwt-auth-guard,session-expiry}.e2e-spec.ts` (14 + 4 + 3) DEBEN pasar tras arreglar los sitios de import del auth controller y restaurar el ancla de runtime. El cambio DEBE observarse en orden estricto TDD RED-luego-GREEN: un test que falla y reproduce el error de DI existe ANTES del cambio de producción; solo se escribe el código mínimo para pasar; más casos triangulan el comportamiento de borde.

### G2 — La cadena de DI del controller de transactions está cableada correctamente (test RED-first)

`apps/api/test/transactions.e2e-spec.ts` DEBE escribirse como un NUEVO spec e2e RED-first que arranca `TransactionsModule` vía `Test.createTestingModule({ imports: [TransactionsModule] }).compile()`. El test DEBE fallar con el mismo patrón `?, Object, Object, Object` que los tests de auth ANTES de que el controller de transactions se arregle (porque los 3 imports de servicios se borran bajo `isolatedModules`), y DEBE pasar después de que el controller se arregle. El test de transactions ejercita un bug latente que ha estado enviándose silenciosamente desde el slice 5.

### G3 — La regla ESLint bloquea la regresión en la fuente

Una nueva regla del plugin de boundary llamada `no-import-type-injectable` (resuelta desde Q1 de la propuesta — más clara que el nombre originalmente sugerido) DEBE añadirse a `tools/eslint-plugin-boundary/rules/` y activarse en `configs.recommended`. La regla DEBE marcar `import { type X }` siempre que `X` se use como parámetro de constructor de una clase decorada con `@Controller` o `@Injectable` en el mismo módulo. La regla DEBE ser conservadora: si el símbolo no puede resolverse en el mismo archivo (por ejemplo, importado de otro archivo), la regla DEBE omitir — nunca sobre-reportar. Los DTOs e interfaces usados solo como anotaciones de tipo NO DEBEN disparar la regla (verificado por la fixture válida).

### G4 — `pnpm lint:fixtures` sale con 0 con la nueva regla activa

La nueva regla DEBE tener una fixture `valid.ts` (0 errores) y una fixture `invalid.ts` (≥1 error) bajo `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/`, y `pnpm lint:fixtures` DEBE salir con 0 con la regla registrada en el array `RULES` de `scripts/run-fixtures.mjs`. El runner DEBE ejercitar ambos fixtures como un par TDD RED-luego-GREEN: regla cableada antes de que el cuerpo de la regla se implemente (RED); cuerpo de la regla implementado y fixtures pasan (GREEN).

### G5 — Pipeline turbo completo en verde en la rama del fix

`pnpm turbo run test bdd lint typecheck` DEBE salir con 0 en `feat/fix-api-nestjs-di`. Las cuatro tareas DEBEN reportar código de salida 0. La suite de tests de `apps/api` DEBE reportar 0 tests fallando, incluyendo el nuevo spec e2e de transactions de G2 y los 21 escenarios previamente fallando de G1.

### G6 — La ADR 0008 documenta la decisión (con anti-ejemplo)

La ADR 0008 DEBE existir en `docs/architecture/decisions/0008-no-import-type-injectable.md`, cubriendo causa raíz, opciones consideradas, decisión, y consecuencias. Por resolución interactiva de Q2 de la propuesta, la ADR DEBE incluir un pequeño anti-ejemplo mostrando el patrón roto `import { type Service }` para que futuros mantenedores vean qué previene la regla. El espejo en español en `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` DEBE existir en el mismo commit atómico, DEBE espejar la estructura en inglés, y DEBE ser CJK-clean (`grep -P '[\x{4e00}-\x{9fff}]'` retorna vacío).

---

## 4. No-metas

Lo siguiente está explícitamente **fuera de alcance** para este cambio (espejado de proposal §2.2 + AGENTS.md §11):

1. Refactorizar los internos de `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` / `CategoryService` / `ThresholdService` / `TransactionService` — se quedan donde están.
2. Añadir `@Injectable()` a los 7 servicios — violaría el diseño hexagonal §2 ("el código de dominio es libre de framework").
3. Migración del patrón de scaffold de referencia del slice-1 a un mecanismo de DI diferente (`useClass`, `useFactory: ... inject[]`, o anclas persistidas con una forma diferente).
4. Tocar los arrays de providers de `AuthModule` / `TransactionsModule` — el cableado es sólido; el bug está aguas arriba de la resolución de providers.
5. Nuevos escenarios BDD más allá del 1 test RED mínimo para transactions (ya una decisión deliberada por Q3).
6. Cualquier cambio en `apps/web` o `libs/features/*/client/*` — el fix es solo de API.
7. Cambiar `tsconfig.base.json` (`isolatedModules: true` es correcto; el bug está en la elección del import).
8. Cualquier cambio en el cableado del cliente Prisma, env config, o `@core/database`.
9. Enforzamiento del gate de cobertura en CI (AGENTS.md §11).
10. Migrar `gastos-personales/` al modelo de vertical-slicing (AGENTS.md §11; el playbook se entrega por separado en slice-8 8.4).
11. i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción, observabilidad, UI de audit log (AGENTS.md §11).
12. Refactorizar `tools/eslint-plugin-boundary` a TypeScript (las reglas son `.cjs`; convertirlas es su propio cambio).
13. Reemplazar el manejo de errores del controller, la forma de logging, la proyección de respuesta, o el mapeo de HTTP status.
14. Reemplazar la resolución de barrel export de `@features/auth` (no se necesita — el fix está en el sitio del import, no en el layout del paquete).
15. Añadir un `_ServiceAnchor` a cualquier otro controller además de `AuthController` y `TransactionsController` — estos son los únicos dos controllers de NestJS en `apps/api/` confirmados que cargan la clase del bug (verificado por blast radius de codegraph; ver explore §6.2).

---

## 5. Requerimientos funcionales

> Palabras clave según RFC 2119. MUST = requerimiento absoluto. SHOULD = recomendado pero no bloqueante. MAY = opcional.

### R1 — `auth.controller.ts` importa como valor los 4 servicios

Los tipos de los parámetros del constructor de `apps/api/src/modules/auth/auth.controller.ts` para `AuthService`, `PasswordResetService`, `RbacService`, y `SessionService` DEBEN importarse con la palabra clave `type` ELIMINADA (usar imports de valor) para que el DI reflexivo de NestJS pueda resolver las clases en runtime bajo `isolatedModules: true`. Las anotaciones `type` restantes en DTOs (`CurrentUser`) y en esquemas derivados de zod que NO se usan como parámetros de constructor DEBEN permanecer sin cambios.

### R2 — `auth.controller.ts` restaura el ancla de runtime `_ServiceAnchor`

La clase `AuthController` DEBE declarar un campo de runtime `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [AuthService, PasswordResetService, RbacService, SessionService]` que referencie los 4 servicios como valores de runtime. Este ancla provee una segunda defensa independiente contra regresiones futuras de `import type` — incluso si el linter o una ejecución futura de biome re-introduce `type` en los imports, el ancla mantiene los símbolos vivos en runtime. El ancla DEBE ser el ÚLTIMO campo en la clase (preferencia estilística; coincide con el comentario "AUTO-FORMATTER MITIGATION" existente en L112-118 del archivo antes del fix).

### R3 — `transactions.controller.ts` importa como valor los 3 servicios y añade un ancla

Los tipos de los parámetros del constructor de `apps/api/src/modules/transactions/transactions.controller.ts` para `CategoryService`, `ThresholdService`, y `TransactionService` DEBEN importarse con la palabra clave `type` ELIMINADA, y la clase DEBE declarar un ancla de runtime análoga `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [CategoryService, ThresholdService, TransactionService]` como ÚLTIMO campo en la clase. Un bloque de comentario "AUTO-FORMATTER MITIGATION" análogo al del auth controller DEBE acompañar al ancla.

### R4 — La nueva regla ESLint `no-import-type-injectable` existe y está registrada

Una nueva regla ESLint DEBE añadirse a `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (espejando la forma `module.exports = { meta, create }` de módulo único `.cjs` de las 5 reglas existentes). El predicado de la regla DEBE dispararse cuando `(specifier.importKind === "type")` Y el nombre importado resuelve (vía resolución conservadora de símbolos local al archivo) a una clase usada como parámetro de constructor en una clase decorada con `@Controller` o `@Injectable` en el mismo archivo. La regla DEBE omitir (no reportar) cuando el símbolo no puede resolverse en el mismo archivo (tie-breaker conservador; nunca sobre-reportar). Los DTOs e interfaces usados solo como anotaciones de tipo NO DEBEN disparar la regla.

### R5 — La nueva regla está registrada en el plugin, la config recomendada, el runner, y la config ESLint del workspace

La nueva regla DEBE registrarse en `tools/eslint-plugin-boundary/index.cjs` (añadida al map `plugin.rules` Y al bloque `configs.recommended`) Y en `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (añadida al array `RULES`). DEBE ser ejercitada por `pnpm lint:fixtures` (no se necesita glob extra; los globs de la config `recommended` aplican globalmente sobre `**/*.{ts,tsx,js,mjs,cjs}` según `eslint.config.mjs`).

### R6 — La nueva regla tiene un par de fixtures positiva y negativa

Una fixture `valid.ts` (sin errores) y una fixture `invalid.ts` (≥1 error) DEBEN existir bajo `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/`. La `valid.ts` DEBE incluir un controller que (a) importa servicios como valores de runtime (permitido) y (b) importa al menos un DTO / interface con `import { type X }` (permitido). La `invalid.ts` DEBE incluir un controller que importa una clase inyectable con `import { type Service }` para usar como parámetro de constructor.

### R7 — El test e2e RED-first de transactions existe y ejercita la cadena de DI

Un nuevo test e2e DEBE escribirse en `apps/api/test/transactions.e2e-spec.ts` ANTES de que el controller de transactions se arregle. El test DEBE arrancar `TransactionsModule` vía `Test.createTestingModule({ imports: [TransactionsModule] }).compile()` y asserir que el módulo resuelto está definido. El test DEBE mockear `@core/database` y `bcryptjs` en la frontera (espejando `auth.e2e-spec.ts` L35-52). El test DEBE fallar con el mismo patrón `?, Object, Object, Object` que los tests de auth ANTES del fix y DEBE pasar después del fix.

### R8 — Los 21 escenarios e2e de auth previamente fallando pasan todos

Los 14 escenarios en `apps/api/test/auth.e2e-spec.ts`, los 4 escenarios en `apps/api/test/jwt-auth-guard.e2e-spec.ts`, y los 3 escenarios en `apps/api/test/session-expiry.e2e-spec.ts` (total 21) DEBEN pasar todos tras el fix. Ningún decorador `skip` / `todo` / `xfail` puede añadirse a ninguno de estos escenarios como workaround. Cada escenario DEBE ejecutar la llamada `compile()` real (sin shim `overrideProvider` que enmascararía el fallo de DI).

### R9 — La ADR 0008 + espejo en español existen, el espejo es CJK-clean

La ADR 0008 DEBE existir en `docs/architecture/decisions/0008-no-import-type-injectable.md` siguiendo el formato `0007-slice-8-doc-loc-exception.md`: Contexto, Decisión, Consecuencias, más un pequeño anti-ejemplo mostrando el patrón roto `import { type Service }` (por resolución interactiva de Q2 de la propuesta). El espejo en español DEBE existir en `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` en el mismo commit atómico según AGENTS.md §13, y DEBE ser una traducción técnica al español (no localización cultural). `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` DEBE retornar vacío (exit 1).

### R10 — Pipeline turbo completo en verde

`pnpm turbo run test bdd lint typecheck` DEBE salir con 0 en `feat/fix-api-nestjs-di`. La suite de tests de `apps/api` DEBE reportar 0 tests fallando, incluyendo los 21 escenarios de auth previamente fallando de R8 y el nuevo escenario de transactions de R7.

### R11 — La ADR cita el commit fuente de la regresión

La ADR 0008 DEBERÍA referenciar el commit `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor") como la fuente de la regresión para que futuros mantenedores puedan rastrear la clase del bug hasta su origen.

### R12 — `_ServiceAnchor` es el ÚLTIMO campo en cada clase controller

El campo estático `_ServiceAnchor` DEBERÍA declararse como el ÚLTIMO campo en tanto `AuthController` como `TransactionsController`. Esto es una preferencia estilística para que futuros mantenedores lo vean como una preocupación lateral, separada del comportamiento real del controller. (Los anclas nunca se acceden en runtime; son un marcador para el linter.)

---

## 6. Escenarios

> Formato Gherkin Dado/Cuando/Entonces. Cada escenario DEBE ser ejecutable como un test automatizado.
>
> 11 escenarios en total: G1 (3 — uno por archivo fallando), G2 (1), G3 (3 — bloquear / permitir DTO / omitir no resuelto), G4 (1), G5 (1), G6 (1).

### Escenarios de G1 (flip e2e de auth RED → GREEN)

#### Escenario: El test e2e de auth arranca sin fallo de DI

- DADO que `apps/api/src/modules/auth/auth.controller.ts` declara un constructor que toma `AuthService`, `SessionService`, `PasswordResetService`, `RbacService` como imports de valor (sin palabra clave `type`)
- Y `AuthController` declara un ancla de runtime `private static readonly _ServiceAnchor` que referencia los 4 servicios
- CUANDO el bootstrap del test ejecuta `Test.createTestingModule({ imports: [AuthModule] }).compile()`
- ENTONCES NestJS NO DEBE loguear `Nest can't resolve dependencies of the AuthController`
- Y `apps/api/test/auth.e2e-spec.ts` DEBE salir con 0 con los 14 escenarios PASANDO

#### Escenario: El test e2e de jwt-auth-guard arranca sin fallo de DI

- DADO que `AuthModule` está completamente cableado con los 4 servicios resueltos en runtime
- CUANDO el bootstrap del test en `apps/api/test/jwt-auth-guard.e2e-spec.ts` ejecuta `Test.createTestingModule({ imports: [AuthModule] }).compile()`
- ENTONCES NestJS NO DEBE loguear `Nest can't resolve dependencies of the AuthController`
- Y `apps/api/test/jwt-auth-guard.e2e-spec.ts` DEBE salir con 0 con los 4 escenarios PASANDO

#### Escenario: El test e2e de session-expiry arranca sin fallo de DI

- DADO que `AuthModule` está completamente cableado con los 4 servicios resueltos en runtime
- CUANDO el bootstrap del test en `apps/api/test/session-expiry.e2e-spec.ts` ejecuta `Test.createTestingModule({ imports: [AuthModule] }).compile()`
- ENTONCES NestJS NO DEBE loguear `Nest can't resolve dependencies of the AuthController`
- Y `apps/api/test/session-expiry.e2e-spec.ts` DEBE salir con 0 con los 3 escenarios PASANDO

### Escenarios de G2 (test RED-first de transactions)

#### Escenario: La cadena de DI del controller de transactions está cableada correctamente

- DADO que `apps/api/src/modules/transactions/transactions.controller.ts` declara un constructor que toma `TransactionService`, `CategoryService`, `ThresholdService` como imports de valor (sin palabra clave `type`)
- Y `TransactionsController` declara un ancla de runtime `private static readonly _ServiceAnchor` que referencia los 3 servicios
- CUANDO un nuevo test e2e arranca `TransactionsModule` vía `Test.createTestingModule({ imports: [TransactionsModule] }).compile()`
- ENTONCES NestJS NO DEBE loguear `Nest can't resolve dependencies of the TransactionsController`
- Y el nuevo `apps/api/test/transactions.e2e-spec.ts` DEBE salir con 0 con su escenario de bootstrap PASANDO

### Escenarios de G3 (la regla ESLint bloquea la regresión)

#### Escenario: La regla ESLint bloquea `import { type Service }` para clases inyectables en archivos @Controller

- DADO un archivo que tiene un decorador `@Controller()`
- Y el archivo importa una clase decorada con `@Injectable()` usando la sintaxis `import { type X }` para usar como parámetro de constructor
- CUANDO ESLint ejecuta la regla `no-import-type-injectable` sobre ese archivo
- ENTONCES la regla DEBE reportar un diagnóstico
- Y el mensaje del diagnóstico DEBE referenciar tanto la declaración del import (archivo + línea) como el nombre del controller

#### Escenario: La regla ESLint NO bloquea `import { type DTO }` para referencias solo de tipo

- DADO un archivo controller que importa un tipo DTO con `import { type CreateUserInput }` para usar solo como anotación de tipo del cuerpo de request (NO como parámetro de constructor)
- CUANDO ESLint ejecuta la regla `no-import-type-injectable` sobre ese archivo
- ENTONCES la regla NO DEBE reportar un diagnóstico
- Y `pnpm lint` sobre el archivo DEBE salir con 0

#### Escenario: La regla ESLint omite cuando el símbolo importado no se resuelve en el mismo archivo

- DADO un archivo controller que importa `import { type ExternalService }` desde `@features/external` (un símbolo exportado por barrel cuya definición vive en un archivo diferente)
- CUANDO ESLint ejecuta la regla `no-import-type-injectable` sobre ese archivo
- ENTONCES la regla DEBE omitir el reporte (tie-breaker conservador; nunca sobre-reportar cuando el símbolo no puede resolverse local al archivo)
- Y el archivo NO DEBE mostrar el diagnóstico de la regla en la salida de `pnpm lint`

#### Escenario: `_ServiceAnchor` es el ÚLTIMO campo en ambos controllers

- DADO que tanto `AuthController` como `TransactionsController` declaran un campo estático `_ServiceAnchor`
- CUANDO un futuro mantenedor lea cualquiera de los archivos
- ENTONCES el `_ServiceAnchor` DEBE aparecer después del constructor en el orden del fuente (verificado vía números de línea de `grep -n`)
- Y el campo ancla DEBE estar marcado como `private static readonly` para que sea invisible en runtime (sin cambio de superficie de API pública)

### Escenarios de G4 (lint:fixtures en verde)

#### Escenario: `pnpm lint:fixtures` sale con 0 con la nueva regla activa

- DADO que la fixture `valid.ts` tiene 1+ `import { type X }` para DTOs/interfaces (permitido) y 0 para inyectables
- Y la fixture `invalid.ts` tiene 1+ `import { type Service }` para una clase inyectable
- CUANDO `pnpm lint:fixtures` se ejecuta
- ENTONCES la fixture válida DEBE reportar 0 errores
- Y la fixture inválida DEBE reportar ≥1 error
- Y el código de salida DEBE ser 0

### Escenario de G5 (pipeline turbo completo en verde)

#### Escenario: Todas las tareas turbo pasan en `feat/fix-api-nestjs-di`

- DADO que el fix se ha aplicado (controllers auth + transactions + regla ESLint + ADR + espejo)
- CUANDO `pnpm turbo run test bdd lint typecheck` se ejecuta en `feat/fix-api-nestjs-di`
- ENTONCES las 4 tareas DEBEN salir con 0
- Y la suite de tests de `apps/api` DEBE pasar con 0 tests fallando
- Y los 21 escenarios de auth previamente fallando DEBEN PASAR
- Y el nuevo escenario de transactions DEBE PASAR

### Escenario de G6 (la ADR documenta la decisión)

#### Escenario: La ADR 0008 existe con anti-ejemplo y espejo en español

- DADO que el mantenedor aprobó la Forma C en la fase de propuesta
- Y la Q2 de la propuesta se resolvió para incluir un pequeño anti-ejemplo
- CUANDO se escribe la ADR 0008 en `docs/architecture/decisions/0008-no-import-type-injectable.md`
- ENTONCES la ADR DEBE incluir un pequeño anti-ejemplo mostrando el patrón roto `import { type Service }` en un constructor de controller
- Y la ADR DEBE explicar por qué `import { type X }` se borra bajo `isolatedModules: true` (citar `tsconfig.base.json` línea 10)
- Y el espejo en español en `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` DEBE existir con la misma estructura (secciones Contexto / Decisión / Consecuencias / Anti-ejemplo)
- Y `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` DEBE salir con 1 (sin match)
- Y `grep -P '[\x{4e00}-\x{9fff}]' docs/architecture/decisions/0008-no-import-type-injectable.md` DEBE salir con 1 (sin match, verificación defensiva en la fuente en inglés)

---

## 7. Superficie de restricciones

### 7.1 Fronteras arquitectónicas (AGENTS.md §7 — enforced por ESLint)

- **`no-prisma-outside-core`**: El fix NO DEBE introducir `new PrismaClient()` en ningún lugar fuera de `libs/core/database/src/`. Los 7 servicios todos toman `PrismaClient?` como argumento opcional de constructor y caen a `defaultPrisma`; esto DEBE permanecer sin cambios.
- **`no-schemas-outside-shared`**: Los esquemas Zod DEBEN quedarse en `libs/features/<x>/shared/schemas/` o `libs/core/config/env.schema.ts`. El fix no toca esquemas Zod.
- **`no-client-server-import`**: `libs/features/<x>/client/` NO DEBE importar de paths `*/server/`. El fix es solo de API y no toca código cliente.
- **`no-cross-module-import`**: `libs/features/<x>/...` NO DEBE importar directamente de `libs/features/<y>/...`. El fix preserva la forma de import existente (`@features/auth`, `@features/transactions`).
- **`no-mojibake-in-docs`** (opcional, slice-8 8.3): `Documents-es/**/*.md` NO DEBE contener codepoints CJK. R9 enforce esto a nivel de spec para el nuevo espejo de la ADR; la regla en sí se vuelve operacional una vez que `@eslint/markdown` esté cableado (slice-8 8.3).
- **NUEVA `no-import-type-injectable`** (este cambio): marcar `import { type X }` para clases inyectables usadas como parámetros de constructor de controller / clase inyectable. Ver R4, R5, R6.

### 7.2 TDD estricto (AGENTS.md §4)

El fix sigue el orden **RED → GREEN → TRIANGULATE → REFACTOR**. Cada cambio de producción en este cambio aterriza SOLO después de que un test fallando que reproduce el fallo ha sido observado:

| Paso | Orden | ¿Test primero? | ¿Código de producción primero? |
|------|-------|-----------------|-------------------------------|
| 1. Escribir `transactions.e2e-spec.ts` | 1 | SÍ (RED: el test falla con `?, Object, Object, Object`) | no |
| 2. Quitar `type` + restaurar ancla en `auth.controller.ts` | 2 | ya RED vía los 21 tests existentes | SÍ (GREEN: 21 tests pasan) |
| 3. Quitar `type` + añadir ancla en `transactions.controller.ts` | 3 | ya RED vía paso 1 | SÍ (GREEN: nuevo test pasa) |
| 4. Cuerpo de regla ESLint + fixtures | 4 | RED: la fixture `invalid.ts` lanza o retorna conteo incorrecto | SÍ: cuerpo de la regla GREENa las fixtures |
| 5. Verificar | 5 | n/a | n/a |

### 7.3 Commits atómicos (AGENTS.md §5) y Conventional Commits (AGENTS.md §6)

- Cada commit es una unidad de trabajo (los tests + el cambio de producción que verifican aterrizan juntos).
- Sin "Co-Authored-By" / sin atribución de IA en ningún mensaje de commit.
- Vocabulario de tipos: `fix`, `feat`, `test`, `docs`, `chore`, `refactor`.
- Subject ≤72 chars, imperativo, sin punto final.
- La ADR + espejo en español DEBEN aterrizar en el mismo commit atómico (regla dura de AGENTS.md §13).

### 7.4 Modelo de ramas (AGENTS.md §2)

- Rama de trabajo: `feat/fix-api-nestjs-di` cortada desde `develop` (NO desde `main`).
- `main` es inmutable; sin force-push, sin delete, sin amend de commits históricos.
- `git revert <merge-sha>` revierte limpiamente todo el PR.

### 7.5 Única fuente de verdad (AGENTS.md §8)

- Sin duplicación de servicios. Los 7 servicios se quedan en sus paths canónicos; solo los imports del controller y el campo ancla del controller cambian.
- La nueva regla ESLint es la única fuente de verdad para "no usar `import type` para inyectables" — sin guarda duplicada en otro lugar.

### 7.6 Espejo en español (AGENTS.md §13)

- Este archivo de spec (`openspec/changes/fix-api-nestjs-di/spec.md`) NO se espeja intencionalmente al momento de creación de la spec. La regla del espejo se dispara en el commit atómico que introduce los archivos `.md` fuente de verdad (`docs/architecture/decisions/0008-no-import-type-injectable.md` + su espejo `Documents-es/`) — que aterriza en la fase de apply.
- La propuesta y los briefs de exploración tampoco se espejaron (preceden a esta spec). La regla del espejo NO aplica retroactivamente a los `openspec/changes/fix-api-nestjs-di/{proposal,explore}.md` existentes — ver precedente del archivo del slice-8 donde la `spec.md` tampoco se espejó.

---

## 8. Plan de pruebas

| Meta | Comando de test | Resultado esperado |
|------|-----------------|-------------------|
| G1 (flip de auth) | `pnpm --filter api test auth.e2e-spec jwt-auth-guard.e2e-spec session-expiry.e2e-spec` | sale con 0; 21/21 PASAN |
| G2 (transactions RED-first) | `pnpm --filter api test transactions.e2e-spec` | sale con 0; 1/1 PASA (tras el fix; ANTES del fix DEBE salir non-zero) |
| G3 (la regla ESLint bloquea) | `pnpm lint:fixtures` (fixture inválida) | la fixture inválida reporta ≥1 error |
| G4 (lint:fixtures en verde) | `pnpm lint:fixtures` | sale con 0; valid=0 / invalid≥1 |
| G5 (turbo completo) | `pnpm turbo run test bdd lint typecheck` | sale con 0 en las 4 tareas |
| G6 (ADR + espejo) | `bash -c 'grep -P "[\x{4e00}-\x{9fff}]" Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md'` | sale con 1 (sin match) — igual para la fuente en inglés |

### Pasos de verificación manual / no-CI

- `pnpm --filter api test --reporter=verbose` para enumerar cada uno de los 21 escenarios y confirmar que no hay decoración `.skip` / `.todo`.
- `git show 3db761f -- apps/api/src/modules/auth/auth.controller.ts` para confirmar que el commit fuente de la regresión está preservado (NO amended o rebased).
- `ls Documents-es/docs/architecture/decisions/` para confirmar que el espejo de la ADR 0008 está presente.
- `wc -l docs/architecture/decisions/0008-no-import-type-injectable.md` para confirmar que la ADR es un artefacto real (no un stub).

---

## 9. Criterios de aceptación

> Condiciones binarias pasa/falla para `sdd-verify`. Cada criterio DEBE ser testeable desde un `git checkout feat/fix-api-nestjs-di && pnpm install` limpio.

| # | Criterio | Condición de pase |
|---|----------|-------------------|
| AC1 | `auth.controller.ts` no tiene `import { type Service }` para los 4 servicios | `grep -E "type (AuthService\|PasswordResetService\|RbacService\|SessionService)" apps/api/src/modules/auth/auth.controller.ts` retorna sin matches |
| AC2 | `auth.controller.ts` declara `_ServiceAnchor` como último campo | `grep -n "_ServiceAnchor" apps/api/src/modules/auth/auth.controller.ts` muestra la declaración del campo presente después del constructor |
| AC3 | `transactions.controller.ts` no tiene `import { type Service }` para los 3 servicios | `grep -E "type (CategoryService\|ThresholdService\|TransactionService)" apps/api/src/modules/transactions/transactions.controller.ts` retorna sin matches |
| AC4 | `transactions.controller.ts` declara `_ServiceAnchor` como último campo | `grep -n "_ServiceAnchor" apps/api/src/modules/transactions/transactions.controller.ts` muestra el campo presente |
| AC5 | `apps/api/test/transactions.e2e-spec.ts` existe | el archivo está presente y arranca `TransactionsModule` |
| AC6 | El archivo de regla existe | `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` está presente |
| AC7 | La regla está registrada en el plugin | `grep "no-import-type-injectable" tools/eslint-plugin-boundary/index.cjs` retorna ≥2 matches (map de reglas + config recomendada) |
| AC8 | La regla está registrada en el runner | `grep "no-import-type-injectable" tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` retorna ≥1 match |
| AC9 | Las fixtures existen | `ls tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/{valid,invalid}.ts` tiene éxito |
| AC10 | `pnpm lint:fixtures` sale con 0 | código de salida 0; valid=0 errores, invalid≥1 error |
| AC11 | `pnpm --filter api test` sale con 0 | código de salida 0; 21/21 tests de auth previamente fallando PASAN; 1/1 nuevo test de transactions PASA |
| AC12 | `pnpm turbo run test bdd lint typecheck` sale con 0 | código de salida 0 en las 4 tareas |
| AC13 | ADR 0008 EN existe | `docs/architecture/decisions/0008-no-import-type-injectable.md` está presente |
| AC14 | ADR 0008 ES espejo existe | `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` está presente |
| AC15 | Ambas ADRs son CJK-clean | `grep -P "[\x{4e00}-\x{9fff}]" <ambos archivos>` sale con 1 para ambos |
| AC16 | La ADR contiene anti-ejemplo | la ADR EN contiene un bloque de código fenced mostrando `import { type Service }` como el patrón roto |
| AC17 | La ADR cita `3db761f` | la ADR EN menciona el commit `3db761f` (o "slice-7 PR-2") como la fuente de la regresión |
| AC18 | Ningún commit toca `main` | `git log main` no cambia desde `ea7732f` después de que el PR mergea |
| AC19 | Sin `Co-Authored-By` en ningún commit | `git log feat/fix-api-nestjs-di --pretty=format:"%B" \| grep -i "co-authored-by"` retorna vacío |
| AC20 | PR único apunta a `develop` | la rama base del PR es `develop` (no `main`) |

---

## 10. Fuera de alcance

(Espejado de proposal §2.2 + AGENTS.md §11; las no-metas arriba son operacionales, esta sección es la verificación formal de revisión.)

1. Cualquier cosa en AGENTS.md §11.
2. Refactorizar los internos de los 7 servicios.
3. Añadir `@Injectable()` a los 7 servicios.
4. Cambiar los arrays de providers de `AuthModule` / `TransactionsModule`.
5. Tocar `apps/web` o `libs/features/*/client/*`.
6. Cambiar `tsconfig.base.json` (`isolatedModules: true` se queda).
7. Añadir nuevos escenarios BDD (solo el 1 test e2e RED mínimo para transactions).
8. Añadir el job e2e de Playwright a CI.
9. Refactorizar `tools/eslint-plugin-boundary` a TypeScript.
10. Tocar `openspec/changes/{vertical-slicing-reference-scaffold, slice-8-closing-bdd-and-docs}/`.
11. Tocar la evidencia de la cadena del slice-7 (`3db761f`, `a9b550d`, `bb25aab`).
12. Migración de `gastos-personales/` (el playbook se entrega en slice-8 8.4).
13. Enforzamiento del gate de cobertura en CI.
14. Reemplazar el manejo de errores, logging o proyección de respuesta del controller.
15. Un campo `_ServiceAnchor` en cualquier controller aparte de `AuthController` y `TransactionsController`.

---

## 11. Preguntas abiertas — RESUELTAS

La propuesta difirió 3 preguntas a la fase de spec. Ahora están resueltas:

### Q1 — Nombre de la regla ESLint

**Resuelto**: nombrar la regla **`no-import-type-injectable`**.

Razonamiento: el nombre se lee como un predicado negativo (no importar un tipo para una clase inyectable), que es exactamente el comportamiento de la regla. Es más estrecho y claro que `@typescript-eslint/no-import-type-on-injectable` (que implica falsamente un plugin del ecosistema typescript-eslint) y más claro que el nombre originalmente sugerido `no-import-type-in-controller` (que implicaría que la regla se dispara en todos los archivos controller independientemente del uso de constructor, cuando de hecho se dispara solo cuando el tipo se usa como parámetro de constructor de un controller/injectable). Alcance del predicado: clases inyectables de NestJS (decoradores `@Controller` o `@Injectable`) referenciadas como parámetros de constructor en el mismo módulo.

### Q2 — Anti-ejemplo de la ADR

**Resuelto**: incluir un pequeño anti-ejemplo en la ADR 0008.

Razonamiento: según precedente de `0007-slice-8-doc-loc-exception.md`, las ADR en este repo son prosa narrativa sin código. La decisión interactiva de incluir un anti-ejemplo (un bloque de código fenced mostrando el patrón roto `import { type AuthService }`) ayuda a futuros mantenedores a ver qué previene la regla — el mismo principio de intuición que un par "MAL" / "BIEN" en un CONTRIBUTING.md. El anti-ejemplo es corto (≤10 LOC) y vive en línea con la sección Decisión, no como un apéndice separado.

### Q3 — Cobertura del test e2e de transactions

**Resuelto**: un test enfocado de escenario único (1 bloque `it`).

Razonamiento: prueba mínima del bug latente. Evita sobre-especificar el controller de transactions en este punto — el controller ya tiene 25/25 escenarios BDD pasando según el cierre del slice-7 `bb25aab`, por lo que el trabajo del test e2e es prueba RED-first de la cadena de DI, no cobertura completa de rutas. La asignación de 30 LOC en la tabla de áreas afectadas de la propuesta cubre este escenario único limpiamente. Si el orquestador luego quiere más cobertura e2e para transactions, eso es un cambio separado con su propio ciclo de vida SDD.

---

## 12. Trazabilidad

Meta → Requerimiento → Escenario → Comando de test:

| Meta | Requerimientos | Escenarios | Comando de test |
|------|----------------|------------|-----------------|
| G1 | R1, R2, R8 | G1.1 (`auth.e2e-spec`), G1.2 (`jwt-auth-guard.e2e-spec`), G1.3 (`session-expiry.e2e-spec`) | `pnpm --filter api test` |
| G2 | R3, R7 | G2.1 (`transactions.e2e-spec`) | `pnpm --filter api test transactions.e2e-spec` |
| G3 | R4 | G3.1 (bloquear en controller), G3.2 (permitir tipo DTO), G3.3 (omitir símbolos no resueltos de otros archivos) | `pnpm lint:fixtures` (fixture inválida) |
| G4 | R5, R6 | G4.1 (fixtures en verde) | `pnpm lint:fixtures` |
| G5 | R10 | G5.1 (turbo completo) | `pnpm turbo run test bdd lint typecheck` |
| G6 | R9, R11, R12 | G6.1 (ADR + espejo + anti-ejemplo + CJK-clean), más verificación estilística ancla-último | `grep -P "[\x{4e00}-\x{9fff}]" <archivos ADR>` (manual) |

### Matriz criterio de aceptación ↔ requerimiento

| Requerimiento | Criterio de aceptación |
|---------------|------------------------|
| R1 | AC1 |
| R2 | AC2 |
| R3 | AC3, AC4 |
| R4 | AC6 |
| R5 | AC7, AC8 |
| R6 | AC9 |
| R7 | AC5 |
| R8 | AC11 |
| R9 | AC13, AC14, AC15 |
| R10 | AC11, AC12 |
| R11 | AC17 |
| R12 | AC2, AC4 |

### Mitigación riesgo ↔ requerimiento

| Riesgo (proposal §7) | Mitigado por |
|----------------------|--------------|
| R1 (el fix del auth controller rompe el provider de AuthModule) | R8 + escenarios G1 (flip RED-luego-GREEN completo es la verificación empírica) |
| R2 (la regla ESLint da falsos positivos en DTOs/interfaces) | R4 predicado conservador + R6 fixture valid.ts incluye un caso `import { type X }` de DTO |
| R3 (el auto-formatter re-introduce `type`) | R2 + R3 (anclas) + R4 (regla ESLint) — defensa en profundidad |
| R4 (skip/todo silencioso enmascara fallos) | Escenarios G1 + verificación manual `pnpm --filter api test --reporter=verbose` |
| R5 (la regla se dispara erróneamente en argumentos de tipo genéricos) | R4 predicado conservador + R6 fixture valid.ts |
| R6 (el espejo en español se entrega con drift CJK) | R9 + AC15 + puerta explícita G6.1 grep |

---

## Referencias cruzadas

- **Propuesta**: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`)
- **Brief de exploración**: `openspec/changes/fix-api-nestjs-di/explore.md` (Engram `#2286`)
- **Commit de causa raíz**: `3db761f` (slice-7 PR-2)
- **Smoking-gun error**: "This commonly occurs when using 'import type' instead of 'import' for injectable classes" de NestJS
- **`tsconfig.base.json`**: línea 10 (`isolatedModules: true`)
- **Bootstrap de smoking-gun**: `apps/api/test/auth.e2e-spec.ts` L35-52
- **Tests fallando (21)**: `apps/api/test/{auth,jwt-auth-guard,session-expiry}.e2e-spec.ts`
- **Bug latente**: `apps/api/src/modules/transactions/transactions.controller.ts` L22, 25, 27
- **Cableado de módulo (sólido)**: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/modules/transactions/transactions.module.ts`
- **Plugin de boundary**: `tools/eslint-plugin-boundary/index.cjs` + `scripts/run-fixtures.mjs` + 5 reglas existentes
- **Precedente de ADR**: `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md`
- **Seguimiento del slice-8**: ADR 0007 §F1 (este cambio cierra Gate 3 de la verificación del slice-8)
- **Convenciones del proyecto**: AGENTS.md §2 (rama), §4 (TDD estricto), §5 (commits atómicos), §6 (Conventional Commits), §7 (plugin de boundary), §8 (única fuente de verdad), §11 (fuera de alcance), §13 (espejo en español)
- **Referencia de formato canónico de spec**: `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/spec.md` (archivo del slice-8)

---

**Siguiente fase**: `design` (sdd-design producirá la forma exacta del cuerpo de la regla `.cjs`, los contenidos de las fixtures, las líneas de diff del controller, y el esqueleto de la ADR — todo traduciendo el QUÉ al CÓMO).
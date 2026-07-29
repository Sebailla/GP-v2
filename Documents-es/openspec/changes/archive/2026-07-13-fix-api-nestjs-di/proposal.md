# Propuesta — `fix-api-nestjs-di`

> **Estado**: borrador · fase de propuesta · **Fecha**: 2026-07-13
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-api-nestjs-di`
> **Almacén de artefactos**: hybrid · **Modo**: interactivo
> **Forma del fix (decisión interactiva)**: **C** — quitar `type` + restaurar ancla + cubrir transactions + añadir guarda ESLint.
> **PR único**: 10 archivos, ~245 LOC netas, bien bajo el presupuesto de revisión de 400 líneas.

---

## 1. Intención

El slice 8 (`slice-8-closing-bdd-and-docs`) verificó en `develop@ea7732f` y reportó Gate 3 / deuda preexistente del slice-7 bajo la observación F1: **21 tests e2e en `apps/api/test/{auth,jwt-auth-guard,session-expiry}.e2e-spec.ts` fallan con `Nest can't resolve dependencies of the AuthController (?, Object, Object, Object)`**. La causa raíz está verificada (no hipotética): el commit `3db761f` del PR-2 del slice-7 simultáneamente reescribió `import { AuthService, … }` → `import { type AuthService, … }` Y eliminó el ancla de runtime `private static readonly _ServiceAnchor` en `apps/api/src/modules/auth/auth.controller.ts`. Con `isolatedModules: true` en `tsconfig.base.json` (línea 10), `import type` se borra completamente en tiempo de compilación, por lo que el DI reflexivo de NestJS ve `undefined` para el parámetro del constructor en el índice `[0]` y no puede resolver ninguno de los 4 servicios (`AuthService`, `SessionService`, `PasswordResetService`, `RbacService`). El propio mensaje de error de NestJS dice explícitamente "This commonly occurs when using 'import type' instead of 'import' for injectable classes". El mismo patrón `import { type Service }` está presente (latente, sin probar) en `apps/api/src/modules/transactions/transactions.controller.ts` en las líneas 23, 25, 27 para `CategoryService`, `ThresholdService`, `TransactionService` — cada slice añadido desde el slice 5 ha estado a un futuro test e2e de una ruptura de DI oculta. Este cambio quita la palabra clave `type` + restaura el ancla estática en AMBOS controllers, escribe un spec e2e RED-first que pruebe el bug de transactions, y añade una nueva regla ESLint `no-import-type-injectable` al plugin de boundary local para que la regresión no pueda regresar sin ser detectada. Blast radius: 4 servicios en auth (actual) + 3 en transactions (latente) = 8 puntos de quiebre de DI ocultos, 21 tests rotos, todo a ser resuelto por un único PR.

---

## 2. Alcance

### 2.1 En alcance

1. `apps/api/src/modules/auth/auth.controller.ts` — quitar la palabra clave `type` en los 4 imports de servicios (`AuthService`, `PasswordResetService`, `RbacService`, `SessionService`) en las líneas 16-19, y restaurar el campo `private static readonly _ServiceAnchor` que el commit `3db761f` eliminó (referenciado por el comentario "AUTO-FORMATTER MITIGATION" todavía presente en las líneas 112-118).
2. `apps/api/src/modules/transactions/transactions.controller.ts` — el mismo tratamiento en los 3 imports de servicios en las líneas 23, 25, 27 (`CategoryService`, `ThresholdService`, `TransactionService`) y añadir un campo `_ServiceAnchor` análogo + bloque de comentario.
3. Nuevo test RED-first `apps/api/test/transactions.e2e-spec.ts` — spec e2e mínimo (1 escenario de bootstrap de controller) que ejercita la cadena de DI de transactions; reproduce el mismo patrón de error que `auth.e2e-spec.ts` muestra actualmente; aterriza en GREEN tras el fix del controller.
4. Nueva regla ESLint `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` — marca `import { type X }` siempre que `X` se use como parámetro de constructor de una clase decorada con `@Controller` / `@Injectable` en el mismo módulo. Espeja la estructura de `no-cross-module-import.cjs` (`.cjs`, patrón de visitor ESTree).
5. Fixtures de regla ESLint: `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/{valid,invalid}.ts` (espejan la forma del path de producción usada por `no-prisma-outside-core`).
6. Cablear la nueva regla en `tools/eslint-plugin-boundary/index.cjs` (registrar en el map `plugin.rules`, añadir al bloque `configs.recommended`) y `eslint.config.mjs` (sin glob extra; el glob de la config `recommended` aplica globalmente sobre `**/*.{ts,tsx,js,mjs,cjs}`).
7. Registrar la nueva regla en `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (entrada del array `RULES`).
8. `pnpm lint:fixtures` sale con 0 con la nueva regla activa (fixture positiva reporta 0 errores; fixture negativa reporta ≥1).
9. Los 21 escenarios e2e actualmente fallando en `auth.e2e-spec.ts` (14) + `jwt-auth-guard.e2e-spec.ts` (4) + `session-expiry.e2e-spec.ts` (3) pasan todos.
10. Nuevo escenario RED-first de transactions pasa tras el fix.
11. Nueva ADR `docs/architecture/decisions/0008-no-import-type-injectable.md` documenta la decisión aprobada por el mantenedor (según precedente de `0007-slice-8-doc-loc-exception.md` para excepciones de tamaño, pero no se necesita excepción aquí — bien bajo cualquier tope).
12. Espejo en español `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` según AGENTS.md §13 (mismo commit atómico; `grep -P '[\x{4e00}-\x{9fff}]'` retorna 0).
13. Observación Engram en `topic_key sdd/fix-api-nestjs-di/proposal`, `type=architecture`, `project=gp-v2`, `scope=project` persiste la propuesta en el almacén de artefactos hybrid.

### 2.2 Fuera de alcance

- Cualquier refactor de los internos de `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` / `CategoryService` / `ThresholdService` / `TransactionService`.
- Añadir decoradores `@Injectable()` a los 4+3 servicios (violaría la frontera hexagonal "el código de dominio es libre de framework" — design §2).
- Migración del patrón de scaffold de referencia del slice-1 a un mecanismo de DI diferente (`useClass`, `useFactory: ... inject[]`, o anclas de runtime persistidas con una forma diferente).
- Tocar los arrays de providers de `AuthModule` / `TransactionsModule` — son sólidos; el bug está aguas arriba de la resolución de providers.
- Cualquier escenario BDD nuevo, cualquier escenario e2e nuevo más allá del 1 test RED mínimo para el bug latente de transactions.
- Cualquier cambio en `apps/web` / `libs/features/*/client/*` (el fix es solo de API).
- Cualquier cambio en `tsconfig.base.json` (`isolatedModules: true` es correcto para el sistema de módulos del proyecto; el bug está en la elección del import).
- Cualquier cambio en el cableado del cliente Prisma, env config, o `@core/database`.
- Enforzamiento del gate de cobertura (declarado fuera de alcance según AGENTS.md §11).
- Migración del repo padre `gastos-personales/` al modelo de vertical-slicing (el playbook se entrega en `slice-8-closing-bdd-and-docs`; la migración corre en un cambio separado).
- i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción, observabilidad, UI de audit log (AGENTS.md §11).
- Refactorizar el plugin de boundary a TypeScript (las reglas son `.cjs`; convertirlas es su propio cambio).
- Reemplazar el manejo de errores del controller, la forma de logging, la proyección de respuesta, o el mapeo de HTTP status.
- Reemplazar la resolución de barrel export de `@features/auth` (no se necesita — el fix está en el sitio del import, no en el layout del paquete).

---

## 3. Enfoque

Cinco pasos, ordenados en estilo TDD estricto. **Ningún cambio de producción aterriza sin un test RED observado primero.**

### Paso 1 — Escribir el test RED-first para el bug latente de transactions

Añadir `apps/api/test/transactions.e2e-spec.ts` con un único escenario `it("boots TransactionsModule")` que llame `expect(await Test.createTestingModule({ imports: [TransactionsModule] }).compile()).toBeDefined()`. Actualmente esto **falla** con el mismo patrón `?, Object, Object` que los tests de auth ya exhiben (los 3 imports de servicios en `transactions.controller.ts` se borran en tiempo de compilación bajo `isolatedModules`). Mockear `@core/database` + bcryptjs en la frontera (espejando el patrón en `auth.e2e-spec.ts` L35-52). Ejecutar `pnpm --filter api test` y observar el fallo. RED capturado.

### Paso 2 — GREEN en el auth controller

Editar `apps/api/src/modules/auth/auth.controller.ts` L15-27: quitar `type` de los 4 imports de servicios; restaurar `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [AuthService, PasswordResetService, RbacService, SessionService]` tras la declaración de la clase (coincidiendo con el comentario en L112-118). Re-ejecutar `pnpm --filter api test`. Los 21 escenarios e2e previamente rotos en `auth.e2e-spec.ts` + `jwt-auth-guard.e2e-spec.ts` + `session-expiry.e2e-spec.ts` se vuelven GREEN.

### Paso 3 — GREEN en el transactions controller

El mismo tratamiento en `apps/api/src/modules/transactions/transactions.controller.ts`: quitar `type` de los 3 imports de servicios en L23, 25, 27; añadir un campo `_ServiceAnchor` análogo. Re-ejecutar `pnpm --filter api test`; el nuevo test RED del Paso 1 se vuelve GREEN.

### Paso 4 — Añadir la regla ESLint (fixture RED → regla GREEN)

Construir el archivo de regla `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs`:
- El visitor escucha en `ImportDeclaration` + `ImportSpecifier`.
- El predicado se dispara cuando `(specifier.importKind === "type")` Y el nombre importado resuelve (vía resolución de símbolos local al archivo, enfoque conservador: solo referencias del mismo archivo) a una clase usada como parámetro de constructor en una clase decorada con `@Controller` o `@Injectable` en el mismo archivo.
- Tie-breaker conservador: si la regla no puede resolver el símbolo (por ejemplo, importado de otro archivo), omitir — nunca sobre-reportar.
- Registrar en el map `plugin.rules` de `tools/eslint-plugin-boundary/index.cjs` y añadir a `configs.recommended`; registrar en el array `RULES` de `scripts/run-fixtures.mjs`.
- Escribir `__fixtures__/no-import-type-injectable/valid.ts` (un controller que importa servicios como valores de runtime, más un controller importando un tipo DTO como `import { type X }`) y `__fixtures__/no-import-type-injectable/invalid.ts` (un controller con `import { type AuthService }` para un parámetro de constructor).
- Ejecutar `pnpm lint:fixtures`. RED primero (la regla no está inicializada; los fixtures lanzan o fallan); GREEN una vez que la regla está cableada correctamente y los fixtures muestran los conteos esperados 0 / ≥1 errores.

### Paso 5 — Verificar

`pnpm turbo run test bdd lint typecheck` sale con 0 en la rama `feat/fix-api-nestjs-di`. Los 21 tests e2e previamente rotos + el nuevo test de transactions + los fixtures de la regla ESLint pasan todos. Los 4 archivos de código de producción se editan mínimamente (+2/-2 líneas cada uno para los controllers). Abrir el PR único contra `develop`.

---

## 4. Capacidades

> Contrato entre esta propuesta y `sdd-spec`. Investigar `openspec/specs/` primero para usar los nombres de capacidades existentes correctos.

### 4.1 Nuevas capacidades

- `api-di-runtime-anchor`: documenta el requerimiento de que los controllers de NestJS (y cualquier clase `@Injectable()`) NO DEBEN usar `import { type X }` para símbolos usados como parámetros de constructor; esos símbolos deben ser referenciados como valores de runtime (ya sea mediante un import explícito sin `type` o mediante un campo estático `_ServiceAnchor`). Se convertirá en `openspec/specs/api-di-runtime-anchor/spec.md`.

### 4.2 Capacidades modificadas

- `bootstrap-e2e`: los `apps/api/test/auth.e2e-spec.ts` / `jwt-auth-guard.e2e-spec.ts` / `session-expiry.e2e-spec.ts` existentes cambiarán de una línea base RED (fallando con errores de DI) a una línea base GREEN. Sin cambio de comportamiento en las rutas de producción — solo el bootstrap tiene éxito donde antes lanzaba. Rastrea el nuevo `apps/api/test/transactions.e2e-spec.ts` para el caso latente de transactions. Se convertirá en una spec delta en `openspec/changes/fix-api-nestjs-di/spec.md` (modifica la capacidad `bootstrap-e2e` existente).

### 4.3 Plugin ESLint de frontera arquitectónica

- El plugin de boundary (`tools/eslint-plugin-boundary/`) gana una sexta regla, `no-import-type-injectable`. La regla se añade a la config `recommended` y es ejercitada por `pnpm lint:fixtures` junto con las 5 existentes.

---

## 5. Áreas afectadas

| Archivo | Cambio | Delta LOC |
|------|--------|----------:|
| `apps/api/src/modules/auth/auth.controller.ts` | Editar (quitar `type` en 4 imports + restaurar campo `_ServiceAnchor`) | +2 / -2 |
| `apps/api/src/modules/transactions/transactions.controller.ts` | Editar (quitar `type` en 3 imports + añadir `_ServiceAnchor`) | +2 / -2 |
| `apps/api/test/transactions.e2e-spec.ts` | Nuevo (spec e2e RED-first, 1 escenario de bootstrap de controller, mocks) | +30 / 0 |
| `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` | Nuevo (regla ESLint) | +50 / 0 |
| `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` | Nuevo (fixture positiva: controller con imports de servicios como runtime + imports de tipo DTO) | +15 / 0 |
| `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` | Nuevo (fixture negativa: controller con `import { type AuthService }` para un parámetro de constructor) | +20 / 0 |
| `tools/eslint-plugin-boundary/index.cjs` | Editar (registrar regla + añadir a la config `recommended`) | +3 / 0 |
| `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` | Editar (añadir entrada `RULES` para `no-import-type-injectable`) | +2 / 0 |
| `docs/architecture/decisions/0008-no-import-type-injectable.md` | Nuevo (ADR pequeño según formato del precedente `0007`) | +60 / 0 |
| `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` | Nuevo (espejo en español según AGENTS.md §13) | +60 / 0 |

**Total estimado**: +249 / -4, ~245 LOC netas. Se mantiene bien bajo el presupuesto de revisión de 400 líneas → **el PR único es apropiado** (no se necesita auto-chain).

---

## 6. Criterios de éxito

`sdd-verify` ejecutará estas 12 puertas.

**Funcional (G1–G4)**: G1 — los 21 tests actualmente fallando en `apps/api/test/{auth,jwt-auth-guard,session-expiry}.e2e-spec.ts` PASAN. G2 — el nuevo test RED-first `transactions.e2e-spec.ts` PASA tras el fix del controller. G3 — `Test.createTestingModule({ imports: [AuthModule] }).compile()` y `Test.createTestingModule({ imports: [TransactionsModule] }).compile()` ambos resuelven con 4 + 3 referencias de clase reales respectivamente (observable mediante el bootstrap teniendo éxito). G4 — los exports públicos de `AuthModule` no cambian: `AuthService, SessionService, RbacService, PasswordResetService, AuthCronService, JwtAuthGuard`.

**Regla ESLint (G5–G7)**: G5 — la nueva regla `@gpr/boundary/no-import-type-injectable` está registrada en `tools/eslint-plugin-boundary/index.cjs`, presente en `configs.recommended`, y referenciada por `scripts/run-fixtures.mjs`. G6 — `pnpm lint:fixtures` sale con 0 con la regla activa: fixture positiva reporta 0 errores, fixture negativa reporta ≥1 error, sin `fatalErrorCount`. G7 — `pnpm turbo run lint` reporta 0 violaciones en el árbol `develop` actual (confirmando conservadoramente que ningún código existente ya viola la regla).

**Higiene (G8–G12)**: G8 — `pnpm turbo run test bdd lint typecheck` sale con 0 en `feat/fix-api-nestjs-di`. G9 — ADR 0008 existe y sigue el formato `0007-slice-8-doc-loc-exception.md`; cubre causa raíz, opciones consideradas, decisión, consecuencias. G10 — el espejo en español `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` existe; `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` retorna vacío. G11 — observación Engram persistida en `topic_key sdd/fix-api-nestjs-di/proposal` con `type=architecture`, `project=gp-v2`, `scope=project`; coincide con `openspec/changes/fix-api-nestjs-di/proposal.md`. G12 — PR único apuntando a `develop`; cada commit respeta atomic-commits (AGENTS.md §5), sin Co-Authored-By (AGENTS.md §6), y la ADR + espejo aterrizan en el mismo commit atómico (AGENTS.md §13).

---

## 7. Riesgos

| ID | Riesgo | Probabilidad | Mitigación |
|----|--------|--------------|------------|
| R1 | El fix del auth controller podría romper algo en `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` si sus factories pierden una dependencia oculta. | Baja | El brief de exploración (§3) ya auditó los providers de `AuthModule` vs. los parámetros del constructor del controller — el cableado es sólido. El flip RED→GREEN de 21 tests en el Paso 2 es la verificación empírica: mismos fixtures, mocks reales de Prisma, mocks reales de bcryptjs. Si algún test aún falla tras el fix, el modo de fallo apunta a un provider (no al controller). |
| R2 | La nueva regla ESLint podría dar falsos positivos en `import { type X }` legítimos para DTOs / interfaces / tipos de parámetros. | Media | El predicado de la regla es estrecho: solo se dispara cuando (a) `specifier.importKind === "type"`, Y (b) el nombre importado se usa como parámetro de constructor en la clase del mismo archivo que lleva `@Controller` o `@Injectable`. Los DTOs e interfaces no son parámetros de constructor de un controller/injectable (sus únicos sitios de referencia son anotaciones de tipo), por lo que el predicado los excluye. La fixture válida ejercita el caso DTO/`import type` explícitamente. |
| R3 | Biome u otro auto-formateador podría re-introducir `type` en los 4+3 imports en la próxima ejecución. | Baja | La nueva regla ESLint está cableada en `configs.recommended` y corre como parte de `pnpm turbo run lint`. CI falla cualquier re-introducción. Los campos estáticos `_ServiceAnchor` proveen una SEGUNDA defensa independiente — incluso si el formateador vence la línea de import, el ancla mantiene la referencia de runtime viva. |
| R4 | Los 3 archivos e2e actualmente saltados/fallando podrían tener un decorador `skip` / `todo` que pasemos por alto — los tests que fallan silenciosamente retornarían PASS. | Baja | El Paso 2 ejecuta `pnpm --filter api test --reporter=verbose` y confirma que cada escenario en `auth.e2e-spec.ts` (14), `jwt-auth-guard.e2e-spec.ts` (4), `session-expiry.e2e-spec.ts` (3) ejecuta el `compile()` real. El paso de verificación G1 enumera los 21 explícitamente. |
| R5 | La lógica AST de la nueva regla ESLint podría dispararse erróneamente en `import { type X }` para símbolos que SÍ son decoradores (por ejemplo, `type Param<T>` usado como argumento de tipo). | Baja | La resolución de la regla es conservadora: solo marca cuando la referencia del símbolo del mismo archivo como parámetro de constructor está presente. Los argumentos de tipo genéricos pasan sin tocarse. La fixture válida incluye un controller que importa un tipo DTO genérico para triangular este caso. |
| R6 | El espejo en español podría entregarse con drift CJK (artefacto de traducción automática según AGENTS.md §13). | Baja | El espejo se traduce manualmente desde la ADR en inglés (no auto-traducido). El paso de verificación G10 ejecuta el grep CJK explícitamente; la futura regla `no-mojibake-in-docs` (slice-8 PRD 8.3) marcará cualquier drift en tiempo de lint una vez que `@eslint/markdown` esté cableado. |

---

## 8. Plan de rollback

**Cambio completo**: `git revert <merge-sha>` en `develop` deshace el PR único limpiamente. Los 21 tests e2e en `apps/api/test/` retornan a su estado previamente roto (aceptable porque los mismos tests ya estaban rotos en `develop@ea7732f` — el reporte de verificación del slice-8 confirmó Gate 3 / deuda preexistente del slice-7 bajo F1). El plugin de boundary retorna a 5 reglas; ninguna otra regla depende del predicado de la nueva. Las restricciones fuera de alcance de AGENTS.md §11 no se tocan.

**Rollback por paso**:

- Pasos 1+2+3 (controllers + test de transactions) — revertir las ediciones del controller. Los tests fallan de nuevo como antes.
- Paso 4 (regla ESLint + fixtures + cableado) — revertir las ediciones del plugin / config / runner. Las otras 4 reglas de boundary continúan enforce. Los archivos de fixture desaparecen; `pnpm lint:fixtures` retoma su línea base de 4 reglas.
- Paso 5 (ADR + espejo) — revertir los archivos `.md`. Sin impacto en runtime.

**NO se hará**: force-push, reescritura de historial, tocar `main`, modificar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/`, o hacer amend del commit `3db761f`. La evidencia de la cadena del slice-7 (`3db761f`, `a9b550d`, `bb25aab`) permanece intacta.

---

## 9. Dependencias

- Formato de regla de `tools/eslint-plugin-boundary/` (`.cjs`, forma `module.exports = { meta, create }` de módulo único) — establecido por `no-prisma-outside-core.cjs` y las otras 4 reglas; no se introduce un nuevo patrón.
- `tsconfig.base.json#isolatedModules: true` — preservado tal cual; el predicado de la regla es exactamente el predicado que el compilador de TypeScript aplica para el borrado de `import { type X }`.
- Tipos de nodo AST de `@types/estree` usados por las reglas existentes (`ImportDeclaration`, `ImportSpecifier`) — reusados tal cual; sin nueva dependencia.
- Infra de tests existente: `apps/api/test/setup-env.ts` (bootstrap de env vars) + `apps/api/vitest.config.ts` (`setupFiles` ya lo referencia) — reusados tal cual; sin nuevo setup necesario para `transactions.e2e-spec.ts`.
- El directorio de cambios OpenSpec `openspec/changes/fix-api-nestjs-di/` ya existe con `explore.md` (Engram #2286).
- `docs/architecture/decisions/` ya existe; ADR 0007 es el precedente de excepción de tamaño. ADR 0008 (este cambio) NO dispara el tope de tamaño.
- La regla `no-mojibake-in-docs` (slice-8 8.3) está cableada pero actualmente inerte según AGENTS.md §13. La verificación basada en grep en G10 es el sustituto de la guarda a nivel de ESLint hasta que `@eslint/markdown` esté completamente activo.

---

## 10. Preguntas abiertas para `sdd-spec`

1. **Alcance de la regla ESLint** — ¿la nueva regla debería aplicar a TODOS los archivos en `apps/api/src/modules/**/*.controller.ts`, o debería confinarse a archivos que importan de `@features/*` (la superficie real donde el DI está en riesgo)? La fase de spec elige uno; la propuesta se mantiene neutral.
2. **Resolución conservadora de símbolos** — el predicado de la regla omite si el símbolo importado no puede resolverse en el mismo archivo. ¿Debería `sdd-design` explorar un modo opt-in que haga resolución cross-file vía `tsconfig.paths` + grafo del proyecto (alcance mayor, valor mayor, más difícil de mantener estable en runtime)? Diferido a menos que la fase de spec/design escale.
3. **Cobertura del nuevo spec e2e de transactions** — ¿debería ser un único escenario (1 bloque `it`, solo bootstrap) o un conjunto pequeño cubriendo los 3 servicios (3 bloques `it`, uno por método de servicio)? La propuesta elige escenario único para la prueba RED. La fase de spec puede extender a la variante de conjunto pequeño si puede mantenerse bajo la asignación de 30 LOC.
4. **Forma de `_ServiceAnchor`** — ¿deberían ambos controllers compartir una única forma canónica (por ejemplo, `private static readonly _ServiceAnchor = [ServiceA, ServiceB] as const`), o cada controller nombra su propio ancla (por ejemplo, `_AuthServiceAnchor`, `_TransactionServiceAnchor`)? La propuesta difiere a spec/design.

---

## 11. Referencias cruzadas

- Brief de exploración: `openspec/changes/fix-api-nestjs-di/explore.md` (observación Engram #2286).
- Commit de causa raíz: `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor").
- Smoking gun: el propio mensaje de error de NestJS — "This commonly occurs when using 'import type' instead of 'import' for injectable classes".
- `tsconfig.base.json` línea 10: `"isolatedModules": true` — el predicado en tiempo de compilación que borra `import type`.
- Patrón de bootstrap e2e: `apps/api/test/auth.e2e-spec.ts` L35-52 (mock de `@core/database` + bcryptjs en la frontera).
- Tests fallando: `apps/api/test/auth.e2e-spec.ts` (14), `apps/api/test/jwt-auth-guard.e2e-spec.ts` (4), `apps/api/test/session-expiry.e2e-spec.ts` (3).
- Bug latente: `apps/api/src/modules/transactions/transactions.controller.ts` L23, 25, 27.
- Cableado de módulo (sólido): `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/modules/transactions/transactions.module.ts`.
- Plugin de boundary: `tools/eslint-plugin-boundary/index.cjs` + `scripts/run-fixtures.mjs` + 5 reglas existentes en `rules/*.cjs`.
- Precedente de ADR: `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md` (patrón de excepción de tamaño, no invocado aquí).
- Seguimiento del slice-8 (F1 de ADR 0007): este cambio es exactamente F1 — cerrando Gate 3 de la verificación del slice-8.
- Convenciones del proyecto: AGENTS.md §4 (TDD estricto), §5 (commits atómicos), §6 (Conventional Commits, sin atribución de IA), §7 (fronteras arquitectónicas), §8 (única fuente de verdad), §11 (lista de fuera de alcance), §13 (espejo en español).
- Precedente de formato de propuesta: `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/proposal.md` (archivo del slice-8).

---

## 12. Siguiente fase

`next_recommended`: **`spec`**.

`sdd-spec` debería:

- Crear `openspec/specs/api-di-runtime-anchor/spec.md` capturando la nueva capacidad (G5–G7 de §6).
- Crear la spec delta para `bootstrap-e2e` en `openspec/changes/fix-api-nestjs-di/spec.md` (G1–G4 de §6).
- Resolver Q1 (alcance de la regla) y Q4 (forma del ancla) explícitamente.
- Para la ADR (G9–G10), declarar el cross-link a Engram #2286 + `0007-slice-8-doc-loc-exception.md`.

`status`: **`success`** · `skill_resolution`: **`paths-injected`** · `risks`: R1–R6 (ver §7).
# Spec Delta — `fix-state-coverage-drift`

> **Cambio**: `fix-state-coverage-drift` · **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (post `e0dc2eb`) → tracker `feat/fix-state-coverage-drift` (off develop)
> **Modo**: `auto` · **Almacén de artefactos**: hybrid · **TDD estricto**: ACTIVO
> **Fecha**: 2026-07-14
> **Forma del fix (decisión auto)**: **A** — anidar la constante `messages` del harness + ajustar 2 aserciones (~10 LOC netas). PR único, 1 archivo, bien por debajo del presupuesto de revisión de 400 líneas → la `delivery_strategy=auto-chain` **NO** se dispara.
> **Propuesta**: `openspec/changes/fix-state-coverage-drift/proposal.md` (Engram `#2373`)
> **Brief de exploración**: `openspec/changes/fix-state-coverage-drift/explore.md` (Engram `#2372`)
> **Causa raíz**: `resolvePath()` de next-intl 3.26.5 (`use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65`) divide `key` por `.` y recorre `messages` por segmento. El `messages` del harness es **plano-con-puntos** (`"transactions.list": { … }`), por lo que `messages["transactions"]` es `undefined` → el resolver lanza → `defaultGetMessageFallback` devuelve la ruta con puntos literal → el DOM renderiza `transactions.list.loading` etc. El `apps/web/messages/en.json` de producción está correctamente anidado; solo el harness está mal. Además 2 fallas secundarias de aserción: `<TransactionsRow>` (TransactionsList.tsx:247-261) renderiza date/amount/categoryId/currencyCode/kind pero **nunca el campo `id`**, por lo que `findByText("txn-1")` y `findByText("txn-2")` no pueden encontrarlo.

---

## 1. Encabezado

| Campo | Valor |
|-------|-------|
| Proyecto | `gastos-personales-reference` |
| Clave del proyecto | `gp-v2` |
| Rama | `feat/fix-state-coverage-drift` (cortada de `develop@e0dc2eb`) |
| Fecha | 2026-07-14 |
| Autor | Orquestador SDD → `sdd-spec` (ejecutor · modelo `MiniMax-M3`) |
| Estado | borrador · fase de spec |
| Fuente | Propuesta Engram `#2373`; Exploración Engram `#2372`; Gate 3 de verificación de slice-8 |
| Forma del fix | A (decisión auto capturada en propuesta §3) |
| Almacén de artefactos | hybrid (Engram + OpenSpec) |
| Estrategia de entrega | `auto-chain` (>400 LOC auto-chain) — **N/A para este cambio**; ~10 LOC netas se quedan en PR único |
| TDD estricto | ACTIVO (RED ya capturado por exit-1 de `pnpm --filter web test`) |

---

## 2. Intención

Tras `fix-web-vitest-crash` (PR #66, mergeado en `develop`) cerrar el OOM de V8 mediante el `vi.mock("next/navigation", …)` izado, la suite vitest de apps/web está VERDE al nivel del runner, pero `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` aún reporta **13 de 25 escenarios fallando**: 11 se deben a que la constante `messages` del harness en `apps/web/__tests__/components/transactions/state-coverage.test.tsx:73-188` tiene forma **plano-con-puntos** (`"transactions.list": { empty: "No transactions yet.", … }`) en lugar de **objetos-anidados** (`{ transactions: { list: { empty: "No transactions yet." } } }`). `resolvePath()` de next-intl 3.26.5 / use-intl 3.26.5 divide la clave solicitada por `.` y recorre `messages` por segmento; con claves planas, cada segmento después del primero es `undefined`, el resolver lanza, y `defaultGetMessageFallback` devuelve la ruta con puntos literal (`use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66`). El DOM por tanto renderiza `transactions.list.loading`, `transactions.list.filter.apply`, `auth.sessions.empty`, etc. — ninguna coincide con las aserciones en inglés visible para el usuario de los tests. Las 11 fallas de forma i18n rompen #1, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13 de la sección §1.1 del brief de exploración. Las 2 fallas restantes (#2, #3) son un issue secundario separado: `<TransactionsRow>` (TransactionsList.tsx:247-261) renderiza `date / amount / categoryId / currencyCode / kind` pero **nunca el campo `id`**, por lo que `findByText("txn-1")` y `findByText("txn-2")` no pueden tener éxito incluso tras el fix de mensajes. El fix verificado (Forma A): anidar la constante `messages` del harness en objetos-anidados para que el `resolvePath` de next-intl la recorra, Y ajustar las 2 aserciones de fila para buscar contenido que la fila realmente renderiza (`cat-1` es el valor recomendado por la §3.4 del brief de exploración — único por fila en el fixture de test, menos propenso a colisiones que `100.00` o `USD`). Blast radius: 1 archivo editado, ~10 LOC netas, ningún componente fuente tocado, sin cambios de versión de dependencias.

---

## 3. Objetivos

### G1 — El comando focalizado de state-coverage sale con 0 con 25/25 pasando

`pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` DEBE salir con 0 con `Tests 25 passed (25)` tras el fix. Los 13 escenarios actualmente fallidos pasan de RED a GREEN mientras que los 12 escenarios ya verdes siguen verdes. Ningún decorador `.skip` / `.todo` / `.xfail` puede añadirse a ninguno de los 25 escenarios como workaround.

### G2 — Los 13 tests que fallaban anteriormente ahora pasan

Los 13 escenarios previamente fallidos DEBEN pasar: las 11 fallas de forma i18n (`#1, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13` de la §1.1 del brief de exploración) se cierran con el anidado de mensajes; las 2 fallas de aserción de id de fila (`#2, #3`) se cierran con aserciones ajustadas que buscan contenido renderizado por la fila. Cero tests DEBEN fallar en el archivo state-coverage tras el fix.

### G3 — Los 12 tests que pasaban anteriormente siguen verdes

Los 12 escenarios que ya pasan en `develop@e0dc2eb` DEBEN seguir pasando tras el fix. Las ediciones del harness (anidar `messages`, ajustar 2 aserciones) NO DEBEN introducir ninguna nueva falla en la suite.

### G4 — La suite completa de apps/web sale con 0 con 145/145 pasando

`pnpm --filter web test` DEBE salir con 0 con `Tests 145 passed (145)`. Este es el número del Gate 3 de verificación de slice-8; `fix-web-vitest-crash` logró que el runner saliera con 0 en principio, pero los 13 escenarios fallidos en este único archivo aún bajan el conteo global. Tras este fix, el gate de tests unitarios de apps/web se cierra.

### G5 — El gate de BDD no regresa

`pnpm turbo run bdd` DEBE seguir saliendo con 0 con **43/43 escenarios** tras el fix. El gate de BDD estaba VERDE en `develop@e0dc2eb` según el reporte de verificación de slice-8; este fix es solo de apps/web-vitest y NO DEBE tocar ningún archivo de feature Cucumber, step definition o workspace-port del harness de BDD.

### G6 — No se modifica ningún archivo fuente de componente

Ningún archivo bajo `apps/web/components/**`, `apps/web/lib/**`, `apps/web/app/**`, `apps/api/**` o `libs/**` puede ser modificado por este PR. `git diff --stat develop feat/fix-state-coverage-drift` filtrado por la unión de esos paths DEBE estar vacío. El fix es solo del harness de test: los únicos archivos en el diff del PR son `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (+25 / -15) más los artefactos SDD bajo `openspec/changes/fix-state-coverage-drift/`.

---

## 4. No-objetivos

Los siguientes están explícitamente **fuera de alcance** para este cambio (espejados de la propuesta §2 + AGENTS.md §11):

1. Modificar el código fuente de `TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`, `CategoryManager` o `SessionList` — los componentes cumplen con el spec; el harness tenía la forma incorrecta.
2. Añadir un `<span data-testid="tx-id">{tx.id}</span>` o cualquier columna de id visible a `<TransactionsRow>` — el test debe asertar sobre contenido renderizado por la fila, no sobre un gancho DOM oculto.
3. Cambiar `apps/web/messages/en.json` o `apps/web/messages/es.json` — los mensajes de producción ya están correctamente anidados; solo el harness está mal.
4. Subir o bajar la versión de next-intl / use-intl — la versión se queda en 3.26.5.
5. Mockear `@/lib/transactions-api` de forma diferente o reestructurar las llamadas a `vi.mock` — el mock por archivo existente es sólido.
6. Añadir tests nuevos o decoraciones `.skip` / `.todo` / `.xfail` a ninguno de los 25 escenarios.
7. Añadir una nueva regla ESLint a `tools/eslint-plugin-boundary/` (p. ej. para la forma de objetos-anidados).
8. Exportar `messages` para reuso entre archivos de test — diferido.
9. Redactar un ADR bajo `docs/architecture/decisions/` para el contrato de objetos-anidados — basta con un comentario JSDoc en el harness según la resolución de la Q1 de la propuesta.
10. Cualquier cambio en `apps/api/`, `libs/features/*/`, `libs/core/*/` — el fix es solo de apps/web.
11. Cualquier cosa en AGENTS.md §11.
12. Un espejo en español de `spec.md` — por instrucción del orquestador + los precedentes de `fix-web-vitest-crash` y `fix-api-nestjs-di`, el spec de la carpeta del cambio es un artefacto de coordinación entre fases SDD; la regla del espejo se dispara para archivos `.md` bajo `docs/` que se entregan como fuente de verdad, no para borradores de spec de carpeta de cambio.

---

## 5. Requisitos funcionales

> Palabras clave según RFC 2119. MUST = requisito absoluto. SHOULD = recomendado pero no bloqueante. MAY = opcional.

### R1 — La constante `messages` del harness se reforma de plano-con-puntos a objetos-anidados

La constante `messages` en `apps/web/__tests__/components/transactions/state-coverage.test.tsx:73-188` DEBE reformarse de modo que cada ruta de clave que el `resolvePath()` de next-intl recorre sea alcanzable avanzando por objetos anidados. Específicamente:

- `"transactions.list": { … }` DEBE pasar a `transactions: { list: { … } }`.
- `"transactions.totals": { … }` DEBE pasar a `transactions: { totals: { … } }` (fusionado dentro del mismo padre `transactions`).
- `"transactions.new": { … }`, `"transactions.edit": { … }`, `"transactions.detail": { … }`, `"transactions.delete": { … }`, `"transactions.actions": { … }`, `"transactions.threshold": { … }` DEBEN pasar cada uno a `transactions: { new: { … }, edit: { … }, detail: { … }, delete: { … }, actions: { … }, threshold: { … } }` (todos fusionados bajo el único padre `transactions`).
- `"categories.list": { … }`, `"categories.form": { … }`, `"categories.delete": { … }`, `"categories.kinds": { … }` DEBEN pasar cada uno a `categories: { list: { … }, form: { … }, delete: { … }, kinds: { … } }` (fusionados bajo el único padre `categories`).
- `"auth.sessions": { … }` DEBE pasar a `auth: { sessions: { … } }`.
- `common: { … }` DEBE quedar sin cambios (ya estaba correctamente anidado en `develop@e0dc2eb`).

Los **strings** de las hojas DEBEN quedar idénticos a los strings en `develop@e0dc2eb` (p. ej. `empty: "No transactions yet."`, `submit: "Create"`, `submit: "Save"`, `loading: "Loading..."`, `empty: "No active sessions."`, `name: "Food"`). Solo cambia la jerarquía envolvente.

### R2 — Las 11 fallas relacionadas con i18n se cierran tras la reforma de `messages`

Tras aplicar R1, las 11 fallas de forma i18n DEBEN cerrarse:

- `TransactionsList > success-empty: shows the empty-state copy` DEBE pasar (aserta `findByText(/No transactions yet/i)`).
- `CreateTransactionForm > loading: shows the categories-loading copy` DEBE pasar (aserta `getByText(/Loading/i)` exactamente una vez).
- `CreateTransactionForm > success: creates the transaction (mocked)` DEBE pasar (aserta `getByRole("button", {name: /create/i})`, `userEvent.click(submit)`, y `expect(createTransaction).toHaveBeenCalled()`).
- `EditTransactionForm > loading: shows the loading copy` DEBE pasar.
- `EditTransactionForm > validation-error: clearing amount surfaces Zod` DEBE pasar (aserta `getByRole("button", {name: /save/i})`).
- `CategoryManager > loading: shows the loading copy` DEBE pasar.
- `CategoryManager > success: shows the category rows` DEBE pasar (aserta `findByText("Food")`).
- `CategoryManager > validation-error: empty form submit shows a Zod error` DEBE pasar.
- `SessionList > loading: shows the loading copy` DEBE pasar.
- `SessionList > empty: shows the empty copy` DEBE pasar (aserta `findByText(/No active sessions/i)`).
- `SessionList > validation-error: read-only list — no error surfaced` DEBE pasar (misma aserción que el caso empty).

El síntoma de "multiple Loading" que afecta a 4 de los 11 (#4, #6, #8, #11) DEBE desaparecer una vez que `t("loading")` devuelva `"Loading..."` en lugar de la clave con puntos literal — la regex `/Loading/i` entonces coincide con el único elemento `<p>Loading...</p>` exactamente una vez.

### R3 — Las 2 fallas de aserción de TransactionsRow se cierran mediante aserciones ajustadas

Las 2 fallas de aserción de id de fila (`TransactionsList > success-non-empty: shows a row for each item` y `TransactionsList > validation-error: row click surfaces no validation error (it's a read-only list)`) DEBEN cerrarse reemplazando las aserciones `findByText("txn-1")` / `findByText("txn-2")` por aserciones sobre **contenido renderizado por la fila** (no sobre `tx.id`, que `<TransactionsRow>` nunca renderiza como texto visible).

**Valor recomendado**: `findByText("cat-1")` (la celda `categoryId`, que es única por fila en el fixture de test — `cat-1` aparece solo en las filas, no en ningún otro nodo de texto). Alternativas aceptables si `cat-1` colisiona: `findByText("USD")` (el código de moneda) o `findByText("expense")` (el kind). La elección DEBE documentarse inline con un comentario de una línea que explique por qué cambió la aserción (`// TransactionsRow renders categoryId/currencyCode/kind/amount/date but not tx.id; assert on the rendered categoryId`).

Los datos del fixture (los campos `id`, `amount`, `currencyCode`, `kind`, `categoryId`, `occurredAt` en los objetos de transacción de test) DEBEN quedar sin cambios — solo cambia el texto de la aserción.

### R4 — `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` sale con 0 con 25/25 pasando

El comando vitest focalizado DEBE salir con 0 y el reporter DEBE emitir `Tests 25 passed (25)`. Esta es la señal binaria de éxito de que G1, G2 y G3 se cumplen simultáneamente.

### R5 — `pnpm --filter web test` sale con 0 con 145/145 pasando

La suite vitest completa de apps/web DEBE salir con 0 con `Tests 145 passed (145)`. Ningún archivo de test distinto de `state-coverage.test.tsx` puede verse afectado; los 18 archivos de test restantes que estaban VERDES antes de este fix DEBEN seguir VERDES. El workaround `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` en `apps/web/vitest.config.ts` (introducido por el commit `36386e1` del PR-7 de slice-7, preservado por `fix-web-vitest-crash`) DEBE quedar sin cambios — este fix es independiente del workaround del OOM.

### R6 — `pnpm turbo run bdd` sigue saliendo con 0 con 43/43 escenarios

La suite BDD DEBE seguir saliendo con 0 con 43/43 escenarios. Ningún archivo de feature Cucumber, step definition, world file o workspace-port puede modificarse.

### R7 — No se modifica ningún archivo fuente de componente

El PR NO DEBE modificar ningún archivo bajo `apps/web/components/**`, `apps/web/lib/**`, `apps/web/app/**`, `apps/api/**` o `libs/**`. `git diff --stat develop feat/fix-state-coverage-drift` filtrado por la unión de esos paths DEBE estar vacío. El fix toca exactamente un archivo fuente: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (+25 / -15). El mock de `apps/web/__tests__/setup.ts` introducido por `fix-web-vitest-crash` NO DEBE modificarse.

### R8 — El objeto `messages` del harness lleva un comentario JSDoc que explica el contrato de objetos-anidados

La constante `messages` DEBERÍA estar precedida por un bloque de comentario estilo JSDoc (o un párrafo `//` inmediatamente encima de la constante) que explique:

1. `resolvePath()` de `next-intl` 3.26.5 recorre los mensajes dividiendo la clave solicitada por `.` y avanzando por objetos anidados por segmento.
2. Las claves planas con puntos embebidos (p. ej. `"transactions.list": { … }`) hacen que `messages["transactions"]` sea `undefined`, el resolver lanza, y el fallback devuelve la ruta con puntos literal.
3. La forma DEBE espejar el árbol del `apps/web/messages/en.json` de producción (que está correctamente anidado) — cada hoja de string y cada nivel intermedio de anidado debe coincidir.
4. Añadir un nuevo namespace de mensajes top-level en `en.json` requiere que la constante `messages` del harness se actualice con la misma estructura de objetos-anidados, o los escenarios de test correspondientes harán fallback silencioso a la renderización de la clave literal.

Este JSDoc es la documentación de la convención; según la resolución de la Q1 de la propuesta, no se redacta ningún ADR por separado.

### R9 — La descripción del PR referencia explícitamente al PR #66 (`fix-web-vitest-crash`) como contexto

La descripción del PR único contra `develop` DEBERÍA incluir una sección "Context" que referencie explícitamente al PR #66 previo (`fix-web-vitest-crash`) como el predecesor inmediato y explique por qué importa este seguimiento: el PR #66 cerró la cascada de OOM y trajo el runner vitest de apps/web de vuelta online, pero 13 escenarios en este único archivo de test siguen fallando porque el harness se escribió con la forma de mensaje incorrecta. Este fix completa el gate de tests unitarios de apps/web (Gate 3 de verificación de slice-8) para que el slice finalmente se cierre.

---

## 6. Escenarios

> Formato Gherkin Given/When/Then. Cada escenario es ejecutable como test automatizado (o un check greppable de shell).
>
> 6 escenarios totales: uno por objetivo G1–G6.

### Escenario G1 (state-coverage 25/25)

#### Escenario: Los 25 escenarios de state-coverage pasan

- GIVEN que la constante `messages` del harness en `apps/web/__tests__/components/transactions/state-coverage.test.tsx` está reformada a objetos-anidados según R1
- AND las 2 aserciones de fila están ajustadas según R3 para buscar contenido renderizado por la fila (p. ej. `cat-1`)
- WHEN `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` se corre desde la raíz del repo en `feat/fix-state-coverage-drift`
- THEN el código de salida DEBE ser 0
- AND 25 de 25 escenarios DEBEN pasar (5 TransactionsList + 5 CreateTransactionForm + 5 EditTransactionForm + 5 CategoryManager + 5 SessionList)
- AND ningún decorador `.skip` / `.todo` / `.xfail` puede haberse añadido a ningún escenario

### Escenario G2 (los 13 que fallaban anteriormente se cierran)

#### Escenario: Los 13 tests que fallaban anteriormente ahora pasan

- GIVEN que las ediciones del harness de R1 (anidado de mensajes) y R3 (aserciones de fila) se han aplicado
- WHEN el archivo de test state-coverage se corre
- THEN 0 tests DEBEN fallar
- AND los 11 tests relacionados con i18n (de §1.1 del brief de exploración: #1, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13) DEBEN pasar con su texto de aserción original
- AND los 2 tests de aserción de TransactionsRow (#2, #3) DEBEN pasar con las aserciones ajustadas de R3

### Escenario G3 (los 12 que pasaban anteriormente siguen verdes)

#### Escenario: Los 12 tests que pasaban anteriormente siguen pasando

- GIVEN que las ediciones del harness de R1 (anidado de mensajes) y R3 (aserciones de fila) se han aplicado
- WHEN el archivo de test state-coverage se corre
- THEN 12 de los escenarios originalmente pasando DEBEN seguir pasando
- AND ninguna nueva falla puede haber sido introducida por las ediciones del harness

### Escenario G4 (suite completa de apps/web)

#### Escenario: La suite completa de apps/web sale con 0

- GIVEN que las ediciones del harness de R1 (anidado de mensajes) y R3 (aserciones de fila) se han aplicado
- AND `apps/web/__tests__/setup.ts` sigue izando `vi.mock("next/navigation", …)` (introducido por `fix-web-vitest-crash`, DEBE quedar sin cambios)
- WHEN `pnpm --filter web test` se corre desde la raíz del repo en `feat/fix-state-coverage-drift`
- THEN el código de salida DEBE ser 0
- AND el reporter vitest DEBE emitir `Tests 145 passed (145)`
- AND no puede aparecer `Worker exited unexpectedly` ni `FATAL ERROR: Ineffective mark-compacts near heap limit` en stderr (la cascada de OOM del PR-7 de slice-7 DEBE seguir arreglada)

### Escenario G5 (BDD no regresa)

#### Escenario: La suite BDD sigue pasando

- GIVEN que el fix vitest de apps/web de R1, R3, R4 se ha aplicado
- WHEN `pnpm turbo run bdd` se corre desde la raíz del repo en `feat/fix-state-coverage-drift`
- THEN 43 de 43 escenarios BDD DEBEN pasar
- AND el código de salida DEBE ser 0
- AND ningún archivo de feature Cucumber, step definition o world file puede aparecer en `git diff --stat develop feat/fix-state-coverage-drift`

### Escenario G6 (sin componente fuente tocado)

#### Escenario: Sin modificaciones de archivos fuente

- GIVEN que el diff del PR entre `feat/fix-state-coverage-drift` y `develop` se calcula
- WHEN el diff se filtra por `apps/web/components/.*\.tsx$|apps/web/lib/.*\.ts$|apps/web/app/.*\.tsx$|apps/api/.*\.ts$|libs/.*\.ts$`
- THEN la lista de archivos filtrada DEBE estar vacía
- AND los únicos archivos cambiados DEBEN ser `apps/web/__tests__/components/transactions/state-coverage.test.tsx` más los artefactos SDD bajo `openspec/changes/fix-state-coverage-drift/`

---

## 7. Superficie de restricciones

### 7.1 Fronteras arquitectónicas (AGENTS.md §7 — enforced por ESLint)

- **`no-prisma-outside-core`**: sin tocar, irrelevante; el fix no toca código Prisma.
- **`no-schemas-outside-shared`**: sin tocar, irrelevante; el fix no toca esquemas Zod.
- **`no-client-server-import`**: sin tocar; el harness es código de test.
- **`no-cross-module-import`**: sin tocar, irrelevante; ningún import de módulo feature cambia.
- **`no-mojibake-in-docs`**: sin tocar. Este spec vive bajo `openspec/changes/` y es un artefacto de coordinación (por instrucción del orquestador + precedente de excepción de AGENTS.md §13: los specs de carpeta de cambio no se espejan).
- **`no-import-type-injectable`** (introducido por `fix-api-nestjs-di`): no implicado; el harness está en `apps/web/__tests__/`, no en un `*.controller.ts` o `*.service.ts`.

El plugin de boundary NO gana una nueva regla para este fix — el contrato de objetos-anidados se enforce por el test mismo (R1 + R2 + G1/G2) en lugar de por una regla de lint. Una futura regla ESLint podría añadirse como seguimiento, pero está fuera de alcance según AGENTS.md §11.

### 7.2 TDD estricto (AGENTS.md §4)

El fix sigue el orden **RED → GREEN → TRIANGULATE → REFACTOR**. El RED ya está capturado por el exit-1 de `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` (13/25 fallando). El GREEN llega cuando el mismo comando sale con 0 con 25/25. El paso de TRIANGULATE es implícito: los 12 tests originalmente pasando sirven como evidencia de triangulación de que la edición de forma de mensajes no regresa escenarios no relacionados. El paso de REFACTOR (el comentario JSDoc de R8) es opcional pero recomendado.

| Paso | Orden | ¿Test primero? | ¿Código de producción primero? |
|------|-------|-------------|------------------------|
| 1 | RED observado (existente) | `pnpm --filter web test state-coverage.test.tsx` sale con 1, 13 fallan | no |
| 2 | Editar harness: anidar `messages`, ajustar 2 aserciones de fila | ya RED por paso 1 | SÍ (GREEN: exit 0, 25/25) |
| 3 | Verificar pipeline completo (`pnpm --filter web test`, `pnpm turbo run bdd`, `pnpm turbo run lint typecheck`) | n/a | n/a |
| 4 | Opcional: añadir párrafo JSDoc según R8 | n/a | SÍ (REFACTOR) |
| 5 | Revisión de PR | n/a | n/a |

### 7.3 Atomic commits (AGENTS.md §5) y Conventional Commits (AGENTS.md §6)

- Este cambio es lo suficientemente pequeño para un solo commit: `fix(test): align state-coverage harness messages to next-intl nested-objects contract`.
- Asunto alternativo aceptable: `test(web): nest state-coverage messages to fix 13 i18n resolution failures`.
- Sin "Co-Authored-By" / sin atribución de IA en el mensaje de commit.
- Vocabulario de tipos: `fix`, `test`, `chore`, `docs`, `refactor`.
- Asunto ≤72 caracteres, imperativo, sin punto final.
- El cuerpo explica el POR QUÉ (`resolvePath` de next-intl 3.26.5 requiere objetos anidados; las 13 fallas eran todas de deriva de forma i18n), no el QUÉ.

### 7.4 Modelo de ramas (AGENTS.md §2)

- Rama de trabajo: `feat/fix-state-coverage-drift` cortada de `develop` (NO de `main`).
- `main` es inmutable; sin force-push, sin delete, sin amend de commits históricos.
- `git revert <merge-sha>` revierte limpiamente todo el PR.
- La evidencia de la cadena de slice-7 (`36386e1`, `2e05fc5`) y `fix-web-vitest-crash` (PR #66) DEBE preservarse intacta.

### 7.5 Fuente única de verdad (AGENTS.md §8)

- El contrato de objetos-anidados para `messages` se define en exactamente un lugar: el comentario JSDoc encima de la constante `messages` en `state-coverage.test.tsx` (según R8).
- Los `apps/web/messages/en.json` y `apps/web/messages/es.json` de producción siguen siendo la fuente de verdad para los strings de mensaje reales; la constante `messages` del harness DEBE espejar esas hojas.
- La configuración de mock en `apps/web/__tests__/setup.ts` (introducida por `fix-web-vitest-crash`) sigue siendo la fuente única de verdad para el mock de `next/navigation`; este fix NO DEBE añadir un mock competidor.

### 7.6 Espejo en español (AGENTS.md §13)

- Este `spec.md` está intencionalmente NO espejado en el momento de creación del spec. Por instrucción del orquestador + los precedentes de `fix-web-vitest-crash` y `fix-api-nestjs-di` (`openspec/changes/archive/2026-07-13-fix-api-nestjs-di/spec.md` tampoco se espejó), el spec de la carpeta del cambio es un artefacto de coordinación entre fases SDD. La regla del espejo se dispara para archivos `.md` bajo `docs/` que se entregan como fuente de verdad. Este cambio no introduce ninguno.

---

## 8. Plan de test

| Objetivo | Comando de test | Resultado esperado |
|------|--------------|----------|
| G1 (state-coverage 25/25) | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25/25 PASS |
| G2 (los 13 que fallaban anteriormente se cierran) | igual que G1 + `grep` para los 13 nombres de test específicos | exit 0; los 13 nombres de escenario aparecen con marcadores `✓` |
| G3 (los 12 que pasaban se quedan verdes) | igual que G1 | exit 0; 12 escenarios originalmente pasando siguen `✓` |
| G4 (suite completa de apps/web) | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)`; sin OOM |
| G5 (BDD no regresa) | `pnpm turbo run bdd` | exit 0; 43/43 escenarios siguen pasando |
| G6 (sin fuente tocada) | `git diff --stat develop feat/fix-state-coverage-drift` filtrado por los paths protegidos | la lista filtrada está vacía |

### Pasos de verificación manuales / no-CI

- `pnpm --filter web test --reporter=verbose apps/web/__tests__/components/transactions/state-coverage.test.tsx` para enumerar cada uno de los 25 escenarios y confirmar que no hay decoración `.skip` / `.todo`.
- `grep -c '\.skip\|\.todo\|\.xfail' apps/web/__tests__/components/transactions/state-coverage.test.tsx` — DEBE ser igual al conteo en `develop@e0dc2eb` (sin nuevas decoraciones).
- `grep -n '"transactions\.\|"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` — DEBE devolver cero coincidencias (prueba que todas las claves planas con puntos están fuera).
- `grep -n 'findByText("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` — DEBE devolver cero coincidencias (prueba que las aserciones de id de fila se ajustaron).
- `git log --oneline develop..feat/fix-state-coverage-drift` para confirmar un único commit de unidad de trabajo (asunto ≤72 chars, sin "Co-Authored-By").
- `git show feat/fix-state-coverage-drift -- apps/web/components apps/web/lib apps/web/app apps/api libs` para confirmar que no hay modificaciones de archivos fuente.
- Leer el párrafo JSDoc encima de `messages` (según R8) para confirmar que explica el contrato de objetos-anidados.

---

## 9. Criterios de aceptación

> Condiciones binarias pasa/falla para `sdd-verify`. Cada criterio es testeable desde un `git checkout feat/fix-state-coverage-drift && pnpm install` fresco.

| # | Criterio | Condición de pasa |
|---|-----------|------------------|
| AC1 | `messages` tiene forma de objetos-anidados | `grep -n '"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve cero coincidencias |
| AC2 | Los 13 árboles de mensajes están fusionados bajo los padres `transactions` / `categories` / `auth` | `grep -nE "^  (transactions\|categories\|auth\|common): \{$" apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve ≥4 coincidencias |
| AC3 | Hojas de string sin cambios | `grep -E '"No transactions yet\.\|empty: "No active sessions\.\|submit: "Create"\|submit: "Save"\|loading: "Loading\.\.\."\|name: "Food"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve las mismas coincidencias que en `develop@e0dc2eb` |
| AC4 | Aserciones de id de fila reemplazadas | `grep -nE 'findByText\("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` devuelve cero coincidencias |
| AC5 | Párrafo JSDoc explica el contrato (R8) | el archivo DEBE contener prosa que explique el requisito de `resolvePath` de next-intl y el modo de falla de las claves plano-con-puntos |
| AC6 | El archivo state-coverage sale con 0 | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` sale con 0; el reporter emite 25 PASS / 0 FAIL |
| AC7 | La suite completa de apps/web sale con 0 | `pnpm --filter web test` sale con 0; `Tests 145 passed (145)` |
| AC8 | Sin OOM en stderr | `pnpm --filter web test 2>&1 \| grep -E "Worker exited\|FATAL ERROR"` sale con 1 (sin coincidencias) |
| AC9 | El gate BDD sigue pasando | `pnpm turbo run bdd` sale con 0; 43/43 escenarios siguen pasando |
| AC10 | Ningún archivo fuente tocado | `git diff --stat develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` devuelve vacío |
| AC11 | Solo `state-coverage.test.tsx` se edita bajo `apps/web/` | `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/'` devuelve exactamente un `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (más posiblemente los artefactos SDD de la carpeta de cambio bajo `openspec/changes/fix-state-coverage-drift/`) |
| AC12 | El mock de `setup.ts` del PR #66 se preserva | `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` devuelve ≥1 coincidencia (sin cambios desde `develop@e0dc2eb`) |
| AC13 | El workaround `pool: "forks"` se preserva | `grep -n 'pool: "forks"' apps/web/vitest.config.ts` devuelve 1 coincidencia (sin cambios desde `develop@e0dc2eb`) |
| AC14 | Sin decoración `.skip` / `.todo` añadida | `grep -cE "\\.(skip\|todo)\\(" apps/web/__tests__/components/transactions/state-coverage.test.tsx` iguala el conteo en `develop@e0dc2eb` |
| AC15 | Sin "Co-Authored-By" en ningún commit | `git log feat/fix-state-coverage-drift --pretty=format:"%B" \| grep -i "co-authored-by"` devuelve vacío |
| AC16 | El asunto del commit es Conventional + ≤72 chars | `git log -1 feat/fix-state-coverage-drift --pretty=format:"%s"` coincide con `^(fix\|feat\|chore\|docs\|test\|refactor\|build\|ci\|perf\|style)\(.+\): .+` y es ≤72 chars |
| AC17 | La rama base del PR es `develop` | el ref `base` del PR es `develop` (NO `main`) |
| AC18 | PR único, sin force-push | el merge es un único squash o merge commit; `git log develop..feat/fix-state-coverage-drift --merges` devuelve ≤1 commit; sin reescritura de historial |
| AC19 | La descripción del PR referencia al PR #66 | el cuerpo del PR DEBE contener una sección "Context" que nombre explícitamente a `fix-web-vitest-crash` como el predecesor inmediato |
| AC20 | El delta de LOC neto está acotado | `git diff --shortstat develop..feat/fix-state-coverage-drift -- 'apps/web/__tests__/components/transactions/state-coverage.test.tsx'` muestra ≤+30 / ≤-20 líneas (coincide con la estimación de ~10 netas de la §4 de la propuesta) |

---

## 10. Fuera de alcance

(Espejado de la propuesta §2 + spec §4 + AGENTS.md §11; los no-objetivos arriba son operativos, esta sección es el chequeo formal de revisión.)

1. Cualquier cosa en AGENTS.md §11.
2. Modificar el código fuente de `TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`, `CategoryManager` o `SessionList`.
3. Añadir un `<span data-testid="tx-id">` oculto o columna de id visible a `<TransactionsRow>`.
4. Cambiar `apps/web/messages/en.json` o `apps/web/messages/es.json`.
5. Subir o bajar la versión de next-intl / use-intl.
6. Reestructurar `vi.mock("@/lib/transactions-api", …)` en `state-coverage.test.tsx:39-54`.
7. Añadir tests nuevos o decoraciones `.skip` / `.todo` / `.xfail` a ninguno de los 25 escenarios.
8. Añadir una nueva regla ESLint a `tools/eslint-plugin-boundary/` para la forma de objetos-anidados.
9. Exportar `messages` para reuso entre archivos de test.
10. Redactar un ADR bajo `docs/architecture/decisions/` (el JSDoc en el harness es la documentación según Q1).
11. Cualquier cambio en `apps/api/`, `libs/features/*/`, `libs/core/*/`.
12. Migración de `gastos-personales/` al modelo de vertical-slicing.
13. i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción, observabilidad, UI de audit log.
14. Tocar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash}/`.
15. Amendar, rebasear o eliminar los commits `36386e1` (workaround del PR-7 de slice-7), `2e05fc5` (split de auth del PR-2 de slice-8) o cualquier commit de `fix-web-vitest-crash` (PR #66).
16. Tocar `apps/web/__tests__/setup.ts` (el mock izado del PR #66 se queda como fuente única de verdad para `next/navigation`).
17. Tocar `apps/web/vitest.config.ts` (el workaround `pool: "forks"` de slice-7 queda sin cambios).
18. Un espejo en español de cualquier archivo bajo `openspec/changes/fix-state-coverage-drift/` (ningún `.md` de fuente de verdad se entrega en este cambio).

---

## 11. Preguntas abiertas — RESUELTAS

La propuesta difirió 3 preguntas a la fase de spec. Ahora están resueltas:

### Q1 — ¿Redactar un nuevo ADR para el contrato de objetos-anidados o confiar en el JSDoc?

**Resuelta**: **Bloque de comentario JSDoc encima de la constante `messages` (NO nuevo ADR)**.

Racional: la decisión arquitectónica aquí es esencialmente "la constante `messages` del harness DEBE espejar el árbol del `en.json` de producción como objetos-anidados". Eso es una convención de un párrafo, no una justificación de múltiples secciones. Un comentario JSDoc en el sitio canónico (la propia constante `messages`) pone la explicación donde el mantenedor futuro realmente lee código, no en un doc separado que tiene que ser descubierto. El patrón del plugin ESLint de boundary de slice-1 sigue el mismo principio de "explicar en el sitio canónico", y el PR #66 (`fix-web-vitest-crash`) siguió el mismo precedente para su mock de setup.ts (JSDoc, sin ADR).

### Q2 — ¿Exportar `messages` para reuso entre archivos de test?

**Resuelta**: **NO. Mantenerlo local al archivo.**

Racional: el único archivo de test que necesita exactamente este árbol de `messages` es `state-coverage.test.tsx`. Otros archivos de test (p. ej. `auth/state-coverage.test.tsx`) ya tienen sus propias constantes `messages` por archivo, ajustadas a los componentes que ejercitan. Extraer a un helper compartido añadiría una ruta de import sin ahorrar líneas (los mensajes de cada archivo difieren en qué namespaces incluyen) y acoplaría archivos de test no relacionados. Las constantes por archivo mantienen el harness autocontenido.

### Q3 — ¿Usar `cat-1` o `100.00` para las aserciones de fila?

**Resuelta**: **`cat-1`** (la celda `categoryId`).

Racional: según §3.4 del brief de exploración, `cat-1` es más específico que `100.00` (el monto) porque:

- `cat-1` es único por fila en el fixture de test (ningún otro nodo de texto en el árbol renderizado contiene la literal `cat-1`).
- `100.00` podría colisionar con el valor por defecto del `<input>`, la aserción `findByDisplayValue("100.00")` en `EditTransactionForm > success`, o cualquier otro monto del fixture.
- `USD` podría colisionar con la columna de código de moneda si hubiera múltiples filas presentes.
- `expense` podría colisionar con la columna de kind o el `<option>expense</option>` en el Select de NewCategoryForm.

`cat-1` es la opción de menor colisión y más específica. Un comentario inline de una línea (`// TransactionsRow renders categoryId but not tx.id; assert on the rendered categoryId`) documenta la elección en el sitio de la aserción para que contribuidores futuros no deshagan el cambio pensando que la `findByText("txn-1")` original era la aserción "correcta".

---

## 12. Trazabilidad

### Requisito del spec → Objetivos satisfechos

| Requisito del spec | Objetivos satisfechos |
|------------------|---------------------|
| R1 (reforma de mensajes a objetos-anidados) | G1, G2 |
| R2 (las 11 fallas de forma i18n se cierran) | G2 |
| R3 (2 aserciones de fila ajustadas) | G2, G3 |
| R4 (archivo state-coverage sale con 0, 25/25) | G1, G3 |
| R5 (suite completa de apps/web sale con 0, 145/145) | G4 |
| R6 (gate BDD no regresa, 43/43) | G5 |
| R7 (ningún componente fuente tocado) | G6 |
| R8 (JSDoc explica el contrato) | (documentación; soporta G1/G2/G3 previniendo regresiones futuras) |
| R9 (descripción del PR referencia al PR #66) | (higiene de PR; soporta todos los objetivos dando a los revisores el rastro de por qué-nos-importó) |

### Matriz criterio de aceptación ↔ requisito

| Requisito | Criterio de aceptación |
|-------------|----------------------|
| R1 | AC1, AC2, AC3 |
| R2 | AC6 (state-coverage 25/25) |
| R3 | AC4, AC6 |
| R4 | AC6 |
| R5 | AC7, AC8, AC12, AC13 |
| R6 | AC9 |
| R7 | AC10, AC11 |
| R8 | AC5 |
| R9 | AC19 |

### Mitigación riesgo ↔ requisito

| Riesgo (propuesta §7) | Mitigado por |
|--------------------|---------------|
| R1 (un test que pasa puede depender de un fallback literal con puntos) | R1 + R2 + AC1 + AC2 + AC6 (no quedan claves plano-con-puntos; los 11 tests i18n se cierran) |
| R2 (las aserciones de fila se vuelven menos específicas) | R3 + AC4 + resolución Q3 (usar `cat-1`, el valor de fixture más único por fila) + comentario inline en el sitio de la aserción |
| R3 (las colisiones de múltiples `Loading` pueden persistir por un nodo de texto perdido) | R2 + AC6 + AC8 (tras anidar, la regex `/Loading/i` coincide con el único `<p>Loading...</p>` exactamente una vez; si alguna queda, el sub-agente de apply re-investiga según §3.3 del brief de exploración) |

---

## Referencias cruzadas

- **Propuesta**: `openspec/changes/fix-state-coverage-drift/proposal.md` (Engram `#2373`)
- **Brief de exploración**: `openspec/changes/fix-state-coverage-drift/explore.md` (Engram `#2372`)
- **PR predecesor**: PR #66 (`fix-web-vitest-crash`) — izó `vi.mock("next/navigation", …)` a `apps/web/__tests__/setup.ts`; cerró la cascada de OOM de V8
- **Ruta de código smoking-gun**: `use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65` (`resolvePath` recorre los mensajes por segmento separado por puntos) y `use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66` (`defaultGetMessageFallback` devuelve la ruta con puntos literal)
- **Referencia de producción (correctamente anidada)**: `apps/web/messages/en.json` — el árbol de mensajes de producción, correctamente anidado; la forma plano-con-puntos del harness es el único lugar del repo que usa la forma incorrecta
- **Componentes afectados (NO modificados)**: `apps/web/components/transactions/TransactionsList.tsx:247-261` (`<TransactionsRow>` renderiza date/amount/categoryId/currencyCode/kind pero nunca `id`); `apps/web/components/transactions/CreateTransactionForm.tsx:166-250`; `apps/web/components/transactions/EditTransactionForm.tsx:179-266`; `apps/web/components/transactions/CategoryManager.tsx:95-118`; `apps/web/components/auth/SessionList.tsx:113-153`
- **Superficie de regresión (el archivo que se edita)**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 líneas, 25 escenarios a través de 5 bloques describe)
- **Mock de setup (preservado del PR #66)**: `apps/web/__tests__/setup.ts` (`vi.mock("next/navigation", …)`)
- **Config de Vitest (preservado del PR-7 de slice-7)**: `apps/web/vitest.config.ts` líneas 54-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`, commit `36386e1`)
- **Convenciones del proyecto**: AGENTS.md §1 (identidad, stack), §2 (modelo de ramas — `main` inmutable, cortado de `develop`), §4 (TDD estricto), §5 (atomic commits), §6 (Conventional Commits, sin atribución de IA), §7 (fronteras arquitectónicas — sin nueva regla de frontera), §8 (fuente única de verdad — contrato de objetos-anidados enforcado en el sitio canónico), §9 (UI completa no scaffold — N/A, solo test), §10 (testing — vitest colocalizado, `clearMocks: true`), §11 (lista de fuera-de-alcance), §13 (espejo en español — N/A para specs de carpeta de cambio por instrucción del orquestador + precedentes `fix-web-vitest-crash` + `fix-api-nestjs-di`)
- **Precedentes de formato de propuesta**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/{proposal,spec}.md` y `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/{proposal,spec}.md`

---

**Siguiente fase**: `design` (`sdd-design` producirá el árbol de mensajes de objetos-anidados exacto, el texto del comentario inline para las 2 aserciones de fila ajustadas, y el hunk de diff para `state-coverage.test.tsx` — traduciendo este QUÉ en CÓMO).

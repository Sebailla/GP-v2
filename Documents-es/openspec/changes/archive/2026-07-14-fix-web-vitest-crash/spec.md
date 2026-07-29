# Delta Spec — `fix-web-vitest-crash`

> **Cambio**: `fix-web-vitest-crash` · **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `d9fdfec`) → tracker `feat/fix-web-vitest-crash`
> **Modo**: `auto` (ronda de preguntas interactiva OMITIDA — cambio pequeño, intención + causa raíz pre-fijadas)
> **Almacén de artefactos**: hybrid
> **Fecha**: 2026-07-14
> **Forma del fix (decisión auto)**: **B** — elevar el `vi.mock("next/navigation", …)` a `apps/web/__tests__/setup.ts`. PR único, 1 archivo, ~28 LOC netas, bien por debajo del presupuesto de revisión de 400 líneas → `delivery_strategy=auto-chain` NO se dispara.
> **Propuesta**: `openspec/changes/fix-web-vitest-crash/proposal.md` (Engram `#2362`)
> **Brief de exploración**: `openspec/changes/fix-web-vitest-crash/explore.md` (Engram `#2361`)
> **Causa raíz**: falta de `vi.mock("next/navigation", …)` en el suite de tests → Next.js 16 lanza `invariant expected app router to be mounted` (`next@16.2.10/navigation.ts:179`) → fuga de fibers de React 19 → OOM kill de V8 después de ~4 min.

---

## 1. Encabezado

| Campo | Valor |
|-------|-------|
| Proyecto | `gastos-personales-reference` |
| Clave del proyecto | `gp-v2` |
| Rama | `feat/fix-web-vitest-crash` (cortada de `develop@d9fdfec`) |
| Fecha | 2026-07-14 |
| Autor | Orquestador SDD → `sdd-spec` (ejecutor · modelo `MiniMax-M3`) |
| Estado | borrador · fase spec |
| Fuente | Propuesta Engram `#2362`; Exploración Engram `#2361`; commit PR-7 del slice-7 `36386e1`; commit PR-2 del slice-8 `2e05fc5` |
| Forma del fix | B (decisión auto capturada en propuesta §0) |
| Almacén de artefactos | hybrid (Engram + OpenSpec) |
| Estrategia de entrega | `auto-chain` (>400 LOC auto-cadena) — **N/A este cambio**; 28 LOC permanece single-PR |

---

## 2. Intención

Slice 8 (`slice-8-closing-bdd-and-docs`) verifica que Gate 3 reporta que **los tests unitarios de apps/web fallan**: `pnpm --filter web test` sale con 1 después de ~255 segundos (4m 15s) con `Tests 120 passed (145)` + `Worker exited unexpectedly` + heap de V8 `~4073 MB` + `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed`. La causa raíz está verificada empíricamente: el archivo de tests `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 líneas, 25 escenarios) NO mockea `next/navigation`, así que cuando renderiza `TransactionsList` (vía `RowEditMenu`), `CreateTransactionForm`, y `EditTransactionForm` — cada uno llama `useRouter()` desde `next/navigation` — Next.js 16 lanza `invariant expected app router to be mounted` (pistola humeante: `next@16.2.10/navigation.ts:179`). 15/25 escenarios lanzan; el commit parcial de fiber del modo concurrente de React 19 mantiene el render parcial montado, los mocks `new Promise(() => {})` del suite (estados de carga) mantienen cadenas de `useEffect` sin resolver, los fibers se acumulan, el heap de V8 crece a ~4 GB, el worker muere por OOM. La solución alternativa `pool: "forks"` + `singleFork: true` del PR-7 del slice-7 (commit `36386e1`) sólo cambió *cuándo* se dispara el OOM, no *si* — no aborda la causa raíz. El mismo patrón `vi.mock("next/navigation", …)` ya existe en `apps/web/__tests__/components/auth/state-coverage.test.tsx` (líneas 47-49) para los formularios de auth — un mock por archivo que depende frágilmente de que cada nuevo archivo de tests recuerde el boilerplate. El fix verificado: elevar ese mismo mock a `apps/web/__tests__/setup.ts`, que es cargado por los 18 archivos de tests del suite (`vitest.config.ts` línea 39 ya lo cablea vía `setupFiles: ["./__tests__/setup.ts"]`). Tras el fix: los 145 tests de apps/web pasan, el wall time baja de 255s → <10s, sin OOM, sin banner de deprecación. Blast radius: 1 archivo editado, 18 archivos de tests silenciosamente protegidos contra la misma cascada de OOM en cualquier futuro componente que use el router.

---

## 3. Objetivos

### G1 — El suite vitest de `apps/web` sale con 0 con los 145 tests pasando

`pnpm --filter web test` DEBE salir con 0 con `Tests 145 passed (145)` y el wall time DEBE caer por debajo de 30 segundos (desde 255s). Antes del fix el suite sale con 1 con 25/145 fallando (15 lanzamientos + 10 en cascada cuando los workers se quedan sin OOM); tras el fix los 25 escenarios actualmente fallando se vuelven GREEN mientras los 120 ya pasando se quedan GREEN. No puede aparecer `Worker exited unexpectedly` ni `FATAL ERROR: Ineffective mark-compacts near heap limit` en el output del test.

### G2 — Los 25 escenarios en `state-coverage.test.tsx` pasan

Los 25 escenarios en `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (5 × 5 bloques describe: TransactionsList, CreateTransactionForm, EditTransactionForm, CategoryManager, SessionList) DEBEN pasar tras el fix. Los 15 actualmente lanzando cambian de RED a GREEN porque el mock elevado previene el invariante `useRouter()`. Los 10 ya pasando se quedan GREEN. (Los 2 sub-fallos `findByText(/500/i)` de SessionList notados en el brief de exploración §1 están fuera de alcance según propuesta §2.2 — ticket separado.)

### G3 — El mock es durable para futuros tests de componentes que usen el router

Un nuevo archivo de tests en `apps/web/__tests__/components/foo.test.tsx` que renderice un componente importando `useRouter()`, `usePathname()`, o `useSearchParams()` desde `next/navigation` DEBE pasar sin que el autor necesite añadir un `vi.mock("next/navigation", …)` por archivo. El mock elevado hace que el invariante "`next/navigation` es fake en el suite de tests de apps/web" sea una convención global aplicada una vez, en setup, no por archivo de test.

### G4 — El gate BDD no se regresa

`pnpm turbo run bdd` DEBE continuar saliendo con 0 tras el fix. El gate BDD estaba GREEN en `develop@d9fdfec` según el reporte verify del slice-8 (Engram `#2278`); este fix es sólo de apps/web y NO DEBE tocar ningún archivo de feature de Cucumber, definición de pasos, o puerto de workspace del harness BDD.

### G5 — Sin modificaciones de archivos fuente

Ningún archivo bajo `apps/web/components/**`, `apps/web/lib/**`, `apps/web/app/**`, `apps/api/**`, o `libs/**` puede ser modificado por este PR. `git diff --stat develop feat/fix-web-vitest-crash` filtrado por `apps/web/components/.*\.tsx$|apps/web/lib/.*\.ts$|apps/web/app/.*\.tsx$|apps/api/.*\.ts$|libs/.*\.ts$` DEBE estar vacío. El fix es sólo de infraestructura de tests.

### G6 — La solución alternativa `pool: 'forks'` del PR-7 del slice-7 se preserva

La solución alternativa `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` del PR-7 del slice-7 en `apps/web/vitest.config.ts` líneas 54-63 (introducida por el commit `36386e1` para el caso borde de timing de happy-dom + React 18 `useEffect` en `EditTransactionForm`) DEBE permanecer en `apps/web/vitest.config.ts` sin cambios tras este PR. El fix del OOM apunta al invariante `useRouter()`, un modo de fallo diferente; eliminar la solución alternativa arriesga regresionar el síntoma del slice-7 (mitiga el patrón mount-then-load-then-setState en `EditTransactionForm`).

---

## 4. No-objetivos

Lo siguiente está explícitamente **fuera de alcance** para este cambio (espejado desde propuesta §2.2 + AGENTS.md §11):

1. Refactorizar `TransactionsList`, `CreateTransactionForm`, o `EditTransactionForm` para no llamar `useRouter()` — el código de producción permanece tal cual.
2. Eliminar el bloque `vi.mock("next/navigation", …)` por archivo en `apps/web/__tests__/components/auth/state-coverage.test.tsx` líneas 47-49 — el mock global en `setup.ts` lo hace redundante, pero la eliminación es una limpieza de seguimiento.
3. Mockear `next/link`, `next/router` (router de páginas), o `next/headers` — apps/web es App Router sólo; ninguno de los componentes afectados importa estos.
4. Migrar el `poolOptions` de `apps/web/vitest.config.ts` desde el esquema vitest-3 al esquema top-level de vitest-4 — el warning de deprecación permanece como ticket separado (se volverá error en vitest 5).
5. Upgrade de vitest 4.1.9 → v5 o a cualquier otra versión mayor.
6. Añadir código de tests nuevo (sin archivo `.test.ts` o `.test.tsx` nuevo) — el `state-coverage.test.tsx` existente es la superficie de regresión; el RED ya está capturado por su exit-1 actual.
7. Autoría de una nueva ADR bajo `docs/architecture/decisions/` — el bloque de comentario JSDoc en `setup.ts` es la documentación (según resolución interactiva de la pregunta Q1 de la propuesta).
8. Añadir una nueva regla ESLint a `tools/eslint-plugin-boundary/` — el mock es una convención de infra de tests, no un guardia de frontera de código.
9. Cualquier cambio en `apps/api/`, `libs/features/*/`, `libs/core/*/` — el fix es sólo de apps/web.
10. Enforzamiento del gate de cobertura en CI (AGENTS.md §11).
11. Migración de `gastos-personales/` al modelo de vertical-slicing (el playbook se entrega aquí; la migración corre en un cambio separado según AGENTS.md §11).
12. i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción (gestor de secretos, HSTS, CSP más allá de los defaults de Next, config de CDN), observabilidad (OpenTelemetry, Prometheus, envío de logs), UI de audit log (AGENTS.md §11).
13. Tocar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/` o enmendar cualquier commit de la cadena del slice-7 (`36386e1`, `2e05fc5`).
14. Un espejo en español de `spec.md` — según instrucciones del orquestador, la spec es un artefacto de coordinación entre fases SDD, no un documento de cara al usuario; la regla del espejo se dispara para archivos `.md` que se entregan como fuente de verdad (`docs/architecture/decisions/`), no para borradores de specs en carpetas de cambio.

---

## 5. Requerimientos funcionales

> Palabras clave según RFC 2119. MUST = requerimiento absoluto. SHOULD = recomendado pero no bloqueante. MAY = opcional.

### R1 — `apps/web/__tests__/setup.ts` eleva una factory `vi.mock("next/navigation", …)` al tope

`apps/web/__tests__/setup.ts` DEBE añadir una llamada `vi.mock("next/navigation", () => ({ … }))` colocada DESPUÉS del `import "@testing-library/jest-dom/vitest";` existente (línea 1) y ANTES de cualquier otra declaración. La factory DEBE ser elevada por la transformación de Vitest para que el mock aplique antes de que cualquier módulo sea importado. El mock DEBE exportar stubs para `useRouter()`, `usePathname()`, `useSearchParams()`, y `useParams()` para que cualquier componente que importe cualquiera de estos cuatro hooks del app router desde `next/navigation` esté soportado, no sólo los 3 formularios actualmente afectados.

### R2 — La factory del mock retorna la forma mínima que usan los 3 componentes de formulario

La factory `vi.mock("next/navigation", …)` en `setup.ts` DEBE retornar un objeto con la siguiente forma mínima:
- `useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() })`
- `usePathname: () => "/"`
- `useSearchParams: () => new URLSearchParams()`
- `useParams: () => ({})`

Esto espeja el mock por archivo en `apps/web/__tests__/components/auth/state-coverage.test.tsx` líneas 47-49 pero eleva el retorno de `useRouter` a la forma completa del router (los 3 formularios de transactions llaman `useRouter().push(...)` para navegación en ruta exitosa, no sólo `useRouter().replace(...)`). Los stubs `vi.fn()` DEBEN ser frescos por test porque la config de vitest establece `clearMocks: true` en `apps/web/vitest.config.ts` línea 38; los tests no necesitan resetear manualmente entre escenarios.

### R3 — `apps/web/vitest.config.ts` continúa referenciando `apps/web/__tests__/setup.ts`

`apps/web/vitest.config.ts` DEBE continuar listando `"./__tests__/setup.ts"` en el array `setupFiles` (línea 39 hoy). Esta spec verifica la entrada existente, no la modifica; el mock aterriza en el cableado existente automáticamente. Las soluciones alternativas `pool: "forks"` y `poolOptions.forks.singleFork: true` (líneas 54-63) DEBEN permanecer sin cambios.

### R4 — `pnpm --filter web test` sale con 0 con 0 tests fallando tras el fix

`pnpm --filter web test` DEBE salir con 0 tras aplicar el fix. El reporter de vitest DEBE emitir `Tests 145 passed (145)` (o un conteo mayor si futuros commits de tests aterrizan en vuelo, pero ≥145). El wall time DEBE estar por debajo de 30 segundos. No puede aparecer `Worker exited unexpectedly` ni `FATAL ERROR: Ineffective mark-compacts near heap limit` en stderr.

### R5 — Los 25 escenarios en `state-coverage.test.tsx` pasan

Los 25 escenarios en `apps/web/__tests__/components/transactions/state-coverage.test.tsx` DEBEN pasar: 5 TransactionsList, 5 CreateTransactionForm, 5 EditTransactionForm, 5 CategoryManager, 5 SessionList. Ningún decorador `.skip` / `.todo` / `.xfail` puede añadirse a ninguno de estos 25 escenarios como solución alternativa. Los 15 actualmente lanzando cambian de RED (lanzan `invariant expected app router to be mounted`) a GREEN. Los 2 sub-fallos `findByText(/500/i)` de SessionList están explícitamente fuera de alcance según propuesta §2.2; permanecen como ticket separado pero NO DEBEN ser regresionados por el fix.

### R6 — `pnpm turbo run bdd` continúa saliendo con 0

`pnpm turbo run bdd` DEBE continuar saliendo con 0 tras el fix. Ningún archivo de feature de Cucumber, definición de pasos, world file, o puerto de workspace puede ser modificado. El gate BDD estaba GREEN en `develop@d9fdfec` según el reporte verify del slice-8 (Engram `#2278`); este fix DEBE preservarlo.

### R7 — Ningún archivo fuente de componente es tocado

El PR NO DEBE modificar ningún archivo bajo `apps/web/components/**`, `apps/web/lib/**`, `apps/web/app/**`, `apps/api/**`, o `libs/**`. `git diff --stat develop feat/fix-web-vitest-crash` filtrado por la unión de esos paths DEBE estar vacío. El fix es sólo de infraestructura de tests: los únicos archivos en el diff del PR son `apps/web/__tests__/setup.ts` (+28 / 0) y posiblemente `openspec/changes/fix-web-vitest-crash/{spec.md, design.md, tasks.md}` si los artefactos de design/tasks aterrizan en el mismo PR. (Spec/design/tasks viven bajo la carpeta de cambio, no bajo ninguno de los paths protegidos arriba.)

### R8 — La solución alternativa `pool: 'forks'` del PR-7 del slice-7 se preserva

La solución alternativa del PR-7 del slice-7 en `apps/web/vitest.config.ts` líneas 54-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`) DEBE permanecer en `apps/web/vitest.config.ts` tras este PR. El PR NO DEBE enmendar, eliminar, o reestructurar el commit `36386e1` (PR-7 del slice-7, "switch apps/web vitest to forks pool to mitigate happy-dom + useEffect OOM"). La solución alternativa mitiga un caso borde de timing separado de happy-dom + React 18 (el patrón mount-then-load-then-setState de `EditTransactionForm`); el fix del OOM apunta al invariante `useRouter()`, un modo de fallo diferente. Ambos DEBEN coexistir.

### R9 — La factory del mock lleva un comentario JSDoc explicando por qué es necesario

El bloque `vi.mock("next/navigation", …)` en `apps/web/__tests__/setup.ts` DEBERÍA estar precedido por un bloque de comentario JSDoc (una línea de comentario `//` o un párrafo añadido al JSDoc existente en las líneas 3-21 de setup.ts) explicando: (a) happy-dom no monta el app router de Next.js, (b) los componentes que llaman `useRouter()` lanzan `invariant expected app router to be mounted` en tiempo de render sin el mock, (c) la solución alternativa `pool: "forks"` del PR-7 del slice-7 sólo cambió *cuándo* se dispara el OOM, no *si*, (d) sin este mock los 15/25 escenarios de state-coverage lanzan y el worker se queda sin OOM con heap de V8 ~4 GB. El JSDoc es la documentación de esta convención; según resolución de Q1 de la propuesta, no se autorea una ADR separada.

### R10 — La descripción del PR referencia explícitamente la racha de bypass BDD de 4 PRs

La descripción del PR único contra `develop` DEBERÍA incluir una sección "Context" que nombre a apps/web vitest como el ÚLTIMO gate fallando del verify del slice 8 tras una racha de bypass BDD de 4 PRs (el fix desbloquea el Gate 3 del checklist verify del slice-8 para que el slice finalmente pueda cerrarse). Esto da a los revisores el rastro de por qué-nos-importó-cuando-enviamos-la-solución-alternativa y evita que el próximo agente re-camine la pista falsa del split `auth-server` del PR-2 del slice-8.

---

## 6. Escenarios

> Formato Gherkin Given/When/Then. Cada escenario es ejecutable como un test automatizado (o un check greppable por shell).
>
> 6 escenarios totales: uno por objetivo G1–G6.

### Escenario G1 (suite vitest de apps/web sale con 0)

#### Escenario: El suite vitest de apps/web sale con 0 con los 145 tests pasando

- DADO que `apps/web/__tests__/setup.ts` eleva una factory `vi.mock("next/navigation", …)` con la forma definida en R2
- Y `apps/web/vitest.config.ts` continúa referenciando `"./__tests__/setup.ts"` en `setupFiles`
- CUANDO se ejecuta `pnpm --filter web test` desde la raíz del repo en `feat/fix-web-vitest-crash`
- ENTONCES el código de salida DEBE ser 0
- Y el reporter de vitest DEBE emitir `Tests 145 passed (145)`
- Y el wall time DEBE estar por debajo de 30 segundos
- Y el stderr NO DEBE contener `Worker exited unexpectedly`
- Y el stderr NO DEBE contener `FATAL ERROR: Ineffective mark-compacts near heap limit`

### Escenario G2 (escenarios de state-coverage pasan)

#### Escenario: Los 25 escenarios de state-coverage.test.tsx pasan

- DADO que el mock elevado de R1/R2 se aplica globalmente a cada test del suite de apps/web
- CUANDO se ejecuta `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx`
- ENTONCES 25 de 25 escenarios DEBEN pasar (5 TransactionsList + 5 CreateTransactionForm + 5 EditTransactionForm + 5 CategoryManager + 5 SessionList)
- Y el código de salida DEBE ser 0
- Y no se puede haber añadido ningún decorador `.skip` / `.todo` / `.xfail`

### Escenario G3 (el mock es durable para tests futuros)

#### Escenario: Un nuevo archivo de tests que renderiza un componente que usa el router funciona sin mock por archivo

- DADO un nuevo archivo de tests hipotético en `apps/web/__tests__/components/foo.test.tsx` que importa un componente hipotético `Foo` que llama `useRouter()` desde `next/navigation`
- Y el nuevo archivo de tests NO declara ningún bloque `vi.mock("next/navigation", …)` por archivo
- CUANDO se ejecuta `pnpm --filter web test foo.test.tsx`
- ENTONCES el test DEBE pasar sin un error `invariant expected app router to be mounted`
- Y el test DEBE pasar sin que el autor necesite añadir un mock por archivo
- Y el mock global en `setup.ts` DEBE ser la única fuente del router falso

### Escenario G4 (gate BDD no regresado)

#### Escenario: El suite BDD aún pasa 43/43 tras el fix

- DADO que el fix vitest de apps/web ha sido aplicado (R1, R2, R4)
- CUANDO se ejecuta `pnpm turbo run bdd` desde la raíz del repo en `feat/fix-web-vitest-crash`
- ENTONCES todos los escenarios BDD DEBEN continuar pasando (43/43, coincidiendo con el conteo GREEN del reporte verify del slice-8)
- Y el código de salida DEBE ser 0
- Y ningún archivo de feature de Cucumber, definición de pasos, o world file puede aparecer en `git diff --stat develop feat/fix-web-vitest-crash`

### Escenario G5 (ningún archivo fuente tocado)

#### Escenario: Ningún archivo fuente bajo apps/web o apps/api o libs es modificado

- DADO que el diff del PR entre `feat/fix-web-vitest-crash` y `develop` es calculado
- CUANDO el diff se filtra por `apps/web/components/.*\.tsx$|apps/web/lib/.*\.ts$|apps/web/app/.*\.tsx$|apps/api/.*\.ts$|libs/.*\.ts$`
- ENTONCES la lista filtrada DEBE estar vacía
- Y los únicos archivos cambiados DEBEN ser `apps/web/__tests__/setup.ts` más los artefactos SDD bajo `openspec/changes/fix-web-vitest-crash/`

### Escenario G6 (solución alternativa del slice-7 preservada)

#### Escenario: La solución alternativa `pool: 'forks'` se preserva sin cambios

- DADO que `apps/web/vitest.config.ts` tiene `pool: "forks"` en la línea 54 y `poolOptions: { forks: { singleFork: true } }` en las líneas 59-63 (PR-7 del slice-7, commit `36386e1`)
- CUANDO el nuevo PR aterriza y se inspecciona `git show feat/fix-web-vitest-crash:apps/web/vitest.config.ts`
- ENTONCES la configuración `pool: "forks"` DEBE permanecer sin cambios
- Y la configuración `poolOptions.forks.singleFork: true` DEBE permanecer sin cambios
- Y el comentario `@ts-expect-error` sobre el bloque `poolOptions` DEBE permanecer sin cambios
- Y el commit `36386e1` NO DEBE ser enmendado, rebaseado, o eliminado

---

## 7. Superficie de restricciones

### 7.1 Fronteras arquitectónicas (AGENTS.md §7 — enforzadas por ESLint)

- **`no-prisma-outside-core`**: intacta, irrelevante; el fix no toca código Prisma.
- **`no-schemas-outside-shared`**: intacta, irrelevante; el fix no toca schemas Zod.
- **`no-client-server-import`**: intacta. El mock está en la frontera de tests; el código de componentes mantiene correctamente su split server-vs-client. El fix honra el shim `import "server-only"` existente en `apps/web/vitest.config.ts` líneas 114-117.
- **`no-cross-module-import`**: intacta, irrelevante; ningún import de módulo feature cambia.
- **`no-mojibake-in-docs`**: intacta. Esta spec vive bajo `openspec/changes/` y es un artefacto de coordinación (según instrucción del orquestador + precedente de excepción AGENTS.md §13: las specs en carpetas de cambio no se espejan).
- **`no-import-type-injectable`** (introducida por `fix-api-nestjs-di`): no implicada. El mock está en `apps/web/__tests__/`, no en un `*.controller.ts` o `*.service.ts`.

El plugin de frontera NO gana una nueva regla para este fix — confirmado por propuesta §4.3.

### 7.2 TDD estricto (AGENTS.md §4)

El fix sigue el orden **RED → GREEN → TRIANGULATE → REFACTOR**. El RED existente es capturado por el `pnpm --filter web test` exit-1 (25/145 fallando). El GREEN aterriza cuando el mismo comando sale con 0. No se necesita archivo de tests nuevo — `state-coverage.test.tsx` es la superficie de regresión, según AGENTS.md §4 ("un test fallando que reproduzca la falla debe existir ANTES del cambio de producción"; el archivo existente ya existe, el cambio lo hace pasar).

| Paso | Orden | ¿Test primero? | ¿Código de producción primero? |
|------|-------|-----------------|---------------------------------|
| 1 | RED observado (existente) | `pnpm --filter web test` sale con 1, 25 fallan | no |
| 2 | Editar `apps/web/__tests__/setup.ts` (añadir `vi.mock` elevado) | ya RED vía paso 1 | SÍ (GREEN: exit 0) |
| 3 | Verificar pipeline completo (`pnpm turbo run test bdd lint typecheck`) | n/a | n/a |
| 4 | Revisión de PR | n/a | n/a |

### 7.3 Commits atómicos (AGENTS.md §5) y Conventional Commits (AGENTS.md §6)

- Cada commit es una unidad de trabajo (cambio de test + producción + docs aterrizan juntos). Este cambio es lo suficientemente pequeño para un commit único: `fix(web): hoist next/navigation mock to vitest setup to stop OOM in state-coverage suite`.
- Sin "Co-Authored-By" / sin atribución de IA en ningún mensaje de commit.
- Vocabulario de tipos: `fix`, `test`, `docs`, `chore`, `refactor`.
- Asunto ≤72 caracteres, imperativo, sin punto final.

### 7.4 Modelo de ramas (AGENTS.md §2)

- Rama de trabajo: `feat/fix-web-vitest-crash` cortada de `develop` (NO de `main`).
- `main` es inmutable; sin force-push, sin delete, sin amend de commits históricos.
- `git revert <merge-sha>` revierte limpiamente todo el PR.
- La evidencia de la cadena del slice-7 (`36386e1`, `2e05fc5`) se preserva intacta.

### 7.5 Única fuente de verdad (AGENTS.md §8)

- El `vi.mock("next/navigation", …)` vive en exactamente UN lugar tras este PR: `apps/web/__tests__/setup.ts`. La copia por archivo en `apps/web/__tests__/components/auth/state-coverage.test.tsx` líneas 47-49 se vuelve redundante pero permanece intacta según propuesta §2.2 (limpieza de seguimiento).
- Los archivos fuente de componentes (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`) mantienen sus llamadas `useRouter()` — hay exactamente una fuente de verdad sobre cómo debe verse el objeto router (`next/dist/client/components/navigation.ts` de Next.js), y el mock es una aproximación fiel del lado de tests.

### 7.6 Espejo en español (AGENTS.md §13)

- Este `spec.md` NO se espeja deliberadamente en el momento de creación de la spec. Según instrucción del orquestador + el precedente de `fix-api-nestjs-di` (`openspec/changes/archive/2026-07-13-fix-api-nestjs-di/spec.md` tampoco fue espejada), la spec de carpeta de cambio es un artefacto de coordinación entre fases SDD. La regla del espejo se dispara para archivos `.md` bajo `docs/` que se entregan como fuente de verdad. Este cambio no introduce ninguno.

---

## 8. Plan de tests

| Objetivo | Comando de test | Resultado esperado |
|----------|-----------------|---------------------|
| G1 (suite vitest 0) | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)`; wall <30s; sin OOM |
| G2 (state-coverage 25/25) | `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25/25 PASS |
| G3 (mock durable) | `pnpm --filter web test` + un nuevo archivo de tests hipotético bajo `apps/web/__tests__/` | el nuevo archivo de tests pasa sin mock por archivo (validado re-ejecutando los 18 archivos existentes + añadiendo un nuevo test mínimo de humo si el revisor lo quiere; el hoist en sí mismo es la prueba durable — el conteo `Tests 145 passed` de G1 cubre los archivos existentes) |
| G4 (gate BDD) | `pnpm turbo run bdd` | exit 0; 43/43 escenarios continúan pasando |
| G5 (ningún fuente tocado) | `git diff --stat develop feat/fix-web-vitest-crash` filtrado por los paths protegidos | la lista filtrada está vacía |
| G6 (solución alternativa del slice-7 preservada) | `git show feat/fix-web-vitest-crash:apps/web/vitest.config.ts` + `git log --oneline feat/fix-web-vitest-crash 36386e1 -1` | `pool` + `poolOptions` de vitest.config.ts sin cambios; commit `36386e1` aún presente |

### Pasos de verificación manual / no-CI

- `pnpm --filter web test --reporter=verbose` para enumerar cada uno de los 145 escenarios y confirmar ningún decorador `.skip` / `.todo`.
- `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR|invariant expected"` para confirmar que la firma del OOM está ausente de stderr.
- `git log --oneline develop..feat/fix-web-vitest-crash` para confirmar un único commit de unidad de trabajo (asunto ≤72 chars, sin "Co-Authored-By").
- `git show 36386e1 -- apps/web/vitest.config.ts` para confirmar que el commit de la solución alternativa del slice-7 se preserva (NO enmendado o rebaseado).
- Leer `apps/web/__tests__/setup.ts` para confirmar que el párrafo JSDoc de R9 está presente y es preciso.

---

## 9. Criterios de aceptación

> Condiciones binarias de pass/fail para `sdd-verify`. Cada criterio es testeable desde un `git checkout feat/fix-web-vitest-crash && pnpm install` fresco.

| # | Criterio | Condición de pass |
|---|----------|-------------------|
| AC1 | `setup.ts` contiene el mock elevado | `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` retorna ≥1 hit |
| AC2 | El mock retorna la forma completa del router | la factory del mock DEBE exportar `useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() })` |
| AC3 | El mock retorna stubs de `usePathname` / `useSearchParams` / `useParams` | la factory del mock DEBE exportar `usePathname: () => "/"`, `useSearchParams: () => new URLSearchParams()`, `useParams: () => ({})` |
| AC4 | El párrafo JSDoc explica por qué (R9) | el archivo DEBE contener prosa explicando la ausencia del app router en happy-dom + la cascada de OOM |
| AC5 | `setupFiles` de vitest.config.ts está sin cambios | `grep -n 'setupFiles' apps/web/vitest.config.ts` muestra `["./__tests__/setup.ts"]` en la línea 39 (o su número de línea post-edit) |
| AC6 | `pool: "forks"` de vitest.config.ts está sin cambios | la línea DEBE aún leer `pool: "forks"` y `poolOptions.forks.singleFork: true` (R8 / G6) |
| AC7 | `pnpm --filter web test` sale con 0 | exit code 0; `Tests 145 passed (145)` (o mayor si aterrizan más tests) |
| AC8 | Sin OOM en stderr | `pnpm --filter web test 2>&1 \| grep -E "Worker exited\|FATAL ERROR"` sale con 1 (sin match) |
| AC9 | Wall time por debajo de 30s | `time pnpm --filter web test` reporta `real` < 30s |
| AC10 | Los 25 de state-coverage.test.tsx pasan | `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` sale con 0; el reporter emite 25 PASS / 0 FAIL |
| AC11 | Ningún decorador `.skip` / `.todo` añadido | `grep -E "\\.(skip\|todo)\\(" apps/web/__tests__/components/transactions/state-coverage.test.tsx` retorna el mismo conteo de hits que en `develop@d9fdfec` (sin nuevas decoraciones) |
| AC12 | El gate BDD aún pasa | `pnpm turbo run bdd` sale con 0 |
| AC13 | Ningún archivo fuente tocado | `git diff --stat develop..feat/fix-web-vitest-crash -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` retorna vacío |
| AC14 | Sólo `setup.ts` es editado bajo `apps/web/` | `git diff --name-only develop..feat/fix-web-vitest-crash -- 'apps/web/'` retorna exactamente un `apps/web/__tests__/setup.ts` (más posiblemente artefactos SDD de carpeta de cambio bajo `openspec/changes/fix-web-vitest-crash/`) |
| AC15 | El commit `36386e1` se preserva | `git log --oneline feat/fix-web-vitest-crash \| grep 36386e1` retorna 1 hit |
| AC16 | Sin "Co-Authored-By" en ningún commit | `git log feat/fix-web-vitest-crash --pretty=format:"%B" \| grep -i "co-authored-by"` retorna vacío |
| AC17 | El asunto del commit es Conventional + ≤72 chars | `git log -1 feat/fix-web-vitest-crash --pretty=format:"%s"` matchea `^(fix\|feat\|chore\|docs\|test\|refactor\|build\|ci\|perf\|style)\(.+\): .+` y es ≤72 chars |
| AC18 | La rama base del PR es `develop` | el ref `base` del PR es `develop` (NO `main`) |
| AC19 | El mock es durable para archivos futuros | el conteo de `pnpm --filter web test` incluye los 18 archivos existentes (≥145 tests across ≥18 archivos) — prueba que el mock de setup.ts es global, no por archivo |
| AC20 | PR único, sin force-push | el merge es un squash o merge commit único; `git log develop..feat/fix-web-vitest-crash --merges` retorna ≤1 commit; sin reescritura de historial |

---

## 10. Fuera de alcance

(Espejado desde propuesta §2.2 + AGENTS.md §11; los no-objetivos arriba son operacionales, esta sección es la verificación formal de revisión.)

1. Cualquier cosa en AGENTS.md §11.
2. Refactorizar `TransactionsList`, `CreateTransactionForm`, o `EditTransactionForm` para no llamar `useRouter()`.
3. Eliminar el mock por archivo en `apps/web/__tests__/components/auth/state-coverage.test.tsx` líneas 47-49 (limpieza de seguimiento).
4. Mockear `next/link`, `next/router` (router de páginas), o `next/headers` (apps/web es App Router sólo).
5. Migrar `poolOptions` de vitest del esquema v3 al esquema top-level de v4 (el warning de deprecación se vuelve error en vitest 5; ticket separado).
6. Upgrade de vitest 4.1.9 a v5 o a cualquier otra versión mayor.
7. Añadir código de tests nuevo (sin archivo `.test.ts` / `.test.tsx` nuevo).
8. Autoría de una nueva ADR bajo `docs/architecture/decisions/` (el JSDoc en `setup.ts` es la documentación según Q1).
9. Añadir una nueva regla ESLint a `tools/eslint-plugin-boundary/`.
10. Cualquier cambio en `apps/api/`, `libs/features/*/`, `libs/core/*/`.
11. Enforzamiento del gate de cobertura en CI.
12. Migración de `gastos-personales/` al modelo de vertical-slicing (el playbook se entrega aquí; la migración corre en slice-8 8.4 según AGENTS.md §11).
13. i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción (gestor de secretos, HSTS, CSP más allá de los defaults de Next, config de CDN), observabilidad (OpenTelemetry, Prometheus, envío de logs), UI de audit log.
14. Tocar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/`.
15. Enmendar, rebasar, o eliminar los commits `36386e1` (solución alternativa del PR-7 del slice-7) o `2e05fc5` (PR-2 del slice-8, split de auth, pista falsa a preservar como evidencia histórica).
16. Los 2 sub-fallos `findByText(/500/i)` de SessionList (ticket separado; no son la causa raíz del OOM según exploración §4.2).
17. Un espejo en español de cualquier archivo bajo `openspec/changes/fix-web-vitest-crash/` (ningún `.md` fuente de verdad se entrega en este cambio).

---

## 11. Preguntas abiertas — RESUELTAS

La propuesta difirió 3 preguntas a la fase spec. Ahora están resueltas:

### Q1 — ¿Autorear una nueva ADR para el mock o confiar en JSDoc?

**Resuelto**: **Bloque de comentario JSDoc en `setup.ts` (SIN nueva ADR)**.

Racionale: la decisión arquitectónica aquí es esencialmente "en el entorno de tests, `next/navigation` es fake". Esa es una convención de una línea, no una rationale de varios párrafos. Un párrafo JSDoc en `setup.ts` (R9) pone la explicación donde el futuro mantenedor realmente lee código (el archivo con la convención), no en un doc separado que tiene que ser descubierto. El patrón del plugin ESLint de boundary del slice-1 sigue el mismo principio de "explicar en el sitio canónico".

### Q2 — ¿Comportamiento completo del router o stub mínimo de `useRouter()`?

**Resuelto**: **Stub mínimo — `useRouter()` sólo** (la factory retorna los 4 hooks pero `useRouter` es el único con múltiples métodos).

Racionale: los 3 componentes de formulario afectados (`TransactionsList` vía `RowEditMenu`, `CreateTransactionForm`, `EditTransactionForm`) llaman `useRouter().push(...)` en rutas exitosas; los formularios de auth (`ResetPasswordForm`, `SignUpForm`) llaman `useRouter().replace(...)`. La factory por tanto retorna la forma completa del router (`push`, `replace`, `back`, `forward`, `refresh`, `prefetch`) para que cualquier sitio de llamada futuro esté cubierto. `usePathname()` retorna `"/"` y `useSearchParams()` retorna un `URLSearchParams()` fresco — los 3 componentes no los llaman, pero exportar los stubs evita que cualquier componente futuro que sí lo haga se regresione. (Modo de fallo espejo: un componente futuro que destructura `useParams()` crashearía con `undefined`, así que R1 también stub-ea `useParams: () => ({})`.)

Los stubs `vi.fn()` son recreados por test por `clearMocks: true` de vitest, así que el mock por archivo del archivo de tests de auth `vi.mock("next/navigation", …)` continúa teniendo precedencia para `auth/state-coverage.test.tsx` y los tests que realmente afirman sobre llamadas a `router.push`/`router.replace` pueden hacerlo.

### Q3 — ¿Mockear `next/link`, `next/router` (router de páginas), y `next/headers`?

**Resuelto**: **NO. App Router sólo.**

Racionale: `apps/web/` es exclusivamente App Router (directorio `app/` en la raíz del proyecto, sin directorio `pages/`). `next/link` es un componente JSX, no un hook — testearlo requiere aserciones de rendering de `<Link>`, no un mock a nivel de módulo. `next/router` es el equivalente del router de páginas, no importado en ningún lugar de `apps/web/`. `next/headers` es una API server-only; los componentes del lado del cliente nunca la importan. Los 3 componentes de formulario afectados importan desde `next/navigation` sólo. La superficie del fix es `next/navigation` solamente.

---

## 12. Trazabilidad

Objetivo → Requerimiento → Escenario → Comando de test:

| Objetivo | Requerimientos | Escenario | Comando de test |
|----------|----------------|-----------|-----------------|
| G1 (suite de apps/web 0) | R1, R2, R3 (verificar), R4 | G1.1 (`pnpm --filter web test`) | `pnpm --filter web test` |
| G2 (state-coverage 25/25) | R1, R2, R4, R5, R11 (sin decoración) | G2.1 (archivo state-coverage) | `pnpm --filter web test state-coverage.test.tsx` |
| G3 (mock durable) | R1, R2 | G3.1 (archivo nuevo hipotético) | smoke manual (`pnpm --filter web test foo.test.tsx` para un `foo.test.tsx` hipotético que importa un componente que use el router) |
| G4 (BDD no regresado) | R6 | G4.1 (suite BDD) | `pnpm turbo run bdd` |
| G5 (ningún fuente tocado) | R7 | G5.1 (git diff stat) | `git diff --stat develop feat/fix-web-vitest-crash -- <protected paths>` |
| G6 (slice-7 preservado) | R3 (verificar), R8 | G6.1 (inspección vitest.config.ts) | `git show feat/fix-web-vitest-crash:apps/web/vitest.config.ts` |

### Matriz criterio de aceptación ↔ requerimiento

| Requerimiento | Criterio de aceptación |
|---------------|------------------------|
| R1 | AC1, AC4 |
| R2 | AC2, AC3 |
| R3 (verificar) | AC5, AC6, AC15 |
| R4 | AC7, AC8, AC9 |
| R5 | AC10, AC11 |
| R6 | AC12 |
| R7 | AC13, AC14 |
| R8 | AC6, AC15 |
| R9 | AC4 |
| R10 (descripción del PR) | revisión manual del PR (sin AC binario; presencia en el cuerpo del PR) |

### Mitigación riesgo ↔ requerimiento

| Riesgo (§7 propuesta) | Mitigado por |
|------------------------|---------------|
| R1 (cambiar `setup.ts` rompe un test no relacionado) | la forma factory de R1 es un no-op para tests que no renderizan componentes de Next.js; R4 verifica exit 0; AC7 captura regresiones |
| R2 (hoisting de vitest conflictúa con mock por archivo) | R1 + AC1; `vi.mock` por archivo en `auth/state-coverage.test.tsx` re-vincula la factory para el alcance de ese archivo |
| R3 (warning de deprecación `poolOptions` de vitest-4) | R8 preserva la solución alternativa `pool: "forks"`; ticket fuera-de-alcance para la migración |
| R4 (API `URLSearchParams` de `useSearchParams` faltante en happy-dom) | la factory de R2 retorna `new URLSearchParams()`; happy-dom 20.10 implementa la spec WHATWG con fidelidad completa |
| R5 (PR confundido con la pista falsa del split `auth-server` del PR-2 del slice-8) | la descripción del PR de R10 referencia explícitamente la racha de bypass BDD de 4 PRs y nombra a apps/web vitest como el ÚLTIMO gate fallando |

---

## Referencias cruzadas

- **Propuesta**: `openspec/changes/fix-web-vitest-crash/proposal.md` (Engram `#2362`)
- **Brief de exploración**: `openspec/changes/fix-web-vitest-crash/explore.md` (Engram `#2361`)
- **Commit de causa raíz (predata al fix)**: PR-7 del slice-7 `36386e1` (introdujo la solución alternativa `pool: "forks"` el 2026-07-08; no abordó la causa raíz de `useRouter()`)
- **Error pistola humeante**: `invariant expected app router to be mounted` en `next@16.2.10/navigation.ts:179` (next/dist/client/components/navigation.ts en el paquete publicado)
- **Patrón pre-existente (a mantener)**: `vi.mock("next/navigation", …)` por archivo en `apps/web/__tests__/components/auth/state-coverage.test.tsx` líneas 47-49 (el mock de forma factory que el fix reusa)
- **Cableado de config de Vitest**: `apps/web/vitest.config.ts` línea 39 (`setupFiles: ["./__tests__/setup.ts"]`)
- **Solución alternativa del slice-7 (predecesora, NO siendo eliminada)**: commit `36386e1`, vitest.config.ts líneas 40-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`)
- **PR-2 del slice-8 (NO implicado, pista falsa)**: commit `2e05fc5` (split auth-client.ts / auth-server.ts) — `import type` se borra en tiempo de compilación, transparente a los workers de vitest (brief de exploración §6)
- **Evidencia del OOM**: brief de exploración §2 (255s de wall time, ~4 GB heap de V8, `FATAL ERROR: Ineffective mark-compacts near heap limit`)
- **Componentes afectados**: `apps/web/components/transactions/CreateTransactionForm.tsx:54`, `EditTransactionForm.tsx:50`, `TransactionsList.tsx:290` (dentro de `RowEditMenu`)
- **Superficie de regresión (sin archivo de tests nuevo)**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 líneas, 25 escenarios a través de 5 bloques describe)
- **Reporte verify del slice-8**: Engram `#2278` (confirmó gate BDD GREEN; OOM es Gate 3 / sólo tests unitarios)
- **Convenciones del proyecto**: AGENTS.md §1 (identidad, stack), §2 (modelo de ramas — `main` inmutable, cortar de `develop`), §4 (TDD estricto), §5 (commits atómicos), §6 (Conventional Commits, sin atribución de IA), §7 (fronteras arquitectónicas — sin nueva regla de frontera), §8 (única fuente de verdad — el mock vive en exactamente un lugar tras este PR), §9 (UI completa no scaffold — N/A, sólo tests), §10 (testing — vitest colocalizado, `clearMocks: true`), §11 (lista de fuera de alcance), §13 (espejo en español — N/A para specs de carpeta de cambio según instrucción del orquestador + precedente de `fix-api-nestjs-di`)
- **Precedente de formato**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/proposal.md` + `…/spec.md`

---

**Próxima fase**: `design` (`sdd-design` producirá el string exacto de la factory `vi.mock`, la prosa JSDoc, y el hunk de diff para `apps/web/__tests__/setup.ts` — traduciendo el QUÉ al CÓMO).

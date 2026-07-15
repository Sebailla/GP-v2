# Propuesta — `fix-web-vitest-crash`

> **Estado**: borrador · fase de propuesta · **Fecha**: 2026-07-14
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `d9fdfec`) → tracker `feat/fix-web-vitest-crash`
> **Almacén de artefactos**: hybrid · **Modo**: auto (ronda de preguntas interactiva OMITIDA — cambio pequeño, intención + causa raíz ya fijadas en el brief de exploración)
> **Forma del fix (decisión auto)**: **B** — elevar `vi.mock("next/navigation", …)` a `apps/web/__tests__/setup.ts` (duradero para futuros archivos de tests). PR único, 1 archivo, ~8 LOC netas, bien por debajo del presupuesto de revisión de 400 líneas.

---

## 1. Intención

Slice 8 (`slice-8-closing-bdd-and-docs`) verifica que Gate 3 reporta que **los tests unitarios de apps/web fallan**: `pnpm --filter web test` sale con 1 después de ~255 segundos (4m 15s) con `Tests 120 passed (145)` + `Worker exited unexpectedly` + heap de V8 `~4073 MB` + `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed`. La causa raíz está verificada empíricamente (no hipotetizada): el archivo de tests `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 líneas, 25 escenarios en 5 bloques describe) NO mockea `next/navigation`, así que cuando renderiza `TransactionsList` (vía `RowEditMenu`), `CreateTransactionForm`, y `EditTransactionForm` — los tres llaman `useRouter()` desde `next/navigation` — Next.js 16 lanza `invariant expected app router to be mounted` (pistola humeante: `next@16.2.10/navigation.ts:179`). 15/25 escenarios lanzan. El modo concurrente de React 19 con commit parcial de fibers mantiene el render parcial en el árbol, los mocks `new Promise(() => {})` del suite (estados de carga) mantienen cadenas de `useEffect` sin resolver, los fibers se acumulan por test, el heap de V8 crece a ~4 GB, el worker muere por OOM. La solución alternativa `pool: "forks"` + `singleFork: true` del PR-7 del slice-7 (commit `36386e1`) sólo cambió *cuándo* se dispara el OOM, no *si* — no aborda la causa raíz. El mismo patrón `vi.mock("next/navigation", …)` ya existe en `apps/web/__tests__/components/auth/state-coverage.test.tsx` (líneas 47-49) para los formularios de auth — un mock por archivo que depende frágilmente de que cada nuevo archivo de tests recuerde el boilerplate. El fix verificado: elevar ese mismo mock a `apps/web/__tests__/setup.ts`, que es cargado por los 18 archivos de tests del suite (`vitest.config.ts` línea 39 ya lo cablea vía `setupFiles: ["./__tests__/setup.ts"]`). Tras el fix: los 145 tests de apps/web pasan, el wall time baja de 255s → <10s, sin OOM, sin banner de deprecación. Blast radius: 1 archivo editado, 18 archivos de tests silenciosamente protegidos contra la misma cascada de OOM en cualquier futuro componente que use el router.

---

## 2. Alcance

### 2.1 En alcance

1. `apps/web/__tests__/setup.ts` — añadir un bloque `vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }))` (espejando el patrón de auth state-coverage en las líneas 47-49). Colocar DESPUÉS del import `@testing-library/jest-dom/vitest`, ANTES de cualquier declaración local. Añadir un párrafo JSDoc explicando el invariante ("happy-dom no monta el app router de Next.js; los componentes que llaman `useRouter()` lanzan en tiempo de render a menos que lo stub-emos aquí"). Usar la forma de factory-function para que el mock sea elevado por la transformación de Vitest antes de que cualquier módulo sea importado.
2. `apps/web/vitest.config.ts` — **sólo verificar, no editar**. La entrada `setupFiles: ["./__tests__/setup.ts"]` (línea 39) ya es correcta; el mock aterriza ahí automáticamente vía el cableado existente. Confirmar en revisión de código.
3. Observación Engram en `topic_key sdd/fix-web-vitest-crash/proposal`, `type=architecture`, `project=gp-v2`, `scope=project`, `capture_prompt=false` persiste la propuesta en el almacén de artefactos hybrid (espeja la escritura en filesystem según el contrato hybrid en `skills/_shared/sdd-phase-common.md`).

### 2.2 Fuera de alcance

- Los 2 sub-fallos menores en los escenarios SessionList de `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (`findByText(/500/i)` matchea `'500 '` con un espacio al final porque el `Response` mockeado no tiene `statusText`) — ticket separado. Son independientes del crash por OOM; un test lanza el invariante, los otros dos fallan por la regex del espacio al final; los 10 escenarios que ya pasan incluyen el escenario de loading que estaba filtrando el heap.
- El warning de deprecación `test.poolOptions` de vitest-4 ("`test.poolOptions` was removed in Vitest 4. All previous `poolOptions` are now top-level options") — ticket separado. Se volverá error en vitest 5. El proyecto está en vitest 4.1.9. La solución alternativa del PR-7 del slice-7 (commit `36386e1`, `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`) permanece intacta; este fix es aditivo, no un reemplazo.
- Cualquier upgrade de versión de vitest (4.1.9 → v5 o similar).
- Cualquier código de test nuevo (RED ya es el `state-coverage.test.tsx` existente con exit-1; no se necesita archivo de tests nuevo).
- Cualquier cambio en los 3 componentes de formulario (`apps/web/components/transactions/TransactionsList.tsx`, `CreateTransactionForm.tsx`, `EditTransactionForm.tsx`) o cualquier otro código fuente en `apps/web/components/`, `apps/web/lib/`, o `apps/web/app/`.
- Migración del `vi.mock("next/navigation", …)` por archivo en `apps/web/__tests__/components/auth/state-coverage.test.tsx` a un no-op (el mock global hace al local redundante, pero eliminarlo es una limpieza de seguimiento — mantiene este PR enfocado en el fix del OOM).
- Mockear `next/link`, `next/router` (router de páginas), o `next/headers` — apps/web usa App Router exclusivamente; ninguno de los componentes afectados importa estos.
- Nueva ADR (`docs/architecture/decisions/`) — el párrafo JSDoc en `setup.ts` es la documentación; no se está tomando ninguna decisión arquitectónica más allá de "mockear el router en setup".
- Enforzamiento del gate de cobertura (declarado fuera de alcance según AGENTS.md §11).
- Cualquier cambio en `apps/api/`, `libs/features/*/`, `libs/core/*/` — el fix es sólo de apps/web.
- Migración del repo padre `gastos-personales/` al modelo de vertical-slicing (según AGENTS.md §11).
- i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción, observabilidad, UI de audit log (AGENTS.md §11).
- Sin espejo en español de la propuesta — según instrucciones del orquestador (la propuesta es un artefacto de coordinación, no un documento de cara al usuario).

---

## 3. Enfoque

Tres pasos, ordenados estilo TDD estricto. **Ningún cambio de producción aterriza sin el RED existente observado primero.**

### Paso 1 — RED ya está observado (registrado en el brief de exploración §2, §4.2)

`pnpm --filter web test` actualmente sale con 1 con la firma del OOM (255s de wall time, heap de V8 ~4 GB, 25/145 tests fallando, 120/145 pasando, `Worker exited unexpectedly`). RED capturado. No se necesita archivo de tests nuevo — el `state-coverage.test.tsx` existente es la superficie de regresión, según AGENTS.md §4.

### Paso 2 — GREENear el fix: elevar el mock a `setup.ts`

Editar `apps/web/__tests__/setup.ts` (actualmente 22 líneas). Después de la línea existente `import "@testing-library/jest-dom/vitest";`, añadir:

```ts
import { vi } from "vitest";

// Stub de `next/navigation` para todo el suite de tests de apps/web.
//
// happy-dom no monta el app router de Next.js; cualquier componente que
// llame `useRouter()`, `usePathname()`, o `useSearchParams()` lanza
// `invariant expected app router to be mounted` en tiempo de render. La
// solución alternativa del PR-7 del slice-7 (`pool: "forks"` +
// `singleFork: true`) sólo cambió *cuándo* se dispara el OOM del worker,
// no *si*. Sin este mock, los 15/25 escenarios en `state-coverage.test.tsx`
// que renderizan `TransactionsList`/`CreateTransactionForm`/`EditTransactionForm`
// (cada uno llama `useRouter()`) lanzan, el fiber parcial queda montado
// entre tests, y el heap de V8 crece a ~4 GB antes de que el worker sea
// matado.
//
// La forma factory es requerida: `vi.mock` es elevado por la
// transformación de Vitest por encima de todos los imports, y la factory
// recibe el objeto `vi` para que los stubs `vi.fn()` sean recreados por
// test (el `clearMocks: true` de vitest luego los resetea automáticamente).
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
```

Por qué la forma factory de `vi.mock` (no `vi.doMock` o `vi.spyOn`):

- `vi.mock` es elevado por la transformación de Vitest — el mock aplica antes de que cualquier módulo sea importado. `vi.doMock` NO es elevado y no aplica a imports dinámicos (el paquete `next/navigation` es cargado por el barrel de Next.js indirectamente).
- `vi.fn()` retorna stubs frescos por test cuando `clearMocks: true` está configurado (vitest.config.ts línea 38), así que los tests no necesitan resetear manualmente entre escenarios.
- La factory retorna un objeto plano (no una clase), así que el reconciler de React trata el valor como un router opaco — sin casos borde de resolución de símbolos.

Por qué `setup.ts` (no el archivo de tests mismo):

- El archivo de auth state-coverage ya tiene exactamente este mismo mock por archivo (líneas 47-49 de `apps/web/__tests__/components/auth/state-coverage.test.tsx`). El patrón es frágil: cada nuevo archivo de tests que renderice un componente que use el router está a una omisión accidental de esta misma cascada de OOM. Elevarlo hace que el invariante "next/navigation es fake en tests" sea global, no una convención por archivo de test.
- La config `setupFiles` de vitest (vitest.config.ts línea 39) ya cablea `setup.ts` — no se necesita cambio de config.

Re-ejecutar `pnpm --filter web test`. Los 15 escenarios actualmente lanzando se vuelven GREEN. Wall time baja de 255s → <10s. Sin OOM.

### Paso 3 — Verificar

Ejecutar `pnpm turbo run test bdd lint typecheck` en la rama `feat/fix-web-vitest-crash`. El suite de tests de apps/web sale con 0 con `Tests 145 passed (145)`. Los otros 17 archivos de tests (120 tests) continúan pasando — el mock global es un no-op para ellos (no renderizan componentes de Next.js; el stub `useRouter()` nunca es llamado). El gate BDD se queda GREEN (estaba GREEN en `develop@d9fdfec`; el brief de exploración §1 confirma). `pnpm lint:fixtures` sale con 0 (sin nuevas violaciones de frontera ESLint). Abrir el PR único contra `develop`.

---

## 4. Capacidades

> Contrato entre esta propuesta y `sdd-spec`. Investigado `openspec/specs/` primero — **el directorio no existe** en la raíz del proyecto (`ls openspec/specs/` → SIN DIRECTORIO DE SPECS). El proyecto aún no tiene taxonomía persistente de capacidades; el único artefacto portador de spec es `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` (la propuesta original del scaffold). Naming de capacidades para que `sdd-spec` lo invente.

### 4.1 Nuevas capacidades

- `apps-web-test-next-nav-stub`: documenta el requerimiento de que TODOS los archivos de tests bajo `apps/web/__tests__/` puedan confiar en un `vi.mock("next/navigation", …)` elevado en `setup.ts`, con la factory retornando stubs de `{ useRouter, usePathname, useSearchParams }`. El alcance de la capacidad es sólo de infraestructura de tests (sin cambio de comportamiento de producción). Se convertirá en `openspec/specs/apps-web-test-next-nav-stub/spec.md`.

### 4.2 Capacidades modificadas

- Ninguna. No hay cambios de comportamiento a nivel de spec existentes. Los 3 componentes de formulario (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`) mantienen sus llamadas a `useRouter()` intactas. El archivo de tests de auth (`apps/web/__tests__/components/auth/state-coverage.test.tsx`) mantiene su mock por archivo — el mock global en `setup.ts` es aditivo; el mock local se vuelve redundante pero se elimina en una limpieza de seguimiento (fuera de alcance aquí, según §2.2).

### 4.3 Plugin ESLint de frontera arquitectónica

- Sin cambio. El plugin de frontera (`tools/eslint-plugin-boundary/`) no gana una nueva regla para este fix — el mock es una convención de infraestructura de tests, no un guardia de frontera de código. `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`, `no-mojibake-in-docs` siguen siendo las 5 reglas activas.

---

## 5. Áreas afectadas

| Archivo | Cambio | Delta de LOC |
|---------|--------|-------------:|
| `apps/web/__tests__/setup.ts` | Editar (añadir bloque elevado `vi.mock("next/navigation", …)` + comentario JSDoc) | +28 / 0 |
| `apps/web/vitest.config.ts` | Verificar (sin editar — la entrada `setupFiles` en línea 39 ya es correcta) | 0 / 0 |

**Total estimado**: +28 / 0, ~28 LOC netas. Se mantiene bien por debajo del presupuesto de revisión de 400 líneas → **PR único es apropiado** (no se dispara el trigger de auto-chain; `delivery_strategy=auto-chain` del preflight del orquestador NO se dispara por este cambio).

---

## 6. Criterios de éxito

`sdd-verify` ejecutará estos 6 gates.

**Funcional (G1–G2)**: G1 — `pnpm --filter web test` sale con 0 con `Tests 145 passed (145)`, wall time <30s (desde 255s). G2 — los 15 escenarios previamente lanzando en `state-coverage.test.tsx` (5 CreateTransactionForm + 5 EditTransactionForm + 5 TransactionsList) todos PASAN; los 10 escenarios ya pasando (5 CategoryManager + 5 SessionList) continúan PASANDO (los 2 sub-fallos `findByText(/500/i)` de SessionList están fuera de alcance según §2.2 y permanecen como ticket separado).

**Higiene (G3–G6)**: G3 — ningún error `Worker exited unexpectedly` en el output del test; ningún `FATAL ERROR: Ineffective mark-compacts near heap limit` en el output del test. G4 — `pnpm turbo run test bdd lint typecheck` sale con 0 en `feat/fix-web-vitest-crash`; `pnpm turbo run bdd e2e` continúa saliendo con 0 (sin regresión de BDD). G5 — `pnpm lint:fixtures` sale con 0; sin nuevas violaciones de frontera ESLint. G6 — sin cambios a ningún archivo en `apps/web/components/transactions/`, `apps/web/components/auth/`, `apps/web/lib/`, `apps/web/app/`, `apps/api/`, o `libs/` — verificado por `git diff --stat develop feat/fix-web-vitest-crash`.

---

## 7. Riesgos

| ID | Riesgo | Probabilidad | Mitigación |
|----|--------|--------------|------------|
| R1 | Cambiar `setup.ts` (leído por los 18 archivos de tests en `apps/web/__tests__/`) podría romper un test no relacionado que confiaba en la ausencia de un mock global. | Baja | El mock es un no-op para tests que no renderizan componentes de Next.js — los stubs `useRouter()`/`usePathname()`/`useSearchParams()` nunca son llamados. Los 17 archivos (120 tests) actualmente pasan sin el mock y continuarán pasando con él; el `clearMocks: true` de vitest resetea los stubs por test. Si algún test post-cambio falla, el modo de fallo apunta a un test que importa `next/navigation` directamente (ninguno lo hace actualmente — los formularios de auth pasan por `next/navigation` y ya tienen un mock por archivo que simplemente queda ensombrecido). |
| R2 | El hoisting de Vitest podría conflictuar con el `vi.mock("next/navigation", …)` por archivo existente en `apps/web/__tests__/components/auth/state-coverage.test.tsx`. | Baja | El `vi.mock` por archivo sobrescribe al global para el alcance de ese archivo (Vitest aplica los mocks en orden de import; la llamada por archivo re-vincula la factory). Los tests de auth continúan pasando con el mock por archivo en su lugar — verificado por la línea base existente de 120 tests. El mock por archivo se vuelve redundante tras este PR pero se deja intacto para la limpieza de seguimiento (fuera de alcance según §2.2). |
| R3 | El warning de deprecación `test.poolOptions` de vitest-4 aún está presente y puede volverse un error duro en vitest 5. | Baja | Fuera de alcance según §2.2; ticket separado. La solución alternativa del PR-7 del slice-7 permanece; la deprecación de `poolOptions` no bloquea este fix. |
| R4 | La forma factory del mock retorna un objeto plano para `useSearchParams()` (`new URLSearchParams()`) — algunos componentes podrían destructurar métodos de `URLSearchParams` que no existen en el polyfill de happy-dom. | Baja | `URLSearchParams` es una clase de la spec WHATWG implementada en happy-dom con fidelidad completa. Los 3 componentes afectados (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`) sólo llaman `useSearchParams().get("…")`; `URLSearchParams.get` está presente en happy-dom 20.10. Verificado por código del componente (sin uso de `.entries()`, `.forEach()`, o `.keys()`). |
| R5 | El fix podría confundirse con un ejercicio de "quitar el `import type`" (espejando el precedente de `fix-api-nestjs-di`) y re-disparar la confusión del PR-2 del slice-8. | Baja | El split de auth (`auth-client.ts` / `auth-server.ts`) es `import type` (borrado en tiempo de compilación) — el brief de exploración §6 verifica que es transparente a los workers de vitest. El OOM no tiene nada que ver con el split de auth; el log de commits (slice-7 PR-7 `36386e1` introdujo la solución alternativa pre-PR-2) es la pistola humeante. La descripción del PR debe citar esto explícitamente para que los revisores no re-caminen el callejón sin salida. |

---

## 8. Plan de rollback

**Whole-change**: `git revert <merge-sha>` en `develop` deshace el PR único limpiamente. La edición de `setup.ts` revierte a su línea base de 22 líneas; `apps/web/vitest.config.ts` queda sin cambios (no se necesita revert). Los 25 escenarios en `state-coverage.test.tsx` vuelven a su estado previamente fallando (aceptable porque los mismos tests ya estaban rotos en `develop@d9fdfec` — el reporte verify del slice-8 confirmó Gate 3 / crash por OOM como observación F1 de la deuda de herencia del slice-7).

**Rollback por paso**:
- Pasos 1+2 (edición de setup.ts) — revertir el archivo. Los tests vuelven a fallar como antes. La config de vitest está intacta, así que no se necesita revertir la config.
- Paso 3 (verificar) — no se necesita rollback (sin artefacto).

**NO se hará**: force-push, reescritura de historial, tocar `main`, modificar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/`, o enmendar el commit `36386e1`. La evidencia de la cadena del slice-7 (`36386e1`, `2e05fc5`) permanece intacta.

---

## 9. Dependencias

- `apps/web/vitest.config.ts#setupFiles` (línea 39) — preservada tal cual; el mock aterriza ahí automáticamente vía el cableado existente. No se necesita edit de config.
- `apps/web/__tests__/setup.ts` (22 líneas existentes) — estructura preservada; el import de jest-dom (línea 1) y el párrafo JSDoc (líneas 3-21) permanecen; el bloque mock se añade después del import.
- Semántica de hoisting de `vi.mock` en `vitest@4.1.9` — reusada tal cual; sin dependencia nueva.
- Firmas de `useRouter` / `usePathname` / `useSearchParams` de `next@16.2.10` — la factory retorna objetos con la misma forma (verificado contra `next@16.2.10/navigation.ts`).
- Implementación de `URLSearchParams` en `happy-dom@20.10` — usada tal cual por el stub `useSearchParams` de la factory.
- `apps/web/__tests__/components/auth/state-coverage.test.tsx` (la fuente del patrón) — el mock por archivo en las líneas 47-49 es la plantilla; reusamos la misma forma de factory con el triple más amplio `{ useRouter, usePathname, useSearchParams }` (el mock de auth retorna sólo `{ replace }`; los formularios de transactions también llaman `useRouter().push(...)`, así que la factory debe retornar la forma completa del router).
- El directorio de cambios de OpenSpec `openspec/changes/fix-web-vitest-crash/` ya existe con `explore.md` (Engram #2361).

---

## 10. Preguntas abiertas para `sdd-spec`

1. **Área de superficie del mock** — ¿debería la factory retornar sólo `{ useRouter }` (mínimo, espejando el patrón de auth state-coverage en las líneas 47-49) o el triple completo `{ useRouter, usePathname, useSearchParams }` (cobertura más amplia para cualquier test futuro que renderice un `<Link>` o lea la URL)? La propuesta elige el triple (3 LOC netas de diferencia, sin downside; happy-dom tampoco envía un polyfill de `usePathname`/`useSearchParams`). La fase spec confirma.
2. **Limpieza del mock por archivo** — ¿debería eliminarse el `vi.mock("next/navigation", …)` redundante por archivo en `apps/web/__tests__/components/auth/state-coverage.test.tsx` líneas 47-49 en este PR, o diferirse a un seguimiento? La propuesta lo difiere (mantiene este PR enfocado en el fix del OOM; la eliminación por archivo es 1 PR trivial). La fase spec decide.
3. **Solución alternativa del slice-7 PR-7** — ¿debería eliminarse la solución alternativa `pool: "forks"` + `singleFork: true` del slice-7 (commit `36386e1`, vitest.config.ts líneas 40-63) una vez que aterrice el fix de causa raíz? **Recomendación: NO** — la solución alternativa mitiga un caso borde de timing separado de happy-dom + React 18 (el patrón mount-then-load-then-setState de EditTransactionForm); el fix del OOM apunta al invariante de `useRouter()`, que es un modo de fallo diferente. Ambos pueden coexistir; eliminar la solución alternativa arriesga regresionar el síntoma del slice-7. La fase spec confirma.

---

## 11. Referencias cruzadas

- Brief de exploración: `openspec/changes/fix-web-vitest-crash/explore.md` (Engram #2361, observación padre).
- Error pistola humeante: `invariant expected app router to be mounted` en `next@16.2.10/navigation.ts:179` (next/dist/client/components/navigation.ts en el paquete publicado).
- Fuente del patrón existente: `apps/web/__tests__/components/auth/state-coverage.test.tsx` líneas 47-49 (el bloque `vi.mock("next/navigation", …)` por archivo).
- Cableado de config de Vitest: `apps/web/vitest.config.ts` línea 39 (`setupFiles: ["./__tests__/setup.ts"]`).
- Solución alternativa del slice-7 (predecesora, NO siendo eliminada): commit `36386e1`, vitest.config.ts líneas 40-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`).
- PR-2 del slice-8 (NO implicado, pista falsa): commit `2e05fc5` (split auth-client.ts / auth-server.ts) — `import type` se borra en tiempo de compilación, transparente a los workers de vitest (brief de exploración §6).
- Evidencia del OOM: brief de exploración §2 (255s de wall time, ~4 GB heap de V8, `FATAL ERROR: Ineffective mark-compacts near heap limit`).
- Componentes afectados: `apps/web/components/transactions/CreateTransactionForm.tsx:54`, `EditTransactionForm.tsx:50`, `TransactionsList.tsx:290` (dentro de `RowEditMenu`).
- Reporte verify del slice-8: Engram #2278 (confirmó que el gate BDD es GREEN; el OOM es Gate 3 / sólo tests unitarios).
- Convenciones del proyecto: AGENTS.md §4 (TDD estricto — RED es el `pnpm --filter web test` exit-1 existente; no se necesita archivo de tests nuevo), §5 (commits atómicos), §6 (Conventional Commits, sin atribución de IA), §7 (fronteras arquitectónicas — `no-client-server-import` no se dispara; el mock está en la frontera de tests), §8 (única fuente de verdad — el mock vive en exactamente un lugar tras este PR), §11 (lista de fuera de alcance), §13 (espejo en español — N/A, la propuesta es un artefacto de coordinación según instrucciones del orquestador).
- Precedente de formato de propuesta: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/proposal.md`.

---

## 12. Próxima fase

`next_recommended`: **`spec`**.

`sdd-spec` debería:
- Crear `openspec/specs/apps-web-test-next-nav-stub/spec.md` capturando la nueva capacidad (G1–G6 de §6).
- Resolver Q1 (área de superficie del mock: sólo `useRouter` vs triple) explícitamente. La propuesta elige el triple.
- Para Q2 (limpieza del mock por archivo), diferir la eliminación a un PR de seguimiento; este cambio sólo añade el mock global.
- Para Q3 (solución alternativa del slice-7), confirmar que la solución alternativa permanece (precedente: no cambiar una solución alternativa cuando aterriza el fix de causa raíz; la alternativa mitiga un síntoma diferente).

`status`: **`success`** · `skill_resolution`: **`paths-injected`** · `risks`: R1–R5 (ver §7).

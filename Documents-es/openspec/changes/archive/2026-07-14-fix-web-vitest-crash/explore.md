# Exploración: `fix-web-vitest-crash`

> **Fase**: explorar · pre-propuesta
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `d9fdfec`)
> **Autor**: Orquestador SDD → `sdd-explore` (ejecutor · modelo `MiniMax-M3`)
> **Fecha**: 2026-07-14
> **Investigación de sólo lectura**. Ningún código o config mutado.
> **Entradas**: observación Engram `#2278` (reporte verify del slice 8), commit PR-7 del slice-7 `36386e1`, commit PR-2 del slice-8 `2e05fc5` (el split auth-client/server), el archivo de tests fallando `apps/web/__tests__/components/transactions/state-coverage.test.tsx`.

---

## §1. Resumen ejecutivo

**Causa raíz** — una oración: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 líneas, 25 escenarios) **no mockea `next/navigation`**, así que cuando renderiza `TransactionsList`, `CreateTransactionForm`, y `EditTransactionForm` (que todos llaman `useRouter()` desde `next/navigation`), Next.js 16 lanza **`invariant expected app router to be mounted`** durante el render, el árbol de fibers de React 19 se fuga por test (el suite tiene 5 bloques describe × 5 escenarios de state-coverage, de los cuales 15 disparan el lanzamiento), y el proceso del worker de single-fork se queda sin heap de V8 (~4 GB) después de ~4 minutos — la solución alternativa `--pool=forks poolOptions.forks.singleFork=true` de vitest del PR-7 del slice-7 luego reporta `Worker exited unexpectedly` como un "error no manejado".

**Por qué el PR-7 del slice-7 (`36386e1`) lo maldiagnosticó**: ese commit documentó "happy-dom 20.10 + vitest 4.1 worker pool tiene una inestabilidad conocida con actualizaciones de estado driven por React 18 + useEffect en árboles de componentes (p.ej. el patrón mount-then-load-then-setState de EditTransactionForm)" y cambió a `pool: "forks"` + `singleFork: true` como solución alternativa. La causa raíz real **ya estaba presente en ese commit** (el split `auth-client.ts` / `auth-server.ts` aún no había aterrizado — eso fue el PR-2 del slice-8 `2e05fc5`), y la solución alternativa sólo cambió *cuándo* se dispara el OOM, no *si*.

**Blast radius**: 1 archivo de tests (`state-coverage.test.tsx`) con **15 de 25 tests** que lanzan "invariant expected app router to be mounted" + **fugan fibers de React** en modo concurrente → el worker se cuelga → el padre mata al worker → `pnpm --filter web test` sale con 1 después de ~255s con `Tests 120 passed (145)`. Los otros 17 archivos de tests (120 tests) pasan limpiamente. **El gate BDD NO está afectado** — confirmado por el reporte verify del PR-2 del slice-8 (Engram `#2278`): `pnpm turbo run bdd e2e` es GREEN.

**Candidatos de forma de fix**: 3 — el más barato es de una línea (añadir `vi.mock("next/navigation", ...)` al tope del archivo de tests, espejando el test de auth state-coverage), el más durable es un **archivo de setup** de vitest que auto-mockee `next/navigation` para todo el suite de tests de `apps/web`, y el tercero es upgradear la solución alternativa `poolOptions.forks.singleFork` de vitest a la sintaxis top-level de vitest-4 (que el warning de deprecación ya pide).

---

## §2. La firma real del error

Capturada vía `pnpm --filter web test 2>&1 | tail -80` el 2026-07-14, rama `develop` (HEAD `d9fdfec`):

```
$ vitest run
 DEPRECATED  `test.poolOptions` was removed in Vitest 4. All previous `poolOptions` are now top-level options.

 RUN  v4.1.9 /Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-reference/apps/web


<--- Last few GCs --->

[94266:0xc9d80c000]   252369 ms: Scavenge (during sweeping) 4068.8 (4089.0) -> 4061.5 (4089.5) MB, pooled: 0.0 MB, 7.04 / 0.00 ms (average mu = 0.374, current mu = 0.369) allocation failure;
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
----- Native stack trace -----
 1: 0x10a44e218 node::OOMErrorHandler(char const*, v8::OOMDetails const&)
  ...
⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯
Vitest caught 1 unhandled error during the test run.
⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯
Error: [vitest-pool]: Worker forks emitted error.
 ❯ EventEmitter.onTaskError .../vitest/dist/chunks/cli-api.24X8XwN1.js:3459:21
 ❯ EventEmitter.emit node:events:509:20
 ❯ ChildProcess.emitUnexpectedExit .../vitest/dist/chunks/cli-api.24X8XwN1.js:3025:22
 ❯ ChildProcess.emit node:events:509:20
 ❯ Process.ChildProcess._handle.onexit node:internal/child_process:294:12
Caused by: Error: Worker exited unexpectedly

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
 Test Files  17 passed (18)
      Tests  120 passed (145)
     Errors  1 error
   Start at  11:07:49
   Duration  255.26s (transform 1.31s, setup 1.08s, import 4.80s, tests 1.72s, environment 5.14s)

Exit status 1
```

**Números clave**:

| Métrica | Valor | Significado |
|---------|------:|-------------|
| Código de salida | `1` | `pnpm --filter web test` falla el pipeline |
| Archivos de tests pasados / totales | `17 / 18` | 1 archivo (el state-coverage de transactions) no completó |
| Tests pasados / totales | `120 / 145` | 25 tests no pasaron (los 25 enteros en el archivo state-coverage de transactions) |
| Wall time | `255.26s` (~4m 15s) | el heap creció a ~4 GB durante esa ventana |
| Heap de V8 al crashear | `~4073 MB` | `FATAL ERROR: Ineffective mark-compacts near heap limit` |
| Señal del worker | `Worker exited unexpectedly` | envoltura de vitest alrededor del OOM kill |
| Versión de Vitest | `4.1.9` | la deprecación de `poolOptions` es una nota de migración v3→v4 |
| Versión de Node | `v26.5.0` | `darwin-arm64` |

**Esto NO es** el tipo de crash reportado por el PR-2 del slice-8 ("split auth-client/auth-server incompleto"). Es un **OOM del heap de V8**, no un error de resolución DI de `import { type X }`. El split de auth es irrelevante aquí.

---

## §3. La config de vitest

`apps/web/vitest.config.ts` (120 líneas, slice 4 batch 4a + slice 7 PR-7 + slice 8.1.2). Extracto relevante:

```ts
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    environment: "happy-dom",
    globals: false,
    clearMocks: true,
    setupFiles: ["./__tests__/setup.ts"],
    pool: "forks",
    // @ts-expect-error — poolOptions is in the vitest runtime config
    // but not on the strict `InlineConfig` type in vitest 4.1.
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: [
      { find: /^@features\/auth\/shared\/schemas$/, replacement: /* … */ },
      { find: /^@features\/auth$/, replacement: /* … */ },
      // … etc …
      { find: /^server-only$/, replacement: /* empty.js shim */ },
    ],
  },
});
```

| Configuración | Valor actual | Estado en Vitest 4 |
|---------------|--------------|---------------------|
| `pool` | `"forks"` | Válido en v4 |
| `poolOptions` | top-level de tipo `undefined` en el esquema v4 — **DEPRECATED**, debe ser aplanado | **Eliminado en v4** (el warning de deprecación arriba es el síntoma) |
| `environment` | `"happy-dom"` | Válido |
| `globals` | `false` | Válido |
| `setupFiles` | `["./__tests__/setup.ts"]` | Válido (sólo carga `@testing-library/jest-dom/vitest`) |
| `testTimeout` | `15000` | Válido |
| `hookTimeout` | `15000` | Válido |
| `clearMocks` | `true` | Válido |

El archivo de setup `apps/web/__tests__/setup.ts` (22 líneas) es **mínimo** — sólo `import "@testing-library/jest-dom/vitest"`. Sin trabajo a nivel de módulo que pudiera él mismo OOM-ear.

El `@ts-expect-error` sobre `poolOptions` es en sí mismo un olor: la **definición de tipo** dice que `poolOptions` no existe en la config v4, pero el **runtime** aún lo acepta por un ciclo de release más. El PR-7 del slice-7 trabajó alrededor del tipo añadiendo el comentario `@ts-expect-error` en lugar de migrar.

---

## §4. Reproducir el crash localmente

La reproducción completa es un comando. Desde la raíz del repo:

```bash
pnpm --filter web test 2>&1 | tail -80
```

**Resultado**: 120 pasados, 25 fallados, 255s de wall time, OOM de V8, exit 1. (Ver §2.)

### §4.1 Experimentos de aislamiento

Para pinpoint qué archivo de tests es el culpable, ejecuté invocaciones targeted:

| Comando | Wall time | Resultado |
|---------|----------:|-----------|
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx` | `>90s, sin output` | **SE CUELGA** |
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "SessionList"` | `4.9s` | 5 tests de SessionList corren, 2 fallan, 3 pasan, archivo completa |
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "CreateTransactionForm"` | `2.7s` | Todos 5 fallan (5/5), archivo completa |
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "EditTransactionForm"` | `0.9s` | Todos 5 fallan (5/5), archivo completa |
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "CategoryManager"` | `1.9s` | 2 fallan, 3 pasan |
| `pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "TransactionsList"` | `>30s, sin output` | **SE CUELGA** |
| `pnpm --filter web exec vitest run --pool=forks` (sin `singleFork`) | `>80s` | 17 archivos pasan, state-coverage de transactions se cuelga |
| `pnpm --filter web exec vitest run --pool=threads` (override config) | `15s` | Mismo OOM crash, ligeramente más rápido (los workers son más pequeños) |
| `NODE_OPTIONS=--max-old-space-size=256 pnpm --filter web exec vitest run __tests__/components/transactions/state-coverage.test.tsx -t "TransactionsList"` | `15.4s` | **OOM a 256MB** — confirma la hipótesis de presión de heap |

Los dos casos que se cuelgan son el oro diagnóstico:
- **`-t "TransactionsList"`** se cuelga incluso solo (sin otros bloques describe activos). Los 5 tests en este bloque describe son los más pequeños que aún disparan el cuelgue.
- **`-t "SessionList"`** completa en 4.9s — mismo archivo, pero SessionList no llama `useRouter()` (usa `fetch` directamente).

### §4.2 La excepción que realmente se lanza

Cuando se aísla con `-t "CreateTransactionForm"` (que completa rápido y surface errores reales), la falla es:

```
FAIL  state-coverage.test.tsx > CreateTransactionForm 5-state coverage > loading: shows the categories-loading copy
Error: invariant expected app router to be mounted
 ❯ useRouter ../../node_modules/.pnpm/next@16.2.10.../navigation.ts:179:10
 ❯ CreateTransactionForm components/transactions/CreateTransactionForm.tsx:54:18
     52|   const t = useTranslations("transactions.new");
     53|   const tCommon = useTranslations("common");
     54|   const router = useRouter();
       |                  ^
```

`next@16.2.10`'s `useRouter()` lanza incondicionalmente cuando el árbol de React se renderiza fuera de un mount del app router de Next.js. Este es el **mismo invariante** que el test de auth state-coverage esquiva mockeando `next/navigation` (líneas 47-49 de `apps/web/__tests__/components/auth/state-coverage.test.tsx`):

```ts
// From apps/web/__tests__/components/auth/state-coverage.test.tsx (lines 42-49):
// Mock `next/navigation` — ResetPasswordForm + SignUpForm call
// `router.replace` on success. The form's success path unmounts
// the form; without the mock, useRouter() throws "invariant expected
// app router to be mounted" in the test env.
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
```

**El archivo de tests state-coverage de transactions no tiene este mock.** Ese es el bug real.

---

## §5. El módulo del crash — qué hay en module-load

Cuando el archivo de tests es importado (antes de que cualquier `it()` corra), los imports de tope ejecutan:

```ts
// apps/web/__tests__/components/transactions/state-coverage.test.tsx
import { TransactionsList } from "@/components/transactions/TransactionsList";   // L66
import { CreateTransactionForm } from "@/components/transactions/CreateTransactionForm";  // L67
import { EditTransactionForm } from "@/components/transactions/EditTransactionForm";   // L68
import { CategoryManager } from "@/components/transactions/CategoryManager";        // L69
import { SessionList } from "@/components/auth/SessionList";                       // L70
```

Ninguno de estos **módulos lanza en tiempo de import** — sólo lanzan cuando sus componentes renderizan (porque `useRouter()` es un hook llamado dentro del cuerpo de la función). Así que el module-load es inocente. El crash es en **tiempo de render**, dentro de los bloques `it()`.

### §5.1 Qué componentes realmente llaman `useRouter()`

| Componente | ¿`useRouter()` llamado? | Dónde |
|-----------|-------------------------|-------|
| `TransactionsList` (`apps/web/components/transactions/TransactionsList.tsx`) | **No al tope**; sólo dentro de `RowEditMenu` (línea 290) — sólo se renderiza cuando se muestran las filas | L290 |
| `CreateTransactionForm` (`apps/web/components/transactions/CreateTransactionForm.tsx`) | **Sí, al tope** (L54) | L54 |
| `EditTransactionForm` (`apps/web/components/transactions/EditTransactionForm.tsx`) | **Sí, al tope** (L50) | L50 |
| `CategoryManager` (`apps/web/components/transactions/CategoryManager.tsx`) | **No** | — |
| `SessionList` (`apps/web/components/auth/SessionList.tsx`) | **No** (usa `fetch` directamente) | — |

Así que:
- **Tests que deberían lanzar** (15 = 5 CreateTransactionForm + 5 EditTransactionForm + 5 TransactionsList no-loading/no-empty/no-loading-error que renderizan filas): todos los 15 lanzan "invariant expected app router to be mounted".
- **Tests que pasan** (10 = 5 CategoryManager + 5 SessionList): pasan limpiamente.

Eso matchea el patrón diagnóstico: cuando el test surface el error rápido (describe único aislado), el archivo **completa con 5 fallas y el resto skipped**. Cuando corren los 25 juntos, el heap crece y el worker muere por OOM.

### §5.2 Por qué crece el heap (el mecanismo del OOM)

`next@16.2.10`'s `useRouter()` lanza dentro del `renderWithHooks` de React 19 (el stack trace muestra `Object.react_stack_bottom_frame → renderWithHooks → updateFunctionComponent`). En el modo concurrente de React 19, un lanzamiento en tiempo de render en un hook **commitea parcialmente el fiber**, deja la instancia del componente en el árbol, y el siguiente intento de render encola un retry. Como el test llama `render(<Providers><CreateTransactionForm /></Providers>)` sincrónicamente y luego afirma con `expect(screen.getByText(/Loading/i))`, el error es capturado por el error boundary de React **pero el árbol parcial de fibers no se desmonta hasta que `cleanup()` corra**. El auto-cleanup de RTL corre en `afterEach` — pero el `vi.mocked(listTransactions).mockImplementation(() => new Promise(() => {}))` del siguiente test retorna una **promise que nunca resuelve** (línea 216 del test), lo que significa que el callback `useEffect(() => fetchTransactions(), [])` nunca resuelve, y la instancia del componente se queda montada entre tests.

La cadena: 5 renders fallando + 5 promises nunca resolviendo × el scheduler de fibers concurrentes de React 19 → acumulación de heap → techo de V8 ~4 GB → OOM kill.

---

## §6. El split auth-client / auth-server (la pista falsa)

`apps/web/lib/auth-client.ts` (110 líneas) y `apps/web/lib/auth-server.ts` (129 líneas) fueron creados en el PR-2 del slice-8 (`2e05fc5`, "fix(web): slice 8.1.2 — narrow lib/auth.ts barrel to client-only / migrate call sites"). El orquestador me pidió verificar si este split está implicado.

**Veredicto: NO lo está.**

- `auth-client.ts` importa `import type { Session } from "./auth-server.js"` — un import **sólo de tipo** (línea 28). `verbatimModuleSyntax` + `isolatedModules` lo borran en tiempo de compilación; en runtime, `auth-server.ts` nunca es cargado por los consumidores de `auth-client.ts`.
- `auth-server.ts` importa `import "server-only"` e `import { cookies } from "next/headers"`. La config de vitest aliasea `server-only` → `node_modules/server-only/empty.js` (línea 116), así que el import `server-only` es un no-op en tests. El import `next/headers` **lanzaría** en tiempo de import en Node, pero el archivo de tests `__tests__/lib-auth.test.ts` sólo importa `auth-client.ts` (vía la cadena sólo-de-tipo se borra), nunca `auth-server.ts` directamente.

El alias `server-only` de la config de vitest + el import sólo-de-tipo en `auth-client.ts` juntos hacen que el split de auth sea **transparente a los workers de vitest**. El archivo `lib-auth.test.ts` (13 tests) pasa limpiamente en 6 ms — prueba de que el split de auth funciona como fue diseñado.

El crash **no está relacionado** con el PR-2 del slice-8. Pre-data al split del slice-8.1.2 — estaba presente en el PR-7 del slice-7 (`36386e1`), que es por lo que ese PR introdujo la solución alternativa `pool: "forks"`.

---

## §7. Restricciones de las convenciones del proyecto

- **AGENTS.md §7** (reglas de frontera ESLint):
  - `no-client-server-import` — `libs/features/*/client/` archivos NO DEBEN importar desde paths `*/server/`. El fix es mockear `next/navigation` en el archivo de tests, no cambiar ningún split client/server. El archivo de tests está en `apps/web/__tests__/`, no en `libs/features/*/client/`, así que la regla no es directamente aplicable — pero el **fix** (mockear `next/navigation` en la frontera de tests) honra la misma separación: el código del componente queda server-vs-client-split correctamente, el test sólo provee un router falso.
  - `no-prisma-outside-core` — no relacionado.
  - `no-schemas-outside-shared` — no relacionado.
  - `no-cross-module-import` — no relacionado.
- **AGENTS.md §10** (testing con Vitest):
  - `__tests__/*.test.ts(x)` colocalizados — ya seguido.
  - `globals: false` (la config establece esto) — significa que el fix debe usar **imports nombrados** desde `vitest` (`import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"`), que el archivo state-coverage de transactions ya hace.
  - `clearMocks: true` (la config establece esto) — `vi.clearAllMocks()` en `afterEach` ya está ahí (línea 211).
- **AGENTS.md §4** (TDD estricto):
  - El fix debe seguir RED → GREEN → TRIANGULATE → REFACTOR.
  - El RED actual es `pnpm --filter web test` sale con 1 (existente). El GREEN del fix es el mismo comando saliendo con 0.
  - Un nuevo test fallando en `apps/web/__tests__/components/transactions/state-coverage.test.tsx` es innecesario — el archivo de tests **ya existe** y es la superficie de regresión. El fix es hacerlo pasar mockeando `next/navigation`.

---

## §8. Blast radius

### §8.1 Los 25 tests fallando (archivo: `apps/web/__tests__/components/transactions/state-coverage.test.tsx`)

| Bloque describe | Tests | Comportamiento esperado tras el fix | Por qué cada test falla hoy |
|-----------------|------:|-------------------------------------|-----------------------------|
| `TransactionsList 5-state coverage` | 5 | Todos pasan | `RowEditMenu` (sub-componente) llama `useRouter()` → lanza |
| `CreateTransactionForm 5-state coverage` | 5 | Todos pasan | `useRouter()` al tope → lanza |
| `EditTransactionForm 5-state coverage` | 5 | Todos pasan | `useRouter()` al tope → lanza |
| `CategoryManager 5-state coverage` | 5 | Todos pasan | sin llamada a `useRouter()` → ya pasaba individualmente; fallaba en la corrida principal sólo porque el OOM cascó |
| `SessionList 5-state coverage` | 5 | Todos pasan (con un mock diferente — necesita `vi.stubGlobal("fetch", …)`, ya en su lugar) | sin llamada a `useRouter()` → ya pasaba; 2 de 5 fallan hoy por un timeout de `findByText` (issue menor separado: el test de `loading` afirma sobre `Loading…` pero el map de claves i18n tiene el literal `"Loading..."` — menor, no es la causa raíz del OOM) |

Así que el fix debe:
1. Mockear `next/navigation` al tope del archivo de tests (cierra los 15/25 lanzamientos).
2. Opcionalmente arreglar el literal de clave i18n `"Loading..."` vs regex `/Loading/i` para los 2 sub-fallos de SessionList — pero `/Loading/i` debería matchear `"Loading..."` (case-insensitive contiene "Loading")… déjame re-chequear. La regex es `/Loading/i` y el map de mensajes tiene `"loading": "Loading..."` — `Loading` (case-insensitive) SÍ está en `Loading...`, así que la afirmación debería pasar. Re-chequeando el log de SessionList: la línea 626 (`expect(await screen.findByText(/500/i))`) es la falla — el test mockea `fetch` para retornar `{ status: 500, body: "server fail" }` pero el `Response` no tiene un body incluido, y `screen.findByText(/500/i)` intenta encontrar texto que no se renderiza porque el UI de error del componente es `{res.status} {res.statusText}` y `statusText` está vacío. Así que el test de SessionList tiene su propio **bug menor separado** que está fuera de alcance para el fix del crash del worker de vitest.

### §8.2 Otros archivos de tests que pueden necesitar el mismo mock

Cualquier archivo de tests que importe un componente que use `useRouter()` desde `next/navigation` golpeará el mismo invariante. La lista transitiva (desde `apps/web/components/*` + `apps/web/lib/*`):

| Archivo fuente | ¿Usa `useRouter()`? | ¿Archivo de tests existe? |
|----------------|---------------------|---------------------------|
| `apps/web/components/transactions/CreateTransactionForm.tsx` | Sí | `state-coverage.test.tsx` (el roto) |
| `apps/web/components/transactions/EditTransactionForm.tsx` | Sí | mismo |
| `apps/web/components/transactions/TransactionsList.tsx` | Sí (en `RowEditMenu`) | mismo |
| `apps/web/components/transactions/CategoryManager.tsx` | No | mismo |
| `apps/web/components/auth/SessionList.tsx` | No | mismo |
| `apps/web/components/auth/LoginForm.tsx` | ¿`useRouter`? — no en el archivo que leí, pero el split del PR-7 del slice-7 lo habría tocado | `LoginForm.test.tsx` (pasa, 53 ms) |
| `apps/web/components/auth/SignUpForm.tsx` | Probable sí | `SignUpForm.test.tsx` (pasa, 66 ms) |
| `apps/web/components/auth/ForgotPasswordForm.tsx` | Probable sí | `ForgotPasswordForm.test.tsx` (pasa, 79 ms) |
| `apps/web/components/auth/ResetPasswordForm.tsx` | Probable sí | `ResetPasswordForm.test.tsx` (pasa, 88 ms) |

Los archivos de tests de los formularios de auth pasan porque **cada uno define su propio mock por archivo de `next/navigation`** (presumiblemente). Notar que el `state-coverage.test.tsx` de auth (que también importa formularios) mockea explícitamente `next/navigation` al tope — ver §4.2.

### §8.3 Qué hay de `app/*.test.tsx` (tests de rutas)

`__tests__/app/sign-in.test.tsx`, `sign-up.test.tsx`, `forgot-password.test.tsx`, `reset-password.test.tsx`, `dev-mailbox.test.tsx`, `landing.test.tsx` — los 6 archivos pasan en la corrida principal (dentro de los 120 pasando). Renderizan páginas, no componentes de formulario, así que no disparan `useRouter()` desde `next/navigation` directamente (las páginas son server components en producción, pero el test las renderiza en happy-dom).

### §8.4 Superficies de side-effect que se romperán si el fix altera la infra de tests

- `apps/web/lib/auth-client.ts` / `auth-server.ts` — intactos (el fix está en el archivo de tests, no en el source).
- `apps/web/components/transactions/*.tsx` — intactos.
- La config de vitest: un cambio en el archivo de setup **necesitaría** mantener la carga de `@testing-library/jest-dom/vitest` (ya está en `setupFiles`).

---

## §9. Candidatos de forma de fix (para que `sdd-propose` decida — NO comprometidos)

### Forma A — mínima: añadir `vi.mock("next/navigation", …)` al tope del archivo de tests

En `apps/web/__tests__/components/transactions/state-coverage.test.tsx`, después de la línea 53 (el bloque `vi.mock("next/navigation", …)` en el test de auth state-coverage es el modelo — copiar ese patrón, elevando el mock-replace a mock-push para los formularios de transactions):

```ts
// Mock `next/navigation` — TransactionsList + CreateTransactionForm +
// EditTransactionForm call `useRouter()`. Without the mock, useRouter()
// throws "invariant expected app router to be mounted" in happy-dom
// because no Next.js app-router context exists. The success paths call
// `router.push(...)`; the mock just records the call without navigating.
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
}));
```

Colocar esto **arriba** de la línea `import { TransactionsList } from "..."`, porque `vi.mock` es elevado por Vitest en tiempo de compilación pero el scope de la variable (`mockPush`) debe ser visible para cualquier test que quiera afirmar sobre llamadas a `router.push`.

- **Pros**: diff más pequeño (5 líneas), espeja el patrón ya usado en `auth/state-coverage.test.tsx` líneas 42-49, ningún otro archivo tocado.
- **Cons**: mock por archivo — si un archivo de tests futuro en `apps/web/__tests__/` también renderiza un componente que usa el router, el autor tiene que recordar el mismo boilerplate. Frágil contra nuevos archivos de tests.
- **Esfuerzo**: ~5 min.
- **Impacto en tests**: 15 lanzamientos actualmente fallando se vuelven afirmaciones sobre output renderizado; los 2 sub-fallos `findByText` de SessionList no están relacionados y están fuera de alcance. Tras el fix, **los 25 tests en el archivo deberían pasar** (los 2 de SessionList podrían aún fallar por su propio bug menor — ticket separado).
- **Verificación**: `pnpm --filter web test` sale con 0 con `Tests 145 passed (145)`, duration <10s.

### Forma B — durable: elevar el mock a `apps/web/__tests__/setup.ts` (auto-mock todos los tests de `apps/web`)

Mover el bloque `vi.mock("next/navigation", …)` de la Forma A a `apps/web/__tests__/setup.ts`, que es cargado por cada test en el suite (está en `setupFiles`). El archivo de setup ya carga `@testing-library/jest-dom/vitest`; añadir el mock de router allí significa que **cada** archivo de tests en `apps/web/__tests__/` automáticamente obtiene un router falso.

- **Pros**: cierra la fragilidad — cualquier test futuro que renderice un componente que usa el router está cubierto por default. Se alinea con el principio "tests quedan colocalizados con el código que verifican" (el invariante del test es "next/navigation es fake", y ese invariante ahora vive en el archivo de setup, no duplicado por test).
- **Cons**: cambia un archivo que es leído por 18 archivos de tests; riesgo de romper tests que **querían** afirmar sobre el comportamiento del router real (ninguno lo hace actualmente — pero es un cambio de contrato).
- **Esfuerzo**: ~10 min.
- **Impacto en tests**: los mismos 25 tests de state-coverage de transactions pasan + los bloques de mock por formulario en `auth/state-coverage.test.tsx` se vuelven redundantes y pueden eliminarse en un seguimiento. Sin regresión en los otros 17 archivos (pasan hoy sin el mock, y el mock es inocuo cuando no se usa).
- **Verificación**: `pnpm --filter web test` sale con 0; `pnpm lint:fixtures` aún pasa (la regla ESLint contra mocks no elevados no se dispara porque los mocks en setup-file son globales por diseño).

### Forma C — comprehensiva: Forma B + migrar `poolOptions` de vitest a top-level v4 + eliminar el `@ts-expect-error`

Forma B, más:
1. **Migrar la config de vitest al esquema v4**: cambiar `pool: "forks", poolOptions: { forks: { singleFork: true } }` a los equivalentes top-level de v4 (necesita chequear la [guía de migración de vitest 4](https://vitest.dev/guide/migration#pool-rework); el mensaje actual de deprecación dice "previous `poolOptions` are now top-level options" — probablemente `pool: "forks"` permanece, `singleFork: true` se vuelve un `singleFork: true` top-level o `poolMatchGlobs`).
2. **Eliminar el comentario `@ts-expect-error`** sobre el bloque ahora deprecado.
3. **Opcionalmente añadir `// @vitest-environment node` al archivo de tests lib-auth** (que no necesita happy-dom) — mejora de velocidad, no fix de bug.

- **Pros**: cierra la fragilidad + silencia el warning de deprecación + la consola de `pnpm --filter web test` queda limpia (sin banner DEPRECATED). Future-proof contra v5.
- **Cons**: diff más grande (3 archivos: setup.ts + vitest.config.ts + state-coverage.test.tsx); requiere leer la guía de migración de vitest 4 para acertar con la clave top-level.
- **Esfuerzo**: ~30 min (mayormente leer la guía de migración).
- **Impacto en tests**: los mismos 25 tests de state-coverage de transactions pasan + banner de deprecación se va.
- **Verificación**: `pnpm --filter web test` sale con 0 sin banner de deprecación, `pnpm turbo run build lint typecheck test` sale con 0 en todos los workspaces.

### Recomendación (esta exploración no compromete, sólo informa)

**La Forma B es la decisión correcta**. El cambio es "arreglar la falla de 25 tests" pero el mismo boilerplate por archivo existe en `auth/state-coverage.test.tsx` (líneas 42-49) — cada archivo de tests futuro que renderice un componente que usa el router está a una omisión accidental de esta misma cascada de OOM. Elevar el mock a `setup.ts` es la respuesta durable que matchea el patrón del plugin ESLint de boundary del slice-1 (un lugar canónico, muchos consumidores).

Si el orquestador quiere el cambio más pequeño posible que cierre el gate fallando y trata al hardening más amplio como un seguimiento, **la Forma A es suficiente** para que el reporte verify flipe a verde, con Forma B/C tracked como seguimiento.

---

## §10. Contrato de verificación

Tras aterrizar el fix:

1. **`pnpm --filter web test`** sale con 0; **los 145 tests pasan** (los 25 actualmente fallando + los 120 ya pasando).
2. **Wall time < 30 segundos** (la ventana de OOM de 255s colapsa de vuelta a los típicos ~5s).
3. **Ningún error `Worker exited unexpectedly`** en el output.
4. **Ningún OOM de heap de V8** (`FATAL ERROR: Ineffective mark-compacts near heap limit` no debería aparecer).
5. **El mock de `next/navigation` está en su lugar** — verificable por `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/**` retornando ≥1 hit.
6. **`pnpm --filter api test`** aún sale con 0 (el suite de tests de apps/api es ortogonal a este fix; el cambio no debe romperlo).
7. **`pnpm turbo run bdd e2e`** aún sale con 0 (el gate BDD es GREEN hoy, debe quedarse GREEN).
8. **`pnpm lint:fixtures`** aún sale con 0 (sin nuevas violaciones de frontera ESLint).
9. **Ningún `new PrismaClient()` nuevo fuera de `libs/core/database/src/`** (la regla existente aún pasa).
10. **Ninguna mutación de código fuente en `apps/web/components/transactions/*`, `apps/web/lib/auth-*`, o `apps/web/vitest.config.ts`** (el fix toca sólo infra de tests).
11. **Rastro de TDD estricto**: los 25 tests existentes fallando sirven como el RED. El fix los flipea a GREEN. No se necesita archivo de tests nuevo; el `state-coverage.test.tsx` existente es la superficie de regresión.
12. **Espejo en español**: cualquier `.md` nuevo bajo `openspec/changes/fix-web-vitest-crash/` (proposal/spec/design/tasks) obtiene un espejo `Documents-es/` en el mismo commit atómico; `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/<file>.md` retorna 0 codepoints CJK en el espejo.

---

## §11. Archivos leídos (para trazabilidad)

Código leído vía `codegraph_explore` + herramientas de Read targeted. La herramienta MCP codegraph fue el mecanismo principal de lectura (según protocolo AGENTS.md / CodeGraph). Todas las fuentes son verbatim.

- `apps/web/vitest.config.ts` (1–120) — lectura completa.
- `apps/web/lib/auth-client.ts` (1–110) — lectura completa.
- `apps/web/lib/auth-server.ts` (1–129) — lectura completa.
- `apps/web/__tests__/setup.ts` (1–22) — lectura completa.
- `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (1–681) — lectura completa (secciones clave).
- `apps/web/__tests__/components/auth/state-coverage.test.tsx` (1–80) — leído por el patrón del mock de `next/navigation`.
- `apps/web/components/transactions/CreateTransactionForm.tsx` (1–60) — confirmó `useRouter()` en L54.
- `apps/web/components/transactions/EditTransactionForm.tsx` (1–300) — confirmó `useRouter()` en L50.
- `apps/web/components/transactions/TransactionsList.tsx` (1–310) — confirmó `useRouter()` en L290 dentro de `RowEditMenu`.
- `apps/web/components/transactions/CategoryManager.tsx` (1–122) — confirmó ninguna llamada a `useRouter()`.
- `apps/web/components/auth/SessionList.tsx` (1–154) — confirmó ninguna llamada a `useRouter()`.
- `apps/web/playwright.config.ts` (1–58) — leído por contexto (no relacionado con el crash).
- `apps/web/middleware.ts` (1–37) — leído por contexto (no relacionado).
- Observación Engram `#2278` (reporte verify del slice 8) — confirmó que el gate BDD es GREEN.
- `git log --oneline -30` — confirmó el historial de commits (PR-7 del slice-7 `36386e1`, PR-2 del slice-8 `2e05fc5`).

## §12. Preguntas abiertas para `sdd-propose`

1. **En alcance o no**: ¿pertenece al cambio el sub-fallo `findByText(/500/i)` de SessionList (2 de 25 tests), o es un ticket separado? Mi lectura: es un **bug menor separado** (el componente renderiza `{res.status} {res.statusText}` y `statusText` está vacío para el `Response` mockeado), y abordarlo en el mismo cambio conflate dos modos de fallo.
2. **Selección de forma**: ¿A (mínima), B (elevar a setup.ts, durable), o C (B + migración de esquema de vitest-4)?
3. **Timing de migración de vitest 4**: ¿debería este cambio también migrar `poolOptions` → top-level, o es eso un cambio separado de "vitest 4 hardening"? El warning de deprecación seguirá disparándose hasta entonces.
4. **Modelo de ramas**: según AGENTS.md §2 la rama de trabajo es `feat/fix-web-vitest-crash` cortada de `develop` (no de `main`); confirmar.
5. **Reconocimiento de pre-existencia**: ¿debería la proposal.md citar explícitamente al PR-7 del slice-7 (`36386e1`) como el punto de introducción de la solución alternativa (es decir, "herencia pre-existente del slice-7, no regresión del slice-8") como rastro de descubrimiento?
6. **Semilla RED del TDD estricto**: ¿se acuerda que el RED es el `pnpm --filter web test` exit-1 existente con 25 fallas, y que no se necesita archivo de tests nuevo?

---

**Fin del brief.**

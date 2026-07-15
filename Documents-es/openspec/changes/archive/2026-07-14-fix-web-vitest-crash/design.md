# Diseño Técnico — `fix-web-vitest-crash`

> **Estado**: borrador · fase de diseño
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `d9fdfec`) → tracker `feat/fix-web-vitest-crash`
> **Almacén de artefactos**: hybrid · **Modo**: auto · **Entrega**: `auto-chain` NO disparado (28 LOC permanece single-PR) · **Presupuesto de revisión**: 400 líneas
> **TDD estricto**: activo (AGENTS.md §4) · **PR único**: 1 archivo editado (+28 / 0), 2 commits atómicos
> **Forma del fix**: B (decisión auto capturada en propuesta §0)
> **Autor**: Orquestador SDD → ejecutor `sdd-design` (modelo `MiniMax-M3`)
> **Fecha**: 2026-07-14
> **Entradas leídas**: `proposal.md` (Engram `#2362`, 217 LOC), `spec.md` (Engram `#2363`, 419 LOC, 6 objetivos, 10 requerimientos, 6 escenarios, 20 ACs), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (precedente de formato, 14 secciones), `apps/web/__tests__/setup.ts` (22 líneas actuales), `apps/web/vitest.config.ts` (120 líneas; `setupFiles` en L39, solución alternativa `pool: "forks"` en L54-63), `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 líneas; único mock es `@/lib/transactions-api` en L39-54 — sin `vi.mock("next/navigation", …)`)
> **Resolución de preguntas abiertas de la spec**: Q1 (JSDoc, sin nueva ADR), Q2 (forma completa del router `{ push, replace, back, forward, refresh, prefetch }`), Q3 (App Router sólo — sin mocks de `next/link`/`next/router`/`next/headers`) — TODAS resueltas en spec; este diseño no las re-litiga.

---

## 1. Mapeo objetivos ↔ enfoque técnico

| Objetivo | Anclaje en spec | Enfoque técnico |
|----------|-----------------|-----------------|
| **G1** — vitest de `apps/web` sale con 0 con 145/145 pasando | §3 G1, R1, R2, R3, R4 | Elevar `vi.mock("next/navigation", …)` a `apps/web/__tests__/setup.ts` (cargado por los 18 archivos de tests vía `setupFiles` en `apps/web/vitest.config.ts:39`). La factory retorna stubs de `useRouter`, `usePathname`, `useSearchParams`, `useParams`. Los 15 escenarios que lanzaban en `state-coverage.test.tsx` ahora encuentran un router falso en tiempo de render; los 10 ya pasando no se afectan. El wall time baja 255s → <30s; el heap se queda bajo 1 GB. |
| **G2** — state-coverage 25/25 pasa | §3 G2, R5 | Mismo hoist. Los 15 escenarios que llamaban `useRouter()` desde `TransactionsList`/`CreateTransactionForm`/`EditTransactionForm` y lanzaban `invariant expected app router to be mounted` (`next@16.2.10/navigation.ts:179`) ahora resuelven el hook contra el stub y proceden. Los 10 ya pasando (CategoryManager + 5 SessionList) se quedan GREEN. Los 2 sub-fallos `findByText(/500/i)` de SessionList permanecen fuera de alcance según propuesta §2.2 (ticket separado, no es la causa raíz del OOM). |
| **G3** — mock durable | §3 G3 | El mock vive en la entrada única de setup del suite. Cada archivo de tests bajo `apps/web/__tests__/` (los 18 existentes + cualquier archivo futuro) obtiene el router falso automáticamente. El boilerplate por archivo (actualmente el mock por archivo redundante de auth state-coverage en L47-49) se vuelve opcional, no requerido. |
| **G4** — BDD no regresado | §3 G4, R6 | Sin cambios a `libs/features/*/docs/*.feature`, definiciones de pasos, world files, o puertos de workspace. El gate BDD permanece GREEN (estaba GREEN en `develop@d9fdfec` según el reporte verify del slice-8 Engram `#2278`). |
| **G5** — ningún fuente de componente tocado | §3 G5, R7 | Sólo `apps/web/__tests__/setup.ts` se edita. El `git diff --stat` filtrado por `apps/web/components/\|apps/web/lib/\|apps/web/app/\|apps/api/\|libs/` DEBE estar vacío (AC13). |
| **G6** — solución alternativa del slice-7 preservada | §3 G6, R8 | `apps/web/vitest.config.ts` líneas 54-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` + el comentario `@ts-expect-error`) DEBEN permanecer sin cambios. La solución alternativa mitiga un modo de fallo DIFERENTE (caso borde de actualización de estado driven por `useEffect` de React 18 en el patrón mount-then-load-then-setState de `EditTransactionForm`); el fix del OOM apunta al invariante `useRouter()`. Ambos coexisten. |

---

## 2. Diffs archivo por archivo

### Archivo 1 — `apps/web/__tests__/setup.ts` (EDITAR, +28 / -0)

**Estado actual** (22 líneas):

```typescript
import "@testing-library/jest-dom/vitest";

/**
 * Vitest setupFiles hook for `apps/web` — slice 4 batch 4b.
 *
 * Imports `@testing-library/jest-dom/vitest` so the custom matchers
 * (`toBeInTheDocument`, `toHaveAttribute`, etc.) extend `expect` and
 * resolve at test-execution time. The matchers are TypeScript-aware
 * (the `/vitest` subpath exposes the `Assertion<...>` type extension).
 *
 * Why a separate file instead of importing in each test:
 *  - Single declaration site (DRY).
 *  - Per-test imports re-extend the Assertion type and clutter the
 *    test file headers.
 *  - The vitest `setupFiles` config runs the import BEFORE any test
 *    module loads so the matchers are available globally.
 *
 * No other setup is required for slice 4 batch 4b — the shadcn-style
 * primitives are pure React components with no I/O, no fetch, no DOM
 * mutation outside the render tree. happy-dom provides a DOM, the
 * matchers add the assertion surface, and the tests run.
 */
```

**Estado final** (28 LOC netas añadidas — bloque `vi.mock` + párrafo JSDoc arriba de él, colocado DESPUÉS del párrafo JSDoc existente):

```typescript
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/**
 * Vitest setupFiles hook for `apps/web` — slice 4 batch 4b.
 *
 * Imports `@testing-library/jest-dom/vitest` so the custom matchers
 * (`toBeInTheDocument`, `toHaveAttribute`, etc.) extend `expect` and
 * resolve at test-execution time. The matchers are TypeScript-aware
 * (the `/vitest` subpath exposes the `Assertion<...>` type extension).
 *
 * Why a separate file instead of importing in each test:
 *  - Single declaration site (DRY).
 *  - Per-test imports re-extend the Assertion type and clutter the
 *    test file headers.
 *  - The vitest `setupFiles` config runs the import BEFORE any test
 *    module loads so the matchers are available globally.
 *
 * `next/navigation` is mocked globally (slice 8 — fix-web-vitest-crash)
 * because happy-dom does not mount the Next.js app router. Any component
 * that calls `useRouter()`, `usePathname()`, `useSearchParams()`, or
 * `useParams()` throws `invariant expected app router to be mounted`
 * (`next@16.2.10/navigation.ts:179`) at render time without this stub.
 * Without the stub, the 15/25 scenarios in
 * `apps/web/__tests__/components/transactions/state-coverage.test.tsx`
 * that render `TransactionsList` (via `RowEditMenu`),
 * `CreateTransactionForm`, or `EditTransactionForm` throw at render,
 * the partial fiber stays mounted across tests, and V8 heap grows to
 * ~4 GB before the worker is OOM-killed after ~4 minutes (slice-8
 * verify Gate 3, Engram `#2278`).
 *
 * Slice 7 PR-7 (`36386e1`) added `pool: "forks"` +
 * `singleFork: true` to `apps/web/vitest.config.ts` (lines 54-63).
 * That workaround changed WHEN the worker OOM fires, not WHETHER —
 * it does NOT address the `useRouter()` invariant. This global mock
 * is the root-cause fix; both coexist.
 *
 * The mock lives at the suite's single setup entry so every test
 * file under `apps/web/__tests__/` (the existing 18 + any future
 * file) gets the fake router automatically. The per-file mock at
 * `apps/web/__tests__/components/auth/state-coverage.test.tsx`
 * L47-49 becomes redundant but stays untouched in this PR (follow-up
 * cleanup). See `openspec/changes/fix-web-vitest-crash/{proposal,spec,design}.md`.
 */

// Factory form is REQUIRED: `vi.mock` is hoisted by Vitest's transform
// above all imports, and the factory receives the `vi` object so the
// `vi.fn()` stubs are recreated per test. `clearMocks: true` in
// `apps/web/vitest.config.ts:38` resets the stubs automatically, so
// tests do not need to manually clear them between scenarios.
//
// `useRouter` returns the FULL router shape (`push`, `replace`, `back`,
// `forward`, `refresh`, `prefetch`) — the 3 affected form components
// call `useRouter().push(...)` for success-path navigation; a minimal
// stub that only returns `{ replace }` would silently break those
// success-path assertions. The auth forms' per-file mock returns
// only `{ replace }` because they only call `replace`; we return the
// full shape here so any router-using component is covered.
//
// `useSearchParams` returns a fresh `URLSearchParams()` (WHATWG spec
// class implemented at full fidelity in happy-dom 20.10; the 3
// affected components call `.get(...)` only). `useParams` returns
// `{}` so a future component that destructures it does not crash on
// `undefined`.
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
  useParams: () => ({}),
}));
```

**Resumen del diff**:

- Después de `import "@testing-library/jest-dom/vitest";` añadir `import { vi } from "vitest";`.
- Añadir un párrafo JSDoc al bloque existente (después del párrafo actual "No other setup is required") explicando el invariante de `next/navigation`, la cascada de OOM, la coexistencia con la solución alternativa del slice-7, y el rol de única-fuente-de-verdad del archivo.
- Añadir un comentario JSDoc inmediatamente arriba de la factory `vi.mock` explicando la forma factory, la rationale de la forma completa del router, y la rationale de `URLSearchParams` / `useParams`.
- Añadir la factory `vi.mock("next/navigation", () => ({ … }))` al final del archivo.
- LOC del archivo: 22 → ~50 (+28 / -0).
- Ninguna otra declaración en el archivo cambia.

**Verificación**:

- AC1: `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` retorna ≥1 hit.
- AC2: la factory retorna `useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() })`.
- AC3: la factory retorna `usePathname: () => "/"`, `useSearchParams: () => new URLSearchParams()`, `useParams: () => ({})`.
- AC4: la prosa JSDoc explica la ausencia del app router en happy-dom + la cascada de OOM.

---

### Archivo 2 — `apps/web/vitest.config.ts` (VERIFICAR SOLAMENTE, sin editar)

Este archivo **no** es modificado por este cambio. Verificamos sólo que el array `setupFiles` aún referencia `apps/web/__tests__/setup.ts` (para que el mock aterrice ahí automáticamente) y que la solución alternativa `pool: "forks"` del PR-7 del slice-7 se preserva.

Extracto relevante de `apps/web/vitest.config.ts`:

```typescript
test: {
  include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
  environment: "happy-dom",
  globals: false,
  clearMocks: true,
  setupFiles: ["./__tests__/setup.ts"],         // ← línea 39: aterriza el nuevo mock
  pool: "forks",                                 // ← línea 54: preservado
  // @ts-expect-error — poolOptions is in the vitest runtime config …
  poolOptions: {                                 // ← líneas 59-63: preservadas
    forks: {
      singleFork: true,
    },
  },
  testTimeout: 15000,
  hookTimeout: 15000,
},
```

**Verificación** (durante el apply):

- AC5: `grep -n 'setupFiles' apps/web/vitest.config.ts` muestra `["./__tests__/setup.ts"]`.
- AC6: `grep -n 'pool' apps/web/vitest.config.ts` aún muestra `pool: "forks"` Y `singleFork: true`.

---

### Archivo 3 — `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (VERIFICAR SOLAMENTE, sin editar)

Este archivo es la **superficie de regresión**. NO es modificado por este cambio. El único mock actualmente en el archivo es el bloque por test `vi.mock("@/lib/transactions-api", …)` en las líneas 39-54 (mockeando el cliente API, NO `next/navigation`).

Los 15 escenarios que previamente lanzaban se distribuyen entre:

- 5 × `TransactionsList` (renderiza la tabla, que contiene `RowEditMenu` — `TransactionsList.tsx:290` llama `useRouter()`).
- 5 × `CreateTransactionForm` (el componente de formulario llama `useRouter().push(...)` en éxito del submit — `CreateTransactionForm.tsx:54`).
- 5 × `EditTransactionForm` (el componente de formulario llama `useRouter().push(...)` en éxito de la actualización — `EditTransactionForm.tsx:50`).

Los 10 escenarios que ya pasan:

- 5 × `CategoryManager` (NO llama `useRouter()`; sólo muta categorías vía la API).
- 5 × `SessionList` (NO llama `useRouter()`; sólo lista sesiones; los 2 sub-fallos `findByText(/500/i)` están fuera de alcance según propuesta §2.2).

**Verificación** (durante el apply):

- AC11: `grep -E "\.(skip|todo)\(" apps/web/__tests__/components/transactions/state-coverage.test.tsx` retorna el mismo conteo de hits que en `develop@d9fdfec` (sin nuevas decoraciones).
- AC10: `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` sale con 0 con 25/25 PASS.

---

## 3. Plan de ejecución (TDD estricto)

Según AGENTS.md §4, TDD estricto requiere orden RED → GREEN → TRIANGULATE → REFACTOR. El RED existente está capturado por el `pnpm --filter web test` exit-1 actual (25/145 fallando tras 255s de cascada de OOM). No se necesita archivo de tests nuevo; `state-coverage.test.tsx` ES la superficie de regresión.

1. **RED ya observado** (registrado en el brief de exploración Engram `#2361` §2, §4.2 + propuesta §3 paso 1). `pnpm --filter web test` actualmente sale con 1 con 25/145 fallando, 120/145 pasando, `Worker exited unexpectedly`, heap de V8 ~4 GB. El RED es el exit-1 existente de `state-coverage.test.tsx`; no se requiere archivo de tests nuevo (la excepción de AGENTS.md §4 para RED pre-existente es explícita: "un test fallando que reproduzca la falla debe existir ANTES del cambio de producción").

2. **Editar Archivo 1** (`apps/web/__tests__/setup.ts`): añadir la factory `vi.mock("next/navigation", …)` al fondo + párrafo JSDoc arriba de ella (según §2 Archivo 1). Ningún otro archivo tocado.

3. **Verificar Archivo 2** (`apps/web/vitest.config.ts`): confirmar que `setupFiles: ["./__tests__/setup.ts"]` en línea 39 aún cablea el archivo de setup modificado. Sin edición necesaria.

4. **GREEN: ejecutar el test de state-coverage aislado**: `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx`. DEBE salir con 0 con 25/25 PASS (estaba 15/25 lanzando). Verifica que los 3 componentes de formulario afectados ahora encuentran un router falso. El wall time debería ser <10s.

5. **GREEN: ejecutar el suite completo de apps/web**: `pnpm --filter web test`. DEBE salir con 0 con `Tests 145 passed (145)`. Los otros 17 archivos de tests (120 tests) que ya pasaban continúan pasando — el mock global es un no-op para ellos (no renderizan componentes que usen el router; los stubs `useRouter()`/`usePathname()`/`useSearchParams()` nunca son llamados). El wall time DEBE caer por debajo de 30s. Sin `Worker exited unexpectedly`. Sin `FATAL ERROR: Ineffective mark-compacts near heap limit`.

6. **Verificar BDD no regresado**: `pnpm turbo run bdd`. DEBE salir con 0 con 43/43. Confirma que ningún archivo de feature de Cucumber, definición de pasos, world file, o puerto de workspace fue tocado.

7. **Verificar solución alternativa del slice-7 preservada**: `grep -n "pool" apps/web/vitest.config.ts` DEBE aún mostrar `pool: "forks"` Y `singleFork: true`. `git log --oneline | grep 36386e1` DEBE aún mostrar el commit del PR-7 del slice-7 intacto.

8. **Commit atómicamente**: 2 commits (según §4 abajo).

---

## 4. Commits atómicos

PR único, 2 commits atómicos (alineados a unidad-de-trabajo; según AGENTS.md §5 cada commit revierte limpiamente con `git revert <sha>`):

1. `test(web): hoist vi.mock('next/navigation') to apps/web/__tests__/setup.ts (R1, R2)` — el cambio de código de producción: añadir la factory del mock global + JSDoc a `apps/web/__tests__/setup.ts`. Nota el tipo `test:` según vocabulario de AGENTS.md §6 (el cambio ES un cambio de infra de tests, no un feature; `fix:` sería engañoso porque no se está añadiendo ninguna feature de producción).

2. `chore(web): verify pnpm --filter web test exits 0 with 145/145 (R4 marker)` — log de verificación: el output del exit-0 de `pnpm --filter web test` capturado en el cuerpo del commit. Opcional pero le da al cierre del slice-8 un rastro en papel. Puede plegarse en el commit 1 si el revisor prefiere menos commits — pero separar hace que la observación GREEN sea distinta del cambio que causa el GREEN.

**Higiene de commits** (AGENTS.md §6):

- Sin `Co-Authored-By` / sin atribución de IA.
- Asuntos ≤72 caracteres, imperativos, sin punto final.
- Vocabulario de tipos de §6: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`.
- Los cuerpos explican el PORQUÉ (la cascada de OOM, la coexistencia con la solución alternativa del slice-7), no el QUÉ (el diff ya muestra qué).

---

## 5. Plan de ejecución de tests

| Escenario de spec | Comando de test | Resultado esperado |
|-------------------|-----------------|---------------------|
| **G1.1** (suite de apps/web 0) | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)`; wall <30s; sin `Worker exited unexpectedly`; sin `FATAL ERROR` (AC7, AC8, AC9) |
| **G2.1** (state-coverage 25/25) | `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25/25 PASS; sin `.skip`/`.todo` añadidos (AC10, AC11) |
| **G3.1** (mock durable) | (cubierto por G1.1) — el conteo de tests incluye los 18 archivos existentes (≥145 tests a través de ≥18 archivos), probando que el mock global aplica a cada archivo. Un nuevo `foo.test.tsx` hipotético que renderice un componente que usa `useRouter()` pasaría sin mock por archivo (AC19). |
| **G4.1** (BDD no regresado) | `pnpm turbo run bdd` | exit 0; 43/43 (AC12) |
| **G5.1** (ningún fuente tocado) | `git diff --name-only origin/develop..HEAD \| grep -E 'apps/web/(components\|lib\|app)/.*\.tsx$\|apps/web/(lib)/.*\.ts$\|apps/api/.*\.ts$\|libs/.*\.ts$'` | vacío (AC13, AC14) |
| **G6.1** (solución alternativa del slice-7 preservada) | `grep "pool" apps/web/vitest.config.ts` | aún muestra `pool: "forks"` y `singleFork: true` (AC6); `git log --oneline \| grep 36386e1` retorna 1 hit (AC15) |

### Pasos de verificación manual / no-CI

- `pnpm --filter web test --reporter=verbose` para enumerar cada uno de los 145 escenarios y confirmar ningún decorador `.skip` / `.todo`.
- `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR|invariant expected"` para confirmar que la firma del OOM está ausente de stderr.
- `time pnpm --filter web test` para capturar el wall time (`real` < 30s según AC9).
- `git log --oneline develop..feat/fix-web-vitest-crash` para confirmar los 2 commits de unidad-de-trabajo (asuntos ≤72 chars, sin "Co-Authored-By", según AC16 + AC17).
- `git show 36386e1 -- apps/web/vitest.config.ts` para confirmar que el commit de la solución alternativa del slice-7 se preserva (NO enmendado o rebaseado).
- `pnpm lint:fixtures` para confirmar que el plugin de frontera aún pasa (sin nueva regla necesaria; el mock es de infra de tests, no un guardia de frontera de código — propuesta §4.3 confirma).
- `pnpm turbo run lint typecheck` para confirmar que ESLint y TypeScript aún pasan (sin fuente de producción tocada, así que trivial).

---

## 6. Riesgos + mitigaciones (concretos)

| ID | Riesgo | Mitigación |
|----|--------|------------|
| **R1** | Añadir el mock global a `setup.ts` podría romper un test no relacionado que confiaba en la AUSENCIA de un mock de router. | El mock es un no-op para tests que no renderizan componentes de Next.js — los stubs `useRouter()` / `usePathname()` / `useSearchParams()` / `useParams()` nunca son llamados por ellos. Los 17 archivos actualmente pasando (120 tests) continuarán pasando; `clearMocks: true` en `apps/web/vitest.config.ts:38` resetea los stubs `vi.fn()` por test. **Verificación**: G1.1 ejecuta el suite completo de 145 tests; si algún test no relacionado falla, el modo de fallo apunta a un test que importa `next/navigation` directamente (ninguno lo hace actualmente — los formularios de auth pasan por `next/navigation` y ya tienen un mock por archivo que simplemente queda ensombrecido por el global). |
| **R2** | El hoisting de Vitest podría conflictuar con el `vi.mock("next/navigation", …)` por archivo existente en `apps/web/__tests__/components/auth/state-coverage.test.tsx` L47-49. | El `vi.mock` por archivo sobrescribe al global para el alcance de ese archivo (Vitest aplica los mocks en orden de import; la llamada por archivo re-vincula la factory para la corrida de tests de ese archivo). Los tests de auth continúan pasando con el mock por archivo en su lugar — verificado por la línea base existente de 120 tests. El mock por archivo se vuelve redundante tras este PR pero se deja intacto para la limpieza de seguimiento (fuera de alcance según propuesta §2.2). **Verificación**: G1.1 (suite completo) captura cualquier regresión. |
| **R3** | El warning de deprecación `test.poolOptions` de vitest-4 aún está presente y puede volverse un error duro en vitest 5. | Fuera de alcance según propuesta §2.2; ticket separado. La solución alternativa del PR-7 del slice-7 permanece; la deprecación de `poolOptions` no bloquea este fix. El fix es aditivo, no un reemplazo. |
| **R4** | La forma factory del mock retorna un objeto plano para `useSearchParams()` (`new URLSearchParams()`) — algunos componentes podrían destructurar métodos de `URLSearchParams` que no existen en el polyfill de happy-dom. | `URLSearchParams` es una clase de la spec WHATWG implementada en happy-dom con fidelidad completa. Los 3 componentes afectados (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`) llaman sólo `useSearchParams().get("…")`; `URLSearchParams.get` está presente en happy-dom 20.10. Verificado por código del componente (sin uso de `.entries()`, `.forEach()`, o `.keys()` sobre `useSearchParams()`). |
| **R5** | El fix podría confundirse con un ejercicio de "quitar el `import type`" (espejando el precedente de `fix-api-nestjs-di`) y re-disparar la confusión del PR-2 del slice-8. | El split de auth (`auth-client.ts` / `auth-server.ts`) es `import type` (borrado en tiempo de compilación) — el brief de exploración §6 verifica que es transparente a los workers de vitest. El OOM no tiene nada que ver con el split de auth; el log de commits (el PR-7 del slice-7 `36386e1` introdujo la solución alternativa PRE-PR-2 el 2026-07-08) es la pistola humeante. La descripción del PR (según spec R10) DEBE citar esto explícitamente para que los revisores no re-caminen el callejón sin salida. |

---

## 7. Fuera de alcance

Reiterado desde propuesta §2.2 + spec §10 + AGENTS.md §11. Lo siguiente es explícitamente NO tocado por este PR:

1. Los 2 sub-fallos `findByText(/500/i)` de SessionList (el `Response` mockeado no tiene `statusText`, así que `'500 '` matchea con un espacio al final) — ticket separado. Independiente de la cascada de OOM.
2. El warning de deprecación `test.poolOptions` de vitest-4 ("`test.poolOptions` was removed in Vitest 4. All previous `poolOptions` are now top-level options") — ticket separado. Se volverá un error duro en vitest 5. El proyecto está en vitest 4.1.9.
3. La solución alternativa `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` del PR-7 del slice-7 en `apps/web/vitest.config.ts:54-63` — PRESERVADA, no eliminada. Mitiga un modo de fallo diferente (carrera de actualización de estado driven por `useEffect` de React 18 en el patrón mount-then-load-then-setState de `EditTransactionForm`).
4. Los directorios shared huérfanos (`libs/features/*/shared/` con imports vacíos) — ticket separado, deuda de herencia del slice-7.
5. Refactorizar `TransactionsList` / `CreateTransactionForm` / `EditTransactionForm` para no llamar `useRouter()` — el código de producción permanece tal cual.
6. Eliminar el bloque `vi.mock("next/navigation", …)` por archivo en `apps/web/__tests__/components/auth/state-coverage.test.tsx:47-49` — el mock global lo hace redundante, pero la eliminación es una limpieza de seguimiento.
7. Mockear `next/link` (componente JSX, no un hook), `next/router` (equivalente del router de páginas, no usado), o `next/headers` (API server-only, no usada por los 3 componentes afectados) — apps/web es App Router exclusivamente.
8. Nueva ADR bajo `docs/architecture/decisions/` — el párrafo JSDoc en `setup.ts` es la documentación según resolución de Q1 de la spec.
9. Nueva regla ESLint en `tools/eslint-plugin-boundary/` — el mock es una convención de infra de tests, no un guardia de frontera de código (propuesta §4.3 confirma).
10. Cualquier cambio en `apps/api/`, `libs/features/*/`, `libs/core/*/` — el fix es sólo de apps/web.
11. Cualquier archivo de tests nuevo (sin `.test.ts` / `.test.tsx` nuevo) — el `state-coverage.test.tsx` existente es la superficie de regresión.
12. Cualquier upgrade de versión de vitest (4.1.9 → v5 o similar).
13. Enforzamiento del gate de cobertura en CI (AGENTS.md §11).
14. Migración de `gastos-personales/` al modelo de vertical-slicing (el playbook se entrega aquí; la migración corre en slice-8 8.4 según AGENTS.md §11).
15. i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción (gestor de secretos, HSTS, CSP más allá de los defaults de Next, config de CDN), observabilidad (OpenTelemetry, Prometheus, envío de logs), UI de audit log (AGENTS.md §11).
16. Tocar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/` o enmendar cualquier commit de la cadena del slice-7 (`36386e1`, `2e05fc5`).
17. Un espejo en español de `design.md` (según instrucción del orquestador + precedente de `fix-api-nestjs-di` — design/spec/proposal de carpeta de cambio son artefactos de coordinación entre fases SDD, no documentos de cara al usuario).

---

## 8. Preguntas abiertas para la fase de tasks

**Ninguna.** Las 3 preguntas diferidas desde la propuesta están resueltas en la spec:

- Q1 (área de superficie del mock) → resuelta: forma completa del router `{ push, replace, back, forward, refresh, prefetch }` + stubs de `usePathname`/`useSearchParams`/`useParams`. Spec §11 Q2.
- Q2 (limpieza del mock por archivo) → resuelta: diferida a limpieza de seguimiento; este PR sólo AÑADE el mock global, NO elimina el mock por archivo redundante en `apps/web/__tests__/components/auth/state-coverage.test.tsx:47-49`. Spec §11.
- Q3 (eliminación de la solución alternativa del slice-7) → resuelta: solución alternativa PRESERVADA. Mitiga un modo de fallo diferente. Spec §11.

---

## 9. Criterios de validación para `sdd-verify`

`sdd-verify` verificará post-merge:

| # | Criterio | Condición de pass |
|---|----------|-------------------|
| 1 | `pnpm --filter web test` sale con 0 | exit 0; `Tests 145 passed (145)` (AC7) |
| 2 | Sin firma de OOM en stderr | `pnpm --filter web test 2>&1 \| grep -E "Worker exited\|FATAL ERROR"` sale con 1 (AC8) |
| 3 | Wall time por debajo de 30s | `time pnpm --filter web test` reporta `real` < 30s (AC9) |
| 4 | Los 25 de state-coverage.test.tsx pasan | `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` sale con 0; 25 PASS / 0 FAIL (AC10) |
| 5 | Sin decoración `.skip` / `.todo` añadida | `grep -E "\.(skip\|todo)\(" apps/web/__tests__/components/transactions/state-coverage.test.tsx` coincide con el conteo de hits de `develop@d9fdfec` (AC11) |
| 6 | `pnpm turbo run bdd` sale con 0 | 43/43 escenarios pasan (AC12) |
| 7 | Ningún archivo fuente tocado | `git diff --stat develop..feat/fix-web-vitest-crash -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` está vacío (AC13) |
| 8 | Sólo `setup.ts` se edita bajo `apps/web/` | `git diff --name-only develop..feat/fix-web-vitest-crash -- 'apps/web/'` retorna exactamente `apps/web/__tests__/setup.ts` (AC14) |
| 9 | `setupFiles` de vitest.config.ts sin cambios | `grep -n 'setupFiles' apps/web/vitest.config.ts` muestra `["./__tests__/setup.ts"]` (AC5) |
| 10 | `pool: "forks"` de vitest.config.ts sin cambios | el archivo aún tiene `pool: "forks"` y `singleFork: true` (AC6) |
| 11 | Commit `36386e1` del slice-7 preservado | `git log --oneline feat/fix-web-vitest-crash \| grep 36386e1` retorna 1 hit (AC15) |
| 12 | Sin "Co-Authored-By" en ningún commit | `git log feat/fix-web-vitest-crash --pretty=format:"%B" \| grep -i "co-authored-by"` está vacío (AC16) |
| 13 | Asuntos de commits son Conventional + ≤72 chars | `git log -1 feat/fix-web-vitest-crash --pretty=format:"%s"` matchea `^(fix\|feat\|chore\|docs\|test\|refactor\|build\|ci\|perf\|style)\(.+\): .+` y es ≤72 chars (AC17) |
| 14 | Rama base del PR es `develop` | el ref `base` del PR es `develop`, NO `main` (AC18) |
| 15 | Forma de la factory del mock | grep confirma que `useRouter` retorna `{ push, replace, back, forward, refresh, prefetch }` (AC2) + stubs de `usePathname`/`useSearchParams`/`useParams` presentes (AC3) |
| 16 | Párrafo JSDoc presente | `setup.ts` contiene la prosa JSDoc explicando happy-dom + cascada de OOM (AC4) |
| 17 | Factory del mock presente | `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` retorna ≥1 hit (AC1) |
| 18 | PR único, sin force-push | `git log develop..feat/fix-web-vitest-crash --merges` retorna ≤1 commit; sin reescritura de historial (AC20) |

---

## 10. Trazabilidad

| Requerimiento de spec | Sección de diseño |
|------------------------|-------------------|
| R1 (setup.ts eleva la factory `vi.mock("next/navigation", …)`) | §2 Archivo 1 (la factory) |
| R2 (factory retorna la forma mínima de 4 hooks) | §2 Archivo 1 (el valor de retorno exacto de la factory) |
| R3 (vitest.config.ts continúa referenciando setup.ts) | §2 Archivo 2 (verificar sólo; `setupFiles` en L39 sin cambios) |
| R4 (`pnpm --filter web test` sale con 0 con 145/145) | §3 paso 5 + §5 G1.1 + §9 fila 1 |
| R5 (state-coverage.test.tsx todos 25 pasan) | §3 paso 4 + §5 G2.1 + §9 fila 4 |
| R6 (`pnpm turbo run bdd` continúa saliendo con 0) | §3 paso 6 + §5 G4.1 + §9 fila 6 |
| R7 (ningún fuente de componente tocado) | §2 (sólo setup.ts editado) + §5 G5.1 + §9 filas 7-8 |
| R8 (solución alternativa `pool: 'forks'` del slice-7 preservada) | §2 Archivo 2 (verificar sólo; L54-63 sin cambios) + §3 paso 7 + §5 G6.1 + §9 filas 10-11 |
| R9 (comentario JSDoc explica por qué) | §2 Archivo 1 (los párrafos JSDoc añadidos) |
| R10 (descripción del PR referencia racha de bypass BDD de 4 PRs) | §4 cuerpo del commit 2 / descripción del PR (operacional, sin chequeo binario de AC) |

| Objetivo | Escenario de spec | Sección de diseño |
|----------|-------------------|-------------------|
| G1 (suite de apps/web 0) | G1.1 | §3 paso 5, §5 G1.1 |
| G2 (state-coverage 25/25) | G2.1 | §3 paso 4, §5 G2.1 |
| G3 (mock durable) | G3.1 | §1 G3, §5 G3.1 |
| G4 (BDD no regresado) | G4.1 | §3 paso 6, §5 G4.1 |
| G5 (ningún fuente tocado) | G5.1 | §1 G5, §2 (sólo setup.ts editado), §5 G5.1 |
| G6 (slice-7 preservado) | G6.1 | §1 G6, §2 Archivo 2 (verificar), §5 G6.1 |

---

## 11. Matriz de amenazas

> Según `sdd-design/SKILL.md` §2a: dirigido por aplicabilidad. Si el diseño cambia routing, comandos de shell, subprocesos, automatización de VCS/PR, clasificación de archivos ejecutables, o integración de procesos, cargar `references/threat-matrix.md` e incluir su matriz.

**N/A** — este diseño NO cambia routing, comandos de shell, subprocesos, automatización de VCS/PR, clasificación de archivos ejecutables, o integración de procesos. El fix es un cambio de infra de tests (una factory `vi.mock` en un archivo de setup de vitest). No introduce nuevas invocaciones de shell, subprocesos, file watchers, o forks de runtime. La solución alternativa `pool: "forks"` del slice-7 es la frontera de integración de procesos existente, y se preserva sin cambios — este diseño NO la modifica.

Clasificación de frontera: **configuración pura de tests**, sin cambio de comportamiento de producción, sin cambio de clasificación de archivos ejecutables, sin automatización de VCS más allá de un PR single Conventional-commit (cubierto por AGENTS.md §6, no por la matriz de amenazas).

---

## 12. Migración / Rollout

**No se requiere migración.** Este es un fix de infra de tests con cero cambio de comportamiento de producción. El rollout es el flujo estándar de PR único:

1. Cortar `feat/fix-web-vitest-crash` de `develop@d9fdfec`.
2. Aterrizar los 2 commits atómicos según §4.
3. Abrir un PR único contra `develop`.
4. Tras revisión + CI verde, merge (squash o merge commit; `git log develop..feat/fix-web-vitest-crash --merges` ≤1 según AC20).
5. Sin feature flag, sin rollout por fases, sin migración de base de datos, sin shim de retrocompatibilidad.

**Plan de rollback** (espejado desde propuesta §8):

- **Whole-change**: `git revert <merge-sha>` en `develop`. La edición de `setup.ts` revierte a su línea base de 22 líneas; `vitest.config.ts` queda sin cambios (no se necesita revert). Los 25 escenarios en `state-coverage.test.tsx` vuelven a su estado previamente fallando (aceptable porque los mismos tests ya estaban rotos en `develop@d9fdfec` — el reporte verify del slice-8 Gate 3 / observación F1 de la deuda de herencia del slice-7).
- **Rollback por paso**:
  - Commit 1 (el hoist del `vi.mock`) — `git revert <sha>`. Los tests vuelven a fallar como antes. La config de vitest está intacta, así que no se necesita revertir la config.
  - Commit 2 (marcador de verificación) — revert opcional; no acarrea ningún cambio de código ejecutable.
- **NO se hará**: force-push, reescritura de historial, tocar `main`, modificar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/`, o enmendar el commit `36386e1` (solución alternativa del slice-7) o `2e05fc5` (pista falsa del PR-2 del slice-8).

---

## 13. Referencias cruzadas

- **Propuesta**: `openspec/changes/fix-web-vitest-crash/proposal.md` (Engram `#2362`)
- **Spec**: `openspec/changes/fix-web-vitest-crash/spec.md` (Engram `#2363`; G1-G6, R1-R10, 20 ACs)
- **Brief de exploración**: `openspec/changes/fix-web-vitest-crash/explore.md` (Engram `#2361`)
- **Error pistola humeante**: `invariant expected app router to be mounted` en `next@16.2.10/navigation.ts:179`
- **Patrón pre-existente (fuente para el hoist global)**: `vi.mock("next/navigation", …)` por archivo en `apps/web/__tests__/components/auth/state-coverage.test.tsx:47-49`
- **Cableado de config de Vitest**: `apps/web/vitest.config.ts:39` (`setupFiles: ["./__tests__/setup.ts"]`)
- **Solución alternativa del slice-7 (predecesora, preservada)**: commit `36386e1`, `apps/web/vitest.config.ts:54-63` (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`)
- **Pista falsa del PR-2 del slice-8 (NO implicada)**: commit `2e05fc5` (split auth-client.ts / auth-server.ts) — `import type` borrado en tiempo de compilación, transparente a los workers de vitest (brief de exploración §6)
- **Evidencia del OOM**: brief de exploración §2 (255s de wall time, ~4 GB heap de V8, `FATAL ERROR: Ineffective mark-compacts near heap limit`)
- **Componentes afectados**: `apps/web/components/transactions/CreateTransactionForm.tsx:54`, `EditTransactionForm.tsx:50`, `TransactionsList.tsx:290` (dentro de `RowEditMenu`)
- **Superficie de regresión**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 líneas, 25 escenarios)
- **Reporte verify del slice-8**: Engram `#2278` (confirmó gate BDD GREEN; OOM es Gate 3 / sólo tests unitarios)
- **Precedente de formato**: `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (estructura de 14 secciones: mapeo G↔T, diffs archivo por archivo, plan de ejecución, commits atómicos, plan de tests, riesgos, fuera-de-alcance, preguntas abiertas, criterios de validación, trazabilidad, matriz de amenazas, migración, referencias cruzadas, apéndice)
- **Convenciones del proyecto**: AGENTS.md §1 (stack), §2 (modelo de ramas), §4 (TDD estricto — RED es el exit-1 existente, sin archivo de tests nuevo), §5 (commits atómicos), §6 (Conventional Commits, sin atribución de IA), §7 (fronteras arquitectónicas — sin nueva regla de frontera), §8 (única fuente de verdad — mock en exactamente un lugar tras este PR), §9 (UI completa no scaffold — N/A, sólo tests), §10 (testing — vitest colocalizado, `clearMocks: true`), §11 (lista de fuera de alcance), §13 (espejo en español — N/A para design de carpeta de cambio según instrucción del orquestador + precedente de `fix-api-nestjs-di`)

---

**Próxima fase**: `tasks` (`sdd-tasks` descompondrá los 2 commits atómicos en sub-tareas ordenadas RED-first con gates de checkpoint según AGENTS.md §4 + §5).

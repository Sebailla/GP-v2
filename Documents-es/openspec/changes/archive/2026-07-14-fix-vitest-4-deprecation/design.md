# Diseño técnico — `fix-vitest-4-deprecation`

> **Estado**: borrador · fase de diseño
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` → tracker `feat/fix-vitest-4-deprecation` (off develop)
> **Almacén de artefactos**: hybrid · **Modo**: auto · **Entrega**: `auto-chain` NO se dispara (1 archivo, ~+2 LOC netas) · **Presupuesto de revisión**: 400 líneas
> **Strict TDD**: activo (AGENTS.md §4 — aplica la excepción: los archivos puramente de configuración no requieren tests pero DEBEN mantener el pipeline verde)
> **PR único**: 1 archivo editado, 2 commits atómicos
> **Forma del fix**: A (corregido por el sub-agente de propuesta; `pool: "forks"` + `maxWorkers: 1` + `isolate: false`)
> **Autor**: orquestador SDD → ejecutor `sdd-design` (modelo `MiniMax-M3`)
> **Fecha**: 2026-07-14
> **Inputs leídos**: `proposal.md` (Engram `#2396`, 96 LOC), `spec.md` (Engram `#2397`, 150 LOC, 7 objetivos, 13 requerimientos, 7 escenarios), `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/design.md` (precedente de formato, 13 secciones), `openspec/changes/archive/2026-07-14-fix-state-coverage-drift/design.md` (precedente de formato), `apps/web/vitest.config.ts` (120 líneas; `pool: "forks"` actual en L54, `poolOptions: { forks: { singleFork: true } }` en L59-63, `@ts-expect-error` en L55-58)
> **Resolución de preguntas abiertas del spec**: Q1 (JSDoc de 1 línea sobre la nueva config de nivel superior), Q2 (sin migración por simetría de los otros 9 configs), Q3 (sin test unitario de config), Q4 (sin ADR) — TODAS resueltas en el spec; este diseño no las vuelve a litigar.

---

## 1. Objetivos ↔ Mapeo de enfoque técnico

| Objetivo | Anclaje en spec | Enfoque técnico |
|----------|-----------------|-----------------|
| **G1** — `apps/web/vitest.config.ts` define `pool: "forks"`, `maxWorkers: 1`, `isolate: false` en el nivel superior; `poolOptions` ausente | §3 G1, R1, R2, R3, R4 | Eliminar el bloque anidado `poolOptions: { forks: { singleFork: true } }` en L59-63 (el `pool: "forks"` de nivel superior ya existente en L54 se conserva). Agregar `maxWorkers: 1` + `isolate: false` al objeto `test`. La combinación de la forma de nivel superior reemplaza al eliminado `singleFork: true`. |
| **G2** — Directiva `@ts-expect-error` encima del bloque deprecado eliminada | §3 G2, R5 | Eliminar el comentario de 3 líneas de `@ts-expect-error` en L55-58. Las claves restantes de nivel superior `pool`/`maxWorkers`/`isolate` están todas en el tipo `InlineConfig` upstream, así que no se necesita supresión de tipo. |
| **G3** — `pnpm --filter web test` NO produce ningún warning `DEPRECATED test.poolOptions` | §3 G3, R8 | Implícito. Vitest 4 deja de emitir el warning una vez que la clave deprecada `poolOptions` desaparece del árbol de configuración en runtime. La guía de migración upstream (§"Pool rework") es explícita: la eliminación de `poolOptions` es el disparador que silencia el warning. |
| **G4** — 145/145 tests de apps/web PASAN | §3 G4, R9 | Ejecutar `pnpm --filter web test` post-cambio; verificar exit 0 + `Tests 145 passed (145)`. La guía de migración upstream reemplaza `singleFork: true` con `maxWorkers: 1, isolate: false`; funcionalmente equivalente para el workaround de estabilidad del pool de workers de happy-dom del slice-7 PR-7. |
| **G5** — 25/25 escenarios de state-coverage PASAN (repro del slice-7 PR-7) | §3 G5, R9 + R13 | Ejecutar `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` post-cambio; verificar 25/25 PASAN. La semántica single-fork (1 worker, sin aislamiento) se preserva. |
| **G6** — 22/22 apps/api + 43/43 BDD PASAN | §3 G6, R9 | Ejecutar `pnpm --filter api test` + `pnpm turbo run bdd`; verificar 22/22 + 43/43. Sin cambios en otros workspaces. |
| **G7** — `pnpm turbo run lint typecheck` sale con 0 | §3 G7, R10 | Ejecutar `pnpm turbo run lint typecheck`; verificar exit 0. Las claves de nivel superior `pool`/`maxWorkers`/`isolate` están tipadas; el `@ts-expect-error` eliminado no puede dejar huérfana una supresión. |

---

## 2. Diffs archivo por archivo

### Archivo 1 — `apps/web/vitest.config.ts` (EDIT, neto +2 LOC)

Este es el **único** archivo modificado por este cambio. El diff consta de tres partes lógicas:

**(A)** Eliminar el bloque de comentarios `@ts-expect-error` de 3 líneas en L55-58 (ya no queda ningún error de tipo upstream que suprimir).

**(B)** Eliminar el bloque anidado `poolOptions: { forks: { singleFork: true } }` en L59-63.

**(C)** Agregar `maxWorkers: 1` + `isolate: false` en el nivel superior al objeto `test` inmediatamente debajo del `pool: "forks"` de nivel superior existente en L54. Refrescar el párrafo JSDoc en L40-53 para citar la URL de la guía de migración de Vitest 4 y explicar la nueva forma de nivel superior.

#### Estado actual (extracto, líneas 32-73 de `apps/web/vitest.config.ts`)

```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    environment: "happy-dom",
    globals: false,
    clearMocks: true,
    setupFiles: ["./__tests__/setup.ts"],
    // Slice 7 PR-7: el pool de workers de happy-dom 20.10 + vitest 4.1
    // tiene una inestabilidad conocida con actualizaciones de estado
    // driven por useEffect de React 18 en árboles de componentes (por
    // ejemplo, el patrón mount-then-load-then-setState de EditTransactionForm).
    // El worker sale prematuramente después de ~3-4 minutos con la
    // configuración por defecto `pool: "threads"` cuando 5 forms × 5
    // estados compiten entre sí en el mismo worker.
    //
    // Fix: serializar la suite de tests cambiando al pool `forks`
    // con `singleFork: true`. Los tests corren en serie en un único
    // fork, lo cual es más lento (~30% más lento) pero estable.
    // La regresión de throughput es aceptable para el harness de
    // state-coverage de 25 tests; el resto de la suite unitaria de
    // apps/web es lo suficientemente pequeño como para que la regresión
    // sea ruido.
    pool: "forks",
    // @ts-expect-error — poolOptions está en la config de runtime de vitest
    // pero no en el tipo estricto `InlineConfig` en vitest 4.1.
    // El fix en el tipo upstream está en cola; usar un comentario aquí
    // es más barato que el `@ts-expect-error` en toda la línea.
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Timeouts de test acotados. El default es 5s; el test `prefills`
    // de EditTransactionForm del slice 6 PR-D necesita una ventana más
    // larga para el poll de `findByDisplayValue` (el fallo de salida
    // del worker de happy-dom era una señal del pool de workers, pero
    // el timeout por test también era demasiado ajustado para el harness
    // de state-coverage multi-form). 15s le da a cada test el espacio
    // que necesita sin dejar que un test malo enmascare toda la suite.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: { /* …aliases sin cambios… */ },
});
```

#### Estado final (extracto — la única región cambiada)

```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    environment: "happy-dom",
    globals: false,
    clearMocks: true,
    setupFiles: ["./__tests__/setup.ts"],
    // Slice 7 PR-7 (commit 36386e1): el pool de workers de happy-dom 20.10
    // + vitest 4.1 tiene una inestabilidad conocida con actualizaciones
    // de estado driven por useEffect de React 18 en árboles de componentes
    // (por ejemplo, el patrón mount-then-load-then-setState de
    // EditTransactionForm). El worker sale prematuramente después de
    // ~3-4 minutos con la configuración por defecto `pool: "threads"`
    // cuando 5 forms × 5 estados compiten entre sí en el mismo worker.
    //
    // Fix: serializar la suite de tests cambiando al pool `forks`
    // con un único worker y sin aislamiento entre archivos de test. Los
    // tests corren en serie en un fork, lo cual es más lento (~30% más
    // lento) pero estable. La regresión de throughput es aceptable para
    // el harness de state-coverage de 25 tests; el resto de la suite
    // unitaria de apps/web es lo suficientemente pequeño como para que
    // la regresión sea ruido.
    //
    // NO elimine `maxWorkers: 1` ni establezca `isolate: true` sin
    // releer el slice 7 — el OOM del pool de workers regresa.
    //
    // Migración a Vitest 4: `poolOptions.forks.singleFork` se elimina
    // en vitest 4 (https://vitest.dev/guide/migration#pool-rework);
    // el reemplazo avalado por upstream es el triple de nivel superior
    // `pool` + `maxWorkers` + `isolate` debajo.
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
    // Timeouts de test acotados. El default es 5s; el test `prefills`
    // de EditTransactionForm del slice 6 PR-D necesita una ventana más
    // larga para el poll de `findByDisplayValue` (el fallo de salida
    // del worker de happy-dom era una señal del pool de workers, pero
    // el timeout por test también era demasiado ajustado para el harness
    // de state-coverage multi-form). 15s le da a cada test el espacio
    // que necesita sin dejar que un test malo enmascare toda la suite.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: { /* …aliases sin cambios… */ },
});
```

#### Hunk de diff

```diff
      setupFiles: ["./__tests__/setup.ts"],
-    // Slice 7 PR-7: el pool de workers de happy-dom 20.10 + vitest 4.1
-    // tiene una inestabilidad conocida con actualizaciones de estado
-    // driven por useEffect de React 18 en árboles de componentes (por
-    // ejemplo, el patrón mount-then-load-then-setState de EditTransactionForm).
-    // El worker sale prematuramente después de ~3-4 minutos con la
-    // configuración por defecto `pool: "threads"` cuando 5 forms × 5
-    // estados compiten entre sí en el mismo worker.
-    //
-    // Fix: serializar la suite de tests cambiando al pool `forks`
-    // con `singleFork: true`. Los tests corren en serie en un único
-    // fork, lo cual es más lento (~30% más lento) pero estable.
-    // La regresión de throughput es aceptable para el harness de
-    // state-coverage de 25 tests; el resto de la suite unitaria de
-    // apps/web es lo suficientemente pequeño como para que la regresión
-    // sea ruido.
+    // Slice 7 PR-7 (commit 36386e1): el pool de workers de happy-dom 20.10
+    // + vitest 4.1 tiene una inestabilidad conocida con actualizaciones
+    // de estado driven por useEffect de React 18 en árboles de componentes
+    // (por ejemplo, el patrón mount-then-load-then-setState de
+    // EditTransactionForm). El worker sale prematuramente después de
+    // ~3-4 minutos con la configuración por defecto `pool: "threads"`
+    // cuando 5 forms × 5 estados compiten entre sí en el mismo worker.
+    //
+    // Fix: serializar la suite de tests cambiando al pool `forks`
+    // con un único worker y sin aislamiento entre archivos de test. Los
+    // tests corren en serie en un fork, lo cual es más lento (~30% más
+    // lento) pero estable. La regresión de throughput es aceptable para
+    // el harness de state-coverage de 25 tests; el resto de la suite
+    // unitaria de apps/web es lo suficientemente pequeño como para que
+    // la regresión sea ruido.
+    //
+    // NO elimine `maxWorkers: 1` ni establezca `isolate: true` sin
+    // releer el slice 7 — el OOM del pool de workers regresa.
+    //
+    // Migración a Vitest 4: `poolOptions.forks.singleFork` se elimina
+    // en vitest 4 (https://vitest.dev/guide/migration#pool-rework);
+    // el reemplazo avalado por upstream es el triple de nivel superior
+    // `pool` + `maxWorkers` + `isolate` debajo.
      pool: "forks",
-    // @ts-expect-error — poolOptions está en la config de runtime de vitest
-    // pero no en el tipo estricto `InlineConfig` en vitest 4.1.
-    // El fix en el tipo upstream está en cola; usar un comentario aquí
-    // es más barato que el `@ts-expect-error` en toda la línea.
-    poolOptions: {
-      forks: {
-        singleFork: true,
-      },
-    },
+    maxWorkers: 1,
+    isolate: false,
      // Timeouts de test acotados. El default es 5s; el test `prefills`
```

#### Resumen del diff

- Eliminar el bloque `@ts-expect-error` de 3 líneas en L55-58 (no queda error de tipo upstream).
- Eliminar el bloque `poolOptions: { forks: { singleFork: true } }` de 5 líneas en L59-63.
- Agregar `maxWorkers: 1` + `isolate: false` en el nivel superior en la posición que dejó el bloque `poolOptions` eliminado (inmediatamente después del `pool: "forks"` existente).
- Refrescar el párrafo JSDoc en L40-53 (ahora L40-58) con 4 líneas nuevas: una advertencia de NO eliminar, la URL de la guía de migración de vitest 4, y la nota de migración explícita.
- LOC del archivo: 120 → ~122 (+2 neto; −12 / +14 raw).
- El resto del archivo (plugins, `include`, `environment`, `globals`, `clearMocks`, `setupFiles`, `testTimeout`, `hookTimeout`, las 9 entradas de `resolve.alias`) queda sin cambios.

#### Verificación (gates que ejecutará el sub-agente apply)

| Gate | Comando | Esperado |
|------|---------|----------|
| AC1: clave `pool` de nivel superior presente | `grep -nE '^\s+pool:\s+"forks"' apps/web/vitest.config.ts` | 1 hit |
| AC2: `maxWorkers: 1` de nivel superior presente | `grep -nE '^\s+maxWorkers:\s+1\b' apps/web/vitest.config.ts` | 1 hit |
| AC3: `isolate: false` de nivel superior presente | `grep -nE '^\s+isolate:\s+false\b' apps/web/vitest.config.ts` | 1 hit |
| AC4: ninguna clave `poolOptions` | `grep -nE 'poolOptions' apps/web/vitest.config.ts` | 0 hits |
| AC5: ningún `@ts-expect-error` | `grep -nE '@ts-expect-error' apps/web/vitest.config.ts` | 0 hits |
| AC6: JSDoc cita slice-7 + guía de migración | `grep -nE 'slice 7 PR-7\|vitest\.dev/guide/migration' apps/web/vitest.config.ts` | ≥2 hits |
| AC7: suite completa sale con 0 | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)` |
| AC8: warning de deprecación ausente | `pnpm --filter web test 2>&1 \| grep -F 'DEPRECATED test.poolOptions'` | vacío |
| AC9: repro slice-7 25/25 | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25 PASAN / 0 FALLAN |

---

## 3. Plan de ejecución (strict TDD)

Según AGENTS.md §4, strict TDD requiere el orden RED → GREEN → TRIANGULATE → REFACTOR. La excepción de strict TDD aplica (encabezado del spec §0): los archivos puramente de configuración no requieren tests pero DEBEN mantener el pipeline verde. El RED es el `pnpm --filter web test` stderr actual con `DEPRECATED test.poolOptions was removed in Vitest 4...`; el GREEN es el stderr limpio post-cambio + 145/145 PASAN.

1. **RED ya observado** (registrado en el brief de exploración Engram `#2394` + propuesta §1). `pnpm --filter web test` emite actualmente `DEPRECATED test.poolOptions was removed in Vitest 4. All previous poolOptions are now top-level options.` en stderr. 145/145 tests pasan con la deprecación; el warning es la única señal a abordar. No se requiere un archivo de test nuevo (excepción AGENTS.md §4 para config pura).

2. **Editar Archivo 1** (`apps/web/vitest.config.ts`): eliminar el bloque `@ts-expect-error` + el bloque `poolOptions`; agregar `maxWorkers: 1` + `isolate: false` de nivel superior; refrescar el párrafo JSDoc según §2 Archivo 1. Ningún otro archivo se toca.

3. **GREEN: verificar que el warning de deprecación desapareció**: `pnpm --filter web test 2>&1 | grep -F 'DEPRECATED test.poolOptions'` DEBE salir con 1 (salida vacía = sin coincidencia). El runtime de vitest 4 deja de emitir el warning una vez que la clave `poolOptions` se elimina del árbol de config (la guía de migración upstream §"Pool rework" es explícita sobre esto).

4. **GREEN: verificar 145/145**: `pnpm --filter web test` DEBE salir con 0 con `Tests 145 passed (145)`. La semántica single-fork del slice-7 PR-7 se preserva (1 worker, sin aislamiento entre archivos de test en el mismo fork — funcionalmente equivalente al `singleFork: true` eliminado según la guía de migración).

5. **GREEN: verificar repro slice-7 25/25**: `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` DEBE salir con 0 con 25 PASAN / 0 FALLAN. Esta es la superficie de regresión para el fix de estabilidad del pool de workers del slice-7 PR-7; si `maxWorkers: 1` + `isolate: false` difiere semánticamente de `singleFork: true`, es aquí donde reaparece la cascada de OOM.

6. **Verificar que BDD + API no regresaron**: `pnpm --filter api test` DEBE salir con 0 con 22/22 PASAN; `pnpm turbo run bdd` DEBE salir con 0 con 43/43 escenarios. Confirma que no se toca la config de test de otros workspaces.

7. **Verificar lint + typecheck**: `pnpm turbo run lint typecheck` DEBE salir con 0. Las nuevas claves de nivel superior están tipadas en `InlineConfig` de vitest 4; el `@ts-expect-error` eliminado no puede dejar huérfana una supresión.

8. **Verificar disciplina de alcance**: `git diff --name-only origin/develop..HEAD | grep -E 'vitest\.config.*$'` DEBE devolver exactamente 1 línea (`apps/web/vitest.config.ts`). Ningún otro archivo `vitest.config.*` se modifica (R7).

9. **Verificar versión sin cambios**: `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json | grep -E '"vitest"\s*:'` DEBE estar vacío. Vitest se mantiene pineado en 4.1.9 (R11).

10. **Commit atómicamente**: 2 commits según §4 abajo.

---

## 4. Commits atómicos

PR único, 2 commits atómicos (alineados por work-unit; según AGENTS.md §5 cada commit se revierte limpiamente con `git revert <sha>`):

1. **`fix(test): apps/web/vitest.config.ts — migrate poolOptions to top-level (vitest 4)`** — el cambio de código de producción: eliminar el bloque `poolOptions: { forks: { singleFork: true } }` + la directiva `@ts-expect-error`; agregar `maxWorkers: 1` + `isolate: false` de nivel superior; refrescar el párrafo JSDoc para citar la URL de la guía de migración de Vitest 4 (según R12) y advertir a futuros mantenedores que no eliminen `maxWorkers: 1` sin releer el slice 7 (según R6).

2. **`chore(test): verify pnpm --filter web test exits 0 + 145/145 + 22/22 + 43/43 + 25/25 (R6 marker)`** — log de verificación: el grep del warning de deprecación + la salida exit-0 de `pnpm --filter web test` + el repro del slice 7 + la salida del gate BDD capturada en el cuerpo del commit. Separa la observación GREEN del cambio que causa GREEN para que un revisor pueda verificar cada uno independientemente. Opcional pero le da al cierre del slice 8 un rastro en papel. Puede plegarse en el commit 1 si el revisor prefiere menos commits.

**Higiene de commits** (AGENTS.md §6):

- Sin `Co-Authored-By` / sin atribución de IA en ningún mensaje de commit.
- Asunto ≤72 caracteres, imperativo, sin punto final.
- Vocabulario de tipos de §6: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`. (`fix(test):` es correcto porque el cambio ES un fix a la capa de config de test; `chore(test):` para el marker es correcto porque el marker no acarrea ningún cambio de código ejecutable.)
- Los cuerpos explican el POR QUÉ (la eliminación de `poolOptions` de vitest 4, la preservación de la semántica single-fork del slice-7 PR-7, la URL de la guía de migración upstream), no el QUÉ (el diff ya muestra qué).
- El cuerpo del commit 1 cita los IDs de los requerimientos del spec (R1, R2, R3, R4, R5, R6, R12, R13) y la URL de la guía de migración de vitest 4.
- El cuerpo del commit 2 cita los comandos de verificación ejecutados (marcadores R8, R9) y los conteos de salida capturados.

---

## 5. Plan de ejecución de tests

| Escenario del spec | Comando de test | Resultado esperado |
|--------------------|-----------------|---------------------|
| **G1.1** (forma de config correcta) | `grep -nE 'pool:\s+"forks"\|maxWorkers:\s+1\|isolate:\s+false' apps/web/vitest.config.ts` Y `grep -c 'poolOptions' apps/web/vitest.config.ts` | 3 hits Y 0 (AC1, AC2, AC3, AC4) |
| **G2.1** (sin `@ts-expect-error`) | `grep -c '@ts-expect-error' apps/web/vitest.config.ts` | 0 (AC5) |
| **G3.1** (sin warning de deprecación) | `pnpm --filter web test 2>&1 \| grep -F 'DEPRECATED test.poolOptions'` | salida vacía (AC8) |
| **G4.1** (145/145 apps/web PASAN) | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)` (AC7) |
| **G5.1** (25/25 repro slice-7 PASAN) | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25 PASAN / 0 FALLAN (AC9) |
| **G6.1** (22/22 API + 43/43 BDD) | `pnpm --filter api test` Y `pnpm turbo run bdd` | exit 0; 22 PASAN Y 43/43 escenarios |
| **G7.1** (lint + typecheck) | `pnpm turbo run lint typecheck` | exit 0 |
| **G6.2** (solo se modifica apps/web) | `git diff --name-only origin/develop..HEAD \| grep -E 'vitest\.config.*$'` | exactamente 1 línea: `apps/web/vitest.config.ts` (R7, AC10) |
| **G7.2** (sin cambio de versión de vitest) | `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json \| grep -E '"vitest"\s*:'` | vacío (R11, AC11) |

### Pasos de verificación manuales / no-CI

- `pnpm --filter web test --reporter=verbose` para enumerar cada uno de los 145 escenarios y confirmar que no se introdujo inadvertidamente decoración `.skip` / `.todo`.
- `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR"` para confirmar que la firma del OOM permanece ausente del stderr (workaround del slice 7 preservado).
- `time pnpm --filter web test` para capturar el wall time (`real` debe permanecer similar a la línea base pre-fix — la nueva forma de nivel superior es funcionalmente equivalente a `singleFork: true`).
- `git log --oneline origin/develop..HEAD` para confirmar los 2 commits de work-unit (asuntos ≤72 caracteres, sin "Co-Authored-By", según AC12 + AC13).
- `pnpm lint:fixtures` para confirmar que el plugin de boundary sigue pasando (no se necesita nueva regla de boundary; el cambio es solo una edición de config de test que no afecta las fronteras arquitectónicas).
- `git log --oneline | grep 36386e1` para confirmar que el commit del slice-7 PR-7 se preserva (NO se amende ni se rebasa).

---

## 6. Riesgos + mitigaciones (concretos)

| ID | Riesgo | Mitigación |
|----|--------|------------|
| **R1** (propuesta §7) | Una versión futura de vitest 4.1.x emite un marcador de deprecación diferente (por ejemplo, el wording cambia entre versiones patch). | Vitest está pineado en 4.1.9 vía `pnpm-workspace.yaml`; la instalación es determinística. El gate de verificación G3.1 grepea la subcadena literal `DEPRECATED test.poolOptions` que es el marcador exacto producido por vitest 4.1.x. Si un patch futuro cambia el wording, el gate falla ruidosamente y el marker se actualiza — pero el marker solo cambiará si el proyecto upgrade vitest, lo cual está fuera de alcance según R11. |
| **R2** (propuesta §7) | `maxWorkers: 1` + `isolate: false` difiere semánticamente de `singleFork: true` y re-introduce la cascada de OOM del slice 7. | La guía de migración de Vitest 4 (§"Pool rework", `https://vitest.dev/guide/migration#pool-rework`) es explícita: `singleFork: true` se reemplaza por `maxWorkers: 1, isolate: false`. El harness de state-coverage de 25 tests en `apps/web/__tests__/components/transactions/state-coverage.test.tsx` es la superficie de regresión; si el OOM regresa, aparece allí primero. El gate de verificación G5.1 lo captura. |
| **R3** (propuesta §7) | Eliminar la directiva `@ts-expect-error` expone un error de tipo en otro lugar del archivo (por ejemplo, el `pool: "forks"` restante estaba silenciosamente tipado por la supresión). | Las claves restantes `pool`, `maxWorkers` e `isolate` son todas miembros del tipo `InlineConfig` upstream en vitest 4.1.9. El `@ts-expect-error` solo suprimía la clave `poolOptions` (que se elimina en el tipo `InlineConfig` de vitest 4, de ahí la supresión). El gate de verificación G7.1 (`pnpm turbo run typecheck`) captura cualquier desajuste de tipo residual. |
| **R4** (propuesta §7) | Otros archivos `vitest.config.*` (`apps/api`, `libs/shared-utils/*`, `libs/core/*`, `libs/features/*`) usan `poolOptions` y fueron pasados por alto. | El grep en todo el repo confirma que solo `apps/web/vitest.config.ts` coincide con `poolOptions`. Los otros 9 configs no usan el patrón deprecado. El gate de verificación G6.2 (`git diff --name-only … | grep vitest.config.*$` devuelve exactamente 1 línea) captura cualquier expansión de alcance accidental. |

---

## 7. Fuera de alcance

Reiterado desde propuesta §2 + spec §10 + AGENTS.md §11. Lo siguiente NO se toca explícitamente por este PR:

1. La versión de vitest (`4.1.9`) — sin bump. El warning de deprecación es un problema de config de runtime, no un problema de mismatch de versión.
2. Los otros 9 archivos `vitest.config.*` (`apps/api/vitest.config.ts`, `libs/shared-utils/*/vitest.config.*`, `libs/core/*/vitest.config.*`, `libs/features/*/vitest.config.*`) — verificado por grep en todo el repo que no usan `poolOptions`.
3. Cualquier edición en archivos de test/componentes/BDD/ESLint/CI/Turbo/workspace.
4. La semántica del workaround single-fork del slice-7 PR-7 — el workaround PERMANECE, solo cambia su FORMA. El harness de state-coverage 25/25 debe permanecer verde.
5. El commit `36386e1` del slice-7 PR-7 en sí — NO se amende, rebasa ni elimina. La migración es una edición aditiva encima del slice 7.
6. Tests nuevos — la excepción AGENTS.md §4 cubre este cambio puramente de config. La verificación es vía la línea base existente 145/145 + 22/22 + 43/43 + 25/25.
7. Nueva regla ESLint en `tools/eslint-plugin-boundary/` — el cambio es una edición de config de runtime de vitest, no un guardia de frontera de código. El plugin de boundary no opina sobre claves de config de vitest.
8. Nueva ADR bajo `docs/architecture/decisions/` — el cambio de config de 1 archivo con enlace a la guía oficial de migración (según R12, el párrafo JSDoc cita la URL) es la superficie de documentación.
9. Enforcement de gate de cobertura en CI (AGENTS.md §11).
10. Migración de `gastos-personales/` al modelo de vertical slicing (el playbook se entrega aquí; la migración corre en el slice 8.4 según AGENTS.md §11).
11. i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción (gestor de secretos, HSTS, CSP más allá de los defaults de Next, config de CDN), observabilidad (OpenTelemetry, Prometheus, envío de logs), UI de audit log (AGENTS.md §11).
12. Tocar `apps/web/__tests__/setup.ts` (el mock elevado del PR #66 se mantiene como la única fuente de verdad para `next/navigation`).
13. Tocar cualquier archivo fuente de `apps/web/components/`, `apps/web/lib/`, `apps/web/app/`, `apps/api/`, `libs/features/*/`, `libs/core/*/`.
14. Tocar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash,fix-state-coverage-drift}/`.
15. Un espejo en español de cualquier archivo bajo `openspec/changes/fix-vitest-4-deprecation/` (no se entrega ninguna fuente de verdad `.md` en este cambio; según instrucción del orquestador + precedentes de `fix-web-vitest-crash` + `fix-api-nestjs-di` + `fix-state-coverage-drift` — los specs de la carpeta de cambio son artefactos de coordinación, no docs orientadas al usuario).

---

## 8. Preguntas abiertas para la fase de tasks

**Ninguna.** Las 4 preguntas diferidas desde la propuesta están resueltas en el spec:

- Q1 (justificación JSDoc) → resuelta: párrafo refrescado en L40-58 del config final, citando slice-7 PR-7 + la URL de la guía de migración de vitest 4. Spec §11.
- Q2 (migración por simetría de los otros 9 configs) → resuelta: no — solo `apps/web/vitest.config.ts` usa `poolOptions`. Spec §11.
- Q3 (test unitario de config de vitest) → resuelta: no — la excepción AGENTS.md §4 cubre este cambio puramente de config. Spec §11.
- Q4 (ADR) → resuelta: no — cambio de config de 1 archivo enlazando a la guía oficial de migración es la superficie de documentación. Spec §11.

---

## 9. Criterios de validación para `sdd-verify`

`sdd-verify` verificará post-merge:

| # | Criterio | Condición de paso |
|---|----------|-------------------|
| 1 | `apps/web/vitest.config.ts` tiene `pool: "forks"` de nivel superior | `grep -nE '^\s+pool:\s+"forks"' apps/web/vitest.config.ts` devuelve 1 hit |
| 2 | El mismo archivo tiene `maxWorkers: 1` de nivel superior | `grep -nE '^\s+maxWorkers:\s+1\b' apps/web/vitest.config.ts` devuelve 1 hit |
| 3 | El mismo archivo tiene `isolate: false` de nivel superior | `grep -nE '^\s+isolate:\s+false\b' apps/web/vitest.config.ts` devuelve 1 hit |
| 4 | El mismo archivo no tiene clave `poolOptions` | `grep -c 'poolOptions' apps/web/vitest.config.ts` devuelve 0 |
| 5 | El mismo archivo no tiene `@ts-expect-error` | `grep -c '@ts-expect-error' apps/web/vitest.config.ts` devuelve 0 |
| 6 | El JSDoc cita slice-7 + URL de la guía de migración | `grep -nE 'slice 7 PR-7\|vitest\.dev/guide/migration' apps/web/vitest.config.ts` devuelve ≥2 hits |
| 7 | `pnpm --filter web test` sale con 0 con 145/145 | exit 0; `Tests 145 passed (145)` |
| 8 | Warning de deprecación ausente | `pnpm --filter web test 2>&1 \| grep -F 'DEPRECATED test.poolOptions'` sale con 1 |
| 9 | Repro slice-7 25/25 | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` sale con 0; 25 PASAN / 0 FALLAN |
| 10 | Solo se modifica `apps/web/vitest.config.ts` | `git diff --name-only origin/develop..HEAD \| grep -E 'vitest\.config.*$'` devuelve exactamente 1 línea |
| 11 | Sin cambio de versión de vitest | `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json \| grep -E '"vitest"\s*:'` está vacío |
| 12 | `pnpm --filter api test` sale con 0 con 22/22 | exit 0; 22 PASAN |
| 13 | `pnpm turbo run bdd` sale con 0 con 43/43 | exit 0; 43 escenarios PASAN |
| 14 | `pnpm turbo run lint typecheck` sale con 0 | exit 0 |
| 15 | `pnpm lint:fixtures` sale con 0 | exit 0 (plugin de boundary sigue silencioso) |
| 16 | Commit `36386e1` del slice-7 preservado | `git log --oneline \| grep 36386e1` devuelve 1 hit |
| 17 | Sin "Co-Authored-By" en ningún commit | `git log origin/develop..HEAD --pretty=format:"%B" \| grep -i "co-authored-by"` está vacío |
| 18 | Los asuntos de commit son Conventional + ≤72 caracteres | `git log origin/develop..HEAD --pretty=format:"%s"` matchea `^(fix\|feat\|chore\|docs\|test\|refactor\|build\|ci\|perf\|style)\(.+\): .+` y cada uno es ≤72 caracteres |
| 19 | La rama base del PR es `develop` | el `base` ref del PR es `develop`, NO `main` |
| 20 | PR único, sin force-push | `git log origin/develop..HEAD --merges` devuelve ≤1 commit; sin reescritura de historial |

---

## 10. Trazabilidad

### Requerimiento del spec → Sección del diseño

| Requerimiento del spec | Sección del diseño |
|------------------------|---------------------|
| R1 (`pool: "forks"` de nivel superior) | §2 Archivo 1 (L54 existente, preservado) |
| R2 (`maxWorkers: 1` de nivel superior) | §2 Archivo 1 (línea agregada) |
| R3 (`isolate: false` de nivel superior) | §2 Archivo 1 (línea agregada) |
| R4 (sin clave `poolOptions`) | §2 Archivo 1 Parte B (bloque eliminado) |
| R5 (sin `@ts-expect-error`) | §2 Archivo 1 Parte A (bloque de comentarios eliminado) |
| R6 (JSDoc con justificación + advertencia NO eliminar) | §2 Archivo 1 Parte C (JSDoc refrescado) |
| R7 (ningún otro vitest.config.* modificado) | §3 paso 8 + §5 G6.2 + §9 fila 10 |
| R8 (sin warning de deprecación en stderr) | §3 paso 3 + §5 G3.1 + §9 fila 8 |
| R9 (145/145 + 22/22 + 43/43) | §3 pasos 4, 6 + §5 G4.1, G6.1 + §9 filas 7, 12, 13 |
| R10 (`turbo run lint typecheck` sale con 0) | §3 paso 7 + §5 G7.1 + §9 fila 14 |
| R11 (vitest se mantiene en 4.1.9) | §3 paso 9 + §5 G7.2 + §9 fila 11 |
| R12 (descripción del PR cita URL de la guía de migración) | §2 Archivo 1 Parte C (JSDoc cita URL) + §4 cuerpo del commit 1 |
| R13 (semántica single-fork del slice-7 PR-7 preservada) | §3 paso 5 + §5 G5.1 + §9 fila 9 (25/25 state-coverage) |

### Objetivo → Escenario del spec → Sección del diseño

| Objetivo | Escenario del spec | Sección del diseño |
|----------|---------------------|---------------------|
| G1 (forma de config correcta) | G1.1 | §2 Archivo 1 Partes A/B/C + §5 G1.1 |
| G2 (sin `@ts-expect-error`) | G2.1 | §2 Archivo 1 Parte A + §5 G2.1 |
| G3 (sin warning de deprecación) | G3.1 | §3 paso 3 + §5 G3.1 |
| G4 (145/145 apps/web PASAN) | G4.1 | §3 paso 4 + §5 G4.1 |
| G5 (25/25 repro slice-7 PASAN) | G5.1 | §3 paso 5 + §5 G5.1 |
| G6 (22/22 API + 43/43 BDD) | G6.1 | §3 paso 6 + §5 G6.1 |
| G7 (lint + typecheck sale con 0) | G7.1 | §3 paso 7 + §5 G7.1 |

### Riesgo ↔ Mitigación por requerimiento

| Riesgo (propuesta §7) | Mitigado por |
|------------------------|--------------|
| R1 (marcador de deprecación diferente) | R11 (vitest pineado en 4.1.9) + AC8 (grep de subcadena exacta) + G3.1 |
| R2 (`maxWorkers+isolate` difiere de `singleFork`) | R13 + G5.1 (repro 25/25 state-coverage) + guía de migración como fuente autoritativa |
| R3 (eliminación de `@ts-expect-error` expone error de tipo) | R1 + R2 + R3 (todas las claves de nivel superior tipadas en `InlineConfig` de vitest 4) + G7.1 (`turbo run typecheck`) |
| R4 (otros vitest.config.* usan poolOptions) | R7 (evidencia de grep en todo el repo) + G6.2 (chequeo de alcance de archivo único) |

---

## 11. Matriz de amenazas

> Según `sdd-design/SKILL.md` §2a: dirigida por aplicabilidad. Si el diseño cambia enrutamiento, comandos de shell, subprocesos, automatización VCS/PR, clasificación de archivos ejecutables o integración de procesos, cargar `references/threat-matrix.md` e incluir su matriz.

**N/A** — este diseño NO cambia enrutamiento, comandos de shell, subprocesos, automatización VCS/PR, clasificación de archivos ejecutables o integración de procesos. El fix es una migración de forma de config de test de vitest (un archivo `vitest.config.ts`). No introduce nuevas invocaciones de shell, subprocesos, file watchers ni forks en runtime. El workaround `pool: "forks"` del slice 7 ES la frontera de integración de procesos existente (1 proceso worker de vitest, sin aislamiento entre archivos de test), y se preserva sin cambios — solo cambia la REPRESENTACIÓN DE FORMA DE CONFIG del bloque `poolOptions` anidado a las claves de nivel superior.

Clasificación de frontera: **configuración pura de test**, sin cambio de comportamiento en producción, sin cambio de clasificación de archivos ejecutables, sin automatización VCS más allá de un PR convencional (cubierto por AGENTS.md §6, no por la matriz de amenazas).

---

## 12. Migración / Rollout

**No se requiere migración.** Esta es una migración de forma de config de test sin cambio de comportamiento en producción. El runtime de vitest interpreta `maxWorkers: 1, isolate: false` idénticamente al `poolOptions.forks.singleFork: true` eliminado según la guía de migración upstream. El rollout es el flujo estándar de PR único:

1. Cortar `feat/fix-vitest-4-deprecation` desde `develop`.
2. Aterrizar los 2 commits atómicos según §4.
3. Abrir un único PR contra `develop`.
4. Tras revisión + CI verde, mergear (squash o merge commit; `git log origin/develop..HEAD --merges` ≤1 según AC20).
5. Sin feature flag, sin rollout por fases, sin migración de base de datos, sin shim de compatibilidad hacia atrás.

**Plan de rollback** (espejo de propuesta §8):

- **Cambio completo**: `git revert <merge-sha>` sobre `develop`. La edición de `vitest.config.ts` revierte a su línea base de 120 líneas (con `poolOptions: { forks: { singleFork: true } }` + `@ts-expect-error`). El warning de deprecación reaparece en stderr; las líneas base 145/145 + 22/22 + 43/43 + 25/25 se restauran (la línea base sobre `develop` ya era 145/145 + 43/43 según Engram `#2380`, con el warning como única señal a abordar).
- **Rollback por paso**:
  - Commit 1 (la migración de `vitest.config.ts`) — `git revert <sha>`. La config revierte a la forma de `poolOptions` anidado; el warning de deprecación reaparece; los tests siguen pasando.
  - Commit 2 (marker de verificación) — revert opcional; no acarrea ningún cambio de código ejecutable.
- **NO se hará**: force-push, reescritura de historial, tocar `main`, modificar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash,fix-state-coverage-drift}/`, ni amendar el commit `36386e1` (workaround del slice 7).

---

## 13. Referencias cruzadas

- **Propuesta**: `openspec/changes/fix-vitest-4-deprecation/proposal.md` (Engram `#2396`, 96 LOC)
- **Spec**: `openspec/changes/fix-vitest-4-deprecation/spec.md` (Engram `#2397`, 150 LOC; G1-G7, R1-R13, 7 escenarios, 20 ACs)
- **Brief de exploración**: `openspec/changes/fix-coverage-minor-subfailures/explore.md` (Engram `#2394`; refutó hipótesis del orquestador + identificó Forma A)
- **Marcador de deprecación smoking-gun**: `DEPRECATED test.poolOptions was removed in Vitest 4. All previous poolOptions are now top-level options.`
- **Guía de migración de Vitest 4 (fuente autoritativa del mapeo)**: `https://vitest.dev/guide/migration#pool-rework` — establece explícitamente que `singleFork` se reemplaza por `maxWorkers: 1, isolate: false`.
- **Único archivo afectado**: `apps/web/vitest.config.ts` (120 líneas; `pool: "forks"` en L54, bloque `poolOptions` en L59-63, `@ts-expect-error` en L55-58).
- **Superficie de regresión (repro del slice-7 PR-7)**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (25/25 PASAN pre- y post-fix).
- **Commit predecesor del slice-7 PR-7**: `36386e1` — introdujo el workaround `pool: "forks"` + `poolOptions.forks.singleFork: true` para la inestabilidad del pool de workers de happy-dom 20.10 + vitest 4.1. **PRESERVADO sin cambios por este PR.**
- **PRs predecesores** (NO tocados): PR #66 (`fix-web-vitest-crash`) elevó `vi.mock("next/navigation", …)` a `apps/web/__tests__/setup.ts`; slice-8 PR-D (`fix-state-coverage-drift`) reformuló el árbol `messages` a objetos anidados.
- **Cableado de config de vitest**: `apps/web/vitest.config.ts:39` (`setupFiles: ["./__tests__/setup.ts"]`) — cablea el mock global del PR #66.
- **Convenciones del proyecto**: AGENTS.md §1 (identidad, stack — vitest 4.1.9), §2 (modelo de ramas — `main` inmutable, cortar desde `develop`), §4 (strict TDD — excepción para config pura), §5 (commits atómicos), §6 (Conventional Commits, sin atribución de IA), §7 (fronteras arquitectónicas — sin nueva regla de frontera), §8 (fuente única de verdad — claves de config de runtime de vitest canónicas en el sitio `InlineConfig` upstream), §9 (UI completa no scaffold — N/A, solo test), §10 (testing — vitest colocalizado, `clearMocks: true`), §11 (lista de fuera-de-alcance), §13 (espejo en español — N/A para diseño de carpeta de cambio según instrucción del orquestador + precedentes de `fix-web-vitest-crash` + `fix-api-nestjs-di` + `fix-state-coverage-drift`)
- **Precedentes de formato**: `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/design.md` (estructura de 13 secciones), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (igual), `openspec/changes/archive/2026-07-14-fix-state-coverage-drift/design.md` (igual)
- **Reporte de verify del slice-8 (contexto del gate)**: Engram `#2380` (confirmó que `develop@b0f5d24` está 145/145 + 43/43 + 22/22 verde; el warning de deprecación es la única señal restante)

---

**Próxima fase**: `tasks` (`sdd-tasks` descompondrá los 2 commits atómicos en sub-tareas ordenadas RED-first con gates de checkpoint según AGENTS.md §4 + §5).

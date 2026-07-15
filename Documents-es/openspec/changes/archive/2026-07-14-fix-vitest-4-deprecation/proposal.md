# Propuesta — `fix-vitest-4-deprecation`

> **Estado**: borrador · fase de propuesta · **Fecha**: 2026-07-14
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Modo**: auto · **Almacén de artefactos**: hybrid · **Forma del fix**: A

## 1. Intención

`pnpm --filter web test` imprime `DEPRECATED test.poolOptions was removed in Vitest 4...` en stderr. La guía de migración de Vitest 4 indica: `singleThread` y `singleFork` ahora son `maxWorkers: 1, isolate: false`; `poolOptions` se elimina. Fix verificado (Forma A en `explore.md` §5): eliminar `poolOptions` + `@ts-expect-error`, agregar `maxWorkers: 1` + `isolate: false` en el nivel superior. Se preserva la semántica single-fork del PR-7 del slice 7. Radio de impacto: **1 archivo, 1 bloque de configuración.**

### Reducción de alcance (hipótesis del orquestador refutada)

El prompt `fix-coverage-minor-subfailures` del orquestador hipotetizaba 2 sub-fallos restantes en `state-coverage.test.tsx`. La exploración lo refutó: `develop@b0f5d24` está **25/25 + 145/145 + 43/43 — completamente verde**. Los 2 sub-fallos nombrados se cerraron inline durante el PR #67 (reporte de archivo Engram #2380; el #2379 interino es histórico). Única señal accionable restante: el warning de deprecación. **No hay cambios en archivos de test en este cambio.**

## 2. Alcance

### En alcance

- `apps/web/vitest.config.ts` — eliminar `poolOptions` + `@ts-expect-error`; agregar `maxWorkers: 1` + `isolate: false` en el nivel superior; refrescar el JSDoc.

### Fuera de alcance

Sin cambios de versión de vitest (se mantiene en 4.1.9). Sin cambios en otras configuraciones de test (los otros 9 `vitest.config.*` no usan `poolOptions`). Sin cambios en tests/componentes/BDD/ESLint/CI/Turbo/workspace. Sin ediciones al historial del slice 7 (el workaround permanece, solo cambia su forma). Sin tests nuevos (excepción AGENTS.md §4).

## 3. Enfoque

```ts
// apps/web/vitest.config.ts — propuesto
test: {
  // ... include/environment/globals/clearMocks/setupFiles sin cambios ...
  // Slice 7 PR-7 + migración a Vitest-4: serializar la suite vía el pool
  // `forks` con `maxWorkers: 1` + `isolate: false`. El bloque anterior
  // `poolOptions: { forks: { singleFork: true } }` se ELIMINA en Vitest 4
  // (https://vitest.dev/guide/migration#pool-rework); el reemplazo oficial
  // es `maxWorkers: 1, isolate: false`. Conserva el fix de estabilidad del
  // pool de workers de happy-dom + vitest-4.1 del slice 7.
  pool: "forks",
  maxWorkers: 1,
  isolate: false,
  testTimeout: 15000,
  hookTimeout: 15000,
},
```

Por qué: `singleFork` se elimina en Vitest 4 (no solo `poolOptions`); `maxWorkers: 1, isolate: false` es el reemplazo avalado por upstream. Eliminar el workaround arriesga re-introducir el OOM del slice 7.

Rechazado: mantener `singleFork: true` en el nivel superior (sigue deprecado); eliminar el workaround (riesgo de regresión); pinear vitest 3.x (fuera de alcance); migrar los otros 9 configs por simetría (ninguno usa `poolOptions`).

## 4. Inventario de archivos afectados

| Archivo | Cambio | Delta LOC |
|---------|--------|-----------|
| `apps/web/vitest.config.ts` | Editar: eliminar `poolOptions` + `@ts-expect-error`; agregar `maxWorkers: 1` + `isolate: false` en el nivel superior; refrescar JSDoc | −7 / +9 (neto +2) |

**Total: +2 LOC netas.** Un solo PR; no se dispara el auto-chain.

## 5. Objetivos

- **G1**: `apps/web/vitest.config.ts` tiene `pool: "forks"`, `maxWorkers: 1`, `isolate: false` en el nivel superior. `poolOptions` ausente.
- **G2**: Directiva `@ts-expect-error` eliminada.
- **G3**: `pnpm --filter web test` NO produce ningún warning de deprecación sobre `test.poolOptions`.
- **G4**: 145/145 tests de apps/web PASAN.
- **G5**: 25/25 harness de state-coverage PASAN (repro del slice-7 PR-7).
- **G6**: 22/22 apps/api + 43/43 BDD PASAN.
- **G7**: `pnpm turbo run lint typecheck` sale con 0.

## 6. No-objetivos

Sin cambios de versión de vitest; sin cambios en otras configuraciones de test; sin cambios en archivos de test/componentes/BDD/ESLint/CI/Turbo/workspace; sin ediciones al historial del slice 7; sin tests nuevos; sin gate de cobertura (AGENTS.md §11); sin ADR (cambio de config de 1 archivo).

## 7. Riesgos

| ID | Riesgo | Prob | Mitigación |
|----|--------|------|------------|
| R1 | Una versión futura de vitest 4.1.x emita un marcador de deprecación diferente. | Baja | Pinear vitest 4.1.9; verificar con `! grep -q 'poolOptions'` + `grep -qi 'DEPRECATED'` (debe estar vacío). |
| R2 | `maxWorkers: 1 + isolate: false` difiere de `singleFork: true`; re-introduce el OOM del slice 7. | Baja | La guía de migración es el reemplazo avalado por upstream; el harness de state-coverage de 25 tests es la repro de verificación. |
| R3 | La eliminación de `@ts-expect-error` expone un error de tipo en otro lugar. | Baja | Los campos restantes están tipados; `pnpm turbo run typecheck` es la verificación. |
| R4 | Otros archivos `vitest.config.*` usan `poolOptions`. | Ninguna | Grep en todo el repo confirma que solo `apps/web/vitest.config.ts:54-63` coincide. |
| R5 | El wording de deprecación difiere entre la versión pineada y la instalada de vitest. | Baja | vitest pineado vía `pnpm-workspace.yaml`; instalación determinística. |

## 8. Preguntas abiertas para la fase de spec

- **Q1**: ¿Párrafo JSDoc explicando el workaround + migración? **Rec: SÍ** — 5-7 líneas citando slice-7 PR-7, origen happy-dom + vitest-4.1, URL de la guía de migración. Futuros mantenedores NO deberían eliminar `maxWorkers: 1` sin releer el slice 7.
- **Q2**: ¿Migrar `apps/api/vitest.config.ts` + configs por librería por simetría? **Rec: NO** — ninguno usa `poolOptions`.
- **Q3**: ¿Test unitario de configuración de vitest que asserts la forma canónica? **Rec: NO** — excepción AGENTS.md §4; G3+G4+G5 es la verificación.
- **Q4**: ¿Abrir un ADR? **Rec: NO** — cambio de config de 1 archivo con enlace a la guía oficial.

---

## Archivos relevantes

- `apps/web/vitest.config.ts` — único archivo afectado.
- `apps/web/__tests__/components/transactions/state-coverage.test.tsx` — evidencia: 25/25 PASAN, la razón del slice-7 PR-7 se sostiene.
- `openspec/changes/fix-coverage-minor-subfailures/explore.md` — refuta la hipótesis del padre; identifica la Forma A.
- Engram #2380 — verdad actual: 145/145 + 43/43 verde; los 2 sub-fallos nombrados cerrados inline.
- Engram #2379 — nota interina de "2 sub-fallos menores", histórica; superada.

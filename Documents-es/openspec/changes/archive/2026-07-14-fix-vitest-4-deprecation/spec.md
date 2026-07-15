# Spec delta — `fix-vitest-4-deprecation`

> **Proyecto**: `gastos-personales-reference` (`gp-v2`) · **Fecha**: 2026-07-14
> **Modo**: `auto` · **Almacén**: hybrid · **Strict TDD**: ACTIVO (excepción AGENTS.md §4: los archivos puramente de configuración no requieren tests pero DEBEN mantener el pipeline verde)
> **Forma**: A · **Entrega**: PR único; `auto-chain` no se dispara (1 archivo, ~10 LOC)
> **Fuentes**: Engram de propuesta `#2396`; Engram de exploración `#2394`

## 1. Encabezado

Estado: borrador · fase de spec. El cambio migra `apps/web/vitest.config.ts` desde el patrón `poolOptions: { forks: { singleFork: true } }` eliminado en Vitest 4 hacia el reemplazo de nivel superior avalado por upstream `pool: "forks"`, `maxWorkers: 1`, `isolate: false`. Preserva la semántica single-fork del slice-7 PR-7 que esquiva la inestabilidad del pool de workers de happy-dom 20.10 + vitest 4.1 (de lo contrario, el harness de state-coverage de 25 tests regresa).

## 2. Intención

Eliminar el warning `DEPRECATED test.poolOptions was removed in Vitest 4...` emitido en cada ejecución de `pnpm --filter web test`, preservando al mismo tiempo el runtime de test forked-serializado del slice-7 PR-7 del que depende la suite de apps/web.

## 3. Objetivos

- **G1**: `apps/web/vitest.config.ts` define la config de `test` con `pool: "forks"`, `maxWorkers: 1`, `isolate: false` en el nivel superior; la clave `poolOptions` está ausente.
- **G2**: La directiva `@ts-expect-error` acompañante encima del bloque deprecado se elimina.
- **G3**: `pnpm --filter web test` NO produce ningún warning `DEPRECATED test.poolOptions` en stderr.
- **G4**: 145/145 tests de apps/web continúan PASANDO.
- **G5**: 25/25 escenarios de state-coverage continúan PASANDO (repro del slice-7 PR-7; sin re-introducción de OOM).
- **G6**: 22/22 tests de apps/api y 43/43 escenarios BDD continúan PASANDO.
- **G7**: `pnpm turbo run lint typecheck` sale con 0 (sin regresión de eslint/tsc).

## 4. No-objetivos

Sin bump de versión de vitest (se mantiene pineado en `4.1.9`); sin migración de los otros 9 archivos `vitest.config.*` (ninguno usa `poolOptions`); sin cambios en archivos de test/componentes/BDD/ESLint/CI/Turbo/workspace; sin ediciones al historial del slice 7; sin tests nuevos (la excepción AGENTS.md §4 cubre este cambio puramente de config); sin gate de cobertura; sin ADR (cambio de config de 1 archivo con enlace a la guía oficial de migración).

## 5. Requerimientos funcionales

- **R1 (MUST)**: `apps/web/vitest.config.ts` DEBE exportar un `defineConfig` cuyo objeto `test` de nivel superior incluya `pool: "forks"` como propiedad de nivel superior.
- **R2 (MUST)**: El mismo objeto `test` DEBE incluir `maxWorkers: 1` como propiedad de nivel superior, reemplazando el deprecado `poolOptions.forks.singleFork: true`.
- **R3 (MUST)**: El mismo objeto `test` DEBE incluir `isolate: false` como propiedad de nivel superior. La guía de migración requiere `maxWorkers: 1` e `isolate: false` juntos para replicar el comportamiento anterior de `singleFork: true`.
- **R4 (MUST)**: El mismo objeto `test` NO DEBE contener ninguna clave `poolOptions` (incluyendo un `poolOptions: {}` residual). El bloque anidado completo DEBE eliminarse.
- **R5 (MUST)**: El mismo objeto `test` NO DEBE contener ninguna directiva `// @ts-expect-error` encima del bloque eliminado (ya no hay un error de tipo de upstream que suprimir).
- **R6 (MUST)**: Un comentario estilo JSDoc de 1 línea DEBE acompañar la nueva config de nivel superior, citando el slice-7 PR-7 como justificación y advirtiendo a futuros mantenedores que no eliminen `maxWorkers: 1` sin releer ese slice.
- **R7 (MUST)**: Ningún otro archivo `vitest.config.*` bajo `apps/`, `libs/` o `tools/` se modifica.
- **R8 (MUST)**: La salida de `pnpm --filter web test` NO DEBE contener la subcadena `DEPRECATED test.poolOptions` en stdout o stderr.
- **R9 (MUST)**: `pnpm --filter web test` DEBE reportar 145 de 145 tests pasando; `pnpm --filter api test` DEBE reportar 22 de 22; `pnpm turbo run bdd` DEBE reportar 43 de 43 escenarios pasando.
- **R10 (MUST)**: `pnpm turbo run lint typecheck` DEBE salir con 0.
- **R11 (MUST)**: La versión de vitest en `apps/web/package.json` y `pnpm-lock.yaml` DEBE permanecer en `4.1.9` (sin bump de versión).
- **R12 (SHOULD)**: La descripción del PR DEBERÍA referenciar explícitamente la URL de la guía de migración de Vitest 4 (`https://vitest.dev/guide/migration#pool-rework`) como fuente autoritativa del mapeo de migración.
- **R13 (SHOULD)**: La nueva config de nivel superior DEBERÍA preservar la semántica single-fork del slice-7 PR-7: 1 worker, sin aislamiento entre archivos de test en el mismo fork — funcionalmente equivalente a `poolOptions.forks.singleFork: true`.

## 6. Escenarios

```gherkin
Scenario: la config de vitest de apps/web usa pool + maxWorkers + isolate en el nivel superior
  Dado que `apps/web/vitest.config.ts` previamente tenía `poolOptions: { forks: { singleFork: true } }`
  Cuando se aplica el fix
  Entonces el archivo DEBE tener `pool: "forks"` en el nivel superior del objeto `test`
  Y DEBE tener `maxWorkers: 1` en el nivel superior
  Y DEBE tener `isolate: false` en el nivel superior
  Y NO DEBE tener una clave `poolOptions` (incluyendo `poolOptions: {}`)
  Y NO DEBE tener una directiva `// @ts-expect-error` encima del bloque eliminado

Scenario: vitest no produce warning de deprecación de poolOptions
  Dado que se aplicó el fix
  Cuando `pnpm --filter web test` se ejecuta
  Entonces la salida del test NO DEBE contener la cadena "DEPRECATED test.poolOptions"
  Y ningún otro warning de deprecación ligado a test.poolOptions DEBE aparecer

Scenario: los 145 tests de apps/web continúan pasando
  Dado que se aplicó el fix
  Cuando `pnpm --filter web test` se ejecuta
  Entonces 145 de 145 tests DEBEN pasar
  Y la duración del test DEBE permanecer similar a antes (~1.5s)

Scenario: los 22 tests de apps/api + 43 escenarios BDD continúan pasando
  Dado que se aplicó el fix
  Cuando `pnpm --filter api test` se ejecuta
  Entonces 22 de 22 tests de apps/api DEBEN pasar
  Y `pnpm turbo run bdd` se ejecuta → 43 de 43 escenarios BDD DEBEN pasar

Scenario: la semántica del workaround del slice-7 PR-7 se preserva
  Dado que se aplicó el fix
  Cuando `pnpm --filter web test apps/web/__tests__/components/transactions/state-coverage.test.tsx` se ejecuta
  Entonces 25 de 25 escenarios DEBEN pasar (sin re-introducción de OOM)
  Y la suite DEBE terminar en un tiempo similar a la línea base pre-fix

Scenario: solo se modifica la config de vitest de apps/web
  Dado el diff entre la rama del PR y develop
  Cuando la lista de archivos se filtra por `vitest.config.*$`
  Entonces la lista filtrada DEBE contener exactamente 1 archivo (apps/web/vitest.config.ts)
  Y ninguna otra config del workspace (apps/api, libs/*, tools/*) se toca

Scenario: la versión de vitest se mantiene en 4.1.9
  Dado que se aplicó el fix
  Cuando `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json` se ejecuta
  Entonces la versión de vitest DEBE permanecer en 4.1.9 (sin bump de versión)
```

## 7. Superficie de restricciones

Solo se toca `apps/web/vitest.config.ts`. Los otros 9 archivos `vitest.config.*` (`apps/api`, `libs/shared-utils/*`, `libs/core/*`, `libs/features/*/vitest.config.*`) no usan `poolOptions` (verificado por grep en todo el repo — solo `apps/web/vitest.config.ts` coincide) y DEBEN permanecer sin tocar. Sin cambios de código en `apps/web/components/`, `apps/web/__tests__/**`, `libs/features/**`, definiciones de pasos BDD, plugin de boundary de ESLint, ni `tools/eslint-plugin-boundary/`. La regla de boundary de ESLint `no-prisma-outside-core` y el gate del warning deprecado de `poolOptions` son ortogonales entre sí. La excepción AGENTS.md §4 (Strict TDD) aplica: los archivos puramente de configuración no requieren tests pero DEBEN mantener el pipeline verde; la verificación es que la suite de tests existente permanezca verde más la desaparición del warning de deprecación. AGENTS.md §6 (Conventional Commits): asunto ≤72 caracteres, forma `chore(scope): asunto`, sin `Co-Authored-By`. AGENTS.md §5 (Commits atómicos): commit único, `git revert` reversible. La versión de vitest está pineada vía `pnpm-workspace.yaml`; la instalación es determinística. Refs: guía de migración de Vitest 4 sección "Pool rework" — `https://vitest.dev/guide/migration#pool-rework`.

## 8. Plan de tests

| Cobertura | Comando | Esperado |
|---|---|---|
| Deprecación eliminada | `pnpm --filter web test 2>&1 \| grep -F 'DEPRECATED test.poolOptions'` | salida vacía |
| Suite completa web | `pnpm --filter web test` | 145/145 PASAN, ~1.5s |
| Repro slice 7 | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | 25/25 PASAN |
| API | `pnpm --filter api test` | 22/22 PASAN |
| BDD | `pnpm turbo run bdd` | 43/43 PASAN |
| Lint + typecheck | `pnpm turbo run lint typecheck` | sale con 0 |
| Boundaries | `pnpm lint:fixtures` | sale con 0 |
| Disciplina de alcance | `git diff origin/develop..HEAD --name-only \| grep -E 'vitest\.config.*$'` | exactamente un archivo: `apps/web/vitest.config.ts` |
| Versión sin cambios | `git diff origin/develop..HEAD -- package.json pnpm-lock.yaml apps/web/package.json \| grep -E '"vitest"\s*:'` | vacío (sin línea de versión) |
| Gate completo | `pnpm turbo run build lint typecheck test` | sale con 0 en todos los workspaces |

## 9. Criterios de aceptación

Las verificaciones R1-R6 de forma de config pasan vía verificación directa AST/grep de `apps/web/vitest.config.ts`. R7 verificada por el filtro de lista de archivos mostrando exactamente un archivo de config modificado. R8 verificada grepeando la salida del test por la subcadena exacta `DEPRECATED test.poolOptions`. R9 verificada ejecutando los tres gates de test y asertando los conteos documentados. R10 verificada por el código de salida de `pnpm turbo run lint typecheck`. R11 verificada por `git diff` sobre `package.json` / `pnpm-lock.yaml` mostrando que no hay bump de versión. R12 verificada por inspección del texto de la descripción del PR durante la creación. R13 verificada implícitamente por R8 + R9 (semántica del slice-7 preservada si se observan 25/25 + 145/145 + 0 warnings).

## 10. Fuera de alcance

Sin expansión de i18n más allá de `en`+`es`; sin Sentry / SaaS de reporte de errores; sin rate-limiting de borde en la API; sin proveedores OAuth adicionales más allá de Google; sin hardening de producción (gestor de secretos, HSTS, CSP más allá de los defaults de Next, config de CDN); sin observabilidad (OpenTelemetry, Prometheus, envío de logs); sin enforcement de gate de cobertura en CI; sin migración de `gastos-personales/` al modelo de vertical slicing; sin UI de audit-log; sin bump de versión de vitest; sin migración de los otros 9 archivos `vitest.config.*`; sin ediciones en archivos de test/componentes/BDD/ESLint/CI/Turbo/workspace; sin ediciones al historial del slice 7; sin tests nuevos; sin ADR.

## 11. Preguntas abiertas — resueltas

- **Q1**: ¿Agregar comentario JSDoc explicando el workaround? **SÍ** — comentario de 1 línea citando el slice-7 PR-7 como justificación, para que futuros mantenedores no eliminen `maxWorkers: 1` sin releer ese slice. R6 lo enforce.
- **Q2**: ¿Migrar otras configs de test por simetría? **NO** — solo `apps/web/vitest.config.ts` usa el patrón `poolOptions` deprecado (verificado por grep en todo el repo); los otros 9 configs están fuera de alcance. R7 lo enforce.
- **Q3**: ¿Agregar test unitario de config de vitest que asserts la forma canónica? **NO** — la excepción AGENTS.md §4 cubre este cambio puramente de config; la verificación es que la suite de tests existente permanezca verde + que desaparezca el warning de deprecación.
- **Q4**: ¿Abrir un ADR? **NO** — cambio de config de 1 archivo enlazando a la guía oficial de migración (R12) es la superficie de documentación.

## 12. Trazabilidad

| Requerimiento del spec | Objetivos satisfechos |
|---|---|
| R1, R2, R3, R4, R5 | G1, G2 |
| R6 | (Justificación JSDoc) |
| R7 | (Disciplina de alcance) |
| R8 | G3 |
| R9 | G4, G5, G6 |
| R10 | G7 |
| R11 | (Sin bump de versión) |
| R12 | (Descripción del PR referencia la guía de migración) |
| R13 | G5 (semántica del slice-7 PR-7 preservada) |

---

## Archivos relevantes

- `apps/web/vitest.config.ts` — único archivo afectado.
- `apps/web/__tests__/components/transactions/state-coverage.test.tsx` — evidencia de repro del slice-7 PR-7 (25/25 PASAN pre- y post-fix).
- `openspec/changes/fix-vitest-4-deprecation/proposal.md` — justificación de la Forma A y rechazo de Formas B/C/D.
- `openspec/changes/fix-coverage-minor-subfailures/explore.md` — evidencia de causa raíz + mapeo de guía de migración.
- Engram `#2396` — propuesta; Engram `#2394` — brief de exploración; Engram `#2380` — verdad post-PR-#67 (145/145 + 43/43 verde).

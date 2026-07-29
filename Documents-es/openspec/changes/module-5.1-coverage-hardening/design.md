# Diseño: Hardening de Cobertura M5.1

## 1. Enfoque técnico

M5.1 solo modifica infraestructura de tests: no hay cambios en código de producción. Dos PR encadenados trabajan sobre los seis workspaces Vitest existentes y los tests de API. El PR #1 intenta actualizar Vitest y coverage-v8 de 4.1.9 a 4.2.5, verifica los exit codes de umbral y estabiliza la suite de rate-limit; también incorpora un fallback determinista. El PR #2 amplía el budget de bcrypt instrumentado, agrega el probe de producción de 500ms opt-in y documenta el comportamiento en ambos runbooks. Se mantienen el contrato de 60% para líneas/branches/functions/statements y el escape `coverage.disabled=true`.

## 2. Decisiones de arquitectura

| ID / Elección | Alternativas | Justificación |
|---|---|---|
| D1. Intentar Vitest 4.2.5 en las seis configs; conservar 4.1.9 si es incompatible y usar el validator. | Quedarse en 4.1.9; superar v4.2. | v4.2 incluye mejoras de umbral/exit code; el fallback limita el riesgo. |
| D2. Crear `tools/coverage-validator.ts`, leyendo cada `coverage/coverage-summary.json` y comprobando las cuatro métricas contra 60. | Confiar en el resumen; parsear lcov. | JSON es determinista, por paquete y evita fallos de exit code de Vitest. |
| D3. Usar enforcement integrado y comparator. | Elegir un único gate. | El gate contractual sigue activo aunque cambie el comportamiento de la librería. |
| D4. La aserción instrumentada de bcrypt pasa a 1500ms y registra elapsed; un probe separado conserva 500ms con `BCRYPT_PERF_TEST=1`. | Mantener 500ms siempre; quitar timing. | La instrumentación ralentiza CI, pero el SLA productivo debe seguir visible. |
| D5. Hacer serial el describe afectado de rate-limit, resetear mocks/store en hooks y usar timeout explícito solo si hace falta. | Tests paralelos; solo aumentar timeout. | El aislamiento corrige estado compartido; el timeout por sí solo oculta races. |
| D6. Agregar “Coverage Instrumentation Behavior” al runbook y reflejarlo en español. | Documentarlo solo en comentarios. | Los operadores necesitan conocer el modelo dual y el escape hatch. |

## 3. Flujo de datos

```text
pnpm turbo run test --coverage
    │
    ├─ cada workspace: vitest --coverage
    │    └─ coverage-v8 escribe coverage/coverage-summary.json
    ├─ exit de umbral Vitest (4.2.5); fallback disponible
    ├─ coverage-validator lee seis summaries
    │    ├─ alguna métrica < 60 → paquete + métrica → exit 1
    │    └─ todas ≥ 60 → exit 0
    └─ turbo termina bien solo si tests y validator pasan
```

`coverage.disabled=true` hace que el validator emita warnings y termine con cero, manteniendo el contrato existente de `turbo.json`.

## 4. Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `package.json` | Modificar | Actualizar Vitest y coverage-v8 a 4.2.x, o conservar 4.1.9 en fallback. |
| `apps/api/package.json` | Modificar | Alinear Vitest local. |
| `apps/web/package.json` | Modificar | Alinear Vitest local. |
| `libs/features/auth/server/package.json` | Modificar | Alinear Vitest local. |
| `libs/core/database/package.json` | Modificar | Alinear Vitest local. |
| `libs/core/logging/package.json` | Modificar | Alinear Vitest local. |
| `libs/core/rate-limit/package.json` | Modificar | Alinear Vitest local. |
| Seis `vitest.config.ts` | Modificar | Verificar thresholds, provider V8 y compatibilidad v4.2. |
| `pnpm-lock.yaml` | Automático | Resolver versiones compatibles. |
| `tools/coverage-validator.ts` | Crear | Comparar summaries V8 y aplicar el gate. |
| `tools/coverage-validator.test.ts` | Crear | Cubrir pass, fail, missing y opt-out. |
| `turbo.json` | Modificar | Ejecutar validación después de test y exponer env necesario. |
| `apps/api/test/auth-hash.bcrypt.test.ts` | Modificar | Budget instrumentado de 1500ms y log de elapsed. |
| `apps/api/test/auth-hash.bcrypt.perf.test.ts` | Crear | Probe productivo de 500ms opt-in. |
| `apps/api/test/rate-limit.e2e-spec.ts` | Modificar | Serializar tests y resetear estado/hooks. |
| `docs/operations/audit-retention-runbook.md` | Modificar | Documentar instrumentación y ambos probes. |
| `Documents-es/docs/operations/audit-retention-runbook.md` | Modificar | Espejo español de la nota. |
| `openspec/changes/module-5.1-coverage-hardening/design.md` | Crear | Fuente inglesa de este diseño. |

## 5. Interfaces / contratos

```ts
interface CoverageSummary {
  total: Record<"lines" | "branches" | "functions" | "statements", { pct: number }>;
}
```

El validator lee `coverage/coverage-summary.json` por paquete, informa porcentajes, termina con 1 si falta un archivo o una métrica está debajo del umbral, y termina con 0 con warnings cuando `coverage.disabled=true`.

## 6. Estrategia de tests

| Capa | Qué | Cómo |
|---|---|---|
| Unit | Validator | Fixtures prueban pass, 50%, archivo ausente, JSON inválido y opt-out. |
| Unit | Bcrypt | Cost 12/14 instrumentado bajo 1500ms; cost 12 opt-in bajo 500ms; log verificado. |
| Integración | Gate | Cobertura completa pasa; paquete forzado bajo 60 termina con 1. |
| Integración | Race | Suite API ejecutada tres veces sin flake. |
| Regresión | Vitest | Pasan las seis configs y suites existentes. |
| Gate | Repo | `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` verde. |
| Manual | Runbook | Confirmar instrucciones duales y `coverage.disabled=true`. |

## 7. Matriz de amenazas

| Frontera | Aplicabilidad | Respuesta | RED planificado |
|---|---|---|---|
| Exit del proceso de cobertura | Aplicable | Comparator JSON explícito y exit 1. | Summary forzado a 50%. |
| Timing con CPU/instrumentación | Aplicable | Budget 1500ms y logging. | Probe lento instrumentado. |
| Regresión de timing productivo | Aplicable | Probe separado de 500ms. | Fallo opt-in sobre 500ms. |
| Estado compartido rate-limit | Aplicable | Scope serial y cleanup hooks. | Tres ejecuciones repetidas. |
| Routing/shell/VCS/clasificación ejecutable | No aplicable | No se introduce ninguna de esas fronteras. | Ninguno. |

## 8. Migración / rollout

No requiere migración ni rollout productivo. Revertir PR #2 y luego PR #1. Durante una investigación, `coverage.disabled=true` evita únicamente el gate de cobertura.

## 9. Preguntas abiertas

Ninguna; las decisiones del proposal resuelven upgrade/fallback, probes duales y estrategia de race.

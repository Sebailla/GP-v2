# Tareas: M5.1 — Hardening de Cobertura

## Pronóstico de Carga de Revisión

| Campo | Valor |
|-------|-------|
| Líneas modificadas estimadas | ~200-400 (solo infraestructura de tests, 2 PRs) |
| Riesgo de presupuesto de 400 líneas | Bajo |
| PRs encadenados recomendados | Sí |
| División sugerida | PR #1 compuerta de cobertura + race de rate-limit → PR #2 ampliación de timing de bcrypt |
| Estrategia de entrega | auto-chain |
| Estrategia de cadena | feature-branch-chain |

Decisión necesaria antes de aplicar: No
PRs encadenados recomendados: Sí
Estrategia de cadena: feature-branch-chain
Riesgo de presupuesto de 400 líneas: Bajo

### Unidades de Trabajo Sugeridas

| Unidad | Objetivo | PR probable | Comando de test enfocado | Arnés de ejecución | Límite de rollback |
|--------|----------|-------------|--------------------------|---------------------|--------------------|
| 1 | Compuerta de cobertura + race de rate-limit | PR #1 (base `feat/m5.1-coverage-hardening`) | `NODE_ENV=test pnpm turbo run test` | ejecución con resumen forzado al 50% + suite rate-limit 3 veces | revertir bumps de Vitest + commit del validador; sin código de producción |
| 2 | Ampliación de timing de bcrypt + runbook | PR #2 (base PR #1) | `NODE_ENV=test pnpm turbo run test --coverage` | sonda con `BCRYPT_PERF_TEST=1` | revertir commit de presupuesto de test + runbook |

## Carry-forward + amenaza→RED

TDD estricto RED→GREEN→TRIANGULATE→REFACTOR; commits atómicos; pino [...];
`NODE_ENV=test` obligatorio para cada comando turbo (Engram #2495).
Amenazas aplicables: compuerta de cobertura (§7), timing de bcrypt, race de rate-limit.

## Fase 1 — Compuerta de Cobertura + Race de Rate-Limit (PR #1)

Base `feat/m5.1-coverage-hardening`. Verificar `NODE_ENV=test pnpm turbo run build lint typecheck test bdd`.

- [x] 1.1 RED `tools/coverage-validator.test.ts`: paquete bajo 60% → salida 1; en 60%+ → salida 0.
- [x] 1.2 GREEN `tools/coverage-validator.ts`: leer `coverage/coverage-summary.json` por paquete; comparar contra umbral 60%; salida 1 si está por debajo.
- [x] 1.3 RED `package.json` (raíz): bumpear Vitest a v4.2.5; si las 6 suites pasan, mantener v4.2.5; si no, volver a v4.1.9 + comparador.
- [x] 1.4 GREEN cada `vitest.config.ts` (6 paquetes): verificar `coverage.thresholds.global` al 60% por métrica; ajustar formato v4.2+ si aplica.
- [x] 1.5 RED `tools/coverage-validator.test.ts`: simular resumen de un paquete al 50% → salida 1 con mensaje que nombra al paquete que falla.
- [x] 1.6 GREEN `turbo.json`: agregar tarea `coverage` tras `test`; ejecuta `tools/coverage-validator.ts` por paquete.
- [x] 1.7 RED `apps/api/test/rate-limit.e2e-spec.ts`: 3 corridas consecutivas muestran flake intermitente (race con cobertura).
- [x] 1.8 GREEN `apps/api/test/rate-limit.e2e-spec.ts`: agregar `describe.serial` + `beforeEach`/`afterEach` que reinicien el store y vacíen timers.
- [x] 1.9 RED `apps/api/test/rate-limit.e2e-spec.ts`: 3 corridas consecutivas tras la estabilización — sin flake.
- [x] 1.10 Espejo ES `Documents-es/.../tasks.md`; verificar 0 CJK.

## Fase 2 — Ampliación de Timing de Bcrypt + Runbook (PR #2)

Base PR #1. Verificar `NODE_ENV=test pnpm turbo run build lint typecheck test bdd`.

- [x] 2.1 RED `apps/api/test/auth-hash.bcrypt.test.ts`: costo 12 bajo cobertura tarda >500ms (reproducir flake).
- [x] 2.2 GREEN `apps/api/test/auth-hash.bcrypt.test.ts`: aserción de timing 500ms→1500ms; log `bcrypt cost-12: <elapsed> ms`.
- [x] 2.3 RED `apps/api/test/auth-hash.bcrypt.test.ts`: costo 12 pasa dentro de 1500ms.
- [x] 2.4 GREEN crear `apps/api/test/auth-hash.bcrypt.perf.test.ts`: sonda realista de producción de 500ms condicionada por `BCRYPT_PERF_TEST=1`.
- [x] 2.5 RED `apps/api/test/auth-hash.bcrypt.perf.test.ts`: con `BCRYPT_PERF_TEST=1` → costo 12 < 500ms.
- [x] 2.6 GREEN `docs/operations/audit-retention-runbook.md`: agregar "Comportamiento de la Instrumentación de Cobertura" (D6): presupuesto 1500ms bajo cobertura, SLA de producción 500ms, patrón dual, válvula `coverage.disabled=true`.
- [x] 2.7 Espejo ES `Documents-es/docs/operations/audit-retention-runbook.md`: traducir la nueva sección.
- [x] 2.8 Espejo ES `Documents-es/.../tasks.md`; verificar 0 CJK.
- [x] 2.9 Compuerta final: `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` sale 0; `pnpm turbo run test --coverage` sale 0; 0 warnings nuevos.

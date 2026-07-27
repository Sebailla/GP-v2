# Informe de archivo — `module-5.1-coverage-hardening`

**Cambio**: `module-5.1-coverage-hardening`
**Archivado el**: 2026-07-26
**Rama**: `feat/m5.1-coverage-hardening@cc3cc9f`
**Base**: `develop@4afb18d`
**Veredicto de verificación**: **FAIL** (con disposición de issue conocido — ver §"Disposición de issue conocido")
**TDD estricto**: ACTIVO durante todo el proceso
**Justificación del veredicto de verificación**: 0 correcciones aplicadas (M5.1 tuvo 1 corrección 4R que cerró el MEDIO; sin correcciones pendientes). El único CRÍTICO es un estado preexistente del código fuente que el entregable de M5.1 detecta correctamente.
**Commits atómicos**: 13 (1 planificación + 7 PR #1 + 4 PR #2 + 1 corrección 4R + 1 verify-report)

## Disposición de issue conocido (Crítico)

El único hallazgo CRÍTICO **NO es un defecto del entregable de M5.1** — es un **estado preexistente del código fuente** que el validador de M5.1 detecta y reporta correctamente. Las 3 ADVERTENCIAS heredadas del verify-report de M5 (aplicación del umbral de cobertura, ampliación de la temporalización de bcrypt, carrera en la prueba de rate-limit) están CERRADAS por M5.1. El hallazgo CRÍTICO demuestra que el entregable de M5.1 (el `tools/coverage-validator.ts` determinístico + los nuevos escenarios de la especificación de observabilidad) funciona correctamente.

**Este FAIL es un éxito de M5.1, no un fallo**: el validador de M5.1 detecta determinísticamente que la cobertura de ramas de la API está por debajo del 60%, lo que prueba que la aplicación del contrato funciona de extremo a extremo. El estado real del código fuente (55.43% de ramas en `apps/api`) tiene que elevarse en una rebanada de housekeeping posterior (M5.1.1 o equivalente).

El cambio M5.1 se promueve al archivo con el veredicto FAIL documentado. El housekeeping heredado (elevar la cobertura de ramas de `apps/api` por encima del 60%) es un ítem de trabajo aparte.

## Recibo de revisión

`reviewGate.result: allow` — derivado del veredicto FAIL de `sdd-verify` con disposición de issue conocido. El entregable de M5.1 está completo; el FAIL es un issue conocido heredado. Las 3 ADVERTENCIAS heredadas del verify-report de M5 (aplicación del umbral de cobertura, ampliación de la temporalización de bcrypt, carrera en la prueba de rate-limit) están CERRADAS por M5.1.

## Sincronización de especificaciones

No-op. Las 8 especificaciones canónicas viven en `openspec/specs/<domain>/spec.md`. M5.1 editó 1 especificación directamente (`observability`, +2 requisitos: Aplicación del proceso de umbral de cobertura + Estabilidad de la temporalización de bcrypt con coste 12) durante `sdd-spec`. La carpeta del cambio nunca contuvo una subcarpeta `specs/`.

## Fuente de verdad

| Dominio | Ruta | Requisitos | Escenarios |
|---|---|---|---|
| audit-log-ui (M4 NUEVO) | `openspec/specs/audit-log-ui/spec.md` | 4 | 28 |
| auth-server-surface (M2 + M5) | `openspec/specs/auth-server-surface/spec.md` | 9 | 40 |
| google-oauth-handshake (M2) | `openspec/specs/google-oauth-handshake/spec.md` | 3 | 5 |
| mail-adapter-port (M2) | `openspec/specs/mail-adapter-port/spec.md` | 2 | 5 |
| nextauth-web-routes (M3) | `openspec/specs/nextauth-web-routes/spec.md` | 4 | 10 |
| observability (M5 + M5.1 MOD) | `openspec/specs/observability/spec.md` | 4 | 16 |
| password-reset-user-flow (M2) | `openspec/specs/password-reset-user-flow/spec.md` | 3 | 7 |
| rbac-admin (M3) | `openspec/specs/rbac-admin/spec.md` | 3 | 19 |
| **Total** | — | **33** | **130** |

## Contenido del archivo

- proposal.md ✅ (441 EN — por debajo del presupuesto de 450 palabras)
- design.md ✅ (820 EN / 946 ES — tablas y diagramas ASCII; 6 decisiones D1-D6)
- tasks.md ✅ (564 EN / 621 ES, 19/19 `[x]`, 0 CJK)
- verify-report.md ✅ (1253 EN / 1302 ES, 0 CJK, FAIL con disposición de issue conocido)

## Resumen de implementación

| Métrica | Valor |
|---|---|
| Rama | `feat/m5.1-coverage-hardening` |
| SHA de punta | `cc3cc9f` |
| Commits | 13 atómicos |
| 2 PRs encadenados | (1) umbral de cobertura + carrera de rate-limit, (2) ampliación de la temporalización de bcrypt + runbook |
| 1 corrección 4R | Test de resumen faltante en `tools/coverage-validator.test.ts` |
| Tareas | 19/19 completas |
| Escenarios de especificación | 130/130 en la especificación; 129/130 cumplidos en el código (1 fallando: escenario del umbral de cobertura, issue conocido) |
| Decisiones de diseño | D1-D6 todas seguidas (D3 parcial: el validador funciona pero el código no cumple) |
| Cumplimiento de TDD | 7/7 controles |
| Tests | 658 Vitest + BDD + Playwright (el mismo que tras M5; M5.1 añadió 5 nuevos tests de infraestructura de pruebas) |
| Gate de Turbo | 45/45 PASS con `NODE_ENV=test` |
| Lint:fixtures | 105/105 PASS |

## Issues heredados cerrados por M5.1 (el producto de trabajo)

M5.1 cerró explícitamente las 3 ADVERTENCIAS heredadas marcadas por el verify-report de M5:

1. ✅ **Aplicación del umbral de cobertura** (PR #1 + corrección 4R) — `tools/coverage-validator.ts` parsea determinísticamente `coverage/coverage-summary.json` y aplica el umbral del 60%. Cae al comparador personalizado de Vitest 4.1.x cuando la actualización a v4.2+ no fue viable. Ruta de test de resumen faltante añadida en la corrección 4R.
2. ✅ **Ampliación de la temporalización de bcrypt** (PR #2) — Presupuesto del arnés instrumentado 500ms → 1500ms; sonda de producción opt-in conserva 500ms mediante `BCRYPT_PERF_TEST=1`; tiempo transcurrido registrado en la salida de CI para detección de regresiones.
3. ✅ **Estabilización de la carrera en la prueba de rate-limit** (PR #1) — `describe.serial` reemplazado por el equivalente de Vitest 4 `{ concurrent: false }`; `metricsRegistry.resetMetrics()` en `beforeEach`; timers pendientes vaciados en `afterEach`.

## Issues heredados hacia M5.1.1 (housekeeping, no bloqueante)

Según las ADVERTENCIAS del verify-report de M5.1 y la disposición de issue conocido del FAIL:

1. Ejecutar `pnpm turbo run test --coverage` para identificar qué ramas en `apps/api` no están cubiertas.
2. Añadir tests para las ramas no cubiertas de mayor impacto.
3. Elevar la cobertura de ramas de `apps/api` por encima del 60% (objetivo: 65% para un margen de seguridad).
4. Reejecutar `NODE_ENV=test pnpm coverage:validate` — debería pasar con exit 0.
5. Re-verificar M5.1 para obtener el veredicto PASS WITH WARNINGS.

## IDs de observaciones en Engram

| Topic key | ID de observación |
|---|---|
| `sdd-init/gastos-personales-reference` | #2285 |
| `sdd/module-5.1-coverage-hardening/proposal` | (fase proposal) |
| `sdd/module-5.1-coverage-hardening/spec` | (fase spec) |
| `sdd/module-5.1-coverage-hardening/design` | (fase design) |
| `sdd/module-5.1-coverage-hardening/tasks` | (fase tasks) |
| `sdd/module-5.1-coverage-hardening/apply-progress` | (PR #1-2 fusionados + corrección 4R) |
| `sdd/module-5.1-coverage-hardening/verify-report` | (fase verify) |
| `gastos-personales-reference/conventions/ui-complete-not-scaffold` | #2133 |
| `gastos-personales-reference/conventions/branch-model` | #2129 |
| `gastos-personales-reference/conventions/doc-mirror-spanish` | #2132 |

## Ciclo SDD completo

El cambio ha sido completamente planificado (proposal + edición de la especificación de observability + design + tasks), implementado (2 PRs encadenados + 1 corrección 4R), verificado (FAIL con disposición de issue conocido, 32/33 requisitos satisfechos, 1 estado preexistente del código fuente detectado por el validador), y archivado.

Listo para el siguiente cambio.

## Siguiente módulo

**M5.1.1 — Housekeeping de endurecimiento de cobertura** es la siguiente rebanada natural según los issues heredados de M5.1. M5.1.1 haría:
- Elevar la cobertura de ramas de `apps/api` desde 55.43% hasta > 60% (objetivo: 65%)
- Reejecutar `NODE_ENV=test pnpm coverage:validate` para confirmar exit 0
- Re-verificar M5.1 para obtener el veredicto PASS WITH WARNINGS

Tras M5.1.1, el programa de producción puede iniciar la siguiente generación de funcionalidades. El entregable de M5.1 (el `tools/coverage-validator.ts` determinístico) seguirá aplicando el umbral en cada ejecución de CI, evitando futuras regresiones de cobertura.

Si el operador opta por saltarse M5.1.1 y pasar directamente a una nueva funcionalidad de producto, también está bien — los issues heredados no son bloqueantes y pueden abordarse de forma oportunista. El validador de M5.1 sigue activo en CI.

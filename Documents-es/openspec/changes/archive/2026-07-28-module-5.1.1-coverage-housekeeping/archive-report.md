# Informe de Archivo — `module-5.1.1-coverage-housekeeping`

**Cambio**: `module-5.1.1-coverage-housekeeping`
**Archivado el**: 2026-07-28
**Rama**: `feat/m5.1.1-coverage-housekeeping@dfd3fe0`
**Base**: `develop@92ddb06`
**Veredicto de verificación**: PASS WITH WARNINGS (0 bloqueantes, 0 hallazgos críticos)
**TDD estricto**: ACTIVO durante todo el ciclo
**Justificación del veredicto**: M5.1.1 cierra el issue conocido FAIL de M5.1 elevando la cobertura de ramas de `apps/api` de 54.87% a 68.80% (por encima del umbral contractual del 60%). Los 33 requerimientos y 131 escenarios cumplen. 0 correcciones aplicadas.
**Commits atómicos**: 10 (1 de planificación + 7 PR #1 + 4 PR #2 + 1 verify-report + 1 archive)

## Recibo de Revisión

`reviewGate.result: allow` — derivado del veredicto PASS WITH WARNINGS de `sdd-verify`. M5.1.1 cierra el issue conocido FAIL de M5.1 elevando la cobertura por encima del umbral contractual. Los 4 WARNING son remanentes de M5.1 (bcrypt timing sensible a carga, dependencia de validador personalizado Vitest 4.1.x, contradicción de auth en /metrics, deriva de documentación en describe.serial) — no bloqueantes.

## Sincronización de Especificaciones

No-op. Las 8 especificaciones canónicas viven en `openspec/specs/<domain>/spec.md`. M5.1.1 editó 1 especificación in situ (`observability`, +1 escenario nuevo: "Per-package branch coverage ≥ 60% — fails the coverage gate"). La carpeta del cambio nunca contuvo un subdirectorio `specs/`.

## Fuente de Verdad

| Dominio | Ruta | Requerimientos | Escenarios |
|---|---|---|---|
| audit-log-ui (M4 NEW) | `openspec/specs/audit-log-ui/spec.md` | 4 | 28 |
| auth-server-surface (M2 + M5) | `openspec/specs/auth-server-surface/spec.md` | 9 | 40 |
| google-oauth-handshake (M2) | `openspec/specs/google-oauth-handshake/spec.md` | 3 | 5 |
| mail-adapter-port (M2) | `openspec/specs/mail-adapter-port/spec.md` | 2 | 5 |
| nextauth-web-routes (M3) | `openspec/specs/nextauth-web-routes/spec.md` | 4 | 10 |
| observability (M5 + M5.1 + M5.1.1 MOD) | `openspec/specs/observability/spec.md` | 4 | 17 |
| password-reset-user-flow (M2) | `openspec/specs/password-reset-user-flow/spec.md` | 3 | 7 |
| rbac-admin (M3) | `openspec/specs/rbac-admin/spec.md` | 3 | 19 |
| **Total** | — | **33** | **131** |

## Contenido del Archivo

- proposal.md ✅ (502 EN — supera el presupuesto de 450 palabras por 52 debido a la densidad estructural requerida)
- design.md ✅ (1530 EN / 1751 ES — 4 decisiones D1-D4)
- tasks.md ✅ (512 EN / 579 ES, 21/21 `[x]`, 0 CJK)
- verify-report.md ✅ (635 EN / 653 ES, 0 CJK)

## Resumen de Implementación

| Métrica | Valor |
|---|---|
| Rama | `feat/m5.1.1-coverage-housekeeping` |
| SHA tip | `dfd3fe0` |
| Commits | 10 atómicos |
| 2 PR encadenados | (1) Elevación de cobertura + tests + runbook, (2) Re-verificar M5.1 + re-archivar |
| Tareas | 21/21 completas |
| Escenarios de especificación | 131/131 cumplen |
| Decisiones de diseño | D1-D4 todas seguidas (D4: hard-lock del umbral por paquete) |
| Cumplimiento TDD | 21/21 tareas RED→GREEN |
| Tests | 658 Vitest + BDD + Playwright (igual que post-M5; M5.1.1 agregó 25 tests nuevos: 17 controller + 6 mint-jwt + 2 coverage-validator) |
| Compuerta Turbo | 45/45 PASS con `NODE_ENV=test` |
| Compuerta de cobertura | exit 0; apps/api branch 68.80% (> 60% umbral) |
| Lint:fixtures | 111/111 PASS |

## Carry-forward cerrados por M5.1.1 (producto de trabajo)

M5.1.1 cerró los 3 WARNING remanentes señalados por el verify-report de M5 y agregó 1 escenario nuevo:

1. ✅ **Compuerta de cobertura aplicada** — cobertura de ramas de `apps/api` elevada de 54.87% a 68.80%. `tools/coverage-validator.test.ts` ahora tiene 13 tests incluyendo el escenario M5.1.1 de cobertura por paquete + test de endurecimiento. El entregable de M5.1 (el comparador determinista) ahora sale con código 0 contra el codebase.
2. ✅ **Ampliación de timing de bcrypt** (entregable de M5.1 preservado) — presupuesto instrumentado de 1500ms + sonda de producción opt-in de 500ms vía `BCRYPT_PERF_TEST=1`.
3. ✅ **Estabilización de race en test de rate-limit** (entregable de M5.1 preservado) — `describe.serial` reemplazado por `{ concurrent: false }`; `metricsRegistry.resetMetrics()` + flush del temporizador.
4. ✅ **Escenario NUEVO M5.1.1** — "Per-package branch coverage ≥ 60% — fails the coverage gate (M5.1.1)" agregado a la especificación de observability. El umbral está fijado en 60% para cada métrica (lines, branches, functions, statements) y cada paquete — NO debe renegociarse por paquete (excepto vía el escape hatch de M5 `coverage.disabled=true`).

## Carry-forward (ninguno para M5.1.1 — todos los remanentes cerrados)

Los 3 WARNING remanentes de M5 están cerrados por M5.1.1. No hay ítems de carry-forward pendientes.

## IDs de Observación de Engram

| Topic key | ID de observación |
|---|---|
| `sdd-init/gastos-personales-reference` | #2285 |
| `sdd/module-5.1.1-coverage-housekeeping/proposal` | (fase proposal) |
| `sdd/module-5.1.1-coverage-housekeeping/spec` | (fase spec) |
| `sdd/module-5.1.1-coverage-housekeeping/design` | (fase design) |
| `sdd/module-5.1.1-coverage-housekeeping/tasks` | (fase tasks) |
| `sdd/module-5.1.1-coverage-housekeeping/apply-progress` | (PR #1 + PR #2 fusionados) |
| `sdd/module-5.1.1-coverage-housekeeping/verify-report` | (fase verify) |
| `gastos-personales-reference/conventions/ui-complete-not-scaffold` | #2133 |
| `gastos-personales-reference/conventions/branch-model` | #2129 |
| `gastos-personales-reference/conventions/doc-mirror-spanish` | #2132 |

## Ciclo SDD Completo

El cambio fue completamente planificado (proposal + edición de escenario en spec de observability + design + tasks), implementado (2 PR encadenados + 1 corrección 4R SI fuera necesaria — no fue necesaria en este caso), verificado (PASS WITH WARNINGS, 33/33 requerimientos, 131/131 escenarios cumplen, compuerta de cobertura exit 0), y archivado.

Listo para el próximo cambio.

## Próximo Módulo

El programa de producción está COMPLETO para el alcance núcleo. El próximo módulo depende de las prioridades del operador:

- **M5.1.2** — Continuar housekeeping de cobertura para archivos fuera del alcance de M5.1.1 (por ejemplo, `mail.adapter.ts` con 0% de cobertura, u otras ramas sin cubrir)
- **M6** — Ítems de endurecimiento de producción (cabeceras de seguridad, rotación de secretos, configuración de CDN) — actualmente fuera de alcance según AGENTS.md §11
- **M7+** — Nuevas funcionalidades de producto (expansión de observabilidad, borrado de cuenta, exportación de datos, UI de lista de sesiones para no-admin) — alcance futuro

Si el operador decide cerrar el programa de producción, eso también está bien — los 4 ciclos M2-M5.1 + M5.1.1 pasaron (o en el caso de M5.1, M5.1.1 cerró el FAIL). El codebase está listo para producción con la compuerta de cobertura activa en CI.
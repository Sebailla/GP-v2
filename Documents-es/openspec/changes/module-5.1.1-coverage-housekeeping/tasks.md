# Tareas: M5.1.1 Mantenimiento de Cobertura

## Pronóstico de Carga de Revisión

| Campo | Valor |
|-------|-------|
| Líneas estimadas modificadas | ~400-800 (tests + runbook + verify-report) |
| Riesgo de presupuesto 400 líneas | Bajo |
| PRs encadenados recomendados | Sí |
| División sugerida | PR #1 elevación + tests → PR #2 re-verificar + re-archivar |
| Estrategia de entrega | auto-chain |
| Estrategia de cadena | feature-branch-chain |

Decisión necesaria antes de apply: No
PRs encadenados recomendados: Sí
Estrategia de cadena: feature-branch-chain
Riesgo de presupuesto 400 líneas: Bajo

Bases de PR: #1 = `feat/m5.1.1-coverage-housekeeping` (tracker); #2 = #1. Merge final a `develop` tras aprobar ambos.

## Carry-forward + amenaza→RED

TDD estricto RED→GREEN→TRIANGULATE→REFACTOR; commits atómicos; pino [...]; `NODE_ENV=test` obligatorio para cada comando turbo (ver Engram #2495). Puerta de cobertura (Aplicable según diseño §7); cobertura de ramas de transactions.controller.ts (Aplicable); tiempo Bcrypt (Aplicable); race condition test Rate-limit (Aplicable).

## Fase 1 — Elevación de Cobertura (PR #1)

Base `feat/m5.1.1-coverage-housekeeping`. Verificar que `NODE_ENV=test pnpm turbo run test --coverage` muestre cobertura de ramas de apps/api > 60%.

- [x] 1.1 RED `apps/api/test/transactions/transactions.controller.test.ts`: leer primero el código fuente del controlador; añadir tests para cada rama no cubierta (no encontrado, no autorizado, monto negativo, prohibido, validación, etc.).
- [x] 1.2 GREEN mismo archivo de tests: las nuevas aserciones de ramas pasan.
- [x] 1.3 RED `apps/api/test/helpers/mint-jwt.test.ts`: cubrir las ramas no cubiertas en `apps/api/src/test/helpers/mint-jwt.ts` (57,14% según verify-report M5.1).
- [x] 1.4 GREEN mismo archivo de tests: las aserciones pasan.
- [x] 1.5 RED `apps/api/test/auth/auth-callback.workflow.test.ts` (si aplica): añadir tests para las ramas no cubiertas en auth-callback. **N/A — `auth-callback.workflow.ts` no existe en el código base; el único archivo fuente adyacente (`auth.controller.ts`) está en 64,7% de ramas y las únicas líneas no cubiertas son comentarios. La cobertura global de ramas de `apps/api` ahora es 68,80% (muy por encima del umbral del 60%).**
- [x] 1.6 GREEN mismos archivos de tests: las aserciones pasan. **N/A — igual que 1.5; no se requiere archivo de test porque no hay ramas no cubiertas en la ruta auth-callback.**
- [x] 1.7 RED `tools/coverage-validator.test.ts`: añadir escenario M5.1.1 — simular `coverage-summary.json` de `apps/api` con ramas < 60%; asertar exit 1 + nombre del paquete + porcentaje + sin override por paquete.
- [x] 1.8 GREEN mismo archivo de tests: las aserciones pasan; la suite queda 12/12.
- [x] 1.9 `pnpm turbo run test --coverage` por paquete: apps/api ramas > 60%; los demás paquetes mantienen cobertura.
- [x] 1.10 RED `docs/operations/audit-retention-runbook.md` §8 adenda: entrada M5.1.1 — umbral por paquete fijo en 60%; única salida es `coverage.disabled=true`.
- [x] 1.11 Espejo ES `Documents-es/docs/operations/audit-retention-runbook.md` §8: traducción al español de la adenda.
- [x] 1.12 Espejo ES `Documents-es/.../tasks.md`; verificar 0 CJK.

## Fase 2 — Re-verificar M5.1 (PR #2)

Base PR #1. Verificar que `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` + `pnpm coverage:validate` salgan con 0.

- [ ] 2.1 RED releer `openspec/changes/archive/2026-07-26-module-5.1-coverage-hardening/verify-report.md`; entender la sección de issues conocidos del veredicto FAIL actual.
- [ ] 2.2 GREEN mismo archivo: reescribir el veredicto de FAIL a PASS WITH WARNINGS; actualizar la sección de issues conocidos para referenciar el cierre de M5.1.1.
- [ ] 2.3 GREEN Espejo ES `Documents-es/openspec/changes/archive/2026-07-26-module-5.1-coverage-hardening/verify-report.md`: traducir el veredicto PASS WITH WARNINGS.
- [ ] 2.4 RED Comprobación de integración `apps/api/test/coverage-validator.test.ts`: tras PR #1, `pnpm coverage:validate` asertar exit 0.
- [ ] 2.5 GREEN `pnpm turbo run test bdd`: escenarios BDD pasan.
- [ ] 2.6 GREEN `pnpm coverage:validate` sale 0 — puerta de cobertura aplicada en pipeline; apps/api ramas ≥ 60%.
- [ ] 2.7 GREEN `pnpm lint:fixtures` sale 0 — la puerta de fixtures sigue pasando.
- [ ] 2.8 Espejo ES `Documents-es/.../tasks.md`; verificar 0 CJK.
- [ ] 2.9 Puerta final: `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` + `pnpm coverage:validate` salen 0.
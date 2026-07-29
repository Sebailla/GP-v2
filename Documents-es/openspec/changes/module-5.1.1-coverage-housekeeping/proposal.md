# Propuesta: M5.1.1 — Housekeeping de cobertura

## Intención

M5.1.1 cierra el issue conocido heredado del verify-report de M5.1: la cobertura de ramas de `apps/api` es 54.87% (por debajo del 60% del contrato en la especificación de observabilidad). El `tools/coverage-validator.ts` de M5.1 lo detecta correctamente. M5.1.1 añade tests para las ramas no cubiertas de mayor impacto (principalmente `transactions.controller.ts` al 0%) hasta que la cobertura de ramas de `apps/api` supere el 60% (objetivo 65%). Sin cambios en código de producción, especificación ni umbral — sólo infraestructura de tests. De extremo a extremo: identificar brechas → añadir tests (RED → GREEN) → reejecutar `coverage:validate` → re-verificar M5.1 a PASS WITH WARNINGS → re-archivar.

## Alcance

**In** — añadir tests para ramas no cubiertas en `apps/api/test/transactions/` (principal: `transactions.controller.ts` al 0%) y otros ficheros de baja cobertura en `apps/api/test/`; elevar la cobertura de ramas de `apps/api` > 60% (objetivo 65%); reejecutar `tools/coverage-validator.ts` y verificar exit 0; reescribir el verify-report de M5.1 a PASS WITH WARNINGS y re-archivar.

**Out** — nuevas funcionalidades de producto; modificar el umbral de la especificación de observabilidad (60% queda como contrato); cambios de código de producción más allá de lo que los tests requieran; refactorizar tests existentes (solo AÑADIR); refactorizaciones entre paquetes.

## Capacidades

### Nuevas
- **Ninguna** — M5.1.1 eleva la cobertura de tests existente; no hay nuevos requisitos de especificación.

### Modificadas
- **Ninguna** — el umbral y el comportamiento quedan como se definen en la especificación de observabilidad.

## Enfoque

| PR | Alcance | LOC |
|---|---|---|
| #1 | Tests para ramas no cubiertas en `apps/api` (principalmente `transactions.controller.ts`); elevar cobertura de ramas de `apps/api` > 60% | ≤ 400 |
| #2 | Gate final; reescribir verify-report de M5.1 a PASS WITH WARNINGS; re-archivar | ≤ 400 |

PR #1 → `feat/m5.1.1-coverage-housekeeping` (cortado de `develop@92ddb06`); PR #2 → PR #1 según `feature-branch-chain`. TDD estricto: cada test aterriza como RED → GREEN → TRIANGULATE → REFACTOR en commits atómicos.

## Áreas afectadas

- `apps/api/test/transactions/` — nuevos tests para `transactions.controller.ts` (0% → ≥60% de ramas).
- `apps/api/test/` (otros ficheros de baja cobertura) — nuevos tests según el reporte de cobertura por paquete.
- verify-report de M5.1 + espejo ES — reescritos FAIL → PASS WITH WARNINGS.

## Riesgos

- **Medio**: `transactions.controller.ts` al 0% necesita cobertura extensiva. *Mitigación*: primero las ramas de mayor impacto; el validador aplica 60% (según especificación), 65% es solo objetivo.
- **Medio**: Los paquetes web/libs también tienen ramas sin cubrir. *Mitigación*: PR #1 = solo `apps/api`; web/libs → futura rebanada M5.1.2.
- **Bajo**: Los tests revelan bugs latentes (M3 PR #80). *Mitigación*: RED primero; si fallan, registrarlos como carry-forward de M5.1.1.
- **Bajo**: El umbral por paquete puede diferir del 60% global. *Mitigación*: fuera de alcance; enmienda M5.1.1a si se descubre.

## Plan de reversión

Ambos PRs se revierten limpiamente. Eliminar los tests añadidos restaura el estado de cobertura previo. Sin código de producción que revertir. `git revert <pr1-merge-sha>` y `git revert <pr2-merge-sha>`. M5.1 revierte a su veredicto FAIL previo si se revierte PR #2 — aceptable.

## Dependencias

Sin nuevas variables de entorno ni paquetes. Sin cambios de especificación. Requiere que el `tools/coverage-validator.ts` de M5.1 siga siendo el gate autoritativo.

## Criterios de éxito

- `pnpm turbo run test --coverage` → cobertura de ramas de `apps/api` > 60% (objetivo 65%).
- `NODE_ENV=test pnpm coverage:validate` → exit 0; sin regresiones de tests.
- Verify-report de M5.1 reescrito a PASS WITH WARNINGS; re-archivado con veredicto PASS.
- 2 PRs encadenados ≤ 400 LOC cada uno; espejo ES en `Documents-es/` con 0 CJK.
- `pnpm turbo run build lint typecheck test bdd` exit 0.

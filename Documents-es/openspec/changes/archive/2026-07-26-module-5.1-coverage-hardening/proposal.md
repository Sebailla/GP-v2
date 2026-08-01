# Propuesta: M5.1 — Hardening de Cobertura

## Intención

M5.1 cierra los 3 WARNINGs de arrastre del verify-report de M5: (1) aplicación del umbral de cobertura incompleta en Vitest v4.1.9 (API branch 55.15% mientras `test --coverage` sale 0); (2) test de timing de bcrypt cost-12 sensible a carga de CPU e instrumentación; (3) instrumentación de cobertura expone race en test de rate-limit. Entrega vertical: upgrade Vitest v4.2+ + ampliación del budget de timing + estabilización de race + nota en runbook. Sin cambios en código de producción.

## Alcance

**Dentro** — upgrade Vitest v4.2+ en 6 paquetes; verificación del exit code por umbral (fallback: `tools/coverage-validator.ts`); timing de bcrypt 500ms→1500ms; fix de race de rate-limit (serializar o contador único); entrada de runbook.

**Fuera** — features nuevas; security headers/CSP/secretos (AGENTS.md §11); cambios al valor del umbral (se mantiene 60%); refactors de infraestructura de tests.

## Capacidades

### Modificadas
- `observability` (introducida en M5): +2 requirements — `Coverage Threshold Process Exit Code Enforcement` (el proceso DEBE salir no-cero cuando cualquier paquete esté <60% incluso sin fallos de tests) y `Bcrypt Cost-12 Timing Stability Under Instrumentation` (budget se amplía a 1500ms bajo cobertura; documenta el override de run-config).

## Enfoque

| PR | Alcance | LOC |
|---|---|---|
| #1 | Upgrade Vitest v4.1.9→v4.2+ + verificación del exit code por umbral + fix de race de rate-limit | ≤400 |
| #2 | Ampliación del budget de timing de bcrypt + nota en runbook | ≤400 |

PR #1 → `feat/m5.1-coverage-hardening` (cortado desde `develop@4afb18d`); PR #2 → rama del PR #1 según `feature-branch-chain`.

## Áreas Afectadas

- `package.json` (raíz + 6) — bumps de vitest + @vitest/coverage-v8.
- `vitest.config.ts` por paquete — verificar aplicación del umbral.
- `apps/api/test/auth-hash.bcrypt.test.ts` — ampliación del budget de timing.
- `apps/api/test/rate-limit.e2e-spec.ts` — estabilización de race.
- `tools/coverage-validator.ts` (nuevo) — comparador post-coverage de fallback.
- `docs/operations/audit-retention-runbook.md` + espejo ES — nota de instrumentación.
- `openspec/specs/observability/spec.md` — +2 requirements, +6 escenarios.

## Riesgos

- **Alta**: Vitest v4.2+ rompe tests existentes (NEXTAUTH, Prisma, jest-dom). *Mitigación*: upgrade aislado en PR #1; fallback a v4.1.9 + comparador custom.
- **Media**: Vitest v4.2+ sigue sin salir no-cero al violar el umbral. *Mitigación*: `tools/coverage-validator.ts` parsea `coverage-summary.json`.
- **Media**: Budget más amplio de bcrypt oculta regresiones reales. *Mitigación*: loguear timing en CI.
- **Baja**: Serialización de rate-limit vuelve más lenta la suite. *Mitigación*: serializar solo el test afectado.
- **Baja**: La línea base de cobertura cambia. *Mitigación*: documentar la nueva línea base.

## Plan de Rollback

PR #1: revertir bumps de Vitest. PR #2: revertir commit de budget + runbook. Ambos con `git revert`. Sin código de producción tocado.

## Dependencias

- `vitest` v4.2.x+ (NPM al apply).
- `@vitest/coverage-v8` compatible.
- Sin variables de entorno nuevas.

## Criterios de Éxito

- [ ] `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` → exit 0.
- [ ] `pnpm turbo run test --coverage` → exit 0, todos los paquetes ≥60%.
- [ ] **Crítico**: paquete forzado <60% → test de cobertura FALLA exit 1.
- [ ] Test de timing de bcrypt pasa dentro de 1500ms bajo cobertura.
- [ ] Race de rate-limit ausente en 3 corridas consecutivas.
- [ ] 0 cambios en código de producción.
- [ ] Espejo en español en `Documents-es/` con 0 CJK.
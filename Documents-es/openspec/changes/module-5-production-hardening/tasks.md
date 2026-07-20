# Tareas: Endurecimiento de producción del módulo 5

## Pronóstico de carga de revisión

| Campo | Valor |
|-------|-------|
| Líneas estimadas modificadas | ~1500-2500 (28 archivos, 5 PR) |
| Riesgo de presupuesto 400 líneas | Alto |
| PR encadenados recomendados | Sí |
| División sugerida | #1 BCRYPT → #2 F2 → #3 disyuntor → #4 cobertura+métricas → #5 especificación+docs+gate |
| Estrategia de entrega | auto-chain |
| Estrategia de cadena | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Bases PR: #1=`feat/hardening`; #2=#1; #3=#2; #4=#3; #5=#4 → `develop`. Amenaza→RED: Cobertura 4.5; PII 4.7; F2 2.1–2.3; BCRYPT 1.3; clamp 5.1. Shell/VCS N/A.

### Fase 1 — BCRYPT (PR #1)

Verificar `NODE_ENV=test pnpm --filter @core/config test && pnpm --filter @features/auth test`.

- [x] 1.1 RED `apps/api/test/env.bcrypt-cost-override.test.ts`: env `BCRYPT_COST_FACTOR_OVERRIDE` parsea 12/14/4; rechaza 0,-1,3,"abc".
- [x] 1.2 GREEN `libs/core/config/env.schema.ts`: agregar `BCRYPT_COST_FACTOR_OVERRIDE: z.coerce.number().int().min(4).optional()`; `.env.example`.
- [x] 1.3 RED `apps/api/test/auth-hash.bcrypt.test.ts`: 12 por defecto <500ms; override 14 a costo 14 (verificar salt).
- [x] 1.4 GREEN `libs/features/auth/server/src/{auth-service,password-reset.service}.ts`: `bcrypt.hash(p, env.BCRYPT_COST_FACTOR_OVERRIDE ?? BCRYPT_COST_FACTOR)`; `constants.ts:BCRYPT_COST_FACTOR=12`.
- [x] 1.5 RED mismo test: modo test costo 4; 10 logins <2s.
- [x] 1.6 GREEN mantener `BCRYPT_COST_FACTOR=12`; documentar override permite valores menores en test.
- [x] 1.7 Espejo ES `Documents-es/.../tasks.md`; grep CJK vacío.

### Fase 2 — Serializable F2 (PR #2)

Verificar `NODE_ENV=test pnpm --filter @features/auth test && pnpm --filter api test`.

- [x] 2.1 RED `apps/api/test/rbac-serializable.test.ts`: carrera sobre últimos 2 admins → una 200, otra 409 `LastAdminError`.
- [x] 2.2 RED `apps/api/test/rbac-serializable-retry.test.ts`: 40001 transitorio en 1ª → reintento en 2ª.
- [x] 2.3 RED `apps/api/test/rbac-serializable-exhausted.test.ts`: 3×40001 → 503 + cuerpo localizado `serialization_failed`.
- [x] 2.4 GREEN `libs/features/auth/server/src/rbac-service.ts`: `prisma.$transaction(w, { isolationLevel: Serializable })`; revalidar admins DENTRO de tx; reintentar 40001/P2034 50ms×2^intento, máximo 3.
- [x] 2.5 RED `apps/api/test/rbac-serializable-concurrency.test.ts`: `Promise.all`; una gana.
- [x] 2.6 GREEN mapear `P2034`→409/503; i18n en `apps/web/messages/{en,es}.json`.

### Fase 3 — Rendimiento del disyuntor (PR #3)

Verificar `NODE_ENV=test pnpm --filter @features/auth test`.

- [ ] 3.1 RED `apps/api/test/session-service.breaker.test.ts`: caché caliente <60s; miss dispara `listActive`.
- [ ] 3.2 GREEN `libs/features/auth/server/src/session-service.ts`: `Map<userId,{count,ts}>` TTL 60s = `LAST_ACTIVE_AT_COALESCE_WINDOW_MS`.
- [ ] 3.3 RED `apps/api/test/session-service.breaker-perf.test.ts`: 100 secuenciales `getCurrentUser` con caché caliente → spy=0 `listActive`.
- [ ] 3.4 GREEN evicción por TTL; prueba afirma acierto y luego miss.
- [ ] 3.5 RED `apps/api/test/session-service.breaker-race.test.ts`: concurrentes `getCurrentUser` sin estampida (single-flight).
- [ ] 3.6 GREEN si no hay single-flight, documentar estampida acotada en JSDoc.

### Fase 4 — Cobertura + Métricas (PR #4)

Verificar `NODE_ENV=test pnpm turbo run test && pnpm turbo run build lint typecheck test bdd && pnpm turbo run test --coverage`.

- [ ] 4.1 RED `apps/api/test/observability-metrics.test.ts`: incrementos aumentan el Counter correcto (`authLoginSuccessTotal`, `authLoginFailureTotal{reason,email_domain}`, `authAdminOperationTotal{operation,actor_role}`).
- [ ] 4.2 GREEN `apps/api/src/modules/metrics/registry.ts`: 7 Counters (`auth_login_success_total`, `auth_login_failure_total`, `auth_password_reset_requested_total`, `auth_password_reset_completed_total`, `auth_admin_operation_total`, `auth_session_validations_total`, `auth_session_validations_failed_total`).
- [ ] 4.3 RED `apps/api/test/metrics.e2e-spec.ts`: tras login+admin+sesión, `GET /metrics` retorna los contadores.
- [ ] 4.4 GREEN `apps/api/src/modules/auth/{auth,admin}.controller.ts`: incrementar éxito/fallo; pino `[email]`+`[ip]` redactados; sin PII en etiquetas.
- [ ] 4.5 RED `apps/api/test/coverage-gate.test.ts`: 65% pasa; 50% falla.
- [ ] 4.6 GREEN `turbo.json` agregar `coverage.disabled` a `env`; por paquete `vitest.config.ts` `thresholds.global.{lines,branches,functions,statements}=60` (apps/api, apps/web, libs/features/auth/server, libs/core/{database,logging,rate-limit}).
- [ ] 4.7 RED `apps/api/test/observability-pii.test.ts`: sin `@`; sin `ip_address`; sin UUID.
- [ ] 4.8 GREEN `libs/features/auth/server/src/audit.service.ts`: incrementos en 8 endpoints admin (list_users, change_role, list_sessions, revoke_session, revoke_all_sessions, list_audit, purge_audit_dry_run, purge_audit_real).

### Fase 5 — Clamp + Runbook + Gate (PR #5)

Verificar `NODE_ENV=test pnpm turbo run build lint typecheck test bdd && pnpm lint:fixtures && NODE_ENV=test pnpm turbo run test --coverage`.

- [ ] 5.1 RED `libs/shared/schemas/__tests__/audit.schemas.test.ts`: `?limit=500` aceptado (Zod max=500); controlador limita 200.
- [ ] 5.2 GREEN `libs/features/auth/shared/schemas/audit.schemas.ts`: `.max(200)`→`.max(500)`; `admin.controller.ts:listAuditEvents` agrega `Math.min(parsed.limit, 200)` en `take`.
- [ ] 5.3 RED `apps/api/test/runbook-paths.test.ts`: runbook referencia `audit-retention.cron.ts`; grep coincide con `AuditRetentionSchedule`.
- [ ] 5.4 GREEN `docs/operations/audit-retention-runbook.md`+`Documents-es/...`: rutas (159, 396); grep (281).
- [ ] 5.5 RED `apps/web/__tests__/audit-log-table-i18n.test.ts`: encabezado "IP (HMAC, first 8 chars)" / "IP (HMAC, primeros 8 caracteres)".
- [ ] 5.6 GREEN `apps/web/messages/{en,es}.json`: renombrar encabezado; actualizar `AuditLogTable.tsx` si ref directa.
- [ ] 5.7 RED `apps/api/test/coverage-final.test.ts`: ≥60% por paquete; CI falla si baja.
- [ ] 5.8 GREEN `coverage.disabled=false` se aplica; `.env.example` documenta escape.
- [ ] 5.9 Espejo ES; verificar 0 CJK.
- [ ] 5.10 Gate final: `pnpm turbo run build lint typecheck test bdd` + `pnpm lint:fixtures` + `pnpm turbo run test --coverage` sale con código 0.

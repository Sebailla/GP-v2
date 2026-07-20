# Tareas: Módulo 4 Privacidad

## Pronóstico de Carga de Revisión

| Campo | Valor |
|-------|-------|
| Líneas estimadas modificadas | ~1200-2000 (28 archivos, 4 PR) |
| Riesgo de presupuesto 400 líneas | Alto |
| PRs encadenados recomendados | Sí |
| División sugerida | PR #1 esquema → PR #2 API auditoría + retención → PR #3 UI web → PR #4 BDD+runbook |
| Estrategia de entrega | auto-chain |
| Estrategia de cadena | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Unidades de Trabajo Sugeridas

| Unidad | Objetivo | PR probable | Comando de prueba focalizado | Entorno de ejecución | Límite de rollback |
|--------|----------|-------------|------------------------------|------------------------|---------------------|
| 1 | Columna Session.lastActiveAt, índice, env, coalesce + proyección de listado en SessionService | PR #1 | `pnpm --filter @core/database test && pnpm --filter @features/auth test` | Vitest NestJS | Revertir migración + cambios en SessionService; ningún endpoint de auditoría tocado |
| 2 | AuditService findMany/purge, /admin/audit + /admin/audit/purge, cron de retención, env | PR #2 | `NODE_ENV=test pnpm --filter api test` | NestJS e2e supertest | Desactivar cron con `AUDIT_RETENTION_ENABLED=false`; revertir endpoints |
| 3 | Wrappers audit-api, página server, UI filter/table/retention, mensajes EN/ES, axe | PR #3 | `NODE_ENV=test pnpm --filter web test` | Playwright en+es | Eliminar página; quitar enlace de nav; UI es aditiva |
| 4 | Feature BDD + step-defs, Playwright vertical, runbook EN+ES, compuerta final | PR #4 | `NODE_ENV=test pnpm turbo run build lint typecheck test bdd && pnpm lint:fixtures` | Playwright + Cucumber | Revertir runbook; BDD permanece como documentación |

Bases de PR: #1 = `feat/privacy` (tracker); #2 = #1; #3 = #2; #4 = #3. Merge final a `develop` después de los 4 aprobados.

## Carry-forward + amenaza→RED

TDD estricto RED→GREEN→TRIANGULATE→REFACTOR; commits atómicos; pino `[email]` + `[ip]` entre corchetes; `next-auth/jwt#decode` try/catch; `.overrideProvider(TOKEN).useValue(InMemoryAdapter)`; alias next-intl + cond Turbopack; Playwright web + Vitest NestJS API e2e; límites ESLint; 5 estados de formulario + WCAG AA; espejo ES en el mismo commit, 0 CJK. Routing (endpoints auditoría) + Configuration (AUDIT_RETENTION_DAYS) + PII (ipAddress HMAC) + Retention (atomicidad deleteMany) — Aplicable según diseño §7. Shell/process N/A.

## Fase 1 — Esquema + SessionService (PR #1)

Base `feat/privacy`. Verificar `pnpm --filter @core/database test && pnpm --filter @features/auth test`.

- [ ] 1.1 RED prueba `schema.prisma`: añadir `Session.lastActiveAt DateTime?` + `@@index([lastActiveAt])`; asertar que la migración crea columna + índice.
- [ ] 1.2 GREEN actualizar `schema.prisma`; generar migración Prisma `add_session_last_active_at`.
- [ ] 1.3 RED `env-refine.audit-retention.test.ts`: AUDIT_RETENTION_DAYS parsea 0/30/90/-1/abc; AUDIT_RETENTION_ENABLED parsea true/false.
- [ ] 1.4 GREEN `env.schema.ts`: añadir `AUDIT_RETENTION_DAYS` (z.coerce.number.int.min(0).default(90)) + `AUDIT_RETENTION_ENABLED` (z.coerce.boolean.default(false)); `.env.example` documenta.
- [ ] 1.5 RED `session-service.last-active-at.test.ts`: validateSession sobre sesión con `lastActiveAt < now-60s` escribe `now()`; dentro de 60s coalesce; sesión nueva (`lastActiveAt IS NULL`) escribe.
- [ ] 1.6 GREEN extender `SessionService.validateSession` con escritura coalesced (patrón D1: `where: { id, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }] }`).
- [ ] 1.7 RED `session-service.list-projection.test.ts`: list devuelve proyección spec-literal de 6 campos; orderBy `lastActiveAt DESC`; `lastActiveAt IS NULL` ordena al final.
- [ ] 1.8 GREEN actualizar proyección de `SessionService.list` a spec-literal `{ id, userId, createdAt, lastActiveAt, userAgent, ipAddress }`; orderBy.
- [ ] 1.9 ES mirror `Documents-es/.../tasks.md`; verificar 0 CJK.

## Fase 2 — Audit API + Retención (PR #2)

Base PR #1. Verificar `NODE_ENV=test pnpm --filter api test && pnpm --filter @features/auth test`.

- [ ] 2.1 RED `audit.schemas.test.ts` (boundary): ListAuditQuerySchema (actorId/targetId/action/since/until/limit/offset; max limit 200); PurgeAuditBodySchema (dryRun + olderThanDays ≥ 1).
- [ ] 2.2 GREEN crear `libs/features/auth/shared/schemas/audit.schemas.ts`; exportar desde index.
- [ ] 2.3 RED `audit-service.find-many.test.ts`: 8 combinaciones de filtros (actorId, targetId, action, since, until, all, none, multi); paginación; coerción Zod.
- [ ] 2.4 GREEN extender `AuditService.findMany({ actorId?, targetId?, action?, since?, until?, limit?, offset? })` (D3); asertar construcción dinámica de `where`.
- [ ] 2.5 RED `audit-service.purge.test.ts`: countOlderThan devuelve cuenta coincidente; purgeOlderThan elimina filas coincidentes; idempotente en segunda llamada; deleteMany es atómico (una sola llamada sin importar el conteo).
- [ ] 2.6 GREEN extender `AuditService` con `countOlderThan(days)` + `purgeOlderThan(days)` (D4).
- [ ] 2.7 RED `audit.controller.test.ts` (NestJS e2e): GET /admin/audit 4 endpoints × happy + edge + error + 403; POST /admin/audit/purge dry-run + real + idempotente + 403.
- [ ] 2.8 GREEN extender `AdminController` con GET /admin/audit + POST /admin/audit/purge (D4 modo dual); actualizar proyección revokeSession a spec-literal (D7).
- [ ] 2.9 RED `audit-retention.cron.test.ts`: cuando `AUDIT_RETENTION_ENABLED=true` el cron llama `auditService.purgeOlderThan(days)`; cuando false, no-op; lee variable de entorno `AUDIT_RETENTION_DAYS`.
- [ ] 2.10 GREEN `libs/features/auth/server/src/audit-retention.cron.ts` con `@Cron('0 3 * * *')` (D2); registrar en `AdminModule` detrás de flag de env.
- [ ] 2.11 TRIANGULATE audit findMany con caso borde: enum action no coincide (admin envía `action=GOD`) → Zod 400; `limit=999` muy grande → reducido a 200.

## Fase 3 — Web UI + i18n (PR #3)

Base PR #2. Verificar `NODE_ENV=test pnpm --filter web test`.

- [ ] 3.1 RED `audit-api.test.ts`: los 3 wrappers (`listAdminAuditEvents`, `dryRunPurgeAuditEvents`, `purgeAuditEvents`) envían `Authorization: Bearer <token>` (patrón M3 JD-1); parámetros URL codificados correctamente.
- [ ] 3.2 GREEN `apps/web/lib/audit-api.ts` con 3 wrappers; `authHeader()` devuelve token Bearer.
- [ ] 3.3 RED `audit-page.test.tsx`: server component obtiene eventos de auditoría + renderiza tabla; barra de filtros con 4 inputs; controles de paginación; botones dry-run + purge real; 5 estados de formulario según AGENTS.md §9.
- [ ] 3.4 GREEN `apps/web/app/[locale]/(app)/admin/audit/page.tsx` server component; `AuditFilterBar` client component; `AuditLogTable` client component; `AuditRetentionButton` client component.
- [ ] 3.5 GREEN `apps/web/messages/{en,es}.json`: añadir claves `admin.audit.*` (title, filters, columns, dryRun, purge, confirm, errors).
- [ ] 3.6 RED `audit-filter-bar.test.tsx`: inputs de filtro se enlazan a params URL; submit dispara fetch.
- [ ] 3.7 RED `audit-retention-button.test.tsx`: botón dry-run muestra conteo coincidente; botón real muestra diálogo de confirmación; ambos cumplen contrato de 5 estados.
- [ ] 3.8 RED axe-core: `apps/web/e2e/auth/audit.a11y.spec.ts` auditoría por superficie; asertar 0 serious/critical.
- [ ] 3.9 TRIANGULATE página audit: estado vacío (sin eventos) muestra CTA; estado success tras aplicar filtro muestra confirmación localizada; estado error en 401/403/500 muestra copy apropiado.

## Fase 4 — BDD + Runbook + Compuerta Final (PR #4)

Base PR #3. Verificar `NODE_ENV=test pnpm turbo run build lint typecheck test bdd && pnpm lint:fixtures`.

- [ ] 4.1 RED Cucumber `audit-flow.feature`: admin login → /en/admin/audit → listar eventos → filtrar por actorId → ver propia fila REVOKE_SESSION → dry-run purge con olderThanDays=1 → purge real con olderThanDays=90 → verificar eliminación.
- [ ] 4.2 GREEN step-defs `libs/features/auth/docs/step-defs/audit.steps.ts` cubriendo todos los escenarios.
- [ ] 4.3 RED Playwright `audit.spec.ts` (proyectos en + es) mismo escenario vertical.
- [ ] 4.4 GREEN `apps/web/e2e/auth/audit.spec.ts`; `page.route()` mockea los 2 endpoints admin audit.
- [ ] 4.5 RED borrador `docs/operations/audit-retention-runbook.md`: cómo invocar purge manualmente, dry-run vs real, rationale de política de retención, explicación de redacción de IP, notas de carry-forward M3.
- [ ] 4.6 GREEN runbook completo; verificado contra staging; `docs/operations/audit-retention-runbook.md` + espejo ES commiteados en el mismo commit atómico.
- [ ] 4.7 ES mirror `Documents-es/docs/operations/audit-retention-runbook.md`; verificar 0 CJK.
- [ ] 4.8 Compuerta final: `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` + `NODE_ENV=test pnpm lint:fixtures` exit 0.

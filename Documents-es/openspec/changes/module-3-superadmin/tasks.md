# Tareas: `module-3-superadmin`

## Pronóstico de Carga de Revisión

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Estimado ~1500-2500 LOC (35 archivos, 5 PRs). Riesgo de presupuesto de 400 líneas **Alto**. PRs encadenados recomendados **Sí**. División: PR #1 esquema → PR #2 servicios → PR #3 controlador → PR #4 UI → PR #5 BDD+e2e+runbook. Entrega `auto-chain`; estrategia de cadena `feature-branch-chain`. Bases de PR: #1 = `feat/superadmin`; #2 = #1; #3 = #2; #4 = #3; #5 = #4. Fusión final a `develop` tras la aprobación de los 5.

### Unidades de Trabajo

| # | Objetivo | PR | Comando de prueba | Entorno | Rollback |
|---|----------|----|--------------------|---------|----------|
| 1 | Esquema+migración+RbacService+Zod | #1 | `pnpm --filter @core/database test` | Vitest Prisma en memoria | Revertir migración; sin pérdida de datos |
| 2 | SessionService.revoke/revokeAll+audit+eventos | #2 | `pnpm --filter @features/auth test` | Vitest Prisma en memoria | Revertir servicios; eventos sin usar |
| 3 | AdminController+AdminGuard+kill-switch | #3 | `pnpm --filter api test test/admin.e2e-spec.ts` | NestJS+supertest | Revertir controlador+guard; rutas 404 |
| 4 | Páginas web+middleware+5 estados+axe-core | #4 | `pnpm --filter web test && e2e admin.a11y.spec.ts` | Playwright+Vitest | Revertir páginas+middleware; (app) intacto |
| 5 | BDD+Playwright e2e vertical+runbook+ES | #5 | `pnpm turbo run bdd e2e && lint:fixtures` | Cucumber+Playwright en/es | Revertir docs; código intacto |

## Carry-forward + amenaza→RED

TDD estricto RED→GREEN→TRIANGULATE→REFACTOR; commits atómicos; pino `[email]`+`[ip]`; `next-auth/jwt#decode` try/catch; `.overrideProvider(TOKEN).useValue(InMemoryAdapter)`; alias next-intl + condicional Turbopack; Playwright web + Vitest NestJS API e2e; reglas de frontera ESLint; 5 estados de formulario + WCAG AA; espejo ES en el mismo commit, 0 CJK. Enrutamiento + Configuración + manejo de IP (Aplicable según diseño §7) → RED en Fases 3 + 4 + 5.

## Fase 1 — Esquema + Migración + RbacService (PR #1)

Base `feat/superadmin`. Verificar `pnpm --filter @core/database test`.

- [x] 1.1 RED prueba `schema.prisma`: añadir modelo `AdminAuditEvent` + `Session.metadata Json?`; afirmar que la migración crea la tabla.
- [x] 1.2 GREEN actualizar `schema.prisma`; generar migración Prisma `add_admin_audit_event`.
- [x] 1.3 RED `rbac-service.admin.test.ts`: `listUsers({limit, offset})` + `changeRole(userId, newRole)` + `assertAdmin(userId)`; afirmar `metadata.from/to` en cambio de rol.
- [x] 1.4 GREEN extender `RbacService` con los 3 métodos; emitir evento `auth.role.changed` con `{actorId, targetUserId, fromRole, toRole}`.
- [x] 1.5 RED fixture de frontera Zod: `ListUsersQuerySchema`, `ChangeRoleBodySchema`, `ListSessionsQuerySchema`; afirmar que el enum de rol acepta solo "USER" | "ADMIN".
- [x] 1.6 GREEN crear `libs/features/auth/shared/schemas/admin.schemas.ts`; exportar desde `index.ts`.
- [x] 1.7 `libs/core/config/env.schema.ts`: añadir `ADMIN_ENABLED: z.coerce.boolean().default(true)`; refinar en productionEnvSchema (opcional, nunca requerido).
- [x] 1.8 Espejo ES `Documents-es/.../tasks.md`; verificar 0 CJK.

## Fase 2 — SessionService + AuthEvents (PR #2)

Base PR #1. Verificar `pnpm --filter @features/auth test`.

- [ ] 2.1 RED `session-service.admin.test.ts`: `list(userId)` retorna array ordenado `lastActiveAt DESC`; `revoke(sessionId)` borra fila + emite evento `auth.session.revoked` con payload `{actorId, targetUserId, sessionId, ipAddress, userAgent}`; `revokeAll(userId)` borra todas + emite evento con `count` en metadata.
- [ ] 2.2 GREEN extender `SessionService` con `list`, `revoke`, `revokeAll`; emitir evento `auth.session.revoked` en cada uno.
- [ ] 2.3 RED `auth.events.test.ts`: afirmar tipo `auth.session.revoked` registrado en unión `AUTH_EVENTS`.
- [ ] 2.4 GREEN añadir tipos `auth.session.revoked` + `auth.role.changed` a `libs/features/auth/server/src/auth.events.ts`.
- [ ] 2.5 REFACTOR extraer función pura `insertAuditEvent` a `libs/features/auth/server/src/audit.service.ts` (llamada por RbacService.changeRole + SessionService.revoke).

## Fase 3 — AdminController + Guards (PR #3)

Base PR #2. Verificar `NODE_ENV=test pnpm --filter api exec vitest run src/modules/auth/__tests__/admin*.test.ts && pnpm --filter api exec vitest run test/admin.e2e-spec.ts`.

- [ ] 3.1 RED `admin.controller.test.ts` (módulo de testing NestJS): 5 endpoints × happy + edge + error + 403 no-admin + 401 no autenticado.
- [ ] 3.2 GREEN `apps/api/src/modules/auth/admin.controller.ts` con 5 endpoints (GET /admin/users, POST /admin/users/:userId/role, GET /admin/sessions, DELETE /admin/sessions/:sessionId, DELETE /admin/sessions/user/:userId).
- [ ] 3.3 RED `admin.guard.spec.ts`: afirmar 403 cuando `req.user.role !== 'ADMIN'`; afirmar 401 sin token.
- [ ] 3.4 GREEN crear `AdminGuard` en `apps/api/src/shared/guards/admin.guard.ts`; lee `req.user.role` desde JwtAuthGuard.
- [ ] 3.5 GREEN aplicar `@UseGuards(JwtAuthGuard, AdminGuard)` a los 5 endpoints.
- [ ] 3.6 RED auto-revocación fija cookie: e2e afirma `Set-Cookie: authjs.session-token=; Path=/; Expires=...` en `DELETE /admin/sessions/<own-session-id>`.
- [ ] 3.7 RED redacción pino `[ip]`: `admin.controller.test.ts` fuerza una revocación, afirma que la línea pino capturada emite `ip: [REDACTED]` (según `pattern/pino-bracket-notation-redaction`).
- [ ] 3.8 GREEN cablear `AdminModule` en `auth.module.ts`; si `ADMIN_ENABLED=false`, el controlador lanza `NotFoundException` para todas las rutas (kill-switch según diseño).
- [ ] 3.9 **Enrutamiento RED** añadir a e2e admin: callbackUrl externo → 401; JWT expirado → 401; no-admin → 403.

## Fase 4 — UI Web + Middleware Guard (PR #4)

Base PR #3. Verificar `NODE_ENV=test pnpm --filter web test`.

- [ ] 4.1 RED `middleware.admin.test.ts`: no-admin visita `/en/admin/users` → redirige a `/en/(app)`; no autenticado → redirige a `/en/sign-in`; admin → continúa.
- [ ] 4.2 GREEN extender `apps/web/middleware.ts` con pre-check `/admin/*`; redirigir no-admin a `/{locale}/(app)` + flash.
- [ ] 4.3 RED `admin.users.page.test.tsx` + `admin.sessions.page.test.tsx`: 5 estados de formulario según AGENTS.md §9 (loading, error, success, empty, validation-error); validación de formulario de cambio de rol; botones de revocación (individual + todas).
- [ ] 4.4 GREEN crear `/[locale]/(app)/admin/{users,sessions}/page.tsx` server components; crear `/[locale]/(app)/admin/users/[userId]/page.tsx` página de detalle de usuario.
- [ ] 4.5 GREEN crear client components `UsersTable`, `SessionsTable`, `AdminNav` con 5 estados de formulario.
- [ ] 4.6 GREEN `apps/web/messages/{en,es}.json`: añadir claves `admin.*` (títulos, secciones, errores, mensajes de éxito).
- [ ] 4.7 RED axe-core: `apps/web/e2e/auth/admin.a11y.spec.ts` auditoría por superficie (lista de usuarios, detalle de usuario, lista de sesiones); afirmar 0 serious/critical.
- [ ] 4.8 TRIANGULATE nav admin: estado vacío (sin usuarios) muestra CTA + copy de ayuda; estado de éxito tras cambio de rol muestra confirmación localizada.

## Fase 5 — BDD + Runbook + E2E Vertical (PR #5)

Base PR #4. Verificar `NODE_ENV=test pnpm turbo run bdd e2e && pnpm lint:fixtures`.

- [ ] 5.1 RED Cucumber `admin-flow.feature`: login admin → listar usuarios → cambiar rol → listar sesiones → revocar individual → revocar todas → redirección no-admin.
- [ ] 5.2 GREEN step-defs `libs/features/auth/docs/step-defs/admin.steps.ts` cubriendo los 7 escenarios.
- [ ] 5.3 RED Playwright `admin.spec.ts` mismo escenario vertical para proyectos `en` + `es`.
- [ ] 5.4 GREEN `apps/web/e2e/auth/admin.spec.ts`; `page.route()` mockea los 5 endpoints admin.
- [ ] 5.5 RED borrador `docs/operations/admin-runbook.md`: onboarding admin, procedimiento de asignación de rol, revocación de emergencia, ejemplos de consulta de auditoría, retención (diferido a M4).
- [ ] 5.6 GREEN runbook completo; verificado contra staging.
- [ ] 5.7 Espejo ES `Documents-es/docs/operations/admin-runbook.md`; verificar 0 CJK en todos los docs de M3.
- [ ] 5.8 Compuerta final: `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` + `NODE_ENV=test pnpm lint:fixtures` exit 0.

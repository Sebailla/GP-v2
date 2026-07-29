# Diseño: `module-4-privacy`

Rastreador `feat/privacy` desde `develop@da79688`. 4 PR encadenados (≤400 LOC/PR), TDD estricto, rebanadas verticales. Solo aditivos, sin cambios incompatibles. Hereda los patrones de M2/M3 (redacción pino `[ip]`, try/catch en JWT decode, overrideProvider, división de Playwright, alias de next-intl, `pattern/ratelimit-test-isolation`, `NODE_ENV=test`).

## 1. Enfoque Técnico

M4 entrega la superficie de privacidad diferida de M3. El servidor añade `Session.lastActiveAt` (anulable + índice) y una escritura coalescida de 60s en `SessionService.validateSession` (D1); `SessionService.list()` cambia el proxy `expires DESC` de M3 por `lastActiveAt DESC` (D7) y la proyección del controlador admin quita `sessionToken` en favor de la forma literal de 6 campos de la especificación. Nuevo `AuditService.findMany` (D3) + `countOlderThan` + `purgeOlderThan` + un cron de `@nestjs/schedule` a las 03:00 regulado por `AUDIT_RETENTION_ENABLED` (D2) que lee `AUDIT_RETENTION_DAYS` (D8, por defecto 90, `0` = interruptor de apagado). Nuevos `GET /admin/audit` + `POST /admin/audit/purge` (D4) extienden `AdminController`. La web añade `/[locale]/(app)/admin/audit/` con `AuditLogTable`, barra de filtros, botón de retención, mensajes EN/ES, axe limpio, y el layout admin `(app)` existente (D5) + el guard admin de `middleware.ts` se conservan. 4 PR encadenados según la propuesta: esquema + lastActiveAt (PR1), API de auditoría + retención (PR2), UI + BDD + e2e (PR3), runbook + espejo en español (PR4).

## 2. Decisiones de Arquitectura

| # | Decisión | Elección | Alternativas consideradas | Justificación |
|---|---|---|---|---|
| **D1** | Coalesce de escritura de `Session.lastActiveAt` | `prisma.session.update({ where: { id, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }] }, data: { lastActiveAt: now } })` a nivel de BD; conteo de filas `0` ⇒ coalesce | Throttle en memoria por worker (estado compartido, no sobrevive reinicio); `update` ingenuo (escribe por petición); race read-then-write | OR-en-where de Postgres es atómico; sin estado compartido; sobrevive reinicio y escala entre workers. Amplificación de escritura limitada a 1 update / 60s / sesión incluso con N workers concurrentes. |
| **D2** | Patrón de cron de retención | `@Cron('0 3 * * *')` en `AuditRetentionModule` lee `AUDIT_RETENTION_DAYS` y llama a `auditService.purgeOlderThan(days)`; regulado por `AUDIT_RETENTION_ENABLED=false` en dev/test | Cron externo (fuera del repo); `setInterval` (no testeable); cron horario | `@nestjs/schedule` es canónico, testeable vía `ScheduleModule.forRoot()` en el harness de test NestJS. 03:00 UTC mantiene las operaciones de retención fuera de la jornada del operador. La bandera de regulación honra la repetibilidad dev/test (AGENTS.md §10). |
| **D3** | Forma de filtros de consulta de auditoría | `?actorId=&targetId=&action=&since=&until=&limit=&offset=` (todos opcionales, `limit` fijado 1-200 por defecto 50, `offset` ≥ 0 por defecto 0); Prisma `where` se construye dinámicamente | Conjunto de filtros fijo; GraphQL; SQL crudo | Mapeo 1-a-1 a los escenarios de la espec. Prisma parametrizado → sin inyección SQL. `where` dinámico solo añade filtros presentes → plan más pequeño, sin predicado `null = null`. |
| **D4** | Endpoint de purga en modo dual | `POST /admin/audit/purge` con `{ dryRun: bool, olderThanDays: number }`; el controlador delega en `auditService.countOlderThan` (dry) o `purgeOlderThan` (real) | Dos endpoints (`/purge-preview` + `/purge-real`); superficie de acción admin separada | La espec. exige un único contrato; dry-run es consulta, real es borrado — mismo sobre de auth/rate-limit, mismo bucket `ADMIN_RATE_LIMIT`. Un solo endpoint reduce la superficie. |
| **D5** | Ubicación de ruta de UI de log de auditoría | Server component `/[locale]/(app)/admin/audit/page.tsx` + opcional `audit/[id]/page.tsx` para detalle de fila; hereda el guard servidor del layout `(app)/admin` (ya en su sitio) | Grupo `(admin)` autónomo; ruta solo cliente | La verificación `getSession()` + guard de rol del layout `(app)/admin` (M3 D1) es defensa en profundidad; `middleware.ts` corta los no autenticados/no admin antes del HTML. Reutilizar el grupo elimina trabajo duplicado de layout + navegación. |
| **D6** | Redacción de IP en respuestas de auditoría | El controlador mapea `ipAddress` → hex HMAC-SHA256 en minúsculas de 64 caracteres (M3 F4 vía `hashIpForAudit`); la UI nunca recibe la IP en crudo. Re-derivación forense: re-hashear la IP candidata con `env.JWT_SECRET` en el servidor | IP en texto plano en respuesta admin; SHA256 unidireccional (irreversible) | Literal de la espec.: "hex HMAC, NO IP en crudo". HMAC preserva determinismo → consultas forenses (`WHERE ipAddress = hashIpForAudit('1.2.3.4')`) siguen funcionando sin exponer la IP cruda a la UI incluso a administradores (protección PII). |
| **D7** | Obsolescencia de la proyección de sesión | M3 `{ id, userId, sessionToken, expires }` → literal de la espec. `{ id, userId, createdAt, lastActiveAt, userAgent, ipAddress }`. `sessionToken` ya no aparece en la respuesta admin | Añadir `createdAt`/`lastActiveAt`/`ipAddress` junto a campos de M3; nuevo endpoint `/v2` | La espec. exige exactamente 6 campos. `sessionToken` es solo interno (la cookie lo porta; el admin nunca lo necesita). Truncado de UA a 512 chars + IP como HMAC se aplican en la proyección del controlador. |
| **D8** | Contrato de env de retención de auditoría | `AUDIT_RETENTION_DAYS: z.coerce.number().int().min(0).default(90).optional()` + `AUDIT_RETENTION_ENABLED: z.coerce.boolean().default(false).optional()` | 90 hardcodeado; configuración por inquilino; tabla de config en BD | `0` = interruptor (sin auto-purga, operador ejecuta manualmente). `default(90)` mantiene dev/test ergonómico. `min(0)` de Zod rechaza negativos al arrancar. Coerce maneja string-de-env. |

## 3. Flujo de Datos

### 3.1 El admin lista eventos de auditoría con filtros

```
Navegador (rol=ADMIN)         AdminController (ADMIN + RateLimit)        AuditService             Postgres
       │                            │                                       │                       │
       ├──GET /admin/audit?         │                                       │                       │
       │  actorId=X&                │                                       │                       │
       │  action=REVOKE_SESSION─────►│                                       │                       │
       │                             ├──construye where Prisma (solo presentes)│                       │
       │                             ├──prisma.adminAuditEvent.findMany({   │                       │
       │                             │   where, orderBy:{createdAt:desc},   │                       │
       │                             │   take:limit, skip:offset })─────────┼──────────────────────►│
       │                             │◄──────────── filas (HMAC ip) ──────────┼───────────────────────┤
       │                             ├──mapea a proyección literal de la espec│                       │
       │                             │  (sin IP cruda — solo HMAC)            │                       │
       │◄──── 200 JSON [...] ────────┤                                       │                       │
```

### 3.2 Coalesce de Session.lastActiveAt en validateSession

```
Navegador → JwtAuthGuard → controller → SessionService.validateSession(token)
                                            │
                                            ├──sessionRepo.findByToken → Session
                                            ├──¿sesión expirada? → AuthError('SESSION_EXPIRED')
                                            ├──userRepo.findById(session.userId)
                                            │
                                            ├──cutoff = now - 60_000
                                            ├──await prisma.session.update({
                                            │    where: { id, OR: [
                                            │      { lastActiveAt: null },
                                            │      { lastActiveAt: { lt: cutoff } }
                                            │    ]},
                                            │    data: { lastActiveAt: now }
                                            │  })
                                            │  → count=0: coalesce (otro ganó, o fresco)
                                            │  → count=1: escritura exitosa
                                            │
                                            ├──retorna CurrentUser (idéntico en cualquier caso)
```

## 4. Cambios de Archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `libs/core/database/prisma/schema.prisma` | Modificar | Añadir `Session.lastActiveAt DateTime?` + `@@index([lastActiveAt])` |
| `libs/core/database/prisma/migrations/<ts>_session_last_active_at/` | Crear | Migración Prisma: columna anulable + índice |
| `libs/core/config/env.schema.ts` | Modificar | Añadir `AUDIT_RETENTION_DAYS` + `AUDIT_RETENTION_ENABLED` (D8) |
| `libs/features/auth/server/src/session-service.ts` | Modificar | Coalesce en `getCurrentUser` (D1); `list()` con ORDER BY `lastActiveAt DESC`; proyección de 6 campos (D7) |
| `libs/features/auth/server/src/audit.service.ts` | Modificar | Añadir `findMany` (D3), `countOlderThan`, `purgeOlderThan` (D4) |
| `libs/features/auth/server/src/audit-retention.cron.ts` | Crear | `@Cron('0 3 * * *')`; lee env; llama `purgeOlderThan`; regulado (D2) |
| `libs/features/auth/shared/schemas/audit.schemas.ts` | Crear | `AuditActionEnum`, `ListAuditQuerySchema`, `PurgeAuditBodySchema` |
| `libs/features/auth/shared/schemas/index.ts` | Modificar | Exportar esquemas de auditoría |
| `apps/api/src/modules/auth/admin.controller.ts` | Modificar | `GET /admin/audit` + `POST /admin/audit/purge` (D4); cambio de proyección en `listSessions` (D7) |
| `apps/api/src/modules/auth/admin.module.ts` | Modificar | Conectar `audit-retention.cron.ts` si `AUDIT_RETENTION_ENABLED === true` |
| `apps/api/.env.example` | Modificar | `AUDIT_RETENTION_DAYS=90` + `AUDIT_RETENTION_ENABLED=false` |
| `apps/api/test/audit.controller.test.ts` | Crear | Vitest: 2 endpoints × feliz + borde + 403 no-admin + aislamiento de rate-limit |
| `apps/api/test/audit-retention.test.ts` | Crear | Vitest: `countOlderThan` + `purgeOlderThan` idempotente + atómico |
| `libs/features/auth/server/src/__tests__/session-service.last-active-at.test.ts` | Crear | Unit: coalesce en `getCurrentUser` |
| `libs/features/auth/server/src/__tests__/audit-service.find-many.test.ts` | Crear | Unit: combinaciones de filtros + paginación + cap |
| `apps/web/app/[locale]/(app)/admin/audit/page.tsx` | Crear | Server component: llama `GET /admin/audit` con searchParams; renderiza `AuditLogTable` |
| `apps/web/app/[locale]/(app)/admin/audit/[id]/page.tsx` | Crear | Detalle de fila (JSON completo de metadata) |
| `apps/web/components/admin/AuditLogTable.tsx` | Crear | Cliente: 5 estados de formulario (loading/error/success/empty/validation-error) según AGENTS.md §9 |
| `apps/web/components/admin/AuditFilterBar.tsx` | Crear | Cliente: actorId/targetId/select action/since/until + paginación |
| `apps/web/components/admin/AuditRetentionButton.tsx` | Crear | Cliente: dry-run + purga real con diálogo de confirmación |
| `apps/web/components/admin/AdminNav.tsx` | Modificar | Añadir enlace "Audit log" |
| `apps/web/lib/audit-api.ts` | Crear | `listAdminAuditEvents`, `dryRunPurgeAuditEvents`, `purgeAuditEvents`; espeja `admin-api.ts` |
| `apps/web/messages/{en,es}.json` | Modificar | Claves `admin.audit.*` (título, filtros, columnas, dryRun, purge, confirm, errors) |
| `apps/web/e2e/auth/audit.spec.ts` | Crear | Playwright + proyectos en + es; `page.route()` mockea 2 endpoints |
| `apps/web/e2e/auth/audit.a11y.spec.ts` | Crear | `@axe-core/playwright` por superficie; 0 serious/critical |
| `libs/features/auth/docs/audit-flow.feature` | Crear | BDD: lista con filtros, dry-run, purga real, defaults del env de retención |
| `libs/features/auth/docs/step-defs/audit.steps.ts` | Crear | Definiciones de pasos |
| `docs/operations/audit-retention-runbook.md` | Crear | Runbook: dry-run vs real, redacción de IP, justificación de retención, arrastre de M3 |
| `Documents-es/docs/operations/audit-retention-runbook.md` | Crear | Espejo en español |
| `Documents-es/openspec/changes/module-4-privacy/design.md` | Crear | Espejo en español de este archivo |

## 5. Interfaces / Contratos

```ts
// libs/features/auth/shared/schemas/audit.schemas.ts
export const AuditActionEnum = z.enum(["REVOKE_SESSION", "REVOKE_ALL_SESSIONS", "CHANGE_ROLE"]);

export const ListAuditQuerySchema = z.object({
  actorId: z.string().uuid().optional(),
  targetId: z.string().uuid().optional(),
  action: AuditActionEnum.optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const PurgeAuditBodySchema = z.object({
  dryRun: z.coerce.boolean(),
  olderThanDays: z.coerce.number().int().min(1),
});
```

Contrato HTTP:

```
GET  /admin/audit?actorId=&targetId=&action=&since=&until=&limit=50&offset=0
     → 200 [{id, actorId, targetId, action, createdAt, metadata, ipAddress, userAgent}]
     → 400 consulta inválida (p. ej. action=invalid); 403 no-admin; 401 no autenticado

POST /admin/audit/purge  body: { dryRun: bool, olderThanDays: number }
     → 200 { matched, [wouldDelete | deleted] }  (la clave depende de dryRun)
     → 400 cuerpo inválido; 403 no-admin; 500 error de BD (atomicidad de deleteMany)
```

## 6. Estrategia de Pruebas

| Capa | Qué | Cómo |
|---|---|---|
| Unit | Coalesce de `SessionService` | Vitest; mock Prisma en memoria; assert 1 escritura / ventana 60s / sesión |
| Unit | Proyección de `SessionService.list` | Vitest; assert literal de la espec. de 6 campos + `lastActiveAt DESC` |
| Unit | Filtros `AuditService.findMany` | Vitest; 8 combinaciones de filtros |
| Unit | Atomicidad `AuditService.purgeOlderThan` | Vitest; mock `deleteMany`; idempotente en segunda llamada |
| Integración | `GET /admin/audit` con filtros | Vitest NestJS e2e + supertest |
| Integración | `POST /admin/audit/purge` dry + real | Vitest; `overrideProvider(RATE_LIMITER_TOKEN).useValue(InMemoryRateLimiter)` según `pattern/ratelimit-test-isolation` |
| Integración | Borde env `AUDIT_RETENTION_DAYS` | Vitest: 5 permutaciones (unset/0/30/-1/abc) |
| Integración | Migración `Session.lastActiveAt` | Vitest; assert columna + índice |
| E2E web | Render + filtro de página audit | Playwright en + es; `page.route()` mockea |
| E2E web | axe-core | `@axe-core/playwright`; 0 serious/critical |
| BDD | Escenarios de auditoría | Cucumber `audit-flow.feature` + step-defs |
| Cron | Disparo de `@Cron('0 3 * * *')` | Vitest NestJS e2e con `ScheduleModule.forRoot()` |

## 7. Matriz de Amenazas

| Frontera | Casos adversos mínimos | Aplicabilidad | Respuesta de diseño | Pruebas RED planeadas |
|---|---|---|---|---|
| Routing (audit admin) | actor externo; no-admin; JWT expirado; filtro faltante | Aplicable | `JwtAuthGuard + AdminGuard + RateLimitGuard`; división 401/403/400 | Vitest e2e: 401 + 403 + 400 |
| Configuración (`AUDIT_RETENTION_DAYS`) | unset; `0`; `-1`; `abc`; `99999` | Aplicable | Zod al arranque; defaults; `0`=interruptor; `min(0)` rechaza negativos | Vitest: 5 permutaciones |
| PII (visualización de `ipAddress`) | IP cruda nunca en respuesta; HMAC siempre | Aplicable | Controlador mapea HMAC vía `hashIpForAudit`; pino `[ip]` redact (arrastrado de M3 F4) | Vitest: `ipAddress` de respuesta coincide con patrón hex 64 chars, no crudo |
| Retención (destructiva) | doble purga idempotente; fallo parcial; race con lecturas | Aplicable | `deleteMany` atómico; cron + endpoint comparten misma fn | Vitest: idempotente + atomicidad + lector concurrente |
| Shell/proceso | N/A — sin subproceso | N/A | Ninguna | Ninguna |
| VCS/PR | N/A — sin automatización | N/A | Ninguna | Ninguna |

## 8. Migración / Despliegue

Sin cambios ROMPEDORES en el esquema de BD. `Session.lastActiveAt` es anulable (sin backfill). El nuevo endpoint de auditoría es aditivo. El cron de retención es OPT-IN (`AUDIT_RETENTION_ENABLED=false` en dev/test). Rollback: eliminar las 2 variables de entorno + revertir el cron; las filas de auditoría existentes se preservan. Cada PR encadenado es atómico (AGENTS.md §5) y mantiene `develop` en verde.

## 9. Preguntas Abiertas

Ninguna. Todas las decisiones de producto resueltas en la sección `## Decisiones de producto` de la propuesta (UI de log de auditoría + retención + `Session.lastActiveAt`).

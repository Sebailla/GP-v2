# Diseño: `module-3-superadmin`

Rastreador `feat/superadmin` desde `develop@03e252d`. 5 PR encadenados (≤400 LOC/PR), TDD estricto, rebanadas verticales. Solo aditivos, sin cambios incompatibles. Hereda los patrones de M2 (pino `[ip]`/`[email]`, JWT decode try/catch, overrideProvider, división de Playwright, alias de next-intl).

## 1. Enfoque Técnico

M3 entrega la superficie de administración sobre las primitivas de sesión+RBAC de M2. El servidor extiende `SessionService` (`list`/`revoke`/`revokeAll`) y `RbacService` (`listUsers`/`changeRole`/`assertAdmin`); añade la tabla `AdminAuditEvent` (solo anexar) y la columna `Session.metadata` (JSON, anulable). La API agrega un nuevo `AdminController` (5 endpoints bajo `/admin/*`) protegido por `JwtAuthGuard + AdminGuard`. El cliente web añade el grupo de rutas `/[locale]/(app)/admin/{users,sessions}/`, con `apps/web/middleware.ts` extendido para cortar las llamadas `/admin/*` de no administradores hacia `/{locale}/(app)`. 5 PR encadenados según la propuesta: esquema+migración, métodos de servicio + evento de auditoría, controlador + guards, páginas web + middleware, BDD+e2e+runbook.

## 2. Decisiones de Arquitectura

| # | Decisión | Elección | Alternativas consideradas | Justificación |
|---|---|---|---|---|
| **D1** | Patrón de guard admin | NestJS: `@UseGuards(JwtAuthGuard, AdminGuard)` por método; Web: comprobación previa en `middleware.ts` para `path.startsWith(\`/\${locale}/admin\`)` | Solo guard de layout en Next.js; redirección solo en cliente | El servidor es autoridad (R-PF-3 de M2); el cliente corta el flash de UI admin para mejor UX. Ambas capas las exige `nextauth-web-routes.spec.md` Admin Route Guard. |
| **D2** | Forma del evento de auditoría | Tabla separada `AdminAuditEvent` | Añadir columnas de auditoría a `Session`; anexar a `AuditLog` | La auditoría cubre cambios de rol (no acotados a sesión); la política de retención difiere (M4 Privacy); el patrón de escritura es solo anexar sin FK al ciclo de vida de la sesión. Reutilizar `AuditLog` de transactions enredaría el contrato PII de M3 con la auditoría tipada por entidad de M5. |
| **D3** | Punto de captura de IP + UA | Entrada del controlador: `req.ip` + `req.headers['user-agent']` ANTES de la llamada al servicio | Capa de servicio; interceptor NestJS | Los servicios quedan agnósticos a HTTP. La auditoría debe registrar la petición real que disparó la acción. `req.ip` respeta la configuración `trust proxy` de Express; UA se trunca a 512 caracteres en el límite del controlador. |
| **D4** | Cascada por cambio de rol | El JWT existente del objetivo sigue válido hasta el refresco; la web reconsulta el rol en cada render de página vía `getSession()` | Almacén de sesiones en servidor + invalidación de JWT; broadcast de invalidación de caché en cliente | Simple, sin almacén en servidor, la auditoría captura el cambio. Ventana peor caso 24h (alineada con M2 `SESSION_TTL_SECONDS`). NextAuth v5 ya relee `role` del JWT por petición en el lado API (M2 `jwt.guard.ts#toCurrentUser`). |
| **D5** | UX de auto-revocación | Permitir que el admin revoque su propia sesión; el servidor responde 204 + `Set-Cookie` que limpia el token; el cliente confirma con diálogo antes de invocar el endpoint | Prohibir la auto-revocación (la UI oculta el botón); permitir sin confirmación | UX estándar de "cerrar sesión en este dispositivo". Riesgo de bloqueo mitigado: el admin puede iniciar sesión vía Google o email/contraseña (M2). La confirmación del cliente evita el autobloqueo accidental desde la UI admin. |
| **D6** | Ubicación del grupo de rutas admin | `/[locale]/(app)/admin/*` (grupo de rutas bajo el `(app)` existente) | `/admin/*` de nivel superior fuera de `(app)`; grupo `(admin)` separado | El layout `(app)` ya exige `getSession() != null` (apps/web/app/[locale]/(app)/layout.tsx). Reutilizarlo elimina lógica de autenticación duplicada. El padre `(app)` ya entrega el segmento locale vía `params`. |
| **D7** | Retención de auditoría | Sin purga automática en M3; añadir `@@index([createdAt])`; documentar como trabajo posterior | Cron horario purgando >90d; sin índice | La política de retención es alcance de M4 Privacy. El índice soporta la futura consulta de purga. M3 entrega solo la tabla + el índice; sin trabajo. Documentado en el runbook como continuación para evitar expansión de alcance. |

## 3. Flujo de Datos

### 3.1 El admin lista sesiones de usuario

```
Navegador (rol=ADMIN)         apps/web/middleware.ts       AdminController (guard ADMIN)        SessionService          Postgres
       │                            │                              │                              │                      │
       ├──GET /en/admin/sessions────►│                              │                              │                      │
       │  ?userId=<uuid>             ├──auth().user.role==ADMIN     │                              │                      │
       │                             │  (continúa)                  │                              │                      │
       │                             ├──locale=es──────────────────►│                              │                      │
       │                             │  (reenvía)                   │                              │                      │
       │                             │                              ├──controller.listSessions      │                      │
       │                             │                              │  (userId, ip, ua)            │                      │
       │                             │                              ├──auditRevokeNone-requerido   │                      │
       │                             │                              │  (sin auditoría para GET)    │                      │
       │                             │                              ├──SELECT * FROM sessions──────┼─────────────────────►│
       │                             │                              │  WHERE user_id = $1          │                      │
       │                             │                              │  ORDER BY last_active_at DESC │                      │
       │                             │                              │◄─────── filas ───────────────┼──────────────────────┤
       │                             │                              ├──200 JSON [...sessions]      │                      │
       │◄─────── 200 HTML ────────────┤◄─────────────────────────────┤                              │                      │
       │     (página tabla sesiones)  │                              │                              │                      │
```

### 3.2 El admin revoca una sola sesión (con auditoría)

```
Navegador (rol=ADMIN)         AdminController                      SessionService                   Postgres                AdminAuditEvent
       │                            │                                   │                              │                          │
       ├──DELETE /admin/sessions/   │                                   │                              │                          │
       │       {sessionId}──────────►│                                   │                              │                          │
       │                             ├──assertAdmin(actorId)              │                              │                          │
       │                             │  (lanza 403 si no)                  │                              │                          │
       │                             ├──controller.revokeSession          │                              │                          │
       │                             │  (sessionId, ipAddress, ua)        │                              │                          │
       │                             ├──service.revoke(sessionId)        │                              │                          │
       │                             │                                   ├──DELETE FROM sessions        │                          │
       │                             │                                   │  WHERE id = $1──────────────┼──────────────────────►│
       │                             │                                   │◄── 1 fila borrada ──────────┼──────────────────────┤
       │                             ├──insertAuditEvent({                │                              │                          │
       │                             │   actorId,                         │                              │                          │
       │                             │   targetId: sessionId,              │                              │                          │
       │                             │   action: "REVOKE_SESSION",        │                              │                          │
       │                             │   ipAddress,                       │                              │                          │
       │                             │   userAgent,                       │                              │                          │
       │                             │   metadata: { targetUserId }       │                              │                          │
       │                             │ })────────────────────────────────┼──────────────────────────────┼────────────────────────►│
       │                             │                                   │                              │                          │
       │                             ├──Set-Cookie: authjs.session-token=│                              │                          │
       │                             │  ; Path=/; Expires=...              │                              │                          │
       │                             │  (solo si auto-revocación)         │                              │                          │
       │◄──── 204 No Content ────────┤                                   │                              │                          │
```

## 4. Cambios de Archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `libs/core/database/prisma/schema.prisma` | Modificar | Añadir `Session.metadata Json?`, añadir `model AdminAuditEvent { actorId, targetId, action enum, createdAt default now, metadata Json, ipAddress String?, userAgent String?, @@index([createdAt]) }` |
| `libs/core/database/prisma/migrations/<ts>_admin_audit/` | Crear | Migración Prisma: añadir tabla `AdminAuditEvent` + columna `Session.metadata` |
| `libs/features/auth/server/src/session-service.ts` | Modificar | Añadir métodos `list(userId, limit, offset)`, `revoke(sessionId, actorId, ip, ua)`, `revokeAll(userId, actorId, ip, ua)`; emitir evento `auth.session.revoked` en revoke |
| `libs/features/auth/server/src/rbac-service.ts` | Modificar | Añadir métodos `listUsers({limit, offset})`, `changeRole(userId, newRole, actorId, ip, ua)`, `assertAdmin(userId)` |
| `libs/features/auth/server/src/auth.events.ts` | Modificar | Añadir tipo de evento `auth.session.revoked` con payload `{ actorId, targetUserId, sessionId, ipAddress, userAgent }` (extender el existente) |
| `libs/features/auth/shared/schemas/admin.schemas.ts` | Crear | Zod: `ListUsersQuerySchema`, `ChangeRoleBodySchema`, `ListSessionsQuerySchema` |
| `libs/features/auth/shared/schemas/index.ts` | Modificar | Exportar nuevos esquemas |
| `apps/api/src/modules/auth/admin.controller.ts` | Crear | Controlador NestJS con 5 endpoints: `GET /admin/users`, `POST /admin/users/:userId/role`, `GET /admin/sessions`, `DELETE /admin/sessions/:sessionId`, `DELETE /admin/sessions/user/:userId` |
| `apps/api/src/modules/auth/admin.module.ts` | Crear | Módulo DI cableando `RbacService` + `SessionService` + `AuditService` (o en línea en el controlador) |
| `apps/api/src/modules/auth/auth.controller.ts` | Modificar | Sin cambios en endpoints existentes; los nuevos endpoints admin viven en `admin.controller.ts` |
| `apps/api/src/modules/auth/auth.module.ts` | Modificar | Importar `AdminModule` |
| `apps/api/src/shared/guards/admin.guard.ts` | Crear | `@UseGuards(JwtAuthGuard, AdminGuard)` — comprueba `req.user.role === 'ADMIN'` |
| `apps/api/src/shared/decorators/admin.decorator.ts` | Crear | Decorador `@AdminOnly()` que compone `UseGuards(JwtAuthGuard, AdminGuard)` |
| `apps/api/src/shared/guards/jwt.guard.ts` | Modificar | Verificar que `request.user.role` fluya desde el JWT (ya así en M2) |
| `apps/api/.env.example` | Modificar | Añadir `ADMIN_ENABLED=true` (por defecto; `false` desactiva las rutas admin) |
| `apps/api/test/admin.e2e-spec.ts` | Crear | Vitest e2e: 5 endpoints × feliz + borde + error + no-admin 403 |
| `libs/features/auth/server/src/__tests__/session-service.admin.test.ts` | Crear | Unidad: list/revoke/revokeAll |
| `libs/features/auth/server/src/__tests__/rbac-service.admin.test.ts` | Crear | Unidad: listUsers/changeRole/assertAdmin |
| `apps/web/app/[locale]/(app)/admin/layout.tsx` | Crear | Layout del grupo de rutas admin (hereda guard de `(app)`; añade nav admin) |
| `apps/web/app/[locale]/(app)/admin/users/page.tsx` | Crear | Página de lista de usuarios admin (componente servidor, llama a `GET /admin/users`) |
| `apps/web/app/[locale]/(app)/admin/users/[userId]/page.tsx` | Crear | Página de detalle de usuario con formulario de cambio de rol (llama a `POST /admin/users/:userId/role`) |
| `apps/web/app/[locale]/(app)/admin/sessions/page.tsx` | Crear | Página de lista de sesiones admin (llama a `GET /admin/sessions?userId=...`) |
| `apps/web/components/admin/UsersTable.tsx` | Crear | Componente cliente: 5 estados de formulario + formulario de cambio de rol |
| `apps/web/components/admin/SessionsTable.tsx` | Crear | Componente cliente: 5 estados de formulario + botones de revocación (individual + todas) |
| `apps/web/components/admin/AdminNav.tsx` | Crear | Navegación de nivel superior para páginas admin |
| `apps/web/middleware.ts` | Modificar | Añadir comprobación de rutas admin: `path.startsWith(\`/\${locale}/admin\`)` → comprobar `auth().user.role === 'ADMIN'`; redirigir a `/\${locale}/(app)` con flash si no |
| `apps/web/messages/en.json` | Modificar | Añadir claves `admin.*` (título, secciones, errores, éxito) |
| `apps/web/messages/es.json` | Modificar | Añadir equivalentes en español (español neutro/profesional) |
| `apps/web/e2e/auth/admin.spec.ts` | Crear | Playwright + axe-core: login admin → listar usuarios → cambiar rol → listar sesiones → revocar individual → revocar todas → redirección no-admin |
| `libs/features/auth/docs/admin-flow.feature` | Crear | BDD Cucumber: mismo escenario vertical que el e2e |
| `libs/features/auth/docs/step-defs/admin.steps.ts` | Crear | Definiciones de pasos para el flujo admin |
| `docs/operations/admin-runbook.md` | Crear | Runbook: alta de admin, procedimiento de asignación de rol, revocación de emergencia, ejemplos de consulta de auditoría, retención (aplazado a M4) |
| `Documents-es/docs/operations/admin-runbook.md` | Crear | Espejo en español |
| `Documents-es/openspec/changes/module-3-superadmin/design.md` | Crear | Espejo en español de este diseño (≤ 900 palabras, 0 CJK) |
| `openspec/changes/module-3-superadmin/design.md` | Crear | Este archivo |

## 5. Interfaces / Contratos

```ts
// libs/features/auth/shared/schemas/admin.schemas.ts

export const ListUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ChangeRoleBodySchema = z.object({
  role: z.enum(["USER", "ADMIN"]),
});

export const ListSessionsQuerySchema = z.object({
  userId: z.string().uuid(),
});

// Payloads de eventos (extender libs/features/auth/server/src/auth.events.ts)

export interface SessionRevokedEvent {
  readonly type: "auth.session.revoked";
  readonly payload: {
    readonly actorId: string;
    readonly targetUserId: string;
    readonly sessionId: string;
    readonly ipAddress: string | null;
    readonly userAgent: string | null;
    readonly count: number; // 1 para individual, N para revokeAll
  };
}

export interface AdminAuditEventRow {
  readonly id: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly action: "REVOKE_SESSION" | "REVOKE_ALL_SESSIONS" | "CHANGE_ROLE";
  readonly createdAt: Date;
  readonly metadata: Record<string, unknown>;
  readonly ipAddress: string | null; // ≤ 45 caracteres
  readonly userAgent: string | null; // ≤ 512 caracteres
}
```

Contrato HTTP:

```
GET    /admin/users?limit=50&offset=0
       → 200 [{id, email, role, createdAt}]
       → 403 si no-admin
       → 401 si no autenticado

POST   /admin/users/:userId/role
       body: {role: "USER"|"ADMIN"}
       → 200 {id, email, role}
       → 400 rol inválido
       → 403 no-admin
       → 404 usuario desconocido

GET    /admin/sessions?userId=<uuid>
       → 200 [{id, userId, createdAt, lastActiveAt, userAgent, ipAddress}]
       → 400 falta userId
       → 403 no-admin

DELETE /admin/sessions/:sessionId
       → 204 (con Set-Cookie de limpieza si auto-revocación)
       → 404 sesión desconocida
       → 403 no-admin

DELETE /admin/sessions/user/:userId
       → 204 (con Set-Cookie de limpieza si auto-revocación; revokedCount en metadata de auditoría)
       → 404 usuario desconocido
```

## 6. Estrategia de Pruebas

| Capa | Qué | Cómo |
|---|---|---|
| Unidad | `SessionService.list/revoke/revokeAll` | Vitest; mock Prisma en memoria (patrón M2) |
| Unidad | `RbacService.listUsers/changeRole/assertAdmin` | Vitest |
| Unidad | Esquemas Zod (`admin.schemas.ts`) | Fixture de límite Vitest (AGENTS.md §7) |
| Integración | Endpoints `AdminController` con `AdminGuard` | Vitest NestJS e2e; `.overrideProvider(RATE_LIMITER_TOKEN).useValue(new InMemoryRateLimiter())` por `pattern/ratelimit-test-isolation` |
| Integración | Inserción de fila de auditoría en cada operación admin | Vitest; aserto de fila creada con campos correctos |
| Integración | Auto-revocación establece cookie | Vitest supertest; aserto de cabecera `Set-Cookie` |
| Integración | Redacción de IP en logs pino | Vitest con sink pino (por `pattern/pino-bracket-notation-redaction`) |
| Integración | Modo de fallo de JWT decode para endpoints admin | Vitest supertest; token expirado/secreto incorrecto → 401 (por `pattern/nextauth-decode-try-catch`) |
| E2E web | Escenario vertical admin (Playwright en + es) | Playwright + `page.route()` para mocks API (por `pattern/playwright-per-project-webserver-not-supported`) |
| E2E web | axe-core en cada página admin | Playwright + `@axe-core/playwright`; 0 serio/crítico |
| BDD | Escenario vertical admin en Cucumber | `libs/features/auth/docs/admin-flow.feature` + step-defs |
| Manual | Recorrido del runbook | Operador ejecuta el runbook contra staging |
| Rate-limit | Rate-limit de nuevos endpoints admin | Vitest; 30 req / 60 s por actor admin (NO por IP, por `pattern/ratelimit-test-isolation`) |

## 7. Matriz de Amenazas

Según `references/threat-matrix.md`. Marcadas Aplicables/N/A con motivo.

| Frontera | Casos adversarios mínimos | Aplicabilidad | Respuesta de diseño | Pruebas RED planificadas |
|---|---|---|---|---|
| Enrutamiento (endpoints admin) | actor externo llama admin; token no-admin; token expirado; ADMIN_ENABLED=false | Aplicable | `JwtAuthGuard + AdminGuard`; 401 + 403 con copia genérica; `ADMIN_ENABLED=false` → 404 desde `AdminGuard` | Vitest e2e: 401 + 403 + 404 |
| Configuración | Toggle de entorno `ADMIN_ENABLED=false` | Aplicable | `AdminGuard` comprueba `env.ADMIN_ENABLED` primero; devuelve 404 para ocultar la superficie | Vitest: `ADMIN_ENABLED=false` → 404 |
| Manejo IP + UA | Spoofing de IP vía `X-Forwarded-For`; truncamiento UA > 512 | Aplicable | Usar `req.ip` de Express (respeta trust proxy); UA desde `req.headers['user-agent']` truncado a 512 caracteres; redacción pino `[ip]` (por `pattern/pino-bracket-notation-redaction`) | Vitest: IP+UA capturados; salida pino muestra `[REDACTED]` para IP; UA >512 truncado |
| Rutas tipo documentación | N/A — sin docs ejecutables | N/A | Ninguna | Ninguna |
| Selección de repo git | N/A — sin shell | N/A | Ninguna | Ninguna |
| Commit / Push / PR | N/A — sin automatización VCS | N/A | Ninguna | Ninguna |
| Shell/proceso | N/A — sin subproceso | N/A | Ninguna | Ninguna |

## 8. Migración / Despliegue

Sin cambios incompatibles en el esquema de BD. Nueva tabla `AdminAuditEvent` (aditiva) + nueva columna `Session.metadata` (anulable, sin valor por defecto). Reversión: `git revert <chain-tip>` elimina la migración + borra el import de `AdminModule`. Sin pérdida de datos — las sesiones existentes siguen funcionando sin la columna `metadata` poblada.

`ADMIN_ENABLED` por defecto `true`; establecerlo `false` hace que `AdminGuard` devuelva 404 en cada ruta `/admin/*`, ofreciendo un interruptor de apagado sin cambios de código (respuesta a emergencias). La reversión es factible por PR porque cada PR es atómico (AGENTS.md §5) y la cadena mantiene `develop` verde en cada paso.

## 9. Preguntas Abiertas

Ninguna. Todas las decisiones de producto resueltas en la sección `## Product decisions` de la propuesta (según respuestas del usuario capturadas el 2026-07-18).

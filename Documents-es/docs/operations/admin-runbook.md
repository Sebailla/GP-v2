# Runbook — `module-3-superadmin`

**Fecha**: 2026-07-18
**Proyecto**: `gastos-personales-reference`
**Módulo**: 3 — Superficie de superadmin (asignación de roles, revocación de sesiones, log de auditoría)

Este runbook es la pieza compañera orientada al operador de
`auth-runbook.md` (Módulo 2). Cada acción admin que un usuario con
`role: "ADMIN"` puede tomar en la plataforma — listar usuarios, cambiar
un rol, listar sesiones, revocar una sesión, revocar todas las sesiones
de un usuario — pasa por uno de los 5 endpoints documentados acá. La
pieza compañera `docs/operations/auth-runbook.md` cubre la superficie
de sign-in; esta cubre todo lo que vive detrás de `/admin/*`.

Todos los valores de secretos viven en el entorno `staging` de GitHub
Actions (según `production-foundation-runbook.md` §9) y en el entorno
de producción. Quienes desarrollan en local editan
`apps/web/.env.test` (commiteado, con gate de runtime) y
`apps/api/.env.test`; NUNCA commitear un `NEXTAUTH_SECRET` real ni un
override de `ADMIN_ENABLED` que deshabilite la superficie en
producción.

## 1. Onboarding de admin

Un "admin" es una fila de `User` con `role = "ADMIN"` en la tabla
Prisma `User`. La plataforma NO ofrece ninguna ruta pública de
sign-up hacia ADMIN — cada admin debe ser provisionado out-of-band por
un admin existente (o mediante acceso directo a DB durante el seeding
inicial). El rationale: ADMIN expone el listado de sesiones, la
mutación de roles y los endpoints de revocación de sesiones para toda
cuenta en la plataforma, incluido el derecho a revocar cualquier
sesión, incluso la propia. Sign-up público a ADMIN le permitiría a un
atacante que obtuviera acceso temporal al email auto-elevarse a lectura
completa de los datos de cualquier usuario.

### Provisionar un nuevo admin (lo hace un admin existente)

1. El admin existente inicia sesión en `/{locale}/sign-in` (según
   `auth-runbook.md` §2) y visita `/{locale}/admin/users`.
2. Ubica al usuario target (la lista está paginada; usar `?limit=200`
   para poblaciones chicas).
3. Click en la fila del usuario → página de detalle. La página de
   detalle expone el `ChangeRoleForm` con el rol actual
   pre-seleccionado.
4. Elige `ADMIN` del Select. El formulario postea a
   `POST /api/admin/users/:userId/role` con body
   `{role: "ADMIN"}` (validado por Zod en
   `libs/features/auth/shared/schemas/admin.schemas.ts`).
5. El servidor cambia el rol + escribe una fila de auditoría + emite
   `auth.role.changed` (PR #2 task 2.2 + 2.5). El JWT existente del
   usuario target permanece válido hasta su próximo refresh — política
   de cascada D4. Peor caso: ventana de 24h (matches
   `SESSION_TTL_SECONDS` según `auth-runbook.md` §5).
6. El admin cierra su propia sesión y vuelve a iniciar (o espera al
   próximo refresh del JWT). El JWT fresco lleva `role: "ADMIN"`.

> **Seeding inicial (sin admin existente).** Se requiere acceso
> directo a DB:
> `UPDATE "User" SET role = 'ADMIN' WHERE email = 'firstadmin@example.test';`
> en una sesión de `prisma studio` o vía `psql`. La próxima sign-in de
> ese usuario mintea un JWT de ADMIN a través del flujo estándar de
> next-auth.

## 2. Procedimiento de asignación de roles

`POST /admin/users/:userId/role` es la única ruta de mutación. El
body es `{role: "USER" | "ADMIN"}` — el enum es cerrado (Zod
`ChangeRoleBodySchema`). El path idempotente: reenviar el mismo rol es
un no-op (sin escritura a DB, sin fila de auditoría, sin evento). La
plataforma NUNCA hace upgrade silencioso — toda mutación de rol es
explícita.

### Revertir una asignación de rol

1. El admin que actúa visita `/{locale}/admin/users/:userId`.
2. Elige el nuevo rol del Select. Envía.
3. El servidor escribe el cambio + fila de auditoría + payload del
   evento `auth.role.changed` que incluye
   `{actorId, targetUserId, fromRole, toRole}`.

### Cobertura de la matriz de amenaza (según `design.md` §7)

- **No-admin intenta cambiar rol → 403.** `AdminGuard` rechaza
  tokens de no-admin antes de que corra el handler.
- **JWT expirado/forjado → 401.** El try/catch de decode de
  `JwtAuthGuard` (según `pattern/nextauth-decode-try-catch`)
  rechaza antes de que corra `AdminGuard`.
- **userId desconocido → 404.** El controller traduce
  "User not found" de `RbacService.changeRole` a 404.
- **Body de rol inválido → 400.** El pipe de Zod rechaza antes del
  service.

## 3. Listar + revocar sesiones

Las sesiones se listan por usuario vía
`GET /admin/sessions?userId=<uuid>`, ordenadas DESC por `expires`
(según PR #2 deviation #1 — el proxy para `lastActiveAt`). La forma
de la respuesta es
`[{id, userId, sessionToken, expires, userAgent, ipAddress}]`.

### Revocar una sola sesión

`DELETE /admin/sessions/:sessionId` borra la fila + escribe una fila
de auditoría con `action: "REVOKE_SESSION"`,
`metadata: {targetUserId}`.

**UX de self-revoke (D5).** Cuando la sesión borrada pertenece al
admin que llama (es decir, el `sessionId` resuelve a una sesión cuyo
`userId` matchea el `userId` del JWT), la respuesta lleva
`Set-Cookie: authjs.session-token=; Path=/; Expires=<epoch>`
para que el browser borre la cookie del lado del cliente. Esta es la
UX estándar de "log out from this device". El cliente muestra un
diálogo de confirmación antes de llamar al endpoint — un self-revoke
accidental es recuperable (volver a iniciar sesión con
email/password o Google según `auth-runbook.md` §1).

### Bulk revoke (kill-switch para un solo usuario)

`DELETE /admin/sessions/user/:userId` borra cada sesión del usuario +
escribe una fila de auditoría con `action: "REVOKE_ALL_SESSIONS"`,
`metadata: {count: <n>}`. Caso de uso: "Perdí el teléfono — deslogueame
de todos lados" o "Sospecha de compromiso del usuario X — forzar
sign-out".

**Self-revoke-all.** Cuando `userId === request.user.id`, la respuesta
lleva el mismo clear de `Set-Cookie`. Esta es la UX de "log out
everywhere" — matchea el patrón estándar `GlobalSignOut` de
Cognito/Auth0.

## 4. Procedimientos de revocación de emergencia

### 4.1 Compromiso sospechado de una cuenta admin

1. La persona operadora que responde (otro admin) inicia sesión y
   visita `/{locale}/admin/sessions`.
2. Ingresa el id del usuario comprometido, elige el botón de
   bulk-revoke.
3. `DELETE /admin/sessions/user/:userId` corre — cada sesión activa
   del usuario se mata + la fila de auditoría registra al actor + IP.
4. Después de la revocación, considerar rotar la password del usuario
   out-of-band (según `auth-runbook.md` §1 el flujo de reset mintea
   un link de un solo uso — usar la consola de preview stageada para
   obtenerlo).

### 4.2 Compromiso sospechado de una cuenta no-admin

1. Mismo flujo que §4.1, el usuario target es la víctima.
2. Opcionalmente también cambiar el rol del usuario a `USER`
   explícitamente vía §2 (no-op si ya es USER) para marcar la fila
   con un audit trail.

### 4.3 Sospecha de leak del secret de firma de JWT de un admin

Este es un incidente tier-1. El compromiso de `NEXTAUTH_SECRET`
significa que cada JWT (y cada sesión) en la plataforma es
forgeable.

1. La persona operadora rota `NEXTAUTH_SECRET` en el store de
   secretos.
2. Reiniciar la API + procesos web — next-auth relee el secret al
   boot.
3. **Todas las sesiones existentes se vuelven inválidas** porque las
   firmas del JWT ya no verifican contra el nuevo secret.
   SessionsService.list aún resuelve sesiones (las filas persisten),
   pero `JwtAuthGuard` rechaza el bearer header. El admin usa
   `DELETE /admin/sessions/user/:userId` con el nuevo secret EN CASO
   de que el atacante esté racing la rotación — la revocación aún
   corre porque el JWT recién minteado del admin ES válido; el JWT
   del atacante no.
4. Auditar la tabla AdminAuditEvent buscando filas de
   `auth.role.changed` con `createdAt >= <tiempo-de-rotación>` —
   esas pueden ser inducidas por el atacante.

### 4.4 Matar toda la superficie admin (según D7 / D8)

Setear `ADMIN_ENABLED=false` en el env de la API. `AdminGuard` chequea
este flag primero y devuelve 404 para cada ruta `/admin/*`. La
superficie API de `/admin/*` se vuelve invisible — incluso un JWT de
admin leaked no puede mutar estado. Las páginas web `/admin/*`
siguen renderizando (el Middleware aún reconoce las rutas) pero cada
fetch devuelve 404, así que la UI surface un estado de error
permanente.

Usar esto cuando:

- Un CVE cae que bypassea el chequeo `role === 'ADMIN'` de
  `AdminGuard`.
- Una investigación requiere freeze-on-write mientras corre
  forensics.
- La plataforma está offline por mantenimiento y los admins
  necesitan señal visual.

```bash
# Fly.io
flyctl secrets set ADMIN_ENABLED=false -a gastos-api

# Render
render env set ADMIN_ENABLED=false --service gastos-api
```

Para re-habilitar, setear la variable de nuevo a `true` (o
des-setearla; el default es `true`) y reiniciar la API.

## 5. Ejemplos de queries al log de auditoría

Las filas de auditoría viven en `AdminAuditEvent` (según diseño D2).
El schema (ver `libs/core/database/prisma/schema.prisma`) es:

```
AdminAuditEvent {
  id          String   @id @default(cuid())
  actorId     String                     -- el admin que realizó la acción
  targetId    String                     -- el id de sesión (REVOKE_SESSION) o
                                         -- userId (REVOKE_ALL_SESSIONS, CHANGE_ROLE)
  action      AdminAuditAction            -- REVOKE_SESSION | REVOKE_ALL_SESSIONS | CHANGE_ROLE
  createdAt   DateTime @default(now())    -- @@index([createdAt])
  metadata    Json?                       -- ej. {count: N} para bulk revokes,
                                         -- {fromRole, toRole} para cambios de rol
  ipAddress   String?                    -- ≤ 45 chars (IPv6 max), según truncado D3
  userAgent   String?                    -- ≤ 512 chars, según design §7
}
```

El índice `@@index([createdAt])` soporta un futuro job de purge de
retención (deferido a M4 Privacy según D7). Por ahora, no hay purge
automatizado.

### Ejemplo 1 — ¿quién revocó una sesión específica?

```sql
SELECT actor_id, created_at, ip_address, user_agent
FROM admin_audit_event
WHERE action = 'REVOKE_SESSION' AND target_id = '<sessionId>'
ORDER BY created_at DESC;
```

### Ejemplo 2 — cada cambio de rol en los últimos 7 días

```sql
SELECT actor_id, target_id, metadata->>'fromRole' AS from_role,
       metadata->>'toRole' AS to_role, created_at, ip_address
FROM admin_audit_event
WHERE action = 'CHANGE_ROLE'
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

### Ejemplo 3 — audit trail de bulk revoke

```sql
SELECT actor_id, target_id, metadata->>'count' AS revoked_count,
       created_at, ip_address
FROM admin_audit_event
WHERE action = 'REVOKE_ALL_SESSIONS'
ORDER BY created_at DESC
LIMIT 50;
```

### Ejemplo 4 — todas las acciones admin desde una IP específica

```sql
SELECT actor_id, action, target_id, created_at
FROM admin_audit_event
WHERE ip_address = '<ip>'
ORDER BY created_at DESC;
```

### Ejemplo 5 — actividad admin reciente (dashboard del operador)

```sql
SELECT actor_id, action, target_id, created_at
FROM admin_audit_event
ORDER BY created_at DESC
LIMIT 100;
```

## 6. Retención (deferida a M4)

**Ningún purge automatizado se envía en M3.** La decisión D7 es
intencional: la política de retención es alcance de M4 Privacy, y el
índice `@@index([createdAt])` soporta cualquier query de purge que
M4 envíe. La entrada del runbook existe para documentar el gap así
futuras personas mantenedoras no piensen que la tabla de auditoría
es unbounded por diseño.

Cuando M4 envíe el job de purge, el índice sobre `createdAt` ya
soporta el delete canónico:

```sql
DELETE FROM admin_audit_event
WHERE created_at < NOW() - INTERVAL '<retention_days> days';
```

Hasta entonces, la tabla de auditoría crece monotónicamente. Plan
para capacidad: ~1 KB por fila, ~1 acción admin por cada ~10
sign-ins para una plataforma ocupada.

## 7. Prerrequisitos de dev local

Los archivos `apps/web/.env.test` y `apps/api/.env.test` del repo
(commiteados) contienen un set completo de fixtures para que
`NODE_ENV=test pnpm dev` boote out of the box. Las variables
siguientes manejan la superficie admin específicamente:

| Variable | Default dev | Requerida en producción | Notas |
| --- | --- | --- | --- |
| `ADMIN_ENABLED` | `true` (implícito) | `true` | Kill-switch D8 — ver §4.4 |
| `NEXTAUTH_SECRET` | fixture de test | desde el store de secretos | Se usa para firmar los JWTs que valida `JwtAuthGuard` |
| `SESSION_TTL_SECONDS` | `86400` (24h) | `86400` | Ventana de cascada D4 — el JWT stale del target se mantiene válido hasta el refresh |

Las 2 variables heredadas de `auth-runbook.md` §5 (`NODE_ENV`,
`NEXTAUTH_URL`, `API_URL`, `WEB_ORIGIN`) aplican sin cambios.

> **Correr siempre los comandos de turbo con `NODE_ENV=test` en el
> gate de apply:** `apps/web#build` crashea cuando `API_URL` /
> `WEB_ORIGIN` están vacíos (el fixture de test los provee). Usar
> `NODE_ENV=test pnpm turbo run build` y compañía.

## 8. Troubleshooting

### Síntoma: admin visita `/admin/users` → redirect a `/(app)`

1. Verificar que el actor es efectivamente `role: "ADMIN"` en la DB:
   `SELECT role FROM "User" WHERE email = '<email>';`
2. El pre-check del Middleware (`apps/web/middleware.ts`) lee el JWT
   directamente. Si el JWT es de antes del cambio de rol (ventana de
   cascada D4), el usuario debe cerrar sesión y volver a iniciarla
   para recibir un JWT fresco con `role: "ADMIN"`.
3. Inspeccionar los eventos de auditoría `auth.role.changed` para
   el usuario — confirmar que el rol efectivamente fue cambiado.

### Síntoma: `404` en cada llamada a API bajo `/admin/*`

`ADMIN_ENABLED=false` en el env de la API. Des-setear / setear a
`true` y reiniciar la API (§4.4).

### Síntoma: `403` en `/admin/*` para un usuario que DEBERÍA ser admin

El JWT es stale. Hacer que el usuario cierre sesión (o revocar su
sesión vía `auth-runbook.md` §3) y vuelva a iniciar sesión. El JWT
fresco lleva el nuevo rol.

### Síntoma: la sesión revocada sigue autenticando

La plataforma lee JWTs desde cookies — si un request llega a la API
con un JWT minteado antes de la revocación, la API valida la firma
del JWT + expiry (sigue válido hasta 24h) y deja pasar el request. La
fila de sesión está borrada de la DB pero el JWT en sí permanece
auto-contenido. Para evictar completamente, se puede: (a) esperar a
que el JWT expire (peor caso 24h según `SESSION_TTL_SECONDS`), o (b)
rotar `NEXTAUTH_SECRET` (§4.3) — cada JWT se vuelve inválido
inmediatamente.

### Síntoma: la línea de log de pino muestra `[REDACTED]` donde debería estar la IP

Este es el comportamiento esperado — la redacción de bracket-notation
de pino (según `pattern/pino-bracket-notation-redaction`) reemplaza el
valor de la key `ip` con `[REDACTED]` antes de la serialización. La IP
real igual se captura en la fila de auditoría (columna `ipAddress`).

## 9. Artefactos relacionados

- `auth-runbook.md` — superficie de sign-in del Módulo 2 (Gmail,
  Google OAuth, password reset, kill-switch `MAIL_DSN`,
  `GOOGLE_E2E_MOCK`).
- `production-foundation-runbook.md` — línea base del Módulo 1
  (free-tier, backups, lista de secretos).
- `openspec/changes/module-3-superadmin/design.md` — decisiones de
  diseño D1–D8 (admin guard, forma del audit, captura de IP+UA,
  cascada de cambio de rol, UX de self-revoke, route group,
  retención).
- `openspec/changes/module-3-superadmin/tasks.md` — tareas de Phase 5
  (PR #5) 5.1-5.8.
- `apps/api/src/modules/auth/admin.controller.ts` — los 5 endpoints
  (`GET /admin/users`, `POST /admin/users/:userId/role`,
  `GET /admin/sessions`, `DELETE /admin/sessions/:sessionId`,
  `DELETE /admin/sessions/user/:userId`).
- `apps/api/src/shared/guards/admin.guard.ts` — `AdminGuard` lee
  primero `env.ADMIN_ENABLED`, luego `req.user.role === 'ADMIN'`.
  Split 401 / 403 / 404 según matriz de amenaza §7.
- `apps/api/src/modules/auth/admin.module.ts` — módulo DI que
  cablea `RbacService` + `SessionService` en el controller. Se saltea
  por completo cuando `ADMIN_ENABLED=false` (kill-switch).
- `libs/features/auth/server/src/audit.service.ts` — la función pura
  `insertAuditEvent` usada por `RbacService.changeRole` +
  `SessionService.revoke`/`revokeAll`.
- `libs/features/auth/shared/schemas/admin.schemas.ts` — fuente única
  de verdad para los 3 schemas Zod (`ListUsersQuerySchema`,
  `ChangeRoleBodySchema`, `ListSessionsQuerySchema`).
- `apps/web/middleware.ts` — pre-check de `/admin/*` consciente del
  locale (D1). Redirige a no-admins a `/{locale}/(app)` con el flash
  `?admin=denied`.
- `apps/web/app/[locale]/(app)/admin/{layout,users/page,users/[userId]/page,sessions/page}.tsx`
  — server components; `dynamic = "force-dynamic"` para que cada
  render fetchee filas frescas de sesión + usuario.
- `apps/web/components/admin/{AdminNav,UsersTable,SessionsTable,ChangeRoleForm}.tsx`
  — 4 client components con 5 estados de form según AGENTS.md §9
  (loading, error, success, empty, validation-error).
- `apps/web/lib/admin-api.ts` — wrappers tipados de fetch para los 5
  endpoints admin + re-exports Zod desde `@features/auth`.
- `apps/web/messages/{en,es}.json` — keys `admin.*` de i18n (flash
  + nav + users + userDetail + sessions).
- `libs/features/auth/docs/admin-flow.feature` +
  `step-defs/admin.steps.ts` — escenario vertical BDD de Cucumber
  (Phase 5 task 5.1 + 5.2). Recorre: admin login → listar usuarios
  → cambiar rol → listar sesiones → revocar single → revocar all →
  redirect de no-admin.
- `apps/web/e2e/auth/admin.spec.ts` — spec vertical de Playwright
  (Phase 5 task 5.3 + 5.4). Mockea los 5 endpoints admin vía
  `page.route()` según
  `pattern/playwright-per-project-webserver-not-supported`.
- `apps/web/e2e/auth/admin.a11y.spec.ts` — audit axe-core de WCAG AA
  por superficie (Phase 4 task 4.7). Cero serious / critical por
  superficie.
- `Documents-es/docs/operations/admin-runbook.md` — mirror en español
  de este runbook.

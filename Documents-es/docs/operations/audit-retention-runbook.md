# Runbook — `module-4-privacy` (retención de auditoría + redacción de IP)

**Fecha**: 2026-07-19
**Proyecto**: `gastos-personales-reference`
**Módulo**: 4 — Superficie de privacidad (UI de log de auditoría, purga de retención, redacción HMAC de IP)

Este runbook es la pieza compañera orientada al operador de
`admin-runbook.md` (Módulo 3). El runbook del Módulo 3 cubre cada
acción admin expuesta por los 5 endpoints bajo `/admin/*` (listado
de usuarios, cambio de rol, revocación de una sesión, revocación de
todas las sesiones de un usuario). Este runbook cubre los 2 nuevos
endpoints que M4 envía bajo `/admin/audit` + el cron de retención que
gobierna cuánto tiempo viven las filas de auditoría antes de ser
purgadas:

 - `GET  /admin/audit` — lectura filtrada y paginada del log de
   auditoría
 - `POST /admin/audit/purge` — purga de retención en modo dual
   (dry-run + real)

También cubre la redacción HMAC de IP que aterriza en el borde del
controller de auditoría (carry-forward desde M3 F4 con la redacción
de pino, pero extendida a la propia columna `AdminAuditEvent.ipAddress`),
y los prerrequisitos de dev local / staging específicos de las
variables de entorno de retención.

La pieza compañera es `docs/operations/admin-runbook.md` (Módulo 3)
que cubre `/admin/users`, `/admin/sessions` y los endpoints de
cambio de rol. Leerla primero si necesitás aprovisionar actores
admin o revocar sesiones; este runbook asume que ya tenés una
sesión con `ADMIN`.

## 1. Prerrequisitos del operador

Todos los valores de secretos viven en el entorno `staging` de GitHub
Actions (según `production-foundation-runbook.md` §9) y en el
entorno de producción. Quienes desarrollan en local editan
`apps/web/.env.test` (commiteado, con gate de runtime) y
`apps/api/.env.test`; NUNCA commitear un `NEXTAUTH_SECRET` real ni
un override `AUDIT_RETENTION_DAYS=0` en producción (eso deshabilita
el cron de retención — ver §3.3 para entender por qué esto es un
kill-switch, no un comando de "purgar todo ahora").

Para ejecutar cualquier endpoint `/admin/audit*` ya tenés que tener
una sesión con rol `ADMIN`. Ver `admin-runbook.md` §1 para el
provisionamiento.

## 2. La superficie del log de auditoría

### 2.1 Leer el log de auditoría — `GET /admin/audit`

El endpoint devuelve las filas de `AdminAuditEvent` que la
plataforma escribió desde el lanzamiento, opcionalmente filtradas
por `actorId`, `targetId`, `action`, `since`, `until`, y paginadas
por `limit` (≤ 200, default 50) + `offset` (default 0). El query
string es parseado por `ListAuditQuerySchema` (Zod), así que un
valor desconocido `action=INVALID` devuelve 400 antes de cualquier
llamada a la DB — protege la tabla de auditoría de un plan de
consulta malo. La forma de la respuesta es la proyección literal
de 8 campos de la spec:

```ts
interface AdminAuditEventResponse {
  readonly id: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly action: "REVOKE_SESSION" | "REVOKE_ALL_SESSIONS" | "CHANGE_ROLE";
  readonly createdAt: string;        // ISO 8601
  readonly metadata: unknown;        // { sessionId } | { count } | { from, to } etc.
  readonly ipAddress: string | null; // HMAC-SHA256 hex (64 chars) — ver §4
  readonly userAgent: string | null; // ≤ 512 chars
}
```

**Ejemplos del operador.**

```bash
# Últimas 50 filas de auditoría (sin filtros)
curl -sS -b authjs.session-token="$ADMIN_JWT" \
  "$API_URL/admin/audit?limit=50&offset=0"

# Todos los cambios de rol en los últimos 7 días
curl -sS -b authjs.session-token="$ADMIN_JWT" \
  "$API_URL/admin/audit?action=CHANGE_ROLE&since=$(date -u -d '7 days ago' +%FT%TZ)"

# Cada acción que realizó un admin específico
curl -sS -b authjs.session-token="$ADMIN_JWT" \
  "$API_URL/admin/audit?actorId=$ADMIN_USER_ID&limit=200"
```

La UI web de la plataforma surface este mismo endpoint bajo
`/{locale}/admin/audit` (PR #3 task 3.4 GREEN). Operadores sin
acceso a curl pueden usar la UI directamente.

### 2.2 Caminos de escritura de filas de auditoría

Cada fila de auditoría es escrita por uno de 3 métodos de service,
cada uno llamado desde las acciones existentes del controller admin
de M3:

| Action | Source | Disparado por |
| --- | --- | --- |
| `REVOKE_SESSION` | `SessionService.revoke` | `DELETE /admin/sessions/:sessionId` |
| `REVOKE_ALL_SESSIONS` | `SessionService.revokeAll` | `DELETE /admin/sessions/user/:userId` |
| `CHANGE_ROLE` | `RbacService.changeRole` | `POST /admin/users/:userId/role` |

La captura de IP + UA ocurre en el borde HTTP (controller D3); la
inserción de la fila ocurre dentro del service vía
`AuditService.insertAuditEvent` (M3 PR #2 task 2.5 — refactorizado
en M4 para compartir el nuevo helper `hashIpForAudit`).

## 3. Retención — `POST /admin/audit/purge`

La política de retención está codificada en 2 variables de entorno
(`AUDIT_RETENTION_DAYS` + `AUDIT_RETENTION_ENABLED`) — ambas
parseadas al boot vía `env.schema.ts` (M4 PR #1 task 1.4 GREEN) así
que una mala configuración crashea la API antes de que corra
cualquier purga.

### 3.1 Dry-run vs real — el contrato de modo dual

El endpoint toma `{ dryRun: bool, olderThanDays: number }` y
devuelve una de dos formas:

| `dryRun` | Forma de respuesta | Efecto |
| --- | --- | --- |
| `true`  | `{ matched, wouldDelete }` | No toca filas; cuenta cuántas matchean |
| `false` | `{ matched, deleted }`     | `deleteMany` atómico (Postgres MVCC all-or-none) |

Una purga real exitosa devuelve `matched === deleted` (la atomicidad
es una sola llamada `deleteMany` independientemente del count). La
segunda llamada con el mismo `olderThanDays` devuelve
`{ matched: 0, deleted: 0 }` — la operación es idempotente (la
primera llamada ya removió cada fila elegible).

### 3.2 Invocación manual de la purga

```bash
# Dry-run — contar qué SE VA a borrar sin tocar nada
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "olderThanDays": 90}' \
  "$API_URL/admin/audit/purge"
# → {"matched": 1284, "wouldDelete": 1284}

# Purga real — deleteMany atómico
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false, "olderThanDays": 90}' \
  "$API_URL/admin/audit/purge"
# → {"matched": 1284, "deleted": 1284}
```

El campo `olderThanDays` es `int ≥ 1` (Zod `min(1)`) — no existe
el camino "purgar todo lo más viejo que 0 días" porque eso borraría
silenciosamente la fila de revoke de la sesión del propio operador.
Operadores que quieran purgar todo deben borrar la tabla vía una
migración separada, NO a través de este endpoint.

### 3.3 El contrato de env de retención

| Variable | Default | Rango | Efecto |
| --- | --- | --- | --- |
| `AUDIT_RETENTION_DAYS` | `90` | `int ≥ 0` | Días antes de que corra la auto-purga |
| `AUDIT_RETENTION_ENABLED` | `false` | `bool` | Si el cron de las 03:00 corre |

El cron en sí vive en
`libs/features/auth/server/src/audit-retention.cron.ts` (el handler
sin decoradores) + `apps/api/src/modules/auth/audit-retention.schedule.ts`
(la clase `AuditRetentionSchedule` con el decorador
`@Cron('0 3 * * *')`). El handler se registra en `AdminModule` SOLO
cuando `AUDIT_RETENTION_ENABLED=true` (M4 PR #2 task 2.10 GREEN).

**`AUDIT_RETENTION_DAYS=0` es un KILL-SWITCH, no "purgar todo
ahora."** Setear el valor a 0 significa que el cron computa el
cutoff como "todo lo más viejo que el unix epoch" — que ES todas
las filas — pero el `min(0)` de Zod lo acepta porque el handler del
cron filtra `olderThanDays <= 0` como no-op (salta la llamada a
`purgeOlderThan`). El operador que quiera purgar en masa debe usar
el endpoint manual, no el cron.

Para agendar una purga masiva one-shot:

```bash
# 1. Verificar primero el count con dry-run
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "olderThanDays": 30}' \
  "$API_URL/admin/audit/purge"

# 2. Si el count es lo que esperás, correr la purga real
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false, "olderThanDays": 30}' \
  "$API_URL/admin/audit/purge"

# 3. Verificar — la segunda llamada debería devolver 0
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "olderThanDays": 30}' \
  "$API_URL/admin/audit/purge"
```

## 4. Redacción HMAC de IP (PII)

La columna `AdminAuditEvent.ipAddress` guarda la dirección IPv4/IPv6
que el admin usó en el momento de tomar la acción — pero NUNCA en
plaintext. La columna guarda un string hex lowercase de 64 caracteres
que es el HMAC-SHA256 de la IP cruda keyed por `env.NEXTAUTH_SECRET`:

```ts
// libs/features/auth/server/src/audit.service.ts
import { createHmac } from "node:crypto";
export function hashIpForAudit(rawIp: string): string {
  return createHmac("sha256", env.NEXTAUTH_SECRET)
    .update(rawIp)
    .digest("hex");
}
```

El HMAC tiene dos propiedades en las que la plataforma se apoya:

1. **Determinista.** Cada IP cruda mapea a exactamente un string
   hex, así que el operador puede responder queries forenses como
   "¿esta IP realizó un cambio de rol el 14 de marzo?" re-hasheando
   la IP candidata y buscando ese hex. La IP cruda nunca se guarda
   y nunca sale de la fila de auditoría.
2. **No reversible sin el secret.** El HMAC es one-way para un
   atacante que exfiltra la tabla `AdminAuditEvent` sin
   `NEXTAUTH_SECRET`. Rotar el secret (según
   `admin-runbook.md` §4.3) invalida el link entre los hexes viejos
   y las IPs viejas.

El redact path de pino (`pattern/pino-bracket-notation-redaction`,
traído de M3 F4) es independiente del HMAC a nivel columna.
Sustituye `[REDACTED]` por la key `ip` en las líneas estructuradas
del log ANTES de la serialización, así que la IP nunca aterriza en
la agregación de logs tampoco. Los dos mecanismos juntos le dan al
operador:

| Dónde | Qué | Riesgo de PII |
| --- | --- | --- |
| Columna `ipAddress` de la fila de auditoría | Hex HMAC | Forense vía re-hash; el crudo no se expone |
| Líneas estructuradas del log de pino | `[REDACTED]` | Nunca presente |
| Respuesta GET /admin/audit | Hex HMAC | Forense vía re-hash; el crudo no se expone |
| Respuesta GET /admin/sessions | IP cruda | Carry-forward de M3; M4 mantiene el contrato de M3 |

**Nota de carry-forward de M3.** La spec de M3 envió `ipAddress`
como un string de IP cruda en la respuesta del listado de sesiones
(según el pin de `admin-runbook.md` §3). M4 NO migra eso a HMAC —
eso está fuera de scope. La redacción del log de auditoría es el
cambio dirigido; las sesiones siguen enviando IP cruda según el
contrato de M3.

## 5. Rationale de la política de retención

El default de 90 días (`AUDIT_RETENTION_DAYS=90`) es el mínimo que
satisface dos restricciones:

1. **Ventana forense para investigaciones activas.** Las
   investigaciones de incidentes estilo GDPR típicamente llevan
   30-60 días desde la detección del incidente hasta la review
   formal. Una retención de 90 días garantiza que la fila de
   auditoría sigue en disco cuando arranca la review formal.
2. **Presupuesto de storage en una instancia Postgres free-tier.**
   Según la baseline del Módulo 1
   (`production-foundation-runbook.md` §3),
   `gastos-personales-reference` corre en un Postgres free-tier con
   cap de 1 GB. Cada fila de `AdminAuditEvent` mide ~1 KB (metadata
   + HMAC de 64 chars + UA truncada). 90 días a ~10 eventos de
   auditoría/día = ~900 KB totales — deja headroom para las tablas
   de User + Session + Transaction.

Operadores que necesiten retención más larga (por ejemplo para un
workload regulado) deberían bumpear `AUDIT_RETENTION_DAYS` a 365 +
aprovisionar storage adicional de Postgres. El schedule del cron
sigue en `@Cron('0 3 * * *')` UTC independientemente del largo de
la retención.

## 6. El cron de retención

El cron es el decorador `@Cron('0 3 * * *')` sobre la clase
`AuditRetentionSchedule` en
`apps/api/src/modules/auth/audit-retention.schedule.ts` y se registra
solo cuando `AUDIT_RETENTION_ENABLED=true`. El slot de las 03:00 UTC
mantiene las operaciones de retención fuera de las ventanas de
turno del operador en NA + EU. El handler está intencionalmente
separado en un `audit-retention.cron.ts` sin decoradores en la
librería del feature auth + un shell con la clase
`AuditRetentionSchedule` en `apps/api/` para mantener el requerimiento
de `experimentalDecorators` aislado al tsconfig de la API (según la
deviation `D-M4-4`).

Para verificar que el cron está cableado en producción:

```bash
# Después del deploy, revisar los logs de la API por el nombre de
# clase AuditRetentionSchedule (el NestJS Logger prefiza cada línea
# con el nombre de clase, así que un grep sobre el nombre de clase es
# una señal estable para el operador).
flyctl logs --app gastos-api | grep "AuditRetentionSchedule"
# → {"level":"info","time":"...","msg":"[AuditRetentionSchedule] ..."
```

Para deshabilitar la retención por completo (por ejemplo para una
investigación larga que necesita la tabla congelada):

```bash
# Fly.io
flyctl secrets set AUDIT_RETENTION_ENABLED=false -a gastos-api

# Render
render env set AUDIT_RETENTION_ENABLED=false --service gastos-api
```

Re-habilitar de la misma manera (`AUDIT_RETENTION_ENABLED=true`) +
reiniciar el proceso de la API.

## 7. Prerrequisitos de dev local

Los archivos `apps/web/.env.test` y `apps/api/.env.test` del repo
(commiteados) contienen un set completo de fixtures para que
`NODE_ENV=test pnpm dev` boote out of the box. Las variables
siguientes manejan la superficie de retención de auditoría
específicamente:

| Variable | Default dev | Requerida en producción | Notas |
| --- | --- | --- | --- |
| `AUDIT_RETENTION_DAYS` | `90` | `90` (o según §5) | M4 task 1.4 — `int ≥ 0`, default 90 |
| `AUDIT_RETENTION_ENABLED` | `false` | `true` | M4 task 1.4 — `bool`, default false (kill-switch) |
| `NEXTAUTH_SECRET` | fixture de test | desde el store de secretos | Se usa como key del HMAC en §4 — rotar según `admin-runbook.md` §4.3 |

Las 2 variables heredadas de `auth-runbook.md` §5 + 2 de
`admin-runbook.md` §7 (`NODE_ENV`, `NEXTAUTH_URL`, `API_URL`,
`WEB_ORIGIN`) aplican sin cambios.

> **Correr siempre los comandos de turbo con `NODE_ENV=test` en el
> gate de apply:** `apps/web#build` crashea cuando `API_URL` /
> `WEB_ORIGIN` están vacíos (el fixture de test los provee). Usar
> `NODE_ENV=test pnpm turbo run build` y compañía.

## 8. Troubleshooting

### Síntoma: `GET /admin/audit` devuelve 400 con `error: "INVALID_QUERY"`

Un valor de filtro falló Zod. Los offenders más comunes:

 - `action=GOD` — `action` tiene que ser uno de `REVOKE_SESSION`,
   `REVOKE_ALL_SESSIONS`, `CHANGE_ROLE`.
 - `limit=999` — `limit` es `int 1..200`; el schema RECHAZA (no
   silencia clampea) valores > 200, así que un bug de UI que manda
   `limit=1000` surface como 400 en lugar de un cap sin anunciar.
 - `since=not-a-date` — `since` / `until` se coercean vía
   `z.coerce.date()`. Strings inválidos devuelven 400.

### Síntoma: `POST /admin/audit/purge` devuelve 200 con `deleted: 0`

Este es el camino idempotente esperado — una llamada previa con el
mismo `olderThanDays` ya removió cada fila elegible. Para verificar:

```bash
# Obtener un count fresco de filas
curl -sS -b authjs.session-token="$ADMIN_JWT" "$API_URL/admin/audit?limit=1"
# Después correr un dry-run con una ventana chica
curl -sS -X POST -b authjs.session-token="$ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "olderThanDays": 1}' \
  "$API_URL/admin/audit/purge"
# Si matched es 0, ya estás up-to-date.
```

### Síntoma: la columna `ipAddress` muestra 64 chars hex pero el operador quiere tracear de vuelta a un usuario

Usar el helper `hashIpForAudit` directamente para re-derivar el hex
desde una IP candidata cruda. La plataforma no envía un CLI para
esto; usar un script corto de Node:

```bash
node -e "
const { createHmac } = require('node:crypto');
const hex = createHmac('sha256', process.env.NEXTAUTH_SECRET)
  .update('203.0.113.42')
  .digest('hex');
console.log(hex);
"
# Después buscar en la tabla de auditoría por ese hex:
# SELECT * FROM admin_audit_event WHERE ip_address = '<hex>';
```

### Síntoma: el cron corre pero el count de `deleted` es sospechosamente siempre 0

`AUDIT_RETENTION_DAYS=0` es el kill-switch — el handler del cron
trata `olderThanDays <= 0` como no-op (según §3.3). Setear el valor
a un entero positivo para habilitar la auto-purga.

## 9. Artefactos relacionados

- `auth-runbook.md` — superficie de sign-in del Módulo 2 (Gmail,
  Google OAuth, password reset, kill-switch `MAIL_DSN`,
  `GOOGLE_E2E_MOCK`).
- `admin-runbook.md` — superficie admin del Módulo 3 (5 endpoints
  bajo `/admin/*`, asignación de rol, revocación de sesiones,
  kill-switch vía `ADMIN_ENABLED=false`).
- `production-foundation-runbook.md` — baseline del Módulo 1
  (free-tier, backups, lista de secretos).
- `openspec/changes/module-4-privacy/design.md` — decisiones de
  diseño D1–D8 (coalesce de Session.lastActiveAt, patrón del cron,
  forma del filtro de auditoría, modo dual de purga, ubicación de
  la ruta, HMAC de IP, deprecación de la proyección de sesión,
  contrato de env de retención).
- `openspec/changes/module-4-privacy/tasks.md` — tareas de Phase 4
  (PR #4) 4.1-4.8 (BDD + runbook + final gate).
- `apps/api/src/modules/auth/admin.controller.ts` — los 2 nuevos
  endpoints (`GET /admin/audit`, `POST /admin/audit/purge`) + los
  5 endpoints de M3 traídos.
- `apps/api/src/modules/auth/audit-retention.schedule.ts` — la
  clase `AuditRetentionSchedule` con el decorador `@Cron('0 3 * * *')`
  que cablea el handler dentro del ScheduleModule de NestJS.
- `libs/features/auth/server/src/audit-retention.cron.ts` — el
  handler sin decoradores invocado por el cron + el endpoint manual
  (según deviation `D-M4-4`).
- `libs/features/auth/server/src/audit.service.ts` — los helpers
  `findMany`, `countOlderThan`, `purgeOlderThan` + `insertAuditEvent`
  + `hashIpForAudit`.
- `libs/features/auth/shared/schemas/audit.schemas.ts` —
  `AuditActionEnum` + `ListAuditQuerySchema` + `PurgeAuditBodySchema`.
- `apps/web/app/[locale]/(app)/admin/audit/page.tsx` — server
  component componiendo `AdminNav` + `AuditLogTable` +
  `AuditRetentionButton` (M4 PR #3 task 3.4 GREEN).
- `apps/web/components/admin/AuditLogTable.tsx` — client component
  con 7 columnas literales de la spec + 5 estados de form según
  AGENTS.md §9.
- `apps/web/components/admin/AuditRetentionButton.tsx` — client
  component con botón dry-run + purga real con diálogo de
  confirmación.
- `apps/web/lib/audit-api.ts` — wrappers tipados de fetch para los
  2 endpoints admin de auditoría + re-exports de Zod desde
  `@features/auth`.
- `apps/web/messages/{en,es}.json` — keys `admin.audit.*` de i18n
  (title, filters, columns, dryRun, purge, confirm, errors).
- `libs/features/auth/docs/audit-flow.feature` +
  `step-defs/audit.steps.ts` — escenario vertical BDD de Cucumber
  (Phase 4 task 4.1 + 4.2). Recorre: admin login → listar audit
  → filtrar por actorId → ver su propio REVOKE_SESSION → dry-run
  purga (olderThanDays=1) → purga real (olderThanDays=90) →
  verificar la deletion.
- `apps/web/e2e/auth/audit.spec.ts` — spec vertical de Playwright
  (Phase 4 task 4.3 + 4.4). Mockea los 2 endpoints admin de
  auditoría vía `page.route()` según
  `pattern/playwright-per-project-webserver-not-supported`.
- `apps/web/e2e/auth/audit.a11y.spec.ts` — audit axe-core de WCAG AA
  por superficie (Phase 3 task 3.8). Cero serious / critical por
  superficie.
- `Documents-es/docs/operations/audit-retention-runbook.md` —
  mirror en español de este runbook.

# Especificación de UI del Log de Auditoría

## Propósito

Define la superficie del log de auditoría de admin: lecturas filtradas y paginadas de filas `AdminAuditEvent`, purga de retención dry-run-first, y el contrato de env `AUDIT_RETENTION_DAYS`.

## Requisitos

### Requirement: Listar eventos de auditoría

El sistema DEBE exponer `GET /admin/audit` retornando un array JSON de filas `AdminAuditEvent` ordenadas por `createdAt DESC`. Cada fila incluye `id`, `actorId`, `targetId`, `action` (3 valores enum), `createdAt`, `metadata`, `ipAddress` (hex HMAC-SHA256 OR null), `userAgent` (≤ 512 chars OR null). Filtros: `actorId`, `targetId`, `action`, `since`, `until`, `limit` (default 50, tope del lado servidor en 200 vía clamp silencioso), `offset` (default 0). Protegido por `role=ADMIN`. Valores de `?limit > 200` son aceptados por Zod pero el controller clampea el conteo efectivo de filas a 200 en lugar de rechazar con 400; `?limit < 1` se mantiene como rechazo 400 por Zod.

#### Scenario: Default ordenado DESC

- GIVEN un admin y filas de acciones mezcladas
- WHEN corre `GET /admin/audit`
- THEN retorna 200 con filas DESC por `createdAt`

#### Scenario: Filtro por actorId

- GIVEN filas de múltiples actores
- WHEN corre `?actorId=<uuid>`
- THEN retorna 200 solo con filas de ese actor

#### Scenario: Filtro por action

- GIVEN filas de acciones mezcladas
- WHEN corre `?action=REVOKE_SESSION`
- THEN retorna 200 solo con esas filas

#### Scenario: Filtro por rango de fechas

- GIVEN filas que abarcan fechas
- WHEN corre `?since=<iso>&until=<iso>`
- THEN retorna 200 con filas en el rango

#### Scenario: Paginación

- GIVEN 50 filas
- WHEN corre `?limit=10&offset=20`
- THEN retorna 200 con 10 filas saltando 20

#### Scenario: Vacío

- GIVEN un actor sin filas
- WHEN corre `?actorId=<uuid>`
- THEN retorna 200 con `[]`

#### Scenario: No-admin

- GIVEN un caller no-admin
- WHEN corre `GET /admin/audit`
- THEN retorna 403

#### Scenario: Default limit

- GIVEN 100 filas
- WHEN corre `GET /admin/audit` (sin `?limit=`)
- THEN retorna 200 con ≤ 50 filas

#### Scenario: Default offset

- GIVEN filas presentes
- WHEN corre `GET /admin/audit` (sin `?offset=`)
- THEN retorna 200 desde offset 0

#### Scenario: Límite válido en rango

- GIVEN 100 filas
- WHEN corre `?limit=100`
- THEN retorna 200 con 100 filas

#### Scenario: Clamp silencioso en 200 (borde)

- GIVEN un admin
- WHEN corre `?limit=500`
- THEN retorna 200 con a lo sumo 200 filas (NO 400)

#### Scenario: Clamp silencioso en 200 (sobre el borde)

- GIVEN un admin
- WHEN corre `?limit=1000`
- THEN retorna 200 con a lo sumo 200 filas

#### Scenario: Límite cero inválido

- GIVEN un admin
- WHEN corre `?limit=0`
- THEN retorna 400 con error de Zod

#### Scenario: Límite no-entero inválido

- GIVEN un admin
- WHEN corre `?limit=abc`
- THEN retorna 400 con error de Zod

### Requirement: Purgar eventos de auditoría (Dry-run)

El sistema DEBE exponer `POST /admin/audit/purge` con body `{ dryRun: true, olderThanDays: <n> }` retornando `{ matched, wouldDelete }` (iguales en dry-run). NO DEBE borrar filas. Protegido por `role=ADMIN`. `olderThanDays` DEBE ser ≥ 1.

#### Scenario: Dry-run con matches

- GIVEN 42 filas con más de 90 días de antigüedad
- WHEN se postea `{ dryRun: true, olderThanDays: 90 }`
- THEN retorna 200 con `{ matched: 42, wouldDelete: 42 }` y no se borran filas

#### Scenario: Cero matches

- GIVEN sin filas con más de 90 días de antigüedad
- WHEN se postea `{ dryRun: true, olderThanDays: 90 }`
- THEN retorna 200 con `{ matched: 0, wouldDelete: 0 }`

#### Scenario: olderThanDays inválido

- GIVEN un admin
- WHEN se postea `{ dryRun: true, olderThanDays: 0 }`
- THEN retorna 400 con error de Zod

#### Scenario: No-admin prohibido

- GIVEN un caller no-admin
- WHEN corre `POST /admin/audit/purge`
- THEN retorna 403

### Requirement: Purgar eventos de auditoría (Real)

El sistema DEBE exponer `POST /admin/audit/purge` con body `{ dryRun: false, olderThanDays: <n> }` retornando `{ matched, deleted }`. Filas donde `createdAt < now() - olderThanDays * 86_400_000` DEBEN borrarse atómicamente (un único `deleteMany`). Protegido por `role=ADMIN`. El siguiente `GET /admin/audit` NO DEBE incluir las filas borradas.

#### Scenario: Purga real borra filas

- GIVEN 42 filas con más de 90 días de antigüedad
- WHEN se postea `{ dryRun: false, olderThanDays: 90 }`
- THEN retorna 200 con `{ matched: 42, deleted: 42 }` y esas filas desaparecen

#### Scenario: Cero matches

- GIVEN todas las filas con menos de 1 día
- WHEN se postea `{ dryRun: false, olderThanDays: 1 }`
- THEN retorna 200 con `{ matched: 0, deleted: 0 }`

#### Scenario: Repetición idempotente

- GIVEN una purga completa para 90 días
- WHEN corre la misma purga otra vez
- THEN retorna 200 con `{ matched: 0, deleted: 0 }`

#### Scenario: Borrado atómico

- GIVEN un admin lee mientras otro purga
- WHEN la purga commitea
- THEN el lector ve all-or-none

#### Scenario: No-admin prohibido

- GIVEN un caller no-admin
- WHEN corre `POST /admin/audit/purge`
- THEN retorna 403

### Requirement: Variable de entorno de retención de auditoría

El sistema DEBE leer `AUDIT_RETENTION_DAYS` del contrato de env. Default `90`. `0` significa "sin retención automática" (kill-switch). Sin setear DEBE defaultear a `90`. DEBE validarse como entero no negativo. DEBE exponer `getAuditRetentionDays()` para el runbook.

#### Scenario: Default 90

- GIVEN `AUDIT_RETENTION_DAYS` no seteado
- WHEN el sistema arranca
- THEN `getAuditRetentionDays()` retorna `90`

#### Scenario: Explícito 30

- GIVEN `AUDIT_RETENTION_DAYS=30`
- WHEN el sistema arranca
- THEN `getAuditRetentionDays()` retorna `30`

#### Scenario: Kill-switch 0

- GIVEN `AUDIT_RETENTION_DAYS=0`
- WHEN el sistema arranca
- THEN `getAuditRetentionDays()` retorna `0`

#### Scenario: Negativo inválido

- GIVEN `AUDIT_RETENTION_DAYS=-1`
- WHEN el sistema arranca
- THEN la validación de env falla

#### Scenario: No-numérico inválido

- GIVEN `AUDIT_RETENTION_DAYS=abc`
- WHEN el sistema arranca
- THEN la validación de env falla

## Procedencia

Introducido por: module-4-privacy, 2026-07-19. Fundación: module-3-superadmin, 2026-07-18 (tabla `AdminAuditEvent` + `insertAuditEvent` + `hashIpForAudit`).
Extendido por: module-5-production-hardening, 2026-07-20 (1 requisito modificado: Listar eventos de auditoría — comportamiento de clamp del max-limit; clamp silencioso en 200 en lugar de rechazo Zod 400).

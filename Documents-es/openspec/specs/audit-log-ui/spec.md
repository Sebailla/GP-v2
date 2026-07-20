# Especificación de UI del Log de Auditoría

## Propósito

Define la superficie del log de auditoría de admin: lecturas filtradas y paginadas de filas `AdminAuditEvent`, purga de retención dry-run-first, y el contrato de env `AUDIT_RETENTION_DAYS`.

## Requisitos

### Requirement: Listar eventos de auditoría

El sistema DEBE exponer `GET /admin/audit` retornando un array JSON de filas `AdminAuditEvent` ordenadas por `createdAt DESC`. Cada fila incluye `id`, `actorId`, `targetId`, `action` (3 valores enum), `createdAt`, `metadata`, `ipAddress` (hex HMAC-SHA256 OR null), `userAgent` (≤ 512 chars OR null). Filtros: `actorId`, `targetId`, `action`, `since`, `until`, `limit` (default 50, max 200), `offset` (default 0). Protegido por `role=ADMIN`.

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

#### Scenario: Max limit clampeado

- GIVEN un admin
- WHEN corre `?limit=500`
- THEN el límite efectivo es 200

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

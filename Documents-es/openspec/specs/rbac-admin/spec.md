# Especificación de RBAC Admin

## Propósito

Define las operaciones de rol admin expuestas por la API: listar usuarios, cambiar el rol de un usuario y persistir cada acción admin en una fila de `AdminAuditEvent` para revisión retrospectiva.

## Requisitos

### Requirement: Listar usuarios con rol

`GET /admin/users` DEBE retornar todos los usuarios ordenados DESC por `createdAt` con `id`, `email`, `role`, `createdAt`. Soporta paginación `?limit=<n>&offset=<n>` (default `limit=50`). Guardia `role=ADMIN`.

#### Scenario: Listado por defecto

- GIVEN admin + 3 usuarios
- WHEN se invoca
- THEN retorna 200 ordenado DESC por `createdAt`

#### Scenario: Vacío

- GIVEN admin + 0 usuarios
- WHEN se invoca
- THEN retorna 200 con `[]`

#### Scenario: Rol prohibido

- GIVEN no-admin
- WHEN se invoca
- THEN retorna 403

#### Scenario: Paginación

- GIVEN admin + 50 usuarios
- WHEN se invoca con `?limit=10&offset=20`
- THEN retorna 200 con 10 usuarios, saltando los primeros 20

### Requirement: Cambiar rol de usuario

`POST /admin/users/:userId/role` con body `{ role: "USER" | "ADMIN" }` DEBE actualizar el rol e insertar `AdminAuditEvent` con `action: "CHANGE_ROLE"`, `metadata: { from: <oldRole>, to: <newRole> }`. Auto-demotion permitida. Guardia `role=ADMIN`.

#### Scenario: Promover

- GIVEN admin + un USER
- WHEN se setea rol `ADMIN`
- THEN retorna 200, DB actualizada, audit

#### Scenario: Degradar

- GIVEN admin + otro ADMIN
- WHEN se setea rol `USER`
- THEN retorna 200, DB actualizada, audit

#### Scenario: Auto-demotion

- GIVEN admin
- WHEN admin setea su propio rol a `USER`
- THEN retorna 200, rol actualizado, audit

#### Scenario: Rol inválido

- GIVEN admin
- WHEN rol es `GOD`
- THEN retorna 400 con error de validación, sin audit

#### Scenario: Idempotente

- GIVEN admin + un USER
- WHEN rol es `USER`
- THEN retorna 200 y no se inserta audit

#### Scenario: Usuario desconocido

- GIVEN admin + userId desconocido
- WHEN se invoca
- THEN retorna 404, sin audit

### Requirement: Almacenamiento de Admin Audit Event

Cada operación admin DEBE persistirse en `AdminAuditEvent` con `actorId` (UUID), `targetId` (UUID), `action` (`REVOKE_SESSION` | `REVOKE_ALL_SESSIONS` | `CHANGE_ROLE`), `createdAt` (now), `metadata` (JSON), `ipAddress` (≤ 45 chars), `userAgent` (≤ 512 chars). La tabla DEBE tener índice sobre `createdAt DESC`.

#### Scenario: Fila REVOKE_SESSION

- GIVEN una invocación de revoke-single
- WHEN la operación completa
- THEN se inserta una fila con los 7 campos poblados

#### Scenario: Fila REVOKE_ALL_SESSIONS

- GIVEN una invocación de revoke-all
- WHEN la operación completa
- THEN se inserta una fila con `metadata.revokedCount`

#### Scenario: Fila CHANGE_ROLE

- GIVEN una invocación de cambio de rol
- WHEN la operación completa
- THEN se inserta una fila con `metadata.from` y `metadata.to`

#### Scenario: Redacción de IP

- GIVEN una línea de log pino con una IP de actor
- WHEN se emite la línea
- THEN la IP se renderiza como `ip: [REDACTED]`

#### Scenario: Truncado de user-agent

- GIVEN un user-agent mayor a 512 chars
- WHEN se inserta la fila de audit
- THEN el `userAgent` almacenado se trunca a 512 chars

## Procedencia

Introducido por: module-3-superadmin, 2026-07-18.

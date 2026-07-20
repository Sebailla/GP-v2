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

`POST /admin/users/:userId/role` con body `{ role: "USER" | "ADMIN" }` DEBE actualizar el rol e insertar `AdminAuditEvent` con `action: "CHANGE_ROLE"`, `metadata: { from: <oldRole>, to: <newRole> }`. Auto-demotion permitida. Guardia `role=ADMIN`. La operación `changeRole` DEBE estar envuelta en un `$transaction` de Prisma corriendo al nivel de aislamiento `Serializable` (o transacción `SERIALIZABLE` a nivel de base de datos). El invariante del último admin (rechazar demoteo del único admin restante) DEBE re-verificarse DENTRO de la transacción, no antes, para que dos demoteos concurrentes no puedan pasar ambos el chequeo de conteo. Si la transacción falla con un error de serialización (Postgres SQLSTATE `40001`), el sistema DEBE reintentar hasta 3 veces con backoff exponencial. Tras 3 reintentos, el sistema DEBE retornar 503 Service Unavailable con un cuerpo de error localizado.

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

#### Scenario: Salvaguardia del último admin

- GIVEN solo 1 admin en el sistema
- WHEN cualquier caller intenta degradar a ese admin
- THEN retorna 409 con `LastAdminError` y no ocurre cambio de rol

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

#### Scenario: Demoteos concurrentes — exactamente uno tiene éxito

- GIVEN 2 admins intentan degradarse mutuamente en simultáneo
- WHEN ambas llamadas `POST /admin/users/:userId/role` se ejecutan en paralelo
- THEN exactamente un demoteo tiene éxito (200 + fila de audit)
- AND el otro retorna 409 (o 503 por reintentos agotados) sin estado parcial

#### Scenario: Reintento exitoso ante error transitorio de serialización

- GIVEN un SQLSTATE `40001` transitorio inyectado solo en el primer intento
- WHEN corre `changeRole`
- THEN la operación reintenta y tiene éxito en el 2.º intento (200 + fila de audit)

#### Scenario: Reintentos agotados → 503

- GIVEN 3 errores consecutivos SQLSTATE `40001` de serialización
- WHEN corre `changeRole`
- THEN retorna 503 con un cuerpo de error localizado `serialization_failed`
- AND no persiste estado parcial

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
Extendido por: module-5-production-hardening, 2026-07-20 (1 requisito modificado: Cambiar rol de usuario — restricción Serializable F2 con reintentos ante Postgres SQLSTATE 40001).

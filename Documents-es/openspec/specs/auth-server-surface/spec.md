# Especificación de la Superficie de Auth del Server

## Propósito

Define el comportamiento observable del wiring de auth del lado API que sostiene el módulo de autenticación pública: cómo el servicio de password reset compone el cuerpo del email y cómo la factory de configuración de NextAuth expone su ruta `pages.signIn` y su provider Google, evaluados contra las credenciales de runtime.

## Requisitos

### Requirement: Body del email de reset consciente del locale

El body del email de `passwordResetService.requestReset()` DEBE embeber el locale activo del request en la URL de reset. La forma del path de la URL de reset DEBE ser `/{locale}/reset-password/<token>`. La invocación de `MailAdapter.send` DEBE dispararse a través del `MailAdapter` vinculado (Gmail en producción, console en dev/test) en lugar de un camino solo-evento de slice-3.

#### Scenario: URL de reset embebe el locale activo

- GIVEN un usuario registrado con email `u@example.com`
- AND el locale del request es `es`
- WHEN corre `PasswordResetService.requestReset("u@example.com")`
- THEN el payload del email contiene una URL cuya ruta comienza con `/es/reset-password/`
- AND el token raw se incluye exactamente una vez

#### Scenario: URL de reset refleja un locale inglés

- GIVEN el locale del request es `en`
- WHEN corre `requestReset`
- THEN el payload del email contiene una URL cuya ruta comienza con `/en/reset-password/`

#### Scenario: Email desconocido sigue sin mintear nada

- GIVEN ningún usuario matchea `nobody@example.com`
- WHEN corre `requestReset("nobody@example.com")`
- THEN no se crea ninguna fila de token
- AND `MailAdapter.send` NO se invoca
- AND la llamada resuelve sin lanzar

### Requirement: NextAuth Config cableada a sign-in con locale y OAuth real

La salida de `buildAuthConfig()` DEBE setear `pages.signIn` al factory consciente del locale `/[locale]/sign-in`. El provider Google DEBE registrarse cuando `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` sean no vacíos; el botón de Google sign-in en el `LoginForm` DEBE estar visible en sincronía con ese registro.

#### Scenario: `pages.signIn` apunta a la ruta con locale

- GIVEN el proceso de la API arranca
- WHEN corre `buildAuthConfig()`
- THEN `config.pages.signIn` es igual a `/[locale]/sign-in` (o el factory canónico que produce el mismo path)

#### Scenario: Provider Google se registra solo cuando hay credenciales

- GIVEN `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` son no vacíos
- WHEN corre `buildAuthConfig()`
- THEN el array de providers contiene el provider `Google`
- AND se renderiza el botón de Google del `LoginForm`

#### Scenario: Provider Google se omite cuando faltan credenciales

- GIVEN `GOOGLE_CLIENT_ID` o `GOOGLE_CLIENT_SECRET` están vacíos
- WHEN corre `buildAuthConfig()`
- THEN el array de providers NO contiene `Google`
- AND el `LoginForm` NO DEBE renderizar el botón de Google

### Requirement: Listado de sesiones por usuario

`GET /admin/sessions?userId=<uuid>` retorna sesiones ordenadas DESC por `lastActiveAt` con `id`, `userId`, `createdAt`, `lastActiveAt`, `userAgent`, `ipAddress`. Guardia `role=ADMIN`.

#### Scenario: Ordenado

- GIVEN admin + 3 sesiones
- WHEN se invoca
- THEN retorna 200 DESC

#### Scenario: Vacío

- GIVEN admin + 0 sesiones
- WHEN se invoca
- THEN retorna 200 con `[]`

#### Scenario: No-admin

- GIVEN no-admin
- WHEN se invoca
- THEN retorna 403

#### Scenario: Desconocido

- GIVEN admin + userId desconocido
- WHEN se invoca
- THEN retorna 404

### Requirement: Revocar una sesión

`DELETE /admin/sessions/:sessionId` elimina la fila, dispara `auth.session.revoked`, inserta `AdminAuditEvent` con `action: "REVOKE_SESSION"`. Guardia `role=ADMIN`. Auto-revocación permitida.

#### Scenario: Conocida

- GIVEN admin + sesión existente
- WHEN se invoca
- THEN retorna 204, fila eliminada, audit

#### Scenario: Desconocida

- GIVEN admin + sessionId desconocido
- WHEN se invoca
- THEN retorna 404, sin audit

#### Scenario: Auto

- GIVEN admin revocando su propia sesión
- WHEN se invoca
- THEN retorna 204 con `Set-Cookie` limpiando el token

#### Scenario: No-admin

- GIVEN no-admin
- WHEN se invoca
- THEN retorna 403

### Requirement: Revocar todas las sesiones de un usuario

`DELETE /admin/sessions/user/:userId` elimina cada sesión e inserta `AdminAuditEvent` con `action: "REVOKE_ALL_SESSIONS"`. Guardia `role=ADMIN`.

#### Scenario: 3 sesiones

- GIVEN admin + 3 sesiones
- WHEN se invoca
- THEN retorna 204, 3 eliminadas, `revokedCount: 3`

#### Scenario: 0 sesiones

- GIVEN admin + 0 sesiones
- WHEN se invoca
- THEN retorna 204, `revokedCount: 0`

#### Scenario: Auto-total

- GIVEN admin revocando sus sesiones
- WHEN se invoca
- THEN retorna 204, cookie limpiada, audit

#### Scenario: No-admin

- GIVEN no-admin
- WHEN se invoca
- THEN retorna 403

### Requirement: Actualización de lastActiveAt de la sesión

El sistema DEBE actualizar `Session.lastActiveAt` al timestamp actual en cada invocación exitosa de `validateSession(sessionToken)` cuando el `lastActiveAt` existente es NULL O fue escrito por última vez hace más de 60 segundos. La actualización DEBE estar coalescida (una escritura por sesión por ventana de 60s) para acotar la amplificación de escrituras en el hot path de validación de sesión. El sistema DEBE usar este campo `lastActiveAt` para ordenar los listados de sesiones de admin (`GET /admin/sessions?userId=<uuid>`) — el proxy anterior `expires DESC` está deprecado.

#### Scenario: Actualización con lastActiveAt obsoleto

- GIVEN una sesión con `lastActiveAt` con más de 60 segundos de antigüedad
- WHEN `validateSession(sessionToken)` tiene éxito
- THEN `lastActiveAt` se escribe con el timestamp actual
- AND ningún otro campo de la sesión cambia

#### Scenario: Coalesce dentro de la ventana de 60s

- GIVEN una sesión con `lastActiveAt` seteado hace 10 segundos
- WHEN `validateSession` tiene éxito una segunda vez
- THEN no ocurre ninguna escritura sobre `lastActiveAt`
- AND la respuesta es idéntica a la primera llamada

#### Scenario: Auto-validación por admin

- GIVEN un admin cuya propia sesión tiene `lastActiveAt` con más de 60 segundos de antigüedad
- WHEN `validateSession` tiene éxito sobre esa sesión
- THEN el comportamiento de coalesce + escritura aplica idénticamente

#### Scenario: Skip cuando lastActiveAt es reciente

- GIVEN una sesión con `lastActiveAt` seteado hace 5 segundos
- WHEN `validateSession` tiene éxito
- THEN no ocurre ninguna escritura sobre `lastActiveAt`

#### Scenario: Listado admin ordenado por lastActiveAt DESC

- GIVEN un admin y un usuario con múltiples sesiones (algunas con `lastActiveAt`, otras sin)
- WHEN el admin invoca `GET /admin/sessions?userId=<uuid>`
- THEN el array se ordena DESC por `lastActiveAt`
- AND las sesiones con `lastActiveAt IS NULL` se ordenan al final

### Requirement: Proyección del listado de sesiones

La respuesta de `GET /admin/sessions?userId=<uuid>` DEBE retornar cada sesión como objeto JSON con los siguientes campos: `id` (string UUID), `userId` (string UUID), `createdAt` (timestamp ISO 8601), `lastActiveAt` (timestamp ISO 8601 OR null), `userAgent` (string, máximo 512 chars OR null), `ipAddress` (string, máximo 64 chars HMAC hash OR null). La proyección previa `{ id, userId, sessionToken, expires }` está deprecada — el controller ya no expone `sessionToken` a clientes admin, y la respuesta usa la forma literal de la spec.

#### Scenario: Proyección literal de la spec

- GIVEN un admin y un usuario con sesiones activas
- WHEN el admin invoca `GET /admin/sessions?userId=<uuid>`
- THEN retorna 200 con un array de objetos conteniendo exactamente los 6 campos literales de la spec
- AND `sessionToken` NO está presente en ningún objeto

#### Scenario: Listado vacío

- GIVEN un admin y un usuario sin sesiones
- WHEN el admin invoca `GET /admin/sessions?userId=<uuid>`
- THEN retorna 200 con `[]`

#### Scenario: User-agent truncado a 512 chars

- GIVEN una sesión con `userAgent` de más de 512 caracteres
- WHEN el admin lista las sesiones
- THEN el `userAgent` de la respuesta se trunca a 512 caracteres

#### Scenario: IP renderizada como hex HMAC

- GIVEN una sesión con `ipAddress` capturado
- WHEN el admin lista las sesiones
- THEN el `ipAddress` de la respuesta es el digest hex HMAC-SHA256 de 64 chars en minúsculas
- AND la IP raw NO está presente en la respuesta

## Procedencia

Introducido por: module-2-public-auth, 2026-07-17 (línea base slice-3).
Extendido por: module-3-superadmin, 2026-07-18 (gestión sesiones admin).
Extendido por: module-4-privacy, 2026-07-19 (2 NUEVOS requisitos: Actualización de lastActiveAt de la sesión + Proyección del listado de sesiones).

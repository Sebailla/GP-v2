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

## Procedencia

Introducido por: module-2-public-auth, 2026-07-17 (línea base slice-3).
Extendido por: module-3-superadmin, 2026-07-18 (gestión sesiones admin).

# Especificación del Flujo de Reset de Password

## Propósito

Define el comportamiento observable del flujo de reset de password de extremo a extremo: `POST /auth/forgot-password` → email con locale → el usuario hace clic en el link de reset → `POST /auth/reset-password` → nueva credencial → sesión fresca → redirect al app.

## Requisitos

### Requirement: Envío de forgot-password

El sistema DEBE aceptar `POST /auth/forgot-password` con un payload de email, invocar el `MailAdapter` vinculado para entregar un email de reset consciente del locale cuando el email esté registrado, y responder 200 independientemente de si el email está registrado (para evitar enumeración).

#### Scenario: Email registrado dispara un email de reset con locale

- GIVEN existe un usuario con email `u@example.com`
- AND el `Accept-Language` (o locale explícito) del request es `es`
- WHEN el cliente postea `{ "email": "u@example.com" }` a `/auth/forgot-password`
- THEN la respuesta es 200
- AND `MailAdapter.send` se invoca exactamente una vez
- AND el cuerpo del email contiene una URL de reset cuya ruta comienza con `/es/reset-password/`

#### Scenario: Email desconocido se ignora silenciosamente

- GIVEN no existe un usuario para `nobody@example.com`
- WHEN el cliente postea `{ "email": "nobody@example.com" }` a `/auth/forgot-password`
- THEN la respuesta es 200
- AND `MailAdapter.send` NO se invoca

### Requirement: Consumo del token de reset-password

El sistema DEBE aceptar `POST /auth/reset-password` con `{ token, password }`. En éxito el token DEBE marcarse consumido (un solo uso), la credencial almacenada DEBE reemplazarse, una cookie de sesión DEBE setearse y el usuario DEBE ser redirigido a `/{locale}/(app)`.

La URL de reset por la que un usuario navega a `GET /[locale]/reset-password/<token>` DEBE renderizar el formulario de reset localizado antes de cualquier envío.

#### Scenario: Token válido reemplaza credencial e inicia sesión

- GIVEN un token de reset no expirado y no consumido, emitido para un email conocido
- WHEN el cliente postea `{ "token": "<raw>", "password": "<cumple-politica>" }` a `/auth/reset-password`
- THEN el hash de password almacenado se reemplaza
- AND el token se marca consumido
- AND se setea la cookie de sesión
- AND la respuesta redirige a `/{locale}/(app)` para el locale activo

#### Scenario: Token expirado se rechaza

- GIVEN un token de reset cuyo `expiresAt` está en el pasado
- WHEN el cliente postea un request de reset-password con ese token
- THEN la respuesta es 400 con un mensaje localizado de "token expirado"
- AND no persiste ningún cambio de credencial

#### Scenario: Token malformado se rechaza genéricamente

- GIVEN un token desconocido o sintácticamente inválido
- WHEN el cliente postea un request de reset-password con ese token
- THEN la respuesta es 400 con un mensaje localizado genérico de "token inválido"
- AND el copy de error NO DEBE revelar si el token existió o expiró

### Requirement: Fallo en la entrega del email de reset

El sistema DEBE responder 502 al cliente cuando el `MailAdapter.send` vinculado rechace en el camino de forgot-password. El fallo DEBE loggearse vía `@core/logging` con el email redactado. El binding de `ConsoleMailAdapter` usado en `development` y `test` NO DEBE propagar un fallo sintético de envío al cliente.

#### Scenario: Fallo SMTP de Gmail devuelve 502

- GIVEN `NODE_ENV=production` con el runtime de mail vinculado al adapter de Gmail
- AND el transporte SMTP subyacente rechaza `send`
- WHEN el cliente postea a `/auth/forgot-password`
- THEN la respuesta es 502 con un error localizado genérico
- AND la línea estructurada de log contiene el email redactado y el código de error SMTP

#### Scenario: Binding Console en dev/test no se ve afectado

- GIVEN `NODE_ENV=development`
- AND el runtime de mail vinculado al adapter de console
- WHEN el cliente postea a `/auth/forgot-password` para un email registrado
- THEN la respuesta es 200 y la línea de consola incluye la URL de reset con locale

## Procedencia

Introducido por: module-2-public-auth, 2026-07-17; comportamiento base de slice-3 / M1 T1.12.

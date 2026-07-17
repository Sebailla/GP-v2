# Especificación del Port de Mail Adapter

## Propósito

Define el comportamiento observable del port `MailAdapter` y sus bindings concretos: cómo `GmailMailAdapter` entrega efectivamente los mensajes y cómo `MailModule` selecciona el adapter correcto para el entorno actual, de modo que los envíos accidentales a Gmail en producción se prevengan con un opt-out explícito.

## Requisitos

### Requirement: Envío real del adapter de Gmail

El método `GmailMailAdapter.send()` DEBE entregar el mensaje suministrado vía un transporte `nodemailer` configurado con `service: "gmail"` y autenticado por `GMAIL_USER` + `GMAIL_APP_PASSWORD`. Ante un fallo SMTP el rechazo DEBE propagarse al caller con el error de transporte subyacente preservado.

#### Scenario: Gmail send usa nodemailer con service=gmail

- GIVEN `GMAIL_USER=user@gmail.com` y `GMAIL_APP_PASSWORD=<app-password>` están seteadas
- WHEN corre `GmailMailAdapter.send({ to, subject, text, html })`
- THEN se usa un transporte `nodemailer.createTransport({ service: "gmail" })`
- AND el envelope SMTP subyacente es `from: no-reply@<PRODUCT_DOMAIN>` y `to: <to>`

#### Scenario: Gmail send propaga fallo SMTP

- GIVEN el transporte de Gmail rechaza `send` con un error SMTP
- WHEN corre `GmailMailAdapter.send(...)`
- THEN la promesa retornada rechaza con el error SMTP subyacente preservado

### Requirement: Binding de MailModule por entorno

El `MailModule` DEBE vincular el port `MailAdapter` según las siguientes reglas, evaluadas en orden:

1. Cuando `MAIL_DSN` esté seteado a cualquier valor no vacío, vincular `ConsoleMailAdapter` (opt-out del developer — se previenen envíos accidentales a Gmail).
2. Else cuando `NODE_ENV=production`, vincular `GmailMailAdapter`.
3. Else (`development` o `test`), vincular `ConsoleMailAdapter`.

#### Scenario: Producción sin MAIL_DSN vincula Gmail

- GIVEN `NODE_ENV=production`
- AND `MAIL_DSN` no está seteado
- WHEN `MailModule` resuelve el token `MAIL_ADAPTER`
- THEN el adapter vinculado es `GmailMailAdapter`

#### Scenario: Dev o test vincula Console

- GIVEN `NODE_ENV` es `development` o `test`
- WHEN `MailModule` resuelve el token `MAIL_ADAPTER`
- THEN el adapter vinculado es `ConsoleMailAdapter`

#### Scenario: MAIL_DSN explícito fuerza Console en cualquier entorno

- GIVEN `MAIL_DSN` está seteado a un valor no vacío
- WHEN `MailModule` resuelve el token `MAIL_ADAPTER`
- THEN el adapter vinculado es `ConsoleMailAdapter` independientemente de `NODE_ENV`

## Procedencia

Introducido por: module-2-public-auth, 2026-07-17; comportamiento base de slice-3 / M1 T1.12.

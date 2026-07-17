# Mail Adapter Port Specification

## Purpose

Defines the observable behavior of the `MailAdapter` port and its concrete bindings: how `GmailMailAdapter` actually delivers messages and how `MailModule` selects the right adapter for the current environment, so accidental production Gmail sends are prevented by an explicit opt-out.

## Requirements

### Requirement: Gmail Mail Adapter Real Send

The `GmailMailAdapter.send()` method MUST deliver the supplied message via a `nodemailer` transport configured with `service: "gmail"` and authenticated by `GMAIL_USER` + `GMAIL_APP_PASSWORD`. On SMTP failure the rejection MUST propagate to the caller with the underlying transport error preserved.

#### Scenario: Gmail send uses nodemailer with service=gmail

- GIVEN `GMAIL_USER=user@gmail.com` and `GMAIL_APP_PASSWORD=<app-password>` are set
- WHEN `GmailMailAdapter.send({ to, subject, text, html })` runs
- THEN a `nodemailer.createTransport({ service: "gmail" })` transport is used
- AND the underlying SMTP envelope is `from: no-reply@<PRODUCT_DOMAIN>` and `to: <to>`

#### Scenario: Gmail send propagates SMTP failure

- GIVEN the Gmail transport rejects `send` with an SMTP error
- WHEN `GmailMailAdapter.send(...)` runs
- THEN the returned promise rejects with the underlying SMTP error preserved

### Requirement: Mail Module Binding by Environment

The `MailModule` MUST bind the `MailAdapter` port according to the following rules, evaluated in order:

1. When `MAIL_DSN` is set to any non-empty value, bind `ConsoleMailAdapter` (developer opt-out — accidental Gmail sends are prevented).
2. Else when `NODE_ENV=production`, bind `GmailMailAdapter`.
3. Else (`development` or `test`), bind `ConsoleMailAdapter`.

#### Scenario: Production without MAIL_DSN binds Gmail

- GIVEN `NODE_ENV=production`
- AND `MAIL_DSN` is unset
- WHEN `MailModule` resolves the `MAIL_ADAPTER` token
- THEN the bound adapter is `GmailMailAdapter`

#### Scenario: Dev or test binds Console

- GIVEN `NODE_ENV` is `development` or `test`
- WHEN `MailModule` resolves the `MAIL_ADAPTER` token
- THEN the bound adapter is `ConsoleMailAdapter`

#### Scenario: Explicit MAIL_DSN forces Console in any environment

- GIVEN `MAIL_DSN` is set to a non-empty value
- WHEN `MailModule` resolves the `MAIL_ADAPTER` token
- THEN the bound adapter is `ConsoleMailAdapter` regardless of `NODE_ENV`

## Provenance

Introduced by: module-2-public-auth, 2026-07-17; baseline behavior from slice-3 / M1 T1.12.

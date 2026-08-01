# Propuesta — `module-2-public-auth`

Rastreador `feat/public-authentication` desde `develop@cc74210`. Cadena `feature-branch-chain`. 400 LOC/PR. TDD estricto.

---

## Intención

M2 = **superficie pública** sobre el servidor M1: Google OAuth real, `GmailMailAdapter` → `nodemailer`, reset real vía Gmail, NextAuth consciente del locale, UI completa + WCAG AA + Playwright EN/ES E2E (AGENTS.md §9).

## Alcance

### Dentro del alcance
OAuth `/api/auth/callback/google` + JWT + account-link; `GmailMailAdapter` → `nodemailer({ service: "gmail" })` + env Gmail; reset real vía Gmail; locale `pages.signIn` + Google; 5 estados de formulario; axe-core; espejo ES; runbook de rotación.

### Fuera del alcance
Sesiones, RBAC, auditoría → M3. Privacidad/export → M4. FX, hardening, carga, cookie `secure`, Google real → M5/M6. i18n > `en`+`es`, multi-OAuth, Sentry/OTel → AGENTS.md §11.

## Capacidades

### Capacidades nuevas
- `google-oauth-handshake`: callback de Google + JWT + `pages.signIn` con locale.
- `password-reset-user-flow`: forgot → Gmail → token → cookie.
- `nextauth-web-routes`: handlers con locale + callback URL.

### Capacidades modificadas
- `auth-server-surface`: cableado `auth.config.ts` + reset → Gmail.
- `mail-adapter-port`: `GmailMailAdapter.send()` real; `ConsoleMailAdapter` como fallback de test.

## Enfoque

5 PRs encadenados (≤ 400 LOC): locale `pages.signIn` → `GmailMailAdapter` `nodemailer` → reset e2e → handshake con Google → E2E vertical + runbook + espejo ES.

Disciplina heredada (M1): pino, `next-auth/jwt#decode` try/catch, `.overrideProvider(TOKEN).useValue(InMemoryAdapter)`, sin `PrismaClient` fuera de core, sin cross-module / `*/server` desde `client/`.

## Áreas afectadas

`apps/web/auth.ts`, `apps/web/app/[locale]/(auth)/*`, `apps/api/src/lib/auth.config.ts`, `apps/api/src/mail/{gmail-mail.adapter,mail.module}.ts`, `apps/api/src/modules/auth/auth.controller.ts`, `libs/core/config/env.schema.ts` (agregar env Gmail), `libs/features/auth/server/src/password-reset.service.ts` (locale en la URL del token), `docs/{architecture.md,operations/auth-runbook.md}` + espejos ES, `openspec/changes/module-2-public-auth/*`.

## Riesgos

Google `client-id` (Med) → `isGoogleConfigured()` + mock. Gmail bloquea tests (Med) → console en dev/test + `nodemailer-mock` en RED. URL del reset con locale (Low) → RED. Drift del encadenado de PRs (Low) → rebase `feature-branch-chain`.

## Rollback

`git revert` del encadenado en `develop` (5 atómicos). Deshabilitar Google (unsetear creds). Deshabilitar Gmail (vincular `MailModule` → `ConsoleMailAdapter`; staging revincula al restaurar env). Sin cambios de esquema → sin migración.

## Dependencias

`nodemailer` (ya en `apps/api/package.json`). Env nuevas: `GMAIL_USER`, `GMAIL_APP_PASSWORD` (opcional dev/test, requerido staging). Existentes: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_WEB_URL`, `MAIL_DSN`.

## Criterios de éxito

- [ ] `turbo run build lint typecheck test bdd e2e` → 0; `lint:fixtures` → 0.
- [ ] `@axe-core/playwright` → 0 serios/críticos por superficie.
- [ ] E2E: sign-up → login → forgot → dev-mailbox → reset → cookie → `/[locale]/(app)`.
- [ ] Rate-limit sin cambios desde M1: 10 req / 60 s por IP en `/auth/{login,register,forgot-password}`.
- [ ] `POST /auth/forgot-password` dispara `MailAdapter.send` (Gmail prod, console dev/test).
- [ ] 5 estados de formulario por formulario; espejo ES; sin CJK en `Documents-es/`.

## Decisiones de producto

- **Redirect post sign-in**: `/[locale]/(app)` (dashboard).
- **Rate-limit**: defaults de M1 (10 req / 60 s) en los tres endpoints.
- **OAuth E2E**: M2 = mock con forma de redirect de NextAuth (redirect, account-link, JWT). Real → M6.
- **Email de reset**: producto-friendly; `no-reply@<PRODUCT_DOMAIN>` vía Gmail; botón CTA + URL en texto plano.

# Proposal — `module-2-public-auth`

Tracker `feat/public-authentication` from `develop@cc74210`. Chain `feature-branch-chain`. 400 LOC/PR. Strict TDD.

---

## Intent

M2 = **public surface** on the M1 server: real Google OAuth, `GmailMailAdapter` → `nodemailer`, real reset via Gmail, locale-aware NextAuth, full UI + WCAG AA + Playwright EN/ES E2E (AGENTS.md §9).

## Scope

### In scope
OAuth `/api/auth/callback/google` + JWT + account-link; `GmailMailAdapter` → `nodemailer({ service: "gmail" })` + Gmail env; real reset via Gmail; locale `pages.signIn` + Google; 5 form states; axe-core; ES mirror; rotation runbook.

### Out of scope
Sessions, RBAC, audit → M3. Privacy/export → M4. FX, hardening, load, `secure` cookie, real-Google → M5/M6. i18n > `en`+`es`, multi-OAuth, Sentry/OTel → AGENTS.md §11.

## Capabilities

### New Capabilities
- `google-oauth-handshake`: Google callback + JWT + locale `pages.signIn`.
- `password-reset-user-flow`: forgot → Gmail → token → cookie.
- `nextauth-web-routes`: locale handlers + callback URL.

### Modified Capabilities
- `auth-server-surface`: wiring `auth.config.ts` + reset → Gmail.
- `mail-adapter-port`: `GmailMailAdapter.send()` real; `ConsoleMailAdapter` test fallback.

## Approach

5 chained PRs (≤ 400 LOC): `pages.signIn` locale → `GmailMailAdapter` `nodemailer` → reset e2e → Google handshake → vertical E2E + runbook + ES mirror.

Carry-forward (M1): pino, `next-auth/jwt#decode` try/catch, `.overrideProvider(TOKEN).useValue(InMemoryAdapter)`, no `PrismaClient` outside core, no cross-module / `*/server` from `client/`.

## Affected Areas

`apps/web/auth.ts`, `apps/web/app/[locale]/(auth)/*`, `apps/api/src/lib/auth.config.ts`, `apps/api/src/mail/{gmail-mail.adapter,mail.module}.ts`, `apps/api/src/modules/auth/auth.controller.ts`, `libs/core/config/env.schema.ts` (add Gmail env), `libs/features/auth/server/src/password-reset.service.ts` (locale in token URL), `docs/{architecture.md,operations/auth-runbook.md}` + ES mirrors, `openspec/changes/module-2-public-auth/*`.

## Risks

Google `client-id` (Med) → `isGoogleConfigured()` + mock. Gmail blocks tests (Med) → console in dev/test + `nodemailer-mock` in RED. Reset URL locale (Low) → RED. PR-chain drift (Low) → `feature-branch-chain` rebase.

## Rollback

`git revert` chain into `develop` (5 atomic). Disable Google (unset creds). Disable Gmail (bind `MailModule` → `ConsoleMailAdapter`; staging re-binds). No DB → no migration.

## Dependencies

`nodemailer` (already in `apps/api/package.json`). New env: `GMAIL_USER`, `GMAIL_APP_PASSWORD` (optional dev/test, required staging). Existing: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_WEB_URL`, `MAIL_DSN`.

## Success Criteria

- [ ] `turbo run build lint typecheck test bdd e2e` → 0; `lint:fixtures` → 0.
- [ ] `@axe-core/playwright` → 0 serious/critical per surface.
- [ ] E2E: sign-up → login → forgot → dev-mailbox → reset → cookie → `/[locale]/(app)`.
- [ ] Rate-limit unchanged from M1: 10 req / 60 s per IP on `/auth/{login,register,forgot-password}`.
- [ ] `POST /auth/forgot-password` triggers `MailAdapter.send` (Gmail prod, console dev/test).
- [ ] 5 form states per form; ES mirror; no CJK in `Documents-es/`.

## Product decisions

- **Redirect post sign-in**: `/[locale]/(app)` (dashboard).
- **Rate-limit**: M1 defaults (10 req / 60 s) on all three endpoints.
- **OAuth E2E**: M2 = NextAuth-redirect-shape mock (redirect, account-link, JWT). Real → M6.
- **Reset email**: producto-friendly; `no-reply@<PRODUCT_DOMAIN>` via Gmail; CTA button + plain-text URL.

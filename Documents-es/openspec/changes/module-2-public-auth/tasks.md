# Tareas — `module-2-public-auth`

> Borrador · tareas · tracker `feat/public-authentication` desde `develop@cc74210` · hybrid · auto · 2026-07-17 · TDD estricto.

## Pronóstico de Carga de Revisión

| Campo | Valor |
| --- | --- |
| Líneas estimadas a cambiar | ~1500–2500 (37 archivos, 5 PRs) |
| Riesgo de presupuesto 400 líneas | Alto |
| PRs encadenados recomendados | Sí |
| División sugerida | PR1 locale sign-in → PR2 adaptador Gmail → PR3 reset e2e → PR4 handshake Google → PR5 E2E vertical + runbook |
| Estrategia de entrega | auto-chain |
| Estrategia de chain | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Bases de PR: #1=`feat/public-authentication`; #2=#1; #3=#2; #4=#3; #5=#4. Merge final a `develop` tras aprobar los 5.

## Disciplina acumulada + amenaza→RED

TDD estricto RED→GREEN→TRIANGULATE→REFACTOR; commits atómicos; pino `[email]`; try/catch en `next-auth/jwt#decode`; `.overrideProvider(TOKEN).useValue(InMemoryAdapter)`; alias next-intl + Turbopack condicional; Playwright web + Vitest NestJS API e2e; reglas de boundary ESLint; 5 estados + WCAG AA; mirror ES mismo commit, 0 CJK. Routing → Phase 3+4 RED; Config/D7 → Phase 2 RED.

## Fase 1 — Locale NextAuth Web Wiring (PR #1)

Base `feat/public-authentication`. Verificar `pnpm --filter web test SignInClient`.

- [ ] 1.1 RED `SignInClient.test.tsx`: enrutamiento por locale + ocultar botón Google cuando faltan credenciales.
- [ ] 1.2 GREEN `auth.ts` mantener defaults (sin override `pages.signIn`); `middleware.ts` locale ausente → `/en/sign-in`; autenticado → `/{locale}/(app)`.
- [ ] 1.3 GREEN `[locale]/(auth)/sign-in/page.tsx` + `SignInClient.tsx`: `next-intl`, 5 estados, formulario credentials, `signIn("google",{callbackUrl:"/{locale}/(app)"})`.
- [ ] 1.4 TRIANGULATE `[locale]/(auth)/error/page.tsx`: `callbackUrl` ajeno → `pages.error` localizado.
- [ ] 1.5 REFACTOR `googleEnabled()` + `config.turbo.resolveAlias` condicional en `next.config.ts`.

## Fase 2 — Adaptador Gmail Mail + Env (PR #2)

Base PR #1. Verificar `pnpm --filter api test mail`.

- [x] 2.1 RED `env-refine.test.ts` 4 permutaciones: prod+sin DSN+Gmail ok; prod+sin DSN+Gmail falta → `ZodError`; dev+Gmail falta ok; `MAIL_DSN` → Gmail irrelevante.
- [x] 2.2 GREEN `env.schema.ts` añadir `GMAIL_USER`+`GMAIL_APP_PASSWORD`; `productionEnvSchema.superRefine` exige ambos cuando `NODE_ENV==="production" && !MAIL_DSN`; añadir placeholders en `.env.example`.
- [x] 2.3 RED `gmail-mail.adapter.test.ts`: `nodemailer.createTransport({service:"gmail}")`; envelope `from: no-reply@<PRODUCT_DOMAIN>`; rechazo SMTP propagado.
- [x] 2.4 GREEN reescribir `gmail-mail.adapter.ts`; pino bracket `[email]` en error.
- [x] 2.5 RED `mail.module.test.ts` precedencia D3; GREEN `mail.module.ts`; mantener `ConsoleMailAdapter`.
- [x] 2.6 `apps/api/package.json`: `nodemailer@^6.9.16` + `@types/nodemailer@^6.4.17` + `nodemailer-mock@^1.5.11`.

## Fase 3 — Flujo de Reset End-to-End (PR #3)

Base PR #2. Verificar `pnpm --filter api test forgot-password && pnpm --filter api test reset-password`.

- [x] 3.1 RED `password-reset.service.test.ts`: `requestReset(email, locale)` acuña `/es/reset-password/<token>` + `/en/...`; email desconocido no acuña nada.
- [x] 3.2 GREEN modificar `password-reset.service.ts` `requestReset(email, locale)`; token crudo en payload del evento.
- [x] 3.3 RED `forgot-password.e2e-spec.ts`: `MailAdapter.send` una vez; URL con locale; 4ª llamada → 429.
- [x] 3.4 GREEN `auth.controller.ts` `forgotPassword` lee `Accept-Language`; `.overrideProvider(MAIL_ADAPTER).useValue(InMemoryAdapter)` en e2e.
- [x] 3.5 RED `reset-password.e2e-spec.ts`: `Set-Cookie: authjs.session-token=...; HttpOnly; SameSite=Lax` + `{redirectTo:"/en/(app)"}`; expirado/malformado → 400 genérico.
- [x] 3.6 GREEN `resetPassword` controller `@Res({passthrough:true}) Response`, `consumeReset`, acuña JWT vía `next-auth/jwt#encode` (try/catch), `response.cookie(...)`, `{redirectTo}` bajo `@HttpCode(200)`.
- [x] 3.7 RED `reset-templates.test.ts`: `reset-password.json` localizado `en|es`; GREEN `templates/reset-password.{json,ts}` (D6).
- [x] 3.8 RED Playwright `forgot-reset.spec.ts`: dev-mailbox obtiene URL; `[locale]/(auth)/reset-password/[token]/page.tsx` formulario 5 estados.
- [x] 3.9 GREEN `ResetPasswordClient.tsx` + `api/dev/mailbox/route.ts`; `ForgotPasswordClient.tsx` formulario 5 estados.
- [x] 3.10 TRIANGULATE Gmail SMTP → 502; **Routing RED** añadir a `reset-password.e2e-spec.ts`: malformado/replayed/expirado → 400 genérico.

## Fase 4 — Handshake Google OAuth Real (PR #4)

Base PR #3. Verificar `pnpm --filter web e2e oauth-mock.spec.ts && pnpm --filter api test auth-link`.

- [x] 4.1 RED `auth-link.test.ts`: usuario nuevo vía Google crea `User`; email existente vincula `Account(provider:"google")`; sin duplicados.
- [x] 4.2 GREEN editar `auth.config.ts`: registrar Google cuando hay credenciales (sin override `pages.signIn`; el middleware hace el locale).
- [x] 4.3 RED `google-callback.e2e-spec.ts`: `code`+`state` válidos → 200 + `authjs.session-token` + redirect `/{locale}/(app)`; `access_denied` → 401 + `pages.error`; state malformado → 401.
- [x] 4.4 GREEN wire `/api/auth/callback/google`; try/catch en `next-auth/jwt#decode`; copy de error localizado.
- [x] 4.5 RED Playwright `oauth-mock.spec.ts`: `GOOGLE_E2E_MOCK=1` activa mock Credentials; botón oculto cuando faltan credenciales.
- [x] 4.6 GREEN `apps/web/auth.ts` Credentials `google-mock` (D4) gateado por `GOOGLE_E2E_MOCK=1`; propagar locale en callback.
- [x] 4.7 **Routing RED** añadir a `google-callback.e2e-spec.ts`: state forjado/expirado → 401; callback ajeno → 401.

## Fase 5 — E2E Vertical + Docs + BDD (PR #5)

Base PR #4. Verificar `pnpm turbo run bdd e2e`.

- [x] 5.1 RED Cucumber `auth.feature`: sign-up → login → forgot → dev-mailbox → reset → cookie → `/[locale]/(app)` `en`+`es`; GREEN step defs `docs/step-defs/`.
- [x] 5.2 RED Playwright `vertical-auth.spec.ts` mismo escenario `en`+`es`; GREEN pasa ambos.
- [x] 5.3 RED `@axe-core/playwright` por superficie `a11y/*.spec.ts`; GREEN cero serious/critical; ARIA vía `useTranslations`.
- [x] 5.4 RED borrador `docs/operations/auth-runbook.md`: Gmail app-password, Google client-secret, kill-switch `MAIL_DSN`, `GOOGLE_E2E_MOCK`.
- [x] 5.5 GREEN runbook completo; verificado `pnpm dev:api` + `pnpm dev:web`.
- [x] 5.6 ES mirror `Documents-es/docs/operations/auth-runbook.md` mismo commit; verificar 0 CJK en `Documents-es/.../module-2-public-auth/*.md`.
- [x] 5.7 Gate final: `pnpm turbo run build lint typecheck test bdd e2e` + `pnpm lint:fixtures` exit 0.
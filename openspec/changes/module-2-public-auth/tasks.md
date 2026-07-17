# Tasks — `module-2-public-auth`

> Draft · tasks · tracker `feat/public-authentication` from `develop@cc74210` · hybrid · auto · 2026-07-17 · strict TDD.

## Review Workload Forecast

| Field | Value |
| --- | --- |
| Estimated changed lines | ~1500–2500 (37 files, 5 PRs) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 locale sign-in → PR2 Gmail adapter → PR3 reset e2e → PR4 Google handshake → PR5 vertical E2E + runbook |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

PR bases: #1=`feat/public-authentication`; #2=#1; #3=#2; #4=#3; #5=#4. Final merge to `develop` after all 5 approved.

## Carry-forward + threat→RED

TDD strict RED→GREEN→TRIANGULATE→REFACTOR; atomic commits; pino `[email]`; `next-auth/jwt#decode` try/catch; `.overrideProvider(TOKEN).useValue(InMemoryAdapter)`; next-intl alias + Turbopack cond; Playwright web + Vitest NestJS API e2e; ESLint boundaries; 5 states + WCAG AA; ES mirror same commit, 0 CJK. Routing → Phase 3+4 RED; Config/D7 → Phase 2 RED.

## Phase 1 — Locale NextAuth Web Wiring (PR #1)

Base `feat/public-authentication`. Verify `pnpm --filter web test SignInClient`.

- [x] 1.1 RED `SignInClient.test.tsx`: locale routing + Google-button hide when creds missing.
- [x] 1.2 GREEN `auth.ts` keep defaults (no `pages.signIn` override); `middleware.ts` missing-locale → `/en/sign-in`; authed → `/{locale}/(app)`.
- [x] 1.3 GREEN `[locale]/(auth)/sign-in/page.tsx` + `SignInClient.tsx`: `next-intl`, 5 states, credentials form, `signIn("google",{callbackUrl:"/{locale}/(app)"})`.
- [x] 1.4 TRIANGULATE `[locale]/(auth)/error/page.tsx`: foreign `callbackUrl` → `pages.error` localized.
- [x] 1.5 REFACTOR `googleEnabled()` + conditional `config.turbo.resolveAlias` in `next.config.ts`.
- [ ] 1.2 GREEN `auth.ts` keep defaults (no `pages.signIn` override); `middleware.ts` missing-locale → `/en/sign-in`; authed → `/{locale}/(app)`.
- [ ] 1.3 GREEN `[locale]/(auth)/sign-in/page.tsx` + `SignInClient.tsx`: `next-intl`, 5 states, credentials form, `signIn("google",{callbackUrl:"/{locale}/(app)"})`.
- [ ] 1.4 TRIANGULATE `[locale]/(auth)/error/page.tsx`: foreign `callbackUrl` → `pages.error` localized.
- [ ] 1.5 REFACTOR `googleEnabled()` + conditional `config.turbo.resolveAlias` in `next.config.ts`.

## Phase 2 — Gmail Mail Adapter + Env (PR #2)

Base PR #1. Verify `pnpm --filter api test mail`.

- [ ] 2.1 RED `env-refine.test.ts` 4 permutations: prod+no DSN+Gmail ok; prod+no DSN+Gmail missing → `ZodError`; dev+Gmail missing ok; `MAIL_DSN` → Gmail irrelevant.
- [ ] 2.2 GREEN `env.schema.ts` add `GMAIL_USER`+`GMAIL_APP_PASSWORD`; `productionEnvSchema.superRefine` enforces both when `NODE_ENV==="production" && !MAIL_DSN`; add `.env.example` placeholders.
- [ ] 2.3 RED `gmail-mail.adapter.test.ts`: `nodemailer.createTransport({service:"gmail"})`; envelope `from: no-reply@<PRODUCT_DOMAIN>`; SMTP rejection propagated.
- [ ] 2.4 GREEN rewrite `gmail-mail.adapter.ts`; pino bracket `[email]` on error.
- [ ] 2.5 RED `mail.module.test.ts` D3 precedence; GREEN `mail.module.ts`; keep `ConsoleMailAdapter`.
- [ ] 2.6 `apps/api/package.json`: `nodemailer@^6.9.16` + `@types/nodemailer@^6.4.17` + `nodemailer-mock@^1.5.11`.

## Phase 3 — Reset Flow End-to-End (PR #3)

Base PR #2. Verify `pnpm --filter api test forgot-password && pnpm --filter api test reset-password`.

- [ ] 3.1 RED `password-reset.service.test.ts`: `requestReset(email, locale)` mints `/es/reset-password/<token>` + `/en/...`; unknown email mints nothing.
- [ ] 3.2 GREEN modify `password-reset.service.ts` `requestReset(email, locale)`; raw token in event payload.
- [ ] 3.3 RED `forgot-password.e2e-spec.ts`: `MailAdapter.send` once; locale URL; 4th call → 429.
- [ ] 3.4 GREEN `auth.controller.ts` `forgotPassword` read `Accept-Language`; `.overrideProvider(MAIL_ADAPTER).useValue(InMemoryAdapter)` on e2e.
- [ ] 3.5 RED `reset-password.e2e-spec.ts`: `Set-Cookie: authjs.session-token=...; HttpOnly; SameSite=Lax` + `{redirectTo:"/en/(app)"}`; expired/malformed → 400 generic.
- [ ] 3.6 GREEN `resetPassword` controller `@Res({passthrough:true}) Response`, `consumeReset`, mint JWT via `next-auth/jwt#encode` (try/catch), `response.cookie(...)`, `{redirectTo}` under `@HttpCode(200)`.
- [ ] 3.7 RED `reset-templates.test.ts`: `reset-password.json` localized `en|es`; GREEN `templates/reset-password.{json,ts}` (D6).
- [ ] 3.8 RED Playwright `forgot-reset.spec.ts`: dev-mailbox fetches URL; `[locale]/(auth)/reset-password/[token]/page.tsx` 5-state form.
- [ ] 3.9 GREEN `ResetPasswordClient.tsx` + `api/dev/mailbox/route.ts`; `ForgotPasswordClient.tsx` 5-state form.
- [ ] 3.10 TRIANGULATE Gmail SMTP → 502; **Routing RED** add to `reset-password.e2e-spec.ts`: malformed/replayed/expired → 400 generic.

## Phase 4 — Google OAuth Real Handshake (PR #4)

Base PR #3. Verify `pnpm --filter web e2e oauth-mock.spec.ts && pnpm --filter api test auth-link`.

- [ ] 4.1 RED `auth-link.test.ts`: new user via Google creates `User`; existing email links `Account(provider:"google")`; no duplicate.
- [ ] 4.2 GREEN edit `auth.config.ts`: register Google when creds present (no `pages.signIn` override; middleware does locale).
- [ ] 4.3 RED `google-callback.e2e-spec.ts`: valid `code`+`state` → 200 + `authjs.session-token` + redirect `/{locale}/(app)`; `access_denied` → 401 + `pages.error`; malformed state → 401.
- [ ] 4.4 GREEN wire `/api/auth/callback/google`; `next-auth/jwt#decode` try/catch; localized error copy.
- [ ] 4.5 RED Playwright `oauth-mock.spec.ts`: `GOOGLE_E2E_MOCK=1` enables mock Credentials; button hidden when creds missing.
- [ ] 4.6 GREEN `apps/web/auth.ts` `google-mock` Credentials (D4) gated by `GOOGLE_E2E_MOCK=1`; thread callback locale.
- [ ] 4.7 **Routing RED** add to `google-callback.e2e-spec.ts`: forged/expired state → 401; foreign callback → 401.

## Phase 5 — Vertical E2E + Docs + BDD (PR #5)

Base PR #4. Verify `pnpm turbo run bdd e2e`.

- [ ] 5.1 RED Cucumber `auth.feature`: sign-up → login → forgot → dev-mailbox → reset → cookie → `/[locale]/(app)` `en`+`es`; GREEN step defs `docs/step-defs/`.
- [ ] 5.2 RED Playwright `vertical-auth.spec.ts` same scenario `en`+`es`; GREEN passes both.
- [ ] 5.3 RED `@axe-core/playwright` per-surface `a11y/*.spec.ts`; GREEN zero serious/critical; ARIA via `useTranslations`.
- [ ] 5.4 RED draft `docs/operations/auth-runbook.md`: Gmail app-password, Google client-secret, `MAIL_DSN` kill-switch, `GOOGLE_E2E_MOCK`.
- [ ] 5.5 GREEN runbook complete; verified `pnpm dev:api` + `pnpm dev:web`.
- [ ] 5.6 ES mirror `Documents-es/docs/operations/auth-runbook.md` same commit; verify 0 CJK across `Documents-es/.../module-2-public-auth/*.md`.
- [ ] 5.7 Final gate: `pnpm turbo run build lint typecheck test bdd e2e` + `pnpm lint:fixtures` exit 0.
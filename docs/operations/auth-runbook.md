# Runbook — `module-2-public-auth`

**Date**: 2026-07-17
**Project**: `gastos-personales-reference`
**Module**: 2 — Public Authentication (locale-prefixed sign-in, Google OAuth, Gmail password reset)

This runbook covers the operator-facing surface of the public-auth module:
environment variables, third-party credential rotation, kill-switches, and the
local dev shortcuts that keep e2e green without touching production-shaped
secrets. It is the companion piece to `production-foundation-runbook.md`
(Module 1) — every sign-in, OAuth, and reset email the platform sends flows
through one of the variables listed below.

All secret values live in the `staging` GitHub Actions environment (per
`production-foundation-runbook.md` §9) and the production environment. Local
devs edit `apps/web/.env.test` (committed, runtime-gated) and
`apps/api/.env.test`; NEVER commit a real Gmail App-Password or Google
client-secret to either file.

## 1. Gmail App-Password rotation

The Gmail adapter (`apps/api/src/modules/auth/infrastructure/gmail-mail.adapter.ts`,
per design D3) authenticates with a Gmail App-Password, NOT the account's
primary password. The `GMAIL_APP_PASSWORD` value MUST be ≥16 characters
(env.schema Zod check). Rotating the credential never requires a code change.

1. Sign in to the dedicated Gmail account used for transactional resets.
2. Visit <https://myaccount.google.com/apppasswords>.
3. Revoke the existing App Password.
4. Generate a new one. Copy the 16-character string (Google displays it with
   spaces — strip them before pasting).
5. Update `GMAIL_APP_PASSWORD` in:
   - The `staging` GitHub environment secret.
   - The production hosting provider's secret store (Fly.io secrets,
     Render env, etc.).
6. Update `GMAIL_USER` if the account address changed.
7. Restart the API process so the new env is picked up (Next.js / NestJS
   reads env at boot — there is no hot-reload for secrets).
8. Trigger a manual reset from a non-personal account and confirm the
   email arrives (see §6 troubleshooting).

> **Kill-switch alternative:** if the rotation is taking longer than
> expected, set `MAIL_DSN=console://` (see §3). The console adapter writes
> the reset URL to stdout instead of dispatching through Gmail. The platform
> stays functional; only the actual delivery degrades.

## 2. Google OAuth client-secret rotation

The Google provider (`apps/web/auth.ts`, registered conditionally per
`isGoogleConfigured()` in `apps/web/lib/google-enabled.ts`) authenticates with
a `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` pair. The client-secret
rotation is a per-project secret dance; the user-facing flow never breaks
as long as both values stay in lock-step.

1. Open the Google Cloud Console project for the deploy environment.
2. Navigate to **APIs & Services → Credentials**.
3. Click the OAuth 2.0 Client ID used for the production (or staging) web
   origin.
4. Click **Reset secret**. The old secret is immediately invalidated.
5. Copy the new secret value.
6. Update `GOOGLE_CLIENT_SECRET` (and `GOOGLE_CLIENT_ID` if the client id
   itself changed) in the hosting provider's secret store.
7. Update the Authorized redirect URIs to keep them aligned with the
   current `PUBLIC_WEB_URL`:
   - `${PUBLIC_WEB_URL}/api/auth/callback/google` (the NextAuth catch-all
     route mounted under `apps/web/app/api/auth/[...nextauth]/route.ts`).
   - The `/[locale]/sign-in` path itself does NOT need to be registered
     (the middleware-managed locale wraps the `/sign-in` URL via
     `pages.signIn` default — no locale prefix hits Google's redirect
     allowlist).
8. Restart the web process so the new secret is loaded.
9. Trigger a test sign-in from the staging env to confirm the handshake
   completes (you should land on `/{locale}/(app)`).

> **Defense in depth:** the platform re-checks `isGoogleConfigured()` at
> every call site, so a botched rotation that leaves an empty
> `GOOGLE_CLIENT_SECRET` simply HIDES the Google button — it does not
> throw at runtime.

## 3. `MAIL_DSN` kill-switch

The `MAIL_DSN` env var is the highest-priority mail route (per design D3).
Setting it to `console://` switches the platform from live SMTP delivery
to an in-memory console adapter that logs the rendered email — including
the reset URL — to the API process's stdout. This is the canonical
kill-switch when Gmail is broken, being rotated, or being rate-limited.

| `MAIL_DSN` value | Adapter selected | Use case |
| --- | --- | --- |
| `console://` | `ConsoleMailAdapter` (logs to stdout) | Local dev + emergency kill-switch |
| `smtps://user:pass@host:port` | `SmtpMailAdapter` (nodemailer SMTP) | Production with a transactional SMTP provider |
| _(unset)_ + Gmail env present | `GmailMailAdapter` | Production with Gmail direct |
| _(unset)_ + no Gmail env | `ConsoleMailAdapter` (default) | Dev — `NODE_ENV !== production` only; production with no Gmail env fails fast at boot per design D7 |

### Activating the kill-switch

```bash
# Fly.io
flyctl secrets set MAIL_DSN=console:// -a gastos-api

# Render
render env set MAIL_DSN=console:// --service gastos-api

# Locally (apps/api/.env.local — NOT committed)
echo 'MAIL_DSN=console://' >> apps/api/.env.local
```

Once set, the platform continues to mint reset tokens + write the audit
event (`auth.password-reset.requested`); only the `MailAdapter.send(...)`
call lands in stdout instead of crossing the network.

### Deactivating

Unset the variable (set to empty string) and restart the API. The Zod
schema treats empty `MAIL_DSN` as "unset" — the next adapter-precedence
step takes over.

## 4. `GOOGLE_E2E_MOCK` — local CI / e2e shortcut

Per design D4, real Google OAuth cannot be wired into the CI sandbox. The
`GOOGLE_E2E_MOCK=1` env var causes `apps/web/auth.ts` to register a
`google-mock` Credentials provider alongside (or instead of) the real
`Google` provider. The mock exchanges synthetic profile payloads with
`next-auth` without touching Google's servers, so the e2e suite in
`apps/web/e2e/auth/oauth-mock.spec.ts` runs hermetically.

### Hard rules

- `GOOGLE_E2E_MOCK=1` MUST be a no-op when `NODE_ENV === "production"`.
  The `isGoogleMockEnabled()` predicate (in `apps/web/lib/google-enabled.ts`)
  enforces this as defense in depth — even a leaked flag in production
  cannot enable the mock.
- The Playwright spec (`apps/web/e2e/auth/oauth-mock.spec.ts`) sets the
  flag in its own environment and asserts the button is rendered.
- Local-only: `apps/web/.env.test` sets `GOOGLE_E2E_MOCK=1` so the web
  dev server picks it up while developing. Never set this in any
  non-test `.env`.

### When to use

- Running the Playwright e2e suite locally (`pnpm --filter web e2e`).
- Hand-testing the sign-in button without round-tripping to Google.
- Demonstrating the OAuth handshake on a developer machine that doesn't
  have access to the project's Google Cloud Console.

### When NOT to use

- Any environment where real Google sign-in is the desired surface.
- Staging or production deploys — `NODE_ENV=production` disables the
  mock at the predicate level; the operator MUST NOT override.

## 5. Local dev prerequisites

The repo's `apps/web/.env.test` and `apps/api/.env.test` (committed)
contain a complete fixture set so `NODE_ENV=test pnpm dev` boots out of
the box. The following vars drive feature behavior at the boundary
between dev and production:

| Variable | Dev default | Production required | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | `test` (fixtures) or `development` | `production` | Env-refine superRefine in `libs/core/config/env.schema.ts` |
| `MAIL_DSN` | _(unset)_ | optional, overrides Gmail | D3 |
| `GMAIL_USER` | _(unset)_ | required if `NODE_ENV=production && !MAIL_DSN` | D7 |
| `GMAIL_APP_PASSWORD` | _(unset)_ | required if `NODE_ENV=production && !MAIL_DSN`, ≥16 chars | D7 |
| `GOOGLE_CLIENT_ID` | optional | optional | Hides Google button when empty |
| `GOOGLE_CLIENT_SECRET` | optional | optional | Hides Google button when empty |
| `GOOGLE_E2E_MOCK` | `"1"` (`.env.test`) | MUST be unset (hard rule) | D4 |
| `NEXTAUTH_URL` | `http://localhost:3000` | `${PUBLIC_WEB_URL}` | NextAuth |
| `NEXTAUTH_SECRET` | test fixture | from secret store | NextAuth JWT signing |
| `API_URL` | `http://localhost:3001` | `${PUBLIC_API_URL}` | Web → API |
| `WEB_ORIGIN` | `http://localhost:3000` | `${PUBLIC_WEB_URL}` | CORS allowlist |

> **Always run turbo commands with `NODE_ENV=test` in the apply gate:**
> `apps/web#build` crashes when `API_URL` / `WEB_ORIGIN` are empty (the
> test fixture supplies them). Use `NODE_ENV=test pnpm turbo run build`
> and friends.

## 6. Troubleshooting

### Symptom: password reset email never arrives

1. Confirm the API booted. Check `/healthz`.
2. Inspect the `auth.password-reset.requested` event in the audit log —
   if absent, the controller never ran (likely a rate-limit 429; see
   `RATE_LIMITER_TOKEN` override in `apps/api/src/modules/auth/auth.module.ts`).
3. If the event IS present but no email arrived: check the `MailAdapter`
   binding in `apps/api/src/modules/auth/infrastructure/mail.module.ts`
   — the precedence order (D3) is `MAIL_DSN > Gmail env > Console`.
4. With `MAIL_DSN=console://` active, the email is logged to stdout — the
   reset URL is in the log line. Extract the URL from there for local
   reproduction.

### Symptom: Google sign-in throws "OAuthSignin" / "OAuthCallback"

1. Verify `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are non-empty in
   the running env. If empty, the button is hidden; if non-empty, the
   provider is registered.
2. Confirm the Authorized redirect URI in Google Cloud Console matches
   `${PUBLIC_WEB_URL}/api/auth/callback/google` exactly (case-sensitive,
   no trailing slash).
3. Inspect the `auth.account.linked` audit event — if it fired, the
   callback round-trip succeeded and the `OAuthCallback` error page is
   the wrong destination (look at the actual URL query params instead).

### Symptom: env validation throws at boot (`ZodError` in logs)

The Zod `superRefine` in `libs/core/config/env.schema.ts` enforces the
D7 contract: when `NODE_ENV=production` AND `MAIL_DSN` is unset, BOTH
`GMAIL_USER` and `GMAIL_APP_PASSWORD` must be present and valid. Set
both, OR set `MAIL_DSN` to bypass the Gmail requirement.

### Symptom: rate-limit hits (429) on `auth:forgot`

The 4th call within the bucket window returns 429 with `Retry-After`.
The reset-password e2e spec (`apps/api/test/forgot-password.e2e-spec.ts`)
exercises this contract. For local repro, set
`RATE_LIMITER_TOKEN` to the in-memory token override (see
`apps/api/src/modules/auth/auth.module.ts`) so the
`InMemoryRateLimiter` short-circuits the bucket.

## 7. Related artifacts

- `production-foundation-runbook.md` — Module 1 baseline (free-tier,
  backups, secrets list).
- `apps/web/auth.ts` — NextAuth `handlers` + `signIn`/`signOut`. The
  `buildProviders()` factory reads `isGoogleConfigured()` +
  `isGoogleMockEnabled()` at boot.
- `apps/web/lib/google-enabled.ts` — single-source-of-truth predicates.
- `apps/api/src/modules/auth/infrastructure/gmail-mail.adapter.ts` —
  D3 adapter, `nodemailer.createTransport({service:"gmail"})`.
- `apps/api/src/modules/auth/infrastructure/mail.module.ts` —
  D3 precedence selection.
- `apps/api/src/modules/auth/infrastructure/templates/reset-password.json`
  — D6 locale-keyed copy (en + es).
- `libs/core/config/env.schema.ts` — D7 env superRefine (4 permutations).
- `apps/web/app/api/auth/[...nextauth]/route.ts` — NextAuth catch-all
  route mounted under the canonical `/api/auth/*` prefix.
- `apps/web/app/api/dev/mailbox/route.ts` — DEV-only mailbox bridge for
  Playwright e2e.

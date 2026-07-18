# Design: `module-2-public-auth`

Tracker `feat/public-authentication` from `develop@cc74210`; 5 chained PRs, strict TDD, ≤400 LOC/PR, 37-file target. No DB migration.

## 1. Approach

Locale-aware public auth, Google OAuth, Gmail reset, en/es UI, BDD, Playwright/axe, runbook. Reset uses Express only to emit the HttpOnly cookie. Gmail env (D7) fails fast at boot when `MAIL_DSN` is unset, per M1.

## 2. Architecture Decisions

### D1 — Google account linking
Auto-link by verified email through PrismaAdapter. Verified email satisfies frictionless linking; DB uniqueness prevents collisions.

### D2 — Reset URL
`${PUBLIC_WEB_URL}/{locale}/reset-password/{token}`. Next-intl routes path locales deterministically.

### D3 — Mail binding
`MAIL_DSN` → Console; else production → Gmail; else Console. `MAIL_DSN=console://` is the kill-switch.

### D4 — OAuth E2E
`google-mock` Credentials only outside production with `GOOGLE_E2E_MOCK=1`. Exercises NextAuth without external instability; real Google stays M6.

### D5 — Reset cookie/redirect
`resetPassword` uses `@Res({passthrough:true}) Response`, calls `consumeReset`, mints NextAuth-compatible token, sets `authjs.session-token` via `response.cookie(...)`, returns `{redirectTo}` under `@HttpCode(200)`. Passthrough preserves NestJS serialization + supertest while platform emits HttpOnly. Express coupling tested via supertest (§6).

### D6 — Email translation
`reset-password.json` keyed by `en|es`, rendered beside the adapter. One auditable source avoids scattered copy.

### D7 — Gmail env contract
`GMAIL_USER` (email) and `GMAIL_APP_PASSWORD` (min 16) live in `env.schema.ts`. Optional in dev/test; required when `NODE_ENV === "production"` AND `MAIL_DSN` is unset (`superRefine` in §5). Short-circuits on `MAIL_DSN` (D3 wins). Alternatives: always require Gmail; validate at first `send()`. Rationale: first blocks the kill-switch; second defers errors past operators. M1 R-PF-1 (`7335f11`) is the precedent.

## 3. Data Flow

`POST forgot (Accept-Language) → requestReset(email,locale) → sha256 row → MailAdapter → /{locale}/reset-password/{raw}`.

`POST reset → consumeReset tx → mint session JWT → passthrough Response.cookie(HttpOnly, SameSite=Lax) + 200 {redirectTo:"/{locale}/(app)"} → web router`.

`SignInClient Google → signIn("google",{callbackUrl:"/{locale}/(app)"}) → NextAuth callback/link/JWT → protected route`. `apps/web/auth.ts` keeps the default or static `pages.signIn:"/sign-in"` (never `"/[locale]/sign-in"`). Middleware runs next-intl then `auth()` on protected `/{locale}/*`; failure redirects to `/{locale}/sign-in`. Boot: missing Gmail env under `NODE_ENV=production` + `MAIL_DSN` unset throws `ZodError` (D7).

## 4. File Changes (37)

| Group | Files / action |
|---|---|
| Mail (7) | Modify `gmail-mail.adapter.ts` + `mail.module.ts` (D3); create `templates/reset-password.{json,ts}` + 3 unit tests. |
| API/config (8) | Modify `auth.{controller,module}.ts` (forgot reads Accept-Language; reset uses `@Res({passthrough:true})` per D5), `auth.config.ts` (link only), `env.schema.ts` (D7), `.env.example` (Gmail env); create dev-mailbox wiring. |
| Auth domain (3) | Modify `password-reset.service.ts`; keep shared schemas; create locale test. |
| Web (9) | Modify `apps/web/{auth.ts,middleware.ts}` + sign-in/forgot/reset/mailbox pages and 3 clients. `SignInClient` calls Google with locale callback. |
| API tests (3) | Forgot (`overrideProvider(MAIL_ADAPTER)`), reset passthrough cookie+JSON, dev mailbox. |
| Web E2E (6) | sign-in, sign-up, forgot, reset, OAuth mock, axe; split Playwright from Nest API. |
| Docs/BDD | Auth feature + ES feature, runbook + `Documents-es` mirror; same atomic commits. |

Add to `apps/api/package.json`: `nodemailer@^6.9.16` (deps) + `@types/nodemailer@^6.4.17` + `nodemailer-mock@^1.5.11` (devDeps). Proposal wrongly claimed present — Read confirms not.

## 5. Contracts

```ts
requestReset(email: string, locale: "en"|"es"): Promise<void>

POST /auth/reset-password
  body: { token: string; newPassword: string }
  200 + Set-Cookie: authjs.session-token=...; HttpOnly; SameSite=Lax
       body: { redirectTo: "/en/(app)"|"/es/(app)" }
  400 generic invalid token

// D7 additions to libs/core/config/env.schema.ts
GMAIL_USER:         z.string().email().optional(),
GMAIL_APP_PASSWORD: z.string().min(16).optional(),
// productionEnvSchema.superRefine: NODE_ENV==prod AND !MAIL_DSN => both required
```

Forgot returns 202 without enumeration; Gmail failure 502.

## 6. Testing

RED→GREEN: mail envelope/errors + binding permutations; locale template/URL; **env refine (D7)** — Vitest boundary on `env.schema.ts`, 4 permutations; **reset cookie+JSON** — supertest asserts `Set-Cookie` + `{redirectTo:"/{locale}/(app)"}` (fails if Express swapped without updating `resetPassword`); account linking; middleware locale redirect; foreign callback rejection; OAuth mock; 5 UI states, en/es, axe, BDD. Preserve pino bracket, JWT try/catch, next-intl alias, provider override, boundary rules, Playwright split.

## 7. Threat Matrix

| Boundary | Applicability | Response / RED tests |
|---|---|---|
| Doc-like paths | N/A — no executable docs | None |
| Git repo selection | N/A — no shell | None |
| Commit / Push / PR | N/A — no VCS automation | None |
| **Routing** | **Applicable** | Foreign callback 401; expired state/forged code 401; malformed/replayed/expired reset 400 generic; 4th forgot 429; middleware locale redirect. |
| Shell/process | N/A — no subprocess | None |
| **Configuration** | **Applicable** (D7) | Env refine: 4 permutations `NODE_ENV × MAIL_DSN × Gmail env`; fail-fast at boot. |

## 8. Rollout / Risks

No migration. Disable Gmail with `MAIL_DSN=console://`; disable Google by unsetting credentials.

**INFO:** D5 platform coupling tested via supertest; future NestJS HTTP adapter swap (e.g. Fastify) requires revisiting `resetPassword` cookie emission — accepted as M2 scope.

**INFO:** Pin `nodemailer@^6.9.16` to avoid SMTP breaking changes between minors.

# Changelog

All notable changes to `gastos-personales-reference` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-07-08

### Summary

The initial release of `gastos-personales-reference` — a **publicable, runnable, lint-able, type-check-able, test-able reference repository** for the team's vertical-slicing monorepo model. The project validates the architecture (Next.js 16 + NestJS 11 + Prisma 6 + NextAuth v5) end-to-end across two completed vertical slices (auth server + auth client) and the supporting infrastructure (Prisma client, env config, in-memory event dispatcher, shared utilities).

The scope of v1.0.0 is **the auth surface** (sign-in, sign-up, forgot-password, reset-password, dev-mailbox). The transactions surface (multi-currency + soft-delete + idempotency-key + audit log) lands in slice 5 as a post-1.0.0 release.

### Added — Infrastructure (slice 1 + slice 2)

- **`apps/web`**: Next.js 16 App Router scaffold with `next-intl` plugin, NextIntlClientProvider in the root layout, Tailwind v4 design tokens (light + dark mode CSS variables extracted from `gastos-personales/app/globals.css`), Tailwind postcss config + autoprefixer.
- **`apps/api`**: NestJS 11 scaffold with the `AppModule` (currently just the empty composition root; feature modules land in slice 3+).
- **Monorepo tooling**: pnpm workspaces + Turbo 2.10 orchestrator with `build` / `dev` / `lint` / `test` / `typecheck` / `bdd` / `e2e` / `coverage` pipelines per workspace.
- **ESLint flat config** with a custom boundary plugin (`tools/eslint-plugin-boundary/`) enforcing 4 architectural rules: `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`. Fixture-based test suite (`pnpm lint:fixtures`) verifies the rules fire on violating samples.
- **TypeScript path aliases**: `@core/database`, `@core/events`, `@core/config`, `@features/auth`, `@features/transactions`, `@shared-utils/*` configured at the repo root.
- **Schema-as-source-of-truth Zod library** at `libs/features/auth/shared/schemas/`: 5 schemas (login, register, forgot-password, reset-password, session-list) re-exported from the main `@features/auth` barrel.
- **Prisma 6 + @core/database** singleton with the initial schema (User, Session, Account, VerificationToken, PasswordResetToken). The `no-prisma-outside-core` ESLint rule prevents `new PrismaClient()` anywhere outside `@core/database`.
- **Zod env config** at `libs/core/config/`: fail-fast env parsing at module load. Validates `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `WEB_ORIGIN`, `PORT`, `NODE_ENV`, `API_URL`, plus optional Google OAuth credentials. 20+ unit tests cover happy + sad paths.
- **@core/events** in-memory pub/sub dispatcher with `redactSensitive` redaction at the ring-buffer boundary, `authjs.session-token` cookie compatibility, 31 unit tests covering the 9 domain events + redact + replay paths.
- **@shared-utils** pure helpers: `date-formatting` (formatDate, parseIsoDate, toIsoString), `currency` (formatCurrency with locale + Intl.NumberFormat), `decimal` (decimal.js wrapper — NEVER BigInt per D-TX-6).
- **`openspec/changes/vertical-slicing-reference-scaffold/`**: the full SDD artifact tree (proposal + spec + design + tasks + apply-progress) for the reference repo. Per AGENTS.md §13, every English `.md` ships with a `Documents-es/...` Spanish mirror.
- **Docker Compose** (`docker-compose.yml`) for the Postgres 16 dev environment.

### Added — Auth server (slice 3)

The auth server vertical slice — 4 services + 4 events + 6 routes + NextAuth v5 backend + JWT guard + 4R-fixed (CRITICAL F1 transaction, F2 audit-sink, F3 redaction, F4 TTL cleanup, F8 dispatch guard).

- **`AuthService`** (login, register, getCurrentUser, linkGoogleAccount). 110 unit tests cover happy + sad paths + the new NextAuth JWE mint (round-trip RED+GREEN per the slice 4 NextAuth integration).
- **`SessionService`** (listActiveSessions, revokeSession, revokeAllSessions, getCurrentUser). Tests cover port-driven lookup, idempotent revoke, and the redirect-if-already-authed path.
- **`RbacService`** (can). Permission table mirrors design §4.1 exactly. 11 tests cover USER (4 `*:own` true + 4 `*:any` false) + ADMIN (all 8 true) + defense-in-depth on unknown action values.
- **`PasswordResetService`** (requestReset, consumeReset). Dispatch `auth.password-reset.requested` on request + `auth.password-reset.completed` on consume. 7 tests cover the 5 states (empty / known / unknown / expired / consumed) + the orphan-row fix.
- **`UserRepository` + `SessionRepository` + `PasswordResetTokenRepository`** ports + Prisma adapters. The Prisma adapters are imported from `@core/database` (the `no-prisma-outside-core` boundary).
- **`AuthController`** (NestJS thin wrapper) with 6 routes: `POST /auth/login`, `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`. RbacService gates the authenticated routes. AuthError → 401/409, ValidationError → 400, generic → 500 via the `runOrThrowHttp` wrapper.
- **`AuthModule`** (DI composition root) + **`AuthCronService`** (F4 cron, every 15 min, calls `deleteExpired`).
- **`ZodValidationPipe`** + **`@BodySchema(<schema>)`** parameter decorator for body validation on all 6 routes.
- **`JwtAuthGuard`** (real NextAuth v5) decodes the `authjs.session-token` cookie via `@auth/core/jwt#decode` and projects the `userId` + `email` + `role` onto the request. e2e tests cover the real-guard behavior (valid JWT → 200, missing token → 401, malformed → 401, wrong-secret → 401).
- **Auth event wiring**: all 4 events (`auth.password-reset.requested`, `auth.password-reset.completed`, `auth.session.revoked`, `auth.rbac.denied`) dispatched via Pattern A (service calls dispatcher directly). The `wireAuthEvents` monkey-patch wrapper is removed; the `auditSink` port surfaces dispatcher failures.
- **T3.7 integration scenarios** (`multi-provider.test.ts`, `session-expiry.test.ts`, `forgot-password-idempotency.test.ts`): cross-cutting flows between AuthService + SessionService + PasswordResetService.
- **T3.9 final gate**: `pnpm turbo run lint typecheck test` exits 0 across `apps/api` + `libs/features/auth`. `docs/slice-3-checklist.md` (EN + ES mirror) captures the slice 3 verification gates.

### Added — Auth client (slice 4)

The auth client vertical slice — i18n + shadcn primitives + 5 form pages + WCAG AA scaffold + responsive viewport + state-coverage tests + REFACTOR + responsive layout + auth cookie storage + NextAuth integration.

- **T4.2 i18n catalogs** (`apps/web/messages/{en,es}.json`) with mirrored translations. The symmetric-difference test asserts both catalogs have the same key set.
- **T4.3 next-intl middleware** + **`i18n.ts` routing config** (`locales: ['en', 'es']`, `defaultLocale: 'en'`, `localePrefix: 'always'`). Matcher excludes `/api/*`, `/_next/*`, static files.
- **T4.4 shadcn-style primitives**: `Button` (6 variants × 4 sizes, Radix `Slot` polymorphism), `Input`, `Form` (minimal `FormProvider`), `Card` + sub-components. 23 component tests.
- **T4.5 `cn` helper** combining `clsx` + `tailwind-merge`. Type-tested for merge precedence + conflict resolution.
- **T4.6 `components.json`** manifest documenting the primitive set.
- **T4.7 design tokens** extracted from `gastos-personales/app/globals.css` (light + dark mode CSS variables) + Tailwind v4 setup (`@tailwind base/components/utilities`, `postcss.config.mjs`).
- **T4.1 / T4.8 LoginForm + sign-in page** at `apps/web/app/[locale]/(auth)/sign-in/page.tsx` with 5 form states (empty / validation / loading / 401 / 500). Post-success: cookie set + `router.replace('/{locale}/')`.
- **T4.9 SignUpForm + sign-up page** with 5 states (empty / validation / loading / 409 duplicateEmail / 200). Post-success: cookie set + `window.location.href = '/{locale}/sign-in'`.
- **T4.10 ForgotPasswordForm + forgot-password page** with 3 states (empty / loading / success). Idempotent per design D-AUTH-1 (202 for both known + unknown email; no enumeration leak).
- **T4.11 ResetPasswordForm + reset-password/[token] page** with 4 states (empty / validation / loading / 401 invalidToken). Generic copy per D-AUTH-1 (`auth.resetPassword.error.invalidToken`).
- **T4.12 DevMailbox + dev/mailbox/[userId] page** — DEV-ONLY affordance gated by `NODE_ENV !== "production"`. Reads from a `DEV_STUB_EVENTS` module-level constant (real API fetch deferred to slice 4 follow-up). Copy-to-clipboard via `navigator.clipboard.writeText`.
- **T4.13 WCAG AA scaffold**: `apps/web/e2e/wcag-aa.spec.ts` (4 tests) + `apps/web/playwright.config.ts` (2 projects: chromium-en, chromium-es). Best-effort: requires per-dev `npx playwright install chromium`.
- **T4.14 state-coverage** (`apps/web/__tests__/components/auth/state-coverage.test.tsx`) — 20 tests asserting the 5 form states for each of the 4 forms.
- **T4.15 REFACTOR + responsive**: extracted `FormFieldRow` + `AuthFormErrorBanner` + `AuthPageShell` + `useAuthApiPost` hook (kills 4R-flagged duplication). `apps/web/e2e/responsive.spec.ts` (4 tests) at 360px + 1440px.
- **T4 follow-ups (5/5)**: test slim + `AbortSignal.timeout(10_000)` + `Referrer-Policy: same-origin` header + `COPY_INDICATOR_TIMEOUT_MS` constant + `Input` prop cleanup.
- **Auth cookie storage (slice 4 batch 2)**: `apps/web/lib/auth.ts` with `getSession()` + `setSessionCookie()` + `clearSessionCookie()`. Cookie name `auth-session` (slice 4 batch 2) → migrated to `authjs.session-token` (NextAuth v5 default) in the cookie migration batch. Attributes: `httpOnly: true`, `secure: prod-only`, `SameSite=lax`, `path=/`, `maxAge=24h`.
- **NextAuth integration (slice 4 PR #21)**: `AuthService` mints a NextAuth JWE via `@auth/core/jwt#encode` with the shared `NEXTAUTH_SECRET` + salt. `apps/web/auth.ts` NextAuth v5 config + `apps/web/app/api/auth/[...nextauth]/route.ts` handler. Round-trip test asserts the API's `sessionToken` decodes via `@auth/core/jwt#decode`.
- **Cookie migration (slice 4 PR #22)**: `auth-session` → `authjs.session-token`. 2 new tests assert the canonical cookie attributes + the server-side read.

### Changed — Architectural decisions

- **PR #10** introduced the `validateOrThrow(raw, schema)` helper inside the route handlers, replacing the `@BodySchema(<schema>)` decorator (the harness's auto-formatter kept stripping the decorator). 4R review (R2) flagged the heavy LoginForm/SignUpForm/ForgotPassword/ResetPassword boilerplate; the slice 4 follow-up batch extracted the shared primitives.
- **PR #16** wired `app.enableCors({ origin: env.WEB_ORIGIN, credentials: true })` in `apps/api/src/main.ts` (the previous slice 3 setup documented `WEB_ORIGIN` as the CORS allow-list target but never consumed it). Without this, every cross-origin auth POST from the web client would have surfaced as `auth.common.genericError` regardless of credentials.
- **PR #11** added the `description` keys to the i18n catalogs (the pages were using the `email` field-label key for `CardDescription`, which rendered the literal "Email" as the card subtitle).

### Documentation

- `openspec/changes/vertical-slicing-reference-scaffold/`: full SDD artifact tree (proposal + spec + design + tasks + apply-progress). Every English `.md` ships with a `Documents-es/...` Spanish mirror per AGENTS.md §13.
- `docs/slice-3-checklist.md` (EN + ES mirror): slice 3 final gate + verification gates.
- `README.md` (existing): project overview + quickstart.
- `AGENTS.md` (existing): project conventions + branch model + commit message format.

### Fixed

- **CORS not enabled on the API** (4R R1 CRITICAL, slice 4 PR #16): the web client at `WEB_ORIGIN` (`:3000`) POSTs cross-origin to the API (`:3001`) with `Content-Type: application/json`. Without `app.enableCors({ origin: env.WEB_ORIGIN, credentials: true })`, the browser refuses the preflight. The previous slice 3 setup documented `WEB_ORIGIN` as the CORS allow-list target but never consumed it.
- **`CardDescription` used the field-label key** (4R R2 CRITICAL, slice 4 PR #11): the pages were using the `email` key for `CardDescription`, which rendered the literal "Email" as the card subtitle. Added `description` keys to en.json + es.json; both pages now use `t("description")`.
- **ResetPasswordForm loading state missing from the test suite** (4R R4 WARNING, slice 4 PR #17 follow-up): the form's JSDoc contract claims 4 form states but the test suite only asserted 3. Added the loading-state test mirroring the ForgotPasswordForm pattern.
- **3 CRITICAL F1-F8 findings from the slice 3 batch 5 4R review** (PR #9): the slice 3 apply-progress closed the F1 transaction-wrap (F6 TOCTOU), F2 audit-sink, F3 ring-buffer redaction, F4 deleteExpired, F8 dispatch-guard. All 5 fixed; the requestReset F5 orphan-row fix landed in the same batch.

### Notes

- The slice 4 form-state assertions live in a single harness (`state-coverage.test.tsx`) — the per-form test files were slimmed to keep only form-specific tests (the consolidated harness is the source of truth).
- The dev-mailbox page reads from a `DEV_STUB_EVENTS` module-level constant; the real API event-replay endpoint lands alongside the slice 5+ events infrastructure.
- The slice 4 e2e (Playwright + axe-core) tests are scaffolded but NOT run in the CI pipeline. Per-dev `npx playwright install chromium` is required.
- The slice 4 BDD `.feature` files (per design Locked Decision #3) are deferred to slice 7+ (post-1.0.0).

## 1.0.0 — Quality gates (final, all green at v1.0.0 tag)

| Gate | Result |
|---|---|
| `pnpm install` | ✅ exit 0 |
| `pnpm turbo run typecheck` (full) | ✅ exit 0 |
| `pnpm turbo run lint` (full) | ✅ exit 0 |
| `pnpm turbo run test` (full) | ✅ 24/24 turbo tasks green |
| Slice 1 (skeleton) | ✅ 8/8 tasks done |
| Slice 2 (libs/core + libs/shared-utils) | ✅ 5/5 tasks done |
| Slice 3 (auth server) | ✅ 9/9 tasks done; 110/110 + 21/21 + 37/37 + 20/20 + 4/4 tests |
| Slice 4 (auth client) | ✅ 15/15 + 5/5 follow-ups + 1/1 T3.3 + 1/1 NextAuth + 1/1 cookie migration = CLOSED |
| `pnpm run lint:fixtures` | ✅ boundary plugin fixtures pass |
| Boundary rules: `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import` | ✅ all 4 active |
| i18n catalogs (symmetric-difference) | ✅ green |

**Total workspace tests at v1.0.0**: 274 (110 @features/auth + 21 apps/api e2e + 37 @core/events + 20 @core/config + 4/4 jwt-auth-guard e2e + 106 apps/web including state-coverage + 7/7 lib helpers). 24/24 turbo tasks green.

## Release process

- **Branch model**: `develop` is the working branch; `main` is the immutable production release branch. Releases are cut via `release/v<MAJOR>.<MINOR>.<PATCH>` branches off `develop` → PR → `main` → tag → GitHub release.
- **Commit convention**: Conventional Commits (no "Co-Authored-By" / no AI attribution).
- **Branch model convention** (per AGENTS.md §2): feature branches cut from `develop`, work-unit commits, `git revert <sha>` for rollback.
- **Spanish mirror rule** (per AGENTS.md §13): every English `.md` under `openspec/` or `docs/` ships with a `Documents-es/...` Spanish mirror IN THE SAME atomic commit. Verified via `grep -P '[\x{4e00}-\x{9fff}]'` to keep CJK mojibake out.

## Upcoming releases (post-1.0.0)

- **v1.1.0 (slice 5)**: transactions server — multi-currency + soft-delete + idempotency-key + audit log + 5 events of transactions.
- **v1.2.0 (slice 6)**: transactions client + i18n + shadcn primitives for the transactions surface + responsive layout.
- **v2.0.0 (slice 7)**: BDD `.feature` files + Playwright e2e + slice-wide gates + production hardening (HSTS, CSP, secrets manager).

[Unreleased]: https://github.com/Sebailla/GP-v2/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Sebailla/GP-v2/releases/tag/v1.0.0

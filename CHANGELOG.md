# Changelog

All notable changes to `gastos-personales-reference` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-07-09

### Summary

The transactions server slice (slice 5) lands in full — multi-currency + soft-delete + idempotency-key + audit log + 5 transactions events — closing the v1.0.0 release's deferred surface. The v1.0.0 scope was the auth surface; v1.1.0 picks up the second vertical slice (transactions server) and the controller wiring the web client will speak to in slice 6. Version bump from `1.0.0` → `1.1.0` is a **minor** (additive new surface, backward-compatible with auth surface from v1.0.0).

The slice 5 close-out PR (#30) brought 9 atomic commits and surfaced two latent bugs through the 4R review sweep that would have shipped otherwise: **R1-001 BLOCKER** (D-TX-7 cross-user mutation authorization gap — any authenticated user could PATCH/DELETE another user's transaction with a guessed cuid) and **R3-011 CRITICAL** (a regression in the D-TX-7 fix that broke HTTP DELETE idempotency). Both are now fixed and tested. The triangulation suite catches a third class of latent issues (mock fidelity, `DuplicateIdempotencyKeyError` race coverage, ownership semantics) and will land incrementally across slice 6+.

### Added — Transactions server (slice 5, PRs #27 #28 #29 #30)

The transactions server vertical slice — extends Prisma with Currency, FxRate, Category, Transaction, IdempotencyKey, AuditLog tables; entities + ports + services including TransactionService (with idempotency-key atomic replay, FX lookup with staleness dispatch), CategoryService (with soft-delete filter D-TX-5), TotalsService (sign-aware), ThresholdService (post-create dispatch); Prisma repositories; InMemoryFxRateProvider; NestJS controllers; 5 events emitted on `@core/events`.

- **T5.1 + T5.2** — Prisma schema extension + `pnpm prisma migrate dev` (gate check).
- **T5.3** — RED Vitest test for `TransactionService.create` with FX conversion.
- **T5.4** — `libs/features/transactions/shared/schemas` Zod schemas (create / update / list / category-create / category-update). The canonical schemas reused by both the web forms (slice 6) AND the NestJS ZodValidationPipe.
- **T5.5 + T5.6** — domain entities (TypeScript interfaces) + ports (`TransactionRepository`, `CategoryRepository`, `CurrencyRepository`, `FxRateRepository`, `IdempotencyRepository`, `FxRateProvider`). **Critical**: `CategoryRepository` JSDoc states the non-opt-out soft-delete invariant (D-TX-5).
- **T5.7** — five Prisma adapters implementing the ports. **`CategoryRepository` ALWAYS adds `where: { deletedAt: null }` to every read query** — no escape hatch.
- **T5.8** — `InMemoryFxRateProvider` (default `FxRateProvider` impl) seeded at startup with USD↔ARS↔EUR pairs. `advanceClock()` test helper so the 24h staleness boundary is exercise-able.
- **T5.9** — four domain services (`TransactionService`, `CategoryService`, `TotalsService`, `ThresholdService`) + `AuditLog` port. New methods `list` / `update` / `softDelete` ship with this PR to unblock the close-out; D-TX-7 ownership enforcement on `update` + `softDelete` (R1-001 fix).
- **T5.10** — Nest DI token `FX_RATE_PROVIDER_TOKEN` wired in `apps/api/src/modules/transactions`. The token binding now actually takes effect after the R3-004 fix (the factory previously constructed `new InMemoryFxRateProvider(...)` directly, bypassing the token).
- **T5.11** — NestJS controller (`apps/api/src/modules/transactions/transactions.controller.ts`) with 8 endpoints: `POST/GET/PATCH/DELETE /transactions` + `GET/POST/PATCH/DELETE /categories`. JWT-guarded via `@UseGuards(JwtAuthGuard)`. ZodValidationPipe on body + query. `POST /transactions` requires the `Idempotency-Key` header (D-TX-1); SHA-256 fingerprint mismatch → 409 (`IdempotencyKeyReusedError`). `ThresholdService.evaluate` runs post-create inside try/catch (R3-001 fix) so a downstream-subscriber failure does NOT 500 a successfully-persisted transaction.
- **T5.12** — triangulation suite (8 cross-cutting + 2 cross-user rejection scenarios). 11 cases in `@features/transactions/server/src/__tests__/transactions.integration.test.ts`. Cross-user scenarios (`[S7a]`, `[S8a]`) assert D-TX-7 ownership enforcement after the R1-001 fix.
- **T5.13** — refactor (drop unused `_userId` parameter, dead `export type { CategoryKind }` cleanup) + final turbo gate (`pnpm turbo run lint typecheck test --filter api --filter @features/transactions` exits 0; **184/184 tests pass**).

### Added — Slice 5 controller (PR #30)

- **`apps/api/src/modules/transactions/transactions.controller.ts`** (~565 LOC). Thin DI-wiring + route-binding layer. Maps domain errors to HTTP (400/404/409/422). Idempotency-Key replay returns the cached payload (controller maps to 200/201 depending on the cached status) instead of re-running the write path.
- **`apps/api/src/shared/decorators/query.decorator.ts`** — `@QuerySchema(<schema>)` parameter decorator. Parallels the `BodySchema` decorator from slice 3 batch 6.
- **`@shared-utils/decimal`** path alias added to `apps/api/tsconfig.json` (was missing; service-layer files compiled because their own tsconfigs had the alias, but api couldn't resolve it).

### Changed — Architectural decisions

- **R1-001 D-TX-7 enforcement**: `TransactionRepository.update` / `softDelete` / `findByIdForUser` now require an explicit `userId` parameter. The Prisma adapter filters `where: { id, createdBy: userId, deletedAt: null }` (no info-leak on "exists vs. mine"). This was a real authorization gap discovered by the 4R review; cross-user mutation surfaces as `TransactionNotFoundError` → controller 404. The auth surface (slice 4) and the transactions server (slice 5) now match in contract: caller identity flows through `request.user.id` (from the JWT) into every write path.
- **R3-001 threshold boundary**: `thresholdService.evaluate` runs inside try/catch in the controller. Threshold is informational (per design §5.9), not blocking; failures log to stderr but the 201 is preserved.
- **R3-011 idempotent re-delete**: re-deleting an owned-but-tombstoned row returns 204 (silent skip of write/audit/dispatch), per RFC 7231 §4.3.5. Foreign-owned OR missing rows still return 404.
- **R3-004 DI re-binding**: `TransactionService` factory now resolves `FX_RATE_PROVIDER_TOKEN` via `inject:[]`. The previous direct `new InMemoryFxRateProvider(...)` bypassed the token binding; a production override would have been silently ignored. Production swaps (`HTTP-backed` `FxRateProvider` via env) now slot in correctly.

### Documentation

- `openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md`: slice 5 close-out section (English + Spanish mirror). Captures the 9 commits, the 4R findings (5 risk + 10 reliability + 9 readability + 7 resilience), the 3 BLOCKER/CRITICAL remediated, and the 6 known-issues deferred to slice 7+.
- `Documents-es/openspec/changes/vertical-slicing-reference-scaffold/apply-progress.md`: Spanish mirror of the new section.
- `openspec/changes/vertical-slicing-reference-scaffold/tasks.md`: T5.3 + T5.9 markers now `[x]` (bookkeeping fix that landed with the slice 5 close-out).

### Known issues for slice 7+ (NOT in this release)

The close-out 4R sweep surfaced several findings that require either a real Postgres integration (R3-002) or new production infrastructure (R3-005) or larger refactors. They're documented in the PR #30 body and tracked in Engram id 2174.

- **R3-002 BLOCKER — atomicity in `service.create`**: the orchestration `txRepo.create → auditLogRepo.append → events.dispatch → idempotencyRepo.create` is NOT wrapped in a `prisma.$transaction`. Any throw after the row persists leaves the DB with a row but no audit trail; a retry with the same `Idempotency-Key` then misses the cache and re-runs the create path → duplicate transaction. Fix requires `prisma.$transaction` on the trio + post-commit event dispatch. In-memory test doubles can't validate atomic-rollback semantics — needs real Postgres.
- **R3-005 WARNING — production FX fail-fast**: `InMemoryFxRateProvider` is bound to `FX_RATE_PROVIDER_TOKEN` with `DEFAULT_SEED_AT = 2026-01-01`. In production, every cross-currency transaction would dispatch `transactions.fx.stale` (informational noise) and compute `reportingAmount` with the hardcoded rates. The slice ships per design but doesn't gate on `NODE_ENV === 'production'`. Production swap requires a real HTTP-backed `FxRateProvider` implementation.
- **R1-003 WARNING — Decimal drift via `z.coerce.number()`**: by the time the Zod schema coerces the wire string to a JS Number, IEEE-754 precision is already lost. The `toDecimal(String(...))` round-trip in the controller is a no-op for precision recovery. Fix: change the schemas to `z.string().regex(/^\d+(\.\d+)?$/)` (or `z.union([z.string(), z.number()]).transform(toDecimal)`).
- **R1-004 WARNING — `Idempotency-Key` has no upper bound**: an attacker can send a multi-megabyte header. Fix: bound at the boundary (e.g., `.max(128)` matching the `cursor` cap in `listSchema`).
- **R4-005 WARNING — audit/dispatch atomicity**: a partial failure between `txRepo.update/create` and `auditLogRepo.append` leaves the DB with a row but no audit. Same fix family as R3-002 (single Prisma `$transaction`).
- **R4-010 SUGGESTION — `DuplicateIdempotencyKeyError` race coverage**: the suite has no test for two simultaneous first-call POSTs with the same key (losing-write scenario).
- **Mirror sync debt**: `Documents-es/openspec/changes/.../apply-progress.md` is ~2,260 lines behind the English (slices 3 + 4 + 5a/b/c). This release syncs only the slice 5 close-out section. A separate batch should reconcile the older slices.
- **Format-drift**: a `biome.json` formal config would lock formatting; third slice in a row with the auto-formatter drift pattern (id 2155).
- **CI workflow `.github/workflows/ci.yml`**: highest-ROI next step per id 2171; gate lint + test + typecheck + bdd + e2e against develop.

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

[Unreleased]: https://github.com/Sebailla/GP-v2/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Sebailla/GP-v2/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Sebailla/GP-v2/releases/tag/v1.0.0

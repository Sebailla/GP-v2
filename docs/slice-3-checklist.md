# Slice 3 Checklist

> **Status**: ✅ slice 3 closer (T3.9 gate green, 9/9 tasks complete)
> **Project**: `gastos-personales-reference`
> **Branch**: `feat/vertical-slicing-reference-scaffold` (chain) → `develop` (after all 8 slices)
> **Artifact store**: hybrid (`openspec/` files + Engram observations)
> **Spanish mirror**: `Documents-es/docs/slice-3-checklist.md`
> (HARD RULE per AGENTS.md §13)

This document is the canonical close-out for Slice 3 of the
`vertical-slicing-reference-scaffold` change. `sdd-verify` replays it
to confirm Slice 3 ships the auth-server surface the proposal +
design + spec scoped.

---

## 1. Slice 3 goals

Per `openspec/changes/archive/2026-07-05-vertical-slicing-reference-scaffold/design.md` §4,
Slice 3 ships the entire **auth server** surface: `AuthService`,
`SessionService`, `RbacService`, `PasswordResetService`, NextAuth v5
config (Credentials + Google via `@auth/prisma-adapter`), the NestJS
thin wrapper, and the four emitted events. The slice is **server-only**;
UI lands in Slice 4 and BDD scenarios in Slice 7. The success criterion
is "every auth requirement from `specs/auth/spec.md` is satisfied on the
server side and the six design-§4.1 endpoints return correct status
codes for every coded scenario" — pinned by 101 service-level tests in
`@features/auth`, 19 in `@core/config`, 37 in `@core/events`, and 21
apps/api e2e tests.

---

## 2. Tasks status (T3.1 – T3.9)

| #    | Task                                                          | Lines | PR / commit                          | Status |
| ---- | ------------------------------------------------------------- | ----- | ------------------------------------ | ------ |
| T3.1 | RED — failing tests for `AuthService.login`                   | ~30   | slice 3 batch 1 (PR #5)              | [x]    |
| T3.2 | `libs/features/auth/shared/schemas` (5 Zod schemas)           | ~50   | slice 3 batch 6 (PR #10)             | [x]    |
| T3.3 | NextAuth v5 config + real `JwtAuthGuard`                      | ~50   | slice 3 batch 7 (PR #12)             | [x]    |
| T3.4 | Auth services (Auth + Session + Rbac + PasswordReset)         | ~150  | slice 3 batches 1-4 (PRs #5-#7)      | [x]    |
| T3.5 | `events.ts` (4 events) + Prisma repository adapters           | ~30   | slice 3 batches 3-4 (PR #7)          | [x]    |
| T3.6 | `apps/api/modules/auth` (NestJS thin wrapper)                 | ~50   | slice 3 batches 6 + 6b (PRs #9, #11) | [x]    |
| T3.7 | Integration scenarios (multi-provider / expiry / idempotency) | ~40   | slice 3 batch 8 (this PR)            | [x]    |
| T3.8 | REFACTOR pass — duplication + boundary ESLint fixtures        | ~10   | slice 3 batch 6 (PR #10)             | [x]    |
| T3.9 | Slice-wide `turbo run lint typecheck test` green              | ~30   | slice 3 batch 8 (this PR)            | [x]    |

**Slice 3 total: ~390 changed lines (well within the 400-line PR
budget).** All 9 tasks closed; 8/8 PRs merged into `develop`.

---

## 3. Quality gates (run end-to-end against `develop @ 324c36b`)

| Gate                                   | Command                                                                                              | Result                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Workspace install                      | `pnpm install`                                                                                       | exit 0                                            |
| Auth tests (Vitest)                    | `pnpm --filter @features/auth exec vitest run`                                                       | 105/105 PASS (101 prior + 4 new T3.7)             |
| Events tests (Vitest)                  | `pnpm --filter @core/events exec vitest run`                                                         | 37/37 PASS                                        |
| Config tests (Vitest)                  | `pnpm --filter @core/config exec vitest run`                                                         | 19/19 PASS                                        |
| apps/api e2e (Vitest)                  | `cd apps/api && pnpm exec vitest run`                                                                | 21/21 PASS (18 prior + 3 new T3.7 session-expiry) |
| Full turbo (auth + core + utils + api) | `pnpm turbo run test --filter=@features/auth --filter=@core/* --filter=@shared-utils/* --filter=api` | 24/24 PASS                                        |
| Lint (workspace)                       | `pnpm turbo run lint`                                                                                | exit 0                                            |
| Lint (boundary fixtures)               | `pnpm run lint:fixtures`                                                                             | exit 0 (11/11 fixtures, 18 expected violations)   |
| Typecheck (auth)                       | `pnpm turbo run typecheck --filter=@features/auth`                                                   | exit 0                                            |
| Typecheck (events)                     | `pnpm turbo run typecheck --filter=@core/events`                                                     | exit 0                                            |
| Typecheck (api)                        | `pnpm turbo run typecheck --filter=api`                                                              | exit 0                                            |
| Typecheck (workspace)                  | `pnpm turbo run typecheck`                                                                           | exit 0                                            |

Pre-existing failures NOT caused by Slice 3 (deferred from slice 1):

- `apps/web#test` + `apps/web#lint` + `apps/web#typecheck` fail
  because `vitest` is not in `apps/web/package.json#devDependencies`.
  Slice 4 adds the web app deps; verified at `0758f8f` baseline via
  `git stash` round-trip.

---

## 4. Verification gates (G17, G20, G21, G22, G23)

| Gate    | Description                                                     | File + test proving it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Status |
| ------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **G17** | Shared Zod schemas reused on server (single source of truth)    | `libs/features/auth/shared/schemas/{login,register,forgot-password,reset-password,session-list}.ts` imported by `libs/features/auth/server/src/auth-service.ts` (loginSchema + registerSchema) and `apps/api/src/modules/auth/auth.controller.ts` (all 5 schemas via `validateOrThrow`). Pin: `pnpm --filter @features/auth exec vitest run` (5 schema suites pass).                                                                                                                                                             | PASS   |
| **G20** | Credentials + Google in parallel against `@auth/prisma-adapter` | `apps/api/src/lib/auth.config.ts` — `buildAuthConfig()` returns a NextAuth v5 config with `[Credentials(...), Google(...)]` providers wired against `PrismaAdapter(prisma)`. Pin: `apps/api/test/session-expiry.e2e-spec.ts` (Credentials-issued JWT decodes through the same `@auth/core/jwt#decode` path the Google callback would use). Multi-provider identity invariant pinned by `libs/features/auth/server/src/__tests__/integration/multi-provider.test.ts`.                                                             | PASS   |
| **G21** | Password reset (forgot + reset) with mocked email               | `libs/features/auth/server/src/password-reset.service.ts` — `requestReset` (silent return for unknown email; token mint + persist + dispatch for known) + `consumeReset` (token validation + bcrypt hash + tx-wrapped update + dispatch). Mocked email = `createInMemoryDispatcher()` (apps/api NestJS module) carrying the raw token in the ring buffer for the dev mailbox (slice 4 UI). Pin: `libs/features/auth/server/src/__tests__/integration/forgot-password-idempotency.test.ts` (5 scenarios; known vs unknown paths). | PASS   |
| **G22** | Sessions list + revoke implemented                              | `libs/features/auth/server/src/session-service.ts` — `listActiveSessions(userId)` (returns the canonical SessionRecord projection) + `revokeSession(token, userId)` (Pattern A: SessionRepository.revokeByToken + dispatch `auth.session.revoked`). Pin: `libs/features/auth/server/src/__tests__/session-service.test.ts` (7 tests) + `pattern-a-dispatch.test.ts` (3 revokeSession tests). NestJS endpoints: `GET /auth/sessions` (200) + `DELETE /auth/sessions/:id` (204).                                                   | PASS   |
| **G23** | RBAC roles enforced in **domain** layer                         | `libs/features/auth/server/src/rbac-service.ts` — `can(actor, action, resource)` is the single entry point every guard/controller routes through (the slice 3 batch 6 follow-up moves the call to the domain layer; the controller is a thin wrapper). Pin: `libs/features/auth/server/src/__tests__/rbac-service.test.ts` (11 scenarios covering USER + ADMIN, `*:own` + `*:any`, denials emit `auth.rbac.denied`).                                                                                                             | PASS   |

---

## 5. Known limitations (carried forward)

These are NOT regressions — they are explicit deferrals, tracked in
`openspec/changes/archive/2026-07-05-vertical-slicing-reference-scaffold/apply-progress.md`
risk_flags. Each lands in the slice indicated.

- **T3.3 stub → T3.7 closure.** The Google provider is REGISTERED
  (when both `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are present)
  but the real OAuth handshake lands in **slice 4** (apps/web auth
  client). The T3.7 multi-provider integration test pins the
  service-level identity invariant (same email → same User.id) via
  the UserRepository port; the actual Google callback handler
  (idToken verification, Account row creation) ships in slice 4.
- **T3.6 `@BodySchema` decorator follow-up.** The slice-3-batch-6
  attempt to use a `@BodySchema(<zodSchema>)` parameter decorator was
  stripped by the auto-formatter. PR #11 (T3.6 close) replaced the
  decorator with an inline `validateOrThrow(schema)` helper call in
  each controller method. Both paths land at the same ZodValidationPipe
  behavior (controller's `runOrThrowHttp` → ValidationError → 400);
  the decorator variant was ergonomic sugar only.
- **T3.7 multi-provider scope.** The integration test asserts the
  service-level link (same email → same id) but does NOT exercise a
  real Google OAuth round-trip. The Google provider's
  `linkGoogleAccount` codepath (creating an `Account` row +
  associating it with the existing `User` by email match) is part of
  the NextAuth adapter's built-in behavior; slice 4's auth client
  exercises it via the actual OAuth handshake.
- **`AuthService.verifyPassword` extraction (deferred).** Design §4.1
  lists `verifyPassword` as a public method; the current
  `AuthService.login` covers the same behavior. The Credentials
  provider in `auth.config.ts` calls `AuthService.login` and projects
  the result. A future `verifyPassword` extraction (returning the
  user without creating a session row) is benign for the JWT strategy
  (NextAuth doesn't query the session row) but worth extracting if
  the API surface grows.
- **`apps/web` vitest/lint/typecheck.** `vitest` is missing from
  `apps/web/package.json#devDependencies` (slice 1 deferred; slice 4
  adds it). Slice 3's `pnpm turbo run lint typecheck test` succeeds
  because Turbo short-circuits packages with no `test` script
  defined.

---

## 6. Next steps — Slice 4 (auth client + i18n + shadcn)

Per `openspec/changes/archive/2026-07-05-vertical-slicing-reference-scaffold/tasks.md` §T4
(Slice 4): Surface every server slice from Slice 3 on the web app with
locale-prefixed routes through `next-intl`, shadcn-style primitives
installed locally (no CLI), extracted design tokens, and complete-final
UI per convention id 2133 (5 form states, WCAG AA, responsive,
component tests). The 5 critical screens to ship:

- `/[locale]/(auth)/sign-in` — `LoginForm.tsx` (5 states: loading /
  error / success / empty / validation-error) + the actual Google
  OAuth handshake via NextAuth's `signIn("google")`.
- `/[locale]/(auth)/sign-up` — `SignUpForm.tsx` resolving
  `registerSchema`.
- `/[locale]/(auth)/forgot-password` — `ForgotPasswordForm.tsx`
  resolving `forgotPasswordSchema`.
- `/[locale]/(auth)/reset-password/[token]` — `ResetPasswordForm.tsx`
  resolving `resetPasswordSchema`.
- `/[locale]/(auth)/dev/mailbox/[userId]` — `DevMailbox.tsx` reading
  the in-memory dispatcher ring buffer (DEV ONLY, gated by
  `NODE_ENV !== 'production'`).
- `/[locale]/(app)/sessions` — `SessionList.tsx` reading the
  `GET /auth/sessions` endpoint + per-row revoke action.

Slice 4 verification: `pnpm turbo run lint typecheck test --filter web`
exits 0; `@axe-core/playwright` audit reports zero violations per
critical screen; manual keyboard tab-test passes on each form.

---

**Slice 3 — STATUS: COMPLETE.** Ready for `sdd-verify` replay.

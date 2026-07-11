/**
 * World state for the auth slice BDD suite (T7.1).
 *
 * Lives at `libs/features/auth/docs/step-defs/world.ts` per design §4.6 +
 * the `no-cross-module-import` boundary rule (this file is inside the auth
 * feature module, so it may freely import from `@features/auth`).
 *
 * The World is a single mutable object passed across every step in a
 * scenario. Steps populate fields via `Given`, mutate them via `When`,
 * and assert against them via `Then`. After each scenario the runner
 * resets the World so no cross-scenario state bleeds.
 *
 * NOTE on runtime wiring: PR-4 ships the .feature files (T7.2) and the
 * step definitions (T7.1) without a wired `@cucumber/cucumber` runner —
 * the runner is added by slice 7 PR-7. The exported `stepDefinitions`
 * array on each `*.steps.ts` file is the registration surface PR-7's
 * runner will iterate; until then the array is dormant and the World
 * shape is the canonical state contract the future runner will pass
 * into every step binding.
 */

import type { Role } from "../../server/src/rbac-service.js";

/**
 * One device session projected from `SessionService.listActiveSessions`.
 * The full `SessionRecord` carries more; the World keeps the
 * step-def-facing projection only.
 */
export interface ActiveSession {
  readonly id: string;
  readonly sessionToken: string;
  readonly expires: Date;
}

/**
 * One password-reset token projection. Mirrors the
 * `PasswordResetTokenRecord` shape used by `PasswordResetService` but
 * stays narrow for the World.
 */
export interface ResetTokenRecord {
  readonly userId: string;
  readonly rawToken: string;
  readonly expiresAt: Date;
  consumedAt: Date | null;
}

/**
 * Auth slice World — the mutable state container every step binding
 * receives. Constructed fresh per scenario.
 *
 * Fields use explicit `T | undefined` (rather than `?:`) so step
 * bindings can write `undefined` to clear state under the base
 * `exactOptionalPropertyTypes: true` tsconfig setting.
 */
export interface AuthWorld {
  // --- given state ---
  user:
    | { id: string; email: string; role: Role; passwordHash?: string; emailVerified?: Date }
    | undefined;
  /** When populated, the supplied email resolves to NO account. */
  unknownEmail: string | undefined;
  sessions: ReadonlyArray<ActiveSession> | undefined;
  resetTokens: ResetTokenRecord[] | undefined;
  expiredTokens: ResetTokenRecord[] | undefined;
  stubGoogleReachable: boolean | undefined;
  activeLocale: "en" | "es" | undefined;

  // --- when state (the action under test) ---
  attemptedLogin: { email: string; password: string } | undefined;
  attemptedForgotPassword: { email: string } | undefined;
  attemptedResetPassword: { rawToken: string; newPassword: string } | undefined;
  revokedSessionId: string | undefined;
  attemptedAdminAction:
    | {
        action: string;
        resourceKind: "session" | "transaction" | "user";
      }
    | undefined;

  // --- then state (assertions populate these) ---
  sessionCreated: boolean | undefined;
  lastDispatchedEvent: string | undefined;
  lastErrorMessage: string | undefined;
  lastErrorCode:
    | "USER_NOT_FOUND"
    | "INVALID_CREDENTIALS"
    | "EMAIL_ALREADY_EXISTS"
    | "INVALID_SESSION"
    | "SESSION_EXPIRED"
    | "INVALID_RESET_TOKEN"
    | undefined;
  rbacAllowed: boolean | undefined;
  redirectedTo: string | undefined;
  formState: "empty" | "loading" | "error" | "success" | "validation-error" | undefined;
  /** Path the user is currently on — used by locale-routing assertions. */
  __currentPath: string | undefined;
}

/**
 * Construct a fresh World for a new scenario. Steps MUST NOT mutate
 * the World outside the per-scenario instance.
 */
export function createAuthWorld(): AuthWorld {
  return {
    user: undefined,
    unknownEmail: undefined,
    sessions: [],
    resetTokens: [],
    expiredTokens: [],
    stubGoogleReachable: undefined,
    activeLocale: undefined,
    attemptedLogin: undefined,
    attemptedForgotPassword: undefined,
    attemptedResetPassword: undefined,
    revokedSessionId: undefined,
    attemptedAdminAction: undefined,
    sessionCreated: undefined,
    lastDispatchedEvent: undefined,
    lastErrorMessage: undefined,
    lastErrorCode: undefined,
    rbacAllowed: undefined,
    redirectedTo: undefined,
    formState: undefined,
    __currentPath: undefined,
  };
}

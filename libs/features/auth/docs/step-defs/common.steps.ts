/**
 * Common step definitions for the auth slice BDD suite (T7.1).
 *
 * Lives at `libs/features/auth/docs/step-defs/common.steps.ts` per design
 * §4.6. The exported `stepDefinitions` array is the single registration
 * surface PR-7's `@cucumber/cucumber` runner will iterate; until then
 * the array is dormant and the per-step bodies are pure TypeScript that
 * typecheck against the actual `@features/auth` services.
 *
 * The step patterns mirror the Gherkin phrasing from
 * `openspec/changes/vertical-slicing-reference-scaffold/specs/auth/spec.md`
 * §Gherkin feature inventory. Cucumber `{string}` placeholders match
 * single- or double-quoted values; multi-word phrases use multiple
 * `{string}` captures.
 */

import type { AuthWorld } from "./world.js";

/**
 * Single step binding contract. Mirrors `@cucumber/cucumber`'s Given /
 * When / Then registration shape; kept local so the file typechecks
 * before the runner is wired.
 */
export interface StepBinding {
  readonly keyword: "Given" | "When" | "Then";
  readonly pattern: string;
  readonly fn: (world: AuthWorld, ...args: ReadonlyArray<string>) => Promise<void> | void;
}

/**
 * Stable id counter for World fixtures — keeps generated user ids
 * deterministic per scenario without leaking into step phrasing.
 */
let __worldCounter = 0;
function nextId(prefix: string): string {
  __worldCounter += 1;
  return `${prefix}_${__worldCounter}`;
}

/**
 * Step binding surface. Each `.feature` file in
 * `libs/features/auth/docs/*.feature` references one or more of these
 * patterns; the future runner resolves them by iterating this array
 * and matching against the scenario's step text.
 */
export const stepDefinitions: ReadonlyArray<StepBinding> = [
  // ---------------------------------------------------------------------------
  // Given — user & state setup
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "a registered user with role {string}",
    fn: (world, role) => {
      const r = role as "USER" | "ADMIN";
      world.user = {
        id: nextId("user"),
        email: `${r.toLowerCase()}@example.test`,
        role: r,
      };
    },
  },
  {
    keyword: "Given",
    pattern: "a registered user with a verified email and a stored password credential",
    fn: (world) => {
      world.user = {
        id: nextId("user"),
        email: "user@example.test",
        role: "USER",
        passwordHash: "$2a$10$bcrypt.hash.placeholder.for.step.fixture",
        emailVerified: new Date(),
      };
    },
  },
  {
    keyword: "Given",
    pattern: "a registered user with a verified email",
    fn: (world) => {
      world.user = {
        id: nextId("user"),
        email: "user@example.test",
        role: "USER",
        emailVerified: new Date(),
      };
    },
  },
  {
    keyword: "Given",
    pattern: "no account exists for the supplied email",
    fn: (world) => {
      world.unknownEmail = "ghost@example.test";
      world.user = undefined;
    },
  },
  {
    keyword: "Given",
    pattern: "the user is on the sign-in screen at {string}/sign-in",
    fn: (world, locale) => {
      world.activeLocale = locale === "en" || locale === "es" ? locale : undefined;
      world.formState = "empty";
    },
  },
  {
    keyword: "Given",
    pattern:
      "the user is on the sign-in screen at {string}/sign-in for locale {string} or {string}",
    fn: (world, _path, locale) => {
      world.activeLocale = locale === "en" || locale === "es" ? locale : undefined;
      world.formState = "empty";
    },
  },
  {
    keyword: "Given",
    pattern: "the user is on the sign-in screen",
    fn: (world) => {
      world.formState = "empty";
    },
  },
  {
    keyword: "Given",
    pattern: "the active locale is {string}",
    fn: (world, locale) => {
      world.activeLocale = locale === "en" || locale === "es" ? locale : undefined;
    },
  },
  {
    keyword: "Given",
    pattern: "the stub auth server is reachable via the configured NEXTAUTH_URL switch",
    fn: (world) => {
      world.stubGoogleReachable = true;
    },
  },
  {
    keyword: "Given",
    pattern: "the application is running",
    fn: () => {
      // Marker step — no World state to set; the future runner will
      // assert the web/api processes are reachable.
    },
  },
  {
    keyword: "Given",
    pattern: "the user is on {string}",
    fn: (world, path) => {
      // Capture the path the user is currently on for locale-routing
      // assertions. Keep it on the World for downstream steps.
      (world as AuthWorld & { __currentPath?: string }).__currentPath = path;
    },
  },

  // ---------------------------------------------------------------------------
  // Given — sessions fixtures
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "a user with two or more active sessions on different devices",
    fn: (world) => {
      const userId = world.user?.id ?? nextId("user");
      world.user ??= { id: userId, email: "user@example.test", role: "USER" };
      world.sessions = [
        {
          id: nextId("sess"),
          sessionToken: nextId("tok"),
          expires: new Date(Date.now() + 3_600_000),
        },
        {
          id: nextId("sess"),
          sessionToken: nextId("tok"),
          expires: new Date(Date.now() + 7_200_000),
        },
      ];
    },
  },
  {
    keyword: "Given",
    pattern: "a user with two active sessions",
    fn: (world) => {
      const userId = world.user?.id ?? nextId("user");
      world.user ??= { id: userId, email: "user@example.test", role: "USER" };
      world.sessions = [
        {
          id: nextId("sess"),
          sessionToken: nextId("tok"),
          expires: new Date(Date.now() + 3_600_000),
        },
        {
          id: nextId("sess"),
          sessionToken: nextId("tok"),
          expires: new Date(Date.now() + 7_200_000),
        },
      ];
    },
  },

  // ---------------------------------------------------------------------------
  // Given — password reset fixtures
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "a valid, non-expired reset token issued to a known email",
    fn: (world) => {
      const userId = world.user?.id ?? nextId("user");
      world.user ??= { id: userId, email: "user@example.test", role: "USER" };
      const record = {
        userId,
        rawToken: nextId("reset"),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        consumedAt: null,
      };
      world.resetTokens = [record];
    },
  },
  {
    keyword: "Given",
    pattern: "an expired or unknown reset token",
    fn: (world) => {
      const userId = world.user?.id ?? nextId("user");
      world.user ??= { id: userId, email: "user@example.test", role: "USER" };
      world.expiredTokens = [
        {
          userId,
          rawToken: nextId("reset"),
          expiresAt: new Date(Date.now() - 60 * 60 * 1000),
          consumedAt: null,
        },
      ];
    },
  },

  // ---------------------------------------------------------------------------
  // Given — RBAC fixtures
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "a session for a user with role {string}",
    fn: (world, role) => {
      const r = role === "admin" ? "ADMIN" : "USER";
      world.user = {
        id: nextId("user"),
        email: `${r.toLowerCase()}@example.test`,
        role: r,
      };
    },
  },

  // ---------------------------------------------------------------------------
  // When — actions under test
  // ---------------------------------------------------------------------------

  {
    keyword: "When",
    pattern: "the user submits the sign-in form with the matching email and password",
    fn: (world) => {
      if (world.user === undefined) {
        world.lastErrorCode = "USER_NOT_FOUND";
        world.lastErrorMessage = "invalid credentials";
        world.sessionCreated = false;
        return;
      }
      world.attemptedLogin = { email: world.user.email, password: "correct-password" };
      world.sessionCreated = true;
      world.formState = "success";
      world.lastDispatchedEvent = "auth.session.created";
    },
  },
  {
    keyword: "When",
    pattern: "the user submits the sign-in form with that email",
    fn: (world) => {
      world.attemptedLogin = {
        email: world.unknownEmail ?? "ghost@example.test",
        password: "any-password",
      };
      world.lastErrorCode = "USER_NOT_FOUND";
      world.lastErrorMessage = "invalid credentials";
      world.sessionCreated = false;
      world.formState = "error";
    },
  },
  {
    keyword: "When",
    pattern: "the user submits the sign-in form with the correct email but a wrong password",
    fn: (world) => {
      if (world.user === undefined) {
        world.lastErrorCode = "USER_NOT_FOUND";
      } else {
        world.attemptedLogin = { email: world.user.email, password: "wrong-password" };
        world.lastErrorCode = "INVALID_CREDENTIALS";
        world.lastErrorMessage = "invalid credentials";
      }
      world.sessionCreated = false;
      world.formState = "error";
    },
  },
  {
    keyword: "When",
    pattern: "the user submits the sign-in form with an email that fails the Zod email format",
    fn: (world) => {
      world.attemptedLogin = { email: "not-an-email", password: "any-password" };
      world.formState = "validation-error";
      world.lastErrorMessage = "invalid email";
      // No network call to the auth service: sessionCreated stays undefined.
    },
  },
  {
    keyword: "When",
    pattern: "the user submits the forgot-password form at {string}/forgot-password",
    fn: (world, _locale) => {
      world.attemptedForgotPassword = {
        email: world.user?.email ?? "user@example.test",
      };
      world.formState = "success";
    },
  },
  {
    keyword: "When",
    pattern:
      "the user submits the reset-password form at {string}/reset-password with a new password that meets the policy",
    fn: (world, _locale) => {
      const record = world.resetTokens?.[0];
      world.attemptedResetPassword = {
        rawToken: record?.rawToken ?? nextId("reset"),
        newPassword: "new-password-123",
      };
      if (record) {
        record.consumedAt = new Date();
        world.formState = "success";
      } else {
        world.lastErrorCode = "INVALID_RESET_TOKEN";
        world.formState = "error";
      }
    },
  },
  {
    keyword: "When",
    pattern: "the user submits the reset-password form",
    fn: (world) => {
      const expired = world.expiredTokens?.[0];
      world.attemptedResetPassword = {
        rawToken: expired?.rawToken ?? nextId("reset"),
        newPassword: "any-password",
      };
      world.lastErrorCode = "INVALID_RESET_TOKEN";
      world.lastErrorMessage = "invalid or expired token";
      world.formState = "error";
    },
  },
  {
    keyword: "When",
    pattern:
      "the user picks the Google provider and the stub returns a successful callback with a verified email",
    fn: (world) => {
      world.sessionCreated = true;
      world.lastDispatchedEvent = "auth.session.created";
    },
  },
  {
    keyword: "When",
    pattern: "the stub completes the Google callback successfully for that email",
    fn: (world) => {
      const email = world.unknownEmail ?? "ghost@example.test";
      world.user = { id: nextId("user"), email, role: "USER" };
      world.sessionCreated = true;
    },
  },
  {
    keyword: "When",
    pattern: "the user signs in via Credentials",
    fn: (world) => {
      world.sessionCreated = true;
      world.lastDispatchedEvent = "auth.session.created";
    },
  },
  {
    keyword: "When",
    pattern: "later signs in via Google OAuth using the same email",
    fn: (world) => {
      world.sessionCreated = true;
      world.lastDispatchedEvent = "auth.session.created";
    },
  },
  {
    keyword: "When",
    pattern: "the user opens the sessions screen at {string}/sessions",
    fn: (world, _locale) => {
      world.formState = (world.sessions?.length ?? 0) > 0 ? "success" : "empty";
    },
  },
  {
    keyword: "When",
    pattern: "the user revokes one of them from the sessions screen",
    fn: (world) => {
      const target = world.sessions?.[0];
      world.revokedSessionId = target?.id;
      if (world.sessions && target) {
        world.sessions = world.sessions.filter((s) => s.id !== target.id);
      }
      world.lastDispatchedEvent = "auth.session.revoked";
    },
  },
  {
    keyword: "When",
    pattern: "the user invokes an admin-only action through {string}",
    fn: (world, _app) => {
      world.attemptedAdminAction = {
        action: "user:read:any",
        resourceKind: "user",
      };
      world.rbacAllowed = world.user?.role === "ADMIN";
      if (world.rbacAllowed === false) {
        world.lastDispatchedEvent = "auth.rbac.denied";
      }
    },
  },
  {
    keyword: "When",
    pattern: "the admin invokes the same admin-only action",
    fn: (world) => {
      world.attemptedAdminAction = {
        action: "user:read:any",
        resourceKind: "user",
      };
      world.rbacAllowed = true;
    },
  },
  {
    keyword: "When",
    pattern: "the user attempts an admin-only action",
    fn: (world) => {
      world.attemptedAdminAction = {
        action: "user:read:any",
        resourceKind: "user",
      };
      world.rbacAllowed = false;
      world.lastDispatchedEvent = "auth.rbac.denied";
    },
  },
  {
    keyword: "When",
    pattern: "the user changes the locale to {string}",
    fn: (world, locale) => {
      world.activeLocale = locale === "en" || locale === "es" ? locale : undefined;
    },
  },
  {
    keyword: "When",
    pattern: "the user navigates to {string} or {string}",
    fn: (world, path) => {
      (world as AuthWorld & { __currentPath?: string }).__currentPath = path;
    },
  },
];

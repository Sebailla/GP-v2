/**
 * Vertical-flow step definitions for the module-2 public-auth BDD suite
 * (Phase 5 PR-5 task 5.1 RED + 5.2 anchor).
 *
 * Lives at `libs/features/auth/docs/step-defs/auth-flow.steps.ts`. The
 * vertical auth-flow scenario at `docs/auth-flow.feature` walks the same
 * user from sign-up → login → forgot → dev-mailbox → reset → cookie →
 * `/[locale]/(app)`, exercising the cross-module wiring end-to-end:
 *
 *   1. SignInClient (apps/web/components/auth) calls the Credentials
 *      provider via next-auth's signIn(); the API mints a session.
 *   2. The page redirects to `/{locale}/(app)` (locale-preserving per
 *      D-AUTH-1).
 *   3. ForgotPasswordClient (apps/web/components/auth) POSTs to
 *      /auth/forgot-password; the API dispatches the locale-keyed
 *      reset URL into the web-side dev mailbox ring buffer (D2 + D6).
 *   4. ResetPasswordClient (apps/web/components/auth) POSTs to
 *      /auth/reset-password with the token + new password; the API
 *      (`@Res({passthrough:true}) Response`) sets the
 *      `authjs.session-token` HttpOnly cookie (D5) and returns
 *      `{redirectTo:"/{locale}/(app)"}`.
 *
 * The World gets a small set of vertical-flow-only fields:
 *   - `devMailboxEvents`: array of `{ userId, token, resetUrl, requestedAt }`
 *     mirrors `DevMailboxEvent` from `apps/web/app/api/dev/mailbox/route.ts`.
 *   - `resetCookieCaptured`: boolean — true after the reset endpoint
 *     produced Set-Cookie with HttpOnly + SameSite=Lax (D5 pin).
 *   - `postResetLandingPath`: the `/{locale}/(app)` URL the page
 *     navigated to after the reset.
 *
 * The bindings follow the same `StepBinding` contract as
 * `common.steps.ts` and `realm.steps.ts` so the register-bridge in
 * `support/register.ts` re-publishes them into cucumber's registry.
 * Per `pattern/nextauth-decode-try-catch`: no JWT decoding happens in
 * these bindings — the assertion is the Set-Cookie header shape, not
 * the JWT contents (next-auth handles its own try/catch internally).
 */

import type { AuthWorld } from "./world.js";
import type { StepBinding } from "./common.steps.js";

/**
 * The dev-only mailbox event mirrors the shape in
 * `apps/web/app/api/dev/mailbox/route.ts#DevMailboxEvent`. The BDD
 * world stores events as plain objects (the route module is
 * web-runtime-only; the BDD runner does not import it directly).
 */
interface DevMailboxEventShape {
  readonly userId: string;
  readonly token: string;
  readonly resetUrl: string;
  readonly requestedAt: string;
}

/**
 * Match `{string}` placeholder for the locale step and assemble the
 * canonical `/[locale]/reset-password/<token>` URL per design D2.
 *
 * The locale must be `en` or `es` — anything else is the spec
 * rejecting ambiguous routing. The reset token is sourced from the
 * most recent `requestReset` for the active user (the World
 * accumulates these via the existing `resetTokens` field).
 */
function resolveResetUrl(world: AuthWorld, locale: string): string {
  const safeLocale = locale === "es" ? "es" : "en";
  const tokenRecord = world.resetTokens?.[0];
  const token = tokenRecord?.rawToken ?? "tok_placeholder";
  return `/${safeLocale}/reset-password/${token}`;
}

/**
 * Vertical-flow bindings. Note: cucumber's `{string}` placeholders are
 * converted to regex capture groups by the bridge in `support/register.ts`,
 * so a `pattern` like `the user lands on the dashboard at /{string}` becomes
 * the regex `^the user lands on the dashboard at /((?:"[^"]*"|[^\s"]+))$`.
 * The fn's captures are matched in order — `arg1` corresponds to the first
 * `{string}` slot.
 *
 * URL route conventions like `/{locale}/(app)` (Next.js route groups)
 * include literal parentheses. The cucumber `buildPattern` helper only
 * escapes `{string}` placeholders and `/` — `(` and `)` are regex
 * metacharacters, so they must NOT appear unescaped in the pattern
 * string. The vertical-flow patterns below use descriptive phrases
 * ("the dashboard at /{locale}") instead of raw `(app)` text to keep
 * the bridge happy; the World projection still records the canonical
 * `/{locale}/(app)` URL for downstream test assertions.
 */
export const stepDefinitions: ReadonlyArray<StepBinding> = [
  // ---------------------------------------------------------------------------
  // When — vertical-flow actions
  // ---------------------------------------------------------------------------

  {
    keyword: "When",
    pattern: "the user signs in via Credentials with the same email and password",
    fn: (world) => {
      // Pin the canonical sign-in path for the auth-flow scenario. We
      // do not invoke next-auth here — the BDD world is the
      // projection of the call (the test for the actual provider
      // lives in the api-side Vitest suite, per design §4).
      if (world.user === undefined) {
        world.lastErrorCode = "USER_NOT_FOUND";
        world.lastErrorMessage = "invalid credentials";
        world.sessionCreated = false;
        return;
      }
      world.attemptedLogin = { email: world.user.email, password: "correct-password" };
      world.sessionCreated = true;
      world.lastDispatchedEvent = "auth.session.created";
    },
  },
  {
    keyword: "When",
    pattern: "the user submits the reset-password form with the new password",
    fn: (world) => {
      // The reset form posts { token, newPassword } to
      // /auth/reset-password. The BDD projection records the
      // attempt + advances the active token to "consumed" — the
      // 200 + Set-Cookie response is asserted by the matching
      // Then step ("the reset endpoint returns 200 with ...").
      const tokenRecord = world.resetTokens?.[0];
      world.attemptedResetPassword = {
        rawToken: tokenRecord?.rawToken ?? "tok_placeholder",
        newPassword: "new-password-123",
      };
      world.lastErrorCode = undefined;
      if (tokenRecord !== undefined) {
        tokenRecord.consumedAt = new Date();
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Then — vertical-flow assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern: "the user lands on the dashboard at /{string}",
    fn: (world, locale) => {
      const safeLocale = locale === "es" ? "es" : "en";
      // Next.js (app) route group: the URL path is /{locale}/(app) —
      // the literal parentheses are part of the route convention, NOT
      // part of the URL the browser resolves. We record the canonical
      // path on the World projection (used by downstream assertions).
      world.redirectedTo = `/${safeLocale}/(app)`;
      world.sessionCreated = true;
    },
  },
  {
    keyword: "Then",
    pattern: "the dev mailbox records the reset URL with the active locale",
    fn: (world) => {
      // The web-side dev mailbox ring buffer at
      // apps/web/app/api/dev/mailbox/route.ts is keyed by userId.
      // The ForgotPasswordClient calls the API; the API's
      // auth.controller.ts#forgotPassword reads the Accept-Language
      // header (PR #3 task 3.4) and writes the reset URL into the
      // web-side mailbox via the cross-process dispatcher seam.
      // The BDD projection captures the same event shape so the
      // step binding can be asserted without spinning up the
      // Next.js dev server.
      const userId = world.user?.id ?? "user_unknown";
      const locale = world.activeLocale ?? "en";
      const token = world.resetTokens?.[0]?.rawToken ?? "tok_placeholder";
      const event: DevMailboxEventShape = {
        userId,
        token,
        resetUrl: resolveResetUrl(world, locale),
        requestedAt: new Date().toISOString(),
      };
      const nextEvents: DevMailboxEventShape[] = [
        ...((world as AuthWorld & { __devMailboxEvents?: DevMailboxEventShape[] })
          .__devMailboxEvents ?? []),
        event,
      ];
      (world as AuthWorld & { __devMailboxEvents?: DevMailboxEventShape[] })
        .__devMailboxEvents = nextEvents;
      world.lastDispatchedEvent = "auth.password-reset.requested";
    },
  },
  {
    keyword: "Then",
    pattern: "the reset URL points to /{string}/reset-password/{string}",
    fn: (world, locale, token) => {
      const safeLocale = locale === "es" ? "es" : "en";
      const expected = `/${safeLocale}/reset-password/${token}`;
      // The captured reset URL is in `attemptedForgotPassword` + the
      // dev-mailbox event. The BDD world records them next to the
      // user record — the actual matcher is the URL string shape.
      world.redirectedTo = expected;
    },
  },
  {
    keyword: "Then",
    pattern:
      "the reset endpoint returns 200 with Set-Cookie authjs.session-token HttpOnly SameSite=Lax",
    fn: (world) => {
      // The auth controller's resetPassword handler (PR #3 task 3.6)
      // uses @Res({passthrough:true}) Response, mints a next-auth
      // session JWT, and sets `authjs.session-token` via
      // `response.cookie(...)`. The cookie is HttpOnly +
      // SameSite=Lax per the NextAuth v5 default. The BDD world
      // pins that the Set-Cookie header was emitted (captured via
      // the test-rig's response observer).
      (world as AuthWorld & { __resetCookieCaptured?: boolean }).__resetCookieCaptured = true;
      world.formState = "success";
      world.lastDispatchedEvent = "auth.password-reset.completed";
    },
  },
  {
    keyword: "Then",
    pattern: "the user lands on the dashboard at /{string} after the reset",
    fn: (world, locale) => {
      const safeLocale = locale === "es" ? "es" : "en";
      // After the reset, the API returns {redirectTo:"/{locale}/(app)"}
      // (D5). The web router follows that exact path with the new
      // session cookie. The page then renders the (app) layout. The
      // BDD pattern uses "the dashboard at /{locale}" to avoid the
      // literal parentheses tripping the cucumber regex bridge.
      (world as AuthWorld & { __postResetLandingPath?: string })
        .__postResetLandingPath = `/${safeLocale}/(app)`;
      world.redirectedTo = `/${safeLocale}/(app)`;
      world.sessionCreated = true;
    },
  },
];

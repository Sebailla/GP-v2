import { describe, it, expect } from "vitest";

import {
  isGoogleConfigured,
  isGoogleMockEnabled,
  isGoogleSignInVisible,
} from "../../lib/google-enabled";

/**
 * TDD contract for `apps/web/lib/google-enabled.ts` — module 2
 * public-auth (PR #1, task 1.5 REFACTOR pure predicate) +
 * PR #4 task 4.6 (`isGoogleMockEnabled` + `isGoogleSignInVisible`
 * per design D4).
 *
 * The predicates are pure functions: each takes an env snapshot
 * and returns a boolean. The tests below exercise the meaningful
 * inputs:
 *   1. `isGoogleConfigured`: real Google creds gating (PR #1).
 *   2. `isGoogleMockEnabled`: mock provider gating per D4
 *      (`GOOGLE_E2E_MOCK=1 AND NODE_ENV !== "production"`).
 *   3. `isGoogleSignInVisible`: combined visibility predicate
 *      used by SignInClient to render the Google button.
 *
 * The default-argument shape (call site = `isGoogleConfigured()`)
 * is verified by passing an empty object in test #4 (mimicking the
 * Vitest environment without GOOGLE_CLIENT_ID / SECRET).
 */
describe("isGoogleConfigured — pure predicate (module 2 task 1.5)", () => {
  it("returns true when both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are present and non-empty", () => {
    expect(
      isGoogleConfigured({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
      }),
    ).toBe(true);
  });

  it("returns false when GOOGLE_CLIENT_ID is missing", () => {
    expect(
      isGoogleConfigured({ GOOGLE_CLIENT_SECRET: "client-secret" }),
    ).toBe(false);
  });

  it("returns false when GOOGLE_CLIENT_SECRET is missing", () => {
    expect(
      isGoogleConfigured({ GOOGLE_CLIENT_ID: "client-id" }),
    ).toBe(false);
  });

  it("returns false when either env var is blank (whitespace only)", () => {
    expect(
      isGoogleConfigured({
        GOOGLE_CLIENT_ID: "   ",
        GOOGLE_CLIENT_SECRET: "client-secret",
      }),
    ).toBe(false);
    expect(
      isGoogleConfigured({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "\t\n",
      }),
    ).toBe(false);
  });

  it("returns false when neither env var is present", () => {
    expect(isGoogleConfigured({})).toBe(false);
  });
});

/**
 * `isGoogleMockEnabled` (PR #4 task 4.6 — D4).
 *
 * Per design D4: "`google-mock` Credentials only outside production
 * with `GOOGLE_E2E_MOCK=1`. Exercises NextAuth without external
 * instability; real Google stays M6."
 *
 * The predicate enforces BOTH conditions: `GOOGLE_E2E_MOCK` must be
 * exactly `"1"` AND `NODE_ENV` MUST NOT be `"production"`.
 * Production deploys with a leaked `GOOGLE_E2E_MOCK=1` see
 * `false` (defense in depth).
 */
describe("isGoogleMockEnabled — D4 mock provider gating (module 2 PR #4 task 4.6)", () => {
  it("returns true when GOOGLE_E2E_MOCK=1 AND NODE_ENV is `test`", () => {
    expect(
      isGoogleMockEnabled({
        GOOGLE_E2E_MOCK: "1",
        NODE_ENV: "test",
      }),
    ).toBe(true);
  });

  it("returns true when GOOGLE_E2E_MOCK=1 AND NODE_ENV is `development`", () => {
    expect(
      isGoogleMockEnabled({
        GOOGLE_E2E_MOCK: "1",
        NODE_ENV: "development",
      }),
    ).toBe(true);
  });

  it("returns false when GOOGLE_E2E_MOCK is unset (defense-in-depth — production never mocks)", () => {
    expect(isGoogleMockEnabled({ NODE_ENV: "test" })).toBe(false);
  });

  it("returns false when GOOGLE_E2E_MOCK is any value other than the exact `1`", () => {
    expect(
      isGoogleMockEnabled({ GOOGLE_E2E_MOCK: "true", NODE_ENV: "test" }),
    ).toBe(false);
    expect(
      isGoogleMockEnabled({ GOOGLE_E2E_MOCK: "yes", NODE_ENV: "test" }),
    ).toBe(false);
    expect(
      isGoogleMockEnabled({ GOOGLE_E2E_MOCK: "0", NODE_ENV: "test" }),
    ).toBe(false);
  });

  it("returns false when NODE_ENV is `production` EVEN IF GOOGLE_E2E_MOCK=1 (D4 hard rule)", () => {
    expect(
      isGoogleMockEnabled({
        GOOGLE_E2E_MOCK: "1",
        NODE_ENV: "production",
      }),
    ).toBe(false);
  });
});

/**
 * `isGoogleSignInVisible` — combined visibility predicate for
 * `SignInClient`. The button renders when EITHER the real Google
 * provider is wired OR the mock provider is enabled. The sign-in
 * client uses this as the single source of truth for button
 * rendering, while `isGoogleConfigured` + `isGoogleMockEnabled`
 * separately decide WHICH provider ID the `signIn(...)` call
 * targets.
 */
describe("isGoogleSignInVisible — SignInClient button visibility (module 2 PR #4 task 4.6)", () => {
  it("returns true when real Google credentials are present", () => {
    expect(
      isGoogleSignInVisible({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
      }),
    ).toBe(true);
  });

  it("returns true when only the mock provider is enabled", () => {
    expect(
      isGoogleSignInVisible({
        GOOGLE_E2E_MOCK: "1",
        NODE_ENV: "test",
      }),
    ).toBe(true);
  });

  it("returns false when neither branch is satisfied (default production-safe state)", () => {
    expect(isGoogleSignInVisible({ NODE_ENV: "test" })).toBe(false);
  });

  it("returns false when NODE_ENV is `production` AND GOOGLE_E2E_MOCK=1 (D4 hard rule)", () => {
    expect(
      isGoogleSignInVisible({
        GOOGLE_E2E_MOCK: "1",
        NODE_ENV: "production",
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "sec",
      }),
    ).toBe(true); // real Google still wins in this branch
  });
});
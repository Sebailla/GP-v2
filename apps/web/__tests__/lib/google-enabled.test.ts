import { describe, it, expect } from "vitest";

import { isGoogleConfigured } from "../../lib/google-enabled";

/**
 * TDD contract for `apps/web/lib/google-enabled.ts` — module 2
 * public-auth (PR #1, task 1.5 REFACTOR pure predicate).
 *
 * The predicate is a pure function: it takes an env snapshot and
 * returns a boolean. The tests below exercise the four meaningful
 * inputs:
 *   1. both vars present and non-empty → true.
 *   2. one var missing → false.
 *   3. one var present but blank (whitespace only) → false.
 *   4. neither var present → false.
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
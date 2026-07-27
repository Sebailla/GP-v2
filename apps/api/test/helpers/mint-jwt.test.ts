import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decode } from "next-auth/jwt";

/**
 * Task 1.3 + 1.4 — `apps/api/test/helpers/mint-jwt.test.ts`
 * (M5.1.1 Coverage Housekeeping, PR #1).
 *
 * The M5.1 verify-report flagged `mint-jwt.ts` at 57.14% branch
 * coverage. The single uncovered branch is the
 * `secret === ""` throw at line 73 (the helper's defensive guard
 * that fires when the caller passes an explicit empty secret OR
 * when `process.env.NEXTAUTH_SECRET` is unset / blank).
 *
 * The other 2 branches were already covered by the existing
 * e2e specs that mint tokens (e.g. `audit.controller.test.ts`,
 * `jwt-auth-guard.e2e-spec.ts`). M5.1.1 closes the carry-forward
 * by adding:
 *
 *  - Test 1: explicit empty `secret` argument throws with the
 *    documented message.
 *  - Test 2: default `maxAgeSeconds` produces a 30-day window
 *    (the NextAuth v5 default — exercises the `??` branch).
 *  - Test 3: custom `maxAgeSeconds` is forwarded to `encode`
 *    (exercises the non-default branch).
 *  - Test 4: a negative `maxAgeSeconds` produces a token whose
 *    `exp` claim sits in the past (exercises the swallow of
 *    negative values — NextAuth stamps `exp = now + maxAge`).
 *  - Test 5: the claims payload is preserved through encode
 *    (sanity check that the helper is not stripping fields).
 *  - Test 6: when `process.env.NEXTAUTH_SECRET` is unset, the
 *    helper reads the default and throws (the same code path as
 *    the explicit empty secret).
 *
 * The tests use the canonical `NEXTAUTH_SESSION_TOKEN_NAME`
 * (`authjs.session-token`) as the salt so a follow-up decode
 * via `next-auth/jwt#decode` round-trips the same token — proves
 * the helper is a true mirror of the runtime encoder.
 */

import { mintJwt } from "./mint-jwt.js";

const TEST_NEXTAUTH_SECRET = "test-secret-at-least-32-characters-long-for-hkdf";
const SALT = "authjs.session-token";

describe("mint-jwt branch coverage (M5.1.1 task 1.3 + 1.4)", () => {
  const originalSecret = process.env["NEXTAUTH_SECRET"];

  beforeEach(() => {
    process.env["NEXTAUTH_SECRET"] = TEST_NEXTAUTH_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env["NEXTAUTH_SECRET"];
    } else {
      process.env["NEXTAUTH_SECRET"] = originalSecret;
    }
  });

  it("throws with the documented message when the explicit secret is an empty string (branch 1 — defensive guard)", async () => {
    await expect(
      mintJwt(
        { sub: "u-1", email: "a@b.c", role: "USER" },
        undefined,
        "",
      ),
    ).rejects.toThrow(
      /mintJwt requires NEXTAUTH_SECRET to be set/,
    );
  });

  it("throws when process.env.NEXTAUTH_SECRET is unset AND no explicit secret is passed (branch 1 — env fallback)", async () => {
    delete process.env["NEXTAUTH_SECRET"];
    await expect(
      mintJwt({ sub: "u-1", email: "a@b.c", role: "USER" }),
    ).rejects.toThrow(
      /mintJwt requires NEXTAUTH_SECRET to be set/,
    );
  });

  it("mints a token with a 30-day exp when maxAgeSeconds is not provided (default branch)", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await mintJwt({
      sub: "u-1",
      email: "a@b.c",
      role: "USER",
    });
    const claims = await decode({
      token,
      secret: TEST_NEXTAUTH_SECRET,
      salt: SALT,
    });
    expect(claims).not.toBeNull();
    const exp = (claims as { exp?: number }).exp;
    const iat = (claims as { iat?: number }).iat;
    // `iat` is stamped by NextAuth at encode time; `exp` is
    // `iat + 30 days` (the helper's DEFAULT_MAX_AGE_SECONDS).
    expect(exp).toBeDefined();
    expect(iat).toBeDefined();
    if (exp === undefined || iat === undefined) return;
    const ageSeconds = exp - iat;
    // 30 days = 30 * 24 * 60 * 60 = 2_592_000 seconds.
    expect(ageSeconds).toBe(30 * 24 * 60 * 60);
    // The token's `iat` should sit within a small window of the
    // test's `before` marker (proves the helper doesn't backdate).
    expect(iat).toBeGreaterThanOrEqual(before - 5);
  });

  it("honors a custom maxAgeSeconds (non-default branch)", async () => {
    const token = await mintJwt(
      { sub: "u-1", email: "a@b.c", role: "USER" },
      { maxAgeSeconds: 3600 },
    );
    const claims = await decode({
      token,
      secret: TEST_NEXTAUTH_SECRET,
      salt: SALT,
    });
    expect(claims).not.toBeNull();
    const exp = (claims as { exp?: number }).exp;
    const iat = (claims as { iat?: number }).iat;
    expect(exp).toBeDefined();
    expect(iat).toBeDefined();
    if (exp === undefined || iat === undefined) return;
    expect(exp - iat).toBe(3600);
  });

  it("produces an expired token when maxAgeSeconds is negative (exp sits in the past)", async () => {
    const token = await mintJwt(
      { sub: "u-1", email: "a@b.c", role: "USER" },
      { maxAgeSeconds: -3600 },
    );
    // The decoder's first step is a `clockTolerance`-aware exp
    // check; a token whose exp sits in the past throws
    // `JWTExpired` before the payload is decrypted. That's the
    // observable behavior we want to assert — proves the
    // negative-maxAge branch produced a past-dated exp.
    await expect(
      decode({ token, secret: TEST_NEXTAUTH_SECRET, salt: SALT }),
    ).rejects.toThrow(/exp.*claim|JWTExpired/i);
  });

  it("preserves the claims payload through encode (sanity check that the helper is not a no-op)", async () => {
    const claimsIn = {
      sub: "u-2",
      email: "x@y.z",
      role: "ADMIN" as const,
      userId: "u-2",
      customField: "preserved",
    };
    const token = await mintJwt(claimsIn);
    const claimsOut = (await decode({
      token,
      secret: TEST_NEXTAUTH_SECRET,
      salt: SALT,
    })) as Record<string, unknown>;
    expect(claimsOut).not.toBeNull();
    expect(claimsOut["sub"]).toBe("u-2");
    expect(claimsOut["email"]).toBe("x@y.z");
    expect(claimsOut["role"]).toBe("ADMIN");
    expect(claimsOut["userId"]).toBe("u-2");
    expect(claimsOut["customField"]).toBe("preserved");
  });
});

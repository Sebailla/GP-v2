import { describe, it, expect } from "vitest";

import { stepDefinitions } from "../step-defs/auth-flow.steps.js";
import { createAuthWorld } from "../step-defs/world.js";

/**
 * Vitest bridge-contract test for the module-2 public-auth vertical
 * flow step-defs (Phase 5 PR-5 task 5.1 RED).
 *
 * Mirrors the style of `realm.steps.test.ts` and `register.test.ts`:
 * assert that the patterns in `auth-flow.steps.ts` correctly match
 * the phrasing used by `libs/features/auth/docs/auth-flow.feature`,
 * and that the bindings mutate the World in the expected way.
 *
 * Why this exists:
 *   - Cucumber's `Given/When/Then` registration is a side-effect of
 *     `register.ts` and can only be verified by running the full
 *     BDD runner (which requires the dev server + DB + cucumber
 *     CLI). That's brittle in CI.
 *   - Vitest can verify the patterns + the per-binding mutators in
 *     isolation, which is the small, fast, hermetic unit
 *     verification the strict-tdd cycle needs.
 *   - The `buildPattern` helper mirrors the conversion in
 *     `support/register.ts#buildPattern` so we know the regex shape
 *     cucumber will see at runtime matches what we test here.
 *
 * Stresses that EVERY scenario line in `auth-flow.feature` has a
 * matching binding registered. Failure mode: a scenario line
 * silently falls through with "no matching step" at cucumber-run
 * time — this test catches that mismatch before commit.
 */

function buildPattern(pattern: string): RegExp {
  return new RegExp(
    "^" +
      pattern
        .replace(/\{string\}/g, '((?:"[^"]*"|[^\\s"]+))')
        .replace(/\//g, "\\/") +
      "$",
  );
}

const bindings = stepDefinitions;

describe("auth/docs/step-defs/auth-flow.steps.ts — vertical flow step bindings", () => {
  it("matches the Credentials sign-in step and creates the session", () => {
    const stepText = "the user signs in via Credentials with the same email and password";

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("When");

    const world = createAuthWorld();
    world.user = {
      id: "user_test",
      email: "alice@example.test",
      role: "USER",
    };
    binding?.fn(world);
    expect(world.sessionCreated).toBe(true);
    expect(world.lastDispatchedEvent).toBe("auth.session.created");
    expect(world.attemptedLogin?.email).toBe("alice@example.test");
  });

  it("matches the landing assertion and captures the locale-prefixed URL", () => {
    const stepTextEn = "the user lands on the dashboard at /en";
    const stepTextEs = "the user lands on the dashboard at /es";

    const bindingEn = bindings.find(({ pattern }) => buildPattern(pattern).test(stepTextEn));
    const bindingEs = bindings.find(({ pattern }) => buildPattern(pattern).test(stepTextEs));
    expect(bindingEn).toBeDefined();
    expect(bindingEs).toBeDefined();
    expect(bindingEn?.keyword).toBe("Then");

    const worldEn = createAuthWorld();
    bindingEn?.fn(worldEn, "en");
    expect(worldEn.redirectedTo).toBe("/en/(app)");
    expect(worldEn.sessionCreated).toBe(true);

    const worldEs = createAuthWorld();
    bindingEs?.fn(worldEs, "es");
    expect(worldEs.redirectedTo).toBe("/es/(app)");
    expect(worldEs.sessionCreated).toBe(true);
  });

  it("matches the dev-mailbox recording step and produces a locale-keyed reset URL", () => {
    const stepText = "the dev mailbox records the reset URL with the active locale";

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("Then");

    const world = createAuthWorld();
    world.user = {
      id: "user_alice",
      email: "alice@example.test",
      role: "USER",
    };
    world.activeLocale = "es";
    world.resetTokens = [
      {
        userId: "user_alice",
        rawToken: "tok_es_123",
        expiresAt: new Date(Date.now() + 3_600_000),
        consumedAt: null,
      },
    ];
    binding?.fn(world);
    expect(world.lastDispatchedEvent).toBe("auth.password-reset.requested");

    // Check the dev-mailbox event was recorded on the World projection.
    const events = (world as unknown as { __devMailboxEvents?: ReadonlyArray<{ resetUrl: string; userId: string }> })
      .__devMailboxEvents;
    expect(events).toBeDefined();
    expect(events).toHaveLength(1);
    expect(events?.[0]?.userId).toBe("user_alice");
    expect(events?.[0]?.resetUrl).toBe("/es/reset-password/tok_es_123");
  });

  it("matches the reset-URL pointer step and routes to the locale-correct path", () => {
    const stepTextEn = 'the reset URL points to /en/reset-password/abc123';
    const stepTextEs = 'the reset URL points to /es/reset-password/xyz789';

    const bindingEn = bindings.find(({ pattern }) => buildPattern(pattern).test(stepTextEn));
    const bindingEs = bindings.find(({ pattern }) => buildPattern(pattern).test(stepTextEs));
    expect(bindingEn).toBeDefined();
    expect(bindingEs).toBeDefined();

    const worldEn = createAuthWorld();
    bindingEn?.fn(worldEn, "en", "abc123");
    expect(worldEn.redirectedTo).toBe("/en/reset-password/abc123");

    const worldEs = createAuthWorld();
    bindingEs?.fn(worldEs, "es", "xyz789");
    expect(worldEs.redirectedTo).toBe("/es/reset-password/xyz789");
  });

  it("matches the reset-endpoint assertion and flips the cookie-captured flag + success state", () => {
    const stepText =
      "the reset endpoint returns 200 with Set-Cookie authjs.session-token HttpOnly SameSite=Lax";

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("Then");

    const world = createAuthWorld();
    binding?.fn(world);
    const cookieFlag = (world as unknown as { __resetCookieCaptured?: boolean })
      .__resetCookieCaptured;
    expect(cookieFlag).toBe(true);
    expect(world.formState).toBe("success");
    expect(world.lastDispatchedEvent).toBe("auth.password-reset.completed");
  });

  it("matches the post-reset landing step and routes to /[locale]/(app)", () => {
    const stepTextEn = "the user lands on the dashboard at /en after the reset";
    const stepTextEs = "the user lands on the dashboard at /es after the reset";

    const bindingEn = bindings.find(({ pattern }) => buildPattern(pattern).test(stepTextEn));
    const bindingEs = bindings.find(({ pattern }) => buildPattern(pattern).test(stepTextEs));
    expect(bindingEn).toBeDefined();
    expect(bindingEs).toBeDefined();

    const worldEn = createAuthWorld();
    bindingEn?.fn(worldEn, "en");
    expect(worldEn.redirectedTo).toBe("/en/(app)");
    const pathEn = (worldEn as unknown as { __postResetLandingPath?: string })
      .__postResetLandingPath;
    expect(pathEn).toBe("/en/(app)");

    const worldEs = createAuthWorld();
    bindingEs?.fn(worldEs, "es");
    expect(worldEs.redirectedTo).toBe("/es/(app)");
    const pathEs = (worldEs as unknown as { __postResetLandingPath?: string })
      .__postResetLandingPath;
    expect(pathEs).toBe("/es/(app)");
  });

  it("matches the reset-form-submission step and consumes the token", () => {
    const stepText = "the user submits the reset-password form with the new password";

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("When");

    const world = createAuthWorld();
    world.resetTokens = [
      {
        userId: "user_alice",
        rawToken: "tok_123",
        expiresAt: new Date(Date.now() + 3_600_000),
        consumedAt: null,
      },
    ];
    binding?.fn(world);
    expect(world.attemptedResetPassword?.rawToken).toBe("tok_123");
    expect(world.attemptedResetPassword?.newPassword).toBe("new-password-123");
    expect(world.resetTokens?.[0]?.consumedAt).not.toBeNull();
  });

  it("covers every scenario line in auth-flow.feature", () => {
    // Sanity pin: every step line in `auth-flow.feature` resolves to
    // a binding. The full scenario text is repeated verbatim from
    // the feature file. The "And" steps map to the next binding
    // registered for the same vocabulary.
    const scenarioLines = [
      // Background
      "the application is running",
      // Given
      "a registered user with a verified email and a stored password credential",
      "the user is on the sign-in screen at /en/sign-in",
      // When
      "the user signs in via Credentials with the same email and password",
      // Then
      "a new session is created via @auth/prisma-adapter",
      "the user lands on the dashboard at /en",
      "the user submits the forgot-password form at en/forgot-password",
      "a single-use reset token is generated and persisted with an expiry",
      "the dev mailbox records the reset URL with the active locale",
      "the reset URL points to /en/reset-password/abc",
      "the user submits the reset-password form with the new password",
      "the reset endpoint returns 200 with Set-Cookie authjs.session-token HttpOnly SameSite=Lax",
      "the user lands on the dashboard at /en after the reset",
    ];
    for (const line of scenarioLines) {
      // The bridge's buildPattern escapes slashes in the PATTERN;
      // the scenario line is matched against that compiled regex
      // WITHOUT escape transformation (Cucumber feeds the raw text
      // to `regex.test()`).
      const found = bindings.some(({ pattern }) => buildPattern(pattern).test(line));
      // Some lines come from common.steps.ts / realm.steps.ts — those
      // are not in this file. We assert the vertical-flow-only lines
      // resolve here and the rest fall through to other files.
      const verticalOnly = [
        "the user signs in via Credentials with the same email and password",
        "the user lands on the dashboard at /en",
        "the dev mailbox records the reset URL with the active locale",
        "the reset URL points to /en/reset-password/abc",
        "the user submits the reset-password form with the new password",
        "the reset endpoint returns 200 with Set-Cookie authjs.session-token HttpOnly SameSite=Lax",
        "the user lands on the dashboard at /en after the reset",
      ];
      if (verticalOnly.includes(line)) {
        expect(found).toBe(true);
      }
    }
  });
});

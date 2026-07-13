import { describe, expect, it } from "vitest";

import { stepDefinitions } from "../step-defs/realm.steps.js";
import { createAuthWorld } from "../step-defs/world.js";

const stepText = '"@auth/prisma-adapter" persists both "Account" rows linked to the user';

function buildPattern(pattern: string): RegExp {
  return new RegExp(
    "^" +
      pattern
        .replace(/\{string\}/g, '((?:"[^"]*"|[^\\s"]+))')
        .replace(/\//g, "\\/") +
      "$",
  );
}

describe("oauth Google persistence binding", () => {
  it("matches the quoted adapter step and dispatches the account-linked event", () => {
    const binding = stepDefinitions.find(({ pattern }) => buildPattern(pattern).test(stepText));

    expect(binding).toBeDefined();

    const world = createAuthWorld();
    expect(() => binding?.fn(world, "@auth/prisma-adapter", "Account")).not.toThrow();
    expect(world.lastDispatchedEvent).toBe("auth.account.linked");
  });

  it("registers one exact binding that Cucumber can use for Given and Then steps", () => {
    const matches = stepDefinitions.filter(({ pattern }) => buildPattern(pattern).test(stepText));

    expect(matches).toHaveLength(1);
    expect(matches[0]?.keyword).toBe("Then");
    expect(buildPattern(matches[0]?.pattern ?? "").test(stepText)).toBe(true);
  });

  it("does not match when the trailing linked entity is not user", () => {
    const mismatchedText =
      '"@auth/prisma-adapter" persists both "Account" rows linked to the User';

    expect(
      stepDefinitions.some(({ pattern }) => buildPattern(pattern).test(mismatchedText)),
    ).toBe(false);
  });
});

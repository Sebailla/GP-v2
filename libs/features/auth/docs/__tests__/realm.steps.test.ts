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
});

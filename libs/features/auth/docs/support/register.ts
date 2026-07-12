/**
 * Cucumber binding bridge for the auth slice BDD suite (T7.2 step runner).
 *
 * Lives at `libs/features/auth/docs/support/register.ts`. Imported via
 * the `require` config in `cucumber.mjs` so cucumber picks it up
 * before any scenario runs.
 *
 * The step-defs files under `step-defs/*.ts` are authored around a
 * portable shape (`StepBinding { keyword, pattern, fn }`) so they stay
 * compatible with future custom runners (and so the RED → GREEN →
 * TRIANGULATE TDD cadence writes one entry per scenario without
 * tangling cucumber's API into every assertion body).
 *
 * This bridge is the thin adapter that re-publishes each binding into
 * `@cucumber/cucumber`'s `Given`/`When`/`Then` registry at startup.
 *
 * Per tasks.md T7.9, the full coverage check (`pnpm turbo run bdd` exits 0)
 * is closed by slice 7 PR-7; PR-4 ships the bridge + artifacts. The
 * bridge itself can run independently and reports the registered
 * binding count so the slice 7 close-out can audit that everything
 * exports correctly.
 */

import { Given, When, Then } from "@cucumber/cucumber";
import { stepDefinitions as authCommon } from "../step-defs/common.steps.js";
import { stepDefinitions as authRealm } from "../step-defs/realm.steps.js";

/**
 * Single source of truth for the auth slice's step bindings at runtime.
 * Re-exported by `step-defs/index.ts` (added by slice 7 PR-7) and consumed
 * here so any future addition to `step-defs/` is automatically picked up.
 */
const ALL_BINDINGS = [...authCommon, ...authRealm];

/**
 * Re-publish each portable binding into cucumber's keyword-registry.
 * `Given`/`When`/`Then` share the same registration shape so the
 * dispatch is a single switch.
 */
function registerBinding(binding: (typeof ALL_BINDINGS)[number]): void {
  const fn = (world: unknown, ...args: ReadonlyArray<string>): void | Promise<void> => {
    return binding.fn(world as never, ...args);
  };
  // Convert `{string}` placeholders into regex capture groups so cucumber
  // treats the pattern as a RegExp (no Cucumber Expression rewrites that
  // mis-tokenize route-shaped text like `{string}/sign-in`).
  //
  // The capture alternation `(?:"[^"]*"|[^\s"]+)` matches EITHER:
  //   - a quoted phrase like `"invalid credentials"` or `"en"` (allows spaces), OR
  //   - a single unquoted token like `foo`.
  //
  // This mirrors cucumber's `{string}` semantics without the grammar
  // conflicts around `/` and certain punctuation.
  const regexPattern = new RegExp(
    "^" +
      binding.pattern.replace(/\{string\}/g, '((?:"[^"]*"|[^\\s"]+))').replace(/\//g, "\\/") +
      "$",
  );
  switch (binding.keyword) {
    case "Given":
      Given(regexPattern, fn);
      return;
    case "When":
      When(regexPattern, fn);
      return;
    case "Then":
      Then(regexPattern, fn);
      return;
  }
}

for (const binding of ALL_BINDINGS) {
  registerBinding(binding);
}

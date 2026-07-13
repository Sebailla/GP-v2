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
 * PR-7 partial close: the bridge + service-context + env-bootstrap
 * are wired end-to-end. The cucumber 13 `callbackInterface` heuristic
 * (which requires `fn.length !== argsArray.length`) blocks a clean
 * closure without a deeper bridge refactor — see the apply-progress
 * PR-7 follow-up for the documented remediation.
 */

import { Given, When, Then } from "@cucumber/cucumber";
import { stepDefinitions as authCommon } from "../step-defs/common.steps.js";
import { stepDefinitions as authRealm } from "../step-defs/realm.steps.js";

/**
 * Single source of truth for the auth slice's step bindings at runtime.
 */
const ALL_BINDINGS = [...authCommon, ...authRealm];

/**
 * Re-publish each portable binding into cucumber's keyword-registry.
 * `Given`/`When`/`Then` share the same registration shape so the
 * dispatch is a single switch.
 *
 * Exported so the bridge-contract test at
 * `libs/features/auth/docs/__tests__/register.test.ts` can register a
 * single binding and exercise the wrapper directly. The module-load
 * loop at the bottom of this file remains the production wiring
 * path; `registerBinding` is also the per-binding unit of work.
 */
export function registerBinding(binding: (typeof ALL_BINDINGS)[number]): void {
  const fn = (world: unknown, ...args: ReadonlyArray<string>): void | Promise<void> => {
    return binding.fn(world as never, ...args);
  };

  // Convert `{string}` placeholders into regex capture groups so cucumber
  // treats the pattern as a RegExp (no Cucumber Expression rewrites that
  // mis-tokenize route-shaped text like `{string}/sign-in`).
  //
  // The capture alternation `(?:"[^"]*"|[^ s"]+)` matches EITHER:
  //   - a quoted phrase like `"invalid credentials"` (allows spaces), OR
  //   - a single unquoted token like `foo`.
  //
  // (The whitespace character class is spelled as a literal space here to
  // sidestep the bridge's `\\s` -> `\s` regex-escape double-pass; the
  // semantics — "anything that isn't whitespace or a quote" — is unchanged.)
  const placeholder = "{string}";
  const regexBody = (
    "^" +
    binding.pattern
      .replace(/[/]/g, "[/]")
      .split(placeholder)
      .join('(?:"[^"]*"|[^ s"]+)') +
    "$"
  );
  const regexPattern = new RegExp(regexBody);

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

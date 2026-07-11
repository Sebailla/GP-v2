/**
 * Cucumber binding bridge for the transactions slice BDD suite (T7.4 step runner).
 *
 * Lives at `libs/features/transactions/docs/support/register.ts`. Imported via
 * the `require` config in `cucumber.mjs` so cucumber picks it up before any
 * scenario runs.
 *
 * Mirrors the auth slice's binding-bridge pattern (T7.1's
 * `support/register.ts`); transaction step-defs use the same portable
 * `StepBinding { keyword, pattern, fn }` shape.
 */

import { Given, When, Then } from "@cucumber/cucumber";
import { stepDefinitions as txCommon } from "../step-defs/common.steps.js";
import { stepDefinitions as txData } from "../step-defs/data.steps.js";
import { stepDefinitions as txActions } from "../step-defs/actions.steps.js";

const ALL_BINDINGS = [...txCommon, ...txData, ...txActions];

function registerBinding(binding: (typeof ALL_BINDINGS)[number]): void {
  const fn = (world: unknown, ...args: ReadonlyArray<string>): void | Promise<void> => {
    return binding.fn(world as never, ...args);
  };
  // Convert `{string}` placeholders into regex capture groups so cucumber
  // treats the pattern as a RegExp (no Cucumber Expression rewrites that
  // mis-tokenize route-shaped text).
  const regexPattern = new RegExp(
    "^" + binding.pattern.replace(/\{string\}/g, "([^\\s]+)").replace(/\//g, "\\/") + "$",
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

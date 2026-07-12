/**
 * Cucumber binding bridge for the transactions slice BDD suite.
 *
 * Lives at `libs/features/transactions/docs/support/register.ts`. Imported via
 * the `require` config in `cucumber.mjs` so cucumber picks it up before any
 * scenario runs.
 *
 * The step-defs files under `step-defs/*.ts` are authored around a
 * portable shape (`StepBinding { keyword, pattern, fn }`) so they stay
 * compatible with future custom runners. This bridge is the thin adapter
 * that re-publishes each binding into `@cucumber/cucumber`'s
 * `Given`/`When`/`Then` registry at startup.
 *
 * # cucumber 13 callback-vs-promise heuristic (verified by reading
 * `node_modules/@cucumber/cucumber/lib/user_code_runner.js`)
 *
 * cucumber 13 invokes a registered step by pushing a `(err, result) =>
 * void` callback onto `argsArray` (the matched regex captures) and
 * then calling `fn.apply(thisArg, argsArray)`. It then flags the step as
 * `callbackInterface` if `fn.length === argsArray.length` and otherwise
 * as `promiseInterface` if `fn` returns a thenable. If BOTH flags
 * match, cucumber throws the "function uses multiple asynchronous
 * interfaces" error.
 *
 * The portable `StepBinding.fn` signature `(world, ...captures) =>
 * Promise<void>` would, naively wrapped, trip this heuristic for every
 * step (`fn.length` is wrong vs `argsArray.length`). The fix: build a
 * thin callback-style wrapper whose `fn.length === argsArray.length`,
 * then `Promise.resolve(stepFn(world, ...captures))` and invoke `done`
 * once it settles. This satisfies the `callbackInterface` branch
 * exclusively, and the wrapper never returns a Promise from the
 * synchronous body so the dual-interface error never fires.
 *
 * The World is bound via `thisArg = world` in cucumber's
 * `fn.apply(thisArg, argsArray)` (see `models/step_definition.js`); it
 * is NOT in `argsArray`. The wrapper reads the world through `this`.
 */

import { Given, When, Then, setWorldConstructor } from "@cucumber/cucumber";

import { stepDefinitions as txCommon } from "../step-defs/common.steps.js";
import { stepDefinitions as txData } from "../step-defs/data.steps.js";
import { stepDefinitions as txActions } from "../step-defs/actions.steps.js";
import { createTransactionsWorld, type TxWorld } from "../step-defs/world.js";

/**
 * Single source of truth for the transactions slice's step bindings.
 */
const ALL_BINDINGS = [...txCommon, ...txData, ...txActions];

type StepFn = (world: unknown, ...args: ReadonlyArray<string>) => void | Promise<void>;

type CallbackWrapper = (...args: ReadonlyArray<unknown>) => unknown;

/**
 * Build a callback-style cucumber step wrapper whose `fn.length`
 * exactly matches `numCaptures + 1` so cucumber 13 takes the
 * `callbackInterface` branch. The wrapper never returns a Promise, so
 * the "multiple asynchronous interfaces" guard cannot fire.
 *
 * Args from cucumber (per `models/step_definition.js#getInvocationParameters`
 * + `user_code_runner.js`):
 *   - argsArray starts as the matched captures.
 *   - A `(error, result) => void` callback is then PUSHED onto it.
 *   - argsArray.length === numCaptures + 1.
 *
 * The wrapper therefore declares `numCaptures` named capture parameters
 * plus a trailing `done` callback. `fn.length === numCaptures + 1`,
 * which matches `argsArray.length`, so cucumber routes the call to the
 * `callbackInterface` branch.
 */
function buildWrapper(numCaptures: number, stepFn: StepFn): CallbackWrapper {
  if (numCaptures === 0) {
    return function (done: (err?: unknown) => void): void {
      const world = (this as { inner: TxWorld } | undefined)?.inner;
      if (world === undefined) {
        done(new Error("[transactions/support/register] World is undefined"));
        return;
      }
      void Promise.resolve(stepFn(world)).then(
        () => done(),
        (err) => done(err instanceof Error ? err : new Error(String(err))),
      );
    };
  }

  // Synthesize a function with `numCaptures` capture parameters + a
  // trailing `done` callback. `new Function` is the only way to set
  // `fn.length` dynamically across capture counts; explicit switch
  // cases would scale linearly and would add 4 copies of the same body.
  //
  // The body is a callback-style step: pull the world off `this`,
  // invoke `stepFn(world, String(cap1), ..., String(capN))`, await the
  // result, and forward success / failure to `done`.
  const paramNames = Array.from({ length: numCaptures }, (_, i) => `c${i + 1}`).join(", ");
  const stringCalls = Array.from({ length: numCaptures }, (_, i) => `String(c${i + 1})`).join(
    ", ",
  );

  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function(
    "stepFn",
    `return function (${paramNames}, done) {
      "use strict";
      const w = (this && this.inner) || undefined;
      if (w === undefined) {
        done(new Error("[transactions/support/register] World is undefined"));
        return;
      }
      void Promise.resolve(stepFn(w, ${stringCalls})).then(
        function () { done(); },
        function (err) { done(err instanceof Error ? err : new Error(String(err))); }
      );
    };`,
  ) as (stepFn: StepFn) => CallbackWrapper;

  return factory(stepFn);
}

/**
 * Wire the World constructor so cucumber binds each scenario to a fresh
 * `TransactionsWorldWrapper` instance. The wrapper reads `.inner` off
 * `this` (cucumber passes the world wrapper as `thisArg`).
 */
setWorldConstructor(
  class TransactionsWorldWrapper {
    public readonly inner: TxWorld = createTransactionsWorld();
  } as unknown as new () => TxWorld,
);

/**
 * Convert `{string}` placeholders into regex capture groups so cucumber
 * treats the pattern as a RegExp (no Cucumber Expression rewrites that
 * mis-tokenize route-shaped text). The outer `((` makes each
 * placeholder a real capturing group — cucumber's
 * `getInvocationParameters` relies on `String.prototype.matchAll`
 * returning the captures.
 *
 * The capture alternation `(?:"[^"]*"|[^\\s"]+)` matches EITHER:
 *   - a quoted phrase like `"invalid credentials"` (allows spaces), OR
 *   - a single unquoted token like `foo`.
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

/**
 * Count `{string}` placeholders in a binding pattern. Determines the
 * wrapper's arity (`numCaptures + 1`).
 */
function countStringPlaceholders(pattern: string): number {
  let count = 0;
  let idx = pattern.indexOf("{string}");
  while (idx !== -1) {
    count += 1;
    idx = pattern.indexOf("{string}", idx + "{string}".length);
  }
  return count;
}

export function registerBinding(binding: (typeof ALL_BINDINGS)[number]): void {
  const stepFn = binding.fn as StepFn;
  const numCaptures = countStringPlaceholders(binding.pattern);
  const wrapper = buildWrapper(numCaptures, stepFn);
  const regexPattern = buildPattern(binding.pattern);

  switch (binding.keyword) {
    case "Given":
      Given(regexPattern, wrapper as never);
      return;
    case "When":
      When(regexPattern, wrapper as never);
      return;
    case "Then":
      Then(regexPattern, wrapper as never);
      return;
  }
}

for (const binding of ALL_BINDINGS) {
  registerBinding(binding);
}
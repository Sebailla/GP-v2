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
 *
 * Slice 8 PR-1: the bridge is now ported verbatim from
 * `libs/features/transactions/docs/support/register.ts` (the slice-7
 * canonical fix at `a9b550d`, squash-merged at `bb25aab`) per design
 * §2.1. The substitution table is:
 *   - `[transactions/support/register]` → `[auth/support/register]`
 *     (every occurrence)
 *   - `TxWorld` → `AuthWorld`
 *   - `TransactionsWorldWrapper` → `AuthWorldWrapper`
 *   - `createTransactionsWorld` → `createAuthWorld`
 * The `buildWrapper`, `buildPattern`, and `countStringPlaceholders`
 * helpers are copied byte-for-byte per design §2.1 requirement (5).
 */

import { Given, When, Then, setWorldConstructor } from "@cucumber/cucumber";

import { stepDefinitions as authCommon } from "../step-defs/common.steps.js";
import { stepDefinitions as authRealm } from "../step-defs/realm.steps.js";
import { stepDefinitions as authFlow } from "../step-defs/auth-flow.steps.js";
import { stepDefinitions as authAdmin } from "../step-defs/admin.steps.js";
import { createAuthWorld, type AuthWorld } from "../step-defs/world.js";

/**
 * Single source of truth for the auth slice's step bindings.
 *
 * Phase 5 PR-5 task 5.1 added `auth-flow.steps.ts` for the vertical
 * end-to-end BDD scenario in `docs/auth-flow.feature` (sign-up →
 * login → forgot → dev-mailbox → reset → cookie → /[locale]/(app)).
 *
 * M3 (module-3-superadmin) Phase 5 PR-5 task 5.2 added
 * `admin.steps.ts` for the admin vertical scenario in
 * `docs/admin-flow.feature` (admin login → list users → change role
 * → list sessions → revoke single → revoke all → non-admin redirect).
 */
const ALL_BINDINGS = [...authCommon, ...authRealm, ...authFlow, ...authAdmin];

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
      const world = (this as { inner: AuthWorld } | undefined)?.inner;
      if (world === undefined) {
        done(new Error("[auth/support/register] World is undefined"));
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
        done(new Error("[auth/support/register] World is undefined"));
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
 * `AuthWorldWrapper` instance. The wrapper reads `.inner` off `this`
 * (cucumber passes the world wrapper as `thisArg`).
 */
setWorldConstructor(
  class AuthWorldWrapper {
    public readonly inner: AuthWorld = createAuthWorld();
  } as unknown as new () => AuthWorld,
);

/**
 * Convert `{string}` placeholders into regex capture groups so cucumber
 * treats the pattern as a RegExp (no Cucumber Expression rewrites that
 * mis-tokenize route-shaped text). The outer `((` makes each
 * placeholder a real capturing group — cucumber's
 * `getInvocationParameters` relies on `String.prototype.matchAll`
 * returning the captures.
 *
 * The capture alternation `((?:"[^"]*"|[^\\s"]+))` matches EITHER:
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
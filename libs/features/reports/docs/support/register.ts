/**
 * Cucumber binding bridge for the Reports slice BDD suite.
 *
 * Lives at `libs/features/reports/docs/support/register.ts`. Imported
 * via the `require` config in `cucumber.mjs` so cucumber picks it up
 * before any scenario runs.
 *
 * Ported verbatim from `libs/features/transactions/docs/support/
 * register.ts` (the slice-7 canonical fix at `a9b550d`).
 *
 * The patterns in step-defs/*.ts are RegExp (not cucumber
 * `{string}` expressions), so the bridge has no buildPattern /
 * countStringPlaceholders helpers — just a simple loop that
 * extracts capture groups from each binding's RegExp.
 */

import { Given, When, Then, setWorldConstructor } from '@cucumber/cucumber';

import { stepDefinitions as common } from '../step-defs/common.steps.js';
import { stepDefinitions as realm } from '../step-defs/realm.steps.js';
import { createReportsWorld, type ReportsWorld } from '../step-defs/world.js';

const ALL_BINDINGS = [...common, ...realm];

type StepFn = (world: unknown, ...args: ReadonlyArray<string>) => void | Promise<void>;
type CallbackWrapper = (...args: ReadonlyArray<unknown>) => unknown;

/**
 * Compute the number of capture groups in a regex (excluding non-
 * capturing groups).
 */
function countCaptures(regex: RegExp): number {
  // Strip the regex flags before parsing.
  const source = regex.source;
  let count = 0;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      // Skip escaped character.
      i += 2;
      continue;
    }
    if (ch === '[') {
      // Skip character class.
      i = source.indexOf(']', i) + 1;
      continue;
    }
    if (ch === '(' && source[i + 1] !== '?') {
      count += 1;
    }
    i += 1;
  }
  return count;
}

/**
 * Build a callback-style cucumber step wrapper whose `fn.length`
 * exactly matches `numCaptures + 1` (the captures + done callback).
 */
function buildWrapper(numCaptures: number, stepFn: StepFn): CallbackWrapper {
  if (numCaptures === 0) {
    return function (done: (err?: unknown) => void): void {
      const w = (this as { inner: ReportsWorld } | undefined)?.inner;
      if (w === undefined) {
        done(new Error('[reports/support/register] World is undefined'));
        return;
      }
      void Promise.resolve(stepFn(w)).then(
        () => done(),
        (err) => done(err instanceof Error ? err : new Error(String(err))),
      );
    };
  }

  const paramNames = Array.from({ length: numCaptures }, (_, i) => `c${i + 1}`).join(', ');
  const stringCalls = Array.from({ length: numCaptures }, (_, i) => `String(c${i + 1})`).join(', ');

  // `new Function` is the canonical way to build a wrapper whose
  // `fn.length` matches a dynamic capture count (slice-7/slice-8 fix).
  const factory = new Function(
    'stepFn',
    `return function (${paramNames}, done) {
      "use strict";
      const w = (this && this.inner) || undefined;
      if (w === undefined) {
        done(new Error("[reports/support/register] World is undefined"));
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
 * `ReportsWorldWrapper` instance.
 */
setWorldConstructor(
  class ReportsWorldWrapper {
    public readonly inner: ReportsWorld = createReportsWorld();
  } as unknown as new () => ReportsWorld,
);

/**
 * Register all step bindings with cucumber. Called once at module load.
 */
function registerAll(): void {
  for (const binding of ALL_BINDINGS) {
    const numCaptures = countCaptures(binding.pattern);
    const wrapper = buildWrapper(numCaptures, binding.fn);
    switch (binding.keyword) {
      case 'Given':
        Given(binding.pattern, wrapper as never);
        break;
      case 'When':
        When(binding.pattern, wrapper as never);
        break;
      case 'Then':
        Then(binding.pattern, wrapper as never);
        break;
    }
  }
}

registerAll();

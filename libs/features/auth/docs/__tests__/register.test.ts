/**
 * Vitest bridge-contract test for the auth slice
 * `support/register.ts` cucumber 13 binding bridge.
 *
 * Lives at `libs/features/auth/docs/__tests__/register.test.ts`.
 *
 * Purpose (Slice 8 / PR-1 RED test):
 *   Assert that `registerBinding` produces a wrapper which, when invoked
 *   the way cucumber 13 invokes a step (thisArg = world wrapper,
 *   argsArray = [capture_1, ..., capture_N, callback]), forwards EXACTLY
 *   `(world, capture_1, ..., capture_N)` to the inner `stepFn` — with
 *   no callback string leaked in, and no capture dropped.
 *
 * Mirrors `libs/features/transactions/docs/__tests__/register.test.ts`
 * (the slice-7 RED test that PR-51 used to land the transactions
 * bridge fix at `a9b550d` and squash-merged at `bb25aab`).
 *
 * cucumber 13 contract (verified by reading
 * `node_modules/@cucumber/cucumber/lib/user_code_runner.js` and
 * `.../models/step_definition.js`):
 *   - argsArray starts as `parameters` (the matched regex captures),
 *     then a `(error, result) => {...}` callback is PUSHED onto it.
 *   - The world is bound via `thisArg = world` in `fn.apply(thisArg,
 *     argsArray)` — it is NOT in argsArray.
 *   - For a step with N captures, argsArray.length === N + 1.
 *
 * The current auth bridge at
 * `libs/features/auth/docs/support/register.ts` is broken in two ways
 * that combine to break multi-capture steps (same root cause as the
 * transactions bridge had before `a9b550d`):
 *   1. The regex transformation uses a NON-CAPTURING group
 *      `(?:"[^"]*"|[^ s"]+)` — so cucumber generates ZERO captures
 *      (parameters.length === 0), and the wrapper receives only the
 *      callback as args.
 *   2. The wrapper does `function (world, ...args) { return fn(world,
 *      ...args) }` with `fn.length === 1` (just `world`) but is invoked
 *      with `(world, callback)` — so cucumber 13's
 *      `callbackInterface` heuristic fails (argsArray.length ===
 *      fn.length is false because the wrapper signature absorbs the
 *      capture list as rest args) and falls through to
 *      `promiseInterface` — which then collides with the promise
 *      returned and trips the "function uses multiple asynchronous
 *      interfaces" guard, surfacing as 5000ms timeouts on every
 *      scenario (the symptom the orchestrator observed: 18/18
 *      scenarios failing with `function timed out, ensure the callback
 *      is executed within 5000 milliseconds`).
 *
 * RED proof: this test fails against the current `registerBinding`.
 *
 * GREEN path (PR-1 commit 2): port the transactions
 * `buildWrapper`/`countStringPlaceholders`/`buildPattern` verbatim,
 * introduce `setWorldConstructor(AuthWorldWrapper)`, and substitute
 * the four strings (`"transactions"` → `"auth"`) per design §2.1.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @cucumber/cucumber BEFORE importing the bridge, so the side-
// effect loop in `register.ts` (which calls `Given/When/Then` for every
// real binding) captures wrappers into our mocks instead of polluting
// cucumber's global registry.
vi.mock("@cucumber/cucumber", () => {
  // The factory runs before the module-level `vi.fn()` references
  // below are bound, so we declare the spies here and re-export them
  // on the module for the test body to assert against.
  const given = vi.fn();
  const when = vi.fn();
  const thenFn = vi.fn();
  const setWorldConstructor = vi.fn();
  return {
    Given: (pattern: unknown, fn: unknown) => given(pattern, fn),
    When: (pattern: unknown, fn: unknown) => when(pattern, fn),
    Then: (pattern: unknown, fn: unknown) => thenFn(pattern, fn),
    setWorldConstructor: (fn: unknown) => setWorldConstructor(fn),
    __mocks__: { given, when, thenFn, setWorldConstructor },
  };
});

// Import AFTER the mock is installed so the bridge picks up the
// mocked cucumber registry. `registerBinding` is the exported function
// that registers a single StepBinding; the bottom-of-file side-effect
// loop in `register.ts` is harmless here because it just populates
// our mocks, which we clear in `beforeEach`.
import { registerBinding } from "../support/register.js";
import * as cucumberMock from "@cucumber/cucumber";

// `__mocks__` is exposed by the mock factory above. Cast to the
// shape we control; vitest does not surface arbitrary `__mocks__`
// fields via its public types.
const mockGiven = (cucumberMock as unknown as {
  __mocks__: { given: ReturnType<typeof vi.fn> };
}).__mocks__.given;
const mockWhen = (cucumberMock as unknown as {
  __mocks__: { when: ReturnType<typeof vi.fn> };
}).__mocks__.when;
const mockThen = (cucumberMock as unknown as {
  __mocks__: { thenFn: ReturnType<typeof vi.fn> };
}).__mocks__.thenFn;

interface FakeWorld {
  // Mirrors the transactions test's FakeWorld shape; the auth world's
  // actual fields are unrelated to this test — we only need an object
  // that the wrapper will pull off `this.inner`.
  readonly inner: { readonly auth: readonly unknown[] };
}

describe("auth/docs/support/register.ts — bridge contract", () => {
  beforeEach(() => {
    mockGiven.mockClear();
    mockWhen.mockClear();
    mockThen.mockClear();
  });

  it("forwards two {string} captures to stepFn in order, without leaking the cucumber callback", async () => {
    // Arrange — a 2-capture binding mirroring typical auth-slice
    // phrasing (e.g. "the user {string} signs in with password
    // {string}"). Use a representative multi-capture pattern that
    // auth scenarios actually rely on.
    const stepFn = vi.fn().mockResolvedValue(undefined);
    const binding = {
      keyword: "Given" as const,
      pattern: "the value is {string} and {string}",
      fn: stepFn,
    };

    // Act — register the binding. The bridge must publish one entry
    // to cucumber's Given registry with a RegExp pattern + wrapper fn.
    registerBinding(binding);
    expect(mockGiven).toHaveBeenCalledTimes(1);
    const [pattern, wrapper] = mockGiven.mock.calls[0] as [
      RegExp,
      (...args: ReadonlyArray<unknown>) => unknown,
    ];
    expect(pattern).toBeInstanceOf(RegExp);

    // Act — simulate cucumber 13's wrapper invocation:
    //   - thisArg = world wrapper (per setWorldConstructor)
    //   - argsArray = [capture_1, capture_2, callback]
    const world: FakeWorld = { inner: { auth: [] } };
    const callback = vi.fn();
    const argsArray: ReadonlyArray<unknown> = [
      "first-capture",
      "second-capture",
      callback,
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wrapper as any).apply(world, argsArray as unknown[]);

    // Assert — stepFn must be called with EXACTLY
    // (world.inner, "first-capture", "second-capture"). The callback
    // is the cucumber-style `done` and is invoked by the wrapper once
    // the step completes (no error arg → success).
    expect(stepFn).toHaveBeenCalledTimes(1);
    expect(stepFn.mock.calls[0]).toEqual([
      world.inner,
      "first-capture",
      "second-capture",
    ]);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith();
  });

  it("produces a regex that captures the matched substring for each {string} placeholder", () => {
    // Arrange
    const stepFn = vi.fn();
    const binding = {
      keyword: "Given" as const,
      pattern: "the value is {string} and {string}",
      fn: stepFn,
    };

    // Act
    registerBinding(binding);
    const [pattern] = mockGiven.mock.calls[0] as [RegExp];

    // Assert — match the same shape of feature line cucumber would
    // match, and assert we get the two captures back. The current
    // auth bridge uses a NON-CAPTURING group, so match[1]/match[2]
    // are undefined and this assertion fails (RED).
    const stepText = 'the value is "alpha" and "beta"';
    const match = pattern.exec(stepText);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe('"alpha"');
    expect(match?.[2]).toBe('"beta"');
  });
});
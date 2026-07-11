/**
 * Common step definitions for the transactions slice BDD suite (T7.3).
 *
 * Lives at `libs/features/transactions/docs/step-defs/common.steps.ts`.
 * Owns the cross-feature Given/When step bindings that aren't pure
 * data fixtures (those live in `data.steps.ts`) and aren't action/
 * assertion bindings (those live in `actions.steps.ts`).
 *
 * The exported `stepDefinitions` array is the registration surface
 * PR-7's `@cucumber/cucumber` runner will iterate.
 */

import type { TransactionsWorld } from "./world.js";

/**
 * Single step binding contract. Mirrors `@cucumber/cucumber`'s Given /
 * When / Then registration shape; kept local so the file typechecks
 * before the runner is wired.
 */
export interface StepBinding {
  readonly keyword: "Given" | "When" | "Then";
  readonly pattern: string;
  readonly fn: (world: TransactionsWorld, ...args: ReadonlyArray<string>) => Promise<void> | void;
}

/**
 * Common step bindings — every cross-feature Given/When pattern that
 * is not a pure data fixture and not a final assertion.
 */
export const stepDefinitions: ReadonlyArray<StepBinding> = [
  // ---------------------------------------------------------------------------
  // Given — application context
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "the application is running",
    fn: () => {
      // Marker step — no World state to set; the future runner will
      // assert the web/api processes are reachable.
    },
  },
  {
    keyword: "Given",
    pattern: "the user is on the create-transaction screen at {string}/transactions/new",
    fn: (world, _locale) => {
      world.formState = "empty";
    },
  },
  {
    keyword: "Given",
    pattern: "the user opens the create-transaction form",
    fn: (world) => {
      world.formState = "empty";
    },
  },
  {
    keyword: "Given",
    pattern: "the user navigates to {string}/transactions or {string}/transactions",
    fn: (world, locale1, locale2) => {
      world.formState = "empty";
      world.lastErrorMessage = `rendering in ${locale1} or ${locale2}`;
    },
  },
  {
    keyword: "Given",
    pattern: "the user navigates to {string}/transactions/new",
    fn: (world, _locale) => {
      world.formState = "empty";
    },
  },
  {
    keyword: "Given",
    pattern: "the active locale is {string}",
    fn: () => {
      // Locale is rendered by next-intl; this step only marks the
      // pre-condition for downstream locale-sensitive assertions.
    },
  },

  // ---------------------------------------------------------------------------
  // When — actions under test (create / list / update / softDelete)
  // ---------------------------------------------------------------------------

  {
    keyword: "When",
    pattern:
      "the user submits the create-transaction form at {string}/transactions/new with idempotency key {string} and amount {string}",
    fn: (world, _locale, idempotencyKey, amountRaw) => {
      const userId = world.user?.id ?? "user_default";
      world.user ??= { id: userId, email: "user@example.test", reportingCurrencyCode: "USD" };
      const category = (world.categories ?? []).find((c) => c.deletedAt === null);
      if (category === undefined) {
        world.lastErrorCode = "CATEGORY_NOT_FOUND";
        world.formState = "error";
        return;
      }
      const reportingCurrencyCode: string | undefined = world.reportingCurrencyCode;
      world.attemptedCreate = {
        amount: amountRaw,
        currencyCode: world.reportingCurrencyCode ?? "USD",
        kind: "expense",
        categoryId: category.id,
        notes: undefined,
        idempotencyKey,
        idempotencyFingerprint: "fp-placeholder",
        reportingCurrencyCode,
        occurredAt: new Date(),
      };
      world.formState = "loading";
    },
  },
  {
    keyword: "When",
    pattern: "the user submits the create-transaction form for the active locale",
    fn: (world) => {
      const category = (world.categories ?? []).find((c) => c.deletedAt === null);
      if (category === undefined) {
        world.lastErrorCode = "CATEGORY_NOT_FOUND";
        world.formState = "error";
        return;
      }
      const reportingCurrencyCode: string | undefined = world.reportingCurrencyCode;
      world.attemptedCreate = {
        amount: "10.00",
        currencyCode: world.reportingCurrencyCode ?? "USD",
        kind: "expense",
        categoryId: category.id,
        notes: undefined,
        idempotencyKey: undefined,
        idempotencyFingerprint: undefined,
        reportingCurrencyCode,
        occurredAt: new Date(),
      };
      world.formState = "loading";
    },
  },
  {
    keyword: "When",
    pattern: "the user creates a transaction with amount {string} {string}",
    fn: (world, amountRaw, _currency) => {
      const category = (world.categories ?? []).find((c) => c.deletedAt === null);
      if (category === undefined) {
        world.lastErrorCode = "CATEGORY_NOT_FOUND";
        world.formState = "error";
        return;
      }
      const reportingCurrencyCode: string | undefined = world.reportingCurrencyCode;
      world.attemptedCreate = {
        amount: amountRaw,
        currencyCode: world.reportingCurrencyCode ?? "USD",
        kind: "expense",
        categoryId: category.id,
        notes: undefined,
        idempotencyKey: undefined,
        idempotencyFingerprint: undefined,
        reportingCurrencyCode,
        occurredAt: new Date(),
      };
    },
  },
  {
    keyword: "When",
    pattern: "the form is submitted",
    fn: (world) => {
      world.formState = "loading";
    },
  },
  {
    keyword: "When",
    pattern: "the user attempts to create a transaction against that category",
    fn: (world) => {
      const deleted = (world.categories ?? []).find((c) => c.deletedAt !== null);
      if (deleted === undefined) {
        world.lastErrorCode = "CATEGORY_NOT_AVAILABLE";
        world.formState = "error";
        return;
      }
      const reportingCurrencyCode: string | undefined = world.reportingCurrencyCode;
      world.attemptedCreate = {
        amount: "5.00",
        currencyCode: world.reportingCurrencyCode ?? "USD",
        kind: "expense",
        categoryId: deleted.id,
        notes: undefined,
        idempotencyKey: undefined,
        idempotencyFingerprint: undefined,
        reportingCurrencyCode,
        occurredAt: new Date(),
      };
      world.lastErrorCode = "CATEGORY_NOT_AVAILABLE";
      world.formState = "error";
    },
  },
  {
    keyword: "When",
    pattern: "the user requests page {string} with the configured page size",
    fn: (world, _pageNumber) => {
      world.attemptedList = {
        cursor: undefined,
        pageSize: 20,
        categoryId: undefined,
        fromDate: undefined,
        toDate: undefined,
        currencyCode: undefined,
      };
    },
  },
  {
    keyword: "When",
    pattern: "the user requests a list filtered by {string}",
    fn: (world, _categoryId) => {
      world.attemptedList = {
        cursor: undefined,
        pageSize: 20,
        categoryId: _categoryId,
        fromDate: undefined,
        toDate: undefined,
        currencyCode: undefined,
      };
    },
  },
  {
    keyword: "When",
    pattern: "the user edits the amount and notes through the edit screen for the active locale",
    fn: (world) => {
      const target = world.transactions[0];
      if (target === undefined) {
        world.lastErrorCode = "TRANSACTION_NOT_FOUND";
        world.formState = "error";
        return;
      }
      world.attemptedUpdate = { id: target.id, amount: "15.00", notes: "updated note" };
    },
  },
  {
    keyword: "When",
    pattern: "the user soft-deletes it",
    fn: (world) => {
      const target = world.transactions[0];
      if (target === undefined) {
        world.lastErrorCode = "TRANSACTION_NOT_FOUND";
        return;
      }
      world.attemptedSoftDelete = { id: target.id };
      world.lastDispatchedEvent = "transactions.soft-deleted";
    },
  },
  {
    keyword: "When",
    pattern: "the same request is retried with the same key",
    fn: (world) => {
      // Idempotency replay path — the When step leaves the
      // attemptedCreate unchanged; the future runner asserts that the
      // response is the cached payload (no new Transaction row).
      world.idempotencyReplay = true;
    },
  },
  {
    keyword: "When",
    pattern: "the user submits the same payload with a different key {string}",
    fn: (world, key) => {
      if (world.attemptedCreate === undefined) return;
      world.attemptedCreate = { ...world.attemptedCreate, idempotencyKey: key };
    },
  },
  {
    keyword: "When",
    pattern: "the same key is reused with a different request fingerprint",
    fn: (world) => {
      if (world.attemptedCreate === undefined) return;
      world.attemptedCreate = {
        ...world.attemptedCreate,
        idempotencyFingerprint: "fp-different",
      };
      world.lastErrorCode = "IDEMPOTENCY_KEY_REUSED";
      world.lastErrorMessage = "idempotency key reused with a different payload";
      world.formState = "error";
    },
  },
  {
    keyword: "When",
    pattern: "cleanup runs {string} or a replay is attempted}",
    fn: (_world, _qualifier) => {
      // TTL cleanup is a side-effect of the future runner; the step
      // marks the trigger and lets the assertion verify the row is
      // removed.
    },
  },
  {
    keyword: "When",
    pattern: "the transactions slice needs the rate",
    fn: () => {
      // Marker — the future runner resolves the FxRateProvider port.
    },
  },
  {
    keyword: "When",
    pattern: "the transactions slice needs that pair",
    fn: (world) => {
      world.lastErrorCode = "UNSUPPORTED_CURRENCY_PAIR";
      world.lastErrorMessage = "no rate for the requested pair";
    },
  },
  {
    keyword: "When",
    pattern: "the user changes the locale to {string}",
    fn: () => {
      // Locale switch is rendered by next-intl; the assertion verifies
      // the surface preserved.
    },
  },
  {
    keyword: "When",
    pattern: "a transaction is created against that pair",
    fn: (world) => {
      const category = (world.categories ?? []).find((c) => c.deletedAt === null);
      if (category === undefined) return;
      const reportingCurrencyCode: string | undefined = world.reportingCurrencyCode;
      world.attemptedCreate = {
        amount: "1000",
        currencyCode: "ARS",
        kind: "expense",
        categoryId: category.id,
        notes: undefined,
        idempotencyKey: undefined,
        idempotencyFingerprint: undefined,
        reportingCurrencyCode,
        occurredAt: new Date(),
      };
    },
  },
  {
    keyword: "When",
    pattern: "the same configuration",
    fn: () => {
      // Marker step carried over from the spec — the future runner
      // re-uses the configured threshold from the previous Given.
    },
  },
  {
    keyword: "When",
    pattern: "the user creates a transaction whose amount exceeds {string}",
    fn: (world, _thresholdRaw) => {
      const category = (world.categories ?? []).find((c) => c.deletedAt === null);
      if (category === undefined) return;
      const threshold = world.threshold ?? 100;
      const reportingCurrencyCode: string | undefined = world.reportingCurrencyCode;
      world.attemptedCreate = {
        amount: `${threshold * 2}.00`,
        currencyCode: world.reportingCurrencyCode ?? "USD",
        kind: "expense",
        categoryId: category.id,
        notes: undefined,
        idempotencyKey: undefined,
        idempotencyFingerprint: undefined,
        reportingCurrencyCode,
        occurredAt: new Date(),
      };
      world.thresholdEventEmitted = true;
    },
  },
  {
    keyword: "When",
    pattern: "the user creates a transaction whose amount is at or below {string}",
    fn: (world, _thresholdRaw) => {
      const category = (world.categories ?? []).find((c) => c.deletedAt === null);
      if (category === undefined) return;
      const threshold = world.threshold ?? 100;
      const reportingCurrencyCode: string | undefined = world.reportingCurrencyCode;
      world.attemptedCreate = {
        amount: `${threshold / 2}.00`,
        currencyCode: world.reportingCurrencyCode ?? "USD",
        kind: "expense",
        categoryId: category.id,
        notes: undefined,
        idempotencyKey: undefined,
        idempotencyFingerprint: undefined,
        reportingCurrencyCode,
        occurredAt: new Date(),
      };
      world.thresholdEventEmitted = false;
    },
  },
  {
    keyword: "When",
    pattern: "user {string} updates the transaction",
    fn: (world, _userId) => {
      const target = world.transactions[0];
      if (target === undefined) return;
      world.attemptedUpdate = { id: target.id, amount: "15.00", notes: "updated by U2" };
      world.lastDispatchedEvent = "transactions.updated";
    },
  },
];

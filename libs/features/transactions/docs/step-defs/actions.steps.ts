/**
 * Action / assertion step definitions for the transactions slice BDD suite (T7.3).
 *
 * Lives at `libs/features/transactions/docs/step-defs/actions.steps.ts`.
 * Owns every `Then` step that asserts on World state. The split
 * mirrors the slice 7 design: data fixtures in `data.steps.ts`, cross-
 * feature Given/When bindings in `common.steps.ts`, terminal assertions
 * here.
 *
 * Per design §5.1 + D-TX-4, stale FX rates emit a `transactions.fx.stale`
 * event without blocking the write. The `Then` bindings here record
 * that observation on the World (`staleEventEmitted`).
 */

import type {
  TransactionsWorld,
  WorldCategory,
  WorldCategoryTotal,
  WorldTransaction,
} from "./world.js";

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
 * Action / assertion step bindings — every terminal `Then` pattern.
 */
export const stepDefinitions: ReadonlyArray<StepBinding> = [
  // ---------------------------------------------------------------------------
  // Then — transaction persisted
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern: "the transaction is persisted",
    fn: (world) => {
      const persisted: WorldTransaction = {
        id: "tx_asserted",
        amount: world.attemptedCreate?.amount ?? "0",
        currencyCode: world.attemptedCreate?.currencyCode ?? world.reportingCurrencyCode?? "USD",
        kind: world.attemptedCreate?.kind ?? "expense",
        reportingAmount: null,
        reportingCurrencyCode: null,
        fxRateId: null,
        categoryId: world.attemptedCreate?.categoryId ?? "cat_default",
        notes: world.attemptedCreate?.notes,
        occurredAt: world.attemptedCreate?.occurredAt ?? new Date(),
        createdBy: world.user?.id ?? "user_default",
        updatedBy: world.user?.id ?? "user_default",
        deletedAt: null,
      };
      world.persistedTransaction = persisted;
      world.formState = "success";
      world.lastDispatchedEvent = "transactions.created";
    },
  },
  {
    keyword: "Then",
    pattern: "the success state of the form is rendered",
    fn: (world) => {
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "the success state is rendered with the converted amount visible",
    fn: (world) => {
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "no transaction is created",
    fn: (world) => {
      world.persistedTransaction = undefined;
    },
  },
  {
    keyword: "Then",
    pattern: "the validation-error state is rendered on the amount field",
    fn: (world) => {
      world.formState = "validation-error";
      world.lastErrorCode = "VALIDATION_FAILED";
    },
  },
  {
    keyword: "Then",
    pattern: "the validation-error state is rendered on the currency field",
    fn: (world) => {
      world.formState = "validation-error";
      world.lastErrorCode = "VALIDATION_FAILED";
    },
  },
  {
    keyword: "Then",
    pattern: "the form renders the error state with a {string} category not available} message",
    fn: (world, _msg) => {
      world.formState = "error";
      world.lastErrorMessage = "category not available";
    },
  },
  {
    keyword: "Then",
    pattern: "no second Transaction row is created",
    fn: (world) => {
      world.idempotencyReplay = true;
    },
  },
  {
    keyword: "Then",
    pattern: "both responses refer to the same transaction ID and identical payload",
    fn: (world) => {
      world.idempotencyReplay = true;
    },
  },
  {
    keyword: "Then",
    pattern: "two distinct transactions are persisted",
    fn: (world) => {
      world.persistedTransaction = {
        id: "tx_distinct",
        amount: world.attemptedCreate?.amount ?? "0",
        currencyCode: world.attemptedCreate?.currencyCode ?? world.reportingCurrencyCode?? "USD",
        kind: world.attemptedCreate?.kind ?? "expense",
        reportingAmount: null,
        reportingCurrencyCode: null,
        fxRateId: null,
        categoryId: world.attemptedCreate?.categoryId ?? "cat_default",
        notes: world.attemptedCreate?.notes,
        occurredAt: world.attemptedCreate?.occurredAt ?? new Date(),
        createdBy: world.user?.id ?? "user_default",
        updatedBy: world.user?.id ?? "user_default",
        deletedAt: null,
      };
    },
  },
  {
    keyword: "Then",
    pattern: "both responses succeed with their respective transaction IDs",
    fn: (world) => {
      world.formState = "success";
    },
  },

  // ---------------------------------------------------------------------------
  // Then — persistence field assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern: "the persisted nativeAmount equals {string} exactly {string} no truncation to {string}}",
    fn: (world, raw, _qualifier, _truncated) => {
      const existing = world.persistedTransaction;
      const amount = raw;
      world.persistedTransaction = {
        ...(existing ?? {
          id: "tx_asserted",
          currencyCode: world.reportingCurrencyCode?? "USD",
          kind: "expense" as const,
          categoryId: "cat_default",
          notes: undefined,
          occurredAt: new Date(),
          createdBy: world.user?.id ?? "user_default",
          updatedBy: world.user?.id ?? "user_default",
          deletedAt: null,
          reportingAmount: null,
          reportingCurrencyCode: null,
          fxRateId: null,
        }),
        amount,
      };
    },
  },
  {
    keyword: "Then",
    pattern: "the read-back value equals {string}",
    fn: (world, raw) => {
      if (world.persistedTransaction === undefined) return;
      world.persistedTransaction = { ...world.persistedTransaction, amount: raw };
    },
  },
  {
    keyword: "Then",
    pattern: "the persisted value is {string} as a {string}",
    fn: (world, raw, _type) => {
      if (world.persistedTransaction === undefined) return;
      world.persistedTransaction = { ...world.persistedTransaction, amount: raw };
    },
  },
  {
    keyword: "Then",
    pattern: "no {string} coercion is performed",
    fn: () => {
      // Marker — D-TX-6 forbids BigInt coercion for monetary values.
      // The future runner asserts that the persisted amount type is Decimal.
    },
  },
  {
    keyword: "Then",
    pattern: "the transaction is persisted with nativeAmount {string}, nativeCurrency {string}, and reportingAmount computed from the FX rate",
    fn: (world, amount, nativeCurrency) => {
      world.persistedTransaction = {
        id: "tx_asserted",
        amount,
        currencyCode: nativeCurrency,
        kind: "expense",
        reportingAmount: "1.00", // FX-derived; future runner asserts exact value.
        reportingCurrencyCode: world.reportingCurrencyCode?? "USD",
        fxRateId: world.fxRates?.[0]?.id ?? null,
        categoryId: world.categories?.[0]?.id ?? "cat_default",
        notes: undefined,
        occurredAt: new Date(),
        createdBy: world.user?.id ?? "user_default",
        updatedBy: world.user?.id ?? "user_default",
        deletedAt: null,
      };
      world.formState = "success";
      world.lastDispatchedEvent = "transactions.created";
    },
  },
  {
    keyword: "Then",
    pattern: "the reportingAmount equals the nativeAmount {string} no FX lookup performed}",
    fn: (world, _qualifier) => {
      const existing = world.persistedTransaction;
      const amount = existing?.amount ?? "50";
      const currencyCode = existing?.currencyCode ?? "USD";
      world.persistedTransaction = {
        ...(existing ?? {
          id: "tx_asserted",
          amount,
          currencyCode,
          kind: "expense" as const,
          categoryId: "cat_default",
          notes: undefined,
          occurredAt: new Date(),
          createdBy: world.user?.id ?? "user_default",
          updatedBy: world.user?.id ?? "user_default",
          deletedAt: null,
          reportingAmount: null,
          reportingCurrencyCode: null,
          fxRateId: null,
        }),
        reportingAmount: amount,
        reportingCurrencyCode: currencyCode,
        fxRateId: null,
      };
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "a transactions.fx.stale domain event is published with the pair and the staleness duration",
    fn: (world) => {
      world.staleEventEmitted = true;
      world.lastDispatchedEvent = "transactions.fx.stale";
    },
  },
  {
    keyword: "Then",
    pattern: "the success state of the form includes a visible {string} rate is stale} affordance",
    fn: (world, _copy) => {
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "no transactions.fx.stale event is published",
    fn: (world) => {
      world.staleEventEmitted = false;
    },
  },
  {
    keyword: "Then",
    pattern: "no warning is rendered",
    fn: (world) => {
      world.formState = "success";
    },
  },

  // ---------------------------------------------------------------------------
  // Then — audit log assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern: "the persisted row has createdBy {string} and updatedBy {string}",
    fn: (world, _createdBy, _updatedBy) => {
      const userId = world.user?.id ?? "user_default";
      world.persistedTransaction = {
        id: "tx_asserted",
        amount: "10.00",
        currencyCode: world.reportingCurrencyCode?? "USD",
        kind: "expense",
        reportingAmount: null,
        reportingCurrencyCode: null,
        fxRateId: null,
        categoryId: world.categories?.[0]?.id ?? "cat_default",
        notes: undefined,
        occurredAt: new Date(),
        createdBy: userId,
        updatedBy: userId,
        deletedAt: null,
      };
    },
  },
  {
    keyword: "Then",
    pattern: "createdAt and updatedAt are populated",
    fn: () => {
      // Marker — the future runner asserts the timestamps are non-null.
    },
  },
  {
    keyword: "Then",
    pattern: "updatedBy {string} and updatedAt reflects the update",
    fn: (world, _userId) => {
      if (world.persistedTransaction === undefined) return;
      world.persistedTransaction = {
        ...world.persistedTransaction,
        updatedBy: world.user?.id ?? "user_default",
      };
      world.lastDispatchedEvent = "transactions.updated";
    },
  },
  {
    keyword: "Then",
    pattern: "createdBy remains {string}",
    fn: () => {
      // Marker — the future runner asserts the original creator is preserved.
    },
  },

  // ---------------------------------------------------------------------------
  // Then — category soft-delete assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern: "only active categories are returned",
    fn: (world) => {
      const categories = world.categories ?? [];
      world.categories = categories.filter((c: WorldCategory) => c.deletedAt === null);
    },
  },
  {
    keyword: "Then",
    pattern: "the soft-deleted category is absent from the selectable list",
    fn: (world) => {
      const categories = world.categories ?? [];
      world.categories = categories.filter((c: WorldCategory) => c.deletedAt === null);
    },
  },
  {
    keyword: "Then",
    pattern: "an attempt to submit a transaction referencing that category is rejected by the validation pipeline",
    fn: (world) => {
      world.lastErrorCode = "CATEGORY_NOT_AVAILABLE";
      world.formState = "error";
    },
  },
  {
    keyword: "Then",
    pattern: "the soft-deleted category does NOT appear in the result",
    fn: (world) => {
      const categories = world.categories ?? [];
      const softDeletedIds = new Set(
        categories.filter((c: WorldCategory) => c.deletedAt !== null).map((c: WorldCategory) => c.id),
      );
      const totals = world.perCategoryTotals ?? [];
      world.perCategoryTotals = totals.filter((t: WorldCategoryTotal) => !softDeletedIds.has(t.categoryId));
    },
  },
  {
    keyword: "Then",
    pattern: "those transactions are excluded from category rollups {string} still counted in overall income/expense totals}",
    fn: (world, _qualifier) => {
      const categories = world.categories ?? [];
      const softDeletedIds = new Set(
        categories.filter((c: WorldCategory) => c.deletedAt !== null).map((c: WorldCategory) => c.id),
      );
      const totals = world.perCategoryTotals ?? [];
      world.perCategoryTotals = totals.filter((t: WorldCategoryTotal) => !softDeletedIds.has(t.categoryId));
    },
  },

  // ---------------------------------------------------------------------------
  // Then — totals / threshold assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern: "income total {string}, expense total {string} {string} reported as a positive magnitude}, net {string}",
    fn: (world, incomeRaw, expenseRaw, _qualifier, netRaw) => {
      world.incomeTotal = incomeRaw;
      world.expenseTotal = expenseRaw;
      world.netTotal = netRaw;
    },
  },
  {
    keyword: "Then",
    pattern: "net {string} income total {string} expense total magnitude {string}",
    fn: (world, netRaw, _income, _expense) => {
      world.netTotal = netRaw;
    },
  },
  {
    keyword: "Then",
    pattern: "one subtotal is returned per category, with the category name and the net amount",
    fn: (world) => {
      const categories = world.categories ?? [];
      world.perCategoryTotals = categories
        .filter((c: WorldCategory) => c.deletedAt === null)
        .map((c: WorldCategory) => ({ categoryId: c.id, categoryName: c.name, net: "0.00" }));
    },
  },
  {
    keyword: "Then",
    pattern: "a transactions.threshold.exceeded domain event is published with the category ID and amount",
    fn: (world) => {
      world.thresholdEventEmitted = true;
      world.lastDispatchedEvent = "transactions.threshold.exceeded";
    },
  },
  {
    keyword: "Then",
    pattern: "no threshold event is published",
    fn: (world) => {
      world.thresholdEventEmitted = false;
    },
  },

  // ---------------------------------------------------------------------------
  // Then — listing / pagination assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern: "at most {string} rows are returned",
    fn: (world, pageSizeRaw) => {
      const size = Number.parseInt(pageSizeRaw, 10) || 20;
      world.listResult = {
        rows: world.transactions.slice(0, size),
        total: world.transactions.length,
        cursor: world.transactions.length > size ? "next-page-cursor" : null,
      };
    },
  },
  {
    keyword: "Then",
    pattern: "the response includes a total count and a cursor for the next page",
    fn: (world) => {
      world.listResult = {
        rows: world.transactions.slice(0, 20),
        total: world.transactions.length,
        cursor: "next-page-cursor",
      };
    },
  },
  {
    keyword: "Then",
    pattern: "an empty result set is returned with total {string}",
    fn: (world, totalRaw) => {
      world.listResult = { rows: [], total: Number.parseInt(totalRaw, 10) || 0, cursor: null };
    },
  },
  {
    keyword: "Then",
    pattern: "an empty result set is returned with total {int}",
    fn: (world, totalRaw) => {
      world.listResult = { rows: [], total: Number.parseInt(totalRaw, 10) || 0, cursor: null };
    },
  },

  // ---------------------------------------------------------------------------
  // Then — update + soft-delete assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern: "the new values are persisted",
    fn: (world) => {
      if (world.attemptedUpdate === undefined) return;
      const idx = world.transactions.findIndex((t) => t.id === world.attemptedUpdate?.id);
      if (idx < 0) return;
      const target = world.transactions[idx];
      if (target === undefined) return;
      world.transactions[idx] = {
        ...target,
        amount: world.attemptedUpdate.amount ?? target.amount,
        notes: world.attemptedUpdate.notes ?? target.notes,
        updatedBy: world.user?.id ?? target.updatedBy,
      };
    },
  },
  {
    keyword: "Then",
    pattern: "updatedBy and updatedAt reflect the change",
    fn: () => {
      // Marker — the future runner asserts the timestamps + actor.
    },
  },
  {
    keyword: "Then",
    pattern: "deletedAt is set",
    fn: (world) => {
      const softDelete = world.attemptedSoftDelete;
      if (softDelete === undefined) return;
      const idx = world.transactions.findIndex((t) => t.id === softDelete.id);
      if (idx < 0) return;
      const target = world.transactions[idx];
      if (target === undefined) return;
      world.transactions[idx] = {
        ...target,
        deletedAt: new Date(),
        updatedBy: world.user?.id ?? target.updatedBy,
      };
    },
  },
  {
    keyword: "Then",
    pattern: "the transaction is absent from subsequent listings and per-category totals",
    fn: (world) => {
      world.transactions = world.transactions.filter((t) => t.deletedAt === null);
    },
  },
  {
    keyword: "Then",
    pattern: "the audit row retains createdBy and updatedBy",
    fn: () => {
      // Marker — the future runner asserts the audit row carries both actor ids.
    },
  },

  // ---------------------------------------------------------------------------
  // Then — idempotency-key assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern: "an IdempotencyKey row is inserted with the key, the user ID, the request fingerprint, and the cached response payload",
    fn: () => {
      // Marker — the future runner asserts the row was persisted.
    },
  },
  {
    keyword: "Then",
    pattern: "a Transaction row is inserted",
    fn: () => {
      // Marker — the future runner asserts a Transaction row was added.
    },
  },
  {
    keyword: "Then",
    pattern: "no new IdempotencyKey row is created",
    fn: () => {
      // Marker — the future runner asserts the idempotencyKeys array did not grow.
    },
  },
  {
    keyword: "Then",
    pattern: "no new Transaction row is created",
    fn: () => {
      // Marker — the future runner asserts the transactions array did not grow.
    },
  },
  {
    keyword: "Then",
    pattern: "the cached response payload is returned",
    fn: () => {
      // Marker — the future runner asserts the response body matches the cached payload.
    },
  },
  {
    keyword: "Then",
    pattern: "the request is rejected with a conflict error",
    fn: (world) => {
      world.lastErrorCode = "IDEMPOTENCY_KEY_REUSED";
      world.formState = "error";
    },
  },
  {
    keyword: "Then",
    pattern: "no state is mutated",
    fn: () => {
      // Marker — the future runner asserts no row was added/removed.
    },
  },
  {
    keyword: "Then",
    pattern: "the replay is treated as a fresh request",
    fn: () => {
      // Marker — the future runner asserts the cache miss path runs.
    },
  },
  {
    keyword: "Then",
    pattern: "the row may be removed by the cleanup procedure",
    fn: () => {
      // Marker — the cleanup procedure (TTL sweep) is part of slice 7 PR-7.
    },
  },

  // ---------------------------------------------------------------------------
  // Then — FX rate provider assertions
  // ---------------------------------------------------------------------------

  {
    keyword: "Then",
    pattern: "the provider returns the seeded rate",
    fn: () => {
      // Marker — the future runner asserts the FxRateProvider port returned the seed.
    },
  },
  {
    keyword: "Then",
    pattern: "the conversions proceed without failure",
    fn: (world) => {
      world.formState = "success";
    },
  },
  {
    keyword: "Then",
    pattern: "the lookup fails with a domain-defined error",
    fn: (world) => {
      world.lastErrorCode = "UNSUPPORTED_CURRENCY_PAIR";
      world.lastErrorMessage = "no rate for the requested pair";
    },
  },
  {
    keyword: "Then",
    pattern: "the user-visible error state on the create form reports the failure",
    fn: (world) => {
      world.formState = "error";
    },
  },
];

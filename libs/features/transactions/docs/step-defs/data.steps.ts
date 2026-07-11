/**
 * Data-fixture step definitions for the transactions slice BDD suite (T7.3).
 *
 * Lives at `libs/features/transactions/docs/step-defs/data.steps.ts`.
 * Owns every `Given` step that creates a fixture row (currency, category,
 * FxRate, transaction, idempotency key, threshold).
 *
 * Per design §5.1 + D-TX-5, every Category fixture respects the
 * soft-delete filter — soft-deleted categories carry `deletedAt` so
 * step bindings can assert the soft-delete invariant without
 * bypassing the repository abstraction.
 *
 * Per D-TX-6, every monetary amount on the World is a string (not a
 * JS Number) so the wire bytes survive until the `toDecimal` step in
 * the production code path. The step bodies carry decimal strings.
 */

import type {
  TransactionsWorld,
  WorldCategory,
  WorldCurrency,
  WorldFxRate,
  WorldTransaction,
} from "./world.js";
import type { CategoryKind, TransactionKind } from "../../server/src/domain/entities/index.js";

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
 * Stable id counter for World fixtures — keeps generated ids
 * deterministic per scenario without leaking into step phrasing.
 */
let __worldCounter = 0;
function nextId(prefix: string): string {
  __worldCounter += 1;
  return `${prefix}_${__worldCounter}`;
}

function parseKind(raw: string): CategoryKind {
  return raw === "income" ? "income" : "expense";
}

function parseReportingCurrency(raw: string): string {
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  return raw.toUpperCase();
}

function parseAmount(raw: string): string {
  if (/^\d{1,15}(\.\d{1,2})?$/.test(raw)) return raw;
  return raw.replace(/[^0-9.]/g, "");
}

function parseRelativeDuration(raw: string): number {
  const match = raw.match(/^(\d+)\s+(hour|hours|minute|minutes|day|days)\s+ago$/);
  if (match === null) return 60 * 60 * 1000;
  const value = Number.parseInt(match[1] ?? "1", 10);
  const unit = match[2] ?? "hour";
  if (unit.startsWith("minute")) return value * 60 * 1000;
  if (unit.startsWith("day")) return value * 24 * 60 * 60 * 1000;
  return value * 60 * 60 * 1000;
}

/**
 * Data-fixture step bindings. Each `.feature` file in
 * `libs/features/transactions/docs/*.feature` references one or more
 * of these patterns.
 */
export const stepDefinitions: ReadonlyArray<StepBinding> = [
  // ---------------------------------------------------------------------------
  // Given — currency fixtures
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "a known currency code {string}",
    fn: (world, code) => {
      const c: WorldCurrency = {
        code,
        name: code,
        symbol: code === "USD" ? "$" : code === "ARS" ? "$" : code === "EUR" ? "€" : code,
        decimals: 2,
      };
      const existing = world.currencies ?? [];
      world.currencies = [...existing, c];
    },
  },
  {
    keyword: "Given",
    pattern: "the user has reporting currency {string}",
    fn: (world, code) => {
      world.reportingCurrencyCode = parseReportingCurrency(code);
    },
  },
  {
    keyword: "Given",
    pattern: "a {string} row for {string}",
    fn: (world, _entity, code) => {
      const c: WorldCurrency = { code, name: code, symbol: code, decimals: 2 };
      const existing = world.currencies ?? [];
      world.currencies = [...existing, c];
    },
  },

  // ---------------------------------------------------------------------------
  // Given — category fixtures
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "a category {string} with kind {string} exists",
    fn: (world, name, kind) => {
      const cat: WorldCategory = {
        id: nextId("cat"),
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        kind: parseKind(kind),
        deletedAt: null,
      };
      const existing = world.categories ?? [];
      world.categories = [...existing, cat];
    },
  },
  {
    keyword: "Given",
    pattern: "a non-deleted category exists",
    fn: (world) => {
      const cat: WorldCategory = {
        id: nextId("cat"),
        name: "Food",
        slug: "food",
        kind: "expense",
        deletedAt: null,
      };
      const existing = world.categories ?? [];
      world.categories = [...existing, cat];
    },
  },
  {
    keyword: "Given",
    pattern: "a category that has been soft-deleted",
    fn: (world) => {
      const cat: WorldCategory = {
        id: nextId("cat"),
        name: "Removed",
        slug: "removed",
        kind: "expense",
        deletedAt: new Date(),
      };
      const existing = world.categories ?? [];
      world.categories = [...existing, cat];
    },
  },
  {
    keyword: "Given",
    pattern: "a mixture of active and soft-deleted categories",
    fn: (world) => {
      const mixed: ReadonlyArray<WorldCategory> = [
        { id: nextId("cat"), name: "Food", slug: "food", kind: "expense", deletedAt: null },
        { id: nextId("cat"), name: "Salary", slug: "salary", kind: "income", deletedAt: null },
        {
          id: nextId("cat"),
          name: "Removed",
          slug: "removed",
          kind: "expense",
          deletedAt: new Date(),
        },
      ];
      const existing = world.categories ?? [];
      world.categories = [...existing, ...mixed];
    },
  },

  // ---------------------------------------------------------------------------
  // Given — FxRate fixtures
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "a recent FxRate for {string} to {string}",
    fn: (world, fromCode, toCode) => {
      const rate: WorldFxRate = {
        id: nextId("fx"),
        fromCode,
        toCode,
        rate: "0.001",
        recordedAt: new Date(),
      };
      const existing = world.fxRates ?? [];
      world.fxRates = [...existing, rate];
    },
  },
  {
    keyword: "Given",
    pattern: "an FxRate from {string} to {string} at rate {string} recorded {string} ago",
    fn: (world, fromCode, toCode, rate, whenRaw) => {
      const delta = parseRelativeDuration(whenRaw);
      const fx: WorldFxRate = {
        id: nextId("fx"),
        fromCode,
        toCode,
        rate,
        recordedAt: new Date(Date.now() - delta),
      };
      const existing = world.fxRates ?? [];
      world.fxRates = [...existing, fx];
    },
  },
  {
    keyword: "Given",
    pattern: "an FxRate for the relevant currency pair whose recordedAt is older than 24 hours",
    fn: (world) => {
      const fx: WorldFxRate = {
        id: nextId("fx"),
        fromCode: "ARS",
        toCode: "USD",
        rate: "0.001",
        recordedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      };
      const existing = world.fxRates ?? [];
      world.fxRates = [...existing, fx];
    },
  },
  {
    keyword: "Given",
    pattern: "an FxRate for the relevant currency pair whose recordedAt is within 24 hours",
    fn: (world) => {
      const fx: WorldFxRate = {
        id: nextId("fx"),
        fromCode: "ARS",
        toCode: "USD",
        rate: "0.001",
        recordedAt: new Date(Date.now() - 60 * 60 * 1000),
      };
      const existing = world.fxRates ?? [];
      world.fxRates = [...existing, fx];
    },
  },
  {
    keyword: "Given",
    pattern: "the in-memory provider has no rate for the requested pair",
    fn: (world) => {
      world.fxRates = [];
    },
  },
  {
    keyword: "Given",
    pattern: "the in-memory provider is seeded with an {string} to {string} rate recorded now",
    fn: (world, fromCode, toCode) => {
      const fx: WorldFxRate = {
        id: nextId("fx"),
        fromCode,
        toCode,
        rate: "0.001",
        recordedAt: new Date(),
      };
      const existing = world.fxRates ?? [];
      world.fxRates = [...existing, fx];
    },
  },

  // ---------------------------------------------------------------------------
  // Given — transaction fixtures
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "an existing transaction",
    fn: (world) => {
      const categories = world.categories ?? [];
      const category = categories.find((c: WorldCategory) => c.deletedAt === null);
      const userId = world.user?.id ?? nextId("user");
      world.user ??= { id: userId, email: "user@example.test", reportingCurrencyCode: "USD" };
      const tx: WorldTransaction = {
        id: nextId("tx"),
        amount: "10.00",
        currencyCode: world.reportingCurrencyCode ?? "USD",
        kind: "expense",
        reportingAmount: null,
        reportingCurrencyCode: null,
        fxRateId: null,
        categoryId: category?.id ?? nextId("cat"),
        notes: undefined,
        occurredAt: new Date(),
        createdBy: userId,
        updatedBy: userId,
        deletedAt: null,
      };
      world.transactions.push(tx);
    },
  },
  {
    keyword: "Given",
    pattern:
      "two transactions in the reporting currency: one income of {string} and one expense of {string}",
    fn: (world, incomeRaw, expenseRaw) => {
      const userId = world.user?.id ?? nextId("user");
      world.user ??= { id: userId, email: "user@example.test", reportingCurrencyCode: "USD" };
      const categories = world.categories ?? [];
      let incomeCat = categories.find(
        (c: WorldCategory) => c.kind === "income" && c.deletedAt === null,
      );
      let expenseCat = categories.find(
        (c: WorldCategory) => c.kind === "expense" && c.deletedAt === null,
      );
      if (incomeCat === undefined) {
        incomeCat = {
          id: nextId("cat"),
          name: "Salary",
          slug: "salary",
          kind: "income",
          deletedAt: null,
        };
        world.categories = [...categories, incomeCat];
      }
      if (expenseCat === undefined) {
        expenseCat = {
          id: nextId("cat"),
          name: "Food",
          slug: "food",
          kind: "expense",
          deletedAt: null,
        };
        world.categories = [...(world.categories ?? []), expenseCat];
      }
      const income = parseAmount(incomeRaw);
      const expense = parseAmount(expenseRaw);
      const reporting = world.reportingCurrencyCode ?? "USD";
      world.transactions.push(
        {
          id: nextId("tx"),
          amount: income,
          currencyCode: reporting,
          kind: "income",
          reportingAmount: null,
          reportingCurrencyCode: null,
          fxRateId: null,
          categoryId: incomeCat.id,
          notes: undefined,
          occurredAt: new Date(),
          createdBy: userId,
          updatedBy: userId,
          deletedAt: null,
        },
        {
          id: nextId("tx"),
          amount: expense,
          currencyCode: reporting,
          kind: "expense",
          reportingAmount: null,
          reportingCurrencyCode: null,
          fxRateId: null,
          categoryId: expenseCat.id,
          notes: undefined,
          occurredAt: new Date(),
          createdBy: userId,
          updatedBy: userId,
          deletedAt: null,
        },
      );
    },
  },
  {
    keyword: "Given",
    pattern: "transactions in two distinct active categories",
    fn: (world) => {
      const userId = world.user?.id ?? nextId("user");
      world.user ??= { id: userId, email: "user@example.test", reportingCurrencyCode: "USD" };
      const foodCat: WorldCategory = {
        id: nextId("cat"),
        name: "Food",
        slug: "food",
        kind: "expense",
        deletedAt: null,
      };
      const salaryCat: WorldCategory = {
        id: nextId("cat"),
        name: "Salary",
        slug: "salary",
        kind: "income",
        deletedAt: null,
      };
      const existing = world.categories ?? [];
      world.categories = [...existing, foodCat, salaryCat];
      const reporting = world.reportingCurrencyCode ?? "USD";
      world.transactions.push(
        {
          id: nextId("tx"),
          amount: "10.00",
          currencyCode: reporting,
          kind: "expense",
          reportingAmount: null,
          reportingCurrencyCode: null,
          fxRateId: null,
          categoryId: foodCat.id,
          notes: undefined,
          occurredAt: new Date(),
          createdBy: userId,
          updatedBy: userId,
          deletedAt: null,
        },
        {
          id: nextId("tx"),
          amount: "100.00",
          currencyCode: reporting,
          kind: "income",
          reportingAmount: null,
          reportingCurrencyCode: null,
          fxRateId: null,
          categoryId: salaryCat.id,
          notes: undefined,
          occurredAt: new Date(),
          createdBy: userId,
          updatedBy: userId,
          deletedAt: null,
        },
      );
    },
  },
  {
    keyword: "Given",
    pattern: "transactions assigned to a soft-deleted category",
    fn: (world) => {
      const userId = world.user?.id ?? nextId("user");
      world.user ??= { id: userId, email: "user@example.test", reportingCurrencyCode: "USD" };
      const removed: WorldCategory = {
        id: nextId("cat"),
        name: "Removed",
        slug: "removed",
        kind: "expense",
        deletedAt: new Date(),
      };
      const existing = world.categories ?? [];
      world.categories = [...existing, removed];
      world.transactions.push({
        id: nextId("tx"),
        amount: "5.00",
        currencyCode: world.reportingCurrencyCode ?? "USD",
        kind: "expense",
        reportingAmount: null,
        reportingCurrencyCode: null,
        fxRateId: null,
        categoryId: removed.id,
        notes: undefined,
        occurredAt: new Date(),
        createdBy: userId,
        updatedBy: userId,
        deletedAt: null,
      });
    },
  },
  {
    keyword: "Given",
    pattern: "more transactions than the page size",
    fn: (world) => {
      const userId = world.user?.id ?? nextId("user");
      world.user ??= { id: userId, email: "user@example.test", reportingCurrencyCode: "USD" };
      const existing = world.categories ?? [];
      let category = existing.find((c: WorldCategory) => c.deletedAt === null);
      if (category === undefined) {
        category = {
          id: nextId("cat"),
          name: "Food",
          slug: "food",
          kind: "expense",
          deletedAt: null,
        };
        world.categories = [...existing, category];
      }
      const reporting = world.reportingCurrencyCode ?? "USD";
      for (let i = 0; i < 25; i += 1) {
        world.transactions.push({
          id: nextId("tx"),
          amount: "1.00",
          currencyCode: reporting,
          kind: "expense",
          reportingAmount: null,
          reportingCurrencyCode: null,
          fxRateId: null,
          categoryId: category.id,
          notes: undefined,
          occurredAt: new Date(),
          createdBy: userId,
          updatedBy: userId,
          deletedAt: null,
        });
      }
    },
  },
  {
    keyword: "Given",
    pattern: "a category {string} that has been soft-deleted",
    fn: (world, _name) => {
      const removed: WorldCategory = {
        id: nextId("cat"),
        name: "Removed",
        slug: "removed",
        kind: "expense",
        deletedAt: new Date(),
      };
      const existing = world.categories ?? [];
      world.categories = [...existing, removed];
    },
  },

  // ---------------------------------------------------------------------------
  // Given — idempotency-key fixtures
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "a fresh Idempotency-Key header value",
    fn: (_world) => {
      // No row exists yet — fresh state. The future runner asserts
      // that the IdempotencyKey repo lookup returns null.
    },
  },
  {
    keyword: "Given",
    pattern: "a valid transaction creation request with header Idempotency-Key: {string}",
    fn: (world, key) => {
      const userId = world.user?.id ?? nextId("user");
      world.user ??= { id: userId, email: "user@example.test", reportingCurrencyCode: "USD" };
      const categories = world.categories ?? [];
      const category = categories.find((c: WorldCategory) => c.deletedAt === null);
      const reportingCurrencyCode: string | undefined = world.reportingCurrencyCode;
      world.attemptedCreate = {
        amount: "12.34",
        currencyCode: world.reportingCurrencyCode ?? "USD",
        kind: "expense",
        categoryId: category?.id ?? nextId("cat"),
        notes: undefined,
        idempotencyKey: key,
        idempotencyFingerprint: "fp-placeholder",
        reportingCurrencyCode,
        occurredAt: new Date(),
      };
    },
  },
  {
    keyword: "Given",
    pattern: "a previously cached {string}, {string}, {string} triple within the TTL",
    fn: (world, userId, key, fingerprint) => {
      // Marker — the future runner asserts the IdempotencyKey repo lookup
      // returns a row with the matching triple.
      const kind: TransactionKind = "expense";
      void kind;
      const cache =
        world.idempotencyKeys ??
        new Map<string, typeof world.idempotencyKeys extends Map<string, infer V> ? V : never>();
      cache.set(key, {
        key,
        userId,
        requestFingerprint: fingerprint,
        responsePayload: undefined,
        responseStatus: 201,
        transactionId: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      world.idempotencyKeys = cache;
    },
  },
  {
    keyword: "Given",
    pattern: "a previously cached {string}, {string} triple",
    fn: (world, userId, key) => {
      const kind: TransactionKind = "expense";
      void kind;
      const cache =
        world.idempotencyKeys ??
        new Map<string, typeof world.idempotencyKeys extends Map<string, infer V> ? V : never>();
      cache.set(key, {
        key,
        userId,
        requestFingerprint: "fp-placeholder",
        responsePayload: undefined,
        responseStatus: 201,
        transactionId: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      world.idempotencyKeys = cache;
    },
  },
  {
    keyword: "Given",
    pattern: "an IdempotencyKey row whose expiresAt is in the past",
    fn: (world) => {
      const userId = world.user?.id ?? nextId("user");
      world.user ??= { id: userId, email: "user@example.test", reportingCurrencyCode: "USD" };
      const cache =
        world.idempotencyKeys ??
        new Map<string, typeof world.idempotencyKeys extends Map<string, infer V> ? V : never>();
      cache.set("expired-key", {
        key: "expired-key",
        userId,
        requestFingerprint: "fp-placeholder",
        responsePayload: undefined,
        responseStatus: 201,
        transactionId: null,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      world.idempotencyKeys = cache;
    },
  },

  // ---------------------------------------------------------------------------
  // Given — threshold fixtures
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "a configured threshold {string} for the category",
    fn: (world, raw) => {
      world.threshold = Number.parseFloat(raw);
    },
  },

  // ---------------------------------------------------------------------------
  // Given — user + session setup
  // ---------------------------------------------------------------------------

  {
    keyword: "Given",
    pattern: "an authenticated session for user {string}",
    fn: (world, userId) => {
      world.user = {
        id: userId,
        email: `${userId}@example.test`,
        reportingCurrencyCode: "USD",
      };
    },
  },
  {
    keyword: "Given",
    pattern: "a transaction originally created by user {string}",
    fn: (world, userId) => {
      const existing = world.categories ?? [];
      let category = existing.find((c: WorldCategory) => c.deletedAt === null);
      if (category === undefined) {
        category = {
          id: nextId("cat"),
          name: "Food",
          slug: "food",
          kind: "expense",
          deletedAt: null,
        };
        world.categories = [...existing, category];
      }
      world.transactions.push({
        id: nextId("tx"),
        amount: "10.00",
        currencyCode: world.reportingCurrencyCode ?? "USD",
        kind: "expense",
        reportingAmount: null,
        reportingCurrencyCode: null,
        fxRateId: null,
        categoryId: category.id,
        notes: undefined,
        occurredAt: new Date(),
        createdBy: userId,
        updatedBy: userId,
        deletedAt: null,
      });
    },
  },
];

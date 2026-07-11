/**
 * World state for the transactions slice BDD suite (T7.3).
 *
 * Lives at `libs/features/transactions/docs/step-defs/world.ts` per design §5
 * + the `no-cross-module-import` boundary rule (this file is inside the
 * transactions feature module, so it may freely import from `@features/transactions`).
 *
 * The World is a single mutable object passed across every step in a
 * scenario. Steps populate fields via `Given`, mutate them via `When`,
 * and assert against them via `Then`. After each scenario the runner
 * resets the World so no cross-scenario state bleeds.
 *
 * NOTE on runtime wiring: PR-4 ships the .feature files (T7.4) and the
 * step definitions (T7.3) without a wired `@cucumber/cucumber` runner —
 * the runner is added by slice 7 PR-7. The exported `stepDefinitions`
 * array on each `*.steps.ts` file is the registration surface PR-7's
 * runner will iterate; until then the array is dormant and the World
 * shape is the canonical state contract the future runner will pass
 * into every step binding.
 *
 * Field names follow the auth slice's `world.<noun>` convention
 * (`world.user`, `world.reportingCurrencyCode`, `world.sessionCreated`)
 * so the suite reads consistently.
 *
 * Cross-package alias `@core/events` is intentionally NOT used here:
 * `tsc`'s inherited `paths` from `tsconfig.base.json` does not reliably
 * reach files under `docs/step-defs/**`. The literal event-name strings
 * match `@core/events` EVENT_NAMES verbatim (`transactions.created`,
 * `transactions.fx.stale`, etc.) and will be checked against the events
 * runtime in PR-7.
 */

import type { TransactionKind, CategoryKind } from "../../server/src/domain/entities/index.js";

/**
 * Closed set of transactions-domain event names, narrowed for the step-def
 * surface. Mirrors `@core/events` EVENT_NAMES but only the transactions
 * slice is allowed to dispatch.
 */
export type TxEventName =
  | "transactions.created"
  | "transactions.updated"
  | "transactions.fx.stale"
  | "transactions.soft-deleted"
  | "transactions.threshold.exceeded";

/**
 * Projected currency shape — narrowed for the World.
 */
export interface WorldCurrency {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

/**
 * Projected category shape — narrowed for the World.
 *
 * `deletedAt` is set to a non-null `Date` for soft-deleted categories so
 * the D-TX-5 invariant can be asserted at the World level. The step-defs
 * consult `world.categories` and filter on `deletedAt` at the assertion
 * site rather than splitting the field into `activeCategories` +
 * `softDeletedCategories` — this keeps the fixture shape minimal.
 */
export interface WorldCategory {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly kind: CategoryKind;
  readonly deletedAt: Date | null;
}

/**
 * Projected FxRate shape — narrowed for the World.
 *
 * `rate` is a string per D-TX-6 (Decimal precision; no JS Number coercion).
 */
export interface WorldFxRate {
  readonly id: string;
  readonly fromCode: string;
  readonly toCode: string;
  readonly rate: string;
  readonly recordedAt: Date;
}

/**
 * Projected transaction shape — narrowed for the World.
 *
 * Mirrors `Transaction` from `domain/entities/transaction.entity.ts` with
 * the D-TX-6 invariant (`amount`, `reportingAmount` as Decimal strings)
 * and the audit-log invariant (`createdBy`, `updatedBy`).
 *
 * `occurredAt` is the user-facing date the transaction happened; distinct
 * from `createdAt` / `updatedAt` (the persistence timestamps).
 */
export interface WorldTransaction {
  id: string;
  amount: string;
  currencyCode: string;
  kind: TransactionKind;
  reportingAmount: string | null;
  reportingCurrencyCode: string | null;
  fxRateId: string | null;
  categoryId: string;
  notes: string | undefined;
  occurredAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
}

/**
 * Projected idempotency-key entry. Mirrors `IdempotencyKey` from
 * `domain/entities/idempotency-key.entity.ts` but stays narrow for the World.
 */
export interface WorldIdempotencyKey {
  readonly key: string;
  readonly userId: string;
  readonly requestFingerprint: string;
  readonly responsePayload: unknown;
  readonly responseStatus: number;
  readonly transactionId: string | null;
  readonly expiresAt: Date;
}

/**
 * Authenticated user projected from `@features/auth` for the step-def
 * surface. Narrow projection — only what the transactions slice steps care about.
 *
 * Field name is `reportingCurrencyCode` (matches `AuthService.reportsCurrencyCode`
 * canonical projection under `@features/auth/server/src/user.types.ts`).
 */
export interface ActiveUser {
  readonly id: string;
  readonly email: string;
  readonly reportingCurrencyCode: string;
}

/**
 * Create-transaction form input projection used by the step-def bodies.
 *
 * All fields are mutable (`T | undefined` rather than readonly) so step
 * bindings can re-assign partial updates without violating
 * `exactOptionalPropertyTypes`. The `notes`, `idempotencyKey`, and
 * `idempotencyFingerprint` fields are all optional (`| undefined`)
 * because the worker step bindings construct inputs without every key.
 */
export interface CreateFormInput {
  amount: string;
  currencyCode: string;
  kind: TransactionKind;
  categoryId: string;
  notes: string | undefined;
  idempotencyKey: string | undefined;
  idempotencyFingerprint: string | undefined;
  reportingCurrencyCode: string | undefined;
  occurredAt: Date;
}

/**
 * Sign-aware total projection — used by sign-aware-totals.feature.
 */
export interface WorldCategoryTotal {
  categoryId: string;
  categoryName: string;
  net: string;
}

/**
 * Transactions slice World — the mutable state container every step binding
 * receives. Constructed fresh per scenario.
 *
 * Fields use explicit `T | undefined` (rather than `?:`) so step bindings
 * can write `undefined` to clear state under the base
 * `exactOptionalPropertyTypes: true` tsconfig setting.
 */
export interface TransactionsWorld {
  // --- given state (fixtures populated by Given steps) ---
  user: ActiveUser | undefined;
  reportingCurrencyCode: string | undefined;
  currencies: ReadonlyArray<WorldCurrency> | undefined;
  categories: ReadonlyArray<WorldCategory> | undefined;
  fxRates: ReadonlyArray<WorldFxRate> | undefined;
  transactions: WorldTransaction[];
  idempotencyKeys: Map<string, WorldIdempotencyKey> | undefined;
  threshold: number | undefined;

  // --- when state (the action under test) ---
  attemptedCreate: CreateFormInput | undefined;
  attemptedList:
    | {
        cursor: string | undefined;
        pageSize: number | undefined;
        categoryId: string | undefined;
        fromDate: Date | undefined;
        toDate: Date | undefined;
        currencyCode: string | undefined;
      }
    | undefined;
  attemptedUpdate: { id: string; amount?: string; notes?: string } | undefined;
  attemptedSoftDelete: { id: string } | undefined;

  // --- then state (assertions populate these) ---
  lastErrorCode:
    | "VALIDATION_FAILED"
    | "CATEGORY_NOT_FOUND"
    | "CATEGORY_NOT_AVAILABLE"
    | "UNSUPPORTED_CURRENCY_PAIR"
    | "IDEMPOTENCY_KEY_REUSED"
    | "FX_RATE_STALE"
    | "TRANSACTION_NOT_FOUND"
    | "CATEGORY_ALREADY_EXISTS"
    | undefined;
  lastErrorMessage: string | undefined;
  lastDispatchedEvent: TxEventName | undefined;
  persistedTransaction: WorldTransaction | undefined;
  listResult: { rows: WorldTransaction[]; total: number; cursor: string | null } | undefined;
  incomeTotal: string | undefined;
  expenseTotal: string | undefined;
  netTotal: string | undefined;
  perCategoryTotals: WorldCategoryTotal[] | undefined;
  staleEventEmitted: boolean | undefined;
  thresholdEventEmitted: boolean | undefined;
  idempotencyReplay: boolean | undefined;
  formState: "empty" | "loading" | "error" | "success" | "validation-error" | undefined;
}

/**
 * Construct a fresh World for a new scenario. Steps MUST NOT mutate
 * the World outside the per-scenario instance.
 */
export function createTransactionsWorld(): TransactionsWorld {
  return {
    user: undefined,
    reportingCurrencyCode: undefined,
    currencies: [],
    categories: [],
    fxRates: [],
    transactions: [],
    idempotencyKeys: new Map<string, WorldIdempotencyKey>(),
    threshold: undefined,
    attemptedCreate: undefined,
    attemptedList: undefined,
    attemptedUpdate: undefined,
    attemptedSoftDelete: undefined,
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
    lastDispatchedEvent: undefined,
    persistedTransaction: undefined,
    listResult: undefined,
    incomeTotal: undefined,
    expenseTotal: undefined,
    netTotal: undefined,
    perCategoryTotals: [],
    staleEventEmitted: undefined,
    thresholdEventEmitted: undefined,
    idempotencyReplay: undefined,
    formState: undefined,
  };
}

/**
 * Re-export the discriminator types so step-def consumers don't have to
 * reach into the deep path.
 */
export type { CategoryKind, TransactionKind };

/**
 * Compat aliases for the older type names used by the worker's first
 * step-defs draft (see commit 56d2987's apply-progress notes). The
 * current canonical names are the `World<Kind>` + `Transactions*` +
 * `user` / `reportingCurrencyCode` set above; these aliases keep both
 * drafts type-safe against the same file.
 */
export type TxWorld = TransactionsWorld;
export type WorldEventName = TxEventName;

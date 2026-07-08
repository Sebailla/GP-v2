/**
 * Public barrel for the transactions domain entities.
 *
 * Re-exports the five entity interfaces + their associated discriminator
 * unions and insert/list projection types. Per the slice layout, ports
 * are imported separately from `../interfaces/`.
 */
export type { Currency } from "./currency.entity.js";
export type { Category, CategoryKind } from "./category.entity.js";
export type {
  Transaction,
  TransactionKind,
  TransactionListItem,
} from "./transaction.entity.js";
export type { FxRate, FxRateInsert } from "./fx-rate.entity.js";
export type {
  IdempotencyKey,
  IdempotencyKeyInsert,
} from "./idempotency-key.entity.js";

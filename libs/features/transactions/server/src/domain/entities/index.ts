/**
 * Public barrel for the transactions domain entities.
 *
 * Re-exports the entity interfaces shipped across slice 5: `Currency`,
 * `Category`, `Transaction`, `FxRate`, `IdempotencyKey`, and
 * `AuditLog` — plus their associated discriminator unions and
 * insert/list projection types.
 *
 * Per the slice layout, ports are imported separately from `../interfaces/`.
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
export type {
  AuditLog,
  AuditLogAppend,
  AuditEntityType,
  AuditAction,
} from "./audit-log.entity.js";

/**
 * Public barrel for the transactions domain entities.
 *
 * Re-exports the five entity interfaces shipped in PR #1 — `Currency`,
 * `Category`, `Transaction`, `FxRate`, and `IdempotencyKey` — plus their
 * associated discriminator unions and insert/list projection types.
 *
 * **Note: `AuditLog` is NOT in this barrel.** The `AuditLog` table ships
 * in the Prisma schema (`libs/core/database/prisma/schema.prisma`) for
 * PR #3's `TransactionService` to write to, but the domain entity +
 * `AuditLogRepository` port are deferred to PR #3 to avoid speculative
 * surface. Tracked as `slice5_pr1_audit_log_port_deferred_to_pr3` in
 * `apply-progress.md`. If you grep'd for `AuditLog` and found nothing
 * here, that's why — see PR #3.
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

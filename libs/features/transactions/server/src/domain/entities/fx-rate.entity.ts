import type { Decimal } from "@shared-utils/decimal";

/**
 * Domain entity: `FxRate`.
 *
 * Mirrors the `FxRate` model in
 * `libs/core/database/prisma/schema.prisma`. Rates use
 * `@shared-utils/decimal`'s `Decimal` (D-TX-6).
 *
 * Lookup shape: `(fromCode, toCode)` pair; the repository finds the
 * MOST RECENT row by `recordedAt` (see the `(fromCode, toCode,
 * recordedAt DESC)` composite index in the schema).
 *
 * The 24-hour staleness window is enforced by the `FxRateProvider`
 * (D-TX-2) and surfaces in the `transactions.fx.stale` event
 * (D-TX-4 + design §5.9) — this entity carries no staleness flag of
 * its own.
 */
export interface FxRate {
  readonly id: string;
  readonly fromCode: string;
  readonly toCode: string;
  readonly rate: Decimal;
  readonly recordedAt: Date;
}

/**
 * Input shape for inserting a new FxRate. Used by the in-memory provider
 * (PR #2 / T5.8) and any future external rate ingest job.
 */
export interface FxRateInsert {
  readonly fromCode: string;
  readonly toCode: string;
  readonly rate: Decimal;
  readonly recordedAt: Date;
}

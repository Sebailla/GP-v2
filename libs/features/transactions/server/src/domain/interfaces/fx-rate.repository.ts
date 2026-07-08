import type { FxRate, FxRateInsert } from "../entities/fx-rate.entity.js";

/**
 * Domain port for persisted `FxRate` rows.
 *
 * The reference repository implementation reads/writes the
 * `fx_rates` table directly. The hot path (live rate lookup during a
 * transaction write) goes through `FxRateProvider` instead — this
 * port exists for cold reads (most-recent rate for an admin view)
 * and for ingest (writing a fresh rate after a successful lookup).
 *
 * See `fx-rate.provider.ts` for the read-path port and D-TX-2.
 */
export interface FxRateRepository {
  /**
   * Most-recent rate for the given `(fromCode, toCode)` pair, or `null`
   * if no rate has ever been recorded. The lookup uses the
   * `(fromCode, toCode, recordedAt DESC)` composite index.
   */
  findMostRecent(fromCode: string, toCode: string): Promise<FxRate | null>;

  /**
   * Insert a new rate. The adapter does NOT deduplicate — callers may
   * insert multiple rates per minute if the source quotes frequently;
   * the staleness window is applied at read time, not write time.
   */
  insert(rate: FxRateInsert): Promise<FxRate>;
}
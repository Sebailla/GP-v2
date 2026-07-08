import type { Currency } from "../entities/currency.entity.js";

/**
 * Domain port for `Currency` reference data. Currencies are seeded at
 * startup (USD/ARS/EUR by default) and never mutated at runtime —
 * there is no `create`/`update`/`softDelete` on this port.
 */
export interface CurrencyRepository {
  /**
   * Look up a currency by its ISO 4217 alphabetic code (e.g. "USD").
   * Returns `null` if the code is not in the reference table.
   */
  findByCode(code: string): Promise<Currency | null>;

  /**
   * List every seeded currency. Used by the FX provider at boot and by
   * admin views; not exposed to controller request handlers directly.
   */
  list(): Promise<Currency[]>;
}
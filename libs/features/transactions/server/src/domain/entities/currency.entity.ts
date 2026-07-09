/**
 * Domain entity: `Currency`.
 *
 * Mirrors the `Currency` model in
 * `libs/core/database/prisma/schema.prisma` ("Currency"). The natural key is
 * the ISO 4217 alphabetic code (no cuid); the row is reference data seeded
 * at startup, never mutated at runtime.
 *
 * Notes:
 *  - `decimals` defaults to 2 for cent-granular currencies but other
 *    ISO currencies (JPY = 0, KWD = 3) override it.
 *  - `createdAt` is set by the data layer on insert; callers never write
 *    to it.
 */
export interface Currency {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly createdAt: Date;
}

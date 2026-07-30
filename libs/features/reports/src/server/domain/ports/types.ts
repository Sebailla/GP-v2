/**
 * Shared domain types for the Reports & Analytics port surface.
 *
 * These types are intentionally primitive (`string`/`Date`) instead of
 * branded types to keep the port easy to consume from the Prisma
 * adapter layer (which deals in plain DB rows). Branded types belong
 * at the application boundary (controllers, services) where the seam
 * is enforced.
 */

export type UserId = string;
export type CategoryId = string;
export type CurrencyCode = string;

/**
 * ISO-8601 date string (`YYYY-MM-DD`). The server validates the format
 * at the boundary via ZodValidationPipe.
 */
export type IsoDate = string;

/**
 * Domain entity: `Category`.
 *
 * Mirrors the `Category` model in
 * `libs/core/database/prisma/schema.prisma`. Categories are
 * SOFT-DELETABLE: the `deletedAt` column is the tombstone; reads MUST
 * filter `deletedAt IS NULL` everywhere (D-TX-5 — see
 * `domain/interfaces/category.repository.ts` for the contract).
 *
 * The `kind` discriminator is a string literal union to avoid pulling
 * the Prisma-generated `CategoryKind` enum into the domain layer; the
 * adapter maps the Prisma enum value to this union at the boundary.
 */
export type CategoryKind = "income" | "expense";

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly kind: CategoryKind;
  /** `null` while the category is active; set to the soft-delete timestamp on delete. */
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

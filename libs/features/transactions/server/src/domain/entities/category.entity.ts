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
  /**
   * User id of the actor who last touched the row. Set by the adapter
   * on create (= the creator's id) and overwritten on every update +
   * softDelete with the actor's id. Audit-trail parity with the
   * `Transaction` model's `createdBy` / `updatedBy` columns.
   * Closes the PR #1 W1 readability finding (the
   * `CategoryRepository.softDelete(id, actorId)` contract claimed this
   * column existed; PR #2 lands the column).
   */
  readonly updatedBy: string;
  /** `null` while the category is active; set to the soft-delete timestamp on delete. */
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

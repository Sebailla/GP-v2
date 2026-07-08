import type { Category, CategoryKind } from "../entities/category.entity.js";

/**
 * Filter input for `CategoryRepository.list`. `includeDeleted` is
 * intentionally NOT exposed — soft-deleted rows are never listable
 * through this port (D-TX-5; see `findById` and `list` below).
 */
export interface CategoryFilter {
  readonly kind?: CategoryKind;
  /** When supplied, only categories with a strictly-greater `createdAt` are returned. */
  readonly createdAfter?: Date;
}

/**
 * Input for `CategoryRepository.create`. The natural-key `slug` is
 * unique-table-wide; the repository translates duplicate-slug errors
 * into the canonical `CategoryAlreadyExists` domain error.
 */
export interface CategoryCreate {
  readonly name: string;
  readonly slug: string;
  readonly kind: CategoryKind;
}

/**
 * Input for `CategoryRepository.update`. `slug` is NOT updatable here
 * (stable URL identifier; renaming is a destructive operation out of
 * scope for the first slice).
 */
export interface CategoryUpdate {
  readonly name?: string;
  readonly kind?: CategoryKind;
}

/**
 * Domain port for `Category` persistence.
 *
 * Consumers (services, controllers) MUST NOT bypass this port to read
 * categories directly from Prisma — the soft-delete filter is enforced
 * HERE, at the boundary, not at the call site. The Prisma adapter
 * (PR #2 / T5.7) carries the implementation; its `__tests__/`
 * suite asserts every read query passes `where: { deletedAt: null }`.
 *
 * **Non-negotiable invariant (D-TX-5)**: every read query path —
 * `findById`, `list`, and the implicit JOIN in any future
 * `TransactionRepository.findById` that loads `category` — MUST filter
 * `where: { deletedAt: null }`. There is no escape hatch, no
 * `includeDeleted: boolean`, and no `bypassFilter` opt-out parameter.
 * The reason is that silent re-appearance of soft-deleted categories
 * in user-facing selectors and totals corrupts downstream state, and
 * the cost of forgetting is high enough that opt-outs are forbidden.
 *
 * If a future use case needs a way to read tombstoned rows (admin
 * audit, undo flow, etc.), that surface MUST be a NEW port —
 * e.g. `CategoryAdminRepository` — explicitly named for the context,
 * never an `includeDeleted` flag on this one.
 */
export interface CategoryRepository {
  /**
   * Look up an active (not soft-deleted) category by id.
   * Returns `null` for both "id does not exist" and "id exists but
   * is soft-deleted"; callers MUST NOT differentiate the two — to
   * end users, a soft-deleted category is gone.
   */
  findById(id: string): Promise<Category | null>;

  /**
   * List active (not soft-deleted) categories. `filter.kind` narrows
   * to `'income'` or `'expense'`. Soft-deleted rows are NEVER included.
   */
  list(filter: CategoryFilter): Promise<Category[]>;

  /**
   * Insert a new category. The adapter validates `slug` uniqueness
   * at the DB layer and surfaces `CategoryAlreadyExists` on conflict.
   */
  create(input: CategoryCreate): Promise<Category>;

  /**
   * Patch an existing category by id. Slug is immutable here; pass
   * `name` and/or `kind` only. Soft-deleted rows cannot be updated —
   * the adapter treats the id as not-found and returns the same error
   * surface as a true miss.
   */
  update(id: string, input: CategoryUpdate): Promise<Category>;

  /**
   * Soft-delete the category (set `deletedAt = now`). Returns silently
   * if the row does not exist OR is already soft-deleted — soft-delete
   * is idempotent. The `actorId` is recorded in the `updatedBy` column
   * for audit-trail parity with transactions.
   */
  softDelete(id: string, actorId: string): Promise<void>;
}
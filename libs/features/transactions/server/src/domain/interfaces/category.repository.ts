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
 *
 * `actorId` is the caller-of-record for the audit trail (PR #3a closes
 * the prior `__category_seed_actor__` sentinel — every Category write
 * now records the real actor).
 */
export interface CategoryCreate {
  readonly name: string;
  readonly slug: string;
  readonly kind: CategoryKind;
  readonly actorId: string;
}

/**
 * Input for `CategoryRepository.update`. `slug` is NOT updatable here
 * (stable URL identifier; renaming is a destructive operation out of
 * scope for the first slice).
 *
 * `actorId` is required — every update records the actor in the
 * `updatedBy` column for the audit trail. The service resolves
 * `actorId` from the call-site context (HTTP request auth, CLI
 * session, etc.) and threads it through; the adapter never invents a
 * placeholder.
 */
export interface CategoryUpdate {
  readonly name?: string;
  readonly kind?: CategoryKind;
  readonly actorId: string;
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
   * The `actorId` is recorded in the `updatedBy` column.
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

/**
 * Domain error raised when a `create()` call collides with the
 * `@@unique(slug)` constraint. Translated from Prisma's `P2002`
 * unique-constraint-violation error code at the adapter layer.
 *
 * Defined alongside the port so consumers (services, controllers,
 * tests) can `instanceof`-narrow without reaching into the adapter
 * file. The adapter file re-exports for convenience.
 */
export class CategoryAlreadyExistsError extends Error {
  constructor(public readonly slug: string) {
    super(`Category with slug "${slug}" already exists`);
    this.name = "CategoryAlreadyExistsError";
  }
}

/**
 * Domain error raised when an `update()` call lands on a missing OR
 * soft-deleted row. Translated from Prisma's `P2025` not-found error
 * code at the adapter layer. D-TX-5 boundary owner — the service
 * layer never differentiates "missing" from "soft-deleted".
 */
export class CategoryNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Category "${id}" not found or already soft-deleted`);
    this.name = "CategoryNotFoundError";
  }
}
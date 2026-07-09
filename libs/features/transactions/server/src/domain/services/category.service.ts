import type { Category, CategoryKind } from "../entities/category.entity.js";
import type {
  CategoryFilter,
  CategoryRepository,
} from "../interfaces/category.repository.js";
import type { AuditLogRepository } from "../interfaces/audit-log.repository.js";

/**
 * Context for service-level mutations. The `actorId` flows from the
 * call-site (HTTP request auth, CLI session) through the service into
 * the port's `actorId` field. PR #3a closes the prior
 * `__category_seed_actor__` sentinel — every write records the real
 * actor.
 */
export interface CategoryServiceContext {
  readonly actorId: string;
}

/**
 * Domain service for `Category` aggregate.
 *
 * Responsibilities:
 *  - Read paths (`list`, `findById`) — pure delegation to the
 *    repository; D-TX-5 is enforced at the boundary.
 *  - Write paths (`create`, `update`, `softDelete`) — orchestrate
 *    the repository + the audit log.
 *  - Category lifecycle is NOT in the 9-event catalog per design §4.7
 *    (only Transactions emit `transactions.created/updated/...`).
 *    The audit log is the system of record for Category history.
 *  - Idempotency: HTTP PUT/DELETE are naturally idempotent at the
 *    resource level; `softDelete` is itself idempotent at the
 *    repository layer (P2025 swallow).
 */
export class CategoryService {
  constructor(
    private readonly categoryRepo: CategoryRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /**
   * List active (not soft-deleted) categories, optionally filtered
   * by kind. Delegates to the repository; D-TX-5 is enforced there.
   */
  async list(filter: CategoryFilter = {}): Promise<Category[]> {
    return this.categoryRepo.list(filter);
  }

  /**
   * Find an active category by id. Returns `null` for missing or
   * soft-deleted rows — the caller MUST NOT differentiate.
   */
  async findById(id: string): Promise<Category | null> {
    return this.categoryRepo.findById(id);
  }

  /**
   * Create a new category. Writes the row, then the audit log. The
   * slug uniqueness violation surfaces as `CategoryAlreadyExistsError`
   * (translated from Prisma's `P2002` at the adapter).
   *
   * The dispatcher is reserved on the service ctor but not invoked
   * here — Category lifecycle is intentionally absent from the
   * 9-event catalog (design §4.7 + §5.9). If a future cross-slice
   * subscriber needs to react to Category creation (e.g. an admin
   * notification), the dispatch lands in PR #4+ as a new catalog event.
   */
  async create(
    input: {
      readonly name: string;
      readonly slug: string;
      readonly kind: CategoryKind;
    },
    ctx: CategoryServiceContext,
  ): Promise<Category> {
    const category = await this.categoryRepo.create({
      ...input,
      actorId: ctx.actorId,
    });
    await this.auditLogRepo.append({
      entityType: "Category",
      entityId: category.id,
      action: "create",
      actorId: ctx.actorId,
      payload: {
        name: category.name,
        slug: category.slug,
        kind: category.kind,
      },
    });
    return category;
  }

  /**
   * Update an existing category. The audit log records the changed
   * fields + their new values; the response is the projected Category.
   * Throws `CategoryNotFoundError` if the id is missing or
   * soft-deleted (boundary-owned D-TX-5).
   */
  async update(
    id: string,
    input: {
      readonly name?: string;
      readonly kind?: CategoryKind;
    },
    ctx: CategoryServiceContext,
  ): Promise<Category> {
    const changedFields = Object.keys(input).filter(
      (k) => (input as Record<string, unknown>)[k] !== undefined,
    );
    const category = await this.categoryRepo.update(id, {
      ...input,
      actorId: ctx.actorId,
    });
    await this.auditLogRepo.append({
      entityType: "Category",
      entityId: category.id,
      action: "update",
      actorId: ctx.actorId,
      payload: { changedFields, ...input },
    });
    return category;
  }

  /**
   * Soft-delete a category. Idempotent (the adapter swallows P2025).
   * Writes the audit log regardless of whether the row existed (the
   * log is the system of record for "user X attempted to delete Y
   * at time Z"); if the row was already gone, the audit log is
   * still useful for forensic purposes.
   */
  async softDelete(
    id: string,
    ctx: CategoryServiceContext,
  ): Promise<void> {
    await this.categoryRepo.softDelete(id, ctx.actorId);
    await this.auditLogRepo.append({
      entityType: "Category",
      entityId: id,
      action: "softDelete",
      actorId: ctx.actorId,
      payload: { at: new Date() },
    });
  }
}
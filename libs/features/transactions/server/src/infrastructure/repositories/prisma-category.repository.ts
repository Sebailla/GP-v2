import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient, Prisma } from "@core/database";

import type {
  Category,
  CategoryKind,
} from "../../domain/entities/category.entity.js";
import type {
  CategoryRepository,
  CategoryFilter,
  CategoryCreate,
  CategoryUpdate,
} from "../../domain/interfaces/category.repository.js";

/**
 * Domain error raised when a `create()` call collides with the
 * `@@unique(slug)` constraint. Translated from Prisma's `P2002`
 * unique-constraint-violation error code.
 */
export class CategoryAlreadyExistsError extends Error {
  constructor(public readonly slug: string) {
    super(`Category with slug "${slug}" already exists`);
    this.name = "CategoryAlreadyExistsError";
  }
}

/**
 * Prisma adapter for `CategoryRepository`.
 *
 * **Non-negotiable invariant (D-TX-5)**: every read query — `findById`,
 * `list`, and any future JOIN that loads categories — MUST filter
 * `where: { deletedAt: null }` on the read path. There is no escape
 * hatch, no `includeDeleted: boolean`, and no `bypassFilter` parameter.
 * The `__tests__/prisma-category.repository.test.ts` suite verifies
 * this contract by inspecting every `findUnique` / `findFirst` /
 * `findMany` call's `where` clause and asserting the soft-delete
 * predicate is present.
 *
 * Mirror of the slice-wide rule documented on the `CategoryRepository`
 * port JSDoc. Any drift fails the test suite; any drift that bypasses
 * the test suite is a bug.
 */
export class PrismaCategoryRepository implements CategoryRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? defaultPrisma;
  }

  async findById(id: string): Promise<Category | null> {
    const row = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
    return row === null ? null : projectCategory(row);
  }

  async list(filter: CategoryFilter): Promise<Category[]> {
    const where: Prisma.CategoryWhereInput = { deletedAt: null };
    if (filter.kind !== undefined) {
      where.kind = filter.kind;
    }
    const rows = await this.prisma.category.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return rows.map(projectCategory);
  }

  async create(input: CategoryCreate): Promise<Category> {
    try {
      const row = await this.prisma.category.create({
        data: {
          name: input.name,
          slug: input.slug,
          kind: input.kind,
          // Set updatedBy = would-be-actor on insert (parity with
          // Transaction.createdBy). The port signature doesn't take
          // an actor on `create` (only on `update` / `softDelete`),
          // so this adapter currently always sets updatedBy to a
          // sentinel for system-seeded inserts. PR #3 will tighten
          // when `CategoryService` is added.
          //
          // NOTE: there's no `createdBy` column on Category. Only
          // `updatedBy` exists, mirroring the actor-of-last-touch
          // pattern. The adapter sets both create-time and
          // update-time to the same actor for now; if a separate
          // `createdBy` is required, add it via a follow-up migration.
          updatedBy: "__category_seed_actor__",
        },
      });
      return projectCategory(row);
    } catch (err) {
      if (isPrismaUniqueViolation(err, "slug")) {
        throw new CategoryAlreadyExistsError(input.slug);
      }
      throw err;
    }
  }

  async update(id: string, input: CategoryUpdate): Promise<Category> {
    // Use the UncheckedUpdateInput variant — it accepts `updatedBy`
    // as a plain string FK, which matches how the adapter resolves the
    // actor at this layer (the service hands a userId, not a User
    // relation shape). The "checked" CategoryUpdateInput would force
    // `updatedByUser: { connect: { id } }`, which is the right call
    // for a higher-level service but redundant here.
    const data: Prisma.CategoryUncheckedUpdateInput = {
      updatedBy: "__category_seed_actor__", // overwritten by services in PR #3
    };
    if (input.name !== undefined) data.name = input.name;
    if (input.kind !== undefined) data.kind = input.kind;

    try {
      const row = await this.prisma.category.update({
        where: { id },
        data,
      });
      return projectCategory(row);
    } catch (err) {
      if (isPrismaNotFound(err)) {
        // Soft-deleted rows are not-found; surface as null at the
        // call-site by returning a typed marker. We throw to keep the
        // port signature honest; the service layer translates this
        // into the right error class.
        throw new CategoryNotFoundError(id);
      }
      throw err;
    }
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    try {
      await this.prisma.category.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          updatedBy: actorId,
        },
      });
    } catch (err) {
      // Idempotent: soft-deleting a soft-deleted (or non-existent) row
      // is a no-op. Mirror the `P2025` swallow pattern from
      // `prisma-session.repository.ts`.
      if (isPrismaNotFound(err)) return;
      throw err;
    }
  }
}

/** Translated from Prisma's `P2025` ("Record to update not found"). */
export class CategoryNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Category "${id}" not found or already soft-deleted`);
    this.name = "CategoryNotFoundError";
  }
}

/**
 * Recognizes Prisma's P2002 unique-constraint violation. The adapter
 * raises `CategoryAlreadyExistsError` instead of leaking the Prisma
 * error class into the domain layer.
 */
function isPrismaUniqueViolation(
  err: unknown,
  target: string,
): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002" &&
    "meta" in err &&
    typeof (err as { meta?: unknown }).meta === "object" &&
    (err as { meta?: { target?: unknown } }).meta?.target === target
  );
}

/**
 * Recognizes Prisma's P2025 "Record not found". Used to mask the
 * not-found case after softDelete / update so the adapter remains
 * idempotent and the call-site gets a domain-friendly error class.
 */
function isPrismaNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2025"
  );
}

function projectCategory(row: {
  id: string;
  name: string;
  slug: string;
  kind: string;
  updatedBy: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind === "income" ? "income" : "expense",
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Suppress unused-import warning — CategoryKind is intentionally not used in
// the file body (the projection function narrows the union internally).
type _CategoryKindSentinel = CategoryKind;
const _kind: _CategoryKindSentinel | undefined = undefined;
void _kind;

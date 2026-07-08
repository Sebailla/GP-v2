import { prisma as defaultPrisma, isPrismaUniqueViolation } from "@core/database";
import type { PrismaClient, Prisma } from "@core/database";

import type {
  Category,
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

    // D-TX-5 invariant: refuse to update soft-deleted rows. Pre-check
    // via findFirst({ deletedAt: null }); the small race window between
    // the check and the update is acceptable for PR #2 — PR #3 services
    // that need stricter atomicity can wrap in a SERIALIZABLE transaction.
    const existing = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
    if (existing === null) {
      throw new CategoryNotFoundError(id);
    }

    const row = await this.prisma.category.update({
      where: { id },
      data,
    });
    return projectCategory(row);
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    // D-TX-5: use updateMany with the deletedAt: null filter so a
    // soft-deleted (or non-existent) row is a silent no-op. The count
    // is intentionally discarded — we don't surface "did it actually
    // delete" to the port (the port contract is idempotent void).
    // The atomic updateMany replaces the prior `update` + P2025-swallow
    // pattern; it avoids the race window where a concurrent update
    // could re-mutate a soft-deleted row.
    await this.prisma.category.updateMany({
      where: { id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        updatedBy: actorId,
      },
    });
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
 *
 * NOTE: the local copies of `isPrismaUniqueViolation` and
 * `isPrismaNotFound` were promoted to `@core/database/prisma-error-guards`
 * in the 4R review fix (commit TBD). The slice no longer owns these
 * guards; every Prisma-backed adapter in the workspace shares the same
 * shape recognition.
 */

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
// Note: this sentinel was removed in the 4R review fix; the import was
// unused and is no longer pulled in.

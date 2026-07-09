import {
  prisma as defaultPrisma,
  isPrismaUniqueViolation,
  TransactionIsolationLevel,
} from "@core/database";
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
 * Prisma adapter for `CategoryRepository`.
 *
 * **Non-negotiable invariant (D-TX-5)**: every read query — `findById`,
 * `list`, and any future JOIN that loads categories — MUST filter
 * `where: { deletedAt: null }`. The `update` path runs the pre-check
 * + update inside a `SERIALIZABLE` `$transaction` so a concurrent
 * `softDelete` between the two operations is serialized (Postgres
 * aborts the second transaction with a `P2034` serialization failure;
 * the outer try/catch translates it to `CategoryNotFoundError`).
 * The `softDelete` path uses an atomic `updateMany` with the same
 * `deletedAt: null` filter so a soft-deleted (or non-existent) row
 * is a silent no-op.
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
          // Set `updatedBy` = would-be-actor on insert. The port signature
          // doesn't take an actor on `create` (only on `update` /
          // `softDelete`), so this adapter currently always sets
          // `updatedBy` to a sentinel for system-seeded inserts. PR #3
          // will tighten when `CategoryService` is added.
          //
          // NOTE: there's no `createdBy` column on Category. Only
          // `updatedBy` exists, mirroring the actor-of-last-touch
          // pattern. The adapter sets both create-time and update-time
          // to the same actor for now; if a separate `createdBy` is
          // required, add it via a follow-up migration.
          updatedBy: "__category_seed_actor__",
        },
      });
      return projectCategory(row);
    } catch (err) {
      // `isPrismaUniqueViolation` uses an "includes" semantic for
      // compound `@@unique([a, b])` violations. For the Category
      // schema, `@@unique(slug)` is single-field, so the strict match
      // on "slug" works. If a future unique spans multiple fields, pass
      // the specific target you want to detect (or write your own
      // strict check on the array shape).
      if (isPrismaUniqueViolation(err, "slug")) {
        throw new CategoryAlreadyExistsError(input.slug);
      }
      throw err;
    }
  }

  async update(id: string, input: CategoryUpdate): Promise<Category> {
    // D-TX-5 invariant: the pre-check + update run inside a
    // SERIALIZABLE `$transaction` so a concurrent `softDelete` between
    // the two operations is serialized. Postgres aborts the second
    // transaction with a serialization failure (Prisma `P2034`);
    // the outer try/catch translates `P2034` to `CategoryNotFoundError`
    // so the domain layer never sees a raw Prisma error. Without
    // SERIALIZABLE the read-then-update pattern has a TOCTOU window
    // where the update can land on a now-soft-deleted row.
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Use the `UncheckedUpdateInput` variant — it accepts
          // `updatedBy` as a plain string FK, which matches how the
          // adapter resolves the actor at this layer (the service
          // hands a userId, not a User relation shape). The "checked"
          // `CategoryUpdateInput` would force
          // `updatedByUser: { connect: { id } }`, redundant here.
          const data: Prisma.CategoryUncheckedUpdateInput = {
            updatedBy: "__category_seed_actor__", // overwritten by services in PR #3
          };
          if (input.name !== undefined) data.name = input.name;
          if (input.kind !== undefined) data.kind = input.kind;

          const existing = await tx.category.findFirst({
            where: { id, deletedAt: null },
          });
          if (existing === null) {
            throw new CategoryNotFoundError(id);
          }

          const row = await tx.category.update({
            where: { id },
            data,
          });
          return projectCategory(row);
        },
        {
          isolationLevel: TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        },
      );
    } catch (err) {
      // Translate Postgres serialization failure (Prisma `P2034`) to
      // `CategoryNotFoundError` so the domain layer never sees a raw
      // Prisma error on the D-TX-5 update path. The serialization
      // failure is the documented outcome of a concurrent `softDelete`
      // winning the SERIALIZABLE race; semantically the row is
      // soft-deleted from this transaction's perspective.
      if (isPrismaSerializationFailure(err)) {
        throw new CategoryNotFoundError(id);
      }
      throw err;
    }
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    // D-TX-5: use `updateMany` with the `deletedAt: null` filter so a
    // soft-deleted (or non-existent) row is a silent no-op. The count
    // is intentionally discarded — we don't surface "did it actually
    // delete" to the port (the port contract is idempotent void). The
    // atomic `updateMany` replaces the prior `update` + P2025-swallow
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

/** Translated from Prisma's `P2025` ("Record to update not found"). */
export class CategoryNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Category "${id}" not found or already soft-deleted`);
    this.name = "CategoryNotFoundError";
  }
}

/**
 * Recognizes Prisma's `P2034` (Postgres serialization failure on
 * `SERIALIZABLE` transactions). When the update path's `SERIALIZABLE`
 * `$transaction` is aborted by a concurrent `softDelete`, Prisma
 * surfaces the failure as `P2034`; the adapter translates it to
 * `CategoryNotFoundError` so the domain layer never sees a raw
 * Prisma error.
 *
 * Lives locally (not in `@core/database`) because the translation is
 * `Category`-specific — `Transaction` has its own `TransactionNotFoundError`
 * with the same pattern, but the boundary ownership stays with the
 * adapter to keep the public surface tight.
 */
function isPrismaSerializationFailure(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2034"
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

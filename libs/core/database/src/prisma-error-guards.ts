/**
 * Shared Prisma error-code guards.
 *
 * Lives in `@core/database` (not in feature slices) because every
 * Prisma-backed adapter in the workspace needs the same shape
 * recognition: P2002 (unique violation) and P2025 (record not found).
 * The slice-level error classes (`CategoryAlreadyExistsError`,
 * `CategoryNotFoundError`, `TransactionNotFoundError`, etc.) are
 * domain-specific and stay in the slice; these guards are the
 * Prisma-runtime recognizers that those wrappers delegate to.
 *
 * The implementations handle both string and string[] shapes for
 * `meta.target`: Prisma emits a `string` for single-field unique
 * violations (e.g. `@@unique(slug)` → `target: "slug"`) and a
 * `string[]` for compound unique violations (e.g.
 * `@@unique([userId, key])` → `target: ["userId", "key"]`). The
 * strict-equality check that earlier versions of these guards used
 * (`target === "slug"`) was a CRITICAL bug — it never matched the
 * real Prisma shape and silently let raw Prisma errors leak into
 * the domain layer.
 *
 * Re-exported from `@core/database` so adapters can import:
 *
 *   import { isPrismaUniqueViolation, isPrismaNotFound } from "@core/database";
 *
 * Usage example (the canonical pattern from
 * `prisma-category.repository.ts`):
 *
 *   try {
 *     await this.prisma.category.create({ data });
 *   } catch (err) {
 *     if (isPrismaUniqueViolation(err, "slug")) {
 *       throw new CategoryAlreadyExistsError(input.slug);
 *     }
 *     throw err;
 *   }
 */

/**
 * Recognizes Prisma's `P2002` unique-constraint violation AND matches
 * the supplied `target` against the `meta.target` field. The target
 * match handles both single-field (`string`) and compound (`string[]`)
 * unique constraints.
 *
 * For compound targets, the function returns `true` if `target` appears
 * in the array. This is the "include" semantic — the caller is asserting
 * that the target field is part of the violated constraint. If you need
 * strict "this is the ONLY field" semantics, call
 * `Array.isArray(meta.target) ? meta.target.length === 1 && meta.target[0] === target : meta.target === target`.
 *
 * @param err - The thrown value (any Prisma error or unknown)
 * @param target - The unique-constraint field name to match (e.g. "slug", "userId")
 * @returns `true` if `err` is a P2002 with the given target field
 */
export function isPrismaUniqueViolation(
  err: unknown,
  target: string,
): boolean {
  if (typeof err !== "object" || err === null) return false;
  if (!("code" in err)) return false;
  if ((err as { code?: unknown }).code !== "P2002") return false;
  if (!("meta" in err)) return false;
  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return false;
  const t = (meta as { target?: unknown }).target;
  if (Array.isArray(t)) {
    return t.includes(target);
  }
  return t === target;
}

/**
 * Recognizes Prisma's `P2025` "Record not found" — the universal error
 * for missing rows (whether they were never inserted or were soft-deleted
 * by a prior call).
 *
 * Used to:
 *  - Translate the runtime error into a domain-friendly error class
 *    (e.g. `CategoryNotFoundError`, `TransactionNotFoundError`).
 *  - Swallow the error silently in idempotent paths (e.g. `softDelete` —
 *    a soft-delete on an already-deleted row is a no-op).
 *
 * @param err - The thrown value (any Prisma error or unknown)
 * @returns `true` if `err` is a P2025
 */
export function isPrismaNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2025"
  );
}

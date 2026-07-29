// Public API for @core/database.
// Re-exports the Prisma client singleton, the generated namespace, and the
// runtime Decimal class. All consumers (apps/api, feature server slices) MUST
// import from here, never from "@prisma/client" directly — that keeps the
// singleton boundary enforced by the no-prisma-outside-core ESLint rule.
//
// Slice 5 PR #2 expands the public surface with:
//   - `Prisma` (namespace) — adapters need WhereInput / UpdateInput shape
//     types for repository method signatures.
//   - `PrismaClientKnownRequestError` — adapters translate Prisma's
//     unique-constraint (P2002) and not-found (P2025) errors into
//     domain-friendly errors. The class is needed for `instanceof`
//     narrowing; using code-string matching alone would couple tightly
//     to the runtime error shape.
//   - `Decimal` (from Prisma's runtime, NOT `@shared-utils/decimal`).
//     Prisma's runtime Decimal is what adapters receive on read;
//     adapters convert to `@shared-utils/decimal`'s `Decimal` via
//     `toDecimal(row.field.toString())` at the boundary. Importing the
//     class type only (not a runtime instance) keeps the boundary
//     explicit: every place that needs the Prisma-side type
//     describes it as `Prisma.Decimal` so the type system surfaces
//     any accidental cross-boundary reach-through.

export { prisma } from "./client.js";

export type { PrismaClient } from "./generated/client.js";

export {
  PrismaClientKnownRequestError,
  TransactionIsolationLevel,
} from "./generated/internal/prismaNamespace.js";
export type { Decimal as PrismaDecimal } from "./generated/internal/prismaNamespace.js";

// Re-export the Prisma namespace. Adapters can write
//   `import { Prisma } from "@core/database"; Prisma.CategoryWhereInput`
// (type — Prisma.CategoryWhereInput is a type-only symbol) AND
//   `Prisma.raw("now() - interval '1 day'")` (runtime — for clock-
//    drift-safe date arithmetic on the DB clock, see F4 fix in
//    `libs/features/auth/server/src/audit.service.ts`)
// without reaching into the generated internal paths. The
// `no-prisma-outside-core` ESLint rule pins the canonical import
// path to `@core/database` — both type and runtime imports flow
// through this single boundary.
//
// The `Prisma` symbol is constructed in `generated/client.ts` as a
// namespace alias over `./internal/prismaNamespace` and re-exported
// from there (line 42). Re-exporting it here gives consumers a single
// canonical import path that covers both `Prisma.X` value calls and
// `Prisma.X` type references.
export { Prisma } from "./generated/client.js";

// Shared Prisma error-code guards (PR #2 4R review fix). Every Prisma-backed
// adapter in the workspace reaches for these to translate P2002 / P2025 into
// domain-friendly error classes or to swallow P2025 silently in idempotent
// paths. The implementation handles both `string` and `string[]` shapes for
// `meta.target` (single-field vs. compound unique constraints).
export { isPrismaUniqueViolation, isPrismaNotFound } from "./prisma-error-guards.js";

// Backup run status (R-PF-7). Read the most recent BackupRun row for a
// given environment; the /status endpoint surfaces this to the public
// status page.
export { latestBackupStatus } from "./backup-status.js";
export type { BackupStatus, BackupStatusKind } from "./backup-status.js";

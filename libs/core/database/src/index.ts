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

export { PrismaClientKnownRequestError } from "./generated/internal/prismaNamespace.js";
export type { Decimal as PrismaDecimal } from "./generated/internal/prismaNamespace.js";

// Re-export the namespace as a type-only surface so adapters can write
// `import { Prisma } from "@core/database"; Prisma.CategoryWhereInput` etc.
// without reaching into the generated internal paths.
import type * as PrismaNamespace from "./generated/internal/prismaNamespace.js";
export type { PrismaNamespace as Prisma };

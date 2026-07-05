// Public API for @core/database.
// Re-exports the Prisma client singleton and the generated types.
// All consumers (apps/api, feature server slices) MUST import from here,
// never from "@prisma/client" directly — that keeps the singleton boundary
// enforced by the no-prisma-outside-core ESLint rule.

export { prisma } from "./client.js";
export type { PrismaClient } from "./generated/client.js";
// Prisma client singleton for @core/database.
//
// Lazy initialization via Proxy: the underlying PrismaClient is constructed
// only on first property access, not at module load. This means:
// 1. Test files can import `prisma` without triggering a DB connection.
// 2. Hot-reload in dev doesn't wastefully instantiate new clients.
// 3. The globalThis cache pattern still ensures singleton within a process.
//
// IMPORTANT: This is the ONLY place in the repo where `new PrismaClient()` is
// permitted. The `no-prisma-outside-core` ESLint rule from slice 1 enforces
// that boundary. Importing PrismaClient from feature code will fail lint.

import { PrismaClient } from "./generated/client.js";

type GlobalWithPrisma = typeof globalThis & {
  prisma?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalWithPrisma;

let _instance: PrismaClient | undefined;

function getOrCreate(): PrismaClient {
  if (_instance) return _instance;
  _instance =
    globalForPrisma.prisma ??
    new PrismaClient({
      // Prisma 7 requires `accelerateUrl` in the constructor type signature even
      // when not using Prisma Accelerate. Empty string is rejected at runtime
      // (must be non-empty); the real fix is a driver adapter. Tracked for
      // slice 3+ (api wire-up).
      // TODO(slice-3+): replace with @prisma/adapter-pg and remove this placeholder.
      accelerateUrl: "postgresql://placeholder.localhost/db",
      log: process.env.NODE_ENV === "production" ? ["error"] : ["query", "error", "warn"],
    });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = _instance;
  }
  return _instance;
}

/**
 * Lazy Prisma client proxy. Any property access triggers
 * initialization on first call; subsequent calls return the cached instance.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(getOrCreate(), prop);
  },
  has(_target, prop) {
    return Reflect.has(getOrCreate(), prop);
  },
});

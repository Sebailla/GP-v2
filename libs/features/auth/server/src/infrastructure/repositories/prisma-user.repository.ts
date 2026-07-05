import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";

import type {
  UserRecord,
  UserRepository,
} from "../../domain/interfaces/user.repository.js";

/**
 * Prisma adapter for `UserRepository`.
 *
 * Thin wrapper around `prisma.user.findUnique` that projects the row
 * onto the narrow `UserRecord` shape the domain expects. The adapter
 * deliberately does NOT expose Prisma-specific types or relations on
 * its public surface so that downstream code stays decoupled from the
 * persistence choice.
 *
 * Per the slice-wide boundary rules (`no-prisma-outside-core` ESLint
 * rule), `new PrismaClient()` is forbidden here. The adapter imports
 * the singleton from `@core/database` and accepts a `PrismaClient` as
 * a constructor arg so tests can inject an in-memory fake.
 *
 * Slice 3 batch 3 scope: the interface is declared and the concrete
 * adapter is shipped, but `AuthService` / `SessionService` still call
 * `prisma.user.*` directly. Wiring the repository into those services
 * is a refactor for slice 3 batch 4+.
 */
export class PrismaUserRepository implements UserRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? defaultPrisma;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    if (row === null) {
      return null;
    }
    return projectUserRecord(row);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    if (row === null) {
      return null;
    }
    return projectUserRecord(row);
  }

  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    // The domain hands a pre-hashed value (bcrypt cost 10 per design
    // §4.1 — that hashing happens in PasswordResetService.consumeReset).
    // The adapter only persists it. If the user id does not exist,
    // Prisma raises P2025; the domain layer is responsible for catching
    // that signal (future slice — current callers either know the user
    // exists from a prior lookup or accept the propagation).
    await this.prisma.user.update({
      where: { id },
      data: { hashedPassword },
    });
  }
}

/**
 * Internal projection from the full Prisma row to the domain's
 * `UserRecord`. Kept private so future Prisma renames (e.g. dropping
 * a column) only touch this one file.
 */
function projectUserRecord(row: {
  id: string;
  email: string;
  role: string;
  hashedPassword: string | null;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    role: row.role === "ADMIN" ? "ADMIN" : "USER",
    hashedPassword: row.hashedPassword,
  };
}
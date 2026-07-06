import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";

import type {
  SessionRecord,
  SessionRepository,
} from "../../domain/interfaces/session.repository.js";

/**
 * Prisma adapter for `SessionRepository`.
 *
 * Thin wrapper around `prisma.session.*` that projects the row onto
 * the narrow `SessionRecord` shape the domain expects. The adapter
 * deliberately does NOT expose Prisma-specific types or relations on
 * its public surface so downstream code stays decoupled from the
 * persistence choice.
 *
 * Per the slice-wide boundary rules (`no-prisma-outside-core` ESLint
 * rule), `new PrismaClient()` is forbidden here. The adapter imports
 * the singleton from `@core/database` and accepts a `PrismaClient` as
 * a constructor arg so tests can inject an in-memory fake.
 *
 * Idempotency contract:
 *  - `listActive` returns `[]` on miss.
 *  - `findByToken` returns `null` on miss.
 *  - `revokeByToken` swallows Prisma's `P2025` (record not found) —
 *    the service layer's caller already short-circuited before
 *    reaching here on the consumed/expired/unknown paths, so a
 *    missed match here is benign.
 *
 * Slice 3 batch 6 (brief T3.6b) ships this as the fourth
 * `@core/database` integration after `PrismaUserRepository` (slice 3
 * batch 3), `PrismaPasswordResetTokenRepository` (slice 3 batch 4),
 * and the prior transaction-history adapter landed in slice 1/2
 * (placeholder until slice 5 wires it).
 */
export class PrismaSessionRepository implements SessionRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? defaultPrisma;
  }

  async listActive(userId: string): Promise<SessionRecord[]> {
    const rows = await this.prisma.session.findMany({
      where: {
        userId,
        expires: { gt: new Date() },
      },
    });
    return rows.map(projectSessionRecord);
  }

  async findByToken(token: string): Promise<SessionRecord | null> {
    const row = await this.prisma.session.findUnique({
      where: { sessionToken: token },
    });
    if (row === null) {
      return null;
    }
    return projectSessionRecord(row);
  }

  async revokeByToken(token: string): Promise<void> {
    try {
      await this.prisma.session.delete({
        where: { sessionToken: token },
      });
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === "P2025"
      ) {
        return;
      }
      throw err;
    }
  }
}

/**
 * Internal projection from the full Prisma row to the domain's
 * `SessionRecord`. Kept private so future Prisma renames (e.g., adding
 * a relation column) only touch this one file.
 */
function projectSessionRecord(row: {
  id: string;
  sessionToken: string;
  userId: string;
  expires: Date;
}): SessionRecord {
  return {
    id: row.id,
    sessionToken: row.sessionToken,
    userId: row.userId,
    expires: row.expires,
  };
}

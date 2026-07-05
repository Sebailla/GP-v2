import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";

import type {
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from "../../domain/interfaces/password-reset-token.repository.js";

/**
 * Prisma adapter for `PasswordResetTokenRepository`.
 *
 * Thin wrapper around `prisma.passwordResetToken.*` that projects the
 * row onto the narrow `PasswordResetTokenRecord` shape the domain
 * expects. The adapter deliberately does NOT expose Prisma-specific
 * types or relations on its public surface so downstream code stays
 * decoupled from the persistence choice.
 *
 * Per the slice-wide boundary rules (`no-prisma-outside-core` ESLint
 * rule), `new PrismaClient()` is forbidden here. The adapter imports
 * the singleton from `@core/database` and accepts a `PrismaClient`
 * as a constructor arg so tests can inject an in-memory mock.
 *
 * Slice 3 batch 4 ships this adapter as the third `@core/database`
 * integration after `PrismaUserRepository` (brief T3.5 from slice 3
 * batch 3) and the future `PrismaSessionRepository` (slice 3 batch 5+).
 *
 * Relation-input note: the `PasswordResetToken` Prisma schema declares
 * `userId` as a FK + a relation. The generated client's create input
 * requires the relation via `user: { connect: { id: userId } }` when
 * going through `CreateInput`; the `UncheckedCreateInput` variant
 * accepts `userId` directly but the relation-input path is the
 * canonical one (and matches `user: User @relation(...)` in the
 * schema). The adapter uses the relation input — `passwordReset
 * Tokens` create via the user relation, mirroring how a NestJS
 * controller would.
 *
 * Idempotency contract:
 *  - `findByHash` returns `null` on miss (the service layer
 *    translates this to a generic `INVALID_RESET_TOKEN`).
 *  - `markConsumed` swallows Prisma's `P2025` (record not found) —
 *    the service layer already short-circuited before reaching here
 *    on the consumed/expired/unknown paths, so a missed match here
 *    is benign.
 */
export class PrismaPasswordResetTokenRepository
  implements PasswordResetTokenRepository
{
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? defaultPrisma;
  }

  async create(args: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenRecord> {
    const row = await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: args.tokenHash,
        expiresAt: args.expiresAt,
        user: { connect: { id: args.userId } },
      },
    });
    return projectPasswordResetTokenRecord(row);
  }

  async findByHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenRecord | null> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (row === null) {
      return null;
    }
    return projectPasswordResetTokenRecord(row);
  }

  async markConsumed(tokenHash: string, consumedAt: Date): Promise<void> {
    // Idempotent: a `P2025` here means the row was deleted between
    // `findByHash` and the update; treat as a no-op. The service
    // layer's expiry/consumed/foreign-key checks have already gated
    // the call, so this branch is defensive only.
    try {
      await this.prisma.passwordResetToken.update({
        where: { tokenHash },
        data: { consumedAt },
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
 * `PasswordResetTokenRecord`. Kept private so future Prisma renames
 * (e.g. adding an audit column) only touch this one file.
 */
function projectPasswordResetTokenRecord(row: {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}): PasswordResetTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
  };
}

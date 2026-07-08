import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";
import type { Prisma } from "@core/database";

import type {
  IdempotencyKey,
  IdempotencyKeyInsert,
} from "../../domain/entities/idempotency-key.entity.js";
import type { IdempotencyRepository } from "../../domain/interfaces/idempotency.repository.js";

/**
 * Prisma adapter for `IdempotencyRepository`.
 *
 * The replay key is `(userId, key)` — `@@unique([userId, key])` enforces
 * uniqueness at the DB level. The `upsert` uses Prisma's native
 * upsert semantics: a hit on `(userId, key)` updates the row in place;
 * a miss inserts a new one.
 *
 * Per the W4 readability fix in PR #1 (commit 46146a7), the
 * `find()` method is the boundary owner for the `expiresAt > now`
 * check — expired rows return `null` so the service doesn't need to
 * re-check the clock policy. The `purgeExpired(now)` cron (PR #3 +
 * slice 6) calls this method on a 15-min interval.
 *
 * Race note (forward to PR #3 services): the `upsert` here is a
 * Postgres-level ON CONFLICT DO UPDATE. Two simultaneous first-call
 * requests with the same key would race their upserts; whichever
 * lands last wins the cached payload. The standard pattern for
 * first-wins semantics is service-level: SELECT, branch on miss,
 * INSERT without `upsert`. PR #3's `TransactionService.create` will
 * make that call pattern explicit; this adapter just provides both
 * operations honestly.
 */
export class PrismaIdempotencyRepository implements IdempotencyRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? defaultPrisma;
  }

  async find(userId: string, key: string): Promise<IdempotencyKey | null> {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });
    // Boundary-owned filter: an expired record is a miss (per the W4
    // readability fix from PR #1). The service does NOT need to
    // re-check `expiresAt > now`.
    if (row === null) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return projectIdempotencyKey(row);
  }

  async upsert(input: IdempotencyKeyInsert): Promise<void> {
    // Prisma's `Json` column accepts arbitrary JSON-serializable values
    // directly — we cast to `Prisma.InputJsonValue` to satisfy the type.
    // The service is responsible for ensuring the payload is JSON-safe
    // (no class instances, no circular refs, no BigInt) before reaching
    // the adapter; that contract lives on `IdempotencyKeyInsert`.
    const responsePayload = input.responsePayload as Prisma.InputJsonValue;
    await this.prisma.idempotencyKey.upsert({
      where: { userId_key: { userId: input.userId, key: input.key } },
      create: {
        key: input.key,
        userId: input.userId,
        requestFingerprint: input.requestFingerprint,
        responsePayload,
        responseStatus: input.responseStatus,
        transactionId: input.transactionId,
        expiresAt: input.expiresAt,
      },
      update: {
        responsePayload,
        responseStatus: input.responseStatus,
        transactionId: input.transactionId,
        expiresAt: input.expiresAt,
      },
    });
  }

  async purgeExpired(now: Date): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }
}

// Local type alias removed in favor of the public re-export `Prisma`
// from @core/database (see libs/core/database/src/index.ts for the
// namespace surface).

function projectIdempotencyKey(row: {
  id: string;
  key: string;
  userId: string;
  requestFingerprint: string;
  responsePayload: unknown;
  responseStatus: number;
  transactionId: string | null;
  expiresAt: Date;
  createdAt: Date;
}): IdempotencyKey {
  return {
    id: row.id,
    key: row.key,
    userId: row.userId,
    requestFingerprint: row.requestFingerprint,
    responsePayload: row.responsePayload,
    responseStatus: row.responseStatus,
    transactionId: row.transactionId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

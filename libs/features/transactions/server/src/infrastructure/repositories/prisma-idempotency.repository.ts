import { prisma as defaultPrisma, isPrismaUniqueViolation } from "@core/database";
import type { Prisma, PrismaClient } from "@core/database";

import type {
  IdempotencyKey,
  IdempotencyKeyInsert,
} from "../../domain/entities/idempotency-key.entity.js";
import {
  DuplicateIdempotencyKeyError,
  type IdempotencyRepository,
} from "../../domain/interfaces/idempotency.repository.js";
import type { UnitOfWorkContext } from "../../domain/interfaces/unit-of-work.js";

/**
 * Prisma adapter for `IdempotencyRepository`.
 *
 * The replay key is `(userId, key)` — `@@unique([userId, key])` enforces
 * uniqueness at the DB level. The adapter exposes `create(input)` (atomic
 * insert that throws `DuplicateIdempotencyKeyError` on a `@@unique`
 * conflict) instead of the prior `upsert(input)` (last-writer-wins via
 * Postgres `ON CONFLICT DO UPDATE`).
 *
 * The race fix is documented in the port JSDoc: two parallel first-call
 * requests with the same `(userId, key)` race on the unique index;
 * exactly one wins the insert, the other gets `P2002` and falls through
 * to a second-`find` to read the winner's payload. This is the
 * standard first-wins idempotency pattern; PR #3a's
 * `TransactionService.create` wires the catch-and-retry.
 *
 * `find()` is the boundary owner for the `expiresAt > now` check
 * (W4 readability fix from PR #1, commit 46146a7): expired rows return
 * `null` so the service doesn't need to re-check the clock policy.
 *
 * `purgeExpired(now)` is the cron-callable bulk delete (slice 6+
 * schedules a 15-min call).
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
    if (row === null) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return projectIdempotencyKey(row);
  }

  async create(input: IdempotencyKeyInsert, tx?: UnitOfWorkContext): Promise<IdempotencyKey> {
    try {
      const db = (tx?.tx as PrismaClient | undefined) ?? this.prisma;
      const row = await db.idempotencyKey.create({
        data: {
          key: input.key,
          userId: input.userId,
          requestFingerprint: input.requestFingerprint,
          // The service is responsible for JSON-safety (no class instances,
          // no circular refs, no BigInt) before reaching the adapter;
          // that contract lives on `IdempotencyKeyInsert`.
          responsePayload: input.responsePayload as Prisma.InputJsonValue,
          responseStatus: input.responseStatus,
          transactionId: input.transactionId,
          expiresAt: input.expiresAt,
        },
      });
      return projectIdempotencyKey(row);
    } catch (err) {
      // P2002 → `DuplicateIdempotencyKeyError`. The service catches this
      // and falls through to a second-`find` to read the winner's payload.
      // The shared `isPrismaUniqueViolation` helper handles both
      // `string` (single-field `@@unique(col)`) and `string[]` (compound
      // `@@unique([a, b])`) shapes for `meta.target`. The
      // `@@unique([userId, key])` constraint emits the array form
      // `["userId", "key"]`; passing either column name matches.
      if (isPrismaUniqueViolation(err, "userId")) {
        throw new DuplicateIdempotencyKeyError(input.userId, input.key);
      }
      throw err;
    }
  }

  async purgeExpired(now: Date, tx?: UnitOfWorkContext): Promise<number> {
    const db = (tx?.tx as PrismaClient | undefined) ?? this.prisma;
    const result = await db.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }
}

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

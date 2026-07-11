import type { IdempotencyKey, IdempotencyKeyInsert } from "../entities/idempotency-key.entity.js";
import type { UnitOfWorkContext } from "./unit-of-work.js";

/**
 * Domain port for the `IdempotencyKey` table. Per design §5.4 and
 * D-TX-1, this table backs the `Idempotency-Key` request header on
 * `POST /transactions`: a replay with the same `(userId, key)` and
 * matching fingerprint returns the cached response; a replay with a
 * different fingerprint returns `409 Conflict`
 * (`IDEMPOTENCY_KEY_REUSED`).
 */
export interface IdempotencyRepository {
  /**
   * Look up an idempotency record by `(userId, key)`. Returns `null`
   * if no record exists. The adapter also returns `null` for records
   * whose `expiresAt <= now` — expiry is a clock-policy the service
   * does NOT need to re-check at the call site. (This matches the
   * boundary discipline on `CategoryRepository.findById` — the
   * repository owns the `deletedAt IS NULL` filter rather than
   * pushing it to every caller. The cron-driven purge remains a
   * separate, operational concern.)
   */
  find(userId: string, key: string): Promise<IdempotencyKey | null>;

  /**
   * Atomically insert a new idempotency record.
   *
   * First-wins semantics: if a row with the same `(userId, key)`
   * already exists, the adapter throws a `DuplicateIdempotencyKeyError`
   * (translated from Prisma's `P2002` unique-constraint violation).
   * The service pattern is:
   *
   *   const cached = await repo.find(userId, key);
   *   if (cached) return cached;
   *   try {
   *     const inserted = await repo.create(input);
   *     return inserted;
   *   } catch (err) {
   *     if (err instanceof DuplicateIdempotencyKeyError) {
   *       // Concurrent first-call won the race; return its cached
   *       // payload via a second find.
   *       const winner = await repo.find(userId, key);
   *       if (winner) return winner;
   *     }
   *     throw err;
   *   }
   *
   * The atomic `create` (instead of an `upsert`) closes the
   * last-writer-wins race that the prior `upsert` exposed. Two
   * parallel first-call requests with the same key race on
   * `@@unique([userId, key])`; exactly one wins, the other gets
   * `DuplicateIdempotencyKeyError` and falls through to the
   * second-`find` to read the winner's payload.
   */
  create(input: IdempotencyKeyInsert, tx?: UnitOfWorkContext): Promise<IdempotencyKey>;

  /**
   * Purge expired rows. Returns the count of rows deleted. Called by
   * the `IdempotencyKeyPurgeService` cron (PR #3 + slice 6), default
   * interval 15 min. The default slice does not ship an external
   * scheduler; the cron is in-process.
   */
  purgeExpired(now: Date): Promise<number>;
}

/**
 * Raised by `IdempotencyRepository.create` when a row with the same
 * `(userId, key)` already exists. Translated from Prisma's `P2002`
 * unique-constraint violation. The service catches this and falls
 * through to a second-`find` to read the winner's payload.
 */
export class DuplicateIdempotencyKeyError extends Error {
  constructor(
    public readonly userId: string,
    public readonly key: string,
  ) {
    super(`Idempotency key "${key}" already exists for user "${userId}"`);
    this.name = "DuplicateIdempotencyKeyError";
  }
}

import type {
  IdempotencyKey,
  IdempotencyKeyInsert,
} from "../entities/idempotency-key.entity.js";

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
   * if no record exists OR the record is past its `expiresAt`. The
   * caller is expected to check `expiresAt > now` and treat an
   * expired record as a miss (the cron-driven purge is a separate
   * concern).
   */
  find(userId: string, key: string): Promise<IdempotencyKey | null>;

  /**
   * Insert or update the idempotency record. On unique-key conflict
   * (`@@unique([userId, key])`), the adapter uses
   * `INSERT ... ON CONFLICT DO UPDATE` semantics so two simultaneous
   * first-call requests with the same key do not double-write.
   */
  upsert(input: IdempotencyKeyInsert): Promise<void>;

  /**
   * Purge expired rows. Returns the count of rows deleted. Called by
   * the `IdempotencyKeyPurgeService` cron (PR #3 + slice 6), default
   * interval 15 min. The default slice does not ship an external
   * scheduler; the cron is in-process.
   */
  purgeExpired(now: Date): Promise<number>;
}
/**
 * Domain entity: `IdempotencyKey`.
 *
 * Mirrors the `IdempotencyKey` model in
 * `libs/core/database/prisma/schema.prisma`. Stores the response the
 * server returned for the first `POST /transactions` call under a given
 * `(userId, key)` pair (D-TX-1; design §5.4) so a replay returns the
 * cached payload with the cached status code instead of duplicating
 * the side effect.
 *
 * `requestFingerprint` is the SHA-256 of the canonical request payload.
 * A replay with the same `(userId, key)` but a different fingerprint
 * is a 409 (`IDEMPOTENCY_KEY_REUSED`) — fingerprint-reuse with a
 * different body is a client error, not a retry.
 *
 * `expiresAt = now + 1h` on insert; the
 * `IdempotencyRepository.purgeExpired(now)` cron (PR #3 + slice 6)
 * reaps expired rows. After reaping, the key is treated as fresh.
 */
export interface IdempotencyKey {
  readonly id: string;
  readonly key: string;
  readonly userId: string;
  readonly requestFingerprint: string;
  /** Prisma `Json` column; caller treats as opaque payload bytes. */
  readonly responsePayload: unknown;
  readonly responseStatus: number;
  readonly transactionId: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

/**
 * Insert input for `IdempotencyRepository.upsert`. The service writes
 * one row per successful first-call response, with `expiresAt` set to
 * `now + ttlMs`.
 */
export interface IdempotencyKeyInsert {
  readonly key: string;
  readonly userId: string;
  readonly requestFingerprint: string;
  readonly responsePayload: unknown;
  readonly responseStatus: number;
  readonly transactionId: string | null;
  readonly expiresAt: Date;
}

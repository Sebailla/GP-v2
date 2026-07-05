/**
 * Domain port for the `PasswordResetToken` persistence boundary.
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/design.md`
 * §4.1 (`PasswordResetService` — `requestReset` mints + persists a
 * token, `consumeReset` validates + consumes the token) and §5.1
 * (`PasswordResetToken` table schema with `tokenHash` UNIQUE index).
 *
 * The port owns the **token-hash-only** invariant: domain code NEVER
 * sees or persists the raw token, only its `sha256(rawToken)` digest.
 * `requestReset` mints the raw token (callers — the future dev
 * mailbox — read it from the dispatched event payload) and calls
 * `create({ userId, tokenHash, expiresAt })` with the hash; `consumeReset`
 * hashes the inbound `rawToken` itself and calls `findByHash(hash)` so
 * the raw token never crosses the port boundary in either direction.
 *
 * Methods:
 *  - `create({ userId, tokenHash, expiresAt })`: persist a new reset
 *    token row. Returns the public row shape (id, userId, tokenHash,
 *    expiresAt, consumedAt) for tests. Production callers can
 *    discard the return value.
 *  - `findByHash(tokenHash)`: lookup the row matching a token hash.
 *    Returns `null` when no row matches (consumeReset translates this
 *    to the same generic `INVALID_RESET_TOKEN` as expired/consumed
 *    so there is no enumeration side-channel).
 *  - `markConsumed(tokenHash, consumedAt)`: mark the row consumed.
 *    Idempotent — a no-op when no row matches (consumeReset already
 *    short-circuited before reaching here on consumed/expired/unknown).
 *
 * Slice 3 batch 4 ships the interface and the `PrismaPasswordReset
 * TokenRepository` adapter (in `infrastructure/repositories/`). The
 * adapter is the third `@core/database` integration after
 * `PrismaUserRepository`.
 */

/**
 * Minimal `PasswordResetToken` projection returned by the port. The
 * `tokenHash` is intentionally exposed at this layer — it is the
 * lookup key, and `sha256` is one-way; storing the hash does not
 * compromise the raw token. The raw token NEVER crosses this boundary.
 */
export interface PasswordResetTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  /** `null` until the token is consumed by a successful `consumeReset`. */
  readonly consumedAt: Date | null;
}

export interface PasswordResetTokenRepository {
  /**
   * Persist a new reset token row. The caller (PasswordResetService
   * — requestReset) hands the hashed token, the user id, and the
   * expiry timestamp (now + 1h per design §4.1).
   */
  create(args: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetTokenRecord>;

  /**
   * Find the token row whose `tokenHash` matches the supplied value.
   * Returns `null` when no row matches. The implementation should
   * enforce the unique index on `tokenHash` (Prisma schema §5.1).
   */
  findByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null>;

  /**
   * Mark a token consumed. Idempotent — silently no-ops when no row
   * matches. The expiry/consumed checks happen at the service layer
   * (PasswordResetService.consumeReset) so the port stays a thin
   * persistence boundary.
   */
  markConsumed(tokenHash: string, consumedAt: Date): Promise<void>;
}

/**
 * Domain port for the Session persistence boundary.
 *
 * Per `openspec/changes/.../design.md` §4.1 (`SessionService` owns
 * `listActiveSessions`, `revokeSession`) and the auth spec's "Sessions
 * List and Revoke" requirement. The slice-wide rule is that business
 * code imports `SessionRepository` (this interface), NOT
 * `prisma.session` directly — keeps the domain unit-testable with
 * in-memory fakes and enforces the dependency direction
 * (`domain ← infrastructure`, never the reverse).
 *
 * The port is delivered in slice 3 batch 6 (brief T3.6b) before the
 * NestJS controller (T3.6) wires it at the DI boundary. The prior
 * `SessionService` (slice 3 batch 2) called `prisma.session.*`
 * directly; the slice 3 batch 6 REFACTOR sub-task migrates that
 * service to this port.
 *
 * Methods:
 *  - `listActive(userId)`: list every unexpired session owned by the
 *    user. Used by `GET /auth/sessions`.
 *  - `findByToken(token)`: look up a session row by its token. Used by
 *    `SessionService.getCurrentUser` (session-token-decoded JWT
 *    validation). Returns `null` on miss.
 *  - `revokeByToken(token)`: delete the session row matching the
 *    token. Idempotent — silently no-ops on Prisma P2025 (the row
 *    may already be gone between a prior `findByToken` and this
 *    delete).
 *
 * `SessionRecord` is the canonical DB row projection. The shape is
 * intentionally narrow — the response shape (with `deviceLabel`,
 * `lastActiveAt`) is a future projection at the controller / service
 * boundary and is NOT included here. The Prisma column set may grow;
 * projections stay in the adapter so renames only touch that file.
 */

/**
 * Minimal Session projection returned by `SessionRepository` reads.
 *
 * `expires` is a `Date` — Prisma returns dates as Date objects, and
 * callers (the SessionService expiry check, the controller) treat it
 * as such.
 */
export interface SessionRecord {
  readonly id: string;
  readonly sessionToken: string;
  readonly userId: string;
  readonly expires: Date;
}

export interface SessionRepository {
  /**
   * List the active sessions for the given user. "Active" means
   * `expires > now` (i.e., the session has not yet expired). Expired
   * sessions are pruned by a separate cron / cleanup job (not in this
   * slice).
   */
  listActive(userId: string): Promise<SessionRecord[]>;

  /**
   * Look up a session row by its token. Returns `null` when no row
   * matches.
   */
  findByToken(token: string): Promise<SessionRecord | null>;

  /**
   * Delete the session row matching the supplied token. Idempotent —
   * silently no-ops on Prisma P2025 (the row was already deleted
   * between a prior `findByToken` and the delete). Other Prisma
   * errors propagate.
   */
  revokeByToken(token: string): Promise<void>;
}

import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";

import { AuthError } from "./errors.js";

// Re-export the error classes so consumers (tests, the barrel `src/index.ts`)
// can import the whole SessionService surface from a single path.
// Mirrors the auth-service.ts re-export pattern.
export { AuthError } from "./errors.js";
export type { AuthErrorCode } from "./errors.js";

/**
 * SessionService — slice 3 batch 2 (brief T3.4 GREEN).
 *
 * Thin domain layer that owns the Session lifecycle lookups and
 * mutations. This slice ships the lookup primitive (`getCurrentUser`)
 * plus the two revoke surfaces (`revokeSession`, `revokeAllSessions`).
 * NextAuth integration (the actual adapter call sites) lands in slice 3
 * batch 3 — this service is the seam the adapter will call into.
 *
 * Per design §4.1 the broader SessionService also exposes
 * `listActiveSessions(userId)` and `purgeExpired()`. Those are NOT
 * shipped in batch 2:
 *  - listActiveSessions is consumed by the slice-4 sessions UI through
 *    a controller endpoint (slice 3 batch 3+ wires the controller).
 *  - purgeExpired runs as a NestJS cron task in slice 5+.
 * Adding them now would inflate the slice without a caller.
 *
 * Boundary contract (per @core/config style):
 *   - Translate Prisma error codes at the boundary:
 *       P2025 ("Record to delete does not exist") → AuthError('INVALID_SESSION')
 *   - Translate domain time semantics:
 *       expires <= now → AuthError('SESSION_EXPIRED')
 *   - All other Prisma errors propagate unchanged — the application
 *     layer (controllers) is responsible for log-and-rethrow.
 */

export type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

/**
 * Type-guard for Prisma's "record not found" error (P2025).
 *
 * Prisma 7 throws `PrismaClientKnownRequestError` with `code: 'P2025'`
 * when a `delete` or `update` finds no matching row. We avoid importing
 * the Prisma error class directly so this service stays loosely coupled
 * to the Prisma version; the `code` field is stable across Prisma 6/7.
 */
function isPrismaNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2025"
  );
}

export class SessionService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? defaultPrisma;
  }

  /**
   * Look up the user behind a session token. Returns the public
   * `CurrentUser` projection (id / email / role) on success.
   *
   * Errors:
   *  - AuthError('INVALID_SESSION') — no row matches the sessionToken.
   *  - AuthError('SESSION_EXPIRED') — row exists but `expires <= now`.
   *
   * `expires.getTime() <= Date.now()` is an inclusive boundary: a
   * session whose expiry is exactly `now` is considered expired.
   * This avoids the race where a request that arrives at `t == expires`
   * is served a stale session.
   */
  async getCurrentUser(sessionToken: string): Promise<CurrentUser> {
    const session = await this.prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });
    if (session === null) {
      throw new AuthError("INVALID_SESSION");
    }
    if (session.expires.getTime() <= Date.now()) {
      throw new AuthError("SESSION_EXPIRED");
    }
    return {
      id: session.user.id,
      email: session.user.email,
      role: String(session.user.role),
    };
  }

  /**
   * Revoke a single session by its token. Returns void on success.
   *
   * Errors:
   *  - AuthError('INVALID_SESSION') — no row matches the sessionToken.
   *    Prisma rejects with P2025; the boundary translates it.
   *  - Other Prisma errors propagate unchanged.
   */
  async revokeSession(sessionToken: string): Promise<void> {
    try {
      await this.prisma.session.delete({
        where: { sessionToken },
      });
    } catch (err) {
      if (isPrismaNotFoundError(err)) {
        throw new AuthError("INVALID_SESSION");
      }
      throw err;
    }
  }

  /**
   * Revoke every session for the given user. Returns the count of
   * revoked sessions (0 when the user had none — this is NOT an
   * error; revokeAllSessions is idempotent).
   *
   * This is the "log out everywhere" primitive: a user who suspects
   * their account is compromised calls revokeAllSessions on their own
   * userId, and the NextAuth session callback (slice 3 batch 3+) will
   * reject the current request because its session row is gone.
   */
  async revokeAllSessions(userId: string): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { userId },
    });
    return result.count;
  }
}
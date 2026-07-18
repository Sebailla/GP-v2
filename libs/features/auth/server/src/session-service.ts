import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";
import type { DomainEvent } from "@core/events";

import { AuthError } from "./errors.js";
import type { SessionRepository } from "./domain/interfaces/session.repository.js";
import { PrismaSessionRepository } from "./infrastructure/repositories/prisma-session.repository.js";
import type { UserRepository } from "./domain/interfaces/user.repository.js";
import { PrismaUserRepository } from "./infrastructure/repositories/prisma-user.repository.js";
import type { AuthEventDispatcher } from "./events.js";

// Re-export the error classes so consumers (tests, the barrel `src/index.ts`)
// can import the whole SessionService surface from a single path.
// Mirrors the auth-service.ts re-export pattern.
export { AuthError } from "./errors.js";
export type { AuthErrorCode } from "./errors.js";

/**
 * SessionService — slice 3 batch 2 (brief T3.4 GREEN) + slice 3 batch 6
 * (UserRepository + SessionRepository ports wired in; `wireAuthEvents`
 * monkey-patch wrapper dropped — Pattern A dispatcher adopted).
 *
 * Thin domain layer that owns the Session lifecycle lookups and
 * mutations. Per design §4.1 the broader SessionService also exposes
 * `listActiveSessions(userId)` and `purgeExpired()`; both land in
 * slice 3 batch 6+ (T3.6 NestJS controller exposes
 * `listActiveSessions`; cron registration of `deleteExpired` ships
 * with the F4 fix).
 *
 * Boundary contract (per @core/config style):
 *   - Translate domain time semantics at the boundary:
 *       expires <= now → AuthError('SESSION_EXPIRED')
 *   - The SessionRepository port handles Prisma P2025 idempotently
 *     (silently no-ops on missing row — see
 *     PrismaSessionRepository.revokeByToken).
 *   - Other persistence errors propagate unchanged — the application
 *     layer (controllers) is responsible for log-and-rethrow.
 *
 * Persistence ports (per architecture-standards skill: services depend
 * on the port, NOT the concrete Prisma client):
 *  - SessionRepository: read side (`findByToken`, `listActive`) + the
 *    `revokeByToken` write. Slice 3 batch 6 (T3.6b) ships the port +
 *    adapter; this service uses the port for session reads + the
 *    single-session revoke.
 *  - UserRepository: read side (`findById`) for the user projection
 *    inside `getCurrentUser`. The session row alone doesn't carry the
 *    user; the service composes `sessionRepo.findByToken` +
 *    `userRepo.findById` to produce the `CurrentUser` projection.
 *  - PrismaClient (direct): `revokeAllSessions` uses
 *    `prisma.session.deleteMany` because the SessionRepository port
 *    does not expose a bulk-delete surface (out of scope per the
 *    brief — 3 methods listed: listActive, findByToken, revokeByToken).
 *    Future batches may add `revokeAllForUser` to the port when a
 *    controller-level "log out everywhere" affordance lands.
 *
 * Pattern A dispatch (canonical design §4.1): the dispatcher is taken
 * as the 4th constructor argument and dispatched directly from
 * `revokeSession`. The previous `wireAuthEvents` monkey-patch
 * wrapper (slice 3 batch 3) is removed — there is no longer a global
 * "wrap the service after construction" step.
 */

export type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

export class SessionService {
  private readonly prisma: PrismaClient;
  private readonly sessionRepo: SessionRepository;
  private readonly userRepo: UserRepository;
  private readonly dispatcher: AuthEventDispatcher;

  constructor(
    prisma?: PrismaClient,
    sessionRepo?: SessionRepository,
    userRepo?: UserRepository,
    dispatcher?: AuthEventDispatcher,
  ) {
    const client = prisma ?? defaultPrisma;
    this.prisma = client;
    this.sessionRepo = sessionRepo ?? new PrismaSessionRepository(client);
    this.userRepo = userRepo ?? new PrismaUserRepository(client);
    // Pattern A: dispatcher is REQUIRED. F8 guard — eager failure
    // for missing dispatcher (mirror of PasswordResetService's F8).
    if (typeof dispatcher !== "function") {
      throw new TypeError(
        `SessionService requires an AuthEventDispatcher (a function); received ${typeof dispatcher === "undefined" ? "undefined" : String(dispatcher)}.`,
      );
    }
    this.dispatcher = dispatcher;
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
    // Slice 3 batch 6: routes the session read through the
    // SessionRepository port (T3.6b). The user projection is
    // resolved separately through the UserRepository port (the
    // session row alone doesn't carry user fields — the Prisma
    // `include` join is replaced by explicit port reads, which
    // matches the architecture-standards dependency direction).
    const session = await this.sessionRepo.findByToken(sessionToken);
    if (session === null) {
      throw new AuthError("INVALID_SESSION");
    }
    if (session.expires.getTime() <= Date.now()) {
      throw new AuthError("SESSION_EXPIRED");
    }
    const user = await this.userRepo.findById(session.userId);
    if (user === null) {
      // Session row exists but the FK owner was hard-deleted (or the
      // FK was severed by an admin). The session is functionally
      // orphaned — same observable failure as a missing token.
      throw new AuthError("INVALID_SESSION");
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  /**
   * Revoke a single session by its token. Returns void on success.
   *
   * Pattern A dispatch (canonical design §4.1): when `userId` is
   * supplied, this method deletes the session row through the
   * SessionRepository port and dispatches the
   * `auth.session.revoked` event directly. The userId is recovered
   * by the controller from the JWT-decoded session (slice 3 batch 6
   * T3.6 NestJS `JwtAuthGuard`) before invoking this method; the
   * internal `getCurrentUser` round-trip the previous
   * `wireAuthEvents` wrapper performed is no longer needed.
   *
   * When called WITHOUT a userId (e.g., from the bare
   * `revokeSession(token)` signature for tests / cleanup paths),
   * the delete still happens but the event is not dispatched —
   * matching the design's requirement that the event carries the
   * userId for the dev mailbox routing.
   *
   * Slice 3 batch 6: routes through the
   * `SessionRepository.revokeByToken` port. The adapter swallows
   * Prisma P2025 (idempotent — a missing session is a no-op rather
   * than an error). The previous direct `prisma.session.delete`
   * raised P2025 which this service then translated to
   * AuthError('INVALID_SESSION'); that path is removed because the
   * port now owns the idempotency contract.
   */
  async revokeSession(sessionToken: string, userId?: string): Promise<void> {
    await this.sessionRepo.revokeByToken(sessionToken);
    if (userId === undefined) {
      return;
    }
    const event: DomainEvent = {
      name: "auth.session.revoked",
      userId,
      payload: {
        userId,
        sessionId: sessionToken,
        revokedAt: new Date(),
      },
      occurredAt: new Date(),
    };
    await this.dispatcher(event);
  }

  /**
   * Revoke every session for the given user. Returns the count of
   * revoked sessions (0 when the user had none — this is NOT an
   * error; revokeAllSessions is idempotent).
   *
   * Stays as a direct `prisma.session.deleteMany` call — the
   * SessionRepository port does not yet expose a bulk-delete surface
   * (the brief lists 3 methods: listActive, findByToken, revokeByToken).
   * Dispatches NO event by design (a controller-level "log out
   * everywhere" affordance lands when the port gains
   * `revokeAllForUser`).
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

  // ---------------------------------------------------------------------------
  // M3 ADMIN SURFACE (module-3-superadmin — task 2.2 GREEN)
  //
  // Per `openspec/changes/module-3-superadmin/design.md` §4
  // (SessionService rows) and the spec's "Session List by User" /
  // "Revoke Single Session" / "Revoke All Sessions for User"
  // requirements. These three methods are the server-side primitives
  // behind the NestJS AdminController (PR #3). They pair the data
  // path (Prisma) with the audit path (`auth.session.revoked` event)
  // so the controller stays HTTP-agnostic.
  //
  // The payload widening from the slice-3 `{ userId, sessionId,
  // revokedAt }` to the M3 `{ actorId, targetUserId, sessionId,
  // ipAddress, userAgent, revokedAt, count? }` matches design D3 +
  // §3.2. The TS view of the widening lives at
  // `auth.events.ts` (`AuthSessionRevokedPayload`); the dispatcher
  // casts to that type at the receiving end.
  //
  // Idempotency:
  //   - `revoke` reads the row first so it can emit the event AFTER
  //     the delete; a missing row is a silent no-op (no event).
  //   - `revokeAll` always emits one event (even with `count=0`) so
  //     the audit trail captures every admin attempt, including
  //     "nothing to revoke" cases.
  // ---------------------------------------------------------------------------

  /**
   * List every session owned by the user, sorted DESC by the
   * `lastActiveAt` proxy. Per spec "Session List by User", this is
   * the read path behind `GET /admin/sessions?userId=...`.
   *
   * Deviation (PR #2 known follow-up, M4 scope): the Session model
   * has no `lastActiveAt` column yet. The GREEN implementation sorts
   * on `expires DESC` — the closest available proxy. When the M4
   * last-active column lands, this query swaps to that column; the
   * public contract (sorted DESC, same projection shape) does not
   * change. The TS return shape intentionally mirrors the existing
   * `listActiveSessions` projection (`SessionRecord[]`) so the
   * controller layer can project to the spec's response shape
   * (id / userId / createdAt / lastActiveAt / userAgent / ipAddress)
   * without re-receiving the row from Prisma.
   */
  async list(userId: string): Promise<
    ReadonlyArray<{
      readonly id: string;
      readonly sessionToken: string;
      readonly userId: string;
      readonly expires: Date;
    }>
  > {
    const rows = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { expires: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      sessionToken: row.sessionToken,
      userId: row.userId,
      expires: row.expires,
    }));
  }

  /**
   * Revoke a single session by its PRIMARY KEY (NOT by token — the
   * controller resolves the token→id before calling). The admin
   * single-session path lives here; the slice-3 user-self-revoke
   * path stays on `revokeSession(token, userId)` and emits the
   * narrower slice-3 payload.
   *
   * Idempotent: a missing row is a silent no-op (no event). The
   * row is read BEFORE the delete so the event payload always
   * carries the targetUserId — without the read, the dispatch would
   * race the delete.
   *
   * IP + UA are recorded exactly as captured at the controller
   * boundary (per design D3); the service does not redact them.
   * Pino `[ip]` redaction is applied at the LOG layer, not here.
   */
  async revoke(
    sessionId: string,
    actorId: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const row = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (row === null) {
      return;
    }
    await this.prisma.session.delete({ where: { id: sessionId } });
    const targetUserId = row.userId;
    const event: DomainEvent = {
      name: "auth.session.revoked",
      userId: actorId,
      payload: {
        actorId,
        targetUserId,
        sessionId,
        ipAddress,
        userAgent,
        revokedAt: new Date(),
      },
      occurredAt: new Date(),
    };
    await this.dispatcher(event);
  }

  /**
   * Revoke every session owned by the user. Returns the count. Emits
   * ONE admin event (`auth.session.revoked` with `count` in the
   * payload) — the singleton event is the audit anchor, not N
   * per-session events (which would flood the trail).
   *
   * Always emits, even when `count === 0` — the audit trail captures
   * "admin tried, user had nothing". Per design §3.2 and the
   * `auth-server-surface` spec's `Revoke All Sessions for User →
   * 0 sessions → 204, revokedCount: 0` scenario.
   */
  async revokeAll(
    userId: string,
    actorId: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { userId },
    });
    const event: DomainEvent = {
      name: "auth.session.revoked",
      userId: actorId,
      payload: {
        actorId,
        targetUserId: userId,
        sessionId: "bulk",
        ipAddress,
        userAgent,
        count: result.count,
        revokedAt: new Date(),
      },
      occurredAt: new Date(),
    };
    await this.dispatcher(event);
    return result.count;
  }

  /**
   * List active (unexpired) sessions for the given user.
   *
   * Slice 3 batch 6 (T3.6 NestJS controller): the controller's
   * `GET /auth/sessions` endpoint calls this; the response is the
   * client-facing `SessionListResponse` projection (id, deviceLabel,
   * lastActiveAt). The projection onto `deviceLabel` /
   * `lastActiveAt` lives at the controller boundary, NOT in this
   * service — this method returns the SessionRecord projection from
   * the port, which carries enough data for the controller to build
   * the response (the actual device-label derivation is a slice 4
   * concern; for the reference repo the `sessionToken` suffix
   * serves as a stand-in label).
   */
  async listActiveSessions(userId: string): Promise<
    ReadonlyArray<{
      readonly id: string;
      readonly sessionToken: string;
      readonly expires: Date;
    }>
  > {
    return this.sessionRepo.listActive(userId);
  }
}

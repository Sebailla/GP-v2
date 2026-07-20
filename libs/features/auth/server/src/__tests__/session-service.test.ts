import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for SessionService (slice 3 batch 2 / brief T3.4 RED).
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/design.md` §4.1
 * (SessionService — listActiveSessions, revokeSession, purgeExpired) and
 * the auth spec's "Sessions List and Revoke" requirement.
 *
 * Brief T3.4 renames the surface for this slice:
 *  - `listActiveSessions(userId)` from design §4.1 → NOT shipped in batch 2.
 *      The sessions list UI lands in slice 4 (T4.6), and it consumes
 *      SessionService indirectly through a controller endpoint that
 *      batch 3+ will wire. Batch 2 ships the lookup primitive only.
 *  - `getCurrentUser(sessionToken)` → NEW. Single-session lookup, used
 *      by the NextAuth session callback (slice 3 batch 3+).
 *  - `revokeSession(sessionToken)` from design §4.1 → kept.
 *  - `revokeAllSessions(userId)` → NEW. Bulk revoke; future batches wire
 *      it to a "log out everywhere" affordance in the sessions UI.
 *  - `purgeExpired()` from design §4.1 → NOT shipped in batch 2. Scheduled
 *      cleanup runs as a NestJS cron task (slice 5+).
 *
 * **NextAuth integration is OUT OF SCOPE** for this batch — the
 * service is a thin domain layer; the NextAuth adapter wiring lands in
 * slice 3 batch 3.
 *
 * Public contract pinned by these tests:
 *  - getCurrentUser(sessionToken) → returns { id, email, role } of the
 *      user when token is valid and not expired.
 *  - getCurrentUser with unknown token → throws AuthError('INVALID_SESSION').
 *  - getCurrentUser with expired session (expires < now) →
 *      throws AuthError('SESSION_EXPIRED').
 *  - revokeSession(sessionToken) → deletes the session row, returns void.
 *  - revokeSession with unknown token → throws AuthError('INVALID_SESSION')
 *      (Prisma P2025 is translated at the boundary).
 *  - revokeAllSessions(userId) → deletes all sessions for the user,
 *      returns the count of revoked sessions.
 *
 * RED state: session-service.js does NOT exist yet. The dynamic imports
 * inside each `it` block throw ERR_MODULE_NOT_FOUND. Every test fails
 * for the expected "feature missing" reason.
 *
 * The Prisma singleton from @core/database is mocked so the suite runs
 * in the sandbox without a real database.
 */

vi.mock("@core/database", () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      // M4 (module-4-privacy — task 1.6): getCurrentUser now performs
      // a coalesce UPDATE on `Session.lastActiveAt` per design D1.
      // The mock must expose `session.update` so the production code
      // can call it without throwing.
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@core/database";

import type { AuthEventDispatcher } from "../events.js";

/**
 * Slice 3 batch 6 (drop-wireauth-events): SessionService now takes
 * the dispatcher as the 4th constructor argument. The existing
 * session-service unit tests don't exercise dispatch on the paths
 * under test (the wireAuthEvents wrapper used to do this); they
 * pass a `vi.fn()` so the F8 guard accepts the constructor call
 * and Pattern A is wired in.
 */
const noopDispatcher = vi.fn<AuthEventDispatcher>();

describe("SessionService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getCurrentUser", () => {
    it("returns { id, email, role } when sessionToken is valid and not expired", async () => {
      const { SessionService } = await import("../session-service.js");

      // Slice 3 batch 6 (refactor-sessionservice-port): the user
      // projection is resolved via the UserRepository port, not
      // the Prisma `include` join. Mock both ports' backing
      // prisma calls.
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: "session-1",
        sessionToken: "valid-token",
        userId: "user-1",
        expires: new Date(Date.now() + 60_000),
      } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-1",
        email: "alice@example.com",
        role: "USER" as const,
        hashedPassword: "$2a$10$some-hash",
      } as never);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      const result = await service.getCurrentUser("valid-token");

      expect(result).toEqual({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
      });
      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { sessionToken: "valid-token" },
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });
    });

    it("throws AuthError('INVALID_SESSION') when sessionToken is unknown", async () => {
      const { SessionService, AuthError } = await import("../session-service.js");
      vi.mocked(prisma.session.findUnique).mockResolvedValue(null);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);

      let caught: unknown;
      try {
        await service.getCurrentUser("unknown-token");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AuthError);
      expect((caught as InstanceType<typeof AuthError>).code).toBe("INVALID_SESSION");
    });

    it("throws AuthError('SESSION_EXPIRED') when session.expires is in the past", async () => {
      const { SessionService, AuthError } = await import("../session-service.js");
      // Slice 3 batch 6: no `user` join; SessionRepository returns
      // the bare SessionRecord.
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: "session-1",
        sessionToken: "expired-token",
        userId: "user-1",
        expires: new Date(Date.now() - 1000),
      } as never);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);

      let caught: unknown;
      try {
        await service.getCurrentUser("expired-token");
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AuthError);
      expect((caught as InstanceType<typeof AuthError>).code).toBe("SESSION_EXPIRED");
    });
  });

  describe("revokeSession", () => {
    it("deletes the session row and returns void when token is valid", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      const result = await service.revokeSession("valid-token");

      expect(result).toBeUndefined();
      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { sessionToken: "valid-token" },
      });
    });

    it("silently no-ops on missing session (Prisma P2025 → idempotent post-condition via SessionRepository port)", async () => {
      const { SessionService } = await import("../session-service.js");
      // Slice 3 batch 6 (refactor-sessionservice-port): the port
      // \`revokeByToken\` swallows Prisma P2025 — the service
      // returns void on a missing token. The previous direct
      // prisma.session.delete code path translated P2025 to
      // AuthError('INVALID_SESSION'); that translation moves to
      // the ADAPTER (P2025 idempotency) under the new port.
      const prismaError = new Error("Record to delete does not exist.");
      (prismaError as Error & { code?: string }).code = "P2025";
      vi.mocked(prisma.session.delete).mockRejectedValue(prismaError);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);

      await expect(service.revokeSession("unknown-token")).resolves.toBeUndefined();
      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { sessionToken: "unknown-token" },
      });
    });
  });

  describe("revokeAllSessions", () => {
    it("deletes all sessions for the given userId and returns the count", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 3 });

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      const count = await service.revokeAllSessions("user-1");

      expect(count).toBe(3);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });

    it("returns 0 when the user has no active sessions (NOT an error)", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 0 });

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      const count = await service.revokeAllSessions("user-no-sessions");

      expect(count).toBe(0);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-no-sessions" },
      });
    });
  });
});

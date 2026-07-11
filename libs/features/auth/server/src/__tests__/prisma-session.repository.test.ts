import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for `PrismaSessionRepository` (slice 3 batch 6 — brief T3.6b
 * RED).
 *
 * Per `openspec/changes/.../design.md` §4.1
 * (`SessionService.listActiveSessions`, `revokeSession`) the auth slice
 * needs a `SessionRepository` port + Prisma adapter. The adapter is
 * the fourth `@core/database` integration after
 * `PrismaUserRepository` (slice 3 batch 3),
 * `PrismaPasswordResetTokenRepository` (slice 3 batch 4), and the
 * prior Prisma adapter shipped in slice 1/2.
 *
 * Port surface (per `domain/interfaces/session.repository.ts`):
 *  - `listActive(userId): Promise<SessionRecord[]>` — list all
 *    unexpired sessions owned by the user.
 *  - `findByToken(token: string): Promise<SessionRecord | null>` —
 *    lookup by the session token. Returns null on miss.
 *  - `revokeByToken(token: string): Promise<void>` — delete the row
 *    matching the token. Idempotent — silently no-ops on Prisma
 *    P2025 (row not found).
 *
 * RED state: the port + adapter do NOT exist yet. Every test fails
 * for the expected "feature missing" reason.
 *
 * Test pattern (mirrors the existing convention in this package):
 * `vi.mock('@core/database')` stubs the singleton; tests assert
 * Prisma call shape + projection onto the `SessionRecord` shape.
 */

vi.mock("@core/database", () => ({
  prisma: {
    session: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@core/database";

describe("PrismaSessionRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listActive", () => {
    it("returns the active sessions for the user, projected onto the SessionRecord shape", async () => {
      const { PrismaSessionRepository } =
        await import("../infrastructure/repositories/prisma-session.repository.js");
      vi.mocked(prisma.session.findMany).mockResolvedValue([
        {
          id: "sess-1",
          sessionToken: "tok-1",
          userId: "user-1",
          expires: new Date(Date.now() + 60_000),
        },
        {
          id: "sess-2",
          sessionToken: "tok-2",
          userId: "user-1",
          expires: new Date(Date.now() + 120_000),
        },
      ] as never);

      const repo = new PrismaSessionRepository();
      const records = await repo.listActive("user-1");

      expect(prisma.session.findMany).toHaveBeenCalledTimes(1);
      const callArg = (
        vi.mocked(prisma.session.findMany).mock.calls[0] as unknown as [
          { where: { userId: string; expires: { gt: Date } } },
        ]
      )[0];
      expect(callArg.where.userId).toBe("user-1");
      // The Prisma `where.expires.gt` filter must be a Date. We do NOT
      // assert on the exact timestamp (testing-standards anti-pattern
      // \u2014 \u201cno asserting on timestamps\u201d); we assert the SHAPE of the
      // filter and that the value is a Date in the future-relative
      // bucket.
      expect(callArg.where.expires.gt).toBeInstanceOf(Date);
      expect(callArg.where.expires.gt.getTime()).toBeGreaterThanOrEqual(Date.now() - 5_000);

      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({
        id: "sess-1",
        sessionToken: "tok-1",
        userId: "user-1",
      });
      expect(records[0]!.expires).toBeInstanceOf(Date);
    });

    it("returns an empty array when the user has no active sessions (NOT an error)", async () => {
      const { PrismaSessionRepository } =
        await import("../infrastructure/repositories/prisma-session.repository.js");
      vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);

      const repo = new PrismaSessionRepository();
      const records = await repo.listActive("user-no-sessions");

      expect(records).toEqual([]);
    });
  });

  describe("findByToken", () => {
    it("returns the row matching the token, projected onto SessionRecord", async () => {
      const { PrismaSessionRepository } =
        await import("../infrastructure/repositories/prisma-session.repository.js");
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: "sess-1",
        sessionToken: "valid-token",
        userId: "user-1",
        expires: new Date(Date.now() + 60_000),
      } as never);

      const repo = new PrismaSessionRepository();
      const record = await repo.findByToken("valid-token");

      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { sessionToken: "valid-token" },
      });
      expect(record).toMatchObject({
        id: "sess-1",
        sessionToken: "valid-token",
        userId: "user-1",
      });
      expect(record!.expires).toBeInstanceOf(Date);
    });

    it("returns null when no row matches (no enumeration side-channel)", async () => {
      const { PrismaSessionRepository } =
        await import("../infrastructure/repositories/prisma-session.repository.js");
      vi.mocked(prisma.session.findUnique).mockResolvedValue(null as never);

      const repo = new PrismaSessionRepository();
      const record = await repo.findByToken("unknown-token");

      expect(record).toBeNull();
    });
  });

  describe("revokeByToken", () => {
    it("deletes the row matching the token", async () => {
      const { PrismaSessionRepository } =
        await import("../infrastructure/repositories/prisma-session.repository.js");
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);

      const repo = new PrismaSessionRepository();
      await repo.revokeByToken("valid-token");

      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { sessionToken: "valid-token" },
      });
    });

    it("silently no-ops on Prisma P2025 (row already gone) — idempotent post-condition", async () => {
      const { PrismaSessionRepository } =
        await import("../infrastructure/repositories/prisma-session.repository.js");
      const p2025 = new Error("Record to delete does not exist.");
      (p2025 as Error & { code?: string }).code = "P2025";
      vi.mocked(prisma.session.delete).mockRejectedValue(p2025 as never);

      const repo = new PrismaSessionRepository();
      await expect(repo.revokeByToken("orphan-token")).resolves.toBeUndefined();
    });
  });
});

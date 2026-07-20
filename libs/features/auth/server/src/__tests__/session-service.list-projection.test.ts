import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@core/database";

import type { AuthEventDispatcher } from "../events.js";

/**
 * TDD contract for the M4 SessionService.list projection swap
 * (module-4-privacy — task 1.7 RED).
 *
 * Per `openspec/changes/module-4-privacy/design.md` §2 D7 + the
 * `auth-server-surface` spec's "Session List by User" and "Session
 * List Projection" requirements, the list endpoint MUST return:
 *
 *   { id, userId, createdAt, lastActiveAt, userAgent, ipAddress }
 *
 * sorted DESC by `lastActiveAt`, with `lastActiveAt IS NULL` sorting
 * LAST (Postgres default for `ORDER BY column DESC` puts NULLs first,
 * so the projection must push nulls to the tail — Prisma exposes this
 * with `{ lastActiveAt: { sort: "desc", nulls: "last" } }`).
 *
 * The previous M3 projection (`{ id, sessionToken, userId, expires }`)
 * is deprecated; `sessionToken` MUST NOT appear in the response. The
 * M3 ordering proxy `expires DESC` is replaced by `lastActiveAt DESC`.
 *
 * Why a static test against the Prisma `findMany` arg shape (rather
 * than asserting a fully-resolved list): the projection is a pure
 * mapping from the Prisma row to the controller response shape, so
 * the test pins BOTH (a) the SQL contract (WHERE / ORDER BY) and
 * (b) the JS-side shape contract. The controller in PR #2 projects
 * this list to the spec-literal response; PR #1 locks the service
 * surface so the controller has a stable shape to project.
 *
 * Deviation from spec wording on UA/IP columns: those columns are
 * added in the same migration as `lastActiveAt` (task 1.2 — see
 * `schema.prisma` M4 userAgent/ipAddress additions) so the projection
 * can read them.
 *
 * RED state (this file): the projection currently returns
 * `{ id, sessionToken, userId, expires }` (M3) and orders by
 * `expires DESC`. Every assertion fails for the expected reason:
 * the projection lacks `createdAt` / `lastActiveAt` / `userAgent` /
 * `ipAddress`, includes `sessionToken`, and the orderBy is wrong.
 */

vi.mock("@core/database", () => ({
  prisma: {
    session: {
      // M4 task 1.5: getCurrentUser now performs a coalesce UPDATE.
      // findUnique is still exercised on the slice-3 / M3 paths.
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    adminAuditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@core/database";

const noopDispatcher = vi.fn<AuthEventDispatcher>();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async (callback: never) => {
    return (callback as (tx: typeof prisma) => Promise<unknown>)(prisma);
  });
});

async function makeService() {
  const { SessionService } = await import("../session-service.js");
  return new SessionService(prisma, undefined, undefined, noopDispatcher);
}

interface SessionRow {
  id: string;
  sessionToken: string;
  userId: string;
  expires: Date;
  createdAt?: Date;
  lastActiveAt: Date | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

describe("SessionService.list — 6-field spec-literal projection (M4 task 1.7)", () => {
  describe("Prisma query contract", () => {
    it("queries with `orderBy: { lastActiveAt: { sort: 'desc', nulls: 'last' } }`", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      await service.list("u1");

      const call = (
        vi.mocked(prisma.session.findMany).mock.calls[0] as unknown as [
          { where: { userId: string }; orderBy: unknown },
        ]
      )[0];
      expect(call.where).toEqual({ userId: "u1" });
      // The orderBy MUST be `lastActiveAt DESC NULLS LAST` per the
      // spec's "Sort `lastActiveAt IS NULL` last" scenario.
      expect(call.orderBy).toEqual({
        lastActiveAt: { sort: "desc", nulls: "last" },
      });
    });
  });

  describe("projection shape (spec-literal 6-field)", () => {
    it("returns the 6 spec-literal fields and does NOT include sessionToken", async () => {
      const { SessionService } = await import("../session-service.js");
      const rows: SessionRow[] = [
        {
          id: "s-1",
          sessionToken: "t-secret-1",
          userId: "u1",
          expires: new Date("2030-01-01T00:00:00Z"),
          createdAt: new Date("2026-07-01T00:00:00Z"),
          lastActiveAt: new Date("2026-07-18T10:00:00Z"),
          userAgent: "Mozilla/5.0 (s1)",
          ipAddress: "203.0.113.1",
        },
        {
          id: "s-2",
          sessionToken: "t-secret-2",
          userId: "u1",
          expires: new Date("2030-01-02T00:00:00Z"),
          createdAt: new Date("2026-07-02T00:00:00Z"),
          lastActiveAt: null,
          userAgent: null,
          ipAddress: null,
        },
      ];
      vi.mocked(prisma.session.findMany).mockResolvedValue(rows as never);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      const out = await service.list("u1");

      // The projection includes exactly the 6 spec-literal fields:
      // id, userId, createdAt, lastActiveAt, userAgent, ipAddress.
      expect(out).toHaveLength(2);
      const projectedKeys = Object.keys(out[0] as object).sort();
      expect(projectedKeys).toEqual(
        ["createdAt", "id", "ipAddress", "lastActiveAt", "userAgent", "userId"].sort(),
      );
      // sessionToken MUST NOT be in the projection (security boundary).
      expect(out[0]).not.toHaveProperty("sessionToken");
      expect(out[1]).not.toHaveProperty("sessionToken");
    });

    it("preserves lastActiveAt as null when the column is NULL (not coerced to 0)", async () => {
      const { SessionService } = await import("../session-service.js");
      const rows: SessionRow[] = [
        {
          id: "s-orphan",
          sessionToken: "t",
          userId: "u1",
          expires: new Date(),
          createdAt: new Date("2026-07-01T00:00:00Z"),
          lastActiveAt: null,
        },
      ];
      vi.mocked(prisma.session.findMany).mockResolvedValue(rows as never);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      const out = await service.list("u1");

      expect(out[0]).toMatchObject({
        id: "s-orphan",
        userId: "u1",
        lastActiveAt: null,
      });
    });
  });

  describe("behavioral", () => {
    it("returns [] when the user has no sessions", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);

      const service = new SessionService(prisma, undefined, undefined, noopDispatcher);
      const out = await service.list("ghost-user");

      expect(out).toEqual([]);
      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: { userId: "ghost-user" },
        orderBy: { lastActiveAt: { sort: "desc", nulls: "last" } },
      });
    });

    it("does NOT emit any event (list is a read — audit goes on mutate paths only)", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.findMany).mockResolvedValue([] as never);

      const dispatcher = vi.fn<AuthEventDispatcher>();
      const service = new SessionService(prisma, undefined, undefined, dispatcher);

      await service.list("u1");

      expect(dispatcher).not.toHaveBeenCalled();
    });
  });
});

// Silence the unused-helper lint without removing the Prisma widening
// anchor below — the safety cast is intentionally retained for
// consistency with the M3 admin test.
function asPrismaStub(): PrismaClient {
  return prisma as unknown as PrismaClient;
}
void asPrismaStub;

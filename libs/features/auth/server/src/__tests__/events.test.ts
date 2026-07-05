import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for the events wiring (slice 3 batch 3 / brief T3.5 RED).
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/design.md` §4.7
 * (Events emitted: `auth.session.revoked`, `auth.rbac.denied` are the two
 * events this batch wires; `auth.password-reset.requested` and
 * `auth.password-reset.completed` land with `PasswordResetService` in
 * slice 3 batch 4+).
 *
 * The wiring is a `wireAuthEvents(sessionService, rbacService, dispatcher)`
 * function exported from `libs/features/auth/server/src/events.ts`. It
 * uses the **monkey-patch** pattern documented in the brief — pragmatic
 * for this slice; slice 3 batch 4+ refactors the services to dispatch
 * directly (single source of truth, no wrapper around the public method).
 *
 * Two subscriptions pinned by these tests:
 *
 *  1. `SessionService.revokeSession(sessionToken)` →
 *     `auth.session.revoked` with payload
 *     `{ userId, sessionToken, revokedAt: Date }`.
 *
 *  2. `RbacService.can(actor, action, resource)` returning `false` →
 *     `auth.rbac.denied` with payload
 *     `{ userId: actor.id, action, resourceKind: resource.kind, deniedAt: Date }`.
 *
 * RED state: events.js does NOT exist yet. The dynamic imports inside
 * each `it` block throw ERR_MODULE_NOT_FOUND. Every test fails for the
 * expected "feature missing" reason.
 *
 * The Prisma singleton from @core/database is mocked so the suite runs
 * in the sandbox without a real database. `wireAuthEvents` looks up the
 * userId via `sessionService.getCurrentUser(sessionToken)` BEFORE calling
 * `revokeSession` — both prisma calls are mocked per test.
 */

vi.mock("@core/database", () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@core/database";
import type { DomainEvent } from "@core/events";

describe("wireAuthEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("SessionService.revokeSession → auth.session.revoked", () => {
    it("dispatches auth.session.revoked with userId, sessionToken, and revokedAt on a successful revoke", async () => {
      const { SessionService } = await import("../session-service.js");
      const { wireAuthEvents } = await import("../events.js");

      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: "session-1",
        sessionToken: "token-A",
        userId: "user-1",
        expires: new Date(Date.now() + 60_000),
        user: {
          id: "user-1",
          email: "alice@example.com",
          name: "Alice",
          role: "USER" as const,
          hashedPassword: "$2a$10$hash",
          emailVerified: null,
          image: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      } as never);
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);

      const sessionService = new SessionService(prisma);
      const rbacService = new (await import("../rbac-service.js")).RbacService();
      const dispatcher = vi.fn<(event: DomainEvent) => Promise<void>>();

      wireAuthEvents(sessionService, rbacService, dispatcher);

      await sessionService.revokeSession("token-A");

      expect(dispatcher).toHaveBeenCalledTimes(1);
      const dispatched = vi.mocked(dispatcher).mock.calls[0]?.[0] as DomainEvent;
      expect(dispatched.name).toBe("auth.session.revoked");
      expect(dispatched.userId).toBe("user-1");
      expect(dispatched.payload).toMatchObject({
        userId: "user-1",
        sessionToken: "token-A",
      });
      expect(
        (dispatched.payload as { revokedAt: Date }).revokedAt,
      ).toBeInstanceOf(Date);
    });

    it("dispatches multiple events when revokeSession is called multiple times (no swallowing)", async () => {
      const { SessionService } = await import("../session-service.js");
      const { wireAuthEvents } = await import("../events.js");

      // First call: token-X for user-1
      // Second call: token-Y for user-2
      const findUniqueByToken = new Map<string, unknown>([
        [
          "token-X",
          {
            id: "session-X",
            sessionToken: "token-X",
            userId: "user-1",
            expires: new Date(Date.now() + 60_000),
            user: {
              id: "user-1",
              email: "alice@example.com",
              name: "Alice",
              role: "USER" as const,
              hashedPassword: "$2a$10$hash",
              emailVerified: null,
              image: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ],
        [
          "token-Y",
          {
            id: "session-Y",
            sessionToken: "token-Y",
            userId: "user-2",
            expires: new Date(Date.now() + 60_000),
            user: {
              id: "user-2",
              email: "bob@example.com",
              name: "Bob",
              role: "USER" as const,
              hashedPassword: "$2a$10$hash",
              emailVerified: null,
              image: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ],
      ]);
      vi.mocked(prisma.session.findUnique).mockImplementation(async (args: unknown) => {
        const where = (args as { where: { sessionToken: string } }).where;
        return findUniqueByToken.get(where.sessionToken) as never;
      });
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);

      const sessionService = new SessionService(prisma);
      const rbacService = new (await import("../rbac-service.js")).RbacService();
      const dispatcher = vi.fn<(event: DomainEvent) => Promise<void>>();

      wireAuthEvents(sessionService, rbacService, dispatcher);

      await sessionService.revokeSession("token-X");
      await sessionService.revokeSession("token-Y");

      expect(dispatcher).toHaveBeenCalledTimes(2);
      const events = vi.mocked(dispatcher).mock.calls.map((c) => c[0] as DomainEvent);
      expect(events[0]?.name).toBe("auth.session.revoked");
      expect((events[0]?.payload as { userId: string }).userId).toBe("user-1");
      expect((events[0]?.payload as { sessionToken: string }).sessionToken).toBe("token-X");
      expect(events[1]?.name).toBe("auth.session.revoked");
      expect((events[1]?.payload as { userId: string }).userId).toBe("user-2");
      expect((events[1]?.payload as { sessionToken: string }).sessionToken).toBe("token-Y");
    });
  });

  describe("RbacService.can → auth.rbac.denied", () => {
    it("dispatches auth.rbac.denied when can() returns false", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const { wireAuthEvents } = await import("../events.js");

      const rbacService = new RbacService();
      const dispatcher = vi.fn<(event: DomainEvent) => Promise<void>>();

      wireAuthEvents(
        // SessionService is unused in this scenario but the signature requires it.
        // Build a minimal stub that satisfies the type without touching prisma.
        {
          revokeSession: vi.fn(),
          getCurrentUser: vi.fn(),
        } as never,
        rbacService,
        dispatcher,
      );

      const allowed = rbacService.can(
        { id: "user-1", role: "USER" },
        "session:read:any",
        { kind: "session", ownerId: "user-2", id: "session-2" },
      );

      expect(allowed).toBe(false);
      expect(dispatcher).toHaveBeenCalledTimes(1);
      const dispatched = vi.mocked(dispatcher).mock.calls[0]?.[0] as DomainEvent;
      expect(dispatched.name).toBe("auth.rbac.denied");
      expect(dispatched.userId).toBe("user-1");
      expect(dispatched.payload).toMatchObject({
        userId: "user-1",
        action: "session:read:any",
        resourceKind: "session",
      });
      expect(
        (dispatched.payload as { deniedAt: Date }).deniedAt,
      ).toBeInstanceOf(Date);
    });

    it("does NOT dispatch any event when can() returns true (allowed action)", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const { wireAuthEvents } = await import("../events.js");

      const rbacService = new RbacService();
      const dispatcher = vi.fn<(event: DomainEvent) => Promise<void>>();

      wireAuthEvents(
        {
          revokeSession: vi.fn(),
          getCurrentUser: vi.fn(),
        } as never,
        rbacService,
        dispatcher,
      );

      const allowed = rbacService.can(
        { id: "user-1", role: "USER" },
        "session:read:own",
        { kind: "session", ownerId: "user-1", id: "session-1" },
      );

      expect(allowed).toBe(true);
      expect(dispatcher).not.toHaveBeenCalled();
    });
  });
});
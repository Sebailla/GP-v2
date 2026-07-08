import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for the Pattern A dispatcher wiring (slice 3 batch 6 —
 * brief drop-wireauth-events-RED).
 *
 * After the wireAuthEvents wrapper is dropped (per brief), `SessionService`
 * and `RbacService` take the dispatcher in their constructors and dispatch
 * directly. This test pins the new contract end-to-end at the service
 * level (no wrapper in sight).
 *
 * Coverage:
 *  - SessionService constructor takes \`dispatcher\` as a 3rd arg. Calling
 *    revokeSession(token, userId) does the delete + dispatch in order,
 *    emitting \`auth.session.revoked\` with userId, sessionId, revokedAt.
 *  - RbacService constructor takes \`dispatcher\` as the 1st arg. can()
 *    dispatches \`auth.rbac.denied\` only on \`false\` returns (the audit
 *    signal of a denied authorization).
 *  - Both services use the constructor-injected dispatcher; there is no
 *    global wiring step.
 *  - Constructor guard: missing/non-function dispatcher throws TypeError
 *    (mirrors the F8 guard on PasswordResetService).
 *
 * These tests will replace the \`wireAuthEvents\` describe block in
 * events.test.ts in the GREEN commit (brief-drop-wireauth-events-GREEN).
 */

vi.mock("@core/database", () => ({
  prisma: {
    session: {
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@core/database";
import type { DomainEvent } from "@core/events";

import type { AuthEventDispatcher } from "../events.js";

describe("Pattern A dispatcher wiring", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("SessionService.revokeSession (Pattern A)", () => {
    it("dispatches auth.session.revoked after the delete (token + userId in payload)", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);

      const dispatcher = vi.fn<AuthEventDispatcher>();
      const service = new SessionService(
        prisma,
        undefined,
        undefined,
        dispatcher,
      );

      await service.revokeSession("token-A", "user-1");

      expect(prisma.session.delete).toHaveBeenCalledTimes(1);
      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { sessionToken: "token-A" },
      });

      expect(dispatcher).toHaveBeenCalledTimes(1);
      const event = (dispatcher.mock.calls[0] as unknown as [DomainEvent])[0];
      expect(event.name).toBe("auth.session.revoked");
      expect(event.userId).toBe("user-1");
      expect(event.payload).toMatchObject({
        userId: "user-1",
        sessionId: "token-A",
      });
      expect((event.payload as { revokedAt: Date }).revokedAt).toBeInstanceOf(Date);
    });

    it("does NOT dispatch when revokeSession is called without a userId argument", async () => {
      const { SessionService } = await import("../session-service.js");
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);

      const dispatcher = vi.fn<AuthEventDispatcher>();
      const service = new SessionService(
        prisma,
        undefined,
        undefined,
        dispatcher,
      );

      await service.revokeSession("token-A");

      expect(prisma.session.delete).toHaveBeenCalledTimes(1);
      expect(dispatcher).not.toHaveBeenCalled();
    });

    it("F8 — the constructor throws TypeError when the dispatcher is null/undefined", async () => {
      const { SessionService } = await import("../session-service.js");

      expect(
        () =>
          new SessionService(
            prisma,
            undefined,
            undefined,
            null as unknown as AuthEventDispatcher,
          ),
      ).toThrow(TypeError);

      expect(
        () =>
          new SessionService(
            prisma,
            undefined,
            undefined,
            undefined as unknown as AuthEventDispatcher,
          ),
      ).toThrow(TypeError);
    });

    it("propagates Prisma errors from the underlying delete (no swallowing)", async () => {
      const { SessionService } = await import("../session-service.js");
      const prismaError = new Error("connection refused");
      vi.mocked(prisma.session.delete).mockRejectedValue(prismaError as never);

      const dispatcher = vi.fn<AuthEventDispatcher>();
      const service = new SessionService(
        prisma,
        undefined,
        undefined,
        dispatcher,
      );

      await expect(
        service.revokeSession("token-A", "user-1"),
      ).rejects.toThrow(/connection refused/i);
      expect(dispatcher).not.toHaveBeenCalled();
    });
  });

  describe("RbacService.can (Pattern A)", () => {
    it("dispatches auth.rbac.denied when can() returns false", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const dispatcher = vi.fn<AuthEventDispatcher>();
      const rbac = new RbacService(dispatcher);

      const allowed = rbac.can(
        { id: "user-1", role: "USER" },
        "session:read:any",
        { kind: "session", ownerId: "user-2", id: "session-2" },
      );

      expect(allowed).toBe(false);
      expect(dispatcher).toHaveBeenCalledTimes(1);
      const event = (dispatcher.mock.calls[0] as unknown as [DomainEvent])[0];
      expect(event.name).toBe("auth.rbac.denied");
      expect(event.userId).toBe("user-1");
      expect(event.payload).toMatchObject({
        userId: "user-1",
        action: "session:read:any",
        resourceType: "session",
      });
      expect((event.payload as { at: Date }).at).toBeInstanceOf(Date);
    });

    it("does NOT dispatch when can() returns true (allowed action)", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const dispatcher = vi.fn<AuthEventDispatcher>();
      const rbac = new RbacService(dispatcher);

      const allowed = rbac.can(
        { id: "user-1", role: "USER" },
        "session:read:own",
        { kind: "session", ownerId: "user-1", id: "session-1" },
      );

      expect(allowed).toBe(true);
      expect(dispatcher).not.toHaveBeenCalled();
    });

    it("F8 — the constructor throws TypeError when the dispatcher is null/undefined", async () => {
      const { RbacService } = await import("../rbac-service.js");

      expect(
        () => new RbacService(null as unknown as AuthEventDispatcher),
      ).toThrow(TypeError);

      expect(
        () => new RbacService(undefined as unknown as AuthEventDispatcher),
      ).toThrow(TypeError);
    });
  });
});

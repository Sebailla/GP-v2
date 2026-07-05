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

// bcryptjs is also mocked so the slice 3 batch 4 password-reset event
// extension (PasswordResetService.consumeReset hash path) does not
// perform real bcrypt rounds inside the vitest sandbox. The slice 3
// batch 3 tests in this file do not reach bcryptjs — the mock is
// inert for them but provides the seam for the new tests.
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
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
        sessionId: "token-A",
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
      expect((events[0]?.payload as { sessionId: string }).sessionId).toBe("token-X");
      expect(events[1]?.name).toBe("auth.session.revoked");
      expect((events[1]?.payload as { userId: string }).userId).toBe("user-2");
      expect((events[1]?.payload as { sessionId: string }).sessionId).toBe("token-Y");
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
        resourceType: "session",
      });
      expect(
        (dispatched.payload as { at: Date }).at,
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

    // ---------------------------------------------------------------------------
    // PasswordResetService → auth.password-reset.{requested, completed}
    //
    // Pattern A is adopted (canonical design §4.1): the dispatcher is
    // injected into PasswordResetService via its constructor; the service
    // dispatches directly. wireAuthEvents is unchanged — it still wraps
    // SessionService.revokeSession + RbacService.can only.
    //
    // These tests pin the dispatch contract end-to-end. They construct
    // PasswordResetService directly with mocked UserRepository +
    // PasswordResetTokenRepository ports (no wireAuthEvents round-trip).
    // ---------------------------------------------------------------------------
    describe("PasswordResetService → auth.password-reset.requested/completed", () => {
      it("dispatches auth.password-reset.requested exactly once for a known email", async () => {
        const { PasswordResetService } = await import(
          "../password-reset.service.js"
        );
        const userRepo = {
          findByEmail: vi.fn().mockResolvedValue({
            id: "user-1",
            email: "alice@example.com",
            role: "USER",
            hashedPassword: "$2a$10$old",
          }),
          findById: vi.fn(),
          updatePassword: vi.fn(),
        };
        const createdRows: Array<{
          userId: string;
          tokenHash: string;
          expiresAt: Date;
        }> = [];
        const tokenRepo = {
          create: vi.fn(async (args) => {
            createdRows.push(args);
            return {
              id: "prt-1",
              userId: args.userId,
              tokenHash: args.tokenHash,
              expiresAt: args.expiresAt,
              consumedAt: null,
            };
          }),
          findByHash: vi.fn(),
          markConsumed: vi.fn(),
        };
        const dispatcher = vi.fn<(event: DomainEvent) => Promise<void>>();

        const service = new PasswordResetService(
          userRepo as never,
          tokenRepo as never,
          dispatcher,
        );

        await service.requestReset("alice@example.com");

        expect(tokenRepo.create).toHaveBeenCalledTimes(1);
        expect(createdRows).toHaveLength(1);
        const persistedHash = createdRows[0]!.tokenHash;
        const expiresAt = createdRows[0]!.expiresAt;
        expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

        // Dispatcher called exactly once.
        expect(dispatcher).toHaveBeenCalledTimes(1);
        const event = (dispatcher.mock.calls[0] as unknown as [DomainEvent])[0];
        expect(event.name).toBe("auth.password-reset.requested");
        expect(event.userId).toBe("user-1");
        const payload = event.payload as {
          userId: string;
          token: string;
          requestedAt: Date;
        };
        expect(payload.userId).toBe("user-1");
        expect(payload.token.length).toBeGreaterThanOrEqual(32);
        // The dispatched raw token must sha256 to the persisted hash
        // (the canonical hash-only invariant).
        const { createHash } = await import("node:crypto");
        expect(createHash("sha256").update(payload.token).digest("hex")).toBe(
          persistedHash,
        );
        expect(payload.requestedAt).toBeInstanceOf(Date);
      });

      it("does NOT dispatch any event for an unknown email (no enumeration leak)", async () => {
        const { PasswordResetService } = await import(
          "../password-reset.service.js"
        );
        const userRepo = {
          findByEmail: vi.fn().mockResolvedValue(null),
          findById: vi.fn(),
          updatePassword: vi.fn(),
        };
        const tokenRepo = {
          create: vi.fn(),
          findByHash: vi.fn(),
          markConsumed: vi.fn(),
        };
        const dispatcher = vi.fn<(event: DomainEvent) => Promise<void>>();

        const service = new PasswordResetService(
          userRepo as never,
          tokenRepo as never,
          dispatcher,
        );

        await service.requestReset("ghost@example.com");

        expect(tokenRepo.create).not.toHaveBeenCalled();
        expect(dispatcher).not.toHaveBeenCalled();
      });

      it("on a successful consumeReset, dispatches auth.password-reset.completed once (after the prior auth.password-reset.requested)", async () => {
        const { PasswordResetService } = await import(
          "../password-reset.service.js"
        );
        const userRepo = {
          findByEmail: vi.fn().mockResolvedValue({
            id: "user-1",
            email: "alice@example.com",
            role: "USER",
            hashedPassword: "$2a$10$old",
          }),
          findById: vi.fn(),
          updatePassword: vi.fn(async () => {}),
        };

        // Seed a valid token in the in-memory repo.
        const { createHash } = await import("node:crypto");
        const rawToken = "x".repeat(48);
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const tokenRepo = {
          create: vi.fn(async (args) => ({
            id: "prt-1",
            userId: args.userId,
            tokenHash: args.tokenHash,
            expiresAt: args.expiresAt,
            consumedAt: null,
          })),
          findByHash: vi.fn(async (hash: string) =>
            hash === tokenHash
              ? {
                  id: "prt-1",
                  userId: "user-1",
                  tokenHash: hash,
                  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                  consumedAt: null,
                }
              : null,
          ),
          markConsumed: vi.fn(async () => {}),
        };
        const dispatcher = vi.fn<(event: DomainEvent) => Promise<void>>();
        const bcryptMod = (await import("bcryptjs")).default;
        vi.mocked(bcryptMod.hash).mockResolvedValue("$2a$10$new" as never);

        const service = new PasswordResetService(
          userRepo as never,
          tokenRepo as never,
          dispatcher,
        );

        // First: requestReset fires `requested` (1 dispatch).
        await service.requestReset("alice@example.com");
        expect(dispatcher).toHaveBeenCalledTimes(1);

        // Then: consumeReset fires `completed` (2 dispatches total).
        await service.consumeReset(rawToken, "newPassword123");
        expect(dispatcher).toHaveBeenCalledTimes(2);

        const events = dispatcher.mock.calls.map(
          (c) => (c as unknown as [DomainEvent])[0],
        );
        // First event is `requested`.
        expect(events[0]!.name).toBe("auth.password-reset.requested");
        // Second event is `completed` with the canonical payload.
        expect(events[1]!.name).toBe("auth.password-reset.completed");
        expect(events[1]!.userId).toBe("user-1");
        const completedPayload = events[1]!.payload as {
          userId: string;
          resetAt: Date;
        };
        expect(completedPayload.userId).toBe("user-1");
        expect(completedPayload.resetAt).toBeInstanceOf(Date);
      });

      it("on an invalid consumeReset (consumed/expired/unknown token), NO auth.password-reset.completed event is dispatched", async () => {
        const { PasswordResetService } = await import(
          "../password-reset.service.js"
        );
        const userRepo = {
          findByEmail: vi.fn().mockResolvedValue({
            id: "user-1",
            email: "alice@example.com",
            role: "USER",
            hashedPassword: "$2a$10$old",
          }),
          findById: vi.fn(),
          updatePassword: vi.fn(),
        };

        // Empty token repo: every lookup misses → mock the
        // "unknown token" branch.
        const tokenRepo = {
          create: vi.fn(),
          findByHash: vi.fn().mockResolvedValue(null),
          markConsumed: vi.fn(),
        };
        const dispatcher = vi.fn<(event: DomainEvent) => Promise<void>>();

        const service = new PasswordResetService(
          userRepo as never,
          tokenRepo as never,
          dispatcher,
        );

        // First: requestReset fires `requested` (1 dispatch).
        await service.requestReset("alice@example.com");
        expect(dispatcher).toHaveBeenCalledTimes(1);
        const firstEvent = (dispatcher.mock.calls[0] as unknown as [DomainEvent])[0];
        expect(firstEvent.name).toBe("auth.password-reset.requested");

        // Then: consumeReset with an unknown token → throws (asserted
        // implicitly by the dispatch count being still 1) — no
        // `completed` event is dispatched.
        await expect(
          service.consumeReset("nonexistent-token-string-1234567890", "newPwd"),
        ).rejects.toBeInstanceOf(
          (await import("../password-reset.service.js")).AuthError,
        );

        expect(dispatcher).toHaveBeenCalledTimes(1); // unchanged
        const allEvents = dispatcher.mock.calls.map(
          (c) => (c as unknown as [DomainEvent])[0],
        );
        expect(allEvents.some((e) => e.name === "auth.password-reset.completed")).toBe(
          false,
        );
      });
    });
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TDD contract for the events wiring — slice 3 (batches 3 + 4 + 5).
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/design.md`
 * §4.7 (Events emitted: the four events this slice covers) and the
 * canonical Zod schemas in `libs/core/events/src/types.ts`. The four
 * events this slice emits:
 *
 *  1. `auth.password-reset.requested` — payload
 *     `{ userId, token (raw, dev only), requestedAt: Date }`.
 *  2. `auth.password-reset.completed` — payload
 *     `{ userId, resetAt: Date }`.
 *  3. `auth.session.revoked` — payload
 *     `{ userId, sessionId, revokedAt: Date }`.
 *  4. `auth.rbac.denied` — payload
 *     `{ userId, action, resourceType, at: Date }`.
 *
 * Slice 3 batch 3 wires events 3 + 4 via `wireAuthEvents(session, rbac,
 * dispatcher)` (monkey-patch). Slice 3 batch 4 wires events 1 + 2 via
 * Pattern A: `PasswordResetService` takes the dispatcher in its constructor
 * and dispatches directly. Slice 3 batch 5 adds the F2 audit signal + F8
 * dispatcher guard, and migrates to the shared `password-reset.fakes.ts`
 * factories (Phase 2 refactor per R2 #6).
 *
 * Phase 2 refactor (slice 3 batch 5):
 *  - Imports the shared `password-reset.fakes.ts` factories (R2 #6).
 *  - Switches `vi.clearAllMocks()` to `vi.resetAllMocks()` (R4 #2).
 *  - Drops inline `{findByEmail, findById, updatePassword}` and `{create,
 *    findByHash, markConsumed}` mocks in favor of `makeFakeUserRepo` /
 *    `makeFakeTokenRepo`.
 */

vi.mock("@core/database", () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import type { PrismaClient } from "@core/database";
import { createInMemoryDispatcher, type DomainEvent } from "@core/events";
import bcrypt from "bcryptjs";

import { prisma } from "@core/database";

import type { AuthEventDispatcher } from "../events.js";
import { MIN_TOKEN_LENGTH } from "../password-reset.service.js";
import type { PasswordResetTokenRepository } from "../domain/interfaces/password-reset-token.repository.js";
import {
  makeFakeTokenRepo,
  makeFakeUserRepo,
  makePrismaStub,
  sha256,
  seedTokenRow,
  type FakePrismaStub,
} from "./fixtures/password-reset.fakes.js";

/**
 * Cast a FakePrismaStub (intentionally narrow) to PrismaClient for the
 * 4th constructor arg. Real PrismaClient has dozens of methods; the
 * stub only needs `$transaction` for F1.
 */
function asPrismaStub(stub: FakePrismaStub): PrismaClient {
  return stub as unknown as PrismaClient;
}

describe("wireAuthEvents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
      const rbacService = new (
        await import("../rbac-service.js")
      ).RbacService();
      const dispatcher = vi.fn<(event: DomainEvent) => Promise<void>>();

      wireAuthEvents(sessionService, rbacService, dispatcher);

      await sessionService.revokeSession("token-A");

      expect(dispatcher).toHaveBeenCalledTimes(1);
      const dispatched = vi.mocked(dispatcher).mock
        .calls[0]?.[0] as DomainEvent;
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
      // Prisma's SessionWhereUniqueInput is a discriminated union; the
      // service only ever calls with where.sessionToken, so we narrow
      // here.
      vi.mocked(prisma.session.findUnique).mockImplementation(
        async (args: { where: { sessionToken: string } }) => {
          return findUniqueByToken.get(args.where.sessionToken) as never;
        },
      );
      vi.mocked(prisma.session.delete).mockResolvedValue({} as never);

      const sessionService = new SessionService(prisma);
      const rbacService = new (
        await import("../rbac-service.js")
      ).RbacService();
      const dispatcher = vi.fn<(event: DomainEvent) => Promise<void>>();

      wireAuthEvents(sessionService, rbacService, dispatcher);

      await sessionService.revokeSession("token-X");
      await sessionService.revokeSession("token-Y");

      expect(dispatcher).toHaveBeenCalledTimes(2);
      const events = vi
        .mocked(dispatcher)
        .mock.calls.map((c) => c[0] as DomainEvent);
      expect(events[0]?.name).toBe("auth.session.revoked");
      expect((events[0]?.payload as { userId: string }).userId).toBe("user-1");
      expect((events[0]?.payload as { sessionId: string }).sessionId).toBe(
        "token-X",
      );
      expect(events[1]?.name).toBe("auth.session.revoked");
      expect((events[1]?.payload as { userId: string }).userId).toBe("user-2");
      expect((events[1]?.payload as { sessionId: string }).sessionId).toBe(
        "token-Y",
      );
    });
  });

  describe("RbacService.can → auth.rbac.denied", () => {
    it("dispatches auth.rbac.denied when can() returns false", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const { wireAuthEvents } = await import("../events.js");

      const rbacService = new RbacService();
      const dispatcher = vi.fn<(event: DomainEvent) => Promise<void>>();

      wireAuthEvents(
        // SessionService is unused in this scenario but the signature
        // requires it. Build a minimal stub that satisfies the type
        // without touching prisma.
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
      const dispatched = vi.mocked(dispatcher).mock
        .calls[0]?.[0] as DomainEvent;
      expect(dispatched.name).toBe("auth.rbac.denied");
      expect(dispatched.userId).toBe("user-1");
      expect(dispatched.payload).toMatchObject({
        userId: "user-1",
        action: "session:read:any",
        resourceType: "session",
      });
      expect((dispatched.payload as { at: Date }).at).toBeInstanceOf(Date);
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
//
// Slice 3 batch 5 (Phase 2 refactor): shared `password-reset.fakes.ts`
// factories replace the inline mock objects.
// ---------------------------------------------------------------------------
describe("PasswordResetService → auth.password-reset.requested/completed", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("dispatches auth.password-reset.requested exactly once for a known email", async () => {
    const { PasswordResetService } =
      await import("../password-reset.service.js");
    const userRepo = makeFakeUserRepo({
      id: "user-1",
      email: "alice@example.com",
      role: "USER",
      hashedPassword: "$2a$10$old",
    });
    const tokenRepo = makeFakeTokenRepo();
    const dispatcher = vi.fn<AuthEventDispatcher>();

    const service = new PasswordResetService(
      userRepo,
      tokenRepo as unknown as PasswordResetTokenRepository,
      dispatcher,
    );

    await service.requestReset("alice@example.com");

    expect(tokenRepo.create).toHaveBeenCalledTimes(1);
    const createdArg = (
      vi.mocked(tokenRepo.create).mock.calls[0] as unknown as [
        { userId: string; tokenHash: string; expiresAt: Date },
      ]
    )[0];
    expect(createdArg.userId).toBe("user-1");
    const persistedHash = createdArg.tokenHash;
    const expiresAt = createdArg.expiresAt;
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

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
    expect(payload.token.length).toBeGreaterThanOrEqual(MIN_TOKEN_LENGTH);
    // The dispatched raw token must sha256 to the persisted hash.
    expect(sha256(payload.token)).toBe(persistedHash);
    expect(payload.requestedAt).toBeInstanceOf(Date);
  });

  it("does NOT dispatch any event for an unknown email (no enumeration leak)", async () => {
    const { PasswordResetService } =
      await import("../password-reset.service.js");
    const userRepo = makeFakeUserRepo(null);
    const tokenRepo = makeFakeTokenRepo();
    const dispatcher = vi.fn<AuthEventDispatcher>();

    const service = new PasswordResetService(
      userRepo,
      tokenRepo as unknown as PasswordResetTokenRepository,
      dispatcher,
    );

    await service.requestReset("ghost@example.com");

    expect(tokenRepo.create).not.toHaveBeenCalled();
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it("on a successful consumeReset, dispatches auth.password-reset.completed once (after the prior auth.password-reset.requested)", async () => {
    const { PasswordResetService } =
      await import("../password-reset.service.js");
    const userRepo = makeFakeUserRepo({
      id: "user-1",
      email: "alice@example.com",
      role: "USER",
      hashedPassword: "$2a$10$old",
    });

    // Seed a valid token in the in-memory token repo.
    const rawToken = "x".repeat(48);
    const tokenRepo = makeFakeTokenRepo();
    seedTokenRow(tokenRepo, rawToken, { id: "prt-1", userId: "user-1" });

    const dispatcher = vi.fn<AuthEventDispatcher>();
    vi.mocked(bcrypt.hash).mockResolvedValue("$2a$10$new" as never);

    const prismaStub = makePrismaStub();

    const service = new PasswordResetService(
      userRepo,
      tokenRepo as unknown as PasswordResetTokenRepository,
      dispatcher,
      asPrismaStub(prismaStub),
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
    expect(events[0]!.name).toBe("auth.password-reset.requested");
    expect(events[1]!.name).toBe("auth.password-reset.completed");
    expect(events[1]!.userId).toBe("user-1");
    const completedPayload = events[1]!.payload as {
      userId: string;
      resetAt: Date;
    };
    expect(completedPayload.userId).toBe("user-1");
    expect(completedPayload.resetAt).toBeInstanceOf(Date);

    // F1: both writes went through the transaction; port-level writes
    // are NOT called (transaction owns the writes).
    expect(prismaStub.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaStub.txUserUpdate).toHaveBeenCalledTimes(1);
    expect(prismaStub.txPrtUpdate).toHaveBeenCalledTimes(1);
    expect(userRepo.updatePassword).not.toHaveBeenCalled();
    expect(tokenRepo.markConsumed).not.toHaveBeenCalled();
  });

  it("on an invalid consumeReset (consumed/expired/unknown token), NO auth.password-reset.completed event is dispatched", async () => {
    const { PasswordResetService } =
      await import("../password-reset.service.js");
    const userRepo = makeFakeUserRepo({
      id: "user-1",
      email: "alice@example.com",
      role: "USER",
      hashedPassword: "$2a$10$old",
    });

    // Empty token repo: every lookup misses \u2192 "unknown token" branch.
    const tokenRepo = makeFakeTokenRepo();
    const dispatcher = vi.fn<AuthEventDispatcher>();

    // F1: Pass a no-op prismaStub as the 4th constructor arg.
    // The transaction is NEVER reached on the invalid-token path
    // (the service throws before the tx wrapper).
    const prismaStub = makePrismaStub();

    const service = new PasswordResetService(
      userRepo,
      tokenRepo as unknown as PasswordResetTokenRepository,
      dispatcher,
      asPrismaStub(prismaStub),
    );

    // First: requestReset fires `requested` (1 dispatch).
    await service.requestReset("alice@example.com");
    expect(dispatcher).toHaveBeenCalledTimes(1);
    const firstEvent = (
      dispatcher.mock.calls[0] as unknown as [DomainEvent]
    )[0];
    expect(firstEvent.name).toBe("auth.password-reset.requested");

    // Then: consumeReset with an unknown token \u2192 throws.
    const { AuthError } = await import("../password-reset.service.js");
    await expect(
      service.consumeReset("nonexistent-token-string-1234567890", "newPwd"),
    ).rejects.toBeInstanceOf(AuthError);

    expect(dispatcher).toHaveBeenCalledTimes(1); // unchanged
    const allEvents = dispatcher.mock.calls.map(
      (c) => (c as unknown as [DomainEvent])[0],
    );
    expect(
      allEvents.some((e) => e.name === "auth.password-reset.completed"),
    ).toBe(false);
    expect(prismaStub.$transaction).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // F3 follow-up: ring-buffer redaction through the auth-slice dispatch path.
  // -------------------------------------------------------------------------
  it("F3 \u2014 the ring buffer holds the redacted token (auth.password-reset.requested)", async () => {
    const ringDispatcher = createInMemoryDispatcher();
    const { PasswordResetService } =
      await import("../password-reset.service.js");

    const userRepo = makeFakeUserRepo({
      id: "u1",
      email: "alice@example.com",
      role: "USER",
      hashedPassword: "$2a$10$old",
    });
    const tokenRepo = makeFakeTokenRepo();

    const prismaStub = makePrismaStub();
    const auditSink = vi.fn();

    const service = new PasswordResetService(
      userRepo,
      tokenRepo as unknown as PasswordResetTokenRepository,
      ringDispatcher.dispatch as unknown as AuthEventDispatcher,
      asPrismaStub(prismaStub),
      auditSink,
    );

    await service.requestReset("alice@example.com");

    const replayed = ringDispatcher.replay("u1");
    expect(replayed).toHaveLength(1);
    expect(replayed[0]!.name).toBe("auth.password-reset.requested");
    expect((replayed[0]!.payload as { token: string }).token).toBe(
      "***REDACTED***",
    );

    expect(auditSink).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

/**
 * TDD contract for `PrismaPasswordResetTokenRepository` (slice 3 batch 4
 * / brief T3.5b RED).
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/design.md`
 * §4.1 (`PasswordResetService` mints + persists + consumes reset
 * tokens) and §5.1 (`PasswordResetToken` table with `tokenHash`
 * UNIQUE index). The port (`PasswordResetTokenRepository`) and the
 * canonical record type (`PasswordResetTokenRecord`) were declared
 * in the slice 3 batch 4 brief T3.4 GREEN commit; this batch adds
 * the Prisma adapter.
 *
 * Adapter scope (the third `@core/database` integration after
 * `PrismaUserRepository`):
 *  - `create({ userId, tokenHash, expiresAt })`: insert a row, return
 *    the public `PasswordResetTokenRecord` projection. Internally
 *    delegates to `prisma.passwordResetToken.create({ data: { user
 *    : { connect: { id: userId } }, tokenHash, expiresAt } })` —
 *    the schema's `onDelete: Cascade` on `userId` keeps referential
 *    integrity.
 *  - `findByHash(tokenHash)`: lookup by the UNIQUE `tokenHash` index.
 *    Returns `null` when no row matches (translated to generic
 *    `INVALID_RESET_TOKEN` at the service layer).
 *  - `markConsumed(tokenHash, consumedAt)`: set `consumedAt = now` on
 *    the row. Idempotent — silently no-ops when no row matches
 *    (the service layer already short-circuited before reaching
 *    here).
 *
 * RED state: `prisma-password-reset-token.repository.ts` does NOT
 * exist yet. The dynamic import inside each `it` block throws
 * ERR_MODULE_NOT_FOUND. Every test fails for the expected
 * "feature missing" reason.
 *
 * Test pattern (matches the existing convention in this package):
 *
 *   vi.mock('@core/database', () => ({ prisma: { passwordReset
 *   Token: { create, findUnique, update, findUniqueOrThrow } } }))
 *
 * The Prisma singleton is mocked so the suite runs in the
 * Vitest sandbox without a real DB connection. The brief's
 * note that "the project uses sqlite" is a divergence from the
 * actual PostgreSQL setup (see `docker-compose.yml` — postgres
 * 16-alpine); the existing pattern in this package uses
 * `vi.mock('@core/database')` over the sandboxed Prisma surface,
 * which we follow for consistency. A future batch may add an
 * integration test that runs against a real Prisma instance; this
 * batch establishes the adapter shape via the unit-level mock.
 */

vi.mock("@core/database", () => ({
  prisma: {
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@core/database";

const sha256Hex = (s: string): string =>
  createHash("sha256").update(s).digest("hex");

describe("PrismaPasswordResetTokenRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("persists a row with tokenHash + expiresAt + userId, projecting onto the public PasswordResetTokenRecord", async () => {
      const { PrismaPasswordResetTokenRepository } = await import(
        "../infrastructure/repositories/prisma-password-reset-token.repository.js"
      );

      vi.mocked(prisma.passwordResetToken.create).mockResolvedValue({
        id: "prt-1",
        userId: "user-1",
        tokenHash: "h-abc",
        expiresAt: new Date("2030-01-01T00:00:00Z"),
        consumedAt: null,
        user: {} as never,
      } as never);

      const repo = new PrismaPasswordResetTokenRepository();
      const expiresAt = new Date("2030-01-01T00:00:00Z");
      const record = await repo.create({
        userId: "user-1",
        tokenHash: "h-abc",
        expiresAt,
      });

      // The Prisma call uses `user: { connect: { id: userId } }`
      // because the schema declares `userId` as a FK + the User
      // relation. Passing `data: { userId, ... }` alone errors under
      // type-checking for the `XOR<CreateInput, UncheckedCreateInput>`
      // discriminator when using the relation-input path — the
      // explicit `connect` keeps the adapter type-safe against the
      // generated client signature.
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const callArg = (vi.mocked(prisma.passwordResetToken.create).mock
        .calls[0] as unknown as [{ data: unknown }])[0];
      expect(callArg.data).toMatchObject({
        tokenHash: "h-abc",
        expiresAt,
      });
      // The User relation must be linked via `connect` (FK onDelete: Cascade).
      expect((callArg.data as { user?: { connect?: { id?: string } } }).user).toEqual({
        connect: { id: "user-1" },
      });

      // The public projection shape.
      expect(record).toEqual({
        id: "prt-1",
        userId: "user-1",
        tokenHash: "h-abc",
        expiresAt,
        consumedAt: null,
      });
    });

    it("propagates a foreign-key violation when the user does not exist", async () => {
      const { PrismaPasswordResetTokenRepository } = await import(
        "../infrastructure/repositories/prisma-password-reset-token.repository.js"
      );

      const fkError = new Error("Foreign key constraint failed");
      (
        fkError as Error & { code?: string }
      ).code = "P2003";
      vi.mocked(prisma.passwordResetToken.create).mockRejectedValue(
        fkError as never,
      );

      const repo = new PrismaPasswordResetTokenRepository();
      await expect(
        repo.create({
          userId: "ghost-user",
          tokenHash: "h-xyz",
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ).rejects.toThrow(/Foreign key constraint/i);
    });
  });

  describe("findByHash", () => {
    it("returns the row whose tokenHash matches", async () => {
      const { PrismaPasswordResetTokenRepository } = await import(
        "../infrastructure/repositories/prisma-password-reset-token.repository.js"
      );

      const tokenHash = sha256Hex("raw-token-1");
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: "prt-2",
        userId: "user-2",
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        user: {} as never,
      } as never);

      const repo = new PrismaPasswordResetTokenRepository();
      const record = await repo.findByHash(tokenHash);

      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledTimes(1);
      expect(
        (vi.mocked(prisma.passwordResetToken.findUnique).mock.calls[0] as unknown as [
          { where: { tokenHash: string } },
        ])[0].where,
      ).toEqual({ tokenHash });
      expect(record).toMatchObject({
        id: "prt-2",
        userId: "user-2",
        tokenHash,
        consumedAt: null,
      });
    });

    it("returns null when no row matches (no enumeration side-channel)", async () => {
      const { PrismaPasswordResetTokenRepository } = await import(
        "../infrastructure/repositories/prisma-password-reset-token.repository.js"
      );

      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(
        null as never,
      );

      const repo = new PrismaPasswordResetTokenRepository();
      const record = await repo.findByHash("nonexistent-hash");
      expect(record).toBeNull();
    });
  });

  describe("markConsumed", () => {
    it("sets consumedAt = supplied timestamp on the row matching the tokenHash", async () => {
      const { PrismaPasswordResetTokenRepository } = await import(
        "../infrastructure/repositories/prisma-password-reset-token.repository.js"
      );

      const consumedAt = new Date("2030-01-01T12:00:00Z");
      vi.mocked(prisma.passwordResetToken.update).mockResolvedValue({
        id: "prt-3",
        userId: "user-3",
        tokenHash: "h-consumed",
        expiresAt: new Date("2030-01-01T00:00:00Z"),
        consumedAt,
        user: {} as never,
      } as never);

      const repo = new PrismaPasswordResetTokenRepository();
      await repo.markConsumed("h-consumed", consumedAt);

      expect(prisma.passwordResetToken.update).toHaveBeenCalledTimes(1);
      expect(
        (vi.mocked(prisma.passwordResetToken.update).mock.calls[0] as unknown as [
          { where: { tokenHash: string }; data: { consumedAt: Date } },
        ])[0],
      ).toEqual({
        where: { tokenHash: "h-consumed" },
        data: { consumedAt },
      });
    });

    it("silently no-ops on Prisma P2025 (row already gone) — idempotent post-condition", async () => {
      const { PrismaPasswordResetTokenRepository } = await import(
        "../infrastructure/repositories/prisma-password-reset-token.repository.js"
      );

      const p2025 = new Error("Record to update not found.");
      (p2025 as Error & { code?: string }).code = "P2025";
      vi.mocked(prisma.passwordResetToken.update).mockRejectedValue(
        p2025 as never,
      );

      const repo = new PrismaPasswordResetTokenRepository();
      await expect(
        repo.markConsumed("orphan-hash", new Date()),
      ).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // F4 (WARNING): TTL cleanup. Brief brief-fix-F4 RED.
  //
  // Per the `password_reset_tokens` table growing unboundedly without a TTL job,
  // the port gains `deleteExpired(before: Date): Promise<number>` so a future
  // `@nestjs/schedule` cron can prune rows. The cron registration lands in
  // slice 3 batch 6+ (T3.6 NestJS wrapper); this batch ships the port method +
  // Prisma adapter + tests only.
  //
  // Filtering policy: deleted rows have `consumedAt: null` AND
  // `expiresAt < before`. Consumed rows are deliberately preserved (the
  // `consumedAt` timestamp is the audit trail \u2014 a future compliance
  // review needs to know when a row was consumed, not just when it
  // expired). Operators who need to drop consumed rows can do so via an
  // explicit migration.
  // ---------------------------------------------------------------------------
  describe("deleteExpired (port method)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns the number of removed unconsumed+expired rows", async () => {
      const { PrismaPasswordResetTokenRepository } = await import(
        "../infrastructure/repositories/prisma-password-reset-token.repository.js"
      );

      const cutoff = new Date("2026-01-01T00:00:00Z");
      vi.mocked(prisma.passwordResetToken.deleteMany).mockResolvedValue({
        count: 2,
      } as never);

      const repo = new PrismaPasswordResetTokenRepository();
      const count = await repo.deleteExpired(cutoff);

      expect(count).toBe(2);
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledTimes(1);
      expect(
        (vi.mocked(prisma.passwordResetToken.deleteMany).mock
          .calls[0] as unknown as [
          {
            where: {
              expiresAt: { lt: Date };
              consumedAt: null;
            };
          },
        ])[0],
      ).toEqual({
        where: {
          expiresAt: { lt: cutoff },
          consumedAt: null,
        },
      });
    });

    it("does NOT remove consumed rows (consumedAt: null filter is enforced)", async () => {
      const { PrismaPasswordResetTokenRepository } = await import(
        "../infrastructure/repositories/prisma-password-reset-token.repository.js"
      );

      vi.mocked(prisma.passwordResetToken.deleteMany).mockResolvedValue({
        count: 0,
      } as never);

      const repo = new PrismaPasswordResetTokenRepository();
      await repo.deleteExpired(new Date());

      // The where clause MUST include `consumedAt: null` regardless of
      // any other filter \u2014 asserts that consumed rows are not pruned.
      const callArg = (
        vi.mocked(prisma.passwordResetToken.deleteMany).mock
          .calls[0] as unknown as [
          {
            where: Record<string, unknown>;
          },
        ]
      )[0];
      expect(callArg.where).toMatchObject({ consumedAt: null });
    });

    it("returns 0 when no rows match", async () => {
      const { PrismaPasswordResetTokenRepository } = await import(
        "../infrastructure/repositories/prisma-password-reset-token.repository.js"
      );

      vi.mocked(prisma.passwordResetToken.deleteMany).mockResolvedValue({
        count: 0,
      } as never);

      const repo = new PrismaPasswordResetTokenRepository();
      const count = await repo.deleteExpired(new Date());

      expect(count).toBe(0);
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledTimes(1);
    });
  });
});

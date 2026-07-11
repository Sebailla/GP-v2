import { createHash } from "node:crypto";

import { vi } from "vitest";

import type {
  PasswordResetTokenRecord,
  PasswordResetTokenRepository,
} from "../../domain/interfaces/password-reset-token.repository.js";
import type { UserRecord, UserRepository } from "../../domain/interfaces/user.repository.js";

/**
 * Default token TTL (1h per design §4.1). Mirrors `TOKEN_TTL_MS` in
 * `password-reset.service.ts` and `TEST_TOKEN_TTL_MS` in the test
 * files. Single source-of-truth for the fixtures file's default.
 */
const FIXTURES_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Shared fakes for PasswordResetService tests \u2014 slice 3 batch 5 (Phase 2
 * refactor per R2 #6).
 *
 * Per `libs/features/auth/server/src/__tests__/password-reset.service.test.ts`
 * and `.../events.test.ts` (slice 3 batch 4) duplicating the makeFakeUserRepo
 * + makeFakeTokenRepo + makePrismaStub + sha256 helpers. This file collapses
 * those duplications into one shared fixtures module so both test files
 * import the same primitives.
 *
 * Public API:
 *  - `makeFakeUserRepo(user?)` returns `UserRepository` (the real port
 *    type \u2014 R2 #2). The internals are vi.fn spies; callers access them
 *    via `vi.mocked(userRepo.method)`.
 *  - `makeFakeTokenRepo()` returns `PasswordResetTokenRepository & { rows }`
 *    so callers can both pass it as the port AND inject seed rows via
 *    the exposed `rows` Map.
 *  - `makePrismaStub()` returns a stub matching the F1 service surface
 *    (`$transaction` + `txUserUpdate` + `txPrtUpdate`).
 *  - `seedTokenRow(repo, rawToken, overrides?)` injects a valid token row.
 *  - `sha256(s)` thin wrapper around `node:crypto` sha256 digest.
 *
 * The factories NEVER call real bcrypt / Prisma \u2014 they are pure
 * in-memory mocks suitable for `vi.resetAllMocks()` between tests.
 */

/**
 * Extend the PasswordResetTokenRepository port with the `rows` Map
 * (test-only seam for seed injection). `makeFakeTokenRepo` returns
 * this intersection so callers can both pass it as a port AND access
 * the internal Map (mirrors the slice 3 batch 4 inline pattern).
 */
export type FakeTokenRepo = PasswordResetTokenRepository & {
  readonly rows: Map<string, PasswordResetTokenRecord>;
};

/**
 * Prisma stub. Shape mirrors the F1 service surface:
 *  - `$transaction(cb)` invokes cb with a tx object whose
 *    `user.update` and `passwordResetToken.update` are spies.
 *  - `txUserUpdate` and `txPrtUpdate` are the spies exposed for
 *    test assertions.
 *
 * Typed as `unknown` because the actual PrismaClient type is far
 * too wide for test purposes; the service accepts PrismaClient
 * via constructor (4th arg, optional with defaultPrisma fallback).
 */
export interface FakePrismaStub {
  $transaction: ReturnType<typeof vi.fn>;
  txUserUpdate: ReturnType<typeof vi.fn>;
  txPrtUpdate: ReturnType<typeof vi.fn>;
}

/**
 * Build a UserRepository-port fake.
 *
 * @param user Optional seeded user. When omitted (or null), every
 *   lookup returns null. When provided, findByEmail matches on
 *   `user.email` and findById matches on `user.id`.
 *
 * Returns `UserRepository` (the GREEN port type, R2 #2). Callers
 * access spy internals via `vi.mocked(repo.updatePassword)` etc.
 */
export function makeFakeUserRepo(user?: Partial<UserRecord> | null): UserRepository {
  const hasUser = user != null;
  const id = user?.id ?? "user-1";
  const email = user?.email ?? "alice@example.com";
  const role = user?.role ?? "USER";
  const hashedPassword = user?.hashedPassword ?? "$2a$10$default-hash";

  return {
    findByEmail: vi.fn(async (lookupEmail: string): Promise<UserRecord | null> => {
      if (!hasUser || email !== lookupEmail) return null;
      return { id, email, role, hashedPassword };
    }),
    findById: vi.fn(async (lookupId: string): Promise<UserRecord | null> => {
      if (!hasUser || id !== lookupId) return null;
      return { id, email, role, hashedPassword };
    }),
    updatePassword: vi.fn(async (_userId: string, _hashed: string): Promise<void> => {
      // The fake never persists; the test asserts via vi.mocked() spies.
    }),
  };
}

/**
 * Build a PasswordResetTokenRepository-port fake backed by an
 * in-memory Map. The Map is exposed so tests can seed rows before
 * exercising consumeReset (requestReset → consumeReset scenarios).
 */
export function makeFakeTokenRepo(): FakeTokenRepo {
  const rows = new Map<string, PasswordResetTokenRecord>();
  return {
    rows,
    create: vi.fn(
      async (args: {
        userId: string;
        tokenHash: string;
        expiresAt: Date;
      }): Promise<PasswordResetTokenRecord> => {
        const row: PasswordResetTokenRecord = {
          id: `prt-${rows.size + 1}`,
          userId: args.userId,
          tokenHash: args.tokenHash,
          expiresAt: args.expiresAt,
          consumedAt: null,
        };
        rows.set(args.tokenHash, row);
        return row;
      },
    ),
    findByHash: vi.fn(async (tokenHash: string): Promise<PasswordResetTokenRecord | null> => {
      return rows.get(tokenHash) ?? null;
    }),
    markConsumed: vi.fn(async (tokenHash: string, consumedAt: Date): Promise<void> => {
      const row = rows.get(tokenHash);
      if (row === undefined) return;
      rows.set(tokenHash, { ...row, consumedAt });
    }),
    // F4: deleteExpired is NOT implemented by the fake \u2014 the brief's F4
    // tests live in `password-reset-token.repository.test.ts` against
    // the real `PrismaPasswordResetTokenRepository`, not the service
    // fake. The service never calls `deleteExpired`.
    deleteExpired: vi.fn(async (_before: Date): Promise<number> => 0),
  };
}

/**
 * Build a Prisma stub for F1 (the service writes through
 * `prisma.$transaction(tx => ...)`). The supplied callback receives
 * a tx object that has the `user.update` and `passwordResetToken
 * .update` spies. Defaults: both updates succeed (resolve to
 * `undefined`).
 */
export function makePrismaStub(options?: {
  txUserUpdate?: ReturnType<typeof vi.fn>;
  txPrtUpdate?: ReturnType<typeof vi.fn>;
}): FakePrismaStub {
  const txUserUpdate = options?.txUserUpdate ?? vi.fn(async () => undefined);
  const txPrtUpdate = options?.txPrtUpdate ?? vi.fn(async () => undefined);
  const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb({
      user: { update: txUserUpdate },
      passwordResetToken: { update: txPrtUpdate },
    });
  });
  return { $transaction, txUserUpdate, txPrtUpdate };
}

/**
 * sha256 hex digest of a string \u2014 mirrors the canonical token-hash
 * function used by the service. Exposed so tests don't have to
 * import `node:crypto` directly.
 */
export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Convenience: seed a single PasswordResetToken row into the
 * in-memory token repo at the supplied raw-token's hash. Mirrors
 * the slice 3 batch 4 inline `tokenRepo.rows.set(tokenHash, {...})`
 * pattern but in one call.
 */
export function seedTokenRow(
  repo: FakeTokenRepo,
  rawToken: string,
  overrides?: {
    id?: string;
    userId?: string;
    expiresAt?: Date;
    consumedAt?: Date | null;
  },
): PasswordResetTokenRecord {
  const tokenHash = sha256(rawToken);
  const row: PasswordResetTokenRecord = {
    id: overrides?.id ?? `prt-${repo.rows.size + 1}`,
    userId: overrides?.userId ?? "user-1",
    tokenHash,
    expiresAt: overrides?.expiresAt ?? new Date(Date.now() + FIXTURES_TOKEN_TTL_MS),
    consumedAt: overrides?.consumedAt ?? null,
  };
  repo.rows.set(tokenHash, row);
  return row;
}

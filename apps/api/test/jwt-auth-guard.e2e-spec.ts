// `vi.stubEnv` (hoisted with `vi.mock` to the top of the file)
// sets the env BEFORE any @core/config import triggers the env
// singleton's lazy evaluation. The secret MUST match the value
// the production guard reads at runtime.
vi.stubEnv("NODE_ENV", "test");
vi.stubEnv("PORT", "3001");
vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
vi.stubEnv("DATABASE_URL", "postgresql://placeholder/db");
vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
vi.stubEnv("NEXTAUTH_SECRET", "test-secret-at-least-32-characters-long-for-hkdf");
vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client-id");
vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-client-secret");

import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T3.3 — Real NextAuth v5 JWT auth guard (slice 3 batch 7).
 *
 * Per `openspec/changes/.../design.md` §4 (auth slice) and the T3.3
 * entry in `openspec/changes/.../tasks.md`, the slice-3-batch-6 stub
 * `JwtAuthGuard` (parses `<userId>:<token>` bearer strings) is replaced
 * with a NextAuth v5–backed guard that:
 *
 *   1. Reads the bearer JWT from `Authorization: Bearer <token>`.
 *   2. Decodes the JWT using `@auth/core/jwt#decode` (re-exported as
 *      `next-auth/jwt`) with the same `secret` + `salt` as the
 *      NextAuth instance minted in `apps/api/src/lib/auth.ts`.
 *   3. Projects the JWT claims onto the canonical `CurrentUser`
 *      shape (`{ id, email, role }`) and attaches it to `request.user`.
 *
 * This test exercises the public surface end-to-end through
 * `Test.createTestingModule(...)` from `@nestjs/testing` +
 * `supertest`. It mints a real JWT for a known user, calls
 * `GET /auth/sessions` with the bearer token, and asserts 200 — the
 * route returns the user's session list (NOT 401).
 *
 * Why a JWT-based assertion rather than mocking the `auth()` helper:
 * the brief's stated strategy uses `auth()` from `next-auth`, but
 * `auth()` requires Next.js request context (headers() + cookies()
 * globals). A pure NestJS guard has only `Request` access — so we use
 * the lower-level `next-auth/jwt#decode` directly with the SAME
 * `secret` + `salt` as the NextAuth instance in `apps/api/src/lib/auth.ts`.
 * This is the same wire format that NextAuth v5 produces; clients
 * (slice 4) mint tokens through NextAuth's `signIn()` and consume them
 * here.
 *
 * Test discipline (per testing-standards):
 *  - AAA pattern.
 *  - No logic in tests.
 *  - No asserting on timestamps.
 *  - Mocks the Prisma singleton + bcryptjs at the boundary (same pattern
 *    as `auth.e2e-spec.ts`); the guard's `decode` is the seam under test.
 */

vi.mock("@core/database", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    account: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    verificationToken: { create: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

// `encode` is re-exported from `next-auth/jwt` (which re-exports from
// `@auth/core/jwt`). We import through the workspace `next-auth` path
// so we don't reach into `@auth/core` directly — that subpath is a
// transitive dep and may move between versions.
import { encode } from "next-auth/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { prisma } from "@core/database";

import { AuthModule } from "../src/modules/auth/auth.module.js";
import { NEXTAUTH_SESSION_TOKEN_NAME } from "../src/lib/auth.constants.js";

/**
 * The test secret. Must match the `process.env.NEXTAUTH_SECRET`
 * mutation at the top of this file (the production guard reads
 * `env.NEXTAUTH_SECRET` at runtime, so both encoder + decoder must
 * agree on the value).
 */
const TEST_NEXTAUTH_SECRET = "test-secret-at-least-32-characters-long-for-hkdf";

describe("JwtAuthGuard (T3.3 — NextAuth v5 backed)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    vi.resetAllMocks();
    moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
    }
  });

  describe("GET /auth/sessions with a valid NextAuth JWT", () => {
    it("returns 200 + the session list when the bearer JWT is valid", async () => {
      // Arrange — a known user + one active session in the DB.
      const userId = "user-1";
      const email = "alice@example.com";
      const role = "USER";
      const sessionToken = "session-token-abc";

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: userId,
        email,
        role,
        hashedPassword: "$2a$10$hash",
      } as never);
      vi.mocked(prisma.session.findMany).mockResolvedValue([
        {
          id: "session-1",
          sessionToken,
          userId,
          expires: new Date(Date.now() + 60 * 60 * 1000),
        },
      ] as never);

      // Mint a real NextAuth JWT with the same secret + salt as the
      // guard uses at decode time. The payload embeds the canonical
      // claims (`sub`, `email`, `role`, `userId`) — see the JWT
      // callback in `apps/api/src/lib/auth.config.ts` for the
      // exact shape on first sign-in.
      const jwt = await encode({
        token: {
          sub: userId,
          email,
          role,
          userId,
          name: null,
          picture: null,
        },
        secret: TEST_NEXTAUTH_SECRET,
        salt: NEXTAUTH_SESSION_TOKEN_NAME,
        maxAge: 30 * 24 * 60 * 60, // 30 days — matches NextAuth default
      });

      // Act — call GET /auth/sessions with the bearer JWT.
      const res = await request(app.getHttpServer())
        .get("/auth/sessions")
        .set("Authorization", `Bearer ${jwt}`);

      // Assert — 200 + the user's session list (NOT 401).
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: "session-1",
        sessionToken,
      });
    });

    it("returns 401 when the bearer JWT is malformed", async () => {
      // Arrange — no DB mocks needed; the guard rejects before
      // hitting any service. The token is a literal base64 blob
      // that fails JWE decryption.

      // Act
      const res = await request(app.getHttpServer())
        .get("/auth/sessions")
        .set("Authorization", "Bearer this.is.not.a.jwe");

      // Assert
      expect(res.status).toBe(401);
    });

    it("returns 401 when the bearer JWT was minted with a different secret", async () => {
      // Arrange — mint a JWT with a DIFFERENT secret. The guard's
      // HKDF-derived key won't decrypt it; the result is null,
      // which the guard treats as an invalid session.
      const foreignJwt = await encode({
        token: {
          sub: "user-1",
          email: "alice@example.com",
          role: "USER",
          userId: "user-1",
          name: null,
          picture: null,
        },
        secret: "another-secret-at-least-32-chars-long-for-hkdf",
        salt: NEXTAUTH_SESSION_TOKEN_NAME,
        maxAge: 30 * 24 * 60 * 60,
      });

      // Act
      const res = await request(app.getHttpServer())
        .get("/auth/sessions")
        .set("Authorization", `Bearer ${foreignJwt}`);

      // Assert
      expect(res.status).toBe(401);
    });

    it("returns 401 when no Authorization header is supplied", async () => {
      // Act — no Authorization header.
      const res = await request(app.getHttpServer()).get("/auth/sessions");

      // Assert
      expect(res.status).toBe(401);
    });
  });
});

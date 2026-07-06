import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TDD contract for the NestJS auth module (slice 3 batch 6 — brief
 * T3.6 RED).
 *
 * Per `openspec/changes/.../design.md` §4.1 the auth module is a thin
 * NestJS wrapper that does DI wiring + route binding only — no business
 * code. It imports the auth services from `@features/auth/server` and
 * exposes the six endpoints declared in design §4.1:
 *
 *   POST /auth/login
 *   POST /auth/register
 *   POST /auth/forgot-password
 *   POST /auth/reset-password
 *   GET /auth/sessions (auth required)
 *   DELETE /auth/sessions/:id (auth required)
 *
 * These tests drive the public surface end-to-end through
 * `Test.createTestingModule(...)` from `@nestjs/testing` + a
 * supertest-driven request simulator. They FAIL in RED because the
 * `AuthModule` / `AuthController` files do NOT exist yet.
 *
 * Test discipline (per testing-standards):
 *  - AAA pattern.
 *  - No logic in tests.
 *  - No asserting on timestamps.
 *  - Mock the prisma singleton + bcryptjs at the boundary; the
 *    service-layer patterns from events.test.ts / auth-service.*.test.ts
 *    keep working because the controllers themselves are thin.
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
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import { Test, type TestingModule } from "@nestjs/testing";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";

import { prisma } from "@core/database";
import bcrypt from "bcryptjs";

import { AuthModule } from "../src/modules/auth/auth.module.js";
import { AuthController } from "../src/modules/auth/auth.controller.js";

describe("AuthController (e2e)", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    vi.resetAllMocks();
    moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror the global validation pipe convention (the ZodValidationPipe
    // only applies to the body decorators; NestJS ValidationPipe is the
    // global default for everything else).
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
    }
  });

  describe("POST /auth/login", () => {
    it("rejects empty body with 400", async () => {
      await request(app.getHttpServer()).post("/auth/login").send({}).expect(400);
    });

    it("rejects malformed email with 400", async () => {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "not-an-email", password: "StrongP@ss123" })
        .expect(400);
    });

    it("returns 401 when credentials are invalid", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$hash",
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "alice@example.com", password: "WrongP@ss123" })
        .expect(401);
    });

    it("returns 200 + session token when credentials are valid", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$hash",
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(prisma.session.create).mockResolvedValue({
        id: "session-1",
        sessionToken: "session-token-abc",
        userId: "user-1",
        expires: new Date(Date.now() + 60_000),
      } as never);

      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "alice@example.com", password: "StrongP@ss123" });

      // The shape will be implemented in the GREEN commit; the RED
      // expectation is "the route exists, body parsed, prisma called".
      // We assert non-401 status here (200 or 201 are both acceptable
      // for the login happy path) — the GREEN commit will tighten.
      expect([200, 201]).toContain(res.status);
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /auth/register", () => {
    it("rejects missing name with 400 (canonical schema requires name)", async () => {
      await request(app.getHttpServer())
        .post("/auth/register")
        .send({ email: "alice@example.com", password: "StrongP@ss123" })
        .expect(400);
    });

    it("returns 201 + session token for a fresh registration", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue("$2a$10$new-hash" as never);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "user-new",
        email: "alice@example.com",
        name: "Alice",
        role: "USER",
        hashedPassword: "$2a$10$new-hash",
      } as never);
      vi.mocked(prisma.session.create).mockResolvedValue({
        id: "session-1",
        sessionToken: "session-token-xyz",
        userId: "user-new",
        expires: new Date(Date.now() + 60_000),
      } as never);

      const res = await request(app.getHttpServer())
        .post("/auth/register")
        .send({
          email: "alice@example.com",
          password: "StrongP@ss123",
          name: "Alice",
        });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it("returns 409 when email is already taken", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-existing",
        email: "existing@example.com",
        role: "USER",
        hashedPassword: "$2a$10$hash",
        name: "Existing",
      } as never);

      await request(app.getHttpServer())
        .post("/auth/register")
        .send({
          email: "existing@example.com",
          password: "StrongP@ss123",
          name: "Existing",
        })
        .expect(409);
    });
  });

  describe("POST /auth/forgot-password", () => {
    it("returns 202 idempotently (does not leak account existence)", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send({ email: "ghost@example.com" })
        .expect(202);
    });

    it("returns 202 for a known email (idempotent contract)", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-1",
        email: "alice@example.com",
        role: "USER",
        hashedPassword: "$2a$10$hash",
      } as never);

      await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send({ email: "alice@example.com" })
        .expect(202);
    });
  });

  describe("POST /auth/reset-password", () => {
    it("rejects a token shorter than 32 chars with 400", async () => {
      await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: "tooshort", newPassword: "NewP@ss123" })
        .expect(400);
    });

    it("returns 401 for an unknown reset token (generic error copy)", async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({
          token: "x".repeat(64),
          newPassword: "NewP@ss123",
        });

      expect(res.status).toBe(401);
      // Generic copy — no "not found" / "expired" / "consumed" wording.
      // The actual message will be pinned in the GREEN commit.
    });
  });

  describe("GET /auth/sessions (auth required)", () => {
    it("returns 401 when no Bearer token is supplied", async () => {
      await request(app.getHttpServer()).get("/auth/sessions").expect(401);
    });
  });

  describe("DELETE /auth/sessions/:id (auth required)", () => {
    it("returns 401 when no Bearer token is supplied", async () => {
      await request(app.getHttpServer())
        .delete("/auth/sessions/sess-1")
        .expect(401);
    });
  });
});

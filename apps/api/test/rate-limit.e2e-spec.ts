import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

import { AuthModule } from "../src/modules/auth/auth.module.js";
import { RATE_LIMITER_TOKEN } from "../src/shared/guards/rate-limit.guard.js";
import { InMemoryRateLimiter } from "@core/rate-limit";
import { prisma } from "@core/database";
import bcrypt from "bcryptjs";

vi.mock("@core/database", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    session: { create: vi.fn() },
    passwordResetToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

describe("RateLimitGuard (e2e, R-PF-8)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user-new",
      email: "user@example.com",
      name: "User",
      role: "USER",
      hashedPassword: "hash",
    } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({
      id: "session-1",
      sessionToken: "session-token",
      userId: "user-new",
      expires: new Date(Date.now() + 60_000),
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    vi.mocked(bcrypt.hash).mockResolvedValue("hash" as never);
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(RATE_LIMITER_TOKEN)
      .useFactory({ factory: () => new InMemoryRateLimiter() })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
  });

  it("returns 429 after the login limit is exceeded", async () => {
    let last: { status: number; headers: Record<string, string> } | null = null;
    for (let i = 0; i < 11; i += 1) {
      last = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: `user-${i}@example.com`, password: "StrongP@ss123" });
    }
    expect(last?.status).toBe(429);
    expect(Number(last?.headers["retry-after"] ?? 0)).toBeGreaterThan(0);
  });

  it("returns 429 after the register limit is exceeded", async () => {
    let last: { status: number } | null = null;
    for (let i = 0; i < 6; i += 1) {
      last = await request(app.getHttpServer())
        .post("/auth/register")
        .send({
          email: `reg-${i}@example.com`,
          password: "StrongP@ss123",
          name: `User ${i}`,
        });
    }
    expect(last?.status).toBe(429);
  });
});

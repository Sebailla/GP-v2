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

/**
 * M5.1 task 1.7 RED → 1.8 GREEN.
 *
 * D5 (design §2) — rate-limit tests share global state with two
 * surfaces that race under coverage instrumentation:
 *
 *   (a) The prom-client registry `rate_limit_blocked_total` is a
 *       process-singleton; another test file running in the same
 *       vitest worker can increment the counter between this test's
 *       `before` snapshot and `after` read, masking the increment
 *       assertion.
 *   (b) The `InMemoryRateLimiter` instance is rebuilt per
 *       `beforeEach`, but the global `metricsRegistry` is NOT —
 *       the `apps/api` globalPromClient instance is shared across
 *       files in the same worker.
 *
 * The fix is structural (D5): run this whole file SERIALLY so the
 * counter snapshots are stable, reset the registry in `beforeEach`
 * to start from a known baseline, and reset the limiter + flush any
 * pending timers in `afterEach`. This is the contract the M5.1
 * PR #1 commits to (tasks 1.7/1.8/1.9).
 *
 * Vitest 4 removed `describe.serial`; the upstream-blessed
 * replacement (per the migration guide's "concurrent tests"
 * section) is `describe(name, fn, { concurrent: false })`.
 */
describe("RateLimitGuard (e2e, R-PF-8)", { concurrent: false }, () => {
  let app: INestApplication;

  beforeEach(async () => {
    // Reset every vi.fn created in the file + the global mock state
    // before rebuilding the test module.
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
    // Reset the global prom-client registry so this test file's
    // before/after snapshots are stable (the singleton is shared
    // across files in the same worker). We import it here so the
    // mock is set up before `Test.createTestingModule` pulls in
    // the metrics module (which registers counters on import).
    const { metricsRegistry } = await import(
      "../src/modules/metrics/registry.js"
    );
    metricsRegistry.resetMetrics();
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
    // Flush any pending timers the runtime scheduled during the
    // test (the InMemoryRateLimiter is synchronous today, but
    // defensive cleanup future-proofs against the Upstash adapter
    // or the cron classes that may schedule cleanup callbacks).
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it("login rate-limit key includes email so DIFFERENT emails share no bucket (R-PF-8)", async () => {
    const responses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: `distinct-${i}@example.com`, password: "StrongP@ss123" });
      responses.push(res.status);
    }
    // Every distinct email from the same IP must NOT trip the per-IP
    // bucket. The mocked auth returns 401 (user not found); none of
    // the 11 requests may reach 429.
    for (const status of responses) {
      expect(status).toBe(401);
    }
    expect(responses.every((s) => s !== 429)).toBe(true);
  });

  it("login rate-limit key includes email so the 11th SAME email from same IP returns 429 (R-PF-8)", async () => {
    const sharedEmail = "same-email-bucket@example.com";
    let last: { status: number; headers: Record<string, string> } | null = null;
    for (let i = 0; i < 11; i += 1) {
      last = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: sharedEmail, password: "StrongP@ss123" });
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

  it("increments rate_limit_blocked_total{endpoint=\"auth:login\"} on 429 (R-PF-9)", async () => {
    const { metricsRegistry, rateLimitBlockedTotal } = await import(
      "../src/modules/metrics/registry.js"
    );
    // Reset the counter for this test by reading the value before.
    const before = await metricsRegistry.getSingleMetricAsString("rate_limit_blocked_total");
    const beforeLines = before.split("\n").filter((l) => l.startsWith("rate_limit_blocked_total{endpoint=\"auth:login\"}"));
    const beforeValue = beforeLines.length > 0 ? Number(beforeLines[0]!.split(" ").pop()) : 0;

    // Same email across all 11 requests — required by R-PF-8's
    // email-keyed bucket (auth:login). Distinct emails would each
    // get their own bucket and never trip the limiter.
    const sharedEmail = "metrics-shared-email@example.com";
    for (let i = 0; i < 11; i += 1) {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: sharedEmail, password: "StrongP@ss123" });
    }

    const after = await metricsRegistry.getSingleMetricAsString("rate_limit_blocked_total");
    const afterLines = after.split("\n").filter((l) => l.startsWith("rate_limit_blocked_total{endpoint=\"auth:login\"}"));
    expect(afterLines.length).toBeGreaterThan(0);
    const afterValue = Number(afterLines[0]!.split(" ").pop());
    // At least one block must have incremented the counter since `before`.
    expect(afterValue).toBeGreaterThan(beforeValue);
    // The label exists (confirms we used the right label key).
    expect(afterLines[0]).toContain("endpoint=\"auth:login\"");
    // Sanity: reference the symbol so tree-shaking does not strip it.
    void rateLimitBlockedTotal;
  });
});

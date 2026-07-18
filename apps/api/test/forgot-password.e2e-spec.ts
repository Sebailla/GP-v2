import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { MailAdapter, MailMessage } from "../src/mail/mail.adapter.js";

/**
 * TDD contract — Module-2 PR #3 task 3.3 + 3.4.
 *
 * Per `openspec/changes/module-2-public-auth/design.md` §3
 * (Data Flow: `POST forgot (Accept-Language) → requestReset(email,locale)
 * → sha256 row → MailAdapter → /{locale}/reset-password/{raw}`),
 * the forgot-password endpoint MUST:
 *
 *  1. Read the `Accept-Language` header and pass it as the `locale`
 *     argument to `PasswordResetService.requestReset`.
 *  2. The service dispatches `auth.password-reset.requested`; the
 *     controller subscribes to that event and invokes
 *     `MailAdapter.send` with the locale-aware reset URL.
 *  3. MailAdapter is bound via NestJS DI through `MAIL_ADAPTER`
 *     token (D3). The e2e test overrides this token with an
 *     InMemoryAdapter so we can assert the rendered envelope without
 *     touching the Gmail SMTP transport.
 *
 * Threat matrix (R-D-2 — Routing): the forgot-password endpoint
 * shares the same `auth:forgot` rate-limit bucket as the legacy
 * registration path; the 4th call from the same IP MUST return 429.
 * The existing `RateLimitGuard` enforces the limit per design
 * (3 per IP per hour); this test asserts the e2e behavior with an
 * in-memory rate limiter that survives the whole test.
 *
 * The `MailAdapter.send` invocation is the seam under test. We
 * override `MAIL_ADAPTER` with an `InMemoryAdapter` (a 30-line
 * module-local implementation, not the production console adapter —
 * keeps this test isolated from console spy pollution).
 */

vi.mock("@core/database", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    session: { create: vi.fn(), findUnique: vi.fn() },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

import { prisma } from "@core/database";
import { InMemoryRateLimiter } from "@core/rate-limit";

import { AuthModule } from "../src/modules/auth/auth.module.js";
import { RATE_LIMITER_TOKEN } from "../src/shared/guards/rate-limit.guard.js";
import { MAIL_ADAPTER } from "../src/mail/mail.module.js";

/**
 * In-memory MailAdapter that records every `send` invocation. Used
 * as the override value for the `MAIL_ADAPTER` DI token so the e2e
 * can assert envelope contents without touching the console (which
 * is the production adapter under `NODE_ENV=test`).
 */
class InMemoryMailAdapter implements MailAdapter {
  readonly messages: MailMessage[] = [];
  /** When set, `send` rejects with this error (simulates SMTP failure). */
  sendError: Error | null = null;
  async send(msg: MailMessage): Promise<void> {
    if (this.sendError !== null) {
      throw this.sendError;
    }
    this.messages.push(msg);
  }
}

describe("POST /auth/forgot-password (e2e — Module-2 PR #3 task 3.3 + 3.4)", () => {
  let app: INestApplication;
  let inMemoryAdapter: InMemoryMailAdapter;

  beforeEach(async () => {
    vi.resetAllMocks();
    inMemoryAdapter = new InMemoryMailAdapter();
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(RATE_LIMITER_TOKEN)
      .useValue(new InMemoryRateLimiter())
      .overrideProvider(MAIL_ADAPTER)
      .useValue(inMemoryAdapter)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
  });

  it("triggers MailAdapter.send exactly once with a `/es/reset-password/` URL when Accept-Language is `es`", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "alice@example.com",
      role: "USER",
      hashedPassword: "$2a$10$hash",
    } as never);
    vi.mocked(prisma.passwordResetToken.create).mockResolvedValue({
      id: "prt-1",
      userId: "user-1",
      tokenHash: "x".repeat(64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      consumedAt: null,
    } as never);

    const res = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .set("Accept-Language", "es")
      .send({ email: "alice@example.com" });

    // 202 — idempotent envelope (no enumeration leak).
    expect(res.status).toBe(202);

    // Exactly ONE send invocation. The locale in the rendered URL
    // matches the Accept-Language header.
    expect(inMemoryAdapter.messages).toHaveLength(1);
    const msg = inMemoryAdapter.messages[0]!;
    expect(msg.to).toBe("alice@example.com");
    // The reset URL appears somewhere in the body. D6 will define
    // the canonical template; for now we assert the locale-aware path.
    expect(msg.text).toMatch(/\/es\/reset-password\/[A-Za-z0-9_-]+/);
  });

  it("triggers MailAdapter.send with a `/en/reset-password/` URL when Accept-Language is `en`", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "alice@example.com",
      role: "USER",
      hashedPassword: "$2a$10$hash",
    } as never);
    vi.mocked(prisma.passwordResetToken.create).mockResolvedValue({
      id: "prt-1",
      userId: "user-1",
      tokenHash: "x".repeat(64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      consumedAt: null,
    } as never);

    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .set("Accept-Language", "en")
      .send({ email: "alice@example.com" });

    expect(inMemoryAdapter.messages).toHaveLength(1);
    expect(inMemoryAdapter.messages[0]!.text).toMatch(/\/en\/reset-password\/[A-Za-z0-9_-]+/);
  });

  it("does NOT trigger MailAdapter.send for an unknown email (idempotent 202, no enumeration)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .set("Accept-Language", "es")
      .send({ email: "ghost@example.com" });

    expect(inMemoryAdapter.messages).toHaveLength(0);
  });

  it("returns 429 after the 3rd call for the same email (auth:forgot email-keyed rate-limit)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    // R-PF-8 — auth:forgot is email-keyed (per design D-2 + rate-limit
    // guard). The 4th call with the SAME email MUST trip the bucket.
    // Distinct emails would each get their own bucket and never
    // reach the limit, so we use a shared email across all 4 calls.
    const sharedEmail = "ratelimit-shared@example.com";

    // 3 calls — bucket limit (3/hour per design D-2).
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .set("Accept-Language", "es")
        .send({ email: sharedEmail });
    }

    // 4th call MUST return 429 (rate limit guard, threat matrix Routing).
    const fourth = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .set("Accept-Language", "es")
      .send({ email: sharedEmail });

    expect(fourth.status).toBe(429);
  });

  it("returns 502 when the Gmail SMTP transport rejects (Module-2 PR #3 task 3.10 — TRIANGULATE)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "alice@example.com",
      role: "USER",
      hashedPassword: "$2a$10$hash",
    } as never);
    vi.mocked(prisma.passwordResetToken.create).mockResolvedValue({
      id: "prt-1",
      userId: "user-1",
      tokenHash: "x".repeat(64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      consumedAt: null,
    } as never);

    // Configure the in-memory adapter to reject on send — simulates
    // the Gmail SMTP transport rejecting (535 / connection refused /
    // timeout, etc.).
    inMemoryAdapter.sendError = new Error(
      "Invalid login: 535-5.7.8 Username and Password not accepted",
    );

    const res = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .set("Accept-Language", "es")
      .send({ email: "alice@example.com" });

    // Per forgot-password spec scenario "Gmail SMTP failure surfaces
    // 502": the response is 502 with a generic localized error. The
    // SMTP error code MUST NOT leak into the response body.
    expect(res.status).toBe(502);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/535-5\.7\.8/);
    expect(body.toLowerCase()).not.toMatch(/smtp|transport|connection refused/i);
  });
});
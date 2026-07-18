import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { encode } from "next-auth/jwt";
import { createHash } from "node:crypto";

import { NEXTAUTH_SESSION_TOKEN_NAME } from "../src/lib/auth.constants.js";
import { prisma } from "@core/database";
import { InMemoryRateLimiter } from "@core/rate-limit";

import { AuthModule } from "../src/modules/auth/auth.module.js";
import { RATE_LIMITER_TOKEN } from "../src/shared/guards/rate-limit.guard.js";
import { AUTH_DISPATCHER } from "../src/modules/auth/auth.dispatcher.js";
import { MAIL_ADAPTER } from "../src/mail/mail.module.js";
import type { MailAdapter, MailMessage } from "../src/mail/mail.adapter.js";

/**
 * TDD contract — Module-2 PR #3 tasks 3.5 + 3.6 + 3.10.
 *
 * Per `openspec/changes/module-2-public-auth/design.md` §2 D5:
 *   - `resetPassword` uses `@Res({passthrough:true}) Response`,
 *     calls `consumeReset`, mints NextAuth-compatible token, sets
 *     `authjs.session-token` via `response.cookie(...)`, returns
 *     `{redirectTo}` under `@HttpCode(200)`.
 *   - Passthrough preserves NestJS serialization + supertest
 *     while platform emits HttpOnly.
 *   - Express coupling tested via supertest (D5 future-proofing:
 *     future NestJS HTTP adapter swap, e.g. Fastify, requires
 *     revisiting `resetPassword` cookie emission — accepted as
 *     M2 scope).
 *
 * Acceptance contract per `password-reset-user-flow/spec.md`:
 *   1. Valid token → 200 + `Set-Cookie: authjs.session-token=...;
 *      HttpOnly; SameSite=Lax` + body `{redirectTo: "/{locale}/(app)"}`.
 *   2. Expired token → 400 with generic "invalid token" copy.
 *   3. Malformed / unknown / replayed token → 400 with generic
 *      "invalid token" copy (no enumeration side-channel).
 *
 * The e2e exercises the public surface end-to-end through
 * `Test.createTestingModule(...)` + supertest. We seed a
 * password-reset row directly via the mocked Prisma, mint the
 * `next-auth/jwt` session token manually so the controller's
 * JWT-mint path stays the seam under test, and assert the
 * response shape + headers.
 */

vi.mock("@core/database", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    session: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

/**
 * In-memory MailAdapter — the e2e for reset-password doesn't go
 * through MailAdapter (the controller only sends email on the
 * FORGOT path, not on reset). We keep the override so the
 * MAIL_ADAPTER provider resolves cleanly without binding Gmail.
 */
class InMemoryMailAdapter implements MailAdapter {
  readonly messages: MailMessage[] = [];
  async send(msg: MailMessage): Promise<void> {
    this.messages.push(msg);
  }
}

/**
 * Minimal AuthEventDispatcher stub for the AuthModule. The reset
 * controller doesn't dispatch new events on the consumeReset
 * path — `password-reset.completed` is dispatched inside the
 * service (and silently swallowed via AuditSink per F2). The
 * stub satisfies the DI wiring.
 */
const fakeDispatcher = {
  dispatch: vi.fn(async () => undefined),
  subscribe: vi.fn(() => () => undefined),
  replay: vi.fn(() => []),
  bufferSize: vi.fn(() => 0),
};

const TEST_NEXTAUTH_SECRET = "test-secret-at-least-32-characters-long-for-hkdf";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function mintSessionJwt(
  userId: string,
  email: string,
  role: "USER" | "ADMIN" = "USER",
): Promise<string> {
  return encode({
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
    maxAge: 30 * 24 * 60 * 60,
  });
}

describe("POST /auth/reset-password (e2e — Module-2 PR #3 tasks 3.5 + 3.6 + 3.10)", () => {
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
      .overrideProvider(AUTH_DISPATCHER)
      .useValue(fakeDispatcher)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
  });

  describe("happy path (D5 — passthrough cookie + JSON)", () => {
    it("returns 200, sets `authjs.session-token` HttpOnly+SameSite=Lax cookie, and body `{redirectTo: '/en/(app)'}`", async () => {
      const userId = "user-1";
      const email = "alice@example.com";
      const rawToken = "a".repeat(64);
      const tokenHash = sha256(rawToken);

      // Seed: a fresh, non-expired, non-consumed reset token row.
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: "prt-1",
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        consumedAt: null,
      } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: userId,
        email,
        role: "USER",
        hashedPassword: "$2a$10$old",
      } as never);

      // The controller invokes `consumeReset` which writes through
      // prisma.$transaction(tx => ...). Stub the tx + inner updates.
      // The cast is necessary because the real PrismaClient.$transaction
      // signature is tightly typed; the stub uses a narrower shape.
      vi.mocked(prisma.$transaction).mockImplementation(
        (async (cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            user: { update: vi.fn(async () => undefined) },
            passwordResetToken: { update: vi.fn(async () => undefined) },
          });
        }) as never,
      );

      const res = await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: rawToken, newPassword: "NewP@ss123" });

      // 200 — controller's @HttpCode(200) wins because passthrough
      // lets Nest serialize the return value (which is what the
      // controller returns: `{redirectTo: "/en/(app)"}`) AND lets
      // Express emit the Set-Cookie header.
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ redirectTo: "/en/(app)" });

      // The Set-Cookie header MUST be present (D5 platform coupling).
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeDefined();
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie!];
      const sessionCookie = cookies.find((c) => c.startsWith("authjs.session-token="));
      expect(sessionCookie).toBeDefined();
      // HttpOnly + SameSite=Lax (per D5 + NextAuth defaults).
      expect(sessionCookie!.toLowerCase()).toMatch(/httponly/);
      expect(sessionCookie!.toLowerCase()).toMatch(/samesite=lax/);

      // The cookie value MUST be a real NextAuth JWT minted with the
      // canonical salt (the controller's mint-via-`next-auth/jwt#encode`
      // path is the seam under test).
      const valueMatch = sessionCookie!.match(/^authjs\.session-token=([^;]+);/);
      expect(valueMatch).not.toBeNull();
      const jwtValue = decodeURIComponent(valueMatch![1]!);
      // The token is a JWE-compact (5 base64url segments separated by `.`).
      expect(jwtValue.split(".")).toHaveLength(5);
    });

    // Localization: per `openspec/changes/module-2-public-auth/spec.md`,
    // the user is redirected to `/{locale}/(app)` where locale matches the
    // locale of the reset link they clicked. The controller recovers the
    // locale by parsing Accept-Language on the POST (the browser follows
    // the localized link → posts from the same locale-aware session).
    it("returns redirectTo `/es/(app)` when Accept-Language is `es`", async () => {
      const userId = "user-1";
      const email = "alice@example.com";
      const rawToken = "e".repeat(64);
      const tokenHash = sha256(rawToken);

      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: "prt-es-1",
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        consumedAt: null,
      } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: userId,
        email,
        role: "USER",
        hashedPassword: "$2a$10$old",
      } as never);
      vi.mocked(prisma.$transaction).mockImplementation(
        (async (cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            user: { update: vi.fn(async () => undefined) },
            passwordResetToken: { update: vi.fn(async () => undefined) },
          });
        }) as never,
      );

      const res = await request(app.getHttpServer())
        .post("/auth/reset-password")
        .set("Accept-Language", "es")
        .send({ token: rawToken, newPassword: "NewP@ss123" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ redirectTo: "/es/(app)" });
    });

    it("returns redirectTo `/en/(app)` when Accept-Language is `en` (default fallback)", async () => {
      const userId = "user-1";
      const email = "alice@example.com";
      const rawToken = "f".repeat(64);
      const tokenHash = sha256(rawToken);

      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: "prt-en-1",
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        consumedAt: null,
      } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: userId,
        email,
        role: "USER",
        hashedPassword: "$2a$10$old",
      } as never);
      vi.mocked(prisma.$transaction).mockImplementation(
        (async (cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            user: { update: vi.fn(async () => undefined) },
            passwordResetToken: { update: vi.fn(async () => undefined) },
          });
        }) as never,
      );

      const res = await request(app.getHttpServer())
        .post("/auth/reset-password")
        .set("Accept-Language", "en-US,en;q=0.9")
        .send({ token: rawToken, newPassword: "NewP@ss123" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ redirectTo: "/en/(app)" });
    });
  });

  describe("threat matrix — Routing (D5 + spec scenarios)", () => {
    it("returns 400 with generic copy for a malformed token (no enumeration)", async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: "a".repeat(64), newPassword: "NewP@ss123" });

      expect(res.status).toBe(400);
      // Generic copy — no "expired" / "consumed" / "not found" wording.
      const message = JSON.stringify(res.body).toLowerCase();
      expect(message).not.toMatch(/expired/);
      expect(message).not.toMatch(/consumed/);
      expect(message).not.toMatch(/not found/);
    });

    it("returns 400 with generic copy for an expired token", async () => {
      const rawToken = "b".repeat(64);
      const tokenHash = sha256(rawToken);
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: "prt-2",
        userId: "user-1",
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
        consumedAt: null,
      } as never);

      const res = await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: rawToken, newPassword: "NewP@ss123" });

      expect(res.status).toBe(400);
      const message = JSON.stringify(res.body).toLowerCase();
      expect(message).not.toMatch(/expired/);
    });

    it("returns 400 with generic copy for a replayed (already-consumed) token", async () => {
      const rawToken = "c".repeat(64);
      const tokenHash = sha256(rawToken);
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
        id: "prt-3",
        userId: "user-1",
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        consumedAt: new Date(Date.now() - 30_000), // consumed 30s ago
      } as never);

      const res = await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: rawToken, newPassword: "NewP@ss123" });

      expect(res.status).toBe(400);
      const message = JSON.stringify(res.body).toLowerCase();
      expect(message).not.toMatch(/consumed/);
    });

    it("returns 400 for a syntactically invalid token (fails the Zod schema)", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: "tooshort", newPassword: "NewP@ss123" });

      expect(res.status).toBe(400);
    });

    it("returns 400 with generic copy for a forged token (no matching row)", async () => {
      vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({
          token: "d".repeat(64),
          newPassword: "NewP@ss123",
        });

      // Module-2 PR #3 task 3.10: forged tokens (no row in the DB)
      // collapse to the same generic 400 as expired / replayed /
      // malformed — no enumeration side-channel.
      expect(res.status).toBe(400);
    });
  });
});
import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Writable } from "node:stream";
import { createRequire } from "node:module";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

/**
 * R-PF-5 / REJUDGE-1 — pino redact actually fires for the
 * AuthController's mail-failure log path.
 *
 * Background. Round-1 commit `ff95fa1` converted the controller's
 * `forgotPassword` 502 log call from a string template to the
 * structured-object form, which is a *prerequisite* for pino
 * redaction — pino redact paths operate on JSON object keys, not
 * string substrings. The round-1 verification proved the
 * *structural* shape of the call site was correct, but the
 * controller's `logger` field was still `new Logger(AuthController.name)`
 * from `@nestjs/common`, which routes through NestJS's
 * `ConsoleLogger` and writes via `util.inspect` to
 * `process.stderr.write`. Pino's global redact list
 * (`libs/core/logging/src/redaction.ts:37-38` covers `email` and
 * `*.email`) has zero effect on that path because the redact list
 * is only consulted when serializing through pino.
 *
 * This unit test pins the END-TO-END contract: the recipient email
 * NEVER appears verbatim in the rendered log line on the 502
 * / SMTP-failure path. The test:
 *
 *   1. Replaces `@core/logging`'s `createLogger` (via the
 *      hoisted `vi.mock` form so Vitest applies it before the
 *      AuthModule import chain is evaluated) with a real pino
 *      instance piped to an in-memory `Writable`. The mock
 *      factory reaches into a module-scoped handle that
 *      `beforeEach` rebinds to a fresh sink per test. Mirrors the
 *      capture pattern at
 *      `libs/core/logging/src/__tests__/logger.test.ts:25-38`.
 *      A real pino instance is critical — a stub that records the
 *      structured payload verbatim would not exercise the global
 *      redact list and would always "pass" without proving anything.
 *
 *   2. Boots the AuthModule through `Test.createTestingModule(...)`
 *      so the controller's field initializer — `this.logger =
 *      createLogger(...)` — runs against our mocked factory.
 *      Without the wiring fix, the controller still constructs
 *      `new Logger(AuthController.name)` from `@nestjs/common`,
 *      which writes to stderr through `util.inspect` and never
 *      touches our pino sink.
 *
 *   3. Forces the 502 branch by binding a `FailingMailAdapter`
 *      and using the same happy-path Prisma mocks as the existing
 *      `forgot-password.e2e-spec.ts` so a valid user lookup
 *      triggers the `dispatch → send → throw → MailDeliveryError`
 *      sequence.
 *
 *   4. Asserts the captured log line contains the `[REDACTED]`
 *      censor AND does NOT contain the recipient email.
 *
 * RED → GREEN: before the wiring fix, the controller imports
 * `new Logger(...)` from `@nestjs/common` and writes through
 * `util.inspect` to `process.stderr.write`. The captured sink
 * receives no lines because the controller never goes through
 * pino. After the wiring fix the controller goes through pino,
 * the global redact list catches the recipient email, and both
 * assertions pass.
 */

// Module-scoped handle so the hoisted vi.mock factory can resolve
// `createLogger` to the per-test pino sink. The factory below is
// hoisted by Vitest's transformer BEFORE any `import` statement is
// evaluated, so a `let capturedSink` declared with `let` in this
// file would not be in scope when the factory closes over it.
// Vitest's transformer hoists `vi.mock` to the top of the module,
// and the factory runs the first time a module under test evaluates
// `createLogger` — by then the `let` binding has been initialized
// for the test in flight. This is the same pattern used by
// NestJS's `@nestjs/testing` integration tests in this repo.
//
// `pino` is resolved from `@core/logging`'s own node_modules via
// `createRequire` because `apps/api` does not declare pino as a
// direct dependency — it arrives transitively through
// `@core/logging`. Pinning the resolver to `@core/logging`'s
// `index.ts` entry makes the resolution explicit and stable across
// pnpm hoisting layouts without relying on the `exports` field
// (which does not expose `package.json`).
const loggingRequire = createRequire(
  // The `index.ts` entry is declared in `@core/logging`'s `exports`
  // map; resolving it gives `createRequire` a stable anchor inside
  // the package's installed location.
  require.resolve("@core/logging"),
);
type PinoLogger = {
  info: (objOrMsg: unknown, msg?: string) => void;
  error: (objOrMsg: unknown, msg?: string) => void;
  warn: (objOrMsg: unknown, msg?: string) => void;
  debug: (objOrMsg: unknown, msg?: string) => void;
  trace: (objOrMsg: unknown, msg?: string) => void;
  fatal: (objOrMsg: unknown, msg?: string) => void;
  level: string;
  child: (bindings: Record<string, unknown>) => PinoLogger;
};
let activePino: PinoLogger | undefined;

vi.mock("@core/logging", () => ({
  createLogger: () => {
    if (!activePino) {
      throw new Error(
        "test bug: @core/logging was queried before activePino was set in beforeEach",
      );
    }
    return activePino;
  },
}));

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

import type { MailAdapter, MailMessage } from "../../../mail/mail.adapter.js";
import { MAIL_ADAPTER } from "../../../mail/mail.module.js";
import { InMemoryRateLimiter } from "@core/rate-limit";

import { prisma } from "@core/database";
import { AuthModule } from "../auth.module.js";
import { RATE_LIMITER_TOKEN } from "../../../shared/guards/rate-limit.guard.js";

/**
 * MailAdapter that always rejects with a deterministic SMTP-style
 * error. Mirrors the `setShouldFailOnce` pattern from the
 * existing `forgot-password.e2e-spec.ts:217-219` but is always-on
 * because the test only exercises the failure path.
 */
class AlwaysFailingMailAdapter implements MailAdapter {
  readonly sendError: Error = new Error(
    "Invalid login: 535-5.7.8 Username and Password not accepted",
  );
  readonly sentMessages: MailMessage[] = [];
  async send(msg: MailMessage): Promise<void> {
    this.sentMessages.push(msg);
    throw this.sendError;
  }
}

describe("AuthController.forgotPassword mail-failure log — pino redaction (REJUDGE-1, R-PF-5)", () => {
  let lines: string[];
  let app: INestApplication;
  let failingAdapter: AlwaysFailingMailAdapter;

  beforeEach(async () => {
    vi.resetAllMocks();

    // 1. Capture pino output into an in-memory Writable.
    lines = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb): void {
        lines.push(chunk.toString("utf8"));
        cb();
      },
    });

    // 2. Build a real pino instance configured with the same
    //    `email` redact path the production factory applies. We
    //    mirror the path list (NOT import it from the production
    //    redaction module) so the test stays self-contained and
    //    only pins the pino behavior we care about: the literal
    //    `email` key gets redacted to `[REDACTED]`.
    // `pino` is resolved through `@core/logging`'s install path so
    // apps/api does NOT need a direct dep on pino (it arrives
    // transitively through `@core/logging`). We cast through
    // `unknown` so `tsc --noEmit` doesn't try to resolve pino's
    // types — they live in `@core/logging/node_modules/pino` and
    // aren't on apps/api's type graph.
    const pinoFactory = loggingRequire("pino") as (
      options: Record<string, unknown>,
      destination: Writable,
    ) => PinoLogger;
    activePino = pinoFactory(
      {
        level: "info",
        redact: {
          paths: ["email", "*.email"],
          censor: "[REDACTED]",
        },
      },
      stream,
    );

    // 3. Bind a failing MailAdapter so the 502 branch fires.
    failingAdapter = new AlwaysFailingMailAdapter();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(RATE_LIMITER_TOKEN)
      .useValue(new InMemoryRateLimiter())
      .overrideProvider(MAIL_ADAPTER)
      .useValue(failingAdapter)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
    activePino = undefined;
  });

  it("writes the 502 mail-failure log through pino so the recipient email is redacted", async () => {
    // Force the happy-path: user exists, token mint succeeds.
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
      .set("Accept-Language", "en")
      .send({ email: "alice@example.com" });

    // 502 per forgot-password spec scenario "Gmail SMTP failure
    // surfaces 502".
    expect(res.status).toBe(502);
    expect(failingAdapter.sentMessages).toHaveLength(1);

    // The pino sink must have received the structured log line.
    // Before the wiring fix the controller's `new Logger(...)`
    // bypasses pino entirely, so `lines` is empty and these
    // assertions fail.
    const serialized = lines.join("");
    // The recipient email MUST be redacted — REJUDGE-1 contract.
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("alice@example.com");
    // The structured-log marker from `auth.controller.ts:371`
    // must be present.
    expect(serialized).toContain("[mail] delivery failed");
    // The SMTP error envelope IS intentionally captured under the
    // `err` key for operator-side debugging — it must still flow
    // through the log line, just NOT inside the redacted `email`
    // slot. We pin the structured shape so a future regression
    // (e.g. someone moving `err` back into the message template)
    // is caught.
    const parsed = JSON.parse(serialized.trim().split("\n").pop() ?? "{}") as {
      mail?: { adapter?: string };
      email?: string;
      err?: string;
      msg?: string;
    };
    expect(parsed.mail?.adapter).toBe("forgot-password");
    expect(parsed.email).toBe("[REDACTED]");
    expect(parsed.err).toMatch(/535-5\.7\.8/);
    expect(parsed.msg).toBe("[mail] delivery failed");
  });
});

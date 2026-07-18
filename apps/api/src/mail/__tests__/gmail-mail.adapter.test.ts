import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nodemailerMock from "nodemailer-mock";

import { env } from "@core/config";

import { GmailMailAdapter } from "../gmail-mail.adapter";
import type { MailMessage } from "../mail.adapter";

/**
 * D7 (Gmail env contract) — RED → GREEN → REFACTOR contract.
 *
 * The adapter MUST deliver through a `nodemailer` transport
 * configured with `service: "gmail"` and authenticated with
 * `GMAIL_USER` + `GMAIL_APP_PASSWORD`. The SMTP envelope MUST
 * originate from `no-reply@<PRODUCT_DOMAIN>`. SMTP rejections
 * propagate to the caller.
 *
 * Test strategy: `vi.mock("nodemailer")` swaps in
 * `nodemailerMock.getMockFor(realNodemailer)`. Production code
 * reads `nodemailer.createTransport(...)` and `transport.sendMail()`.
 * After each test we reset the mock and remove the swapped module.
 *
 * `from: no-reply@<PRODUCT_DOMAIN>` derivation: the spec makes
 * `PRODUCT_DOMAIN` a deployment-time fixture. We approximate it
 * with `env.PUBLIC_WEB_URL`'s hostname so the adapter stays
 * testable; production wiring will inject a real PRODUCT_DOMAIN
 * once a top-level app constant is introduced.
 *
 * The constructor signature changes from `(dsn: string)` to
 * `(user: string, password: string)` because the kill-switch
 * (D3) bypasses MAIL_DSN when the Gmail branch is active — the
 * DSN is no longer the source of truth.
 */

const PRODUCT_DOMAIN_FALLBACK = (() => {
  try {
    const raw = env.PUBLIC_WEB_URL;
    if (typeof raw === "string" && raw.length > 0) {
      return new URL(raw).hostname;
    }
  } catch {
    /* fall through */
  }
  return "localhost";
})();

const baseMessage: MailMessage = {
  to: "user@example.com",
  subject: "Reset password",
  text: "Click https://localhost:3000/en/reset-password/abc",
};

const expectCreateTransportCallUsesGmailService = (
  captured: Readonly<Record<string, unknown>> | undefined,
): void => {
  expect(captured).toBeDefined();
  expect(captured?.service).toBe("gmail");
};

const expectEnvelopeFromToIsCorrect = (
  sentMail: ReadonlyArray<{ from?: unknown; to?: unknown }>,
): void => {
  expect(sentMail).toHaveLength(1);
  const envelope = sentMail[0];
  expect(envelope?.from).toBe(`no-reply@${PRODUCT_DOMAIN_FALLBACK}`);
  expect(envelope?.to).toBe(baseMessage.to);
};

// Calls to `createTransport(...)` made by production code. Reset in
// `beforeEach`. The `nodemailer-mock` module does NOT expose the
// captured options argument out of the box, so we wrap its
// `createTransport` to retain the call history alongside the
// mock's internal _sentMail cache.
const createTransportCalls: Array<Record<string, unknown>> = [];

describe("GmailMailAdapter (D7 — Module 2)", () => {
  beforeEach(() => {
    vi.resetModules();
    createTransportCalls.length = 0;
    // Inject `nodemailer` for the duration of this test suite so the
    // production code under test picks up the mock instead of the
    // real SMTP transport. The mock reproduces nodemailer's API
    // surface: `createTransport(...)` returns a transport whose
    // `sendMail(...)` records the sent message.
    //
    // `nodemailer-mock` is a CommonJS module; its `module.exports`
    // IS the mock function (also exposing `.createTransport` and
    // `.mock`). We register a dual-shape wrapper that records the
    // call arguments and exposes the mock under both default and
    // named exports so any production import style resolves to it.
    const wrapped = Object.assign(
      (addr: unknown, opts?: Record<string, unknown>) =>
        nodemailerMock.createTransport(
          addr as Record<string, unknown> | undefined,
          opts,
        ),
      {
        createTransport: (options: Record<string, unknown>) => {
          createTransportCalls.push(options);
          return nodemailerMock.createTransport(options);
        },
        mock: nodemailerMock.mock,
      },
    );
    vi.doMock("nodemailer", () => ({
      default: wrapped,
      ...wrapped,
    }));
    // Reset call history so each test starts with a clean slate.
    nodemailerMock.mock.reset();
  });

  afterEach(() => {
    vi.doUnmock("nodemailer");
    vi.resetModules();
    nodemailerMock.mock.reset();
    createTransportCalls.length = 0;
  });

  it("creates a nodemailer transport with service=\"gmail\" and auth=user+password", async () => {
    // Re-import the adapter AFTER the mock is in place — otherwise
    // the production code's `import nodemailer` is hoisted to a
    // reference captured before vi.doMock takes effect.
    const adapterModule = await import("../gmail-mail.adapter");
    const adapter = new adapterModule.GmailMailAdapter("alerts@example.com", "abcdefghijklmnop");
    await adapter.send(baseMessage);

    expect(createTransportCalls).toHaveLength(1);
    expectCreateTransportCallUsesGmailService(createTransportCalls[0]);
    expectEnvelopeFromToIsCorrect(nodemailerMock.mock.getSentMail());
  });

  it("uses the credentials passed to the constructor (does not pick MAIL_DSN)", async () => {
    const adapterModule = await import("../gmail-mail.adapter");
    const adapter = new adapterModule.GmailMailAdapter(
      "ops@example.com",
      "zyxwvutsrqponmlk",
    );
    await adapter.send(baseMessage);

    expect(createTransportCalls).toHaveLength(1);
    const auth = (createTransportCalls[0] as { auth?: { user?: string } }).auth;
    expect(auth?.user).toBe("ops@example.com");

    const sentMail = nodemailerMock.mock.getSentMail();
    expectEnvelopeFromToIsCorrect(sentMail);
  });

  it("propagates SMTP rejection from the underlying transport", async () => {
    const adapterModule = await import("../gmail-mail.adapter");
    const adapter = new adapterModule.GmailMailAdapter("alerts@example.com", "abcdefghijklmnop");

    // Tell the mock to fail the next sendMail with a deterministic
    // error so we can assert the rejection propagates verbatim.
    const smtpError = new Error("Invalid login: 535-5.7.8 Username and Password not accepted");
    nodemailerMock.mock.setShouldFailOnce();
    nodemailerMock.mock.setFailResponse(smtpError);

    await expect(adapter.send(baseMessage)).rejects.toThrow(
      /Username and Password not accepted/,
    );

    // The send attempt must have actually fired against the
    // transport — otherwise the error would never have surfaced.
    expect(createTransportCalls).toHaveLength(1);
  });

  it("logs the send failure under pino bracket [email] for redaction", async () => {
    // Inject a hand-rolled pino-compatible logger into the adapter
    // so we can observe what the adapter hands pino at the point of
    // the error. The pino bracket `[email]` contract requires the
    // recipient address to live under an `email` key (not `to` or
    // any hyphenated form) so the global redaction list at
    // libs/core/logging/src/redaction.ts catches it before
    // serialization.
    const captured: Array<{ meta: unknown; message: string }> = [];
    const fakeLogger = {
      error: (meta: unknown, message: string): void => {
        captured.push({ meta, message });
      },
      info: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      trace: () => undefined,
      fatal: () => undefined,
      child: () => fakeLogger,
      level: "error",
    };

    const adapterModule = await import("../gmail-mail.adapter");
    const adapter = new adapterModule.GmailMailAdapter(
      "alerts@example.com",
      "abcdefghijklmnop",
      { logger: fakeLogger as never },
    );

    const smtpError = new Error("connection refused");
    nodemailerMock.mock.setShouldFailOnce();
    nodemailerMock.mock.setFailResponse(smtpError);

    await expect(adapter.send(baseMessage)).rejects.toThrow(/connection refused/);

    expect(captured).toHaveLength(1);
    const entry = captured[0];
    if (!entry) throw new Error("captured entry missing");
    expect(entry.message).toBe("gmail adapter: send failed");
    const meta = entry.meta as Record<string, unknown>;
    expect(meta).toHaveProperty("email");
    expect(meta.email).toBe(baseMessage.to);
    // Pino redaction looks at the literal key `email` on the
    // structured payload — downstream serialize time replaces the
    // value with `[REDACTED]`. Our fake logger does NOT do that
    // (the redaction is a pino concern, covered by
    // libs/core/logging/src/__tests__/logger.test.ts). What we
    // verify here is the adapter's contract: hand pino a payload
    // keyed `email` so the global redaction list catches it.
    expect(meta).toHaveProperty("err");
  });
});

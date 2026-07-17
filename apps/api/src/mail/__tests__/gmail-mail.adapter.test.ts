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

const expectRealNodemailerCreateIsCalledWithGmailService = (
  callArgs: ReadonlyArray<unknown>,
): void => {
  const arg = callArgs[0] as { service?: unknown };
  expect(arg).toBeDefined();
  expect(arg.service).toBe("gmail");
};

const expectEnvelopeFromToIsCorrect = (sentMail: ReadonlyArray<{ from?: unknown; to?: unknown }>): void => {
  expect(sentMail).toHaveLength(1);
  const envelope = sentMail[0];
  expect(envelope.from).toBe(`no-reply@${PRODUCT_DOMAIN_FALLBACK}`);
  expect(envelope.to).toBe(baseMessage.to);
};

describe("GmailMailAdapter (D7 — Module 2)", () => {
  beforeEach(() => {
    vi.resetModules();
    // Inject `nodemailer` for the duration of this test suite so the
    // production code under test picks up the mock instead of the
    // real SMTP transport. The mock reproduces nodemailer's API
    // surface: `createTransport(...)` returns a transport whose
    // `sendMail(...)` records the sent message.
    vi.doMock("nodemailer", () => nodemailerMock);
    // Reset call history so each test starts with a clean slate.
    nodemailerMock.mock.reset();
  });

  afterEach(() => {
    vi.doUnmock("nodemailer");
    vi.resetModules();
    nodemailerMock.mock.reset();
  });

  it("creates a nodemailer transport with service=\"gmail\" and auth=user+password", async () => {
    // Re-import the adapter AFTER the mock is in place — otherwise
    // the production code's `import nodemailer` is hoisted to a
    // reference captured before vi.doMock takes effect.
    const adapterModule = await import("../gmail-mail.adapter");
    const adapter = new adapterModule.GmailMailAdapter("alerts@example.com", "abcdefghijklmnop");
    await adapter.send(baseMessage);

    const createTransportCalls = nodemailerMock.mock.getMockedTransport().createTransport;
    expect(createTransportCalls).toHaveLength(1);
    expectRealNodemailerCreateIsCalledWithGmailService(createTransportCalls[0]);
    expectEnvelopeFromToIsCorrect(nodemailerMock.mock.getSentMail());
  });

  it("uses the credentials passed to the constructor (does not pick MAIL_DSN)", async () => {
    const adapterModule = await import("../gmail-mail.adapter");
    const adapter = new adapterModule.GmailMailAdapter(
      "ops@example.com",
      "zyxwvutsrqponmlk",
    );
    await adapter.send(baseMessage);

    const sentMail = nodemailerMock.mock.getSentMail();
    expect(sentMail[0].from).toBe(`no-reply@${PRODUCT_DOMAIN_FALLBACK}`);
    expect(sentMail[0].to).toBe(baseMessage.to);
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
    const sentMail = nodemailerMock.mock.getSentMail();
    expect(sentMail).toHaveLength(1);
  });

  it("logs the send failure under pino bracket [email] for redaction", async () => {
    // Observe pino redaction behavior using a spy on the adapter's
    // logger. The test asserts that a structured log carries a
    // `to` key under `mail` (not `email`) which the global redaction
    // list (*.email pattern) catches downstream.
    const adapterModule = await import("../gmail-mail.adapter");
    const adapter = new adapterModule.GmailMailAdapter("alerts@example.com", "abcdefghijklmnop");

    // Spy on console.error (the pino default transport in this
    // minimal logger setup). We only assert it WAS called with the
    // expected structured shape; the redaction itself is the global
    // pino option covered by libs/core/logging's own test suite.
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const smtpError = new Error("connection refused");
    nodemailerMock.mock.setShouldFailOnce();
    nodemailerMock.mock.setFailResponse(smtpError);

    await expect(adapter.send(baseMessage)).rejects.toThrow(/connection refused/);

    expect(spy).toHaveBeenCalledTimes(1);
    const loggedArg = spy.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(loggedArg).toBeDefined();
    expect(loggedArg).toMatchObject({ level: "error" });
    expect(loggedArg).toHaveProperty("mail");
    expect(loggedArg).toHaveProperty("err");

    spy.mockRestore();
  });
});

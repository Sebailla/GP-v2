import { createLogger, type Logger } from "@core/logging";
import { env } from "@core/config";

import type { MailAdapter, MailMessage } from "./mail.adapter.js";

/**
 * Gmail transport adapter (D7).
 *
 * `nodemailer.createTransport({ service: "gmail", auth })` authenticates
 * via a Google App Password (NOT the user's regular login password).
 * The envelope is hard-coded `from: no-reply@<PRODUCT_DOMAIN>` so the
 * incoming mailbox always sees the same sender regardless of which
 * operator populated the secret.
 *
 * `PRODUCT_DOMAIN` derivation: we use the hostname of
 * `env.PUBLIC_WEB_URL` for now. Production deployments can replace
 * this with a dedicated env var when the top-level product-domain
 * constant is introduced.
 *
 * Pino redaction (R-PF-5): the global redaction list at
 * `libs/core/logging/src/redaction.ts` already covers `email` and
 * `*.email`. We deliberately place the recipient address under an
 * `email` key when logging failures so the global list catches it
 * without any additional configuration.
 *
 * The constructor signature is `(user, password)` — the kill-switch
 * (D3) bypasses MAIL_DSN when the Gmail branch is active, so the DSN
 * is no longer the source of truth.
 */
export class GmailMailAdapter implements MailAdapter {
  private readonly logger: Logger;
  private readonly productDomain: string;

  constructor(
    private readonly user: string,
    private readonly password: string,
    options: { logger?: Logger; productDomain?: string } = {},
  ) {
    if (typeof user !== "string" || user.length === 0) {
      throw new Error("GmailMailAdapter requires a non-empty GMAIL_USER");
    }
    if (typeof password !== "string" || password.length < 16) {
      throw new Error("GmailMailAdapter requires GMAIL_APP_PASSWORD of at least 16 chars");
    }
    this.logger = options.logger ?? createLogger({
      LOG_LEVEL: env.LOG_LEVEL,
      NODE_ENV: env.NODE_ENV,
    });
    this.productDomain = options.productDomain ?? deriveProductDomain(env.PUBLIC_WEB_URL);
  }

  async send(msg: MailMessage): Promise<void> {
    // Lazy import so the dynamic `vi.doMock("nodemailer", ...)` in
    // the test suite can swap the module before this binding is
    // resolved. A static top-level import captures the real
    // nodemailer at module-load time and bypasses the mock.
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: this.user, pass: this.password },
    });

    try {
      await transport.sendMail({
        from: `no-reply@${this.productDomain}`,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
    } catch (err) {
      // Pino bracket notation: place the recipient under an
      // `email` key (alongside `err`) so the global redaction list
      // catches it before serialization. The `mail` namespace is
      // a low-cardinality bucket for the adapter name.
      this.logger.error(
        { mail: { adapter: "gmail" }, email: msg.to, err },
        "gmail adapter: send failed",
      );
      throw err;
    }
  }
}

function deriveProductDomain(publicWebUrl: string | undefined): string {
  if (typeof publicWebUrl !== "string" || publicWebUrl.length === 0) {
    return "localhost";
  }
  try {
    return new URL(publicWebUrl).hostname;
  } catch {
    return "localhost";
  }
}

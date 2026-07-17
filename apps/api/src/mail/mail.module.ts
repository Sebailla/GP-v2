import { Module } from "@nestjs/common";

import { env } from "@core/config";

import { ConsoleMailAdapter } from "./console-mail.adapter.js";
import { GmailMailAdapter } from "./gmail-mail.adapter.js";
import type { MailAdapter } from "./mail.adapter.js";

export const MAIL_ADAPTER = "MAIL_ADAPTER";

/**
 * D3 (Mail binding) — selection logic. Task 2.5 will replace this
 * provisional shape with the formal precedence test. For now, we
 * keep this file compilable by threading (user, password) through
 * the env contract.
 */
@Module({
  providers: [
    {
      provide: MAIL_ADAPTER,
      useFactory: (): MailAdapter => {
        const dsn = env.MAIL_DSN;
        const gmailUser = env.GMAIL_USER;
        const gmailPassword = env.GMAIL_APP_PASSWORD;
        if (typeof dsn === "string" && dsn.length > 0 && env.NODE_ENV !== "development") {
          // Kill-switch path: real DSN wins. The Gmail branch is
          // not bound here (D3).
          return new ConsoleMailAdapter();
        }
        if (
          env.NODE_ENV === "production" &&
          typeof gmailUser === "string" &&
          typeof gmailPassword === "string"
        ) {
          return new GmailMailAdapter(gmailUser, gmailPassword);
        }
        return new ConsoleMailAdapter();
      },
    },
  ],
  exports: [MAIL_ADAPTER],
})
export class MailModule {}

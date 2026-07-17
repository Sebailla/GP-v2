import { Module } from "@nestjs/common";

import { env } from "@core/config";

import { ConsoleMailAdapter } from "./console-mail.adapter.js";
import { GmailMailAdapter } from "./gmail-mail.adapter.js";
import type { MailAdapter } from "./mail.adapter.js";

export const MAIL_ADAPTER = "MAIL_ADAPTER";

@Module({
  providers: [
    {
      provide: MAIL_ADAPTER,
      useFactory: (): MailAdapter => {
        const dsn = env.MAIL_DSN;
        if (typeof dsn === "string" && dsn.length > 0 && env.NODE_ENV !== "development") {
          return new GmailMailAdapter(dsn);
        }
        return new ConsoleMailAdapter();
      },
    },
  ],
  exports: [MAIL_ADAPTER],
})
export class MailModule {}

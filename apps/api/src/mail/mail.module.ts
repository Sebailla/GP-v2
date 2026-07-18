import { Module } from "@nestjs/common";

import type { Env } from "@core/config";
import { env } from "@core/config";

import { ConsoleMailAdapter } from "./console-mail.adapter.js";
import { GmailMailAdapter } from "./gmail-mail.adapter.js";
import type { MailAdapter } from "./mail.adapter.js";

export const MAIL_ADAPTER = "MAIL_ADAPTER";

/**
 * D3 (Mail binding) — selection logic.
 *
 * Pure function: takes a `Env` snapshot and returns the binding.
 * The Nest factory below delegates to this so the rules are
 * testable WITHOUT process.env mutation (the @core/config
 * singleton is frozen at first parse).
 *
 * Precedence (per design.md \u00a72 / spec mail-adapter-port):
 *   1. MAIL_DSN set \u2192 Console (developer kill-switch — D3 wins,
 *      accidental Gmail sends are prevented)
 *   2. NODE_ENV === "production" AND Gmail env present \u2192 Gmail
 *   3. Otherwise \u2192 Console
 *
 * The second branch is the D7 contract: production boots that
 * configured Gmail must deliver through `nodemailer.createTransport`
 * (not the console log). Dev / test never bind Gmail regardless
 * of what env vars say.
 */
export function selectMailAdapter(envSnapshot: Env): MailAdapter {
  if (typeof envSnapshot.MAIL_DSN === "string" && envSnapshot.MAIL_DSN.length > 0) {
    return new ConsoleMailAdapter();
  }
  if (
    envSnapshot.NODE_ENV === "production" &&
    typeof envSnapshot.GMAIL_USER === "string" &&
    envSnapshot.GMAIL_USER.length > 0 &&
    typeof envSnapshot.GMAIL_APP_PASSWORD === "string" &&
    envSnapshot.GMAIL_APP_PASSWORD.length >= 16
  ) {
    return new GmailMailAdapter(envSnapshot.GMAIL_USER, envSnapshot.GMAIL_APP_PASSWORD);
  }
  return new ConsoleMailAdapter();
}

@Module({
  providers: [
    {
      provide: MAIL_ADAPTER,
      useFactory: (): MailAdapter => selectMailAdapter(env),
    },
  ],
  exports: [MAIL_ADAPTER],
})
export class MailModule {}

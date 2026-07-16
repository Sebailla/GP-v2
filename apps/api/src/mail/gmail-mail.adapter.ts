import type { MailAdapter, MailMessage } from "./mail.adapter.js";

export class GmailMailAdapter implements MailAdapter {
  constructor(private readonly dsn: string) {
    if (!dsn.startsWith("smtp://")) {
      throw new Error(`GmailMailAdapter requires an smtp:// DSN; got ${dsn.slice(0, 10)}…`);
    }
  }

  async send(_msg: MailMessage): Promise<void> {
    void this.dsn;
    throw new Error("GmailMailAdapter is not yet wired — landed in Module 2 (Public Authentication).");
  }
}

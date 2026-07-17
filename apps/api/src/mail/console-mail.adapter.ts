import type { MailAdapter, MailMessage } from "./mail.adapter.js";

export class ConsoleMailAdapter implements MailAdapter {
  async send(msg: MailMessage): Promise<void> {
    console.log(
      `[mail:console] to=${msg.to} subject=${JSON.stringify(msg.subject)} text=${JSON.stringify(msg.text)}`,
    );
  }
}

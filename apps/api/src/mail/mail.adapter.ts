export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export interface MailAdapter {
  send(msg: MailMessage): Promise<void>;
}

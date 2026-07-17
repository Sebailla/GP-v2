import { describe, expect, it } from "vitest";

import { GmailMailAdapter } from "../gmail-mail.adapter";

describe("GmailMailAdapter (skeleton)", () => {
  it("rejects non-smtp DSNs", () => {
    expect(() => new GmailMailAdapter("http://example")).toThrow(/smtp:\/\//);
  });

  it("throws when send is called (Module 2 will wire it)", async () => {
    const adapter = new GmailMailAdapter("smtp://user:pass@smtp.gmail.com:587");
    await expect(
      adapter.send({ to: "u@example.com", subject: "Hi", text: "Body" }),
    ).rejects.toThrow(/Module 2/);
  });
});

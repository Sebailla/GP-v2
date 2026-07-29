import { describe, expect, it, vi } from "vitest";

import { ConsoleMailAdapter } from "../console-mail.adapter";

describe("ConsoleMailAdapter", () => {
  it("logs the message and resolves", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const adapter = new ConsoleMailAdapter();
    await adapter.send({ to: "u@example.com", subject: "Hi", text: "Body" });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

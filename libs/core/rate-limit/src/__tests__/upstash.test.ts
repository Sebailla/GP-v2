import { describe, expect, it, vi } from "vitest";

vi.mock("@upstash/ratelimit", () => {
  const slidingWindow = vi.fn();
  class Ratelimit {
    static slidingWindow = slidingWindow;
    constructor(private readonly opts: unknown) {}
    limit = vi.fn().mockResolvedValue({
      success: true,
      remaining: 9,
      reset: Date.now() + 60_000,
    });
  }
  return { Ratelimit };
});

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(public readonly cfg: unknown) {}
  },
}));

import { UpstashRateLimiter } from "../upstash";

describe("UpstashRateLimiter", () => {
  it("translates a successful Upstash response into allowed=true", async () => {
    const limiter = new UpstashRateLimiter("https://example.upstash.io", "token");
    const d = await limiter.consume({ key: "k", limit: 10, windowSeconds: 60 });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(9);
  });
});
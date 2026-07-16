import { describe, expect, it, vi } from "vitest";

const { slidingWindow } = vi.hoisted(() => ({ slidingWindow: vi.fn() }));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = slidingWindow;
    constructor(private readonly opts: { limiter: unknown; redis: unknown; prefix: string }) {}
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
    slidingWindow.mockClear();
    const limiter = new UpstashRateLimiter("https://example.upstash.io", "token");
    const d = await limiter.consume({ key: "k", limit: 10, windowSeconds: 60 });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(9);
  });

  it("uses a Ratelimit instance whose slidingWindow period matches windowSeconds (R-PF-8)", async () => {
    slidingWindow.mockClear();
    const limiter = new UpstashRateLimiter("https://example.upstash.io", "token");

    await limiter.consume({ key: "k", limit: 5, windowSeconds: 600 });
    expect(slidingWindow).toHaveBeenCalledTimes(1);
    const firstCall = slidingWindow.mock.calls[0];
    expect(firstCall).toBeDefined();
    // Second arg is the window period; that's the value the cache
    // must keep stable per windowSeconds. The burst is overridden
    // per-call via the `rate` option of `Ratelimit.limit()`.
    expect(firstCall![1]).toBe("600 s");
  });

  it("caches one Ratelimit instance per windowSeconds (R-PF-8)", async () => {
    slidingWindow.mockClear();
    const limiter = new UpstashRateLimiter("https://example.upstash.io", "token");

    await limiter.consume({ key: "k", limit: 5, windowSeconds: 60 });
    await limiter.consume({ key: "k", limit: 5, windowSeconds: 60 });
    await limiter.consume({ key: "k", limit: 10, windowSeconds: 600 });
    await limiter.consume({ key: "k", limit: 10, windowSeconds: 600 });

    expect(slidingWindow).toHaveBeenCalledTimes(2);
    const windows = slidingWindow.mock.calls.map((c) => c[1]);
    expect(windows).toContain("60 s");
    expect(windows).toContain("600 s");
  });
});
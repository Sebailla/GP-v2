import { describe, expect, it, beforeEach } from "vitest";

import { InMemoryRateLimiter } from "../in-memory";

describe("InMemoryRateLimiter", () => {
  let limiter: InMemoryRateLimiter;
  beforeEach(() => {
    limiter = new InMemoryRateLimiter();
  });

  it("allows the first N requests within a window", async () => {
    for (let i = 0; i < 3; i += 1) {
      const d = await limiter.consume({ key: "k", limit: 3, windowSeconds: 60 });
      expect(d.allowed).toBe(true);
    }
  });

  it("rejects the (N+1)th request with a retry-after", async () => {
    for (let i = 0; i < 3; i += 1) {
      await limiter.consume({ key: "k", limit: 3, windowSeconds: 60 });
    }
    const d = await limiter.consume({ key: "k", limit: 3, windowSeconds: 60 });
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets the window after the period elapses", async () => {
    for (let i = 0; i < 3; i += 1) {
      await limiter.consume({ key: "k", limit: 3, windowSeconds: 1 });
    }
    await new Promise((r) => setTimeout(r, 1100));
    const d = await limiter.consume({ key: "k", limit: 3, windowSeconds: 1 });
    expect(d.allowed).toBe(true);
  });

  it("isolates buckets per key", async () => {
    for (let i = 0; i < 3; i += 1) {
      await limiter.consume({ key: "k1", limit: 3, windowSeconds: 60 });
    }
    const d = await limiter.consume({ key: "k2", limit: 3, windowSeconds: 60 });
    expect(d.allowed).toBe(true);
  });
});
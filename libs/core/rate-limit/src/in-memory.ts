import type { RateLimitDecision, RateLimitRequest, RateLimiter } from "./types.js";

interface Bucket {
  readonly windowStartedAt: number;
  count: number;
}

/**
 * Process-local rate limiter. Use in tests and as the fallback when the
 * Upstash store is unreachable. NOT safe across multiple instances.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  consume(req: RateLimitRequest): Promise<RateLimitDecision> {
    const now = Date.now();
    const existing = this.buckets.get(req.key);
    const windowMs = req.windowSeconds * 1000;

    if (!existing || now - existing.windowStartedAt >= windowMs) {
      this.buckets.set(req.key, { windowStartedAt: now, count: 1 });
      return Promise.resolve({
        allowed: true,
        remaining: req.limit - 1,
        retryAfterSeconds: 0,
      });
    }

    existing.count += 1;
    if (existing.count > req.limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowMs - (now - existing.windowStartedAt)) / 1000),
      );
      return Promise.resolve({ allowed: false, remaining: 0, retryAfterSeconds });
    }
    return Promise.resolve({
      allowed: true,
      remaining: req.limit - existing.count,
      retryAfterSeconds: 0,
    });
  }
}
/**
 * Decision returned by every `RateLimiter.consume` call.
 *
 * - `allowed: false` means the request MUST be rejected with HTTP 429
 *   and `Retry-After: retryAfterSeconds`.
 * - `remaining` is informational; the guard logs it for metrics.
 */
export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimitRequest {
  /** Composite key like "auth:login:203.0.113.5:user@example.com". */
  readonly key: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimiter {
  consume(req: RateLimitRequest): Promise<RateLimitDecision>;
}
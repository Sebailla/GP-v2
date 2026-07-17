import { SetMetadata } from "@nestjs/common";

export interface RateLimitRule {
  readonly key: string;
  readonly limit: number;
  readonly windowSeconds: number;
  readonly failOpen?: boolean;
}

export const RATE_LIMIT_META = "gpr:rate-limit:rule";

export const RateLimit = (rule: RateLimitRule): MethodDecorator =>
  SetMetadata(RATE_LIMIT_META, rule);

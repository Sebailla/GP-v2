import { z } from "zod";

/**
 * Zod schema for the gastos-personales-reference runtime environment.
 *
 * Validated at import time by `env.ts`. Any missing or malformed
 * variable throws a `ZodError` listing every offending field, so the
 * process fails fast at startup instead of crashing later when the
 * first consumer reads `process.env.DATABASE_URL`.
 *
 * Conventions enforced:
 *  - DATABASE_URL / NEXTAUTH_URL / WEB_ORIGIN must be valid URLs.
 *  - NEXTAUTH_SECRET must be at least 32 chars (bcrypt-grade entropy).
 *  - PORT coerces from string to number (process.env is always string).
 *  - NODE_ENV is a closed enum (development | test | production).
 *  - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are non-empty strings;
 *    OAuth provider config is provider-scoped, not URL-validated.
 *
 * The schema and `parseEnv` are exported from this module so tests
 * can call `parseEnv({})` directly without importing `env.ts` (which
 * would parse `process.env` at import time and poison every test).
 */

const NODE_ENV_VALUES = ["development", "test", "production"] as const;
export type NodeEnv = (typeof NODE_ENV_VALUES)[number];

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  WEB_ORIGIN: z.string().url(),
  PORT: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .default(3001),
  NODE_ENV: z.enum(NODE_ENV_VALUES),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse an arbitrary record against the env schema. Use this in tests
 * (or anywhere that needs to inject a known env) — DO NOT use the
 * exported `env` constant directly because that one parses
 * `process.env` at import time and would freeze the runtime env for
 * the rest of the process.
 *
 * @example
 *   const env = parseEnv({ ...process.env, PORT: "4242" });
 */
export function parseEnv(source: Readonly<Record<string, unknown>>): Env {
  return envSchema.parse(source);
}
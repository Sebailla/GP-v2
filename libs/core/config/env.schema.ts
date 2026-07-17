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

const NODE_ENV_VALUES = ["development", "test", "staging", "production"] as const;
export type NodeEnv = (typeof NODE_ENV_VALUES)[number];

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  PUBLIC_WEB_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url(),
  // T4.8 (slice 4 batch 4c) — the web client needs the API base URL
  // to call POST /auth/login + POST /auth/register from the LoginForm /
  // SignUpForm. Required at the workspace boundary so a missing or
  // malformed value fails-fast at startup instead of surfacing as a
  // network error inside the form. Dev value: http://localhost:3001
  // (the API runs on 3001 per apps/api/.env.example).
  API_URL: z.string().url(),
  // T3.3 (slice 3 batch 7) — Google OAuth credentials are OPTIONAL.
  // The Credentials provider is always wired; the Google provider is
  // added to the providers array only when BOTH id and secret are
  // present (see `apps/api/src/lib/auth.config.ts#isGoogleConfigured`).
  // This keeps dev / test environments runnable without OAuth
  // credentials and aligns with the design's "Google OAuth happy-stub
  // via NEXTAUTH_URL switch" note (Google handshake is exercised in
  // T3.7, not this batch).
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  WEB_ORIGIN: z.string().url(),
  MAIL_DSN: z.string().url().optional(),
  // D7 (module-2-public-auth) — Gmail env vars. Optional at the schema
  // level so dev / test setups run without real Gmail credentials. The
  // `productionEnvSchema.superRefine` below enforces both whenever
  // NODE_ENV="production" AND MAIL_DSN is unset (D3 kill-switch wins
  // when MAIL_DSN IS set, so Gmail is irrelevant in that branch).
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().min(16).optional(),
  BACKUP_DSN: z.string().url().optional(),
  METRICS_TOKEN: z.string().min(16).optional(),
  STATUS_DETAIL_TOKEN: z.string().min(16).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(16).optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional(),
  PORT: z.coerce.number().int().positive().optional().default(3001),
  NODE_ENV: z.enum(NODE_ENV_VALUES),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Refine the schema to fail closed when NODE_ENV is staging or production
 * and any of the production-only fields are missing. Development and test
 * profiles accept missing optional fields so local dev keeps working.
 *
 * D7 (module-2-public-auth) — `MAIL_DSN` is no longer unconditionally
 * required in production. The mail adapter needs EITHER `MAIL_DSN`
 * (kill-switch / explicit SMTP) OR `GMAIL_USER` + `GMAIL_APP_PASSWORD`
 * (the Gmail service transport). The (Gmail env) branch is enforced
 * ONLY when `MAIL_DSN` is unset, because D3's kill-switch takes
 * priority when `MAIL_DSN` IS set.
 */
export const productionEnvSchema = envSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV !== "staging" && value.NODE_ENV !== "production") return;
  const required: ReadonlyArray<keyof Env> = [
    "JWT_SECRET",
    "COOKIE_SECRET",
    "PUBLIC_WEB_URL",
    "PUBLIC_API_URL",
    "BACKUP_DSN",
    "METRICS_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];
  for (const key of required) {
    if (value[key] === undefined || value[key] === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when NODE_ENV is "${value.NODE_ENV}"`,
      });
    }
  }
  // MAIL_DSN may be set OR Gmail env vars may be set. With neither,
  // the API has no way to deliver a password-reset email — fail fast
  // at boot instead of discovering this at the first `send()`.
  const hasMailDsn = value.MAIL_DSN !== undefined && value.MAIL_DSN !== "";
  const hasGmailUser = value.GMAIL_USER !== undefined && value.GMAIL_USER !== "";
  const hasGmailPassword = value.GMAIL_APP_PASSWORD !== undefined && value.GMAIL_APP_PASSWORD !== "";
  if (!hasMailDsn && (!hasGmailUser || !hasGmailPassword)) {
    if (!hasGmailUser) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GMAIL_USER"],
        message: `GMAIL_USER is required when NODE_ENV is "${value.NODE_ENV}" and MAIL_DSN is unset`,
      });
    }
    if (!hasGmailPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GMAIL_APP_PASSWORD"],
        message: `GMAIL_APP_PASSWORD is required when NODE_ENV is "${value.NODE_ENV}" and MAIL_DSN is unset`,
      });
    }
  }
});

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
  return productionEnvSchema.parse(source);
}

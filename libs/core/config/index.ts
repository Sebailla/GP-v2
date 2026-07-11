/**
 * Public API of @core/config.
 *
 * Apps (apps/api, apps/web) import `env` from this module at the top
 * of their entry file so the Zod schema validates `process.env` and
 * the process fails-fast on a missing or malformed variable.
 *
 * Tests should import `parseEnv` / `envSchema` from this module to
 * inject a known record without poisoning the global `env` singleton
 * (which is exported lazily from env.ts and freezes the runtime env
 * at import time).
 */

export { env } from "./env";
export { envSchema, parseEnv } from "./env.schema";
export type { Env, NodeEnv } from "./env.schema";

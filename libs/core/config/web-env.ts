/**
 * `env` singleton for the web app — v1.4.1 schema split.
 *
 * Mirrors `env.ts` (the API's env singleton) but parses against
 * `webEnvSchema` instead of `envSchema`. The `env` is frozen at
 * import time; tests must use `parseWebEnv` to inject known
 * values without poisoning the global.
 *
 * The web's `env` is intentionally a SEPARATE singleton from the
 * API's. They parse different schemas against the same
 * `process.env` source. A field that the web's schema accepts
 * (NEXTAUTH_URL) is also accepted by the API's schema; a field
 * the API's schema requires at production (BACKUP_DSN) is
 * optional + ignored by the web's schema. The two singletons
 * never collide.
 */

import { parseWebEnv, type WebEnv } from "./web-env.schema.js";

/**
 * The web's env singleton, parsed at import time.
 *
 * `process.env` is typed as `Record<string, string | undefined>`
 * in Node 22+, but Zod's safeParse accepts `Record<string,
 * unknown>` so we widen explicitly. The string→unknown widening
 * is safe because every field the schema accepts is then
 * re-validated by Zod's URL / min-length / enum / boolean checks.
 */
export const env: WebEnv = parseWebEnv(
  process.env as Readonly<Record<string, unknown>>,
);

/**
 * Public API of `@core/config/web` — the v1.4.1 web-only env split.
 *
 * **Why this file exists.** The full `@core/config` barrel pulls in
 * the API's env schema (with prod-only fields like BACKUP_DSN,
 * METRICS_TOKEN, GMAIL_*) that the web build drags into its module
 * graph at `next build` time. Splitting the web to its own barrel
 * keeps the build clean: the web build only parses the web's env
 * surface and never touches the API's prod-only fields.
 *
 * **Consumption pattern.** Identical to `@core/config`:
 *
 *   import { env } from "@core/config/web";
 *   const webUrl = env.PUBLIC_WEB_URL;
 *
 * Apps (apps/web) import `env` from this module at the top of their
 * entry file so the Zod schema validates `process.env` and the
 * process fails-fast on a missing or malformed variable.
 *
 * **What this barrel does NOT re-export.** The API's prod-only
 * fields (BACKUP_DSN, METRICS_TOKEN, UPSTASH_*, GMAIL_*, MAIL_DSN,
 * DATABASE_URL) are intentionally NOT in `WebEnv` — the type
 * system rejects any attempt to read them from this barrel. The
 * full API schema lives in `@core/config` and is consumed by
 * `apps/api` only.
 *
 * **Sibling, not replacement.** `@core/config/web` is a SIBLING
 * of `@core/config`, not a replacement. `@core/config` keeps
 * working for the API. Both barrels are versioned together
 * (`@core/config@1.4.1`) and live in the same workspace package.
 *
 * Tests should import `parseWebEnv` / `webEnvSchema` from this
 * module to inject a known record without poisoning the global
 * `env` singleton (which is exported lazily from `web-env.ts` and
 * freezes the runtime env at import time).
 */

export { env } from "./web-env";
export { webEnvSchema, parseWebEnv, productionWebEnvSchema } from "./web-env.schema";
export type { WebEnv, NodeEnv } from "./web-env.schema";

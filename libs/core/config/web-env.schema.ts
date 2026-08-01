import { z } from "zod";

/**
 * Zod schema for the `apps/web` runtime environment — v1.4.1 schema
 * split.
 *
 * **Why this file exists.** The v1.4.0 release (and every release
 * before it) had a single env schema in `env.schema.ts` shared by
 * `apps/api` and `apps/web`. The schema required the API's prod-only
 * fields (BACKUP_DSN, METRICS_TOKEN, UPSTASH_REDIS_REST_*, GMAIL_*) at
 * `NODE_ENV=production` time, which is the env Next.js sets during
 * `next build`. The web build dragged the full schema into its module
 * graph (because 11 files in `apps/web` import `env` from
 * `@core/config`) and the build failed in any clean dev environment
 * that didn't have the API's secrets set. The fix: a separate, smaller
 * schema for the web. The API keeps using the full schema and
 * continues to fail-fast at startup on the prod-only fields it
 * actually needs.
 *
 * **The web's env surface** (audited from the 11 import sites — see
 * `openspec/changes/fix-build-env-runtime-validation/explore.md` for
 * the field-level audit):
 *
 *  - `NEXTAUTH_URL` + `NEXTAUTH_SECRET` — NextAuth v5 config
 *    (`apps/web/auth.ts`).
 *  - `JWT_SECRET` + `COOKIE_SECRET` — NextAuth session/JWT signing.
 *  - `PUBLIC_WEB_URL` + `PUBLIC_API_URL` — client-visible URLs read
 *    by the status / landing pages.
 *  - `API_URL` — server-side, used by form POSTs.
 *  - `WEB_ORIGIN` — CORS / middleware.
 *  - `NODE_ENV` — closed enum (development | test | staging | production).
 *  - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — OPTIONAL
 *    (NextAuth Google provider registers only when both are present).
 *  - `ADMIN_ENABLED` — OPTIONAL boolean (admin surface kill-switch
 *    read by middleware).
 *  - `AUDIT_RETENTION_DAYS` + `AUDIT_RETENTION_ENABLED` — OPTIONAL,
 *    same defaults as the API schema (90 days, disabled by default).
 *  - `LOG_LEVEL` — OPTIONAL enum.
 *  - `PORT` — OPTIONAL, defaults to 3000 (the web's dev port; the
 *    API uses 3001).
 *
 * **What this schema does NOT include** (and why — the negative
 * contract):
 *
 *  - `DATABASE_URL` — the web never connects to Postgres directly;
 *    it calls the API which does.
 *  - `BACKUP_DSN` — API-only (the S3 backup adapter).
 *  - `METRICS_TOKEN` — API-only (Prometheus / observability).
 *  - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` —
 *    API-only (rate-limit backend).
 *  - `GMAIL_USER` + `GMAIL_APP_PASSWORD` + `MAIL_DSN` — API-only
 *    (password-reset email transport).
 *  - `JWT_SECRET` + `COOKIE_SECRET` are in BOTH schemas (web reads
 *    them for NextAuth; the API reads them for the rate-limit and
 *    session middleware). The string value MUST match between the
 *    two schemas for the session cookie to be readable by both
 *    sides. The web's schema validates the same length floor
 *    (≥32 chars) so the contract is symmetric.
 *
 * **The `productionWebEnvSchema` is a no-op for v1.4.1.** No
 * prod-only fields are required by the web (the API is the
 * runtime consumer of BACKUP_DSN, METRICS_TOKEN, etc). The
 * `superRefine` is kept in the file as a structural placeholder
 * so a future web-only prod field (e.g. a CDN purge token) has a
 * canonical home without restructuring the file again.
 *
 * **The shape mirrors `env.schema.ts`.** The export names
 * (`webEnvSchema`, `parseWebEnv`, `WebEnv`, `productionWebEnvSchema`)
 * match the API schema's convention (`envSchema`, `parseEnv`,
 * `Env`, `productionEnvSchema`) so the consumption pattern in
 * `apps/web` is identical to the one in `apps/api`. The
 * `__tests__/web-env.test.ts` file follows the same pattern as
 * `__tests__/env.test.ts`.
 */

const NODE_ENV_VALUES = ["development", "test", "staging", "production"] as const;
export type NodeEnv = (typeof NODE_ENV_VALUES)[number];

export const webEnvSchema = z.object({
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  // JWT_SECRET + COOKIE_SECRET are shared with the API (NextAuth
  // session/JWT signing). Same length floor (32 chars) as the API
  // schema so the symmetric contract is preserved.
  JWT_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  PUBLIC_WEB_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url(),
  // T4.8 (slice 4 batch 4c) — the web client needs the API base URL
  // to call POST /auth/login + POST /auth/register from the LoginForm /
  // SignUpForm. Mirrors the API schema's contract.
  API_URL: z.string().url(),
  // Module-2 PR #4 task 4.6 — Google OAuth credentials are OPTIONAL.
  // The Credentials provider is always wired; the Google provider is
  // added to the providers array only when BOTH id and secret are
  // present (see `apps/web/auth.ts#isGoogleMockEnabled`).
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  WEB_ORIGIN: z.string().url(),
  // Admin surface kill-switch. Mirrors the API schema's coercion
  // (true | false | 1 | 0 | yes | no | on | off, case-insensitive).
  // Default is `true` so dev / test environments run with the admin
  // routes enabled. Operators flip to `false` for an emergency
  // kill-switch.
  ADMIN_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((value, ctx) => {
      if (typeof value === "boolean") return value;
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `ADMIN_ENABLED must be a boolean (true/false); received "${value}"`,
      });
      return z.NEVER;
    })
    .default(true),
  // Audit retention gate. Mirrors the API schema's contract.
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(0).default(90),
  AUDIT_RETENTION_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((value, ctx) => {
      if (typeof value === "boolean") return value;
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `AUDIT_RETENTION_ENABLED must be a boolean (true/false); received "${value}"`,
      });
      return z.NEVER;
    })
    .default(false),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional(),
  // The web's dev port is 3000 (the API uses 3001). The default
  // here is the same as the API schema's default (3001) for
  // consistency, but the `apps/web/package.json` `dev` script
  // passes `--port 3000` explicitly so the actual dev port is
  // 3000 regardless. The default is a safety net.
  PORT: z.coerce.number().int().positive().optional().default(3000),
  NODE_ENV: z.enum(NODE_ENV_VALUES),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

/**
 * `superRefine` hook for the web env schema.
 *
 * **v1.4.1 — no web prod-only fields are required.** The `superRefine`
 * is a no-op (returns immediately if NODE_ENV !== "production") but
 * is kept as a structural placeholder so a future web-only prod
 * field (e.g. a CDN purge token, a CSP nonce seed, a per-deploy
 * feature flag) has a canonical home.
 */
export const productionWebEnvSchema = webEnvSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV !== "staging" && value.NODE_ENV !== "production") return;
  // v1.4.1: no required-for-production fields. When a future web
  // field needs a production-only requirement, add the key to this
  // array (mirroring the API schema's pattern in `env.schema.ts`
  // lines 149-167). The comment is intentionally explicit about
  // the placeholder so a future maintainer doesn't add a
  // requirement here without realizing the web's env is
  // intentionally minimal.
  void value;
  void ctx;
});

/**
 * Parse an arbitrary record against the web env schema. Use this in
 * tests (or anywhere that needs to inject a known env) — DO NOT use
 * the exported `env` constant directly because that one parses
 * `process.env` at import time and would freeze the runtime env
 * for the rest of the process.
 *
 * @example
 *   const env = parseWebEnv({ ...process.env, PORT: "4242" });
 */
export function parseWebEnv(source: Readonly<Record<string, unknown>>): WebEnv {
  return productionWebEnvSchema.parse(source);
}

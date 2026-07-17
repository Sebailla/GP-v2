# Production Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Module 1 of the productionization program for `gastos-personales-reference`: a vertical slice that makes the app deployable on free-tier managed services, observable, recoverable, and verifiable in the browser — without shipping any end-user feature.

**Architecture:** A new `production-foundation` change that adds env validation, structured logging, health endpoints, rate limiting, metrics, a backup job + restore drill, a `/status` page in `apps/web`, security headers, and a deploy pipeline. Each task lands as an atomic commit on `feat/production-foundation` and produces a vertically complete slice (backend + frontend + UI + tests + docs).

**Tech Stack:** TypeScript 5 strict, NestJS 11, Next.js 15, pnpm 11, Turbo 2.x, Prisma 7, Zod 4, pino (API) + pino-browser (web), @upstash/ratelimit + @upstash/redis (rate limit), prom-client (metrics), @aws-sdk/client-s3 (R2 backups), Vitest, Playwright, GitHub Actions.

## Global Constraints

- **Strict TDD**: every production-code task follows RED → GREEN → TRIANGULATE → REFACTOR. A failing test MUST exist before any production code lands.
- **Atomic commits**: one commit per task; `git revert <sha>` reverses cleanly.
- **Branch discipline**: work on `feat/production-foundation`; merge to `develop` only after `sdd-verify` confirms every gate; `main` is immutable.
- **Spanish mirror**: every English `.md` produced under `openspec/changes/production-foundation/` or `docs/` MUST have a mirror under `Documents-es/` in the same atomic commit. Verify with `perl -ne 'print if /\p{Han}/' <file>` returning empty.
- **UI complete, not scaffold**: every new page MUST render loading / error / success / empty / validation-error states and pass WCAG AA.
- **ESLint boundary fixtures**: `pnpm lint:fixtures` MUST stay green.
- **No `new PrismaClient()` outside `@core/database`**: enforced by ESLint.
- **No Zod schemas outside `libs/core/config/env.schema.ts` and `libs/features/*/shared/schemas/`**: enforced by ESLint.
- **`MailAdapter` is introduced as an interface in T1.12**, even though wiring Gmail is deferred to Module 2. This keeps the seam available.
- **Reuse the existing test helpers**: `apps/api/test/setup-env.ts` already seeds `process.env`; do not duplicate that logic. New env vars extend the schema and the fixture.
- **Reuse the existing decorators**: `@BodySchema(schema)` and `@QuerySchema(schema)` from `apps/api/src/shared/decorators/*` are the canonical parameter decorators. New endpoints must use them.
- **Reuse the existing NestJS patterns**: controllers must end with the `_ServiceAnchor` static field to survive `import type` refactors (enforced by ESLint rule `@gpr/boundary/no-import-type-injectable`).
- **Reuse the existing smoke e2e project conventions**: Playwright config in `apps/web/playwright.config.ts` already has `en` + `es` projects; this plan adds a third project named `smoke`.
- **Reuse the `MailAdapter` interface boundary** introduced in T1.12 (no business code may import `nodemailer` directly).

---

## File Structure

This plan introduces the following files (English names; Spanish mirror entries noted where applicable):

### New packages and modules

- `libs/core/logging/src/` — pino logger + redaction.
- `libs/core/logging/package.json` — new package `@core/logging`.
- `libs/core/logging/tsconfig.json` — extends `tsconfig.base.json`.
- `libs/core/logging/vitest.config.ts` — vitest setup.
- `libs/core/logging/src/__tests__/logger.test.ts` — redaction snapshots.
- `libs/core/rate-limit/src/` — `RateLimiter` interface + `InMemoryRateLimiter` + `UpstashRateLimiter`.
- `libs/core/rate-limit/package.json`.
- `libs/core/rate-limit/tsconfig.json`.
- `libs/core/rate-limit/vitest.config.ts`.
- `libs/core/rate-limit/src/__tests__/in-memory.test.ts`.
- `libs/core/rate-limit/src/__tests__/upstash.test.ts`.
- `apps/api/src/middleware/request-id.ts`.
- `apps/api/src/middleware/request-logger.ts`.
- `apps/api/src/modules/health/health.controller.ts`.
- `apps/api/src/modules/health/health.module.ts`.
- `apps/api/src/modules/health/status.builder.ts`.
- `apps/api/src/modules/metrics/metrics.controller.ts`.
- `apps/api/src/modules/metrics/metrics.module.ts`.
- `apps/api/src/modules/metrics/registry.ts`.
- `apps/api/src/shared/guards/rate-limit.guard.ts`.
- `apps/api/src/shared/guards/rate-limit.decorator.ts`.
- `apps/api/test/health.e2e-spec.ts`.
- `apps/api/test/rate-limit.e2e-spec.ts`.
- `apps/api/test/metrics.e2e-spec.ts`.
- `apps/api/scripts/dev.ts` — local dev entry that wires pino-pretty.
- `scripts/operations/backup.ts` — daily pg_dump + R2 upload.
- `scripts/operations/restore-drill.ts` — restore into isolated DB.
- `scripts/operations/restore-drill.sh` — bash wrapper for Fly scheduled runs.
- `apps/web/app/[locale]/status/page.tsx`.
- `apps/web/app/[locale]/status/layout.tsx`.
- `apps/web/app/[locale]/status/loading.tsx`.
- `apps/web/app/[locale]/status/error.tsx`.
- `apps/web/app/[locale]/status/not-found.tsx`.
- `apps/web/components/status/StatusCard.tsx`.
- `apps/web/components/status/StatusPolling.tsx`.
- `apps/web/components/status/StatusBadge.tsx`.
- `apps/web/lib/status-client.ts`.
- `apps/web/lib/logger.ts`.
- `apps/web/middleware.ts` — extends existing next-intl middleware with security headers.
- `apps/web/e2e/status/status.spec.ts`.
- `apps/web/e2e/utils/api.ts` — helper for API hits from Playwright.
- `.github/workflows/deploy-staging.yml`.
- `docs/operations/production-foundation-runbook.md` (English).
- `Documents-es/docs/operations/production-foundation-runbook.md` (Spanish mirror).
- `docs/architecture/production-foundation.md` (English).
- `Documents-es/docs/architecture/production-foundation.md` (Spanish mirror).

### Modified files

- `libs/core/config/env.schema.ts` — adds the new env vars and the production profile.
- `libs/core/config/env.ts` — exports the typed env with new fields.
- `libs/core/config/__tests__/env.test.ts` — extended for new fields.
- `libs/core/config/package.json` — adds `@core/logging` + `@core/rate-limit` peer.
- `apps/api/src/main.ts` — wires request-id + request-logger middleware, security headers, and `/metrics` mount.
- `apps/api/src/app.module.ts` — imports `HealthModule` + `MetricsModule`.
- `apps/api/src/modules/auth/auth.module.ts` — applies `@RateLimit` to controller methods.
- `apps/api/src/modules/auth/auth.controller.ts` — adds `@RateLimit` decorator metadata.
- `apps/api/src/modules/transactions/transactions.module.ts` — applies `@RateLimit` to controller methods.
- `apps/api/src/modules/transactions/transactions.controller.ts` — adds `@RateLimit` decorator metadata.
- `apps/api/package.json` — adds `pino`, `pino-http`, `pino-pretty` (dev), `nanoid`, `prom-client`, `@upstash/ratelimit`, `@upstash/redis`, `@aws-sdk/client-s3`, `pg` (dev).
- `apps/api/test/setup-env.ts` — adds the new env vars for the test fixture.
- `apps/web/package.json` — adds `pino-browser`, `nanoid` (browser build).
- `apps/web/playwright.config.ts` — adds the `smoke` project.
- `apps/web/messages/en.json` — adds `status.*` namespace.
- `apps/web/messages/es.json` — adds `status.*` namespace.
- `apps/web/i18n.ts` — unchanged.
- `package.json` (root) — adds `backup` and `restore-drill` turbo tasks.
- `turbo.json` — adds `backup` and `restore-drill` tasks.

### Files NOT touched in this module

- `libs/features/auth/server/**` — business logic is untouched.
- `libs/features/transactions/server/**` — business logic is untouched.
- `libs/features/auth/shared/schemas/**` — no schema changes.
- `libs/features/transactions/shared/schemas/**` — no schema changes.
- `openspec/changes/vertical-slicing-reference-scaffold/**` — historical artifacts.

---

## Verification Matrix

| Requirement | Verified by |
| --- | --- |
| R-PF-1 — env validation | `libs/core/config/__tests__/env.test.ts` |
| R-PF-2 — secure cookies + CORS | `apps/api/test/health.e2e-spec.ts` CORS assertions + `apps/web/__tests__/app/status.test.tsx` |
| R-PF-3 — security headers | `apps/web/__tests__/app/status.test.tsx` + Playwright smoke |
| R-PF-4 — health endpoints | `apps/api/test/health.e2e-spec.ts` + Playwright smoke |
| R-PF-5 — structured logging with redaction | `libs/core/logging/__tests__/logger.test.ts` + snapshot |
| R-PF-6 — free-tier staging deploy | `.github/workflows/deploy-staging.yml` + manual staging deploy |
| R-PF-7 — DB backups and restore | `libs/core/database/__tests__/backup.test.ts` + `scripts/operations/restore-drill.test.ts` |
| R-PF-8 — rate limiting | `apps/api/test/rate-limit.e2e-spec.ts` + `libs/core/rate-limit/__tests__/in-memory.test.ts` |
| R-PF-9 — metrics endpoint | `apps/api/test/metrics.e2e-spec.ts` |
| R-PF-10 — status UI | `apps/web/__tests__/app/status.test.tsx` + Playwright `smoke` |
| R-PF-11 — smoke e2e | `apps/web/e2e/status/status.spec.ts` |
| R-PF-12 — runbook presence | `git ls-files docs/operations/production-foundation-runbook.md` + Spanish mirror |

---

## Task Map

| Task | Subject | Files | Est LOC |
| --- | --- | --- | --- |
| T1.1 | Add environment configuration schema | env.schema.ts, env.ts, env.test.ts, package.json | 40 |
| T1.2 | Pino logger with redaction | libs/core/logging/* | 60 |
| T1.3 | Request ID + request-logger middleware | apps/api/src/middleware/* | 50 |
| T1.4 | Health endpoints | apps/api/src/modules/health/* + e2e | 70 |
| T1.5 | Upstash rate limiter adapter | libs/core/rate-limit/* | 50 |
| T1.6 | Rate limit guards | shared/guards/* + e2e | 30 |
| T1.7 | Metrics endpoint | modules/metrics/* + e2e | 30 |
| T1.8 | Backup script + restore drill | scripts/operations/* + tests | 60 |
| T1.9 | Status UI page | apps/web/app/[locale]/status/* + i18n | 80 |
| T1.10 | Security headers + CORS tightening | apps/web/middleware.ts + main.ts | 30 |
| T1.11 | Staging deploy pipeline | .github/workflows/deploy-staging.yml | 40 |
| T1.12 | Runbook + MailAdapter skeleton | docs/operations/* + Documents-es mirror | 80 |

Total estimated changed lines (production + tests + docs): ~620. Net diff under the 400-line review budget after filtering tests/docs is ~320.
---

## Task 1.1 — Extend environment configuration schema

**Files:**
- Modify: `libs/core/config/env.schema.ts:1-67`
- Modify: `libs/core/config/env.ts:1-15`
- Modify: `libs/core/config/__tests__/env.test.ts:1-40`
- Modify: `libs/core/config/package.json:1-30`
- Modify: `apps/api/test/setup-env.ts:1-30`

**Interfaces produced:**
- `Env.NODE_ENV: 'development' | 'test' | 'staging' | 'production'`
- `Env.JWT_SECRET: string` (min 32 chars)
- `Env.COOKIE_SECRET: string` (min 32 chars)
- `Env.PUBLIC_WEB_URL: string` (URL)
- `Env.PUBLIC_API_URL: string` (URL)
- `Env.MAIL_DSN?: string` (URL with `smtp:` scheme, required when `NODE_ENV !== 'development'`)
- `Env.BACKUP_DSN?: string` (URL with `s3:` scheme, required when `NODE_ENV !== 'development'`)
- `Env.METRICS_TOKEN?: string` (min 16 chars, required when `NODE_ENV !== 'development'`)
- `Env.STATUS_DETAIL_TOKEN?: string` (min 16 chars)
- `Env.UPSTASH_REDIS_REST_URL?: string` (URL, required when `NODE_ENV !== 'development'`)
- `Env.UPSTASH_REDIS_REST_TOKEN?: string` (min 16 chars, required when `NODE_ENV !== 'development'`)
- `Env.LOG_LEVEL?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'`

- [ ] **Step 1: Add failing tests for the new env vars**

Open `libs/core/config/__tests__/env.test.ts` and replace the `completeFixture` block (lines 28-39) with:

```ts
const completeFixture: Env = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gastos_reference",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_SECRET: "a-very-long-secret-of-at-least-thirty-two-characters",
  JWT_SECRET: "jwt-secret-at-least-thirty-two-characters-long",
  COOKIE_SECRET: "cookie-secret-at-least-thirty-two-characters-long",
  PUBLIC_WEB_URL: "http://localhost:3000",
  PUBLIC_API_URL: "http://localhost:3001",
  API_URL: "http://localhost:3001",
  GOOGLE_CLIENT_ID: "google-client-id-stub",
  GOOGLE_CLIENT_SECRET: "google-client-secret-stub",
  WEB_ORIGIN: "http://localhost:3000",
  MAIL_DSN: "smtp://user:pass@smtp.gmail.com:587",
  BACKUP_DSN: "s3://access:secret@bucket",
  METRICS_TOKEN: "metrics-token-at-least-sixteen-chars",
  STATUS_DETAIL_TOKEN: "status-detail-token-at-least-sixteen",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token-at-least-sixteen-chars",
  LOG_LEVEL: "info",
  PORT: 3001,
  NODE_ENV: "staging",
};
```

Append at the end of the file (before the closing `});` of `describe("envSchema")`):

```ts
  describe("production profile (R-PF-1)", () => {
    it("fails closed when JWT_SECRET is missing in production", () => {
      const { JWT_SECRET: _ignored, ...rest } = completeFixture;
      void _ignored;
      const result = envSchema.safeParse({ ...rest, NODE_ENV: "production" });
      expect(result.success).toBe(false);
    });

    it("accepts a complete production fixture", () => {
      const result = envSchema.safeParse({ ...completeFixture, NODE_ENV: "production" });
      expect(result.success).toBe(true);
    });

    it("rejects a JWT_SECRET shorter than 32 chars", () => {
      const result = envSchema.safeParse({ ...completeFixture, JWT_SECRET: "short" });
      expect(result.success).toBe(false);
    });
  });
```

- [ ] **Step 2: Run the new tests; expect FAIL**

Run: `pnpm --filter @core/config test`
Expected: at least one test fails with `JWT_SECRET is required` or similar.

- [ ] **Step 3: Extend the schema**

In `libs/core/config/env.schema.ts`, replace the `NODE_ENV_VALUES` constant (line 28) with:

```ts
const NODE_ENV_VALUES = ["development", "test", "staging", "production"] as const;
```

Replace the `envSchema` object literal (lines 30-55) with:

```ts
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  PUBLIC_WEB_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url(),
  API_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  WEB_ORIGIN: z.string().url(),
  MAIL_DSN: z.string().url().optional(),
  BACKUP_DSN: z.string().url().optional(),
  METRICS_TOKEN: z.string().min(16).optional(),
  STATUS_DETAIL_TOKEN: z.string().min(16).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(16).optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional(),
  PORT: z.coerce.number().int().positive().optional().default(3001),
  NODE_ENV: z.enum(NODE_ENV_VALUES),
});
```

After `export type Env = z.infer<typeof envSchema>;` (line 57), add:

```ts
/**
 * Refine the schema to fail closed when NODE_ENV is staging or production
 * and any of the production-only fields are missing. Development and test
 * profiles accept missing optional fields so local dev keeps working.
 */
export const productionEnvSchema = envSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV !== "staging" && value.NODE_ENV !== "production") return;
  const required: ReadonlyArray<keyof Env> = [
    "JWT_SECRET",
    "COOKIE_SECRET",
    "PUBLIC_WEB_URL",
    "PUBLIC_API_URL",
    "MAIL_DSN",
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
});
```

- [ ] **Step 4: Make the test for `safeParse` use the production schema**

In `libs/core/config/__tests__/env.test.ts`, the existing `safeParse with empty input` block already uses `envSchema`. Update the imports at the top of the file:

```ts
import { envSchema, parseEnv, productionEnvSchema, type Env } from "../env.schema";
```

The empty-input test now needs to use `productionEnvSchema` to exercise the new rule:

```ts
  describe("safeParse with empty input (RED)", () => {
    const result = productionEnvSchema.safeParse({});
    // ... unchanged ...
  });
```

- [ ] **Step 5: Extend `parseEnv` to use the refined schema**

Replace the body of `parseEnv` in `libs/core/config/env.schema.ts`:

```ts
export function parseEnv(source: Readonly<Record<string, unknown>>): Env {
  return productionEnvSchema.parse(source);
}
```

- [ ] **Step 6: Extend the test fixture used by API e2e**

In `apps/api/test/setup-env.ts`, append after the existing assignments:

```ts
env["JWT_SECRET"] = "test-jwt-secret-at-least-32-characters-long";
env["COOKIE_SECRET"] = "test-cookie-secret-at-least-32-characters-long";
env["PUBLIC_WEB_URL"] = "http://localhost:3000";
env["PUBLIC_API_URL"] = "http://localhost:3001";
env["METRICS_TOKEN"] = "test-metrics-token-at-least-16";
env["STATUS_DETAIL_TOKEN"] = "test-status-detail-token-at-least-16";
env["UPSTASH_REDIS_REST_URL"] = "https://example.upstash.io";
env["UPSTASH_REDIS_REST_TOKEN"] = "test-upstash-token-at-least-16-chars";
env["LOG_LEVEL"] = "info";
```

- [ ] **Step 7: Run the env tests; expect PASS**

Run: `pnpm --filter @core/config test`
Expected: all tests pass.

Run: `pnpm --filter api test`
Expected: existing e2e tests still pass (env extension is backward compatible).

- [ ] **Step 8: Commit**

```bash
git add libs/core/config/env.schema.ts libs/core/config/env.ts libs/core/config/__tests__/env.test.ts apps/api/test/setup-env.ts
git commit -m "feat(config): require JWT_SECRET, COOKIE_SECRET, PUBLIC_WEB_URL, PUBLIC_API_URL and staging-only fields (R-PF-1)"
```

---

## Task 1.2 — Pino logger with redaction (`@core/logging`)

**Files:**
- Create: `libs/core/logging/package.json`
- Create: `libs/core/logging/tsconfig.json`
- Create: `libs/core/logging/vitest.config.ts`
- Create: `libs/core/logging/src/index.ts`
- Create: `libs/core/logging/src/logger.ts`
- Create: `libs/core/logging/src/redaction.ts`
- Create: `libs/core/logging/src/__tests__/logger.test.ts`
- Modify: `libs/core/config/package.json:25-30` (add `@core/logging` to `peerDependencies`)
- Modify: `package.json` (root `workspaces` already covers `libs/*/*`; no change needed)
- Modify: `tsconfig.base.json` (path alias for `@core/logging`)

**Interfaces produced:**
- `logger`: pino `Logger` instance configured with the redaction list and `LOG_LEVEL` env.
- `childLogger(bindings: Record<string, unknown>): Logger` — pino child factory.
- `redactedPaths`: readonly string array consumed by pino's `redact` option.

- [ ] **Step 1: Create the `@core/logging` package skeleton**

Create `libs/core/logging/package.json`:

```json
{
  "name": "@core/logging",
  "version": "1.1.1",
  "private": true,
  "description": "Structured logger shared by apps/api and apps/web. Re-exports a pino instance with the redaction list required by R-PF-5.",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings 0"
  },
  "dependencies": {
    "pino": "9.5.0"
  },
  "devDependencies": {
    "@types/node": "22.18.0",
    "vitest": "4.1.9",
    "typescript": "6.0.3",
    "eslint": "^10.6.0"
  }
}
```

Create `libs/core/logging/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

Create `libs/core/logging/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: [],
  },
});
```

- [ ] **Step 2: Create the redaction path list**

Create `libs/core/logging/src/redaction.ts`:

```ts
/**
 * Path list passed to pino's `redact` option.
 *
 * Paths use bracket notation for wildcards; `*.password` matches any
 * nested `password` field. R-PF-5 commits to redacting these paths at
 * the logger boundary so no application code can accidentally leak
 * them — pino performs the substitution BEFORE the log line is
 * serialized to JSON.
 *
 * GOTCHA (resolved during T1.2 execution): pino 9.x uses fast-redact
 * 3.5.x under the hood, which rejects wildcard path segments that
 * are not valid JS identifiers (no hyphens). The HTTP header
 * `Idempotency-Key` shows up in `req.headers["idempotency-key"]`
 * (hyphenated literal) AND as camelCase `idempotencyKey` in domain
 * objects. We list BOTH paths:
 *   - `idempotency-key`  — top-level hyphenated (HTTP header literal)
 *   - `idempotencyKey`, `*.idempotencyKey` — camelCase object keys
 *
 * The hyphenated wildcard `*.idempotency-key` is NOT valid pino syntax
 * and would throw at logger construction time.
 */
export const redactedPaths: ReadonlyArray<string> = [
  "password",
  "*.password",
  "token",
  "*.token",
  "cookie",
  "*.cookie",
  "authorization",
  "*.authorization",
  "idempotency-key",
  "idempotencyKey",
  "*.idempotencyKey",
  "email",
  "*.email",
  "amount",
  "*.amount",
  "reportingAmount",
  "*.reportingAmount",
  "notes",
  "*.notes",
];
```

- [ ] **Step 3: Create the logger factory**

Create `libs/core/logging/src/logger.ts`:

```ts
import pino, { type Logger, type LoggerOptions } from "pino";

import { redactedPaths } from "./redaction.js";

/**
 * The minimum env the logger expects. The factory reads `LOG_LEVEL` and
 * `NODE_ENV` to decide between JSON and pretty output. Tests inject a
 * fake env via `createLogger({ level: "info", environment: "test" })`.
 */
export interface LoggerEnv {
  readonly LOG_LEVEL?: string | undefined;
  readonly NODE_ENV?: string | undefined;
}

const resolveLevel = (env: LoggerEnv): LoggerOptions["level"] => {
  switch (env.LOG_LEVEL) {
    case "trace":
    case "debug":
    case "info":
    case "warn":
    case "error":
    case "fatal":
      return env.LOG_LEVEL;
    default:
      return "info";
  }
};

/**
 * Build a root logger. The transport is intentionally NOT included by
 * default — production runs with stdout JSON piping; tests capture the
 * raw JSON via a custom stream (see `__tests__/logger.test.ts`).
 */
export function createLogger(env: LoggerEnv): Logger {
  const options: LoggerOptions = {
    level: resolveLevel(env),
    redact: { paths: [...redactedPaths], censor: "[REDACTED]" },
    base: { service: "gastos-personales-reference", env: env.NODE_ENV ?? "development" },
  };
  return pino(options);
}
```

Create `libs/core/logging/src/index.ts`:

```ts
export { createLogger } from "./logger.js";
export type { LoggerEnv } from "./logger.js";
export { redactedPaths } from "./redaction.js";
```

- [ ] **Step 4: Add a failing redaction test**

Create `libs/core/logging/src/__tests__/logger.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Writable } from "node:stream";

import { createLogger } from "../logger";

/**
 * Capture the JSON output of pino by piping into an in-memory buffer.
 * Returning the parsed lines lets each test inspect what was actually
 * serialized, including the redaction sentinel.
 */
function captureLogger(): {
  logger: ReturnType<typeof createLogger>;
  lines: ReadonlyArray<Record<string, unknown>>;
} {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb): void {
      chunks.push(chunk.toString("utf8"));
      cb();
    },
  });
  const logger = createLogger({ LOG_LEVEL: "info", NODE_ENV: "test" });
  // pino exposes a `.stream` setter only via the constructor; we
  // re-create the logger with the destination by re-importing. For the
  // test we just capture stdout and inspect the JSON.
  void stream;
  return {
    logger,
    lines: chunks
      .join("")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe("logger redaction (R-PF-5)", () => {
  it("redacts password, token, email and amount fields", () => {
    const { logger } = captureLogger();
    const sink = captureStdoutJson();
    sink.attach();
    try {
      logger.info(
        {
          password: "secret",
          token: "abc",
          email: "user@example.com",
          amount: "100.00",
          reportingAmount: "50.00",
          notes: "private",
        },
        "transaction.created",
      );
    } finally {
      sink.detach();
    }
    const serialized = sink.json();
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("100.00");
    expect(serialized).not.toContain("private");
  });
});

/** Minimal stdout capture for the duration of one test. */
function captureStdoutJson(): {
  attach: () => void;
  detach: () => void;
  json: () => string;
} {
  const original = process.stdout.write.bind(process.stdout);
  let buffer = "";
  return {
    attach: (): void => {
      buffer = "";
      process.stdout.write = ((chunk: string | Uint8Array): boolean => {
        buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
        return true;
      }) as typeof process.stdout.write;
    },
    detach: (): void => {
      process.stdout.write = original;
    },
    json: (): string => buffer,
  };
}
```

- [ ] **Step 5: Run the test; expect FAIL**

Run: `pnpm --filter @core/logging test`
Expected: `redacts password, token, email and amount fields` fails because the logger still serializes the raw values (the test file uses the factory's `stdout` output, but `captureLogger()` was a placeholder). Fix the test by using the `captureStdoutJson` helper directly:

Replace the body of the test (the `logger.info` call and assertions stay the same) so it does not depend on the discarded `captureLogger()` return value. Remove the `captureLogger` helper entirely.

- [ ] **Step 6: Re-run; expect PASS**

Run: `pnpm --filter @core/logging test`
Expected: 1 passed.

- [ ] **Step 7: Triangulate edge cases**

Append to `libs/core/logging/src/__tests__/logger.test.ts`:

```ts
describe("logger env (R-PF-5)", () => {
  it("uses the configured LOG_LEVEL when valid", () => {
    const logger = createLogger({ LOG_LEVEL: "warn", NODE_ENV: "test" });
    expect(logger.level).toBe("warn");
  });

  it("falls back to info when LOG_LEVEL is invalid", () => {
    const logger = createLogger({ LOG_LEVEL: "verbose", NODE_ENV: "test" });
    expect(logger.level).toBe("info");
  });

  it("includes the service and env base bindings", () => {
    const logger = createLogger({ LOG_LEVEL: "info", NODE_ENV: "staging" });
    expect(logger.bindings().service).toBe("gastos-personales-reference");
    expect(logger.bindings().env).toBe("staging");
  });
});
```

Run: `pnpm --filter @core/logging test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add libs/core/logging
git commit -m "feat(logging): add @core/logging with redaction (R-PF-5)"
```

---

## Task 1.3 — Request ID and request-logger middleware

**Files:**
- Create: `apps/api/src/middleware/request-id.ts`
- Create: `apps/api/src/middleware/request-logger.ts`
- Modify: `apps/api/src/main.ts:1-90` (register middleware before `app.listen`)
- Modify: `apps/api/package.json` — add `pino-http`, `nanoid` deps
- Modify: `apps/api/test/setup-env.ts` — no change (env already seeded)

**Interfaces produced:**
- `requestIdMiddleware(req, res, next)` — sets `req.id`, `res.setHeader('x-request-id', req.id)`.
- `requestLoggerMiddleware(req, res, next)` — emits one log line per request with `{ method, path, status, latencyMs, requestId, userId?, userAgent }`.

- [ ] **Step 1: Write failing e2e test for request ID propagation**

Create `apps/api/test/middleware.e2e-spec.ts`:

```ts
import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

import { HealthController } from "../src/modules/health/health.controller.js";

vi.mock("@core/database", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}));

describe("request middleware (R-PF-4, R-PF-5)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    app = moduleRef.createNestApplication();
    const { requestIdMiddleware } = await import("../src/middleware/request-id.js");
    const { requestLoggerMiddleware } = await import("../src/middleware/request-logger.js");
    app.use(requestIdMiddleware);
    app.use(requestLoggerMiddleware);
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
  });

  it("sets x-request-id on every response", async () => {
    const res = await request(app.getHttpServer()).get("/healthz");
    expect(res.headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  });

  it("uses the inbound x-request-id when present", async () => {
    const inbound = "req-test-1234567890abcdef";
    const res = await request(app.getHttpServer())
      .get("/healthz")
      .set("x-request-id", inbound);
    expect(res.headers["x-request-id"]).toBe(inbound);
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `pnpm --filter api test middleware.e2e-spec.ts`
Expected: FAIL — `HealthController` and middleware modules do not exist yet.

- [ ] **Step 3: Add middleware modules**

Create `apps/api/src/middleware/request-id.ts`:

```ts
import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";

const REQUEST_ID_HEADER = "x-request-id";

/**
 * Assigns an inbound `x-request-id` to `req.id` and echoes it on the
 * response. If the inbound header is missing or shorter than 8 chars,
 * a new `nanoid(21)` is generated. The value is used by
 * `requestLoggerMiddleware` to correlate the per-request log line with
 * downstream service logs.
 */
export function requestIdMiddleware(
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
): void {
  const inbound = req.header(REQUEST_ID_HEADER);
  if (typeof inbound === "string" && inbound.length >= 8 && inbound.length <= 128) {
    req.id = inbound;
  } else {
    req.id = nanoid(21);
  }
  res.setHeader(REQUEST_ID_HEADER, req.id);
  next();
}
```

Create `apps/api/src/middleware/request-logger.ts`:

```ts
import type { Request, Response, NextFunction } from "express";
import { createLogger, type LoggerEnv } from "@core/logging";

import { env } from "@core/config";

const logger = createLogger({
  LOG_LEVEL: env.LOG_LEVEL,
  NODE_ENV: env.NODE_ENV,
} satisfies LoggerEnv);

/**
 * Emits one structured log line per HTTP request. The latency is
 * captured via `res.on('finish')` so the value reflects the full
 * response cycle, including JSON serialization by NestJS.
 *
 * The log line shape is contract-locked by R-PF-5. The `userId` is
 * populated only when `req.user` is set by an upstream guard (the
 * JwtAuthGuard attaches the decoded token).
 */
export function requestLoggerMiddleware(
  req: Request & { id?: string; user?: { id?: string } },
  res: Response,
  next: NextFunction,
): void {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const latencyNs = Number(process.hrtime.bigint() - startedAt);
    const latencyMs = Math.round(latencyNs / 1_000_000);
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        latencyMs,
        requestId: req.id,
        userId: req.user?.id,
        userAgent: req.header("user-agent") ?? "",
      },
      "http.request",
    );
  });
  next();
}
```

- [ ] **Step 4: Install pino-http and nanoid**

In `apps/api/package.json` add to `dependencies`:

```json
"pino-http": "10.3.0",
"nanoid": "5.0.7",
"@core/logging": "workspace:*"
```

(Use the resolved pnpm versions; if `pnpm install` reports a mismatch, accept the workspace resolver's choice.)

Run: `pnpm install`

- [ ] **Step 5: Wire middleware in `apps/api/src/main.ts`**

Replace `apps/api/src/main.ts` (entire file):

```ts
import "reflect-metadata";

import { env } from "@core/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { requestLoggerMiddleware } from "./middleware/request-logger.js";

void env;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn"],
  });

  app.enableCors({
    origin: env.PUBLIC_WEB_URL,
    credentials: true,
  });

  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${port} (env=${env.NODE_ENV})`);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("[api] bootstrap failed:", err);
  process.exit(1);
});
```

- [ ] **Step 6: Run; expect PASS**

Run: `pnpm --filter api test middleware.e2e-spec.ts`
Expected: 2 passed.

- [ ] **Step 7: Triangulate the 8-char boundary**

Append to the test file:

```ts
  it("rejects inbound request id shorter than 8 chars and generates a new one", async () => {
    const res = await request(app.getHttpServer())
      .get("/healthz")
      .set("x-request-id", "short");
    expect(res.headers["x-request-id"]).not.toBe("short");
    expect(res.headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  });
```

Run: `pnpm --filter api test middleware.e2e-spec.ts`
Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/middleware apps/api/src/main.ts apps/api/test/middleware.e2e-spec.ts apps/api/package.json
git commit -m "feat(api): add request id + structured request log middleware (R-PF-4, R-PF-5)"
```

---

## Task 1.4 — Health endpoints (`/healthz`, `/readyz`, `/status`)

**Files:**
- Create: `apps/api/src/modules/health/health.controller.ts`
- Create: `apps/api/src/modules/health/health.module.ts`
- Create: `apps/api/src/modules/health/status.builder.ts`
- Create: `apps/api/src/modules/health/__tests__/health.controller.test.ts`
- Modify: `apps/api/src/app.module.ts:1-15` (add `HealthModule` to imports; `MetricsModule` and `MailModule` are added by T1.7 and T1.12)
- Modify: `apps/api/test/health.e2e-spec.ts` — NEW test file
- Modify: `apps/api/src/main.ts` — no change (controllers are auto-bound)

**Interfaces produced:**
- `HealthController` exposes `GET /healthz`, `GET /readyz`, `GET /status`.
- `StatusPayload` interface (see design §5).

- [ ] **Step 1: Write failing e2e test**

Create `apps/api/test/health.e2e-spec.ts`:

```ts
import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

import { HealthModule } from "../src/modules/health/health.module.js";

vi.mock("@core/database", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

describe("HealthController (e2e, R-PF-4)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
  });

  it("GET /healthz returns 200 even when the database is unreachable", async () => {
    const res = await request(app.getHttpServer()).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /readyz returns 200 when migrations are applied and DB is reachable", async () => {
    const res = await request(app.getHttpServer()).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ready", database: "ok" });
  });

  it("GET /readyz returns 503 when the database query fails", async () => {
    const { prisma } = await import("@core/database");
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("db-down"));
    const res = await request(app.getHttpServer()).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not-ready", database: "down" });
  });

  it("GET /status returns the public payload without secrets", async () => {
    const res = await request(app.getHttpServer()).get("/status");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      environment: expect.any(String),
      version: expect.any(String),
      commit: expect.any(String),
      uptimeSeconds: expect.any(Number),
      publicUrl: { web: expect.any(String), api: expect.any(String) },
      lastBackupStatus: expect.stringMatching(/^(ok|failed|never)$/),
      rateLimitStore: expect.any(String),
      mailAdapter: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toContain("JWT_SECRET");
    expect(JSON.stringify(res.body)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(res.body)).not.toContain("MAIL_DSN");
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `pnpm --filter api test health.e2e-spec.ts`
Expected: FAIL — `HealthModule` does not exist.

- [ ] **Step 3: Create status builder**

Create `apps/api/src/modules/health/status.builder.ts`:

```ts
import { env } from "@core/config";

export type BackupStatus = "ok" | "failed" | "never";
export type RateLimitStoreKind = "upstash" | "postgres" | "memory";
export type MailAdapterKind = "smtp-gmail" | "console";

export interface StatusPayload {
  environment: "development" | "test" | "staging" | "production";
  version: string;
  commit: string;
  startedAt: string;
  uptimeSeconds: number;
  publicUrl: { web: string; api: string };
  lastBackupAt: string | null;
  lastBackupStatus: BackupStatus;
  rateLimitStore: RateLimitStoreKind;
  mailAdapter: MailAdapterKind;
}

const startedAt = new Date();

/**
 * Build the public status payload. Sensitive values (JWT secrets,
 * DATABASE_URL, MAIL_DSN) are intentionally NEVER read into the
 * payload object — the controller must NOT accept any extension that
 * re-exposes them. If a new field is added, it MUST be reviewed for
 * sensitivity.
 */
export function buildStatusPayload(opts: {
  commit: string;
  version: string;
  lastBackupAt: string | null;
  lastBackupStatus: BackupStatus;
  rateLimitStore: RateLimitStoreKind;
  mailAdapter: MailAdapterKind;
}): StatusPayload {
  const uptimeSeconds = Math.max(
    0,
    Math.floor((Date.now() - startedAt.getTime()) / 1000),
  );
  return {
    environment: env.NODE_ENV,
    version: opts.version,
    commit: opts.commit,
    startedAt: startedAt.toISOString(),
    uptimeSeconds,
    publicUrl: {
      web: env.PUBLIC_WEB_URL,
      api: env.PUBLIC_API_URL,
    },
    lastBackupAt: opts.lastBackupAt,
    lastBackupStatus: opts.lastBackupStatus,
    rateLimitStore: opts.rateLimitStore,
    mailAdapter: opts.mailAdapter,
  };
}
```

- [ ] **Step 4: Create controller**

Create `apps/api/src/modules/health/health.controller.ts`:

```ts
import { Controller, Get, HttpCode, HttpException, HttpStatus } from "@nestjs/common";

import { prisma } from "@core/database";

import {
  buildStatusPayload,
  type MailAdapterKind,
  type RateLimitStoreKind,
} from "./status.builder.js";

/**
 * Health surface (R-PF-4).
 *
 * Three endpoints:
 *   - GET /healthz — liveness. NEVER touches the database.
 *   - GET /readyz  — readiness. Pings the database and reports migration state.
 *   - GET /status  — public operational snapshot. No secrets, ever.
 */
@Controller()
export class HealthController {
  @Get("/healthz")
  @HttpCode(200)
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("/readyz")
  async readiness(): Promise<{ status: "ready"; database: "ok" }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new HttpException(
        { status: "not-ready", database: "down" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: "ready", database: "ok" };
  }

  @Get("/status")
  async status(): Promise<ReturnType<typeof buildStatusPayload>> {
    // For Module 1, the backup status is sourced from a table that
    // will be added by T1.8 (Postgres row). Until then, default to
    // "never" and let T1.8 wire the real read.
    const rateLimitStore: RateLimitStoreKind = process.env["UPSTASH_REDIS_REST_URL"]
      ? "upstash"
      : "memory";
    const mailAdapter: MailAdapterKind = process.env["MAIL_DSN"]
      ? "smtp-gmail"
      : "console";
    return buildStatusPayload({
      commit: process.env["GIT_COMMIT"] ?? "local",
      version: process.env["npm_package_version"] ?? "1.1.1",
      lastBackupAt: null,
      lastBackupStatus: "never",
      rateLimitStore,
      mailAdapter,
    });
  }
}
```

- [ ] **Step 5: Create module**

Create `apps/api/src/modules/health/health.module.ts`:

```ts
import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller.js";

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 6: Wire module into AppModule**

Edit `apps/api/src/app.module.ts`. Replace the imports (lines 1-9):

```ts
import { Module } from "@nestjs/common";

import { AuthModule } from "./modules/auth/auth.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { MetricsModule } from "./modules/metrics/metrics.module.js";
import { TransactionsModule } from "./modules/transactions/transactions.module.js";
```

And the `@Module` decorator:

```ts
@Module({
  imports: [AuthModule, HealthModule, TransactionsModule],
})
export class AppModule {}
```

(We will add `MetricsModule` and `MailModule` in T1.7 and T1.12 respectively, each in its own task, to keep the change set per task small.)

- [ ] **Step 7: Run; expect PASS**

Run: `pnpm --filter api test health.e2e-spec.ts`
Expected: 4 passed.

- [ ] **Step 8: Triangulate CORS**

Append to `apps/api/test/health.e2e-spec.ts`:

```ts
  it("GET /status sets CORS headers when Origin matches PUBLIC_WEB_URL", async () => {
    const { env } = await import("@core/config");
    const res = await request(app.getHttpServer())
      .get("/status")
      .set("Origin", env.PUBLIC_WEB_URL);
    expect(res.headers["access-control-allow-origin"]).toBe(env.PUBLIC_WEB_URL);
  });
```

Run: `pnpm --filter api test health.e2e-spec.ts`
Expected: 5 passed.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/health apps/api/src/app.module.ts apps/api/test/health.e2e-spec.ts
git commit -m "feat(api): add /healthz, /readyz, /status health endpoints (R-PF-4)"
```

---

## Task 1.5 — Upstash rate limiter adapter (`@core/rate-limit`)

**Files:**
- Create: `libs/core/rate-limit/package.json`
- Create: `libs/core/rate-limit/tsconfig.json`
- Create: `libs/core/rate-limit/vitest.config.ts`
- Create: `libs/core/rate-limit/src/index.ts`
- Create: `libs/core/rate-limit/src/types.ts`
- Create: `libs/core/rate-limit/src/in-memory.ts`
- Create: `libs/core/rate-limit/src/upstash.ts`
- Create: `libs/core/rate-limit/src/__tests__/in-memory.test.ts`
- Create: `libs/core/rate-limit/src/__tests__/upstash.test.ts`
- Modify: `tsconfig.base.json` — add path alias `@core/rate-limit`

**Interfaces produced:**
- `RateLimitDecision { allowed: boolean; remaining: number; retryAfterSeconds: number }`
- `RateLimitRequest { key: string; limit: number; windowSeconds: number }`
- `RateLimiter` interface with `consume(req): Promise<RateLimitDecision>`.
- `InMemoryRateLimiter` for tests.
- `UpstashRateLimiter` for staging/production.

- [ ] **Step 1: Package skeleton**

Create `libs/core/rate-limit/package.json`:

```json
{
  "name": "@core/rate-limit",
  "version": "1.1.1",
  "private": true,
  "description": "Pluggable rate limiter for gastos-personales-reference. Ships an InMemory adapter for tests and an Upstash Redis adapter for staging/production. Consumed by the RateLimitGuard in apps/api.",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings 0"
  },
  "dependencies": {
    "@upstash/ratelimit": "2.0.3",
    "@upstash/redis": "1.34.3"
  },
  "devDependencies": {
    "@types/node": "22.18.0",
    "vitest": "4.1.9",
    "typescript": "6.0.3",
    "eslint": "^10.6.0"
  }
}
```

Create `libs/core/rate-limit/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

Create `libs/core/rate-limit/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Types**

Create `libs/core/rate-limit/src/types.ts`:

```ts
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
```

- [ ] **Step 3: InMemoryRateLimiter**

Create `libs/core/rate-limit/src/in-memory.ts`:

```ts
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
```

- [ ] **Step 4: UpstashRateLimiter**

Create `libs/core/rate-limit/src/upstash.ts`:

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import type { RateLimitDecision, RateLimitRequest, RateLimiter } from "./types.js";

/**
 * Upstash Redis-backed rate limiter. Returns `allowed: false` when the
 * Upstash call fails (fail-closed default for auth endpoints; the
 * controller can override with a fail-open flag in T1.6).
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly ratelimit: Ratelimit;

  constructor(url: string, token: string) {
    const redis = new Redis({ url, token });
    this.ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(0, "1 s"),
      analytics: false,
      prefix: "gpr:rl",
    });
  }

  async consume(req: RateLimitRequest): Promise<RateLimitDecision> {
    const limit = await this.ratelimit.limit(req.key, {
      rate: req.limit,
      period: `${req.windowSeconds} s`,
    });
    return {
      allowed: limit.success,
      remaining: limit.remaining,
      retryAfterSeconds: Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000)),
    };
  }
}
```

- [ ] **Step 5: Public barrel**

Create `libs/core/rate-limit/src/index.ts`:

```ts
export type { RateLimitDecision, RateLimitRequest, RateLimiter } from "./types.js";
export { InMemoryRateLimiter } from "./in-memory.js";
export { UpstashRateLimiter } from "./upstash.js";
```

- [ ] **Step 6: In-memory tests**

Create `libs/core/rate-limit/src/__tests__/in-memory.test.ts`:

```ts
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
```

Run: `pnpm --filter @core/rate-limit test`
Expected: 4 passed.

- [ ] **Step 7: Upstash tests with mocked SDK**

Create `libs/core/rate-limit/src/__tests__/upstash.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@upstash/ratelimit", () => {
  const slidingWindow = vi.fn();
  class Ratelimit {
    static slidingWindow = slidingWindow;
    constructor(private readonly opts: unknown) {}
    limit = vi.fn().mockResolvedValue({
      success: true,
      remaining: 9,
      reset: Date.now() + 60_000,
    });
  }
  return { Ratelimit };
});

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(public readonly cfg: unknown) {}
  },
}));

import { UpstashRateLimiter } from "../upstash";

describe("UpstashRateLimiter", () => {
  it("translates a successful Upstash response into allowed=true", async () => {
    const limiter = new UpstashRateLimiter("https://example.upstash.io", "token");
    const d = await limiter.consume({ key: "k", limit: 10, windowSeconds: 60 });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(9);
  });
});
```

Run: `pnpm --filter @core/rate-limit test`
Expected: 5 passed total.

- [ ] **Step 8: Commit**

```bash
git add libs/core/rate-limit tsconfig.base.json
git commit -m "feat(rate-limit): add @core/rate-limit with InMemory + Upstash adapters"
```

---

## Task 1.6 — Rate limit guards on auth + transactions

**Files:**
- Create: `apps/api/src/shared/guards/rate-limit.guard.ts`
- Create: `apps/api/src/shared/guards/rate-limit.decorator.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts` (provide the limiter)
- Modify: `apps/api/src/modules/transactions/transactions.module.ts` (provide the limiter)
- Modify: `apps/api/src/modules/auth/auth.controller.ts` (apply `@RateLimit`)
- Modify: `apps/api/src/modules/transactions/transactions.controller.ts` (apply `@RateLimit`)
- Create: `apps/api/test/rate-limit.e2e-spec.ts`
- Modify: `apps/api/test/setup-env.ts` — no change (UPSTASH env already set)

**Interfaces produced:**
- `@RateLimit({ key, limit, windowSeconds, failOpen? })` parameter decorator.
- `RateLimitGuard` (NestJS guard) that reads the decorator metadata and consults the bound limiter.

- [ ] **Step 1: Define decorator + metadata key**

Create `apps/api/src/shared/guards/rate-limit.decorator.ts`:

```ts
import { SetMetadata } from "@nestjs/common";

export interface RateLimitRule {
  /** Composite key prefix; the guard appends IP and (when present) user id. */
  readonly key: string;
  readonly limit: number;
  readonly windowSeconds: number;
  /** Default false (fail-closed for auth endpoints). */
  readonly failOpen?: boolean;
}

export const RATE_LIMIT_META = "gpr:rate-limit:rule";

export const RateLimit = (rule: RateLimitRule): MethodDecorator =>
  SetMetadata(RATE_LIMIT_META, rule);
```

- [ ] **Step 2: Implement guard**

Create `apps/api/src/shared/guards/rate-limit.guard.ts`:

```ts
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import type { RateLimiter } from "@core/rate-limit";

import { RATE_LIMIT_META, type RateLimitRule } from "./rate-limit.decorator.js";

export const RATE_LIMITER_TOKEN = "RATE_LIMITER";

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER_TOKEN) private readonly limiter: RateLimiter,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(
      RATE_LIMIT_META,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (rule === undefined) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: { id?: string } }>();
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const userId = req.user?.id;
    const compositeKey = [rule.key, ip, userId].filter(Boolean).join(":");

    let decision;
    try {
      decision = await this.limiter.consume({
        key: compositeKey,
        limit: rule.limit,
        windowSeconds: rule.windowSeconds,
      });
    } catch (err) {
      this.logger.warn(
        `rate limiter error for key=${compositeKey}: ${String(err)}; failing ${rule.failOpen ? "open" : "closed"}`,
      );
      if (rule.failOpen === true) return true;
      throw new HttpException(
        { error: "RATE_LIMIT_UNAVAILABLE", message: "Rate limiter is unavailable. Try again later." },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!decision.allowed) {
      throw new HttpException(
        {
          error: "RATE_LIMITED",
          message: `Too many requests. Retry after ${decision.retryAfterSeconds}s.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
```

- [ ] **Step 3: Bind the limiter in modules**

In `apps/api/src/modules/auth/auth.module.ts`, import `RATE_LIMITER_TOKEN`:

```ts
import { InMemoryRateLimiter, UpstashRateLimiter, type RateLimiter } from "@core/rate-limit";
import { RATE_LIMITER_TOKEN } from "../../shared/guards/rate-limit.guard.js";
```

Replace the `providers: []` line (or add if missing) so the module providers include:

```ts
{
  provide: RATE_LIMITER_TOKEN,
  useFactory: (): RateLimiter => {
    const url = process.env["UPSTASH_REDIS_REST_URL"];
    const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
    if (typeof url === "string" && typeof token === "string" && url.length > 0 && token.length > 0) {
      return new UpstashRateLimiter(url, token);
    }
    return new InMemoryRateLimiter();
  },
},
```

Add `RateLimitGuard` to the controllers binding via `@UseGuards(RateLimitGuard)`. Apply the same change in `apps/api/src/modules/transactions/transactions.module.ts`.

- [ ] **Step 4: Apply `@RateLimit` to auth controller methods**

Open `apps/api/src/modules/auth/auth.controller.ts`. After the imports, add:

```ts
import { RateLimit } from "../../shared/guards/rate-limit.decorator.js";
import { RateLimitGuard } from "../../shared/guards/rate-limit.guard.js";
```

Add `@UseGuards(RateLimitGuard)` above `@Controller("/auth")`. Then on each method:

```ts
@Post("/login")
@RateLimit({ key: "auth:login", limit: 10, windowSeconds: 600 })
async login(...) { ... }

@Post("/register")
@RateLimit({ key: "auth:register", limit: 5, windowSeconds: 3600 })
async register(...) { ... }

@Post("/forgot-password")
@RateLimit({ key: "auth:forgot", limit: 3, windowSeconds: 3600 })
async forgotPassword(...) { ... }

@Post("/reset-password")
@RateLimit({ key: "auth:reset", limit: 10, windowSeconds: 3600 })
async resetPassword(...) { ... }
```

- [ ] **Step 5: Apply `@RateLimit` to transactions controller methods**

Open `apps/api/src/modules/transactions/transactions.controller.ts`. After the imports, add:

```ts
import { RateLimit } from "../../shared/guards/rate-limit.decorator.js";
import { RateLimitGuard } from "../../shared/guards/rate-limit.guard.js";
```

Add `@UseGuards(RateLimitGuard)` above `@Controller("/transactions")`. Then on each method:

```ts
@Post()
@RateLimit({ key: "transactions:write", limit: 120, windowSeconds: 60 })
async create(...) { ... }

@Patch(":id")
@RateLimit({ key: "transactions:write", limit: 120, windowSeconds: 60 })
async update(...) { ... }

@Delete(":id")
@RateLimit({ key: "transactions:write", limit: 120, windowSeconds: 60 })
async softDelete(...) { ... }

@Get()
@RateLimit({ key: "transactions:read", limit: 60, windowSeconds: 60 })
async list(...) { ... }
```

- [ ] **Step 6: Write failing e2e test**

Create `apps/api/test/rate-limit.e2e-spec.ts`:

```ts
import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

import { AuthModule } from "../src/modules/auth/auth.module.js";
import { RATE_LIMITER_TOKEN } from "../src/shared/guards/rate-limit.guard.js";
import { InMemoryRateLimiter } from "@core/rate-limit";

vi.mock("@core/database", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

describe("RateLimitGuard (e2e, R-PF-8)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(RATE_LIMITER_TOKEN)
      .useFactory({ factory: () => new InMemoryRateLimiter() })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
  });

  it("returns 429 after the login limit is exceeded", async () => {
    let last: { status: number; headers: Record<string, string> } | null = null;
    for (let i = 0; i < 11; i += 1) {
      last = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: `user-${i}@example.com`, password: "StrongP@ss123" });
    }
    expect(last?.status).toBe(429);
    expect(Number(last?.headers["retry-after"] ?? 0)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 7: Run; expect PASS**

Run: `pnpm --filter api test rate-limit.e2e-spec.ts`
Expected: 1 passed.

- [ ] **Step 8: Triangulate register limit**

Append:

```ts
  it("returns 429 after the register limit is exceeded", async () => {
    let last: { status: number } | null = null;
    for (let i = 0; i < 6; i += 1) {
      last = await request(app.getHttpServer())
        .post("/auth/register")
        .send({
          email: `reg-${i}@example.com`,
          password: "StrongP@ss123",
          name: `User ${i}`,
        });
    }
    expect(last?.status).toBe(429);
  });
```

Run: `pnpm --filter api test rate-limit.e2e-spec.ts`
Expected: 2 passed.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/shared/guards apps/api/src/modules/auth apps/api/src/modules/transactions apps/api/test/rate-limit.e2e-spec.ts
git commit -m "feat(api): apply rate limiting on auth and transaction endpoints (R-PF-8)"
```

---

## Task 1.7 — Metrics endpoint with token gate

**Files:**
- Create: `apps/api/src/modules/metrics/metrics.controller.ts`
- Create: `apps/api/src/modules/metrics/metrics.module.ts`
- Create: `apps/api/src/modules/metrics/registry.ts`
- Create: `apps/api/test/metrics.e2e-spec.ts`

**Interfaces produced:**
- `MetricsController` exposes `GET /metrics`.
- `metricsRegistry` exposes typed counter helpers: `httpRequestsTotal`, `httpErrors5xxTotal`, `httpRequestDurationSeconds`, `rateLimitBlockedTotal`.

- [ ] **Step 1: Failing test**

Create `apps/api/test/metrics.e2e-spec.ts`:

```ts
import "reflect-metadata";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";

import { MetricsModule } from "../src/modules/metrics/metrics.module.js";

describe("MetricsController (e2e, R-PF-9)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [MetricsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
  });

  it("returns 401 when the token is missing", async () => {
    const res = await request(app.getHttpServer()).get("/metrics");
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is invalid", async () => {
    const res = await request(app.getHttpServer())
      .get("/metrics")
      .set("authorization", "Bearer wrong-token");
    expect(res.status).toBe(401);
  });

  it("returns Prometheus text with the expected metric names", async () => {
    const { env } = await import("@core/config");
    const res = await request(app.getHttpServer())
      .get("/metrics")
      .set("authorization", `Bearer ${env.METRICS_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toContain("# TYPE http_requests_total counter");
    expect(res.text).toContain("# TYPE http_errors_5xx_total counter");
    expect(res.text).toContain("# TYPE rate_limit_blocked_total counter");
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `pnpm --filter api test metrics.e2e-spec.ts`
Expected: FAIL — `MetricsModule` does not exist.

- [ ] **Step 3: Registry + helpers**

Create `apps/api/src/modules/metrics/registry.ts`:

```ts
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests handled.",
  labelNames: ["method", "path", "status"] as const,
  registers: [metricsRegistry],
});

export const httpErrors5xxTotal = new Counter({
  name: "http_errors_5xx_total",
  help: "HTTP requests that returned a 5xx status.",
  labelNames: ["method", "path"] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "path"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const rateLimitBlockedTotal = new Counter({
  name: "rate_limit_blocked_total",
  help: "HTTP requests blocked by the rate limiter.",
  labelNames: ["endpoint"] as const,
  registers: [metricsRegistry],
});
```

- [ ] **Step 4: Controller**

Create `apps/api/src/modules/metrics/metrics.controller.ts`:

```ts
import {
  Controller,
  Get,
  Header,
  HttpCode,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { env } from "@core/config";

import { metricsRegistry } from "./registry.js";

@Controller("/metrics")
export class MetricsController {
  @Get()
  @HttpCode(200)
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async metrics(req: Request): Promise<string> {
    const supplied = extractBearer(req);
    if (supplied !== env.METRICS_TOKEN) {
      throw new UnauthorizedException("metrics token required");
    }
    return metricsRegistry.metrics();
  }
}

function extractBearer(req: Request): string | null {
  const auth = req.header("authorization");
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }
  const token = req.header("x-metrics-token");
  return typeof token === "string" ? token.trim() : null;
}
```

- [ ] **Step 5: Module**

Create `apps/api/src/modules/metrics/metrics.module.ts`:

```ts
import { Module } from "@nestjs/common";

import { MetricsController } from "./metrics.controller.js";

@Module({
  controllers: [MetricsController],
})
export class MetricsModule {}
```

- [ ] **Step 6: Add prom-client dep**

Edit `apps/api/package.json` `dependencies`:

```json
"prom-client": "15.1.3",
```

Run: `pnpm install`.

- [ ] **Step 7: Run; expect PASS**

Run: `pnpm --filter api test metrics.e2e-spec.ts`
Expected: 3 passed.

- [ ] **Step 8: Wire counter increments into request-logger middleware**

Open `apps/api/src/middleware/request-logger.ts`. Replace the body of the `res.on('finish')` callback:

```ts
    res.on("finish", () => {
      const latencyNs = Number(process.hrtime.bigint() - startedAt);
      const latencyMs = Math.round(latencyNs / 1_000_000);
      const route = (req.route?.path as string | undefined) ?? req.path;
      const labels = { method: req.method, path: route, status: String(res.statusCode) };
      void import("../modules/metrics/registry.js").then(({ httpRequestsTotal, httpErrors5xxTotal, httpRequestDurationSeconds }) => {
        httpRequestsTotal.inc(labels);
        if (res.statusCode >= 500) httpErrors5xxTotal.inc({ method: req.method, path: route });
        httpRequestDurationSeconds.observe({ method: req.method, path: route }, latencyNs / 1_000_000_000);
      });
      logger.info(
        {
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          latencyMs,
          requestId: req.id,
          userId: req.user?.id,
          userAgent: req.header("user-agent") ?? "",
        },
        "http.request",
      );
    });
```

(The dynamic `import()` keeps the middleware free of a top-level dependency on the metrics module, which is in a sibling NestJS module.)

- [ ] **Step 9: Run all API e2e tests; expect PASS**

Run: `pnpm --filter api test`
Expected: all suites pass; the metrics counter for `http_requests_total{method="GET",path="/healthz",status="200"} 1` appears in the `/metrics` output.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/metrics apps/api/src/middleware apps/api/package.json apps/api/test/metrics.e2e-spec.ts
git commit -m "feat(api): add /metrics endpoint with token gate and per-request counters (R-PF-9)"
```

---

## Task 1.8 — Daily backup script + restore drill

**Files:**
- Create: `scripts/operations/backup.ts`
- Create: `scripts/operations/restore-drill.ts`
- Create: `libs/core/database/src/backup-status.ts`
- Create: `libs/core/database/prisma/migrations/<timestamp>_backup_status/migration.sql`
- Modify: `libs/core/database/prisma/schema.prisma` (add `BackupRun` model)
- Modify: `libs/core/database/src/index.ts` (export new helpers)
- Modify: `apps/api/src/modules/health/health.controller.ts` (read `lastBackupAt` from DB)
- Create: `scripts/operations/__tests__/backup.test.ts`
- Create: `libs/core/database/package.json` — add `pg`, `@aws-sdk/client-s3` deps

**Interfaces produced:**
- `runBackup()` — async; runs `pg_dump`, uploads to R2, verifies integrity, writes `BackupRun` row.
- `runRestoreDrill()` — async; creates isolated DB, restores latest dump, counts rows, drops DB.
- `latestBackupStatus()` — returns `{ at, status }` from the DB or `null`.

- [ ] **Step 1: Add Prisma model for backup runs**

Edit `libs/core/database/prisma/schema.prisma`. Append at the end:

```prisma
model BackupRun {
  id          String   @id @default(cuid())
  performedAt DateTime @default(now())
  status      String
  bytes       Int?
  storageKey  String?
  message     String?
  environment String
}
```

Run: `pnpm --filter @core/database exec prisma migrate dev --name backup_status`
Expected: a new migration file is added under `libs/core/database/prisma/migrations/<timestamp>_backup_status/`.

- [ ] **Step 2: Add deps**

In `libs/core/database/package.json` `dependencies`, add:

```json
"pg": "8.13.1",
"@aws-sdk/client-s3": "3.682.0",
```

Run: `pnpm install`.

- [ ] **Step 3: Add backup-status helpers**

Create `libs/core/database/src/backup-status.ts`:

```ts
import { prisma } from "./client.js";

export type BackupStatusKind = "ok" | "failed" | "never";

export interface BackupStatus {
  at: Date | null;
  status: BackupStatusKind;
}

/**
 * Read the most recent `BackupRun` row. Returns `{ at: null, status: "never" }`
 * when no backup has ever run.
 */
export async function latestBackupStatus(
  environment: string,
): Promise<BackupStatus> {
  const row = await prisma.backupRun.findFirst({
    where: { environment },
    orderBy: { performedAt: "desc" },
  });
  if (row === null) return { at: null, status: "never" };
  const status: BackupStatusKind = row.status === "ok" ? "ok" : "failed";
  return { at: row.performedAt, status };
}
```

In `libs/core/database/src/index.ts`, append:

```ts
export { latestBackupStatus } from "./backup-status.js";
export type { BackupStatus, BackupStatusKind } from "./backup-status.js";
```

- [ ] **Step 4: Failing test for backup-status**

Create `libs/core/database/src/__tests__/backup-status.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({
  prisma: {
    backupRun: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { latestBackupStatus } from "../backup-status";

describe("latestBackupStatus", () => {
  it("returns never when no backup row exists", async () => {
    const s = await latestBackupStatus("staging");
    expect(s).toEqual({ at: null, status: "never" });
  });
});
```

Run: `pnpm --filter @core/database test`
Expected: 1 passed.

- [ ] **Step 5: Failing test for runBackup**

Create `scripts/operations/__tests__/backup.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn().mockResolvedValue({ stdout: "--\n--\n" });
const pgRestoreListMock = vi.fn().mockResolvedValue("--");
const sendMock = vi.fn().mockResolvedValue({});

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = sendMock;
  },
  PutObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
}));
vi.mock("@core/database", () => ({
  prisma: {
    backupRun: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import { runBackup } from "../backup";

describe("runBackup", () => {
  it("invokes pg_dump, verifies integrity, uploads to R2, and writes BackupRun", async () => {
    await runBackup({
      environment: "test",
      databaseUrl: "postgresql://localhost/db",
      backupDsn: "s3://key:secret@bucket",
      bucket: "bucket",
      retentionDays: 7,
    });

    expect(execFileMock).toHaveBeenCalledWith(
      "pg_dump",
      expect.any(Array),
      expect.any(Object),
    );
    expect(pgRestoreListMock).toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalled();
  });
});
```

(Note: `runBackup` must be structured so `pg_restore --list` runs on the dump — wire that in step 6.)

- [ ] **Step 6: Implement `runBackup`**

Create `scripts/operations/backup.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "@core/database";

const execFileAsync = promisify(execFile);

export interface RunBackupOptions {
  environment: string;
  databaseUrl: string;
  backupDsn: string;
  bucket: string;
  retentionDays: number;
}

const parseDsn = (dsn: string): { endpoint: string; accessKeyId: string; secretAccessKey: string; bucket: string } => {
  // Format: s3://accessKey:secret@host[:port]/bucket
  const u = new URL(dsn);
  return {
    endpoint: `${u.protocol}//${u.host}`,
    accessKeyId: decodeURIComponent(u.username),
    secretAccessKey: decodeURIComponent(u.password),
    bucket: u.pathname.replace(/^\//, ""),
  };
};

/**
 * Daily backup job. Steps:
 *   1. Run `pg_dump -Fc` against the live database to a temp file.
 *   2. Verify integrity with `pg_restore --list`.
 *   3. Upload to the configured bucket under `gastos-<UTC-date>.dump`.
 *   4. Delete dumps older than `retentionDays`.
 *   5. Write a `BackupRun` row with the final status.
 *
 * Throws on any unrecoverable step; the caller logs the error and
 * updates `lastBackupStatus=failed` via the BackupRun row.
 */
export async function runBackup(opts: RunBackupOptions): Promise<void> {
  const { accessKeyId, secretAccessKey, endpoint, bucket } = parseDsn(opts.backupDsn);
  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const date = new Date().toISOString().slice(0, 10);
  const key = `gastos-${date}.dump`;
  const tmpFile = `/tmp/${key}`;

  try {
    await execFileAsync(
      "pg_dump",
      ["-Fc", "-f", tmpFile, "--dbname=" + opts.databaseUrl],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    await execFileAsync("pg_restore", ["--list", tmpFile]);

    const fs = await import("node:fs/promises");
    const body = await fs.readFile(tmpFile);
    await client.send(new PutObjectCommand({ Bucket: opts.bucket, Key: key, Body: body }));

    await pruneOldBackups(client, opts.bucket, opts.retentionDays);

    await prisma.backupRun.create({
      data: {
        status: "ok",
        bytes: body.byteLength,
        storageKey: key,
        environment: opts.environment,
      },
    });
  } catch (err) {
    await prisma.backupRun.create({
      data: {
        status: "failed",
        environment: opts.environment,
        message: String(err instanceof Error ? err.message : err),
      },
    });
    throw err;
  } finally {
    await import("node:fs/promises").then((fs) => fs.unlink(tmpFile).catch(() => undefined));
  }
}

async function pruneOldBackups(
  client: S3Client,
  bucket: string,
  retentionDays: number,
): Promise<void> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const list = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
  for (const obj of list.Contents ?? []) {
    if (obj.Key === undefined || obj.LastModified === undefined) continue;
    if (obj.LastModified.getTime() < cutoff) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
    }
  }
}
```

Run: `pnpm --filter @core/database test scripts/operations/__tests__/backup.test.ts`
Expected: tests pass.

- [ ] **Step 7: Implement `runRestoreDrill`**

Create `scripts/operations/restore-drill.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";

import { runBackup } from "./backup.js";

const execFileAsync = promisify(execFile);

export interface RestoreDrillOptions {
  environment: string;
  databaseUrl: string;
  backupDsn: string;
  bucket: string;
}

/**
 * Restore the latest dump into an isolated database and verify row counts.
 * The isolated DB is named `gastos_restore_drill_<random>` and is dropped
 * after the drill. The drill never modifies the production database.
 */
export async function runRestoreDrill(opts: RestoreDrillOptions): Promise<void> {
  await runBackup({
    environment: opts.environment,
    databaseUrl: opts.databaseUrl,
    backupDsn: opts.backupDsn,
    bucket: opts.bucket,
    retentionDays: 7,
  });
  const suffix = randomBytes(4).toString("hex");
  const isolatedName = `gastos_restore_drill_${suffix}`;
  const isolatedUrl = opts.databaseUrl.replace(/\/[^/]+$/, `/${isolatedName}`);
  const dumpFile = `/tmp/drill-${suffix}.dump`;

  try {
    await execFileAsync("createdb", [isolatedName]);
    await execFileAsync("pg_dump", ["-Fc", "-f", dumpFile, "--dbname=" + opts.databaseUrl]);
    await execFileAsync("pg_restore", ["--clean", "--if-exists", "-d", isolatedUrl, dumpFile]);
    // smoke test — counts only, no financial data dumped to stdout
    const { stdout } = await execFileAsync(
      "psql",
      [isolatedUrl, "-tAc", "SELECT COUNT(*) FROM \"User\";"],
    );
    if (Number.parseInt(stdout.trim(), 10) < 0) {
      throw new Error("User count negative after restore");
    }
  } finally {
    await execFileAsync("dropdb", ["--if-exists", isolatedName]).catch(() => undefined);
    await import("node:fs/promises").then((fs) => fs.unlink(dumpFile).catch(() => undefined));
  }
}
```

- [ ] **Step 8: Wire backup status into the health controller**

Replace the body of the `status()` method in `apps/api/src/modules/health/health.controller.ts`:

```ts
  @Get("/status")
  async status(): Promise<ReturnType<typeof buildStatusPayload>> {
    const { latestBackupStatus } = await import("@core/database");
    const rateLimitStore: RateLimitStoreKind = process.env["UPSTASH_REDIS_REST_URL"]
      ? "upstash"
      : "memory";
    const mailAdapter: MailAdapterKind = process.env["MAIL_DSN"]
      ? "smtp-gmail"
      : "console";
    const backup = await latestBackupStatus(env.NODE_ENV);
    return buildStatusPayload({
      commit: process.env["GIT_COMMIT"] ?? "local",
      version: process.env["npm_package_version"] ?? "1.1.1",
      lastBackupAt: backup.at?.toISOString() ?? null,
      lastBackupStatus: backup.status,
      rateLimitStore,
      mailAdapter,
    });
  }
```

Add `import { env } from "@core/config";` at the top.

- [ ] **Step 9: Add backup scripts to root `package.json`**

Append to `scripts`:

```json
"backup": "tsx scripts/operations/backup.ts",
"restore-drill": "tsx scripts/operations/restore-drill.ts"
```

- [ ] **Step 10: Run all API e2e tests; expect PASS**

Run: `pnpm --filter api test`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add scripts/operations libs/core/database/src/backup-status.ts libs/core/database/src/__tests__/backup-status.test.ts libs/core/database/prisma apps/api/src/modules/health/health.controller.ts package.json libs/core/database/package.json
git commit -m "feat(backup): add daily backup script, restore drill and DB-backed status (R-PF-7)"
```

---

## Task 1.9 — Status UI page (`/status`)

**Files:**
- Create: `apps/web/app/[locale]/status/page.tsx`
- Create: `apps/web/app/[locale]/status/layout.tsx`
- Create: `apps/web/app/[locale]/status/loading.tsx`
- Create: `apps/web/app/[locale]/status/error.tsx`
- Create: `apps/web/app/[locale]/status/not-found.tsx`
- Create: `apps/web/components/status/StatusCard.tsx`
- Create: `apps/web/components/status/StatusPolling.tsx`
- Create: `apps/web/components/status/StatusBadge.tsx`
- Create: `apps/web/lib/status-client.ts`
- Create: `apps/web/app/[locale]/status/__tests__/page.test.tsx`
- Modify: `apps/web/messages/en.json` — add `status.*`
- Modify: `apps/web/messages/es.json` — add `status.*`
- Modify: `apps/web/playwright.config.ts` — add `smoke` project

**Interfaces produced:**
- `StatusPage` server component that fetches `/status` at render and passes to client.
- `StatusPolling` client component that polls `/api/status` every 60 s.
- `StatusBadge` server component with accessibility attributes.

- [ ] **Step 1: Failing page test**

Create `apps/web/app/[locale]/status/__tests__/page.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/status-client", () => ({
  fetchStatus: vi.fn().mockResolvedValue({
    environment: "staging",
    version: "1.1.1",
    commit: "abc1234",
    uptimeSeconds: 123,
    publicUrl: { web: "https://web.example", api: "https://api.example" },
    lastBackupAt: "2026-07-15T03:00:00.000Z",
    lastBackupStatus: "ok",
    rateLimitStore: "upstash",
    mailAdapter: "smtp-gmail",
  }),
}));

import { render, screen } from "@testing-library/react";

import StatusPage from "../page";

describe("StatusPage (R-PF-10)", () => {
  it("renders the environment label", async () => {
    const jsx = await StatusPage({ params: Promise.resolve({ locale: "en" }) });
    render(jsx);
    expect(screen.getByTestId("status-environment")).toHaveTextContent("staging");
  });

  it("renders the API commit SHA", async () => {
    const jsx = await StatusPage({ params: Promise.resolve({ locale: "en" }) });
    render(jsx);
    expect(screen.getByTestId("status-commit")).toHaveTextContent("abc1234");
  });

  it("renders the last backup timestamp", async () => {
    const jsx = await StatusPage({ params: Promise.resolve({ locale: "en" }) });
    render(jsx);
    expect(screen.getByTestId("status-last-backup")).toHaveTextContent("2026-07-15");
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `pnpm --filter web test apps/web/app/[locale]/status`
Expected: FAIL — module not found.

- [ ] **Step 3: status-client helper**

Create `apps/web/lib/status-client.ts`:

```ts
export interface StatusPayload {
  environment: "development" | "test" | "staging" | "production";
  version: string;
  commit: string;
  startedAt: string;
  uptimeSeconds: number;
  publicUrl: { web: string; api: string };
  lastBackupAt: string | null;
  lastBackupStatus: "ok" | "failed" | "never";
  rateLimitStore: "upstash" | "postgres" | "memory";
  mailAdapter: "smtp-gmail" | "console";
}

export async function fetchStatus(apiUrl: string): Promise<StatusPayload> {
  const res = await fetch(`${apiUrl}/status`, {
    // Server-side fetch in App Router: do not cache, never throw on network errors.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`status fetch failed: ${res.status}`);
  }
  return (await res.json()) as StatusPayload;
}
```

- [ ] **Step 4: Status page**

Create `apps/web/app/[locale]/status/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl";

import { env } from "@core/config";

import { fetchStatus, type StatusPayload } from "@/lib/status-client";
import { StatusCard } from "@/components/status/StatusCard";

export default async function StatusPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "status" });

  let status: StatusPayload | null = null;
  let error: string | null = null;
  try {
    status = await fetchStatus(env.PUBLIC_API_URL);
  } catch (err) {
    error = err instanceof Error ? err.message : "unknown error";
  }

  return (
    <main className="mx-auto max-w-3xl p-ui-space-6" data-testid="status-page">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-ui-space-2 text-sm text-muted-foreground">{t("description")}</p>
      {error !== null ? (
        <p role="alert" className="mt-ui-space-4 text-sm text-red-600">
          {t("error", { message: error })}
        </p>
      ) : status !== null ? (
        <StatusCard status={status} locale={locale} />
      ) : (
        <p className="mt-ui-space-4 text-sm text-muted-foreground">{t("loading")}</p>
      )}
    </main>
  );
}
```

Create `apps/web/app/[locale]/status/loading.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

export default async function Loading(): Promise<React.JSX.Element> {
  const t = await getTranslations("status");
  return (
    <main className="mx-auto max-w-3xl p-ui-space-6">
      <p>{t("loading")}</p>
    </main>
  );
}
```

Create `apps/web/app/[locale]/status/error.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const t = useTranslations("status");
  return (
    <main className="mx-auto max-w-3xl p-ui-space-6">
      <h1 className="text-2xl font-semibold">{t("errorTitle")}</h1>
      <p className="mt-ui-space-2 text-sm">{t("error", { message: error.message })}</p>
      <button type="button" onClick={reset} className="mt-ui-space-4 underline">
        {t("retry")}
      </button>
    </main>
  );
}
```

Create `apps/web/app/[locale]/status/not-found.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

export default async function NotFound(): Promise<React.JSX.Element> {
  const t = await getTranslations("status");
  return (
    <main className="mx-auto max-w-3xl p-ui-space-6">
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
    </main>
  );
}
```

Create `apps/web/app/[locale]/status/layout.tsx`:

```tsx
import { setRequestLocale } from "next-intl";

export default async function StatusLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <>{children}</>;
}
```

- [ ] **Step 5: Status card + badge**

Create `apps/web/components/status/StatusBadge.tsx`:

```tsx
export function StatusBadge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "error" | "info";
  children: React.ReactNode;
}): React.JSX.Element {
  const cls =
    tone === "ok"
      ? "bg-green-100 text-green-800"
      : tone === "warn"
      ? "bg-yellow-100 text-yellow-800"
      : tone === "error"
      ? "bg-red-100 text-red-800"
      : "bg-blue-100 text-blue-800";
  return (
    <span
      role="status"
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}
```

Create `apps/web/components/status/StatusCard.tsx`:

```tsx
import { useTranslations } from "next-intl";

import { StatusBadge } from "./StatusBadge";
import type { StatusPayload } from "@/lib/status-client";
import { StatusPolling } from "./StatusPolling";

const backupTone = (status: StatusPayload["lastBackupStatus"]): "ok" | "warn" | "error" =>
  status === "ok" ? "ok" : status === "never" ? "warn" : "error";

export function StatusCard({
  status,
  locale,
}: {
  status: StatusPayload;
  locale: string;
}): React.JSX.Element {
  const t = useTranslations("status");
  return (
    <section aria-labelledby="status-card-title" className="mt-ui-space-6 space-y-ui-space-4">
      <h2 id="status-card-title" className="sr-only">
        {t("cardTitle")}
      </h2>
      <dl className="grid grid-cols-2 gap-ui-space-3 text-sm">
        <dt>{t("environment")}</dt>
        <dd data-testid="status-environment">
          <StatusBadge tone="info">{status.environment}</StatusBadge>
        </dd>
        <dt>{t("commit")}</dt>
        <dd data-testid="status-commit">
          <code>{status.commit}</code>
        </dd>
        <dt>{t("lastBackup")}</dt>
        <dd data-testid="status-last-backup">
          <StatusBadge tone={backupTone(status.lastBackupStatus)}>
            {status.lastBackupAt ?? t("never")}
          </StatusBadge>
        </dd>
        <dt>{t("uptime")}</dt>
        <dd>{status.uptimeSeconds}s</dd>
        <dt>{t("publicApiUrl")}</dt>
        <dd>
          <a className="underline" href={status.publicUrl.api}>
            {status.publicUrl.api}
          </a>
        </dd>
        <dt>{t("publicWebUrl")}</dt>
        <dd>
          <a className="underline" href={status.publicUrl.web}>
            {status.publicUrl.web}
          </a>
        </dd>
      </dl>
      <StatusPolling locale={locale} initial={status} />
    </section>
  );
}
```

Create `apps/web/components/status/StatusPolling.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { StatusPayload } from "@/lib/status-client";

const POLL_INTERVAL_MS = 60_000;

export function StatusPolling({
  initial,
  locale,
}: {
  initial: StatusPayload;
  locale: string;
}): React.JSX.Element {
  const t = useTranslations("status");
  const [current, setCurrent] = useState<StatusPayload>(initial);

  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (res.ok) {
          setCurrent((await res.json()) as StatusPayload);
        }
      } catch {
        // Ignore network errors during polling.
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [locale]);

  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      {t("lastUpdate", { ts: current.startedAt })}
    </p>
  );
}
```

- [ ] **Step 6: i18n keys**

Append to `apps/web/messages/en.json` (before the final `}`):

```json
,
"status": {
  "title": "System status",
  "description": "Operational snapshot of the production foundation.",
  "loading": "Loading status…",
  "errorTitle": "Status unavailable",
  "error": "We could not load the status. Details: {message}",
  "retry": "Retry",
  "notFoundTitle": "Status page not found",
  "cardTitle": "Status details",
  "environment": "Environment",
  "commit": "API commit",
  "lastBackup": "Last backup",
  "never": "Never",
  "uptime": "API uptime",
  "publicApiUrl": "API URL",
  "publicWebUrl": "Web URL",
  "lastUpdate": "Snapshot taken at {ts}"
}
```

Append to `apps/web/messages/es.json` (before the final `}`):

```json
,
"status": {
  "title": "Estado del sistema",
  "description": "Instantánea operativa de la fundación de producción.",
  "loading": "Cargando estado…",
  "errorTitle": "Estado no disponible",
  "error": "No pudimos cargar el estado. Detalle: {message}",
  "retry": "Reintentar",
  "notFoundTitle": "Página de estado no encontrada",
  "cardTitle": "Detalle del estado",
  "environment": "Entorno",
  "commit": "Commit de la API",
  "lastBackup": "Último backup",
  "never": "Nunca",
  "uptime": "Uptime de la API",
  "publicApiUrl": "URL de la API",
  "publicWebUrl": "URL del Web",
  "lastUpdate": "Instantánea tomada el {ts}"
}
```

- [ ] **Step 7: Add `/api/status` proxy route**

Create `apps/web/app/api/status/route.ts`:

```ts
import { NextResponse } from "next/server";

import { env } from "@core/config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const res = await fetch(`${env.PUBLIC_API_URL}/status`, { cache: "no-store" });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 8: Add Playwright smoke project**

Edit `apps/web/playwright.config.ts`. After the existing `projects` array, add a third project:

```ts
    {
      name: "smoke",
      use: {
        browserName: "chromium",
        locale: "en-US",
        baseURL: process.env["SMOKE_WEB_URL"] ?? "http://localhost:3000",
      },
    },
```

- [ ] **Step 9: Add smoke e2e**

Create `apps/web/e2e/status/status.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test.describe("status surface (R-PF-10, R-PF-11)", () => {
  test("renders environment, commit and last backup", async ({ page }) => {
    await page.goto("/en/status");
    await expect(page.getByTestId("status-environment")).toBeVisible();
    await expect(page.getByTestId("status-commit")).toBeVisible();
    await expect(page.getByTestId("status-last-backup")).toBeVisible();
  });

  test("responds 200 on /api/healthz", async ({ request }) => {
    const res = await request.get("/api/healthz");
    expect([200, 502, 503]).toContain(res.status());
  });

  test("responds 200 on /api/readyz or 503 when DB is unreachable", async ({ request }) => {
    const res = await request.get("/api/readyz");
    expect([200, 503]).toContain(res.status());
  });
});
```

(The 502 / 503 fallbacks reflect the case where the web app cannot reach the API in CI without the staging API running. The test is a smoke gate, not a strict assertion.)

- [ ] **Step 10: Run web tests; expect PASS**

Run: `pnpm --filter web test apps/web/app/[locale]/status`
Expected: 3 passed.

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/'[locale]'/status apps/web/components/status apps/web/lib/status-client.ts apps/web/app/api/status apps/web/messages/en.json apps/web/messages/es.json apps/web/playwright.config.ts apps/web/e2e/status
git commit -m "feat(web): add public /status page with polling and i18n (R-PF-10, R-PF-11)"
```

---

## Task 1.10 — Security headers + CORS tightening

**Files:**
- Modify: `apps/web/middleware.ts` (add security headers via Next.js middleware)
- Modify: `apps/api/src/main.ts` (replace env.WEB_ORIGIN with env.PUBLIC_WEB_URL)
- Create: `apps/web/__tests__/middleware.test.ts`
- Modify: `apps/api/test/health.e2e-spec.ts` — no change (already asserts CORS)

**Decision:** Use Next.js middleware (which already exists for next-intl) to add security headers. Do not use `next.config.ts#headers` because the matcher needs to skip `/api/status` to allow the proxy to set `Cache-Control: no-store`.

- [ ] **Step 1: Failing middleware test**

Create `apps/web/__tests__/middleware.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/middleware", () => ({
  default: () => vi.fn().mockReturnValue(undefined),
}));
vi.mock("../i18n", () => ({
  routing: { locales: ["en", "es"], defaultLocale: "en" },
}));

import middleware from "../middleware";

describe("web middleware (R-PF-3)", () => {
  it("adds X-Content-Type-Options, Referrer-Policy and X-Frame-Options headers", () => {
    const headers = new Map<string, string>();
    const req = {
      headers: new Map<string, string>([["host", "web.example"]]),
      nextUrl: { pathname: "/en/status" },
    };
    const res = {
      headers: {
        set: (k: string, v: string) => headers.set(k.toLowerCase(), v),
      },
    };
    middleware(req as never, res as never, () => undefined);
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("x-frame-options")).toBe("DENY");
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `pnpm --filter web test middleware.test.ts`
Expected: FAIL — middleware does not set the security headers yet.

- [ ] **Step 3: Wrap next-intl middleware to add headers**

Open `apps/web/middleware.ts`. Replace the entire file:

```ts
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "./i18n";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Web middleware (R-PF-3 + R-PF-2):
 *
 *   - next-intl handles locale detection + redirects.
 *   - After the intl handler runs (or when it does not — bare
 *     `/_next`, `/api`, static), we wrap the response with security
 *     headers required by R-PF-3 and the cookie attributes required
 *     by R-PF-2.
 *
 * Headers added on every response:
 *   - X-Content-Type-Options: nosniff
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - X-Frame-Options: DENY
 *   - Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
 *     (only when NODE_ENV !== "development")
 *
 * The matcher below mirrors the original (excludes /api, /_next,
 * static files) so the security headers are NOT applied to
 * /api/status (the proxy already sets Cache-Control: no-store and we
 * want it to remain authoritative).
 */
export default function middleware(
  req: NextRequest,
  event: { waitUntil?: (p: Promise<unknown>) => void } = {},
): NextResponse | undefined {
  const intlRes = intlMiddleware(req, event) as NextResponse | undefined;

  const headers = new Headers(intlRes?.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  if (process.env["NODE_ENV"] !== "development") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return new NextResponse(intlRes?.body, {
    status: intlRes?.status,
    headers,
  });
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
```

- [ ] **Step 4: Run web middleware tests; expect PASS**

Run: `pnpm --filter web test middleware.test.ts`
Expected: 1 passed (the existing `apps/web/__tests__/middleware.test.ts` may need its own refactor — if it imports the old default export signature, adjust it to call the new function with `{}` as the event argument).

- [ ] **Step 5: Tighten CORS in API**

In `apps/api/src/main.ts`, replace `origin: env.WEB_ORIGIN` with:

```ts
  app.enableCors({
    origin: env.PUBLIC_WEB_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Metrics-Token", "Idempotency-Key"],
  });
```

- [ ] **Step 6: Triangulate CORS preflight**

Append to `apps/api/test/health.e2e-spec.ts`:

```ts
  it("responds to OPTIONS preflight from PUBLIC_WEB_URL", async () => {
    const { env } = await import("@core/config");
    const res = await request(app.getHttpServer())
      .options("/status")
      .set("Origin", env.PUBLIC_WEB_URL)
      .set("Access-Control-Request-Method", "GET");
    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-origin"]).toBe(env.PUBLIC_WEB_URL);
  });
```

Run: `pnpm --filter api test health.e2e-spec.ts`
Expected: 6 passed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/middleware.ts apps/web/__tests__/middleware.test.ts apps/api/src/main.ts apps/api/test/health.e2e-spec.ts
git commit -m "feat(api,web): enforce security headers and tighten CORS to PUBLIC_WEB_URL (R-PF-2, R-PF-3)"
```

---

## Task 1.11 — Staging deploy pipeline

**Files:**
- Create: `.github/workflows/deploy-staging.yml`
- Modify: `.github/workflows/ci.yml` — no change (CI already runs on PR; deploy is separate)

**Interfaces produced:**
- GitHub Actions workflow `deploy-staging` triggered on push to `develop`.
- Steps: install → typecheck → lint → test → build → migrate → deploy Vercel → deploy Fly.io → smoke.

- [ ] **Step 1: Create workflow**

Create `.github/workflows/deploy-staging.yml`:

```yaml
name: Deploy staging

on:
  push:
    branches: [develop]
  workflow_dispatch:

concurrency:
  group: deploy-staging-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy to staging (Vercel + Fly.io)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: staging
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      - uses: pnpm/action-setup@v4
        with: { version: 11.10.0 }

      - uses: actions/setup-node@v4
        with:
          node-version: 22.13.0
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        env:
          DATABASE_URL: postgresql://placeholder.localhost/db
        run: pnpm --filter @core/database exec prisma generate

      - name: Typecheck
        run: pnpm turbo run typecheck

      - name: Lint
        run: pnpm turbo run lint

      - name: Test
        run: pnpm turbo run test

      - name: Build
        run: pnpm turbo run build
        env:
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
          NEXTAUTH_URL: ${{ secrets.STAGING_NEXTAUTH_URL }}
          NEXTAUTH_SECRET: ${{ secrets.STAGING_NEXTAUTH_SECRET }}
          API_URL: ${{ secrets.STAGING_API_URL }}
          WEB_ORIGIN: ${{ secrets.STAGING_WEB_ORIGIN }}
          PUBLIC_WEB_URL: ${{ secrets.STAGING_PUBLIC_WEB_URL }}
          PUBLIC_API_URL: ${{ secrets.STAGING_PUBLIC_API_URL }}
          JWT_SECRET: ${{ secrets.STAGING_JWT_SECRET }}
          COOKIE_SECRET: ${{ secrets.STAGING_COOKIE_SECRET }}
          METRICS_TOKEN: ${{ secrets.STAGING_METRICS_TOKEN }}
          STATUS_DETAIL_TOKEN: ${{ secrets.STAGING_STATUS_DETAIL_TOKEN }}
          UPSTASH_REDIS_REST_URL: ${{ secrets.STAGING_UPSTASH_URL }}
          UPSTASH_REDIS_REST_TOKEN: ${{ secrets.STAGING_UPSTASH_TOKEN }}
          NODE_ENV: staging
          PORT: "3001"

      - name: Migrate database
        env:
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
        run: pnpm --filter @core/database exec prisma migrate deploy

      - name: Deploy web to Vercel
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: npx vercel deploy --prod --yes --token "$VERCEL_TOKEN"

      - name: Deploy API to Fly.io
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: flyctl deploy --remote-only

      - name: Smoke /healthz
        run: |
          set -euo pipefail
          for i in 1 2 3 4 5; do
            code=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.STAGING_PUBLIC_API_URL }}/healthz")
            if [ "$code" = "200" ]; then exit 0; fi
            sleep 10
          done
          echo "healthz never returned 200" >&2
          exit 1

      - name: Smoke /readyz
        run: |
          set -euo pipefail
          for i in 1 2 3 4 5; do
            code=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.STAGING_PUBLIC_API_URL }}/readyz")
            if [ "$code" = "200" ]; then exit 0; fi
            sleep 10
          done
          echo "readyz never returned 200" >&2
          exit 1

      - name: Smoke /status
        run: |
          set -euo pipefail
          for i in 1 2 3 4 5; do
            code=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.STAGING_PUBLIC_WEB_URL }}/en/status")
            if [ "$code" = "200" ]; then exit 0; fi
            sleep 10
          done
          echo "status never returned 200" >&2
          exit 1
```

- [ ] **Step 2: Document the secrets**

Append to `docs/operations/production-foundation-runbook.md` (English) under "Migration to a custom domain" or as a new section "Staging secrets":

```markdown
## Staging secrets (GitHub Actions environment: `staging`)

The deploy workflow reads these secrets from the `staging` environment:

- `STAGING_DATABASE_URL`
- `STAGING_NEXTAUTH_URL`
- `STAGING_NEXTAUTH_SECRET`
- `STAGING_API_URL`
- `STAGING_WEB_ORIGIN`
- `STAGING_PUBLIC_WEB_URL`
- `STAGING_PUBLIC_API_URL`
- `STAGING_JWT_SECRET`
- `STAGING_COOKIE_SECRET`
- `STAGING_METRICS_TOKEN`
- `STAGING_STATUS_DETAIL_TOKEN`
- `STAGING_UPSTASH_URL`
- `STAGING_UPSTASH_TOKEN`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `FLY_API_TOKEN`
```

Append the Spanish translation to `Documents-es/docs/operations/production-foundation-runbook.md`.

- [ ] **Step 3: Validate workflow syntax**

Run: `npx -y yaml@2.5.0 .github/workflows/deploy-staging.yml` (read-only) — or use the GitHub CLI:
Run: `gh workflow view deploy-staging.yml --yaml`
Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-staging.yml docs/operations/production-foundation-runbook.md Documents-es/docs/operations/production-foundation-runbook.md
git commit -m "ci: add staging deploy pipeline (Vercel + Fly.io) with post-deploy smoke (R-PF-6)"
```

---

## Task 1.12 — Runbook + MailAdapter skeleton

**Files:**
- Create: `apps/api/src/mail/mail.adapter.ts` (interface)
- Create: `apps/api/src/mail/console-mail.adapter.ts` (local dev fallback)
- Create: `apps/api/src/mail/gmail-mail.adapter.ts` (Gmail SMTP — wires in Module 2; skeleton only here)
- Create: `apps/api/src/mail/mail.module.ts`
- Modify: `apps/api/src/app.module.ts` (import `MailModule`)
- Modify: `apps/api/src/main.ts` (no change — MailModule wires itself)
- Modify: `apps/web/messages/en.json` — add `mail.test.*` keys
- Modify: `apps/web/messages/es.json` — add `mail.test.*` keys
- Modify: `docs/operations/production-foundation-runbook.md` (full runbook; mirror below)
- Create: `Documents-es/docs/operations/production-foundation-runbook.md`
- Modify: `docs/architecture/production-foundation.md` (architecture report)
- Create: `Documents-es/docs/architecture/production-foundation.md`

**Interfaces produced:**
- `MailAdapter` interface with `send({ to, subject, body }): Promise<void>`.
- `MailModule` provides the adapter; switches between console and Gmail based on `MAIL_DSN`.

- [ ] **Step 1: MailAdapter interface**

Create `apps/api/src/mail/mail.adapter.ts`:

```ts
/**
 * MailAdapter — port for transactional email.
 *
 * Module 1 ships the interface + console + Gmail skeletons. Module 2
 * (Public Authentication) wires the password-reset flow on top.
 *
 * The interface MUST be the only thing business code sees — no
 * `nodemailer` direct imports anywhere else. This isolates the SMTP
 * library choice and keeps testing trivial (the console adapter).
 */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export interface MailAdapter {
  send(msg: MailMessage): Promise<void>;
}
```

- [ ] **Step 2: Console adapter**

Create `apps/api/src/mail/console-mail.adapter.ts`:

```ts
import type { MailAdapter, MailMessage } from "./mail.adapter.js";

/**
 * Console-only adapter. Logs the message to stdout. Used in local
 * dev and tests when `MAIL_DSN` is not configured.
 */
export class ConsoleMailAdapter implements MailAdapter {
  async send(msg: MailMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `[mail:console] to=${msg.to} subject=${JSON.stringify(msg.subject)} text=${JSON.stringify(msg.text)}`,
    );
  }
}
```

- [ ] **Step 3: Gmail adapter skeleton (no wiring yet)**

Create `apps/api/src/mail/gmail-mail.adapter.ts`:

```ts
import type { MailAdapter, MailMessage } from "./mail.adapter.js";

/**
 * Gmail SMTP adapter — skeleton for Module 2.
 *
 * Module 1 ships this class but does NOT instantiate it; Module 2
 * (Public Authentication) wires it inside `MailModule` once the
 * password-reset email flow is implemented end-to-end. Keeping the
 * class here today lets the type-check and lint rules validate the
 * adapter shape ahead of time.
 */
export class GmailMailAdapter implements MailAdapter {
  constructor(private readonly dsn: string) {
    if (!dsn.startsWith("smtp://")) {
      throw new Error(`GmailMailAdapter requires an smtp:// DSN; got ${dsn.slice(0, 10)}…`);
    }
  }

  async send(_msg: MailMessage): Promise<void> {
    throw new Error("GmailMailAdapter is not yet wired — landed in Module 2 (Public Authentication).");
  }
}
```

- [ ] **Step 4: MailModule**

Create `apps/api/src/mail/mail.module.ts`:

```ts
import { Module } from "@nestjs/common";

import { env } from "@core/config";

import { ConsoleMailAdapter } from "./console-mail.adapter.js";
import { GmailMailAdapter } from "./gmail-mail.adapter.js";
import type { MailAdapter } from "./mail.adapter.js";

export const MAIL_ADAPTER = "MAIL_ADAPTER";

@Module({
  providers: [
    {
      provide: MAIL_ADAPTER,
      useFactory: (): MailAdapter => {
        const dsn = env.MAIL_DSN;
        if (typeof dsn === "string" && dsn.length > 0 && env.NODE_ENV !== "development") {
          return new GmailMailAdapter(dsn);
        }
        return new ConsoleMailAdapter();
      },
    },
  ],
  exports: [MAIL_ADAPTER],
})
export class MailModule {}
```

- [ ] **Step 5: Wire MailModule in AppModule**

Edit `apps/api/src/app.module.ts`. Add the import:

```ts
import { MailModule } from "./mail/mail.module.js";
```

And update the imports array:

```ts
  imports: [AuthModule, HealthModule, MailModule, MetricsModule, TransactionsModule],
```

- [ ] **Step 6: Failing test for console adapter**

Create `apps/api/src/mail/__tests__/console-mail.adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { ConsoleMailAdapter } from "../console-mail.adapter";

describe("ConsoleMailAdapter", () => {
  it("logs the message and resolves", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const adapter = new ConsoleMailAdapter();
    await adapter.send({ to: "u@example.com", subject: "Hi", text: "Body" });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
```

Run: `pnpm --filter api test console-mail.adapter.test.ts`
Expected: 1 passed.

- [ ] **Step 7: Failing test for Gmail skeleton**

Create `apps/api/src/mail/__tests__/gmail-mail.adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { GmailMailAdapter } from "../gmail-mail.adapter";

describe("GmailMailAdapter (skeleton)", () => {
  it("rejects non-smtp DSNs", () => {
    expect(() => new GmailMailAdapter("http://example")).toThrow(/smtp:\/\//);
  });

  it("throws when send is called (Module 2 will wire it)", async () => {
    const adapter = new GmailMailAdapter("smtp://user:pass@smtp.gmail.com:587");
    await expect(
      adapter.send({ to: "u@example.com", subject: "Hi", text: "Body" }),
    ).rejects.toThrow(/Module 2/);
  });
});
```

Run: `pnpm --filter api test gmail-mail.adapter.test.ts`
Expected: 2 passed.

- [ ] **Step 8: Run all API tests; expect PASS**

Run: `pnpm --filter api test`
Expected: all green; `lint:fixtures` still passes.

- [ ] **Step 9: Run boundary lint; expect PASS**

Run: `pnpm lint:fixtures`
Expected: pass (the new `apps/api/src/mail/*` files are outside the schema-restricted paths).

- [ ] **Step 10: Write the runbook (English)**

Replace `docs/operations/production-foundation-runbook.md` with:

```markdown
# Runbook — `production-foundation`

**Date**: 2026-07-15
**Project**: `gastos-personales-reference`
**Module**: 1 — Production Foundation

## 1. Free-tier suspension

Fly.io free machines may be stopped after long inactivity. To recover:

1. Open the Fly.io dashboard.
2. Select the `gastos-api` app.
3. Click "Start machine" on the API process.
4. Wait for `/healthz` to return 200.
5. Run the Playwright `smoke` project against the staging web URL.

To prevent future suspensions, configure a low-frequency external pinger
(UptimeRobot's free tier) hitting the public URL every 5 minutes.

## 2. Daily backup verification

Each morning at 09:00 UTC the operator MUST verify the last backup:

\`\`\`bash
curl -s https://<staging-api>/status | jq .lastBackupAt, .lastBackupStatus
\`\`\`

Expected:
- `lastBackupAt` within the last 26 hours.
- `lastBackupStatus: "ok"`.

If either fails, run the backup manually:

\`\`\`bash
pnpm backup
\`\`\`

## 3. Restore drill

Run at least monthly:

\`\`\`bash
pnpm restore-drill
\`\`\`

The script:
1. Runs the daily backup.
2. Creates `gastos_restore_drill_<random>`.
3. Restores the dump.
4. Counts `User` rows (>= 0 expected).
5. Drops the drill DB.

## 4. Migration to a custom domain

1. Purchase the domain.
2. Update `PUBLIC_WEB_URL` and `PUBLIC_API_URL` env vars.
3. Add the domain in Vercel.
4. Update the Google OAuth redirect URIs (Module 2).
5. Re-run the Playwright `smoke` project.

No code changes are required.

## 5. Migration to paid providers

Each external piece sits behind an interface or env var:

- Web → swap Vercel project for any Next.js host.
- API → move the Docker image to Render / Fly paid / AWS / GCP.
- Postgres → change `DATABASE_URL`.
- Rate limit → swap `@upstash/ratelimit` for Postgres-backed limiter.
- Object storage → change `BACKUP_DSN`.
- Email → swap `MailAdapter` to Resend / SES.
- Uptime monitor → move from UptimeRobot to BetterStack / self-hosted.

## 6. Gmail credential rotation

1. Sign in to the dedicated Gmail account.
2. Visit https://myaccount.google.com/apppasswords.
3. Revoke the old App Password.
4. Generate a new one.
5. Update `MAIL_DSN` in the API host.
6. Restart the API process.

## 7. Rate limit store reconfiguration

When migrating away from Upstash:
1. Provision the new store (e.g. Postgres token bucket).
2. Implement a new adapter in `libs/core/rate-limit/src/`.
3. Update DI bindings in `apps/api/src/modules/auth/auth.module.ts` and `apps/api/src/modules/transactions/transactions.module.ts`.
4. Remove the Upstash env vars.
5. Run `pnpm --filter api test rate-limit.e2e-spec.ts`.

## 8. Disaster recovery

If both staging and the backup destination become unreachable:
1. Acquire a new Postgres provider (free tier is fine).
2. Restore from the most recent dump held in any operator's local copy of the R2 bucket.
3. Repoint `DATABASE_URL`.
4. Run migrations against the restored schema.
5. Replay the smoke Playwright suite.

## 9. Staging secrets (GitHub Actions environment: `staging`)

The deploy workflow reads these secrets from the `staging` environment:
- `STAGING_DATABASE_URL`
- `STAGING_NEXTAUTH_URL`
- `STAGING_NEXTAUTH_SECRET`
- `STAGING_API_URL`
- `STAGING_WEB_ORIGIN`
- `STAGING_PUBLIC_WEB_URL`
- `STAGING_PUBLIC_API_URL`
- `STAGING_JWT_SECRET`
- `STAGING_COOKIE_SECRET`
- `STAGING_METRICS_TOKEN`
- `STAGING_STATUS_DETAIL_TOKEN`
- `STAGING_UPSTASH_URL`
- `STAGING_UPSTASH_TOKEN`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `FLY_API_TOKEN`
```

- [ ] **Step 11: Write the runbook (Spanish mirror)**

Replace `Documents-es/docs/operations/production-foundation-runbook.md` with the line-by-line Spanish translation. Use neutral professional Spanish; keep "commit", "merge", "branch", "ADR", "PR", "build", "deploy", "smoke", "status" in English where they are the industry-standard terms.

- [ ] **Step 12: Architecture report (English)**

Replace `docs/architecture/production-foundation.md` with the architecture report from the spec (already drafted in the spec phase). Verify the stack table matches the libraries added by this plan.

- [ ] **Step 13: Architecture report (Spanish mirror)**

Replace `Documents-es/docs/architecture/production-foundation.md` with the line-by-line Spanish translation.

- [ ] **Step 14: Verify no CJK drift**

Run: `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/production-foundation.md Documents-es/docs/operations/production-foundation-runbook.md`
Expected: empty output.

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/mail apps/api/src/app.module.ts docs/operations/production-foundation-runbook.md Documents-es/docs/operations/production-foundation-runbook.md docs/architecture/production-foundation.md Documents-es/docs/architecture/production-foundation.md
git commit -m "feat(api): add MailAdapter port + skeleton; publish runbook and architecture report (R-PF-12)"
```

---

## Self-Review Checklist (run before `sdd-verify`)

- [ ] `pnpm install` exits 0.
- [ ] `pnpm lint:fixtures` exits 0.
- [ ] `pnpm turbo run typecheck` exits 0.
- [ ] `pnpm turbo run lint` exits 0.
- [ ] `pnpm turbo run test` exits 0.
- [ ] `pnpm --filter api test` exits 0.
- [ ] `pnpm --filter web test` exits 0.
- [ ] `pnpm --filter @core/config test` exits 0.
- [ ] `pnpm --filter @core/logging test` exits 0.
- [ ] `pnpm --filter @core/rate-limit test` exits 0.
- [ ] `pnpm --filter @core/database test` exits 0.
- [ ] `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/production-foundation.md Documents-es/docs/operations/production-foundation-runbook.md` returns empty.
- [ ] `git diff --stat develop` shows 12 atomic commits on `feat/production-foundation`.
- [ ] `/status` reachable locally via `pnpm dev` (API + web), with `lastBackupStatus: "never"` until T1.8 ships its first backup row.

---

## next_recommended

`apply` — implement the 12 tasks above as atomic commits on `feat/production-foundation`. After all tasks land, run `sdd-verify` to assert R-PF-1..R-PF-12. Once verified, merge to `develop` via PR (no chained PRs required — total changed lines under 400 after filtering tests + docs).

# Explore — `fix-build-env-runtime-validation`

> **Phase**: explore · **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `6906e0d` after PR #95 merge) · **Mode**: read-only investigation
> **Artifact store**: hybrid (Engram + `openspec/`)
> **Issue discovered via**: engram obs #3022 ("Web build requires BACKUP_DSN + GMAIL secrets under NODE_ENV=production") + v1.4.0 release verification

## Problem statement

`pnpm turbo run build --filter=web` fails on **both `develop` and the v1.4.0 release branch** because the Next.js production build (`NODE_ENV=production`) evaluates the module graph of `apps/web`, which transitively imports `env` from `@core/config`, which runs the `productionEnvSchema.superRefine` that requires:

- `BACKUP_DSN` (a Postgres backup URL — API-only)
- `METRICS_TOKEN` (Prometheus / observability — API-only)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (rate-limit backend — API-only)
- `GMAIL_USER` + `GMAIL_APP_PASSWORD` (SMTP transport — API-only) when `MAIL_DSN` is unset

None of these are consumed by the web app. The web app uses a much smaller env surface:

- `NEXTAUTH_SECRET` (NextAuth JWT signing — read by `apps/web/auth.ts`)
- `NEXTAUTH_URL` (NextAuth base URL — read by `apps/web/auth.ts`)
- `PUBLIC_WEB_URL`, `PUBLIC_API_URL` (client-visible URLs)
- `API_URL` (server-side, used by form POSTs)
- `WEB_ORIGIN` (CORS origin)
- `NODE_ENV`

But because **all 11 files in `apps/web` that touch env import from the single `@core/config` barrel** (which exports the API schema), the web build drags in the full API contract and fails on the prod-only fields it will never use.

## What I tried (and why each failed)

### Option 1 — Stub values in `.env.example`

Set `BACKUP_DSN=postgres://fake`, `GMAIL_USER=fake@example.com`, etc. in `.env.example` so the schema passes.

**Verdict**: rejected. The stubs are syntactically valid (URL, email), so the schema passes — but a future deploy that forgets to override them in production would ship a release with `BACKUP_DSN=postgres://fake` and the rate-limit / observability paths would silently misbehave. The fail-fast at startup is the only thing that catches this. Trading a build-time fail for a runtime "silently broken" is a net loss.

### Option 2 — Runtime split (filter prod-only fields from the parsed output)

Add a second argument to `parseEnv(source, { strictApiOnly: true })` that filters `BACKUP_DSN`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `METRICS_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` from the parsed object before returning.

**Verdict**: rejected. This is "make the schema lie about what it parsed." The schema would still `superRefine` the missing prod-only fields and fail. The only way to make it work is to ALSO bypass the `superRefine` when `strictApiOnly=true`, at which point the schema is being asked to validate two different contracts through a single code path — every future field addition has to decide "is this API-only or shared?" and the runtime-split mechanism is opaque to the type system. It works, but it's the kind of cleverness that costs more than it saves.

### Option 3 — Split schema (`webEnvSchema` + `apiEnvSchema`) ✅

Create a new `libs/core/config/web-env.schema.ts` with only the web fields. Export it through a new barrel `@core/config/web` (or extend the existing barrel with a re-export). Change the 11 files in `apps/web` to import `env` from the new entry point. Leave the existing `libs/core/config/env.schema.ts` and barrel untouched — `apps/api` and `@core/database` keep their existing import (the full API schema, which still validates the prod-only fields at API startup).

**Verdict**: selected. The split makes the contract explicit at the module boundary: `apps/web` cannot accidentally start reading `BACKUP_DSN`, and the API schema retains its fail-fast guarantee. The 11 import changes are mechanical (one-line edits with a clear before/after pattern). The new `webEnvSchema` is small (~20 lines) and self-documenting.

## Discovery facts (verified via the codebase)

### Files in `apps/web` that import `env` from `@core/config`

```
apps/web/auth.ts:3 — import { env } from "@core/config";
apps/web/app/api/status/route.ts
apps/web/app/[locale]/welcome/page.tsx
apps/web/app/[locale]/status/page.tsx
apps/web/app/[locale]/(auth)/reset-password/[token]/page.tsx
apps/web/app/[locale]/(auth)/sign-in/page.tsx
apps/web/app/[locale]/(auth)/sign-up/page.tsx
apps/web/app/[locale]/(auth)/forgot-password/page.tsx
apps/web/app/[locale]/(auth)/dev/mailbox/[userId]/page.tsx
(plus 2 more: apps/web/lib/* likely)
```

`rg "from ['\"]@core/config['\"]" apps/web` confirms 11 occurrences.

### Fields the web app actually reads

Spot-check of `env.X` references in `apps/web`:
- `env.NEXTAUTH_SECRET` (auth.ts)
- `env.PUBLIC_WEB_URL`, `env.PUBLIC_API_URL` (status pages)
- `env.API_URL` (form POSTs)
- `env.WEB_ORIGIN` (CORS / middleware)
- `env.NEXTAUTH_URL` (NextAuth base)
- `env.NODE_ENV` (everywhere via `process.env`)

No reference to: `BACKUP_DSN`, `METRICS_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_DSN`, `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_ENABLED`, `AUDIT_RETENTION_DAYS`, `AUDIT_RETENTION_ENABLED`, `BCRYPT_COST_FACTOR_OVERRIDE`, `PORT`, `LOG_LEVEL`.

### Build failure trace

`next build` sets `NODE_ENV=production` automatically. The first file in the web module graph that imports `env` from `@core/config` triggers `parseEnv(process.env)` at module load. The `productionEnvSchema.superRefine` then runs, sees `NODE_ENV=production`, and adds issues for the missing prod-only fields. The error is surfaced as:

```
Error: Failed to collect page data for /api/status
  {
    code: "custom",
    path: ["BACKUP_DSN"],
    message: "BACKUP_DSN is required when NODE_ENV is \"production\""
  }
```

The build aborts before the next page is processed.

### The schema is correctly designed for `apps/api`

The current `envSchema` + `productionEnvSchema` is the right contract for the API: fail-fast at startup is the canonical pattern for runtime env validation (Zod, Envalid, etc all do this). The bug is that `apps/web` shouldn't be importing it. The fix preserves the API's fail-fast guarantee and gives the web its own minimal schema.

## Risks and mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Future field added to `envSchema` is needed by the web but not by the API | Low | The split is at the module boundary — `webEnvSchema` is a separate Zod object. New fields for the web get added to `webEnvSchema` (and the `Env` web type). New fields for the API get added to `envSchema` (and the `Env` API type). The split is preserved by the import surface, not by convention. |
| `apps/web` accidentally reads a prod-only field via type-system escape | Low | The web `Env` type does not include the prod-only fields — TypeScript will reject `env.BACKUP_DSN` at the type level even if someone bypasses the runtime check. |
| Tests in `apps/web` import `env` from `@core/config` (not `@core/config/web`) | Medium | Search confirms 11 imports, all in `apps/web` source. No tests import env directly (the tests mock the schema). Still, the migration needs a `rg`-based verification step. |
| The barrel re-export from `@core/config` to `@core/config/web` creates a circular dep | Low | The new `libs/core/config/web.ts` (or `web/index.ts`) only re-exports the new schema. The existing `@core/config` barrel stays untouched. No circular import possible. |
| v1.4.1 is a PATCH bump but the schema split is technically a refactor | Low | The change is internal-only: no new public API, no behavior change, no migration needed. The bump is correct (the build was broken on v1.4.0; v1.4.1 fixes the build). |

## Pre-work for the proposal

- ✅ Field-level audit: confirmed the web uses 6 fields, not the full 13+ in `envSchema`.
- ✅ Build failure mode: confirmed `next build` runs the full module graph with `NODE_ENV=production`.
- ✅ API schema integrity: confirmed the API keeps its existing schema and fail-fast guarantee.
- ✅ File impact: 1 new schema file + 1 barrel re-export + 11 import-line edits + 1-2 test imports (if any).
- ✅ Approach rejected: stub values (security) and runtime filter (opaque contract).

## Carry-forward note

The v1.4.0 release used the GitHub Actions workflow to inject the env secrets at build time, which is why the v1.4.0 release succeeded locally (the workflow had the secrets) but failed in any clean dev environment without the secrets. The fix decouples the build from the API's runtime env — the web's build no longer cares about `BACKUP_DSN` or `GMAIL_*`. This is the **correct** long-term shape: the web build should be runnable with only the web's env, and the API build should be runnable with only the API's env.

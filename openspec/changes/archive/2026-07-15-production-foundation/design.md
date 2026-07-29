# Design — `production-foundation`

**Project**: `gastos-personales-reference`
**Branch**: `develop` (working) · `main` (immutable)
**Tracker branch**: `feat/production-foundation`
**Artifact store**: hybrid
**Date**: 2026-07-15

This document captures the technical decisions for Module 1. All libraries, the architecture, the why/how/where/when of each choice, and the migration path are also summarized in `docs/architecture/production-foundation.md` (English) and `Documents-es/docs/architecture/production-foundation.md` (Spanish mirror).

---

## 1. Free-tier hosting comparison

| Provider | Web | API | Postgres | Quota | Region | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Vercel | Yes | No | No | 100 GB bandwidth/month | us-east-1 by default | Best fit for `apps/web` (Next.js). |
| Netlify | Yes | Yes (functions) | No | 100 GB bandwidth/month | us-east-1 | Could host API as functions but cold starts hurt transactions. |
| Railway | No | Yes | Yes (free trial only post-2024) | $5 trial credits | us-west | Postgres no longer free for new accounts since 2024. |
| Render | No | Yes | Yes (free 90 days) | Spins down after 15 min idle | us-east/us-west | Cold starts are problematic. |
| Fly.io | No | Yes | Yes (free allowance) | 3 shared VMs + 1 GB volume | Multiple regions | Best free-tier path for API + Postgres. |
| Koyeb | No | Yes | Yes (free tier) | 1 service free, Postgres free | Frankfurt, Paris | Free tier is limited but workable. |

### Decision (Q-PF-A)

- **Web**: Vercel.
- **API**: Fly.io free allowance with Postgres attached (shared VM + 1 GB volume). Fallback: Koyeb if Fly quotas change.
- **Postgres**: Fly.io's managed Postgres (free for 1 GB volume).

Rationale: Fly.io's free allowance keeps the API and the database in the same region, supports long-running processes (no cold starts), and provides a 1 GB volume that survives restarts. The risk of free-tier churn is acknowledged and migration paths are documented in the runbook.

## 2. Logging stack

| Concern | Library | Why | Where | When |
| --- | --- | --- | --- | --- |
| API logging | `pino` | Fastest JSON logger in Node; supports redaction and child loggers per request. | `apps/api/src/logging/logger.ts` | Initialized at process start; one child logger per HTTP request. |
| Web logging | `pino-browser` | Same JSON shape as API; safe for browser; supports redaction. | `apps/web/lib/logger.ts` | Client-side errors and `/status` polling failures. |
| Request ID | `nanoid` | Small, fast, URL-safe ID generator. | `apps/api/src/middleware/request-id.ts` | Generated at the start of every request; propagated to child logger. |

## 3. Rate limit store

| Option | Free tier | Persistence | Decision |
| --- | --- | --- | --- |
| Upstash Ratelimit | 10k requests/day free | Distributed | **Selected** — well-trodden, SDK for Node, fast cold starts. |
| Postgres token bucket | n/a (uses our free DB) | Persistent | Backup if Upstash unavailable. |

### Decision (Q-PF-B)

`@upstash/ratelimit` with `@upstash/redis` (free 10k req/day). When the store returns an error, auth endpoints MUST fail closed (return 429) and read endpoints MUST fail open (allow the request and log a warning). The store URL and token MUST be supplied via env vars.

## 4. Backup design

- **Cron**: Fly.io scheduled job (machine starts, runs `pg_dump`, exits).
- **Storage**: Cloudflare R2 free tier (10 GB, 1M Class A operations free).
- **Format**: `pg_dump -Fc` (custom, compressed).
- **Naming**: `gastos-<UTC-date>.dump`.
- **Retention**: 7 days (local cron deletes older dumps).
- **Integrity**: After writing, `pg_restore --list <file>` MUST succeed; if not, the job MUST mark `lastBackupStatus=failed`.
- **Restore drill**: `scripts/operations/restore-drill.sh` runs against the same Postgres host using a separate database (`gastos_restore_drill`). Drill is invoked manually and on a weekly schedule.

## 5. `/status` payload shape

```ts
interface StatusPayload {
  environment: "local" | "staging" | "production";
  version: string;        // package.json version
  commit: string;         // short SHA from CI env
  startedAt: string;      // ISO timestamp
  uptimeSeconds: number;
  publicUrl: { web: string; api: string };
  lastBackupAt: string | null;
  lastBackupStatus: "ok" | "failed" | "never";
  rateLimitStore: "upstash" | "postgres" | "memory";
  mailAdapter: "smtp-gmail" | "console";
}
```

Sensitive values MUST be redacted before serialization. The public `/status` endpoint MUST NOT include any DSN, secret, or PII.

## 6. UI surface (`apps/web/app/[locale]/status/page.tsx`)

- Server component, fetches `/status` once at render and passes to client.
- Client component polls `/api/status` (web proxy to API) every 60 s.
- Renders three badges: environment, last backup, API health.
- Localized strings added to `apps/web/messages/en.json` and `apps/web/messages/es.json` under `status.*`.
- WCAG AA compliant; Lighthouse target >= 95 for Performance and Accessibility.

## 7. Configuration map

| Variable | Required | Profile | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | yes | all | `local`, `staging`, `production`. |
| `DATABASE_URL` | yes | all | Postgres connection string. |
| `JWT_SECRET` | yes | all | 32+ byte secret for JWT signing. |
| `COOKIE_SECRET` | yes | all | 32+ byte secret for cookie signing. |
| `PUBLIC_WEB_URL` | yes | all | Public URL of the web app. |
| `PUBLIC_API_URL` | yes | all | Public URL of the API. |
| `MAIL_DSN` | yes | staging+ | SMTP URL with Gmail App Password. |
| `BACKUP_DSN` | yes | staging+ | R2 / S3-compatible URL. |
| `METRICS_TOKEN` | yes | staging+ | Required for `/metrics`. |
| `UPSTASH_REDIS_REST_URL` | yes | staging+ | Upstash URL for rate limit. |
| `UPSTASH_REDIS_REST_TOKEN` | yes | staging+ | Upstash token for rate limit. |
| `LOG_LEVEL` | no | all | `trace|debug|info|warn|error|fatal`. Default `info`. |
| `STATUS_DETAIL_TOKEN` | no | staging+ | Token to view `/status?detail=full`. |

## 8. Test strategy

- Unit tests colocated with code under `__tests__/`.
- Integration tests against a real Postgres using `docker-compose` in CI.
- Playwright e2e with three projects: `en`, `es`, `smoke`.
- `pino` redaction verified by snapshotting log output in a unit test.
- Backup job tested with `pg_dump` and `pg_restore --list` against a fixture Postgres in CI.
- Restore drill tested by running the script in CI against a throwaway database.

## 9. Module task breakdown

This module ships in a single PR with a strict work-unit commit chain. Total estimated diff: ~320 changed lines, well under the 400-line budget.

### T1.1 — Add environment configuration schema

- **What**: Zod schema for all env vars; `parseEnv` returns a typed object; production-only secrets must be present.
- **Where**: `libs/core/config/src/env.schema.ts`, `libs/core/config/src/env.ts`.
- **TDD**: RED — write a test that boots `parseEnv({ NODE_ENV: 'production' })` without `JWT_SECRET` and expects throw.
- **Verification**: `pnpm turbo run typecheck test`.

### T1.2 — Pino logger with redaction

- **What**: Logger module exporting `logger` (root) and `childLogger(bindings)`; redaction paths per R-PF-5.
- **Where**: `apps/api/src/logging/logger.ts`, `apps/web/lib/logger.ts`.
- **TDD**: RED — test that logs containing `password`, `token`, `email`, `amount` produce redacted output.
- **Verification**: unit test snapshots + manual `curl` inspection.

### T1.3 — Request ID and structured request log middleware

- **What**: NestJS middleware (or global Express middleware) that sets `x-request-id` and emits one log line per request.
- **Where**: `apps/api/src/middleware/request-id.ts`, `apps/api/src/middleware/request-logger.ts`.
- **TDD**: RED — integration test that asserts log shape after a request.
- **Verification**: `pnpm turbo run test:e2e:api`.

### T1.4 — Health endpoints

- **What**: `GET /healthz`, `GET /readyz`, `GET /status` controllers; `/status` returns the documented payload.
- **Where**: `apps/api/src/modules/health/health.controller.ts`, `apps/api/src/modules/health/health.module.ts`.
- **TDD**: RED — controller tests assert payload shape and 503 on `readyz` when DB is unreachable.
- **Verification**: e2e in `apps/api/test/health.e2e-spec.ts`.

### T1.5 — Upstash rate limiter adapter

- **What**: `RateLimiter` interface + `UpstashRateLimiter` adapter + `InMemoryRateLimiter` for tests; fail-closed default for auth endpoints.
- **Where**: `libs/core/rate-limit/src/`.
- **TDD**: RED — write tests for `InMemoryRateLimiter` first, then port to Upstash.
- **Verification**: `pnpm turbo run test`.

### T1.6 — Apply rate limits to auth and transaction controllers

- **What**: Decorator or guard that consumes the limiter and throws HTTP 429 with `Retry-After`.
- **Where**: `apps/api/src/shared/guards/rate-limit.guard.ts` + controller-level bindings.
- **TDD**: RED — integration tests assert 429 on the 11th login attempt.
- **Verification**: `apps/api/test/rate-limit.e2e-spec.ts`.

### T1.7 — Metrics endpoint

- **What**: In-memory counter registry; `/metrics` returns Prometheus text gated by `METRICS_TOKEN`.
- **Where**: `apps/api/src/modules/metrics/metrics.controller.ts`.
- **TDD**: RED — controller tests assert 401 without token, 200 with token, expected metric names.
- **Verification**: `apps/api/test/metrics.e2e-spec.ts`.

### T1.8 — Backup job

- **What**: Node script invoked by Fly scheduled task; runs `pg_dump -Fc`, uploads to R2, runs `pg_restore --list`, updates `last_backup_status` row.
- **Where**: `scripts/operations/backup.ts`, `libs/core/database/src/backup-status.ts`.
- **TDD**: RED — script test using a temporary Postgres container.
- **Verification**: `pnpm turbo run test --filter=@core/database`.

### T1.9 — Status UI page

- **What**: `/status` page in `apps/web` with localized labels and 60s polling.
- **Where**: `apps/web/app/[locale]/status/page.tsx`, `apps/web/components/status/*`, `apps/web/messages/{en,es}.json`.
- **TDD**: Component tests + Playwright smoke test.
- **Verification**: `pnpm turbo run e2e --project=smoke`.

### T1.10 — Security headers and CORS

- **What**: Next.js middleware that adds `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`; NestJS CORS allowlist restricted to `PUBLIC_WEB_URL`.
- **Where**: `apps/web/middleware.ts`, `apps/api/src/main.ts`.
- **TDD**: RED — web test asserts headers; API test asserts CORS preflight.
- **Verification**: `pnpm turbo run test:e2e`.

### T1.11 — Staging deploy pipeline

- **What**: GitHub Actions workflow that builds `apps/web` and `apps/api`, runs migrations, deploys to Vercel and Fly.io, runs post-deploy smoke.
- **Where**: `.github/workflows/deploy-staging.yml`.
- **TDD**: not applicable; infrastructure-as-code change validated by manual deploy + smoke.
- **Verification**: pipeline green on staging; smoke project passes.

### T1.12 — Runbook and architecture report

- **What**: `docs/operations/production-foundation-runbook.md` (English + Spanish mirror); `docs/architecture/production-foundation.md` (English + Spanish mirror) summarizing the architecture report.
- **Where**: `docs/operations/`, `Documents-es/docs/operations/`, `docs/architecture/`, `Documents-es/docs/architecture/`.
- **TDD**: not applicable.
- **Verification**: documents present, no CJK drift, mirror in sync.

## 10. Migration to paid providers

The application MUST be portable. Each external dependency is hidden behind an interface or env var:

| External | Interface | Fallback |
| --- | --- | --- |
| Web host | Vercel project config; alternative: Netlify / Cloudflare Pages. |
| API host | Fly.io `fly.toml`; alternative: Render / Koyeb / AWS. |
| Postgres | Connection string; alternative: managed Postgres (Supabase, Neon, RDS). |
| Rate limit store | `@upstash/ratelimit`; alternative: Postgres-backed token bucket. |
| Object storage | S3 SDK; alternative: any S3-compatible bucket. |
| Email | `MailAdapter` (introduced in T1.x); alternative: Resend / SES. |
| Uptime monitor | UptimeRobot webhook; alternative: BetterStack / Cronitor. |

Switching providers MUST only require env var updates + adapter swap. No code changes outside the adapter.

## 11. Open questions answered in design

- **Q-PF-A**: locked to Vercel + Fly.io + Cloudflare R2.
- **Q-PF-B**: locked to Upstash Ratelimit.
- **Q-PF-C**: `/status` returns the public payload; `/status?detail=full` requires `STATUS_DETAIL_TOKEN`.
- **Q-PF-D**: restore drill runs against `gastos_restore_drill` database on the same host and drops it after.

## 12. Cross-references

- Proposal: `openspec/changes/production-foundation/proposal.md`.
- Spec: `openspec/changes/production-foundation/spec.md`.
- Architecture report: `docs/architecture/production-foundation.md` and `Documents-es/docs/architecture/production-foundation.md`.
- Runbook: `docs/operations/production-foundation-runbook.md` and `Documents-es/docs/operations/production-foundation-runbook.md`.
- Downstream modules: Authentication (Module 2), Superadmin (Module 3), Privacy (Module 4), FX (Module 5), Hardening (Module 6).
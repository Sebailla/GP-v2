# Architecture Report — Module 1: Production Foundation

**Date**: 2026-07-15
**Project**: `gastos-personales-reference`
**Change**: `production-foundation`
**Author**: SDD orchestrator
**Status**: proposed

This document captures **what stack we use, what libraries, why, how, where and when** for Module 1 of the productionization program. It is intentionally exhaustive so a future operator (or future me) can rebuild the system without re-deriving the decisions.

Spanish mirror: `Documents-es/docs/architecture/production-foundation.md`.

---

## 1. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web host | Vercel (free tier) | Best support for Next.js 15; 100 GB bandwidth/month free; subdomains included. |
| API host | Fly.io (free allowance) | Long-running process (no cold starts); 1 GB persistent volume; Postgres add-on free. |
| Postgres | Fly.io managed Postgres (1 GB free volume) | Co-located with API region; backups and metrics included. |
| Logging (API) | `pino` | Fastest JSON logger for Node; first-class redaction; child loggers per request. |
| Logging (Web) | `pino-browser` | Same JSON shape as API; browser-safe. |
| Rate limiting | `@upstash/ratelimit` + Upstash Redis free tier | Distributed; SDK in TypeScript; 10k requests/day free. |
| Backup storage | Cloudflare R2 free tier (10 GB, 1M ops) | S3-compatible; no egress fees; reliable. |
| Email (deferred wiring) | Gmail dedicated + App Password | Costo cero inicial; isolation behind `MailAdapter`. |
| Uptime monitor | UptimeRobot free tier | HTTP(s) checks every 5 minutes; email alerts. |
| CI | GitHub Actions (existing) | Already in repo; adds deploy job. |
| Tests | Vitest + Playwright + Cucumber (existing) | Already configured. |

## 2. Libraries — what, why, where, when

### `pino` — API structured logging

- **What**: low-overhead JSON logger for Node.
- **Why**: predictable latency, native redaction, and child loggers that propagate request ID and user ID.
- **Where**: `apps/api/src/logging/logger.ts` exports the root logger; middleware creates child loggers per request.
- **When**: at process boot; one child per request; one log line per request (and domain events).

### `pino-browser` — Web structured logging

- **What**: pino's browser-compatible build, with the same JSON shape.
- **Why**: consistent log shape between API and web; safe to ship to clients.
- **Where**: `apps/web/lib/logger.ts`; consumed by the status polling client.
- **When**: client-side errors; `/status` poll failures; user-visible warnings.

### `nanoid` — request ID generation

- **What**: tiny, URL-safe, random ID generator.
- **Why**: per-request correlation without crypto dependency.
- **Where**: `apps/api/src/middleware/request-id.ts`.
- **When**: at the start of every HTTP request; propagated to log lines and `x-request-id` response header.

### `@upstash/ratelimit` and `@upstash/redis`

- **What**: sliding window / token bucket rate limit on Upstash Redis.
- **Why**: distributed state; minimal code; fits free tier.
- **Where**: `libs/core/rate-limit/src/upstash.ts`.
- **When**: every request that matches a guarded route; auth endpoints fail closed, read endpoints fail open.

### `pino-pretty` (dev only)

- **What**: pretty printer for pino logs.
- **Why**: readability in local development.
- **Where**: `apps/api/scripts/dev.ts`.
- **When**: only when `NODE_ENV=local`.

### `tsx` (existing) — running TS scripts

- **What**: zero-config TS executor.
- **Why**: re-use Node ecosystem without a build step for one-off scripts.
- **Where**: `scripts/operations/*.ts`.
- **When**: running backup and restore-drill scripts in CI and on Fly.io scheduled jobs.

### `@aws-sdk/client-s3` (R2-compatible)

- **What**: AWS SDK for S3; works with Cloudflare R2 via custom endpoint.
- **Why**: portable S3 client; avoids vendor lock-in.
- **Where**: `scripts/operations/backup.ts`.
- **When**: uploading daily dumps; listing old dumps for retention cleanup.

### `pg_dump`, `pg_restore`, `psql` (existing Postgres client tools)

- **What**: official Postgres utilities.
- **Why**: standard, well-documented, available in Fly.io's Postgres image.
- **Where**: invoked by the backup script and the restore drill script.
- **When**: nightly at 03:00 UTC; on demand during drills.

### `prom-client`

- **What**: Prometheus-format metrics registry.
- **Why**: standard format; trivial to scrape; no external SaaS required.
- **Where**: `apps/api/src/modules/metrics/*`.
- **When**: counters updated per request; exposed at `/metrics` behind `METRICS_TOKEN`.

### `react-hook-form`, `zod`, `next-intl` (existing) — status UI

- **What**: already in the repo.
- **Why**: consistency with the rest of the web app.
- **Where**: `apps/web/components/status/*`.
- **When**: rendering the status page and the polling client.

## 3. Architecture

```
┌───────────────────────────────┐    ┌────────────────────────────────────┐
│ Browser (public)              │    │ Fly.io (region: GRU/EZE)            │
│ ┌───────────────────────────┐ │    │ ┌───────────────┐ ┌──────────────┐  │
│ │ apps/web (Vercel)         │ │    │ │ apps/api      │ │ Postgres     │  │
│ │ Next.js 15 + next-intl    │ │◀──▶│ │ NestJS + pino │ │ (1 GB)       │  │
│ │ Status UI + middleware    │ │    │ └──────┬────────┘ └──────┬───────┘  │
│ └─────────────┬─────────────┘ │    │        │                │           │
└───────────────┼───────────────┘    │        ▼                ▼           │
                │ HTTPS             │ ┌──────────────────────────────┐   │
                │                   │ │ Upstash Redis (free tier)   │   │
                │                   │ └──────────────────────────────┘   │
                │                   │ ┌──────────────────────────────┐   │
                │                   │ │ Scheduled job: backup        │──▶ Cloudflare R2
                │                   │ └──────────────────────────────┘   │
                │                   │ ┌──────────────────────────────┐   │
                │                   │ │ UptimeRobot check            │──▶ Gmail
                │                   │ └──────────────────────────────┘   │
                │                   └────────────────────────────────────┘
```

## 4. When each piece activates

| Trigger | What happens |
| --- | --- |
| `git push develop` | CI: lint + test + build → deploy Vercel + Fly → migrate → smoke. |
| `/healthz` GET | Always returns 200 while the process is alive. |
| `/readyz` GET | Returns 200 only if DB reachable and migrations applied. |
| `/status` GET | Returns JSON snapshot used by the status page. |
| `/metrics` GET (with token) | Returns Prometheus text. |
| Every HTTP request | One structured log line; per-IP / per-user rate limit; request ID assigned. |
| 03:00 UTC daily | Fly scheduled job runs `backup.ts`; on failure, `lastBackupStatus=failed`. |
| Manual `pnpm run restore-drill` | Runs restore drill script into `gastos_restore_drill`. |
| Weekly cron (manual) | Runs restore drill; updates runbook entry. |
| 5-minute uptime check | UptimeRobot pings `/healthz`; on failure emails Gmail. |

## 5. Migration to paid providers

Each external dependency sits behind a single env var or interface:

- Web host: switch `apps/web` to any Next.js host.
- API host: `fly.toml` is the only artifact; alternative hosts accept the same Docker image.
- Postgres: change `DATABASE_URL`.
- Rate limit store: swap `@upstash/ratelimit` for a Postgres-backed token bucket.
- Object storage: `BACKUP_DSN` accepts any S3-compatible endpoint.
- Email: `MailAdapter` lets us swap Gmail for Resend or SES later.
- Uptime monitor: switch to BetterStack or self-hosted kenerl.

No application code outside the relevant adapter changes.

## 6. Files created or modified

- `libs/core/config/src/env.schema.ts` (Zod schema).
- `libs/core/config/src/env.ts` (typed env singleton).
- `libs/core/logging/src/logger.ts` (pino + redaction).
- `libs/core/rate-limit/src/*` (interface + Upstash + InMemory).
- `apps/api/src/middleware/{request-id,request-logger}.ts`.
- `apps/api/src/modules/health/*`.
- `apps/api/src/modules/metrics/*`.
- `apps/api/src/shared/guards/rate-limit.guard.ts`.
- `apps/api/test/{health,rate-limit,metrics}.e2e-spec.ts`.
- `apps/web/app/[locale]/status/page.tsx`.
- `apps/web/components/status/*`.
- `apps/web/messages/{en,es}.json` (new `status.*` keys).
- `apps/web/middleware.ts` (security headers).
- `apps/web/lib/logger.ts`.
- `scripts/operations/{backup,restore-drill}.ts`.
- `.github/workflows/deploy-staging.yml`.
- `docs/architecture/production-foundation.md` (this file).
- `Documents-es/docs/architecture/production-foundation.md` (mirror).
- `docs/operations/production-foundation-runbook.md`.
- `Documents-es/docs/operations/production-foundation-runbook.md` (mirror).

## 7. Acceptance summary

This module closes when:

- All 12 R-PF-N requirements pass verification.
- All 12 tasks T1.1–T1.12 land as atomic commits on `feat/production-foundation`.
- `pnpm turbo run build lint typecheck test e2e` exits 0.
- Smoke Playwright project passes.
- Restore drill succeeds.
- `pnpm lint:fixtures` exits 0.
- Spanish mirror is in sync with no CJK drift.

Once closed, Module 2 (Public Authentication) begins.
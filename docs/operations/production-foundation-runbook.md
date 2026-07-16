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

```bash
curl -s https://<staging-api>/status | jq .lastBackupAt, .lastBackupStatus
```

Expected:
- `lastBackupAt` within the last 26 hours.
- `lastBackupStatus: "ok"`.

If either fails, run the backup manually:

```bash
pnpm backup
```

## 3. Restore drill

Run at least monthly:

```bash
pnpm restore-drill
```

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

### 9.1 Smoke harness env vars (not secrets)

The Playwright smoke step sets these from the secrets above at runtime; they are not separate secrets:

- `SMOKE_API_URL` = `STAGING_PUBLIC_API_URL` — passed to the R-PF-11 rate-limit Playwright spec via a per-test `request.newContext({ baseURL })`. The web does NOT proxy `/auth/login` (NextAuth routes `signin/signout/session/csrf/callback/providers` only), so the smoke hits the API directly.
- `SMOKE_WEB_URL` = `STAGING_PUBLIC_WEB_URL` — read by the `smoke` project in `apps/web/playwright.config.ts` for the status-page and `/api/status` assertions.

Both env vars are required for the smoke step to actually run. The test files gate themselves with `test.skip(process.env["SMOKE_API_URL"] === undefined, ...)` so local `pnpm --filter web test` runs (149/149) skip the network-bound assertion cleanly. Operators running the smoke locally must export both vars before invoking `pnpm --filter web exec playwright test --project=smoke`.

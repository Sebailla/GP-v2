# Runbook — `production-foundation`

**Date**: 2026-07-15
**Project**: `gastos-personales-reference`
**Module**: 1 — Production Foundation

Spanish mirror: `Documents-es/docs/operations/production-foundation-runbook.md`.

---

## 1. Free-tier suspension

Fly.io free machines may be stopped after long inactivity. To recover:

1. Open the Fly.io dashboard.
2. Select the `gastos-api` app.
3. Click "Start machine" on the API process.
4. Wait for `/healthz` to return 200.
5. Run the smoke Playwright project to confirm full functionality.

To prevent future suspensions, configure a low-frequency external pinger (UptimeRobot's free tier already includes this) hitting the public URL every 5 minutes.

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
pnpm turbo run backup --filter=@core/database
```

## 3. Restore drill

Run at least monthly:

```bash
pnpm turbo run restore-drill --filter=@core/database
```

The script:

1. Creates the `gastos_restore_drill` database.
2. Restores the latest dump from R2.
3. Counts users, transactions, categories.
4. Drops the drill database.

A non-zero exit indicates failure; inspect logs in `apps/api/logs/restore-drill.log`.

## 4. Migration to a custom domain

1. Purchase the domain.
2. Update `PUBLIC_WEB_URL` and `PUBLIC_API_URL` env vars.
3. Add the domain in Vercel.
4. Update the Google OAuth redirect URIs (Module 2).
5. Update Gmail App Password allowed senders if necessary.
6. Re-run smoke tests.

No code changes are required; the URL is centralized.

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
2. Visit <https://myaccount.google.com/apppasswords>.
3. Revoke the old App Password.
4. Generate a new one.
5. Update `MAIL_DSN` in the API host.
6. Restart the API process.
7. Verify with `pnpm turbo run mail:test`.

## 7. Rate limit store reconfiguration

When migrating away from Upstash:

1. Provision the new store (e.g. Postgres token bucket).
2. Implement a new adapter in `libs/core/rate-limit/src/`.
3. Update DI bindings in `apps/api/src/modules/auth/auth.module.ts` and `apps/api/src/modules/transactions/transactions.module.ts`.
4. Remove the Upstash env vars.
5. Run the rate-limit e2e suite to verify behavior.

## 8. Disaster recovery

If both staging and the backup destination become unreachable:

1. Acquire a new Postgres provider (free tier is fine).
2. Restore from the most recent dump held in any operator's local copy of the R2 bucket.
3. Repoint `DATABASE_URL`.
4. Run migrations against the restored schema.
5. Replay the smoke Playwright suite.

If no backup is available, the application is rebuilt from scratch and the change is recorded as a security incident in the audit log (Module 3).
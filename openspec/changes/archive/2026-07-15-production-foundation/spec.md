# Spec — `production-foundation`

**Project**: `gastos-personales-reference`
**Branch**: `develop` (working) · `main` (immutable)
**Tracker branch**: `feat/production-foundation`
**Artifact store**: hybrid
**Date**: 2026-07-15

This document uses RFC 2119 keywords (`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`) and Gherkin scenarios to describe the observable behavior of Module 1. The change MUST be implemented in English; a Spanish mirror MUST be added under `Documents-es/openspec/changes/production-foundation/spec.md` in the same atomic commit per `AGENTS.md §13`.

---

## R-PF-1 — Environment and configuration

The system MUST validate all environment variables with a Zod schema at boot. The system MUST refuse to start when any required variable is missing or invalid.

The system MUST expose three environments: `local`, `staging`, `production`. Each environment MUST have its own validation profile; the production profile MUST fail closed when any of the following are missing: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `PUBLIC_WEB_URL`, `PUBLIC_API_URL`, `MAIL_DSN`, `BACKUP_DSN`, `METRICS_TOKEN`.

```gherkin
Feature: Environment validation
  Scenario: Missing required variable in production
    Given NODE_ENV=production
    And JWT_SECRET is unset
    When the API process starts
    Then it MUST exit non-zero with an error referencing JWT_SECRET
```

## R-PF-2 — Secure cookies and CORS

`apps/web` MUST emit session cookies with `Secure`, `HttpOnly`, and `SameSite=Lax`. The web app MUST set `Secure` whenever `NODE_ENV !== 'development'`. The API MUST reject requests whose `Origin` header is not in the allowlist defined by `PUBLIC_WEB_URL`. The API MUST respond to `OPTIONS` preflight requests with `Access-Control-Allow-*` headers consistent with the allowlist.

```gherkin
Feature: Cookie security
  Scenario: Production session cookie
    Given a successful sign-in on staging
    When the response Set-Cookie header is inspected
    Then it MUST contain Secure
    And it MUST contain HttpOnly
    And it MUST contain SameSite=Lax

Note: this scenario is verified at browser-level by the Module 6
hardening e2e suite, not by a unit test in Module 1. Cookies are
emitted by Next.js when `NextResponse.cookies.set` is called; the
Module 1 middleware only adds HTTP headers (no cookie emission), so
the cookie flags are part of the AuthSlice + NextAuth v5 contract
that ships in Module 2 (Public Authentication). The Module 6
hardening gate will run the full Playwright sign-in flow against
staging and assert the Set-Cookie header shape end-to-end.
```

```gherkin
Feature: CORS allowlist
  Scenario: Forbidden origin
    Given Origin=https://evil.example
    When the API receives any request
    Then the response MUST NOT include Access-Control-Allow-Origin matching the origin
```

## R-PF-3 — Security headers

The web app MUST respond with the following headers on every response: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (staging/production only), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Frame-Options: DENY` (or `Content-Security-Policy: frame-ancestors 'none'`).

```gherkin
Feature: Security headers on web
  Scenario: GET /status on staging
    When the response is inspected
    Then it MUST contain X-Content-Type-Options=nosniff
    And it MUST contain Strict-Transport-Security
    And it MUST contain Referrer-Policy=strict-origin-when-cross-origin
```

## R-PF-4 — Health endpoints

The API MUST expose:

- `GET /healthz` — liveness. Returns 200 if the process is running. MUST NOT depend on database or external services.
- `GET /readyz` — readiness. Returns 200 if the database connection is healthy and migrations are applied. Returns 503 otherwise.
- `GET /status` — operational snapshot. Returns JSON `{ environment, version, commit, startedAt, uptimeSeconds, publicUrl, lastBackupAt, lastBackupStatus, rateLimitStore, mailAdapter }`. Sensitive fields are redacted.

```gherkin
Feature: Health endpoints
  Scenario: Liveness during database outage
    Given the database is unreachable
    When GET /healthz is called
    Then it MUST respond 200
```

```gherkin
Feature: Readiness with applied migrations
  Given the database is reachable and migrations are applied
  When GET /readyz is called
  Then it MUST respond 200
```

```gherkin
Feature: Status payload
  When GET /status is called
  Then the response MUST include environment, version, commit, uptimeSeconds, publicUrl, lastBackupAt, lastBackupStatus
  And the response MUST NOT include mail credentials, JWT secrets, or database URL
```

## R-PF-5 — Structured logging with redaction

The API MUST use `pino` for logging. The web app MUST use `pino-browser`. Logs MUST be JSON. The system MUST redact the following paths at the logger level:

- `password`, `*.password`
- `token`, `*.token`
- `cookie`, `*.cookie`
- `authorization`, `*.authorization`
- `idempotency-key` (HTTP header literal — exact runtime shape; pino 9.x rejects `*.idempotency-key` because `fast-redact` requires JS-identifier segments under wildcard, see `docs/superpowers/plans/2026-07-15-production-foundation.md` §T1.2 Gotcha)
- `idempotencyKey`, `*.idempotencyKey` (camelCase object keys)
- `email`, `*.email`
- `amount`, `*.amount`
- `reportingAmount`, `*.reportingAmount`
- `notes`, `*.notes`

The system MUST emit one structured log line per HTTP request containing `method`, `path`, `status`, `latencyMs`, `requestId`, `userId` (when authenticated), `userAgent`.

```gherkin
Feature: Log redaction
  Scenario: Logging a transaction creation
    Given a request with body { amount: "100.00", email: "user@example.com", password: "secret" } and the `Idempotency-Key` header `client-key-abc`
    When the request is processed
    Then the log line MUST NOT contain the substring "secret"
    And it MUST NOT contain "user@example.com"
    And it MUST NOT contain "100.00" verbatim
    And it MUST NOT contain the Idempotency-Key header value verbatim (it MAY appear as the redaction sentinel)
```

## R-PF-6 — Free-tier staging deployment

The CI MUST deploy `apps/web` to a free-tier Vercel project bound to the staging subdomain and `apps/api` to a free-tier Railway (or alternative) project. The deploy MUST run Prisma migrations before booting the API. A post-deploy smoke test MUST hit `/healthz`, `/readyz`, and `/status` and pass before the deployment is marked successful.

```gherkin
Feature: Staging deploy
  Scenario: Post-deploy smoke
    Given a new commit is pushed to develop
    When the staging pipeline finishes
    Then GET https://<staging-api>/healthz MUST return 200
    And GET https://<staging-api>/readyz MUST return 200
    And GET https://<staging-web>/status MUST return 200
```

## R-PF-7 — Database backups and restore

The system MUST schedule a daily `pg_dump -Fc` of the production database to an external free-tier object storage location. The system MUST retain 7 daily backups. The backup job MUST verify integrity by `pg_restore --list` after writing. The system MUST provide a documented restore procedure that:

1. Creates an isolated database (same Postgres host, different database name).
2. Restores the dump with `pg_restore --clean --if-exists`.
3. Runs a smoke test that lists user count, transaction count, and category count.
4. Drops the isolated database.

A restore drill MUST be executed at least once before the public launch gate, and the result MUST be recorded in the runbook.

```gherkin
Feature: Daily backup
  Scenario: Successful backup
    Given the schedule is 03:00 UTC daily
    When the backup job runs
    Then a dump file MUST be written to the backup DSN
    And the dump MUST pass `pg_restore --list` integrity check
    And the /status endpoint MUST reflect lastBackupAt and lastBackupStatus=ok
```

```gherkin
Feature: Restore drill
  Scenario: Restoring the latest dump into an isolated DB
    When an operator runs the documented restore script
    Then the isolated DB MUST contain the same row counts as production at the time of the dump
    And the isolated DB MUST be dropped after the drill
```

## R-PF-8 — Rate limiting

The system MUST enforce rate limits on the following endpoint groups, using the shared free-tier-compatible store:

| Group | Identifier | Limit |
| --- | --- | --- |
| `POST /auth/login` | IP + email | 10 / 10 min |
| `POST /auth/register` | IP | 5 / hour |
| `POST /auth/forgot-password` | IP + email | 3 / hour |
| `POST /auth/reset-password` | IP | 10 / hour |
| `GET/POST/PATCH/DELETE /transactions*` | user | 120 / min |
| `GET /transactions/*` (list) | user | 60 / min |
| `GET /fx/*` | user | 60 / min |
| `GET /healthz`, `/readyz`, `/status` | (none) | unlimited |

Rate limit responses MUST use HTTP 429 with `Retry-After` header.

```gherkin
Feature: Auth rate limit
  Scenario: 11th login attempt from the same IP within 10 minutes
    Given 10 login attempts have already been made from 203.0.113.5 in the last 10 minutes
    When the 11th attempt is made
    Then the response MUST be 429
    And the response MUST include Retry-After
```

```gherkin
Feature: Rate limit store degradation
  Scenario: Rate limit store unreachable
    Given the rate limit store returns an error
    When an auth endpoint is called
    Then the response MUST be 429 (fail-closed default for auth endpoints)
```

## R-PF-9 — Metrics endpoint

The API MUST expose `GET /metrics` returning Prometheus-style text. The endpoint MUST require the `METRICS_TOKEN` either via `Authorization: Bearer` or the same value in the `X-Metrics-Token` header. The endpoint MUST expose at least:

- `http_requests_total{method,path,status}`
- `http_request_duration_seconds_bucket{method,path,le}`
- `http_errors_5xx_total`
- `rate_limit_blocked_total{endpoint}`

```gherkin
Feature: Metrics endpoint
  Scenario: Authenticated metrics
    Given METRICS_TOKEN is set
    When GET /metrics is called without the token
    Then it MUST respond 401

  Scenario: Authenticated metrics success
    When GET /metrics is called with the correct token
    Then it MUST respond 200 with text/plain content type
    And it MUST include http_requests_total lines
```

## R-PF-10 — Status UI page

`apps/web` MUST render a public `/status` page showing:

- Environment label.
- API commit short SHA.
- Last successful backup timestamp.
- Uptime since the last process start.
- Public URLs (web and API).

The page MUST be server-rendered and localized in English and Spanish. The page MUST poll `/status` every 60 seconds.

```gherkin
Feature: Status UI
  Scenario: Default render
    Given the staging API is healthy
    When a user visits https://<staging-web>/status
    Then the page MUST show "staging" environment
    And it MUST show the API commit SHA
    And it MUST show the last backup timestamp
```

```gherkin
Feature: Status UI updates
  Scenario: Polling refresh
    Given the page is open for 70 seconds
    When the next poll fires
    Then the page MUST reflect any change in lastBackupAt without a full reload
```

## R-PF-11 — Smoke e2e tests

Playwright MUST cover the following flows in a `smoke` project distinct from the locale projects:

1. Visit `/status` and assert health badges.
2. Hit `/api/healthz`, `/api/readyz`, `/api/status` and assert 200.
3. Trigger a rate-limited login attempt and assert 429 + `Retry-After`.

```gherkin
Feature: Smoke e2e
  Scenario: Status page renders
    When Playwright visits /status
    Then it MUST see the environment label
    And it MUST see the last backup timestamp
```

## R-PF-12 — Runbook and migration path

The repository MUST contain a `docs/operations/production-foundation-runbook.md` (English) and its `Documents-es/docs/operations/production-foundation-runbook.md` mirror covering:

- Free-tier suspension handling.
- Daily backup verification steps.
- Restore drill procedure.
- Migration steps from the free subdomain to a custom domain.
- Migration steps from free-tier hosting to a paid provider.
- Gmail credential rotation.
- Rate limit store reconfiguration.

```gherkin
Feature: Runbook presence
  When an operator inspects the docs/operations directory
  Then production-foundation-runbook.md MUST exist
  And the Spanish mirror MUST exist
```

## Non-functional requirements

- The API MUST respond to `/healthz` in less than 50 ms when the database is unreachable.
- The API MUST respond to `/readyz` in less than 200 ms when the database is reachable.
- The web status page MUST score >= 95 on Lighthouse Performance and >= 95 on Accessibility for a cold visit.
- All new code MUST follow the strict-TDD workflow defined in `openspec/config.yaml`.
- All public endpoints MUST be reachable from a browser without manual configuration beyond visiting the URL.
- All ESLint boundary fixtures MUST continue to pass.
- All localized strings MUST be present in `apps/web/messages/en.json` and `apps/web/messages/es.json`.
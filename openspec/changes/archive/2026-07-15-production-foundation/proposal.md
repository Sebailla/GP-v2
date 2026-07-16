# Proposal — `production-foundation`

**Project**: `gastos-personales-reference`
**Branch**: `develop` (working) · `main` (immutable)
**Tracker branch**: `feat/production-foundation`
**Mode**: interactive · **Artifact store**: hybrid
**Delivery strategy**: `single-pr` (one module, ≤ 400 LOC review budget)
**Chain strategy**: n/a (single PR within the module)
**Review budget**: 400 changed lines
**Date**: 2026-07-15

---

## Intent

Transform `gastos-personales-reference` from a local-only functional spike into a public-ready application by landing **Module 1: Production Foundation** as a complete vertical slice. The module includes deployable staging on free-tier managed services, observable API/web, automated external database backups with a tested restore, base rate limiting, secure cookies, structured logging without financial data, and a browser-verifiable status surface.

This is the first of six vertical modules required to open the application to the public:

1. **Production Foundation** ← this change.
2. Public Authentication (email + password + Google OAuth + Gmail reset).
3. Superadmin Panel + User Management + Audit.
4. Privacy, Export, Account Deletion.
5. Multi-currency FX Provider + Resilience.
6. Final Hardening, Load Testing, Public Launch.

Each subsequent module depends on this one. Module 1 closes when the application is **operational end-to-end on a free-tier staging environment, observable, recoverable, and verifiable from a browser**, even though no end-user functionality ships in this slice.

## Scope

### In scope

- Free-tier staging deployment of `apps/web` (Vercel) and `apps/api` (Railway or alternative after comparison).
- Free-tier managed Postgres with reproducible Prisma migrations applied on each deploy.
- Environment-aware configuration with Zod-validated variables for `local`, `staging`, `production`.
- Secure cookies (`Secure`, `HttpOnly`, `SameSite=Lax`), CORS restricted to the public web domain, base security headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
- Structured JSON logging with `pino` (API) and `pino-browser` (web), automatic redaction of sensitive fields, per-request correlation IDs.
- Health endpoints: `GET /healthz`, `GET /readyz`, `GET /status` (with version, commit, environment, last backup, uptime, public URL).
- Basic metrics: request rate, 5xx error rate, p95/p99 latency, accessible via a public dashboard endpoint guarded by an internal token.
- Free-tier uptime monitor with email alerts routed to the dedicated Gmail account.
- External daily Postgres backup (cron or scheduled job) with 7-day retention, integrity verification, and a tested restore into an isolated database.
- Rate limiting by IP and authenticated user, with a shared free-tier-compatible state store, on auth, password reset, and transaction/FX endpoints. 429 responses with `Retry-After`.
- Status UI page in `apps/web` rendering `/status` payload and the last backup timestamp.
- Smoke e2e tests in Playwright covering the status surface, health endpoints, and rate-limit 429 path.
- Runbook for free-tier suspension, restore drill, and migration to paid services.
- Architecture report (English + Spanish mirror) describing the chosen stack, libraries, why/how/where/when decisions.

### Out of scope

- Public user-facing features beyond the status surface.
- Google OAuth and Gmail transactional email (delivered in Module 2).
- Superadmin panel and RBAC extension (delivered in Module 3).
- Privacy/Export/Account Deletion (delivered in Module 4).
- Real FX provider (delivered in Module 5).
- Production hardening gate, load testing, and final public cutover (delivered in Module 6).
- Custom domain (a free provider subdomain is used for the launch).
- SLA guarantees or paid-provider commitments (free-tier limits and suspension are accepted).

## Decisions locked at proposal time

- **D-PF-1 (target platform)**: Vercel for `apps/web` and Railway (or equivalent free-tier Node host) for `apps/api`. Comparison of viable alternatives before implementation is mandatory during design; if a better combination emerges, document the swap.
- **D-PF-2 (email)**: Gmail dedicated account via SMTP/App Password, isolated behind a `MailAdapter` interface, never raw `nodemailer` calls in business code. Module 2 wires the reset flow; Module 1 ships the adapter skeleton and a `/mail/test` endpoint that posts to Gmail from staging (gated to non-production admins only).
- **D-PF-3 (logging)**: `pino` (API) + `pino-browser` (web). Redaction of `password`, `token`, `cookie`, `authorization`, `idempotency-key`, `*.amount`, `*.reportingAmount`, `email`, `*.email`. Money fields are NEVER logged even at the adapter level.
- **D-PF-4 (rate limit)**: Shared free-tier-compatible backend (`Upstash Ratelimit` free tier or a Postgres-backed token bucket). Fail-open semantics when the limiter itself fails must be configurable; default fail-closed for auth endpoints, fail-open for read endpoints.
- **D-PF-5 (backup)**: Daily `pg_dump` to an external free object storage (`R2`/`B2`/`S3 free tier` or the same provider's free artifact bucket). 7-day retention. Restore drill runs against an isolated database at least once before launch.
- **D-PF-6 (metrics)**: In-process counters exposed at `/metrics` (Prometheus-style text) gated by a `METRICS_TOKEN` env var. No external SaaS required.
- **D-PF-7 (status UI)**: Lives in `apps/web/app/[locale]/status/page.tsx`. Server-rendered. Localized in English and Spanish. Polls every 60s. Reflects `/status` payload, not an optimistic UI.

## Risks

- **R-PF-1 — Free-tier suspension**: free services may sleep or suspend on inactivity. Mitigated by documenting a ping strategy and a migration runbook to paid providers.
- **R-PF-2 — Backup destination availability**: free object storage quotas may change. Mitigated by defining a portable dump format (`pg_dump -Fc`) and a destination pluggable via env vars.
- **R-PF-3 — Rate limit state loss across instances**: free-tier rate limiters may not be globally consistent. Mitigated by preferring provider-supported distributed stores and adding a degraded-mode log when the store is unreachable.
- **R-PF-4 — Cookie/domain mismatch**: a free provider subdomain may change. Mitigated by centralizing the public URL in env vars and documenting the migration step to a custom domain.
- **R-PF-5 — Gmail app-password rotation**: Gmail may invalidate App Passwords. Mitigated by isolating credentials in env vars and documenting rotation.
- **R-PF-6 — External dependency churn**: providers (Vercel, Railway, Gmail) may change free-tier terms. Mitigated by design decisions D-PF-1, D-PF-2, D-PF-5 — all choice points are isolated behind interfaces.

## Open questions forwarded to design

- Q-PF-A: Concrete comparison of free-tier hosts (Vercel vs Netlify for web; Railway vs Render vs Fly vs Koyeb for API) including quota, region, and Postgres adjacency. Outcome: lock to a primary + document the fallback path.
- Q-PF-B: Whether the rate-limit store uses `Upstash Ratelimit` (Redis) or a Postgres token bucket. Outcome: choose based on free-tier availability and quota.
- Q-PF-C: How `/status` is exposed without leaking internal information. Outcome: opt-in `/status?detail=full` for admins via a token; public `/status` returns only uptime, version, last backup timestamp, and current environment.
- Q-PF-D: How to test backup restore without a paid second database. Outcome: restore into a temporary schema on the same free Postgres instance and clean up after the drill.
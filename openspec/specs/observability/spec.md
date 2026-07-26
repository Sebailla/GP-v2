# Observability Specification

## Purpose

Defines the observability surface of the API: a Prometheus-compatible `/metrics` endpoint, the auth/admin/session counters exposed through it, and the test-infrastructure coverage gate that enforces the 60% thresholds declared in `openspec/config.yaml`.

## Requirements

### Requirement: Prometheus Metrics Endpoint

The system MUST expose `GET /metrics` returning Prometheus-compatible text-format metrics. The endpoint MUST be served by the existing metrics module (per M1 R-PF-9) and MUST NOT require authentication (operators scrape it from monitoring infrastructure outside the user auth surface). The response MUST include: process metrics (Node.js defaults — memory, GC, event-loop lag), HTTP metrics (request count, latency, status codes), custom auth counters defined in the `auth-server-surface` spec under "Observability Metrics for Auth Operations", and pino structured logs at INFO level with structured fields. Label values MUST NOT carry email addresses, userIds, IPs, or other PII.

#### Scenario: Metrics scrape returns 200

- GIVEN the API is running
- WHEN a scraper issues `GET /metrics`
- THEN 200 is returned with `text/plain` in Prometheus exposition format

#### Scenario: Auth counter present after login

- GIVEN an admin completes a successful login
- WHEN a metrics scraper reads `GET /metrics`
- THEN the body includes the line `auth_login_success_total{email_domain="<domain>"} 1`

#### Scenario: Process metrics present

- GIVEN the API is running
- WHEN a scraper reads `GET /metrics`
- THEN the body includes `process_*` entries (memory, GC, event-loop lag)

#### Scenario: Privacy — no PII in label values

- GIVEN any auth or admin operation completes
- WHEN a scraper reads `GET /metrics`
- THEN no label value contains `@`, no label is named `ip_address`, and no label carries a raw userId UUID

### Requirement: Coverage Gate Enforcement

The `pnpm turbo run test` pipeline MUST enforce per-package coverage thresholds: lines ≥ 60%, branches ≥ 60%, functions ≥ 60%, statements ≥ 60%. The thresholds are declared in `openspec/config.yaml` under `coverage_threshold`. A coverage drop below any threshold MUST fail the turbo `test` task. The gate MUST be opt-out via `coverage.disabled=true` env var (for experimental branches where coverage cannot yet meet the target). Coverage MUST be measured per-package via `@vitest/coverage-v8`.

#### Scenario: Coverage above threshold — gate passes

- GIVEN a package at ≥ 60% coverage on lines, branches, functions, statements
- WHEN `pnpm turbo run test` runs
- THEN the turbo test task exits 0

#### Scenario: Coverage below threshold — gate fails

- GIVEN a package at 50% lines coverage (below 60%)
- WHEN `pnpm turbo run test` runs
- THEN the turbo test task exits non-zero with a coverage report identifying the under-threshold package

#### Scenario: Coverage opt-out

- GIVEN `coverage.disabled=true` in the environment
- WHEN `pnpm turbo run test` runs (even if coverage is below threshold)
- THEN the turbo test task exits 0 and the under-threshold package is reported as a warning, not a failure

## Provenance

Introduced by: module-5-production-hardening, 2026-07-20; foundation from M1 R-PF-9 metrics endpoint.

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

### Requirement: Coverage Threshold Process Enforcement (M5.1)

The system MUST enforce per-package coverage thresholds via the Vitest process exit code. When a `@vitest/coverage-v8` run completes and any package's coverage falls below 60% (lines, branches, functions, statements), the turbo `test --coverage` task MUST exit non-zero — even when every test passes. Enforcement works via Vitest's built-in threshold-vs-exit (v4.2+) or, as fallback, a post-coverage script (`tools/coverage-validator.ts`) that parses `coverage/coverage-summary.json`. The chosen method MUST be documented in the runbook. The escape hatch `coverage.disabled=true` MUST bypass the gate (M5 contract).

#### Scenario: All packages ≥ 60% — coverage run passes

- GIVEN every workspace package reports ≥ 60% on lines, branches, functions, statements
- WHEN `pnpm turbo run test --coverage` runs
- THEN the turbo task exits 0 with no coverage error

#### Scenario: One package forced below 60% — coverage run fails

- GIVEN a single workspace package is forced to 50% lines coverage
- WHEN `pnpm turbo run test --coverage` runs
- THEN the turbo task exits non-zero with an error message naming the failing package and its measured percentage

#### Scenario: Bypass via `coverage.disabled=true`

- GIVEN `coverage.disabled=true` is set in the environment
- WHEN `pnpm turbo run test --coverage` runs (even with a package below threshold)
- THEN the turbo task exits 0 and the under-threshold package is reported as a warning

#### Scenario: New package with zero coverage — coverage run fails

- GIVEN a new workspace package is added with no test files (0% coverage)
- WHEN `pnpm turbo run test --coverage` runs
- THEN the turbo task exits non-zero, forcing the team to add tests before landing

#### Scenario: Vitest v4.1.x without custom validator — graceful degradation

- GIVEN the project is on Vitest v4.1.x AND `tools/coverage-validator.ts` is not present
- WHEN `pnpm turbo run test --coverage` runs
- THEN a clear warning is logged to CI output and the turbo task exits 0 (gate not enforced, gap visible)

### Requirement: Bcrypt Cost-12 Timing Stability (M5.1)

The system MUST execute the bcrypt cost-12 timing probe within a 1500 ms budget when the probe runs under coverage instrumentation (CPU load + v8 instrumentation). The probe MUST log actual elapsed time to the test runner output so CI logs surface real performance regressions. The 1500 ms budget replaces the 500 ms M5 default for the under-coverage case ONLY; the 500 ms budget remains the spec for production deployment simulations (no instrumentation overhead). The wider budget is a stability fix, not a relaxation of the security standard.

#### Scenario: Bcrypt cost-12 completes within 1500 ms under coverage

- GIVEN a user logs in with a bcrypt-hashed password at cost factor 12
- WHEN the auth-hash test runs under Vitest coverage instrumentation
- THEN the login completes within 1500 ms and the test passes

#### Scenario: Elapsed time surfaced to CI logs

- GIVEN the bcrypt cost-12 timing probe runs under coverage instrumentation
- WHEN the test suite finishes
- THEN CI logs include a line `bcrypt cost-12: <elapsed> ms` recording the measured time

#### Scenario: Production simulation retains 500 ms M5 budget

- GIVEN a separate test run simulating production conditions (no coverage instrumentation)
- WHEN the bcrypt cost-12 timing probe executes
- THEN the 500 ms M5 default budget applies and a regression to > 500 ms is flagged as a failure

#### Scenario: Cost-14 override stays within widened budget

- GIVEN a user logs in with a bcrypt-hashed password at the cost-14 test override
- WHEN the auth-hash test runs under coverage instrumentation
- THEN the login completes within 1500 ms and the test passes

## Provenance

Introduced by: module-5-production-hardening, 2026-07-20; coverage gate wired (per-package 60% threshold). Extended by: module-5.1-coverage-hardening, 2026-07-26 (2 NEW requirements: Coverage Threshold Process Enforcement + Bcrypt Timing Stability).

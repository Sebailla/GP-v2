# Audit Log UI Specification

## Purpose

Defines the admin audit-log surface: filtered, paginated reads of `AdminAuditEvent` rows, dry-run-first retention purge, and the `AUDIT_RETENTION_DAYS` env contract.

## Requirements

### Requirement: List Audit Events

The system MUST expose `GET /admin/audit` returning a JSON array of `AdminAuditEvent` rows sorted by `createdAt DESC`. Each row includes `id`, `actorId`, `targetId`, `action` (3 enum values), `createdAt`, `metadata`, `ipAddress` (HMAC-SHA256 hex OR null), `userAgent` (≤ 512 chars OR null). Filters: `actorId`, `targetId`, `action`, `since`, `until`, `limit` (default 50, max 200), `offset` (default 0). Guarded by `role=ADMIN`.

#### Scenario: Default sorted DESC

- GIVEN an admin and mixed-action rows
- WHEN `GET /admin/audit` runs
- THEN 200 returns rows DESC by `createdAt`

#### Scenario: Filter by actorId

- GIVEN rows from multiple actors
- WHEN `?actorId=<uuid>` runs
- THEN 200 returns only that actor's rows

#### Scenario: Filter by action

- GIVEN mixed-action rows
- WHEN `?action=REVOKE_SESSION` runs
- THEN 200 returns only those rows

#### Scenario: Filter by date range

- GIVEN rows spanning dates
- WHEN `?since=<iso>&until=<iso>` runs
- THEN 200 returns rows in range

#### Scenario: Pagination

- GIVEN 50 rows
- WHEN `?limit=10&offset=20` runs
- THEN 200 returns 10 rows skipping 20

#### Scenario: Empty

- GIVEN an actor with no rows
- WHEN `?actorId=<uuid>` runs
- THEN 200 returns `[]`

#### Scenario: Non-admin

- GIVEN a non-admin caller
- WHEN `GET /admin/audit` runs
- THEN 403 is returned

#### Scenario: Default limit

- GIVEN 100 rows
- WHEN `GET /admin/audit` (no `?limit=`) runs
- THEN 200 returns ≤ 50 rows

#### Scenario: Default offset

- GIVEN rows present
- WHEN `GET /admin/audit` (no `?offset=`) runs
- THEN 200 returns starting from offset 0

#### Scenario: Max limit clamped

- GIVEN an admin
- WHEN `?limit=500` runs
- THEN effective limit is 200

### Requirement: Purge Audit Events (Dry-run)

The system MUST expose `POST /admin/audit/purge` with body `{ dryRun: true, olderThanDays: <n> }` returning `{ matched, wouldDelete }` (equal in dry-run). MUST NOT delete rows. Guarded by `role=ADMIN`. `olderThanDays` MUST be ≥ 1.

#### Scenario: Dry-run with matches

- GIVEN 42 rows older than 90 days
- WHEN `{ dryRun: true, olderThanDays: 90 }` posts
- THEN 200 returns `{ matched: 42, wouldDelete: 42 }` and no rows are deleted

#### Scenario: Zero matches

- GIVEN no rows older than 90 days
- WHEN `{ dryRun: true, olderThanDays: 90 }` posts
- THEN 200 returns `{ matched: 0, wouldDelete: 0 }`

#### Scenario: Invalid olderThanDays

- GIVEN an admin
- WHEN `{ dryRun: true, olderThanDays: 0 }` posts
- THEN 400 returns a Zod error

#### Scenario: Non-admin forbidden

- GIVEN a non-admin caller
- WHEN `POST /admin/audit/purge` runs
- THEN 403 is returned

### Requirement: Purge Audit Events (Real)

The system MUST expose `POST /admin/audit/purge` with body `{ dryRun: false, olderThanDays: <n> }` returning `{ matched, deleted }`. Rows where `createdAt < now() - olderThanDays * 86_400_000` MUST be deleted atomically (single `deleteMany`). Guarded by `role=ADMIN`. The next `GET /admin/audit` MUST NOT include deleted rows.

#### Scenario: Real purge deletes

- GIVEN 42 rows older than 90 days
- WHEN `{ dryRun: false, olderThanDays: 90 }` posts
- THEN 200 returns `{ matched: 42, deleted: 42 }` and those rows are gone

#### Scenario: Zero matches

- GIVEN all rows younger than 1 day
- WHEN `{ dryRun: false, olderThanDays: 1 }` posts
- THEN 200 returns `{ matched: 0, deleted: 0 }`

#### Scenario: Idempotent repeat

- GIVEN a completed purge for 90 days
- WHEN the same purge runs again
- THEN 200 returns `{ matched: 0, deleted: 0 }`

#### Scenario: Atomic deletion

- GIVEN one admin reads while another purges
- WHEN the purge commits
- THEN the reader sees all-or-none

#### Scenario: Non-admin forbidden

- GIVEN a non-admin caller
- WHEN `POST /admin/audit/purge` runs
- THEN 403 is returned

### Requirement: Audit Retention Environment Variable

The system MUST read `AUDIT_RETENTION_DAYS` from the env contract. Default `90`. `0` means "no automatic retention" (kill-switch). Unset MUST default to `90`. MUST be validated as a non-negative integer. MUST expose `getAuditRetentionDays()` for the runbook.

#### Scenario: Default 90

- GIVEN `AUDIT_RETENTION_DAYS` not set
- WHEN the system boots
- THEN `getAuditRetentionDays()` returns `90`

#### Scenario: Explicit 30

- GIVEN `AUDIT_RETENTION_DAYS=30`
- WHEN the system boots
- THEN `getAuditRetentionDays()` returns `30`

#### Scenario: Kill-switch 0

- GIVEN `AUDIT_RETENTION_DAYS=0`
- WHEN the system boots
- THEN `getAuditRetentionDays()` returns `0`

#### Scenario: Invalid negative

- GIVEN `AUDIT_RETENTION_DAYS=-1`
- WHEN the system boots
- THEN env validation fails

#### Scenario: Invalid non-numeric

- GIVEN `AUDIT_RETENTION_DAYS=abc`
- WHEN the system boots
- THEN env validation fails

## Provenance

Introduced by: module-4-privacy, 2026-07-19. Foundation: module-3-superadmin, 2026-07-18 (`AdminAuditEvent` table + `insertAuditEvent` + `hashIpForAudit`).

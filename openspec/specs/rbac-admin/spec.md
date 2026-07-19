# RBAC Admin Specification

## Purpose

Defines the admin role operations surfaced by the API: listing users, changing user roles, and persisting every admin action to an `AdminAuditEvent` row for retrospective review.

## Requirements

### Requirement: List Users with Role

`GET /admin/users` MUST return all users sorted DESC by `createdAt` with `id`, `email`, `role`, `createdAt`. Supports `?limit=<n>&offset=<n>` pagination (default `limit=50`). `role=ADMIN` guard.

#### Scenario: Default list

- GIVEN an admin and 3 users
- WHEN the endpoint is called
- THEN 200 is returned sorted DESC by `createdAt`

#### Scenario: Empty

- GIVEN an admin and 0 users
- WHEN called
- THEN 200 with `[]`

#### Scenario: Forbidden role

- GIVEN non-admin
- WHEN called
- THEN 403

#### Scenario: Pagination

- GIVEN an admin and 50 users
- WHEN called with `?limit=10&offset=20`
- THEN 200 with 10 users, skipping the first 20

### Requirement: Change User Role

`POST /admin/users/:userId/role` with body `{ role: "USER" | "ADMIN" }` MUST update the user's role and insert `AdminAuditEvent` with `action: "CHANGE_ROLE"`, `metadata: { from: <oldRole>, to: <newRole> }`. Self-demotion MUST be allowed. `role=ADMIN` guard.

#### Scenario: Promote

- GIVEN admin + a USER
- WHEN role is set to `ADMIN`
- THEN 200 is returned, DB updated, audit row inserted

#### Scenario: Demote

- GIVEN admin + another ADMIN
- WHEN role is set to `USER`
- THEN 200 is returned, DB updated, audit row inserted

#### Scenario: Self-demote

- GIVEN admin
- WHEN admin sets own role to `USER`
- THEN 200 is returned, role updated, audit row inserted

#### Scenario: Invalid role

- GIVEN admin
- WHEN role is `GOD`
- THEN 400 with a validation error and no audit row

#### Scenario: Idempotent

- GIVEN admin + a USER
- WHEN role is set to `USER`
- THEN 200 is returned and no audit row is inserted

#### Scenario: Unknown user

- GIVEN admin + an unknown userId
- WHEN called
- THEN 404 and no audit row

### Requirement: Admin Audit Event Storage

Every admin operation MUST persist to `AdminAuditEvent` with `actorId` (UUID), `targetId` (UUID), `action` (`REVOKE_SESSION` | `REVOKE_ALL_SESSIONS` | `CHANGE_ROLE`), `createdAt` (now), `metadata` (JSON), `ipAddress` (≤ 45 chars), `userAgent` (≤ 512 chars). The table MUST have an index on `createdAt DESC`.

#### Scenario: REVOKE_SESSION row

- GIVEN a revoke-single call
- WHEN the operation completes
- THEN a row is inserted with all 7 fields populated

#### Scenario: REVOKE_ALL_SESSIONS row

- GIVEN a revoke-all call
- WHEN the operation completes
- THEN a row is inserted with `metadata.revokedCount`

#### Scenario: CHANGE_ROLE row

- GIVEN a role-change call
- WHEN the operation completes
- THEN a row is inserted with `metadata.from` and `metadata.to`

#### Scenario: IP redaction

- GIVEN a pino log line carrying an actor IP
- WHEN the log line is emitted
- THEN the IP is rendered as `ip: [REDACTED]`

#### Scenario: User-agent truncation

- GIVEN a user-agent longer than 512 chars
- WHEN the audit row is inserted
- THEN the stored `userAgent` is truncated to 512 chars

## Provenance

Introduced by: module-3-superadmin, 2026-07-18.

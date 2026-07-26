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

`POST /admin/users/:userId/role` with body `{ role: "USER" | "ADMIN" }` MUST update the user's role and insert `AdminAuditEvent` with `action: "CHANGE_ROLE"`, `metadata: { from: <oldRole>, to: <newRole> }`. Self-demotion MUST be allowed. `role=ADMIN` guard. The `changeRole` operation MUST be wrapped in a Prisma `$transaction` running at the `Serializable` isolation level (or a database-level `SERIALIZABLE` transaction). The last-admin invariant (refuse to demote the only remaining admin) MUST be re-checked INSIDE the transaction, not before, so two concurrent admin-demotes cannot both pass the count check. If the transaction fails with a serialization error (Postgres SQLSTATE `40001`), the system MUST retry up to 3 times with exponential backoff. After 3 retries, the system MUST return 503 Service Unavailable with a localized error body.

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

#### Scenario: Last-admin safeguard

- GIVEN only 1 admin in the system
- WHEN any caller attempts to demote that admin
- THEN 409 is returned with a `LastAdminError` and no role change occurs

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

#### Scenario: Concurrent demotes — exactly one succeeds

- GIVEN 2 admins attempting to demote each other simultaneously
- WHEN both `POST /admin/users/:userId/role` calls execute in parallel
- THEN exactly one demotion succeeds (200 + audit row)
- AND the other returns 409 (or retry-exhausted 503) with no partial state

#### Scenario: Retry succeeds on transient serialization error

- GIVEN a transient SQLSTATE `40001` injected on the first attempt only
- WHEN `changeRole` runs
- THEN the operation retries and succeeds on the 2nd attempt (200 + audit row)

#### Scenario: Retry exhausted → 503

- GIVEN 3 consecutive SQLSTATE `40001` serialization errors
- WHEN `changeRole` runs
- THEN 503 is returned with a localized `serialization_failed` error body
- AND no partial state persists

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
Extended by: module-5-production-hardening, 2026-07-20 (1 modified requirement: Change User Role F2 Serializable constraint with retry on Postgres SQLSTATE 40001).

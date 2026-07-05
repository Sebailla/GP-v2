# Transactions Specification

> **Domain**: transactions
> **Change**: `vertical-slicing-reference-scaffold`
> **Project**: `gastos-personales-reference`
> **Stack reference**: NestJS 10, Prisma + Postgres (Docker), Next.js 15 App Router client, `@cucumber/cucumber` BDD
> **Cross-references**: `proposal.md` §2.1.4 (tx edges), §7.4 (G18, G19, G24–G28), §8 deferred items #1 and #2, §11 (UI-1..UI-4, G40–G47)

## Purpose

Define the behavior the transactions slice MUST satisfy in the reference repo. The slice ingests, lists, updates, and soft-deletes transactions; converts amounts across currencies using FX rates with a staleness warning when the rate is older than 24 hours; rejects duplicates on retry via an idempotency-key mechanism; persists monetary values with `Decimal` precision (never `BigInt`); audits every write with `createdBy` / `updatedBy`; filters soft-deleted categories out of every category query (non-negotiable); and computes sign-aware, per-category totals with threshold alerts. The UI surfaces for every transactions screen are reachable through `next-intl` locale-prefixed routes (`/en/...`, `/es/...`), use shadcn-style component primitives, are WCAG AA compliant, and ship complete form states (loading, error, success, empty, validation-error). Every critical screen has at least one component test and one e2e test.

This spec addresses Locked Decisions #7 (multi-currency + soft-delete), #9 (tx edges in scope), and §8 deferred items #1 (idempotency-key storage strategy) and #2 (FX rate source), plus the UI addendum (#11, decisions UI-1..UI-4).

## Requirements

### Requirement: Transaction Validation

A transaction MUST be accepted only when `amount > 0`, the currency code is a known ISO 4217 code present in `Currency`, and the category exists in `Category` with `deletedAt IS NULL`. Validation MUST happen through the shared Zod schema before persistence; failed validation MUST short-circuit before any side effect.

#### Scenario: Valid input is accepted

- GIVEN a known currency code, a non-deleted category, and `amount > 0`
- WHEN the user submits the create-transaction form for the active locale
- THEN the transaction is persisted
- AND the success state of the form is rendered

#### Scenario: Non-positive amount is rejected

- GIVEN a submit attempt with `amount = 0` or a negative value
- WHEN the form is submitted
- THEN no transaction is created
- AND the validation-error state is rendered on the amount field

#### Scenario: Unknown currency is rejected

- GIVEN an `amount` and a category, but a currency code that does not exist in `Currency`
- WHEN the form is submitted
- THEN no transaction is created
- AND the validation-error state is rendered on the currency field

#### Scenario: Soft-deleted category is rejected

- GIVEN a category that has been soft-deleted (`deletedAt IS NOT NULL`)
- WHEN the user attempts to create a transaction against that category
- THEN no transaction is created
- AND the form renders the error state with a "category not available" message

### Requirement: Multi-Currency Storage and Conversion

The system MUST persist every transaction in its native currency and compute, at write-time, the equivalent amount in the user's reporting currency using the most recent `FxRate`. The reporting-currency equivalent MUST be stored alongside the native amount for fast read-time aggregation.

#### Scenario: Create transaction in a non-reporting currency

- GIVEN a user with reporting currency `USD`
- AND a `Currency` row for `ARS`
- AND a recent `FxRate` for `ARS → USD`
- WHEN the user creates a transaction with `amount = 1000` ARS
- THEN the transaction is persisted with `nativeAmount = 1000`, `nativeCurrency = 'ARS'`, and `reportingAmount` computed from the FX rate
- AND the success state is rendered with the converted amount visible

#### Scenario: Same-currency transaction skips FX

- GIVEN a user with reporting currency `USD`
- WHEN the user creates a transaction with `amount = 50` USD
- THEN the `reportingAmount` equals the `nativeAmount` (no FX lookup performed)

### Requirement: FX Rate Staleness Warning

When the most recent `FxRate` used for conversion is older than 24 hours, the system MUST persist the transaction AND emit a domain event signalling the stale rate. The transaction write MUST NOT be blocked by staleness; the warning is metadata for downstream handling.

#### Scenario: Stale FX rate surfaces as a warning at write-time

- GIVEN an `FxRate` for the relevant currency pair whose `recordedAt` is older than 24 hours
- WHEN a transaction is created against that pair
- THEN the transaction is persisted
- AND a `fxRate.stale` domain event is published with the pair and the staleness duration
- AND the success state of the form includes a visible "rate is stale" affordance

#### Scenario: Fresh FX rate does not trigger a warning

- GIVEN an `FxRate` for the relevant currency pair whose `recordedAt` is within 24 hours
- WHEN a transaction is created against that pair
- THEN no `fxRate.stale` event is published
- AND no warning is rendered

### Requirement: Idempotency-Key on Transaction Create

The system MUST accept an `Idempotency-Key` header on the create-transaction endpoint. Two requests carrying the same key MUST result in exactly one transaction row; the second response MUST return the originally persisted transaction without creating a duplicate.

#### Scenario: Replayed request returns the same transaction

- GIVEN a valid transaction creation request with header `Idempotency-Key: <K>`
- WHEN the same request is retried with the same key
- THEN no second `Transaction` row is created
- AND both responses refer to the same transaction ID and identical payload

#### Scenario: Different keys create independent transactions

- GIVEN a valid transaction creation request with header `Idempotency-Key: <K1>`
- WHEN the user submits the same payload with a different key `<K2>`
- THEN two distinct transactions are persisted
- AND both responses succeed with their respective transaction IDs

### Requirement: Decimal Precision for Monetary Values

The system MUST persist monetary amounts using Prisma `Decimal`. The slice MUST NOT introduce `BigInt` for monetary values. Reads MUST surface `Decimal` values without an integer-cast step that truncates cents.

#### Scenario: Decimal cents are preserved on persistence

- GIVEN a transaction submission of `amount = 12.34`
- WHEN the transaction is created
- THEN the persisted `nativeAmount` equals `12.34` exactly (no truncation to `12`)
- AND the read-back value equals `12.34`

#### Scenario: Large amounts do not overflow into BigInt

- GIVEN a transaction submission of `amount = 999999999999.99`
- WHEN the transaction is created
- THEN the persisted value is `999999999999.99` as a `Decimal`
- AND no `BigInt` coercion is performed

### Requirement: Audit Log on Every Transaction Write

Every persisted or mutated `Transaction` row MUST carry `createdBy` and `updatedBy` user IDs. The IDs MUST reference existing `User` records. Mutation operations (update, delete) MUST update `updatedAt` and `updatedBy`; soft-delete MUST preserve the original `createdBy`.

#### Scenario: Create populates createdBy and updatedBy

- GIVEN an authenticated session for user `U`
- WHEN `U` creates a transaction
- THEN the persisted row has `createdBy = U.id` and `updatedBy = U.id`
- AND `createdAt` and `updatedAt` are populated

#### Scenario: Update refreshes updatedBy but not createdBy

- GIVEN a transaction originally created by user `U1`
- WHEN user `U2` updates the transaction
- THEN `updatedBy = U2.id` and `updatedAt` reflects the update
- AND `createdBy` remains `U1.id`

### Requirement: Soft-Delete Filter on All Category Queries

Every read and write of `Category` MUST include `deletedAt IS NULL` in the filter. The slice MUST NOT expose opt-outs. This rule is non-negotiable across the slice.

#### Scenario: Active categories are returned

- GIVEN a mixture of active and soft-deleted categories
- WHEN the transactions slice lists categories for any UI control
- THEN only active categories are returned

#### Scenario: Soft-deleted categories cannot be selected for a new transaction

- GIVEN a category that has been soft-deleted
- WHEN the user opens the create-transaction form
- THEN the soft-deleted category is absent from the selectable list
- AND an attempt to submit a transaction referencing that category is rejected by the validation pipeline

### Requirement: Sign-Aware Totals (Income vs Expense)

The slice MUST classify each transaction as income (positive sign on the `kind`/enum) or expense (negative sign), and MUST compute roll-up totals distinguishing income, expense, and net. Totals MUST respect the reporting currency.

#### Scenario: Income and expense totals are reported separately

- GIVEN two transactions in the reporting currency: one income of `+100` and one expense of `-40`
- WHEN the totals service computes the summary
- THEN income total = `100`, expense total = `40` (reported as a positive magnitude), net = `60`

#### Scenario: Net matches the difference

- GIVEN the same input as above
- WHEN the totals service computes the net
- THEN net = income total − expense total magnitude = `60`

### Requirement: Per-Category Totals

The slice MUST group totals by category for the active reporting currency. Grouped totals MUST respect the soft-delete filter on categories.

#### Scenario: Totals grouped by active category

- GIVEN transactions in two distinct active categories
- WHEN the per-category totals service runs
- THEN one subtotal is returned per category, with the category name and the net amount

#### Scenario: Soft-deleted categories are excluded

- GIVEN transactions assigned to a soft-deleted category
- WHEN the per-category totals service runs
- THEN the soft-deleted category does NOT appear in the result
- AND those transactions are excluded from category rollups (still counted in overall income/expense totals)

### Requirement: Threshold Alerts

When a transaction or roll-up crosses a configured threshold (per category or absolute), the slice MUST emit a domain event that downstream code (notifications, toasts, audit) can subscribe to.

#### Scenario: Threshold crossed on create

- GIVEN a configured threshold `T` for the category
- WHEN the user creates a transaction whose amount exceeds `T`
- THEN the transaction is persisted
- AND a `transactions.threshold.exceeded` domain event is published with the category ID and amount

#### Scenario: Threshold not crossed produces no event

- GIVEN the same configuration
- WHEN the user creates a transaction whose amount is at or below `T`
- THEN no threshold event is published

### Requirement: Listing, Pagination, and Filtering

The list endpoint MUST support pagination, filtering by category (active only), filtering by date range, and filtering by currency. Soft-deleted categories MUST NOT appear in the filter. An empty result set MUST be representable as an empty list with `total = 0`.

#### Scenario: Paginated listing returns a page of results

- GIVEN more transactions than the page size
- WHEN the user requests page `n` with the configured page size
- THEN at most `pageSize` rows are returned
- AND the response includes a `total` count and a cursor for the next page

#### Scenario: Filter by category excludes soft-deleted categories

- GIVEN a category `C` that has been soft-deleted
- WHEN the user requests a list filtered by `C`
- THEN an empty result set is returned with `total = 0`

### Requirement: Update and Soft-Delete Operations

The slice MUST support updating mutable fields (amount, currency, category, notes) and soft-delete. Soft-delete sets `deletedAt` and refreshes `updatedBy`; the row remains in the DB for audit but is filtered out by every read query that includes the soft-delete predicate.

#### Scenario: Update mutable fields

- GIVEN an existing transaction
- WHEN the user edits the amount and notes through the edit screen for the active locale
- THEN the new values are persisted
- AND `updatedBy` and `updatedAt` reflect the change
- AND the success state is rendered

#### Scenario: Soft-delete removes the transaction from listings

- GIVEN an existing transaction
- WHEN the user soft-deletes it
- THEN `deletedAt` is set
- AND the transaction is absent from subsequent listings and per-category totals
- AND the audit row retains `createdBy` and `updatedBy`

### Requirement: FX Rate Provider as a Port

The slice MUST obtain FX rates through a port (interface) named `FxRateProvider`. The reference repo ships an in-memory default implementation seeded with a small set of pairs and an updatable clock. The port shape allows a real provider (HTTP, file, etc.) to be slotted in later without changing the transactions slice.

#### Scenario: Default in-memory provider supplies a recent rate

- GIVEN the in-memory provider is seeded with an `ARS → USD` rate recorded now
- WHEN the transactions slice needs the rate
- THEN the provider returns the seeded rate
- AND the conversions proceed without failure

#### Scenario: Unknown pair surfaces a domain error

- GIVEN the in-memory provider has no rate for the requested pair
- WHEN the transactions slice needs that pair
- THEN the lookup fails with a domain-defined error
- AND the user-visible error state on the create form reports the failure

### Requirement: Idempotency Storage Strategy

The system MUST persist idempotency keys in a dedicated `IdempotencyKey` table (canonical Stripe-style shape). The table MUST hold the key, the user it belongs to, the request fingerprint, the response payload, and a TTL. The reference repo uses a separate `IdempotencyKey` row per key to keep TTL cleanup independent of the `Transaction` lifecycle.

#### Scenario: First request with a key persists both rows

- GIVEN a fresh `Idempotency-Key` header value
- WHEN the request creates a transaction successfully
- THEN an `IdempotencyKey` row is inserted with the key, the user ID, the request fingerprint, and the cached response payload
- AND a `Transaction` row is inserted

#### Scenario: Replay returns the cached response

- GIVEN a previously cached `(key, user, fingerprint)` triple within the TTL
- WHEN the same request is retried
- THEN no new `IdempotencyKey` row is created
- AND no new `Transaction` row is created
- AND the cached response payload is returned

#### Scenario: Fingerprint mismatch is rejected

- GIVEN a previously cached `(key, user)` triple
- WHEN the same key is reused with a different request fingerprint
- THEN the request is rejected with a conflict error
- AND no state is mutated

#### Scenario: Expired keys are eligible for removal

- GIVEN an `IdempotencyKey` row whose `expiresAt` is in the past
- WHEN cleanup runs (or a replay is attempted)
- THEN the replay is treated as a fresh request
- AND the row may be removed by the cleanup procedure

### Requirement: UI Primitives (shadcn-style Components)

Every transactions screen MUST be built with shadcn-style component primitives installed locally as editable `.tsx` files (reusing the same primitive set as the auth slice). Critical primitives include Button, Input, Form, Card, Dialog, DropdownMenu, Select, Toast, and Table.

#### Scenario: Transactions screens compose from the shared primitive set

- GIVEN the installed primitives under the transactions client directory
- WHEN any transactions screen is rendered
- THEN every interactive surface is built from the installed primitives
- AND no inline-styled HTML forms are used as a final state

### Requirement: Locale-Prefixed Transactions Routing via next-intl

Every transactions route MUST be reachable under both `/en/...` and `/es/...`. Active locale MUST drive the rendered language for labels, validation messages, success/error text, and threshold warning text. Switching locale MUST preserve the active surface (e.g. switching from `/en/transactions` keeps the user on `/es/transactions`).

#### Scenario: List transactions screen is reachable in both locales

- GIVEN the application is running
- WHEN the user navigates to `/en/transactions` or `/es/transactions`
- THEN the list renders in English or Spanish respectively
- AND every label and message is translated via `next-intl`

#### Scenario: Switching locale preserves the surface

- GIVEN the user is on `/en/transactions/new`
- WHEN the user changes the locale to `es`
- THEN the user lands on `/es/transactions/new` with form fields preserved where possible

### Requirement: WCAG AA Accessibility for Transactions Screens

Every transactions screen MUST be WCAG AA compliant: 4.5:1 text contrast, full keyboard navigation, semantic HTML, and ARIA attributes used only when semantic HTML is insufficient. An automated audit using `@axe-core/playwright` MUST pass for each critical screen.

#### Scenario: axe-core audit passes for the transactions list

- GIVEN the transactions list is rendered at `/{locale}/transactions`
- WHEN `@axe-core/playwright` runs against the screen
- THEN no AA violations are reported
- AND every row action is reachable by keyboard
- AND every row action has an accessible name

### Requirement: Complete Form States on Transactions Forms

Every transactions form (create, edit, delete confirmation) MUST implement the five states: loading, error, success, empty, and validation-error. Raw HTML form dumps are NOT acceptable.

#### Scenario: Create-transaction form transitions through every state

- GIVEN the create-transaction screen at `/{locale}/transactions/new`
- WHEN the screen renders with no input yet
- THEN the empty state is visible
- WHEN the user submits invalid input
- THEN the validation-error state is rendered inline
- WHEN the user submits valid input
- THEN the loading state renders with a disabled submit
- WHEN the response is a failure (e.g. FX error)
- THEN the error state renders with a recoverable message
- WHEN the response is success
- THEN the navigation to the list (or the just-created row) occurs with the success state visible

### Requirement: Responsive Transactions Layout

Every transactions screen MUST render without layout breakage between the mobile (≤640px) and desktop (≥1024px) breakpoints. Intermediate widths MUST NOT cause overflow, hidden controls, or unreadable text.

#### Scenario: Transactions list resizes correctly

- GIVEN the viewport changes between 360px and 1440px width
- WHEN the transactions list is rendered
- THEN no horizontal overflow occurs
- AND every row action is reachable and readable on both breakpoints

### Requirement: Component Tests for Transactions Screens

Every critical transactions screen MUST have at least one Vitest + Testing Library component test covering the happy path. Tests MUST run under `pnpm test` and report green.

#### Scenario: List component renders the empty state when there are no transactions

- GIVEN the list component is mounted with an empty dataset
- WHEN the component test renders
- THEN the empty state is visible
- AND the test passes under `pnpm test`

### Requirement: End-to-End Test for the Transactions Critical Flow

The login → transactions list → create transaction critical flow MUST be exercised by at least one Playwright e2e test that runs under `pnpm turbo run e2e`. The test MUST start clean, sign in, list transactions, create a new transaction, and assert the new row appears.

#### Scenario: e2e create-transaction flow

- GIVEN the application is running and a registered user exists
- WHEN the Playwright e2e test signs in, navigates to the transactions list, opens the create form, fills the form, and submits
- THEN the new transaction is visible in the list
- AND `pnpm turbo run e2e` exits 0

## Data Model

The transactions slice persists against `libs/core/database`. The Prisma schema elements exposed to the slice are listed below. Column types reference Prisma types; refer to the Prisma schema for SQL projection.

| Table              | Column           | Type                       | Constraints / Notes                                                                                                |
|--------------------|------------------|----------------------------|---------------------------------------------------------------------------------------------------------------------|
| `Currency`         | `code`           | `String`                   | Primary key. ISO 4217 three-letter code (e.g. `USD`, `ARS`, `EUR`).                                                |
| `Currency`         | `name`           | `String`                   | NOT NULL. Display name.                                                                                             |
| `Currency`         | `symbol`         | `String`                   | NOT NULL. Currency symbol.                                                                                          |
| `Currency`         | `decimals`       | `Int`                      | NOT NULL. Default 2.                                                                                                |
| `Currency`         | `createdAt`      | `DateTime`                 | NOT NULL.                                                                                                          |
| `FxRate`           | `id`             | `String` (`cuid()`)        | Primary key.                                                                                                       |
| `FxRate`           | `fromCode`       | `String`                   | NOT NULL; FK → `Currency.code`.                                                                                    |
| `FxRate`           | `toCode`         | `String`                   | NOT NULL; FK → `Currency.code`.                                                                                    |
| `FxRate`           | `rate`           | `Decimal`                  | NOT NULL. Stored as `Decimal`, NOT `Float`, to avoid binary representation drift.                                  |
| `FxRate`           | `recordedAt`     | `DateTime`                 | NOT NULL. Index `(fromCode, toCode, recordedAt DESC)` for "most recent" lookup.                                     |
| `Category`         | `id`             | `String` (`cuid()`)        | Primary key.                                                                                                       |
| `Category`         | `name`           | `String`                   | NOT NULL.                                                                                                          |
| `Category`         | `slug`           | `String`                   | NOT NULL; UNIQUE index.                                                                                            |
| `Category`         | `kind`           | `enum CategoryKind`        | NOT NULL. One of `income`, `expense`.                                                                              |
| `Category`         | `deletedAt`      | `DateTime?`                | NULL when active. Soft-delete marker; every read MUST include `deletedAt: null`.                                  |
| `Category`         | `createdAt`      | `DateTime`                 | NOT NULL.                                                                                                          |
| `Category`         | `updatedAt`      | `DateTime`                 | NOT NULL.                                                                                                          |
| `Transaction`      | `id`             | `String` (`cuid()`)        | Primary key.                                                                                                       |
| `Transaction`      | `amount`         | `Decimal`                  | NOT NULL. Always positive magnitude; sign is determined by `kind`. Type is `Decimal`, NEVER `BigInt`.              |
| `Transaction`      | `currencyCode`   | `String`                   | NOT NULL; FK → `Currency.code`.                                                                                    |
| `Transaction`      | `kind`           | `enum TransactionKind`     | NOT NULL. One of `income`, `expense`. Sign derives from `kind`: expense conventionally presented as negative totals. |
| `Transaction`      | `reportingAmount`| `Decimal?`                 | Nullable when native == reporting; otherwise the converted amount in the user's reporting currency.                |
| `Transaction`      | `reportingCurrencyCode` | `String?`           | Nullable when native == reporting; FK → `Currency.code`.                                                          |
| `Transaction`      | `fxRateId`       | `String?`                  | Nullable when native == reporting; FK → `FxRate.id`. NULL when no conversion was needed.                            |
| `Transaction`      | `categoryId`     | `String`                   | NOT NULL; FK → `Category.id`. Lookups MUST `JOIN` on active categories only.                                       |
| `Transaction`      | `notes`          | `String?`                  | Optional free text.                                                                                                |
| `Transaction`      | `occurredAt`     | `DateTime`                 | NOT NULL. Date the transaction happened (not write time).                                                          |
| `Transaction`      | `createdBy`      | `String`                   | NOT NULL; FK → `User.id`. Auth slice is the source-of-truth for `User.id`.                                          |
| `Transaction`      | `updatedBy`      | `String`                   | NOT NULL; FK → `User.id`.                                                                                          |
| `Transaction`      | `createdAt`      | `DateTime`                 | NOT NULL.                                                                                                          |
| `Transaction`      | `updatedAt`      | `DateTime`                 | NOT NULL.                                                                                                          |
| `Transaction`      | `deletedAt`      | `DateTime?`                | NULL when active. Soft-delete marker.                                                                              |
| `IdempotencyKey`   | `id`             | `String` (`cuid()`)        | Primary key.                                                                                                       |
| `IdempotencyKey`   | `key`            | `String`                   | NOT NULL; UNIQUE index per `(userId, key)`.                                                                        |
| `IdempotencyKey`   | `userId`         | `String`                   | NOT NULL; FK → `User.id`.                                                                                          |
| `IdempotencyKey`   | `requestFingerprint` | `String`              | NOT NULL. Hash of the canonical request payload.                                                                   |
| `IdempotencyKey`   | `responsePayload`| `Json`                     | Cached response body for replay.                                                                                   |
| `IdempotencyKey`   | `responseStatus` | `Int`                      | HTTP status code of the cached response.                                                                           |
| `IdempotencyKey`   | `transactionId`  | `String?`                  | FK → `Transaction.id` when the cached response is a transaction creation.                                          |
| `IdempotencyKey`   | `expiresAt`      | `DateTime`                 | NOT NULL. Index for TTL cleanup.                                                                                   |
| `IdempotencyKey`   | `createdAt`      | `DateTime`                 | NOT NULL.                                                                                                          |
| `AuditLog`         | `id`             | `String` (`cuid()`)        | Primary key.                                                                                                       |
| `AuditLog`         | `entityType`     | `String`                   | NOT NULL. Discriminator (`Transaction`, `Category`).                                                                |
| `AuditLog`         | `entityId`       | `String`                   | NOT NULL.                                                                                                          |
| `AuditLog`         | `action`         | `String`                   | NOT NULL. One of `create`, `update`, `softDelete`.                                                                 |
| `AuditLog`         | `actorId`        | `String`                   | NOT NULL; FK → `User.id`.                                                                                          |
| `AuditLog`         | `payload`        | `Json?`                    | Optional change details.                                                                                           |
| `AuditLog`         | `createdAt`      | `DateTime`                 | NOT NULL.                                                                                                          |

Indexes referenced above:

- `Category_slug_key` — UNIQUE on `Category.slug`.
- `Category_active_kind_idx` — composite `(kind, deletedAt)` for filtered listings.
- `FxRate_pair_recorded_idx` — composite `(fromCode, toCode, recordedAt DESC)` for "most recent" lookup.
- `Transaction_user_occurred_idx` — composite `(createdBy, occurredAt DESC)` for user-scoped listings.
- `Transaction_category_active_idx` — composite `(categoryId, deletedAt)` for per-category totals with the soft-delete filter applied.
- `IdempotencyKey_user_key_key` — UNIQUE composite on `(userId, key)`.
- `IdempotencyKey_expiresAt_idx` — index on `expiresAt` for TTL cleanup.
- `AuditLog_entity_idx` — composite `(entityType, entityId)`.

Enums: `Role` (shared with auth spec: `admin`, `user`), `CategoryKind` (`income`, `expense`), `TransactionKind` (`income`, `expense`).

## Gherkin feature inventory

Per Locked Decision #3 (4–6 `.feature` files per module with shared step defs), the transactions module ships:

| File                                                       | High-level scenarios                                                                                                                                                                                                                                                                                                                                                       |
|------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `libs/features/transactions/docs/create-transaction.feature`     | Scenario: Valid submission persists the transaction with reporting-currency equivalent · Scenario: `amount = 0` is rejected with validation error · Scenario: Unknown currency is rejected with validation error · Scenario: Soft-deleted category is rejected.                                                                                                              |
| `libs/features/transactions/docs/list-transactions.feature`        | Scenario: Paginated listing returns a page of rows · Scenario: Empty data set renders the empty state with `total = 0` · Scenario: Filter by soft-deleted category returns an empty list.                                                                                                                                                                                  |
| `libs/features/transactions/docs/multi-currency-conversion.feature` | Scenario: Cross-currency write computes `reportingAmount` from the FX rate · Scenario: Same-currency write skips FX lookup · Scenario: Stale rate (>24h) persists the transaction AND emits `fxRate.stale` · Scenario: Fresh rate emits no stale warning.                                                                                                                  |
| `libs/features/transactions/docs/idempotency-key.feature`           | Scenario: First request with a new key creates the transaction and the idempotency row · Scenario: Replay with same key returns the cached response without duplicating · Scenario: Same key with different fingerprint is rejected · Scenario: Expired key allows a fresh request through.                                                                                  |
| `libs/features/transactions/docs/soft-delete-categories.feature`    | Scenario: Active categories appear in selectors · Scenario: Soft-deleted categories are filtered from selectors AND from transactions list/totals · Scenario: Attempting to attach a soft-deleted category to a new transaction is rejected.                                                                                                                                |
| `libs/features/transactions/docs/sign-aware-totals.feature`         | Scenario: Income and expense totals are reported separately · Scenario: Net = income − expense magnitude · Scenario: Per-category totals group by active category · Scenario: Threshold exceeded on create emits `transactions.threshold.exceeded`.                                                                                                                            |

All step definitions live under `libs/features/transactions/docs/step-defs/` and are shared across the six feature files. Concrete phrasing of steps is left to `sdd-design`; the requirement-level scenarios above enumerate the test surface the design must reach.

## Decisions

### D-TX-1 — Idempotency-key storage: dedicated `IdempotencyKey` table

Resolved `proposal.md` §8 deferred item #1. A dedicated `IdempotencyKey` table is used; rejection of the alternative (`UNIQUE` index on a column of `Transaction`) is on cost-vs-future-flexibility grounds:

- **Pros of a dedicated table**: independent TTL cleanup (no coupling to transaction archival); ability to cache the response payload and replay it on retry (the canonical Stripe-style behavior); distinct fingerprint storage to detect key reuse with different payloads; clean audit trail of "what idempotency records existed".
- **Cons of a dedicated table**: extra table, extra migration, a cleanup procedure (TTL job or lazy expiry on read).
- **Pros of a column on `Transaction`**: no extra table; the transaction row itself documents the key.
- **Cons of a column on `Transaction`**: TTL is bound to the transaction lifecycle (cannot expire independently of an audit log); replay-cached payload has nowhere clean to live; accidental key reuse with a different fingerprint is detected only via `UNIQUE` violation, which is harder to map to a domain error.

The dedicated table wins on **storage cost vs query simplicity** because the reference repo's storage surface is small but the replay path (returning the same response on retry) needs a payload slot that the `Transaction` row does not naturally offer. Trade-off acknowledged: an extra table and a TTL sweep procedure.

### D-TX-2 — FX rate source: `FxRateProvider` port with default in-memory impl

Resolved `proposal.md` §8 deferred item #2. The slice declares a port `FxRateProvider` with two methods (most-recent rate for a pair, with fallback for the `toCode = fromCode` case). The reference repo ships the default in-memory implementation seeded at startup; the port shape allows a real HTTP/file provider to be slotted in later. Trade-off: extra interface to keep in sync, but the seam pays for itself the moment a real provider is wired.

### D-TX-3 — Same-currency conversion is a no-op

When the transaction currency equals the user's reporting currency, the slice skips the FX lookup and sets `reportingAmount = nativeAmount`, `reportingCurrencyCode = currencyCode`, `fxRateId = NULL`. Reason: avoid spurious staleness warnings on single-currency users. No event is emitted.

### D-TX-4 — Stale-rate does not block writes

A stale FX rate (>24h) does not block the write; the transaction is persisted with the available rate and a `fxRate.stale` domain event is published. Reason: transaction correctness outweighs rate freshness; the event lets downstream code (notifications, audit) decide policy.

### D-TX-5 — Soft-delete filter is non-opt-out

Every category query path (read for selectors, read for transactions joining category, totals grouping) MUST filter `deletedAt IS NULL`. The repository abstraction MUST apply the filter by default, with no escape hatch surfaced to higher layers. Reason: silent re-appearance of soft-deleted categories would corrupt user-facing selectors and totals. The cost of forgetting is high enough that opt-outs are not allowed.

### D-TX-6 — Decimal over BigInt for monetary values

Monetary amounts are Prisma `Decimal` end-to-end. `BigInt` is not used because it silently truncates cents (integer semantic). Trade-off: `Decimal` arithmetic is slightly slower than `BigInt` in tight loops, but the slice is not high-frequency enough for this to matter, and `Decimal` is the correct semantic.

### D-TX-7 — RBAC for transactions actions

Transactions actions (create, update, soft-delete) are gated to role `user` or `admin`. The `admin` role additionally may soft-delete transactions belonging to other users; the `user` role may only mutate its own. The check is enforced in the domain service (per Locked Decision #8 invariant that RBAC is enforced in the domain layer, not the UI). Trade-off documented for `sdd-design`: whether the admin cross-user capability is shipped in this slice or deferred to a later change.

No open questions remain; downstream phases (`sdd-design`, `sdd-tasks`) inherit these decisions.

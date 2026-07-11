Feature: Idempotency-Key on transaction create
  Spec: openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md
  Decision reference: D-TX-1 (dedicated IdempotencyKey table).

  Background:
    Given the application is running

  Scenario: First request with a key persists both rows
    Given a fresh Idempotency-Key header value
    And a non-deleted category exists
    And a valid transaction creation request with header Idempotency-Key: "key-first"
    When the form is submitted
    Then the transaction is persisted
    And an IdempotencyKey row is inserted with the key, the user ID, the request fingerprint, and the cached response payload
    And a Transaction row is inserted

  Scenario: Replayed request returns the same transaction
    Given a non-deleted category exists
    And a valid transaction creation request with header Idempotency-Key: "key-replay"
    When the same request is retried with the same key
    Then no second Transaction row is created
    And both responses refer to the same transaction ID and identical payload
    And no new IdempotencyKey row is created

  Scenario: Different keys create independent transactions
    Given a non-deleted category exists
    And a valid transaction creation request with header Idempotency-Key: "key-A"
    When the user submits the same payload with a different key "key-B"
    Then two distinct transactions are persisted
    And both responses succeed with their respective transaction IDs

  Scenario: Same key with different fingerprint is rejected
    Given a previously cached "user_default", "key-conflict" triple
    When the same key is reused with a different request fingerprint
    Then the request is rejected with a conflict error
    And no state is mutated

  Scenario: Expired key allows a fresh request through
    Given an IdempotencyKey row whose expiresAt is in the past
    When cleanup runs "or a replay is attempted"
    Then the replay is treated as a fresh request
    And the row may be removed by the cleanup procedure

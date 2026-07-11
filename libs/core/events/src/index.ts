/**
 * Public API of @core/events.
 *
 * Feature server slices import `createInMemoryDispatcher` to build a
 * per-request dispatcher (slice 3 wiring lands in T3.5). Consumers
 * narrow on `name` (kebab-case string literal) and validate the
 * payload with the per-event Zod schema from `./types`.
 */

export {
  createInMemoryDispatcher,
  REDACTED_TOKEN_SENTINEL,
  redactSensitive,
  RING_BUFFER_CAPACITY,
  type DispatcherOptions,
  type EventHandler,
  type ErrorSink,
  type InMemoryDispatcher,
} from "./dispatcher";

export {
  AUTH_PASSWORD_RESET_COMPLETED,
  AUTH_PASSWORD_RESET_REQUESTED,
  AUTH_RBAC_DENIED,
  AUTH_SESSION_REVOKED,
  EVENT_NAMES,
  TRANSACTIONS_CREATED,
  TRANSACTIONS_FX_STALE,
  TRANSACTIONS_SOFT_DELETED,
  TRANSACTIONS_THRESHOLD_EXCEEDED,
  TRANSACTIONS_UPDATED,
  authPasswordResetCompletedPayload,
  authPasswordResetRequestedPayload,
  authRbacDeniedPayload,
  authSessionRevokedPayload,
  transactionsCreatedPayload,
  transactionsFxStalePayload,
  transactionsSoftDeletedPayload,
  transactionsThresholdExceededPayload,
  transactionsUpdatedPayload,
  validatePayload,
  type AuthPasswordResetCompletedPayload,
  type AuthPasswordResetRequestedPayload,
  type AuthRbacDeniedPayload,
  type AuthSessionRevokedPayload,
  type DomainEvent,
  type EventName,
  type TransactionsCreatedPayload,
  type TransactionsFxStalePayload,
  type TransactionsSoftDeletedPayload,
  type TransactionsThresholdExceededPayload,
  type TransactionsUpdatedPayload,
} from "./types";

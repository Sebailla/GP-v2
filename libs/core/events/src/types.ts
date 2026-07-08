import { z } from "zod";

/**
 * Catalog of the 9 domain events for gastos-personales-reference,
 * per design §4.7 (auth) + §5.9 (transactions).
 *
 * Each event has:
 *  - `name` (kebab-case, dotted namespace).
 *  - A Zod payload schema declared as the source of truth.
 *  - An inferred TS type.
 *
 * The catalog is consumed by:
 *  - `@core/events/dispatcher` (subscribers narrow on `name`).
 *  - `libs/features/auth/server/events.ts` and the equivalent
 *    transactions events file (slice 3 + slice 5).
 *  - Dev-time introspection in the slice-4 dev mailbox.
 */

const isoDate = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)));

export const AUTH_PASSWORD_RESET_REQUESTED = "auth.password-reset.requested" as const;
export const AUTH_PASSWORD_RESET_COMPLETED = "auth.password-reset.completed" as const;
export const AUTH_SESSION_REVOKED = "auth.session.revoked" as const;
export const AUTH_RBAC_DENIED = "auth.rbac.denied" as const;
export const TRANSACTIONS_CREATED = "transactions.created" as const;
export const TRANSACTIONS_UPDATED = "transactions.updated" as const;
export const TRANSACTIONS_SOFT_DELETED = "transactions.soft-deleted" as const;
export const TRANSACTIONS_FX_STALE = "transactions.fx.stale" as const;
export const TRANSACTIONS_THRESHOLD_EXCEEDED = "transactions.threshold.exceeded" as const;

export const EVENT_NAMES = [
  AUTH_PASSWORD_RESET_REQUESTED,
  AUTH_PASSWORD_RESET_COMPLETED,
  AUTH_SESSION_REVOKED,
  AUTH_RBAC_DENIED,
  TRANSACTIONS_CREATED,
  TRANSACTIONS_UPDATED,
  TRANSACTIONS_SOFT_DELETED,
  TRANSACTIONS_FX_STALE,
  TRANSACTIONS_THRESHOLD_EXCEEDED,
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

// ----- auth.password-reset.requested -------------------------------------
export const authPasswordResetRequestedPayload = z.object({
  userId: z.string().min(1),
  // Raw token is dev-only (slice 4 dev mailbox). The reference repo
  // never persists it; production deployments should remove this
  // field or replace it with a magic-link slug.
  token: z.string().min(32),
  requestedAt: isoDate,
});
export type AuthPasswordResetRequestedPayload = z.infer<
  typeof authPasswordResetRequestedPayload
>;

// ----- auth.password-reset.completed -------------------------------------
export const authPasswordResetCompletedPayload = z.object({
  userId: z.string().min(1),
  resetAt: isoDate,
});
export type AuthPasswordResetCompletedPayload = z.infer<
  typeof authPasswordResetCompletedPayload
>;

// ----- auth.session.revoked ----------------------------------------------
export const authSessionRevokedPayload = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  revokedAt: isoDate,
});
export type AuthSessionRevokedPayload = z.infer<typeof authSessionRevokedPayload>;

// ----- auth.rbac.denied --------------------------------------------------
export const authRbacDeniedPayload = z.object({
  userId: z.string().min(1),
  action: z.string().min(1),
  resourceType: z.string().min(1),
  at: isoDate,
});
export type AuthRbacDeniedPayload = z.infer<typeof authRbacDeniedPayload>;

// ----- transactions.created ---------------------------------------------
export const transactionsCreatedPayload = z.object({
  transactionId: z.string().min(1),
  userId: z.string().min(1),
  amount: z.string().regex(/^-?\d+(\.\d+)?$/),
  currency: z.string().length(3),
  occurredAt: isoDate,
});
export type TransactionsCreatedPayload = z.infer<typeof transactionsCreatedPayload>;

// ----- transactions.updated ---------------------------------------------
export const transactionsUpdatedPayload = z.object({
  transactionId: z.string().min(1),
  userId: z.string().min(1),
  changedFields: z.array(z.string()),
  at: isoDate,
});
export type TransactionsUpdatedPayload = z.infer<typeof transactionsUpdatedPayload>;

// ----- transactions.soft-deleted ----------------------------------------
export const transactionsSoftDeletedPayload = z.object({
  transactionId: z.string().min(1),
  userId: z.string().min(1),
  at: isoDate,
});
export type TransactionsSoftDeletedPayload = z.infer<
  typeof transactionsSoftDeletedPayload
>;

// ----- transactions.fx.stale --------------------------------------------
export const transactionsFxStalePayload = z.object({
  from: z.string().length(3),
  to: z.string().length(3),
  recordedAt: isoDate,
  observedAt: isoDate,
  ageHours: z.number().nonnegative(),
});
export type TransactionsFxStalePayload = z.infer<typeof transactionsFxStalePayload>;

// ----- transactions.threshold.exceeded ----------------------------------
export const transactionsThresholdExceededPayload = z.object({
  userId: z.string().min(1),
  categoryId: z.string().min(1),
  threshold: z.string().regex(/^\d+(\.\d+)?$/),
  total: z.string().regex(/^\d+(\.\d+)?$/),
  observedAt: isoDate,
});
export type TransactionsThresholdExceededPayload = z.infer<
  typeof transactionsThresholdExceededPayload
>;

// ----- DomainEvent envelope ---------------------------------------------
/**
 * The wire-shape of a dispatched event. `payload` is intentionally
 * typed as `unknown` at the envelope level — subscribers narrow by
 * `name` and then cast / re-validate with the per-event schema. This
 * keeps the dispatcher free of per-event schema imports.
 */
export interface DomainEvent {
  readonly name: EventName;
  readonly userId?: string;
  readonly payload: unknown;
  readonly occurredAt: Date;
}

/**
 * Validate an arbitrary object against a per-event payload schema.
 * Useful at the boundary (e.g., the dev mailbox) where the wire-shape
 * is loose.
 */
export function validatePayload<T extends z.ZodTypeAny>(
  name: EventName,
  schema: T,
  payload: unknown
): z.infer<T> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Invalid payload for event "${name}": ${result.error.message}`);
  }
  return result.data;
}
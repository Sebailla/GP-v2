import type { DomainEvent } from "@core/events";

/**
 * Auth-slice event types — slice 3 (batches 3, 4, 6).
 *
 * The four events this slice emits:
 *
 *  1. `auth.password-reset.requested` (Pattern A —
 *     `PasswordResetService.requestReset` dispatches directly via the
 *     constructor-injected dispatcher)
 *       Payload: `{ userId: string, token: string (raw, dev only),
 *       requestedAt: Date }`
 *
 *  2. `auth.password-reset.completed` (Pattern A —
 *     `PasswordResetService.consumeReset` dispatches directly)
 *       Payload: `{ userId: string, resetAt: Date }`
 *
 *  3. `auth.session.revoked` (Pattern A as of slice 3 batch 6 —
 *     `SessionService.revokeSession(token, userId)` dispatches directly)
 *       Payload: `{ userId: string, sessionId: string, revokedAt: Date }`
 *     `userId` is supplied by the caller (the NestJS controller, after
 *     decoding the JWT-decoded session).
 *
 *  4. `auth.rbac.denied` (Pattern A as of slice 3 batch 6 —
 *     `RbacService.can()` dispatches directly on `false` outcome)
 *       Payload: `{ userId: string, action: string, resourceType: string,
 *       at: Date }`
 *
 * Pattern A everywhere: each service takes the dispatcher in its
 * constructor and dispatches directly. The slice 3 batch 3 monkey-patch
 * wrapper `wireAuthEvents` is REMOVED in slice 3 batch 6 (per the brief
 * drop-wireauth-events sub-task) — there is no longer a global
 * "wire after construction" step.
 *
 * The four events above are validated by the canonical Zod payload
 * schemas in `libs/core/events/src/types.ts`; this file is a consumer,
 * not the source of truth.
 */

/**
 * The dispatcher contract this slice assumes. Matches the `.dispatch`
 * method of `InMemoryDispatcher` from `@core/events`; tests inject a
 * `vi.fn()` with the same shape.
 */
export type AuthEventDispatcher = (event: DomainEvent) => Promise<void> | void;

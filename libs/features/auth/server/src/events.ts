import type { DomainEvent } from "@core/events";

import type { RbacService } from "./rbac-service.js";
import type { SessionService } from "./session-service.js";

/**
 * Events wiring for the auth slice — slice 3 (batches 3 + 4).
 *
 * Wires the four auth-slice events to the `@core/events` dispatcher.
 * The canonical Zod-validated payload schemas live at
 * `libs/core/events/src/types.ts` (this file is a consumer, not the
 * source of truth); the four events this slice emits are:
 *
 *  1. `auth.password-reset.requested` (PasswordResetService.request
 *     Reset, dispatched directly via the constructor-injected
 *     dispatcher — see Pattern A below)
 *       Payload: `{ userId: string, token: string (raw, dev only),
 *       requestedAt: Date }`
 *     — see `@core/events/types.ts#authPasswordResetRequested
 *     Payload`.
 *
 *  2. `auth.password-reset.completed` (PasswordResetService.consume
 *     Reset, dispatched directly via the constructor-injected
 *     dispatcher — Pattern A)
 *       Payload: `{ userId: string, resetAt: Date }`
 *     — see `@core/events/types.ts#authPasswordResetCompleted
 *     Payload`.
 *
 *  3. `auth.session.revoked` (monkey-patched via `wireAuthEvents` +
 *     `wrapRevokeSession` — SessionService.revokeSession)
 *       Payload: `{ userId: string, sessionId: string, revokedAt:
 *       Date }`
 *     — see `@core/events/types.ts#authSessionRevokedPayload`.
 *     The userId is recovered via `sessionService.getCurrentUser
 *     (sessionToken)` BEFORE the delete; the wrapper re-throws
 *     without dispatching if the lookup fails.
 *
 *  4. `auth.rbac.denied` (monkey-patched via `wireAuthEvents` +
 *     `wrapRbacCan` — RbacService.can returning `false`)
 *       Payload: `{ userId: string, action: string, resourceType:
 *       string, at: Date }`
 *     — see `@core/events/types.ts#authRbacDeniedPayload`. The
 *     wrapper preserves the original's pure semantics — same inputs,
 *     same outputs, dispatch is a side effect of the `false` path.
 *
 * Pattern A vs Pattern B dispatch: the canonical design §4.1 says
 * "PasswordResetService... dispatches". Pattern A — adopted here —
 * has the service take the dispatcher in its constructor and
 * dispatch directly. `wireAuthEvents` is unchanged for the slice 3
 * batch 3 events (SessionService.revokeSession + RbacService.can);
 * the slice 3 batch 5+ cleanup would refactor those services to
 * dispatch directly too (single source of truth, no public-method
 * wrapping). The batch 4 dispatch path lands here as a
 * counter-example — `PasswordResetService` is constructed WITH the
 * dispatcher and does NOT need (or want) a wrapper.
 *
 * The function is a setup hook: callers wire it once at NestJS
 * module boot (or per-request when using a per-request dispatcher)
 * and never call it again. Re-calling it on the same instance would
 * double-wrap (each call re-binds `original` to the previous wrapped
 * function); callers must own the dispatcher instance lifecycle.
 *
 * See `libs/core/events/src/types.ts` for the authoritative Zod
 * schemas; do NOT duplicate the payload shapes here.
 */

/**
 * The dispatcher contract this wiring assumes. Matches the `.dispatch`
 * method of `InMemoryDispatcher` from `@core/events`; tests inject a
 * `vi.fn()` with the same shape.
 */
export type AuthEventDispatcher = (event: DomainEvent) => Promise<void> | void;

export function wireAuthEvents(
  sessionService: SessionService,
  rbacService: RbacService,
  dispatcher: AuthEventDispatcher,
): void {
  wrapRevokeSession(sessionService, dispatcher);
  wrapRbacCan(rbacService, dispatcher);
}

// ---------------------------------------------------------------------------
// SessionService.revokeSession → auth.session.revoked
// ---------------------------------------------------------------------------

function wrapRevokeSession(
  sessionService: SessionService,
  dispatcher: AuthEventDispatcher,
): void {
  const original = sessionService.revokeSession.bind(sessionService);

  sessionService.revokeSession = async (sessionToken: string): Promise<void> => {
    // 1. Recover the userId via the public lookup. If the session is
    //    unknown or expired, this throws AuthError — we re-throw and
    //    skip the dispatch (no successful revocation → no event).
    const currentUser = await sessionService.getCurrentUser(sessionToken);

    // 2. Delegate to the original implementation. If `delete` fails
    //    (Prisma P2025 → AuthError INVALID_SESSION, or any other
    //    Prisma error), we re-throw and skip the dispatch — same
    //    rationale as step 1.
    await original(sessionToken);

    // 3. Dispatch the event. `occurredAt` is the envelope's mandatory
    //    timestamp (drives ring-buffer ordering); `userId` at the
    //    envelope level routes the event into the per-user buffer used
    //    by the dev mailbox (slice 4).
    dispatcher({
      name: "auth.session.revoked",
      userId: currentUser.id,
      payload: {
        userId: currentUser.id,
        sessionId: sessionToken,
        revokedAt: new Date(),
      },
      occurredAt: new Date(),
    });
  };
}

// ---------------------------------------------------------------------------
// RbacService.can → auth.rbac.denied (on `false` only)
// ---------------------------------------------------------------------------

function wrapRbacCan(rbacService: RbacService, dispatcher: AuthEventDispatcher): void {
  const original = rbacService.can.bind(rbacService);

  rbacService.can = (actor, action, resource): boolean => {
    const allowed = original(actor, action, resource);
    if (!allowed) {
      dispatcher({
        name: "auth.rbac.denied",
        userId: actor.id,
        payload: {
          userId: actor.id,
          action,
          resourceType: resource.kind,
          at: new Date(),
        },
        occurredAt: new Date(),
      });
    }
    return allowed;
  };
}
import type { DomainEvent } from "@core/events";

import type { RbacService } from "./rbac-service.js";
import type { SessionService } from "./session-service.js";

/**
 * Events wiring — slice 3 batch 3 (brief T3.5 GREEN).
 *
 * Wires two auth-slice events to the `@core/events` dispatcher:
 *
 *  1. `SessionService.revokeSession(sessionToken)` →
 *     `auth.session.revoked` with payload
 *     `{ userId, sessionToken, revokedAt: Date }`.
 *
 *  2. `RbacService.can(actor, action, resource)` returning `false` →
 *     `auth.rbac.denied` with payload
 *     `{ userId: actor.id, action, resourceKind: resource.kind, deniedAt: Date }`.
 *
 * The two `auth.password-reset.*` events land with
 * `PasswordResetService` in slice 3 batch 4+.
 *
 * Implementation pattern (the **monkey-patch**):
 *
 *   - `SessionService.revokeSession` is replaced on the passed
 *     instance so the dispatcher fires AFTER a successful delete. The
 *     userId is recovered by calling the public
 *     `sessionService.getCurrentUser(token)` lookup BEFORE the delete
 *     — if that lookup throws (invalid / expired token) the wrapper
 *     re-throws without dispatching. This keeps the lookup inside the
 *     wrapper rather than reaching into the service's private
 *     `prisma` instance.
 *
 *   - `RbacService.can` is replaced on the passed instance so the
 *     dispatcher fires when (and only when) the decision returns
 *     `false`. The wrapper preserves the original's pure-function
 *     semantics: same inputs, same outputs, the dispatch is a side
 *     effect of the `false` path.
 *
 * This is **intentionally a pragmatic monkey-patch for this slice** —
 * the canonical refactor (slice 3 batch 4+) is to make
 * `SessionService.revokeSession` and `RbacService.can` take a
 * dispatcher directly so the dispatch is the service's responsibility
 * (single source of truth, no public-method wrapping).
 *
 * The function is a setup hook: callers wire it once at NestJS
 * module boot (or per-request when using a per-request dispatcher)
 * and never call it again. Re-calling it on the same instance would
 * double-wrap (each call re-binds `original` to the previous wrapped
 * function); callers must own the dispatcher instance lifecycle.
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
        sessionToken,
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
          resourceKind: resource.kind,
          deniedAt: new Date(),
        },
        occurredAt: new Date(),
      });
    }
    return allowed;
  };
}
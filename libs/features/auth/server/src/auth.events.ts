/**
 * Auth-slice event registry + per-event TypeScript payload types
 * (module-3-superadmin — task 2.4 GREEN).
 *
 * The slice previously shipped event constants and dispatcher wiring
 * under `events.ts` (re-export of `AuthEventDispatcher`). PR #1
 * (module-3-superadmin, task 1.4) added the `auth.role.changed`
 * event at `@core/events/src/types.ts` — the canonical catalog —
 * but the slice consumed it without its own typed registry, and
 * the payload shape lived only at the consumer (`RbacService`).
 *
 * Phase 2 (this file) widens the slice with:
 *   1. `AUTH_EVENTS` — a readonly array of the five event names this
 *      slice owns. The dev mailbox subscriber (slice 4) and the
 *      admin audit subscriber (PR #3 of M3) iterate / narrow on this
 *      union instead of importing the broader `@core/events`
 *      catalog. Closed union — adding a new event means extending
 *      this array AND `@core/events/src/types.ts`.
 *   2. Local TS types for the two admin events whose payloads are
 *      produced by this slice's services:
 *        - `AuthSessionRevokedEvent` — the M3 admin revoke path
 *          payload `{ actorId, targetUserId, sessionId, ipAddress,
 *          userAgent, revokedAt }`. The previous slice-3 dispatcher
 *          used the narrower `{ userId, sessionId, revokedAt }`
 *          payload; the M3 widening adds admin attribution +
 *          network context (per design §3.2 and the IP+UA threat
 *          matrix row in §7).
 *        - `AuthRoleChangedEvent` — parity with
 *          `authRoleChangedPayload` in `@core/events/src/types.ts`.
 *          Declared again here so consumers can import the type
 *          without crossing into `@core/events`. The Zod schema is
 *          still the source of truth — this is the inferred TS view.
 *
 * Public surface:
 *   - `AUTH_EVENTS` array of names.
 *   - `AuthSessionRevokedEvent` and `AuthRoleChangedEvent` types.
 *
 * Re-exports `AuthEventDispatcher` from `events.ts` so existing
 * consumers keep their single import path (`from "../auth.events.js"`
 * OR `from "../events.js"` — both work, the dispatcher is the same
 * type either way).
 */

import type { AuthEventDispatcher } from "./events.js";

// ---------------------------------------------------------------------------
// Registry — `AUTH_EVENTS`
// ---------------------------------------------------------------------------

/**
 * The five event names the auth slice owns. Order is the order they
 * landed across the slice's history (slice 3 batch 3 → batch 4 → M3
 * tasks 1.4 + 2.4). The literal types propagate via
 * `(typeof AUTH_EVENTS)[number]` so `AuthEventName` narrows to a
 * closed string-literal union.
 */
export const AUTH_EVENTS = [
  "auth.password-reset.requested",
  "auth.password-reset.completed",
  "auth.session.revoked",
  "auth.rbac.denied",
  "auth.role.changed",
] as const;

export type AuthEventName = (typeof AUTH_EVENTS)[number];

// ---------------------------------------------------------------------------
// Per-event payload types (TS view; Zod schemas in @core/events are source
// of truth).
// ---------------------------------------------------------------------------

/**
 * Payload for `auth.session.revoked` (M3 widening of the slice-3 payload).
 *
 * The M3 admin revoke path carries the *actor* (the admin who initiated
 * the revoke), the *target* (the user whose session is gone), the
 * session ID, the network context (IP + UA captured at the controller
 * boundary per design D3), and the timestamp. The slice-3 / PR #1
 * baseline emitted only `{ userId, sessionId, revokedAt }`; this
 * widening is the moment when admin attribution + network context
 * land on the event. The slice-3 consumers (dev mailbox) ignore the
 * extra fields; the M3 admin audit subscriber uses them.
 *
 * Field semantics:
 *   - `actorId`      — id of the admin initiating the revoke. Set by
 *                      the controller from the JWT-decoded session.
 *   - `targetUserId` — owner of the session that was just revoked.
 *                      Equal to `userId` on the slice-3 payload; the
 *                      rename makes the asymmetry explicit (admin
 *                      revokes another user's session).
 *   - `sessionId`    — the session row's primary key (`Session.id`).
 *   - `ipAddress`    — the admin actor's `req.ip` (≤45 chars per
 *                      AdminAuditEvent column). `null` when the
 *                      client connects via a path where `req.ip` is
 *                      unavailable (PR #3 captures this directly).
 *   - `userAgent`    — the admin actor's `req.headers['user-agent']`
 *                      (truncated to 512 chars at the controller
 *                      boundary per design §7).
 *   - `revokedAt`    — timestamp of the revoke action. Server-side
 *                      clock; the audit row's `createdAt` is the
 *                      row-of-record (same value modulo clock skew
 *                      between dispatcher + DB insert).
 */
export interface AuthSessionRevokedPayload {
  readonly actorId: string;
  readonly targetUserId: string;
  readonly sessionId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly revokedAt: Date;
}

/**
 * Envelope of an `auth.session.revoked` event. Carries the canonical
 * `DomainEvent` envelope fields (`name`, `userId`, `payload`,
 * `occurredAt`) — declared here so the M3 admin subscriber (PR #3)
 * can type its handler signature without importing the broader
 * `@core/events` types module.
 */
export interface AuthSessionRevokedEvent {
  readonly name: "auth.session.revoked";
  readonly userId: string; // actorId — see note on AuthSessionRevokedPayload
  readonly payload: AuthSessionRevokedPayload;
  readonly occurredAt: Date;
}

/**
 * Payload for `auth.role.changed` (parity with
 * `authRoleChangedPayload` in `@core/events/src/types.ts`). Re-declared
 * here so M3 consumers can import the TS view from the slice without
 * crossing modules.
 */
export interface AuthRoleChangedPayload {
  readonly actorId: string;
  readonly targetUserId: string;
  readonly fromRole: "USER" | "ADMIN";
  readonly toRole: "USER" | "ADMIN";
}

export interface AuthRoleChangedEvent {
  readonly name: "auth.role.changed";
  readonly userId: string; // actorId
  readonly payload: AuthRoleChangedPayload;
  readonly occurredAt: Date;
}

// Re-export so consumers can import everything from one path
// (`from "../auth.events.js"`).
export type { AuthEventDispatcher };

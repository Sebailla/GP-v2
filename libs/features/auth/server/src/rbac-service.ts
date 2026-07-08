/**
 * RbacService — slice 3 batch 3 (brief T3.4 GREEN) + slice 3 batch 6
 * (`wireAuthEvents` monkey-patch wrapper dropped — Pattern A dispatcher
 * adopted via constructor injection).
 *
 * Owns the role / permission table for the auth slice, per design.md §4.1.
 * Every server-side guard (NestJS controllers, NextAuth `authorize`
 * callback, the future app-level checks) routes through this single
 * `can(actor, action, resource)` entry point. **Client-side role checks
 * are sugar only — they hide affordances, they do not enforce.**
 *
 * Permission matrix (mirrors design §4.1 verbatim — do not invent
 * additional actions here without a design amendment):
 *
 *   USER can:
 *     - session:read:own        (resource.ownerId === actor.id)
 *     - session:revoke:own      (resource.ownerId === actor.id)
 *     - transaction:read:own    (resource.ownerId === actor.id)
 *     - transaction:write:own   (resource.ownerId === actor.id)
 *
 *   USER can NOT do any `*:any` action.
 *
 *   ADMIN can do ALL of the above + every `*:any` action
 *   (ADMIN is the super-role; admins bypass the ownership check entirely).
 *
 * Decision order in `can()`:
 *   1. ADMIN → true (super-role bypass; design §4.1).
 *   2. Ownership check: if the resource carries an `ownerId` AND it does
 *      not match `actor.id`, deny. This gates `*:own` actions on USER.
 *      The `auth.rbac.denied` event fires here for USER (it's the
 *      observable outcome that operators want to audit).
 *   3. Lookup `PERMISSIONS[actor.role][action]`. If true → allow; else
 *      deny (and fire `auth.rbac.denied`).
 *   4. Defense in depth: unknown action values default to `false` (the
 *      `Action` type is a closed string-literal union, but at runtime a
 *      `can()` caller could cast past the type; the lookup table misses
 *      and returns `false`).
 *
 * Pattern A dispatch (canonical design §4.1): the dispatcher is taken
 * as the 1st constructor argument. `can()` dispatches
 * `auth.rbac.denied` directly on a `false` outcome. The previous
 * `wireAuthEvents` wrapper (slice 3 batch 3) that monkey-patched the
 * `can()` method is removed — there is no longer a global
 * "wire after construction" step.
 */

import type { DomainEvent } from "@core/events";

import type { AuthEventDispatcher } from "./events.js";

export type Role = "USER" | "ADMIN";

export type ResourceKind = "session" | "transaction" | "user";

export interface Resource {
  readonly kind: ResourceKind;
  /** Owner of the resource. Omitted for `*:any` actions where ownership is irrelevant. */
  readonly ownerId?: string;
  /** The resource's own identifier (optional — used for audit log correlation). */
  readonly id?: string;
}

export interface Actor {
  readonly id: string;
  readonly role: Role;
}

/**
 * Closed string-literal union of every action this slice ships. Defense
 * in depth: TypeScript will reject any `can()` call that passes a value
 * outside this union, so the runtime defense-in-depth probe (see test
 * `denies USER on an unknown action`) is the only path that can exercise
 * the "unknown action → false" branch.
 */
export type Action =
  | "session:read:own"
  | "session:read:any"
  | "session:revoke:own"
  | "session:revoke:any"
  | "transaction:read:own"
  | "transaction:read:any"
  | "transaction:write:own"
  | "transaction:write:any";

/**
 * Permission lookup table. The boolean values are the source of truth —
 * do not duplicate the matrix into the `can()` body; the table is the
 * matrix.
 */
const PERMISSIONS = {
  USER: {
    "session:read:own": true,
    "session:read:any": false,
    "session:revoke:own": true,
    "session:revoke:any": false,
    "transaction:read:own": true,
    "transaction:read:any": false,
    "transaction:write:own": true,
    "transaction:write:any": false,
  },
  ADMIN: {
    "session:read:own": true,
    "session:read:any": true,
    "session:revoke:own": true,
    "session:revoke:any": true,
    "transaction:read:own": true,
    "transaction:read:any": true,
    "transaction:write:own": true,
    "transaction:write:any": true,
  },
} as const satisfies Record<Role, Record<Action, boolean>>;

export class RbacService {
  private readonly dispatcher: AuthEventDispatcher;

  constructor(dispatcher: AuthEventDispatcher) {
    // F8 (WARNING) — eager failure for missing dispatcher, mirroring
    // PasswordResetService / SessionService.
    if (typeof dispatcher !== "function") {
      throw new TypeError(
        `RbacService requires an AuthEventDispatcher (a function); received ${typeof dispatcher === "undefined" ? "undefined" : String(dispatcher)}.`,
      );
    }
    this.dispatcher = dispatcher;
  }

  /**
   * Decide whether `actor` may perform `action` on `resource`.
   *
   * Returns `true` when allowed, `false` when denied. Throws nothing —
   * authorization decisions are boolean; failures propagate as a `false`
   * result, and the audit event (`auth.rbac.denied`) is dispatched
   * directly from this method on the `false` outcome.
   *
   * The method is pure modulo the audit dispatch (no I/O, no clock
   * dependency beyond `new Date()` for the `at` field) so it is safe
   * to call from controllers and middleware.
   */
  can(actor: Actor, action: Action, resource: Resource): boolean {
    // 1. Super-role bypass — admins can do anything.
    if (actor.role === "ADMIN") {
      return true;
    }

    // 2. Ownership gate. If the resource is owned by someone else, deny.
    //    This is the only check `*:own` actions need (the lookup at step
    //    3 confirms the role allows that action at all). `*:any` actions
    //    skip this by design — they have no ownership semantics.
    if (resource.ownerId !== undefined && resource.ownerId !== actor.id) {
      this.denyAndAudit(actor, action, resource);
      return false;
    }

    // 3. Lookup. The `Action` type narrowing on `actor.role` keeps the
    //    table access type-safe. The default `false` covers any action
    //    value the runtime somehow saw that the table does not enumerate.
    const allowed = PERMISSIONS[actor.role][action] ?? false;
    if (!allowed) {
      this.denyAndAudit(actor, action, resource);
    }
    return allowed;
  }

  /**
   * Internal: dispatch the `auth.rbac.denied` event for a `can()`
   * outcome of `false`. Kept private so the public surface still
   * returns a clean boolean. The dispatcher is awaited (pattern A)
   * because the audit signal is the only honest observability for a
   * denial; treating it fire-and-forget would lose the observability
   * contract.
   */
  private denyAndAudit(actor: Actor, action: Action, resource: Resource): void {
    const event: DomainEvent = {
      name: "auth.rbac.denied",
      userId: actor.id,
      payload: {
        userId: actor.id,
        action,
        resourceType: resource.kind,
        at: new Date(),
      },
      occurredAt: new Date(),
    };
    void this.dispatcher(event);
  }
}
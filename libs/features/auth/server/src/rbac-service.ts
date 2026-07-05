/**
 * RbacService — slice 3 batch 3 (brief T3.4 GREEN).
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
 *   3. Lookup `PERMISSIONS[actor.role][action]`. If true → allow; else deny.
 *   4. Defense in depth: unknown action values default to `false` (the
 *      `Action` type is a closed string-literal union, but at runtime a
 *      `can()` caller could cast past the type; the lookup table misses
 *      and returns `false`).
 *
 * The class takes no constructor arguments — it is a pure decision
 * function with no I/O. Events emitted on denial (the `auth.rbac.denied`
 * audit event) live in `events.ts` (T3.5), which monkey-patches the
 * `can()` method to dispatch on `false`. The monkey-patch is intentional
 * for this slice; slice 3 batch 4+ refactors `can()` to take a
 * dispatcher parameter directly (single source of truth).
 */

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
  /**
   * Decide whether `actor` may perform `action` on `resource`.
   *
   * Returns `true` when allowed, `false` when denied. Throws nothing —
   * authorization decisions are boolean; failures propagate as a `false`
   * result, and the audit event (`auth.rbac.denied`) is dispatched from
   * the `events.ts` wrapper, not from this method.
   *
   * The method is pure (no I/O, no clock dependency, no allocation in
   * the hot path) so it is safe to call from controllers and middleware.
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
      return false;
    }

    // 3. Lookup. The `Action` type narrowing on `actor.role` keeps the
    //    table access type-safe. The default `false` covers any action
    //    value the runtime somehow saw that the table does not enumerate.
    return PERMISSIONS[actor.role][action] ?? false;
  }
}
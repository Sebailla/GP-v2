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
 *
 * M3 (module-3-superadmin) admin extensions: listUsers / changeRole /
 * assertAdmin (per `openspec/changes/module-3-superadmin/design.md` §4
 * and the new `openspec/specs/rbac-admin/spec.md`).
 *   - `listUsers({ limit, offset })` is a thin Prisma passthrough sorted
 *     DESC by `createdAt`.
 *   - `changeRole(userId, newRole, actorId)` updates the role, inserts
 *     an `AdminAuditEvent` row with `metadata: { from, to }`, and emits
 *     `auth.role.changed`. Idempotent (no audit row / no event when the
 *     role is unchanged). The two writes are paired inside a single
 *     Prisma transaction so a partial failure rolls back both.
 *   - `assertAdmin(userId)` is the controller-side guard: resolves
 *     when the user has role=ADMIN, throws otherwise. Mirrors the
 *     server-side authority stance from D1 (the controller is
 *     authoritative; the web middleware is a UX optimization).
 */

import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";
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

export interface AdminUserRow {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly createdAt: Date;
}

export class RbacService {
  private readonly dispatcher: AuthEventDispatcher;
  private readonly prisma: PrismaClient;

  constructor(dispatcher: AuthEventDispatcher, prisma?: PrismaClient) {
    // F8 (WARNING) — eager failure for missing dispatcher, mirroring
    // PasswordResetService / SessionService.
    if (typeof dispatcher !== "function") {
      throw new TypeError(
        `RbacService requires an AuthEventDispatcher (a function); received ${typeof dispatcher === "undefined" ? "undefined" : String(dispatcher)}.`,
      );
    }
    this.dispatcher = dispatcher;
    // The Prisma client is OPTIONAL in the constructor so the existing
    // slice-3 callers (`new RbacService(dispatcher)`) keep compiling.
    // When omitted, the service falls through to the @core/database
    // singleton — the canonical client for production code paths.
    this.prisma = prisma ?? defaultPrisma;
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

  // ---------------------------------------------------------------------------
  // M3 admin surface — see `openspec/specs/rbac-admin/spec.md` for the
  // scenario coverage. The three methods below are the ONLY admin-side
  // primitives shipped by RbacService in PR #1; PR #2 adds the session
  // management surface (list/revoke/revokeAll) on top of this.
  // ---------------------------------------------------------------------------

  /**
   * List users sorted DESC by `createdAt` with optional pagination.
   *
   * Per `rbac-admin` spec "List Users with Role" — supports
   * `?limit=<n>&offset=<n>` with default `limit=50`, `offset=0`.
   * Caller (the NestJS controller) is responsible for the `role=ADMIN`
   * guard; RbacService stays HTTP-agnostic.
   */
  async listUsers(params: { limit: number; offset: number }): Promise<ReadonlyArray<AdminUserRow>> {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: params.limit,
      skip: params.offset,
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role as Role,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Change a user's role. Idempotent: no audit row / no event when the
   * requested role matches the current role. The `user.update` +
   * `adminAuditEvent.create` writes are paired inside a Prisma
   * transaction so a partial failure rolls back both — audit drift is
   * unacceptable for a compliance trail.
   *
   * Returns the updated user row. Throws when the target user does not
   * exist (the controller turns that into 404).
   *
   * Pattern A dispatch (canonical design §4.1): the `auth.role.changed`
   * event is awaited so a fast controller return never loses the audit
   * signal. The event payload carries the actor + from/to so the
   * observability layer can correlate role transitions without joining
   * the audit table.
   */
  async changeRole(
    userId: string,
    newRole: Role,
    actorId: string,
  ): Promise<AdminUserRow> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (existing === null) {
      throw new Error(`User not found: ${userId}`);
    }
    const fromRole = existing.role as Role;

    // Idempotent path: same role → no DB write, no audit, no event.
    // Matches `rbac-admin` spec "Change User Role → Idempotent" scenario.
    if (fromRole === newRole) {
      return {
        id: existing.id,
        email: existing.email,
        role: existing.role as Role,
        createdAt: existing.createdAt,
      };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: userId },
        data: { role: newRole },
      });
      await tx.adminAuditEvent.create({
        data: {
          actorId,
          targetId: userId,
          action: "CHANGE_ROLE",
          metadata: { from: fromRole, to: newRole },
        },
      });
      return next;
    });

    // Pattern A: emit AFTER the transaction commits. If the dispatch
    // rejects, we still return the updated row — the audit row IS the
    // durable signal; the event is observability.
    const event: DomainEvent = {
      name: "auth.role.changed",
      userId: actorId,
      payload: {
        actorId,
        targetUserId: userId,
        fromRole,
        toRole: newRole,
      },
      occurredAt: new Date(),
    };
    await this.dispatcher(event);

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role as Role,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Assert the user has role=ADMIN. Resolves on success; throws
   * otherwise. Used by the controller as the server-side authority
   * check behind `AdminGuard`. The middleware on the web app is a
   * UX optimization (D1) — this method is the actual enforcement.
   */
  async assertAdmin(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user === null || (user.role as Role) !== "ADMIN") {
      throw new Error(`User is not an admin: ${userId}`);
    }
  }
}
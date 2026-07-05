import { describe, it, expect } from "vitest";

import type { Action } from "../rbac-service.js";

/**
 * TDD contract for RbacService (slice 3 batch 3 / brief T3.4 RED).
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/design.md` §4.1
 * (`RbacService` owns the role/permission table; every server-side guard
 * routes through `RbacService.can(user, action, resource)`) and the auth
 * spec's "RBAC Roles Enforced in the Domain Layer" requirement.
 *
 * Permission matrix (per the brief, mirroring design §4.1 exactly):
 *  - USER can:
 *      - `session:read:own`        (resource.ownerId === actor.id)
 *      - `session:revoke:own`      (resource.ownerId === actor.id)
 *      - `transaction:read:own`    (resource.ownerId === actor.id)
 *      - `transaction:write:own`   (resource.ownerId === actor.id)
 *  - USER can NOT do any `*:any` action.
 *  - ADMIN can do ALL of the above + every `*:any` action
 *    (ADMIN is the super-role; admins bypass the ownership check).
 *
 * `Resource` carries `ownerId` (the user that owns the row) so the
 * ownership check is expressed at the resource level rather than the
 * actor level — this keeps the policy uniform across kinds (session,
 * transaction, user).
 *
 * Public contract pinned by these tests:
 *  - can(actor, action, resource): boolean
 *      true  → the actor is allowed to perform the action on the resource
 *      false → denied
 *
 * RED state: rbac-service.js does NOT exist yet. The dynamic imports
 * inside each `it` block throw ERR_MODULE_NOT_FOUND. Every test fails
 * for the expected "feature missing" reason (TypeError on import), not
 * because the assertions themselves are wrong.
 *
 * The dispatcher mock is NOT needed here — RbacService is a pure
 * decision function. The event dispatch on denial lives in T3.5
 * (`events.ts`) which wires `can()`'s `false` outcome to
 * `auth.rbac.denied`.
 */

describe("RbacService", () => {
  describe("USER role", () => {
    it("allows session:read:own on own session", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rbac = new RbacService();

      const allowed = rbac.can(
        { id: "user-1", role: "USER" },
        "session:read:own",
        { kind: "session", ownerId: "user-1", id: "session-1" },
      );

      expect(allowed).toBe(true);
    });

    it("denies session:read:own on someone else's session", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rbac = new RbacService();

      const allowed = rbac.can(
        { id: "user-1", role: "USER" },
        "session:read:own",
        { kind: "session", ownerId: "user-2", id: "session-2" },
      );

      expect(allowed).toBe(false);
    });

    it("denies session:read:any (cross-user read)", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rbac = new RbacService();

      const allowed = rbac.can(
        { id: "user-1", role: "USER" },
        "session:read:any",
        { kind: "session", ownerId: "user-2", id: "session-2" },
      );

      expect(allowed).toBe(false);
    });

    it("allows session:revoke:own on own session", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rbac = new RbacService();

      const allowed = rbac.can(
        { id: "user-1", role: "USER" },
        "session:revoke:own",
        { kind: "session", ownerId: "user-1", id: "session-1" },
      );

      expect(allowed).toBe(true);
    });

    it("denies session:revoke:any (cross-user revoke)", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rbac = new RbacService();

      const allowed = rbac.can(
        { id: "user-1", role: "USER" },
        "session:revoke:any",
        { kind: "session", ownerId: "user-2", id: "session-2" },
      );

      expect(allowed).toBe(false);
    });

    it("allows transaction:read:own on own transaction", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rbac = new RbacService();

      const allowed = rbac.can(
        { id: "user-1", role: "USER" },
        "transaction:read:own",
        { kind: "transaction", ownerId: "user-1", id: "tx-1" },
      );

      expect(allowed).toBe(true);
    });

    it("denies transaction:read:any (cross-user read)", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rbac = new RbacService();

      const allowed = rbac.can(
        { id: "user-1", role: "USER" },
        "transaction:read:any",
        { kind: "transaction", ownerId: "user-2", id: "tx-2" },
      );

      expect(allowed).toBe(false);
    });
  });

  describe("ADMIN role", () => {
    it("allows session:read:any on someone else's session", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rbac = new RbacService();

      const allowed = rbac.can(
        { id: "admin-1", role: "ADMIN" },
        "session:read:any",
        { kind: "session", ownerId: "user-2", id: "session-2" },
      );

      expect(allowed).toBe(true);
    });

    it("allows session:revoke:any (cross-user revoke)", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rbac = new RbacService();

      const allowed = rbac.can(
        { id: "admin-1", role: "ADMIN" },
        "session:revoke:any",
        { kind: "session", ownerId: "user-2", id: "session-2" },
      );

      expect(allowed).toBe(true);
    });

    it("allows session:read:own on own session (admins also own resources)", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rbac = new RbacService();

      const allowed = rbac.can(
        { id: "admin-1", role: "ADMIN" },
        "session:read:own",
        { kind: "session", ownerId: "admin-1", id: "session-1" },
      );

      expect(allowed).toBe(true);
    });
  });

  describe("defense in depth", () => {
    it("denies USER on an unknown action at runtime (cast past the type)", async () => {
      const { RbacService } = await import("../rbac-service.js");
      const rbac = new RbacService();

      // Cast past the literal-union `Action` type to simulate an attacker
      // calling `can()` with a fabricated action name. The lookup table
      // must return `false` for any value not explicitly granted.
      const allowed = rbac.can(
        { id: "user-1", role: "USER" },
        "session:promote:any" as Action,
        { kind: "session", ownerId: "user-1", id: "session-1" },
      );

      expect(allowed).toBe(false);
    });
  });
});
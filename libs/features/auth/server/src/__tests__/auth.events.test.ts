import { describe, it, expect } from "vitest";

/**
 * TDD contract for the auth-slice event registry union (module-3-superadmin —
 * task 2.3 RED).
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §4 and §5, the
 * auth slice grows a typed registry of its owned event names so consumer
 * code (the dev mailbox subscriber, the admin audit subscriber in PR #3)
 * can iterate / narrow on the slice's event set without importing the
 * broader `@core/events` catalog.
 *
 * The registry contract pinned by these tests:
 *  - `AUTH_EVENTS` is a readonly array of strings.
 *  - It includes the two NEW M3 events: `auth.session.revoked` (M3 task
 *    2.4 — payload now carries `{actorId, targetUserId, sessionId,
 *    ipAddress, userAgent}` and admin revokes are emitted by the
 *    controller path through SessionService), and `auth.role.changed`
 *    (M3 task 1.4 GREEN — already implemented in PR #1 by RbacService).
 *  - Pre-existing slice events (`auth.password-reset.requested`,
 *    `auth.password-reset.completed`, `auth.rbac.denied`) remain in
 *    the registry; no event was dropped during the M3 widening.
 *
 * The failing assertion is the inclusion of the two M3 events. The test
 * file exists and the type/union does not yet — RED.
 */
describe("AUTH_EVENTS registry (M3 task 2.3 RED)", () => {
  it("AUTH_EVENTS is exported as a readonly array of event-name strings", async () => {
    const mod = (await import("../auth.events.js")) as {
      AUTH_EVENTS?: ReadonlyArray<string>;
    };
    expect(Array.isArray(mod.AUTH_EVENTS)).toBe(true);
    // Every entry is a string (dotted namespace; kebab-case token).
    for (const name of mod.AUTH_EVENTS ?? []) {
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("AUTH_EVENTS contains auth.session.revoked (M3 task 2.4 GREEN dependency)", async () => {
    const mod = (await import("../auth.events.js")) as {
      AUTH_EVENTS?: ReadonlyArray<string>;
    };
    expect(mod.AUTH_EVENTS ?? []).toContain("auth.session.revoked");
  });

  it("AUTH_EVENTS contains auth.role.changed (M3 task 1.4 already shipped)", async () => {
    const mod = (await import("../auth.events.js")) as {
      AUTH_EVENTS?: ReadonlyArray<string>;
    };
    expect(mod.AUTH_EVENTS ?? []).toContain("auth.role.changed");
  });

  it("AUTH_EVENTS preserves the pre-existing slice events (no regression)", async () => {
    const mod = (await import("../auth.events.js")) as {
      AUTH_EVENTS?: ReadonlyArray<string>;
    };
    const set = new Set(mod.AUTH_EVENTS ?? []);

    for (const name of [
      "auth.password-reset.requested",
      "auth.password-reset.completed",
      "auth.rbac.denied",
    ]) {
      expect(set.has(name)).toBe(true);
    }
  });
});

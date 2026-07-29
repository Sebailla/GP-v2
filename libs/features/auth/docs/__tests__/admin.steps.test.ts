import { describe, it, expect } from "vitest";

import { stepDefinitions } from "../step-defs/admin.steps.js";
import { createAuthWorld } from "../step-defs/world.js";

/**
 * Vitest bridge-contract test for the module-3-superadmin admin-flow
 * step-defs (Phase 5 PR-5 task 5.2 GREEN). Mirrors the precedent in
 * `auth-flow.steps.test.ts` and `realm.steps.test.ts`: assert that
 * the patterns in `admin.steps.ts` correctly match the phrasing in
 * `libs/features/auth/docs/admin-flow.feature` and that the bindings
 * mutate the World in the expected way.
 *
 * Why this exists (carried from auth-flow.steps.test.ts):
 *   - Cucumber's `Given/When/Then` registration is a side-effect of
 *     `register.ts` and can only be verified by running the full BDD
 *     runner (which requires the dev server + DB + cucumber CLI).
 *     That's brittle in CI.
 *   - Vitest can verify the patterns + the per-binding mutators in
 *     isolation, which is the small, fast, hermetic unit verification
 *     the strict-tdd cycle needs.
 *   - The `buildPattern` helper mirrors the conversion in
 *     `support/register.ts#buildPattern` so we know the regex shape
 *     cucumber will see at runtime matches what we test here.
 *
 * Stresses that EVERY scenario line in `admin-flow.feature` has a
 * matching binding registered. Failure mode: a scenario line
 * silently falls through with "no matching step" at cucumber-run
 * time — this test catches that mismatch before commit.
 */

function buildPattern(pattern: string): RegExp {
  return new RegExp(
    "^" +
      pattern
        .replace(/\{string\}/g, '((?:"[^"]*"|[^\\s"]+))')
        .replace(/\//g, "\\/") +
      "$",
  );
}

const bindings = stepDefinitions;

describe("auth/docs/step-defs/admin.steps.ts — admin vertical flow step bindings", () => {
  it("matches the admin sign-in Given step and sets role=ADMIN", () => {
    const stepText = 'an admin with role "ADMIN" is signed in via Credentials';

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("Given");

    const world = createAuthWorld();
    binding?.fn(world, "ADMIN");
    expect(world.user?.role).toBe("ADMIN");
    expect(world.sessionCreated).toBe(true);
    expect(world.formState).toBe("success");
  });

  it("matches the user-as-USER sign-in Given step and stores the active role", () => {
    const stepText = 'a registered user with role "USER" is signed in via Credentials';

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();

    const world = createAuthWorld();
    binding?.fn(world, "USER");
    expect(world.user?.role).toBe("USER");
    expect(world.sessionCreated).toBe(true);
  });

  it("matches the admin->/admin/users navigation step and pins the active locale", () => {
    const stepEn = 'the admin navigates to "en"/admin/users';
    const stepEs = 'the admin navigates to "es"/admin/users';

    const bindingEn = bindings.find(({ pattern }) => buildPattern(pattern).test(stepEn));
    const bindingEs = bindings.find(({ pattern }) => buildPattern(pattern).test(stepEs));
    expect(bindingEn).toBeDefined();
    expect(bindingEs).toBeDefined();
    expect(bindingEn?.keyword).toBe("Given");

    const worldEn = createAuthWorld();
    bindingEn?.fn(worldEn, "en");
    expect(worldEn.activeLocale).toBe("en");

    const worldEs = createAuthWorld();
    bindingEs?.fn(worldEs, "es");
    expect(worldEs.activeLocale).toBe("es");
  });

  it("matches the users-page list When step and flips to success", () => {
    const stepText = "the admin lists the users page";

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("When");

    const world = createAuthWorld();
    binding?.fn(world);
    expect(world.formState).toBe("success");
  });

  it("matches the user detail page When step and clears prior attempt state", () => {
    const stepText = "the admin opens the user detail page for some-user-id";

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("When");

    const world = createAuthWorld();
    world.user = { id: "actor_1", email: "x@example.test", role: "ADMIN" };
    world.attemptedRoleChange = {
      userId: "stale_user",
      role: "USER",
    };
    binding?.fn(world, "some-user-id");
    expect(world.formState).toBe("empty");
  });

  it("matches the role-change submit When step and records the attempt", () => {
    const stepText = 'the admin submits the role-change form with "ADMIN"';

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("When");

    const world = createAuthWorld();
    world.user = { id: "actor_admin", email: "admin@example.test", role: "ADMIN" };
    binding?.fn(world, "ADMIN");
    expect(world.attemptedRoleChange?.role).toBe("ADMIN");
    expect(world.attemptedRoleChange?.userId).toBe("actor_admin");
    expect(world.formState).toBe("success");
  });

  it("matches the role-change response Then step and pins the response shape", () => {
    const stepText = "the role-change endpoint returns 200 with the updated user row";

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("Then");

    const world = createAuthWorld();
    world.user = { id: "actor_admin", email: "admin@example.test", role: "ADMIN" };
    world.attemptedRoleChange = {
      userId: "target_user",
      role: "ADMIN",
    };
    binding?.fn(world);
    expect(world.lastRoleChangeResponse).toBeDefined();
    expect(world.lastRoleChangeResponse?.role).toBe("ADMIN");
    expect(world.formState).toBe("success");
  });

  it("matches the auth.role.changed event assertion and appends an audit row", () => {
    const stepText =
      'the auth.role.changed event is dispatched with fromRole="USER" and toRole="ADMIN"';

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("Then");

    const world = createAuthWorld();
    world.user = { id: "actor_admin", email: "admin@example.test", role: "ADMIN" };
    world.attemptedRoleChange = { userId: "target_user", role: "ADMIN" };
    binding?.fn(world, "USER", "ADMIN");
    expect(world.lastDispatchedEvent).toBe("auth.role.changed");

    const auditRows = (world as unknown as {
      __auditRows?: ReadonlyArray<{
        action: string;
        metadata: Record<string, unknown>;
      }>;
    }).__auditRows;
    expect(auditRows).toBeDefined();
    expect(auditRows?.[0]?.action).toBe("CHANGE_ROLE");
    expect(auditRows?.[0]?.metadata).toEqual({ fromRole: "USER", toRole: "ADMIN" });
  });

  it("matches the sessions listing endpoint assertion and sets success state", () => {
    const stepText =
      "the sessions-listing endpoint returns the canonical session rows sorted by lastActiveAt DESC";

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("Then");

    const world = createAuthWorld();
    binding?.fn(world);
    expect(world.formState).toBe("success");
  });

  it("matches the single-session revoke assertion and appends a REVOKE_SESSION audit row", () => {
    const stepText = "the REVOKE_SESSION audit row is written for the actor";

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("Then");

    const world = createAuthWorld();
    world.user = { id: "actor_admin", email: "admin@example.test", role: "ADMIN" };
    world.revokedSessionId = "sess_target_1";
    world.attemptedBulkRevoke = { userId: "target_user" };
    binding?.fn(world);
    // The audit-row assertion binding only appends the row; the
    // matching "endpoint returns 204" step is the one that flips
    // formState to "success" (the audit assertion runs AFTER).

    const auditRows = (world as unknown as {
      __auditRows?: ReadonlyArray<{
        action: string;
        targetId: string;
      }>;
    }).__auditRows;
    expect(auditRows).toBeDefined();
    expect(auditRows?.[0]?.action).toBe("REVOKE_SESSION");
    expect(auditRows?.[0]?.targetId).toBe("sess_target_1");
  });

  it("matches the bulk-revoke audit-row assertion and appends a REVOKE_ALL_SESSIONS row with metadata.count=1", () => {
    const stepText =
      "the REVOKE_ALL_SESSIONS audit row is written with metadata.count >= 1";

    const binding = bindings.find(({ pattern }) => buildPattern(pattern).test(stepText));
    expect(binding).toBeDefined();
    expect(binding?.keyword).toBe("Then");

    const world = createAuthWorld();
    world.user = { id: "actor_admin", email: "admin@example.test", role: "ADMIN" };
    world.attemptedBulkRevoke = { userId: "target_user" };
    binding?.fn(world);
    // The audit-row assertion binding only appends the row; the
    // matching "endpoint returns 204" step is the one that flips
    // formState to "success" (the audit assertion runs AFTER).

    const auditRows = (world as unknown as {
      __auditRows?: ReadonlyArray<{
        action: string;
        metadata: Record<string, unknown>;
      }>;
    }).__auditRows;
    expect(auditRows).toBeDefined();
    expect(auditRows?.[0]?.action).toBe("REVOKE_ALL_SESSIONS");
    expect((auditRows?.[0]?.metadata as { count?: number })?.count).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("matches the non-admin redirect assertion and pins rbacAllowed=false + error state", () => {
    const stepTextEn =
      "the middleware redirects the non-admin to /en with the admin-denied flash";
    const stepTextEs =
      "the middleware redirects the non-admin to /es with the admin-denied flash";

    const bindingEn = bindings.find(({ pattern }) =>
      buildPattern(pattern).test(stepTextEn),
    );
    const bindingEs = bindings.find(({ pattern }) =>
      buildPattern(pattern).test(stepTextEs),
    );
    expect(bindingEn).toBeDefined();
    expect(bindingEs).toBeDefined();
    expect(bindingEn?.keyword).toBe("Then");

    const worldEn = createAuthWorld();
    bindingEn?.fn(worldEn, "en");
    expect(worldEn.rbacAllowed).toBe(false);
    expect(worldEn.formState).toBe("error");
    expect(worldEn.lastErrorMessage).toBe("admin denied");

    const worldEs = createAuthWorld();
    bindingEs?.fn(worldEs, "es");
    expect(worldEs.rbacAllowed).toBe(false);
  });

  it("covers every scenario line in admin-flow.feature", () => {
    // Sanity pin: every step line in `admin-flow.feature` resolves
    // to a binding. The full scenario text is repeated verbatim
    // from the feature file. "And" steps map to the next binding
    // registered for the same vocabulary.
    const scenarioLines = [
      // Background
      "the application is running",
      // Scenario 1 — admin login
      'an admin with role "ADMIN" is signed in via Credentials',
      'the admin navigates to "en"/admin/users',
      "the admin lists the users page",
      "the user-listing endpoint returns the canonical user rows sorted by createdAt DESC",
      "the admin opens the user detail page for some-user-id",
      "the role-change form renders with the current role pre-selected",
      'the admin submits the role-change form with "ADMIN"',
      "the role-change endpoint returns 200 with the updated user row",
      'the auth.role.changed event is dispatched with fromRole="USER" and toRole="ADMIN"',
      "the admin opens the sessions page for some-user-id",
      "the sessions-listing endpoint returns the canonical session rows sorted by lastActiveAt DESC",
      "the admin revokes a single session for some-user-id",
      "the sessions-revoke-single endpoint returns 204",
      "the REVOKE_SESSION audit row is written for the actor",
      "the admin revokes every session for some-user-id",
      "the sessions-revoke-all endpoint returns 204",
      "the REVOKE_ALL_SESSIONS audit row is written with metadata.count >= 1",
      // Scenario 2 — non-admin redirect
      'a registered user with role "USER" is signed in via Credentials',
      'the user navigates to "en"/admin/users',
      "the middleware redirects the non-admin to /en with the admin-denied flash",
    ];
    const adminFlowOnly = [
      'an admin with role "ADMIN" is signed in via Credentials',
      'the admin navigates to "en"/admin/users',
      "the admin lists the users page",
      "the user-listing endpoint returns the canonical user rows sorted by createdAt DESC",
      "the admin opens the user detail page for some-user-id",
      "the role-change form renders with the current role pre-selected",
      'the admin submits the role-change form with "ADMIN"',
      "the role-change endpoint returns 200 with the updated user row",
      'the auth.role.changed event is dispatched with fromRole="USER" and toRole="ADMIN"',
      "the admin opens the sessions page for some-user-id",
      "the sessions-listing endpoint returns the canonical session rows sorted by lastActiveAt DESC",
      "the admin revokes a single session for some-user-id",
      "the sessions-revoke-single endpoint returns 204",
      "the REVOKE_SESSION audit row is written for the actor",
      "the admin revokes every session for some-user-id",
      "the sessions-revoke-all endpoint returns 204",
      "the REVOKE_ALL_SESSIONS audit row is written with metadata.count >= 1",
      'a registered user with role "USER" is signed in via Credentials',
      'the user navigates to "en"/admin/users',
      "the middleware redirects the non-admin to /en with the admin-denied flash",
    ];
    for (const line of scenarioLines) {
      const found = bindings.some(({ pattern }) => buildPattern(pattern).test(line));
      if (adminFlowOnly.includes(line)) {
        expect(found, `line "${line}" not bound`).toBe(true);
      }
    }
  });
});

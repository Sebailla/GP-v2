import "reflect-metadata";

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import { env } from "@core/config";

/**
 * Task 3.3 — `AdminGuard` unit test.
 *
 * Per `openspec/changes/module-3-superadmin/design.md` D1 the guard
 * composes behind `JwtAuthGuard`. Its sole job is to inspect
 * `request.user.role` (set by JwtAuthGuard via NextAuth JWT decode)
 * and:
 *
 *  - 404 (NotFound) when `env.ADMIN_ENABLED === false` (the kill-switch
 *    wins BEFORE the role check — a forged `role: "ADMIN"` token still
 *    404s). Threat matrix §7 Configuration row, Applicable.
 *  - 401 (Unauthorized) when `req.user` is absent or `req.user.id` is
 *    falsy. This is the defensive shape: in production JwtAuthGuard
 *    runs first, so `req.user` is guaranteed; the unit test forces
 *    the absent-user branch to pin the contract.
 *  - 403 (Forbidden) when `req.user.role !== "ADMIN"`.
 *  - resolve (return `true`) when `req.user.role === "ADMIN"`.
 *
 * Threat matrix (design §7 — Routing row, Applicable): foreign actor
 * / non-admin token. This test pins the 401/403/404 split that the
 * NestJS exception layer surfaces. Note: an expired JWT never reaches
 * AdminGuard in production because JwtAuthGuard rejects it first; we
 * exercise the guard in isolation.
 *
 * The 401/403/404 status code is asserted in TWO ways per test:
 *   1. `rejects.toMatchObject({ status })` — behavioral shape (the HTTP
 *      status the framework would surface).
 *   2. `rejects.toBeInstanceOf(...)` — class identity, defensive
 *      against NestJS internals changing how the status is encoded.
 * Both must hold; a regression in either layer surfaces as a failure.
 */

type AdminGuard = InstanceType<
  typeof import("../admin.guard.js").AdminGuard
>;

// F1 fix: mock `@core/config` so the kill-switch branch
// (`env.ADMIN_ENABLED === false` → 404) can be exercised without a full
// module reset. The mock factory is hoisted by Vitest BEFORE the
// `loadGuard()` import resolves, so the guard's top-level `env` read
// picks up our stub. `vi.resetAllMocks()` in `beforeEach` clears the
// stub between tests; the dedicated test in the "kill-switch" describe
// block sets the flag back to `false` explicitly via `vi.mocked(...)`.
vi.mock("@core/config", () => ({
  env: {
    ADMIN_ENABLED: true,
  },
}));

const loadGuard = async (): Promise<new () => AdminGuard> => {
  const mod = (await import("../admin.guard.js")) as {
    AdminGuard: new () => AdminGuard;
  };
  return mod.AdminGuard;
};

const makeContext = (user: unknown): ExecutionContext => {
  const req = { user };
  return {
    switchToHttp: () => ({
      getRequest: <T = typeof req>() => req as T,
      getResponse: <T = unknown>() => ({}) as T,
      getNext: <T = unknown>() => ({}) as T,
    }),
    getHandler: () => () => undefined,
    getClass: () => class {},
    getArgs: () => [] as unknown[],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
    getType: () => "http" as never,
  } as unknown as ExecutionContext;
};

describe("AdminGuard (M3 task 3.3)", () => {
  let AdminGuardClass: new () => AdminGuard;

  beforeEach(async () => {
    vi.clearAllMocks();
    AdminGuardClass = await loadGuard();
  });

  it("resolves (true) when request.user.role === 'ADMIN'", async () => {
    const guard = new AdminGuardClass();
    const ok = await guard.canActivate(
      makeContext({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    );
    expect(ok).toBe(true);
  });

  it("throws 403 Forbidden when request.user.role === 'USER'", async () => {
    const guard = new AdminGuardClass();
    const promise = guard.canActivate(
      makeContext({ id: "user-1", email: "alice@example.com", role: "USER" }),
    );
    await expect(promise).rejects.toMatchObject({ status: 403 });
    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws 401 Unauthorized when request.user is missing (no JwtAuthGuard ran)", async () => {
    const guard = new AdminGuardClass();
    const promise = guard.canActivate(makeContext(undefined));
    await expect(promise).rejects.toMatchObject({ status: 401 });
    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("throws 401 Unauthorized when request.user.id is falsy (corrupted payload)", async () => {
    const guard = new AdminGuardClass();
    const promise = guard.canActivate(
      makeContext({ id: "", email: "alice@example.com", role: "ADMIN" }),
    );
    await expect(promise).rejects.toMatchObject({ status: 401 });
    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("throws 403 Forbidden when request.user.role is missing entirely (defaults to non-admin)", async () => {
    const guard = new AdminGuardClass();
    const promise = guard.canActivate(
      makeContext({ id: "user-1", email: "alice@example.com" }),
    );
    await expect(promise).rejects.toMatchObject({ status: 403 });
    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
  });

  // F1 fix (4R-driven correction): the kill-switch branch
  // (`env.ADMIN_ENABLED === false`) hides the entire admin surface
  // from clients with 404. The check runs FIRST, BEFORE the role
  // check, so a forged `role: "ADMIN"` token still 404s — the
  // kill-switch wins over the role check. Threat matrix
  // §7 Configuration row, Applicable.
  it("throws 404 NotFound when env.ADMIN_ENABLED === false (kill-switch wins over role)", async () => {
    // Force the mock to `false` for THIS test only.
    vi.mocked(env).ADMIN_ENABLED = false;
    try {
      const guard = new AdminGuardClass();
      // Even though the caller carries `role: "ADMIN"`, the
      // kill-switch collapses the entire admin surface to 404.
      const promise = guard.canActivate(
        makeContext({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
      );
      await expect(promise).rejects.toMatchObject({ status: 404 });
      await expect(promise).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      // Restore the default so the next test isn't poisoned.
      vi.mocked(env).ADMIN_ENABLED = true;
    }
  });
});

import "reflect-metadata";

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";

/**
 * Task 3.3 — `AdminGuard` unit test.
 *
 * Per `openspec/changes/module-3-superadmin/design.md` D1 the guard
 * composes behind `JwtAuthGuard`. Its sole job is to inspect
 * `request.user.role` (set by JwtAuthGuard via NextAuth JWT decode)
 * and:
 *
 *  - 401 (Unauthorized) when `req.user` is absent or `req.user.id` is
 *    falsy. This is the defensive shape: in production JwtAuthGuard
 *    runs first, so `req.user` is guaranteed; the unit test forces
 *    the absent-user branch to pin the contract.
 *  - 403 (Forbidden) when `req.user.role !== "ADMIN"`.
 *  - resolve (return `true`) when `req.user.role === "ADMIN"`.
 *
 * Threat matrix (design §7 — Routing row, Applicable): foreign actor
 * / non-admin token. This test pins the 401/403 split that the NestJS
 * exception layer surfaces. Note: an expired JWT never reaches
 * AdminGuard in production because JwtAuthGuard rejects it first; we
 * exercise the guard in isolation. The kill-switch (`ADMIN_ENABLED`)
 * is exercised at the controller e2e layer in `admin.controller.test.ts`
 * because the `env` singleton is frozen at import time — a unit test
 * would need a full module reset, which complicates the assertion.
 *
 * The 401/403 status code is asserted in TWO ways per test:
 *   1. `rejects.toMatchObject({ status })` — behavioral shape (the HTTP
 *      status the framework would surface).
 *   2. `rejects.toBeInstanceOf(...)` — class identity, defensive
 *      against NestJS internals changing how the status is encoded.
 * Both must hold; a regression in either layer surfaces as a failure.
 */

type AdminGuard = InstanceType<
  typeof import("../admin.guard.js").AdminGuard
>;

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
});

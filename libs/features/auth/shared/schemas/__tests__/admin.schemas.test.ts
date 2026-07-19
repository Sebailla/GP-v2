import { describe, it, expect } from "vitest";

/**
 * TDD contract for the M3 admin Zod schemas (module-3-superadmin — task 1.5 RED).
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §5 (Interfaces /
 * Contracts), three Zod schemas ship in
 * `libs/features/auth/shared/schemas/admin.schemas.ts`:
 *
 *   - `ListUsersQuerySchema` — `{ limit, offset }` with defaults
 *     `limit=50`, `offset=0`, both coerced from query-string strings.
 *   - `ChangeRoleBodySchema` — `{ role: "USER" | "ADMIN" }` (closed enum).
 *   - `ListSessionsQuerySchema` — `{ userId: string }` (UUID-shaped).
 *
 * The schemas are imported by BOTH the NestJS controller (server-side
 * pipe validation) AND the Next.js client forms (slice 4 via
 * `@hookform/resolvers/zod`), per the shared/schemas dual-consumption
 * pattern. ESLint's `no-schemas-outside-shared` rule enforces the
 * path — any schema literal declared elsewhere fails CI.
 *
 * RED state (pre-1.6 GREEN): `admin.schemas.ts` does NOT exist yet.
 * Every dynamic import throws ERR_MODULE_NOT_FOUND; every test fails
 * for the expected "feature missing" reason.
 *
 * The "happy + edge" triangulation here is non-negotiable: each schema
 * has at minimum one positive case (well-formed payload passes) AND
 * one negative case (a malformed payload is rejected with a precise
 * error). The `role` enum test specifically asserts that "GOD" /
 * lowercase / missing are all rejected — closed enum semantics
 * matter because the controller uses these schemas as the boundary
 * for the HTTP request body.
 */

describe("ListUsersQuerySchema", () => {
  it("accepts a well-formed query (limit=10, offset=20) and coerces to numbers", async () => {
    const { ListUsersQuerySchema } = await import("../admin.schemas.js");
    const result = ListUsersQuerySchema.safeParse({ limit: "10", offset: "20" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
      expect(result.data.offset).toBe(20);
      expect(typeof result.data.limit).toBe("number");
      expect(typeof result.data.offset).toBe("number");
    }
  });

  it("applies defaults when the query is empty (limit=50, offset=0)", async () => {
    const { ListUsersQuerySchema } = await import("../admin.schemas.js");
    const result = ListUsersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(0);
    }
  });

  it("rejects a limit above the maximum (200)", async () => {
    const { ListUsersQuerySchema } = await import("../admin.schemas.js");
    const result = ListUsersQuerySchema.safeParse({ limit: "201", offset: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative offset", async () => {
    const { ListUsersQuerySchema } = await import("../admin.schemas.js");
    const result = ListUsersQuerySchema.safeParse({ limit: "10", offset: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric limit", async () => {
    const { ListUsersQuerySchema } = await import("../admin.schemas.js");
    const result = ListUsersQuerySchema.safeParse({ limit: "abc", offset: "0" });
    expect(result.success).toBe(false);
  });
});

describe("ChangeRoleBodySchema", () => {
  it("accepts role='USER'", async () => {
    const { ChangeRoleBodySchema } = await import("../admin.schemas.js");
    const result = ChangeRoleBodySchema.safeParse({ role: "USER" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("USER");
    }
  });

  it("accepts role='ADMIN'", async () => {
    const { ChangeRoleBodySchema } = await import("../admin.schemas.js");
    const result = ChangeRoleBodySchema.safeParse({ role: "ADMIN" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("ADMIN");
    }
  });

  it("rejects an unknown role (GOD is NOT in the closed enum)", async () => {
    // Closed enum — the controller's role-change endpoint MUST reject
    // any value outside USER|ADMIN before touching the DB.
    const { ChangeRoleBodySchema } = await import("../admin.schemas.js");
    const result = ChangeRoleBodySchema.safeParse({ role: "GOD" });
    expect(result.success).toBe(false);
  });

  it("rejects a lowercase role ('user' is not 'USER')", async () => {
    const { ChangeRoleBodySchema } = await import("../admin.schemas.js");
    const result = ChangeRoleBodySchema.safeParse({ role: "user" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing role field", async () => {
    const { ChangeRoleBodySchema } = await import("../admin.schemas.js");
    const result = ChangeRoleBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("ListSessionsQuerySchema", () => {
  it("accepts a UUID-shaped userId", async () => {
    const { ListSessionsQuerySchema } = await import("../admin.schemas.js");
    const result = ListSessionsQuerySchema.safeParse({
      userId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID userId", async () => {
    const { ListSessionsQuerySchema } = await import("../admin.schemas.js");
    const result = ListSessionsQuerySchema.safeParse({ userId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing userId field", async () => {
    const { ListSessionsQuerySchema } = await import("../admin.schemas.js");
    const result = ListSessionsQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
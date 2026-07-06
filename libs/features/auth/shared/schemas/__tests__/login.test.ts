import { describe, it, expect } from "vitest";

/**
 * TDD contract for `loginSchema` (slice 3 batch 6 — brief T3.2 RED).
 *
 * Per `openspec/changes/vertical-slicing-reference-scaffold/design.md`
 * §4.2 ("login.ts — `{ email: z.string().email(), password: z.string().min(8) }`"),
 * the canonical Zod schema lives at
 * `libs/features/auth/shared/schemas/login.ts` and is imported by:
 *  - The NestJS `AuthController` (server pipe validation) — apps/api/modules/auth
 *  - The Next.js `LoginForm` (client `react-hook-form` resolver) — slice 4.
 *
 * Boundary contract (per the design):
 *  - email: must be a valid email address (RFC-ish).
 *  - password: 8 to 128 characters (inclusive); rejects empty + too-long.
 *  - extra fields: rejected (`strip` and `strict` are not configured;
 *    the schema uses the default `.strict()`-equivalent behavior on object —
 *    extra keys are kept on the output, which is acceptable for input
 *    validation).
 *
 * RED state: `login.ts` does NOT exist yet. The dynamic import inside each
 * `it` block throws `ERR_MODULE_NOT_FOUND`. Every test fails for the
 * expected "feature missing" reason.
 *
 * The schemas live under `libs/features/<x>/shared/schemas/` which the
 * slice-wide ESLint rule `no-schemas-outside-shared` allows; tests can
 * import them via the relative path.
 */

describe("loginSchema", () => {
  it("accepts a well-formed email + password (8-128 chars)", async () => {
    const { loginSchema } = await import("../login.js");
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "StrongP@ss123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("alice@example.com");
      expect(result.data.password).toBe("StrongP@ss123");
    }
  });

  it("rejects an empty email", async () => {
    const { loginSchema } = await import("../login.js");
    const result = loginSchema.safeParse({
      email: "",
      password: "StrongP@ss123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email (no @)", async () => {
    const { loginSchema } = await import("../login.js");
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "StrongP@ss123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", async () => {
    const { loginSchema } = await import("../login.js");
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 chars", async () => {
    const { loginSchema } = await import("../login.js");
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "1234567",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password longer than 128 chars", async () => {
    const { loginSchema } = await import("../login.js");
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "x".repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a password at the boundary (8 chars exactly)", async () => {
    const { loginSchema } = await import("../login.js");
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "x".repeat(8),
    });
    expect(result.success).toBe(true);
  });

  it("accepts a password at the boundary (128 chars exactly)", async () => {
    const { loginSchema } = await import("../login.js");
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "x".repeat(128),
    });
    expect(result.success).toBe(true);
  });
});

import { describe, it, expect } from "vitest";

/**
 * TDD contract for `registerSchema` (slice 3 batch 6 — brief T3.2 RED).
 *
 * Per `openspec/changes/.../design.md` §4.2
 * (`register.ts — { email, password (min 8), name }`), the canonical
 * Zod schema lives at
 * `libs/features/auth/shared/schemas/register.ts` and is imported by:
 *  - The NestJS `AuthController` (server pipe validation).
 *  - The Next.js `SignUpForm` (client form resolver) — slice 4.
 *
 * Boundary contract (per design):
 *  - email: valid email.
 *  - password: 8-128 characters.
 *  - name: 1-120 characters (REQUIRED, not optional).
 *
 * RED state: `register.ts` does NOT exist yet. Every test fails for the
 * expected "feature missing" reason.
 */

describe("registerSchema", () => {
  it("accepts a well-formed email + password + name (1-120 chars)", async () => {
    const { registerSchema } = await import("../register.js");
    const result = registerSchema.safeParse({
      email: "alice@example.com",
      password: "StrongP@ss123",
      name: "Alice Smith",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("alice@example.com");
      expect(result.data.password).toBe("StrongP@ss123");
      expect(result.data.name).toBe("Alice Smith");
    }
  });

  it("rejects an empty name (name is REQUIRED)", async () => {
    const { registerSchema } = await import("../register.js");
    const result = registerSchema.safeParse({
      email: "alice@example.com",
      password: "StrongP@ss123",
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing name field (undefined)", async () => {
    const { registerSchema } = await import("../register.js");
    const result = registerSchema.safeParse({
      email: "alice@example.com",
      password: "StrongP@ss123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 120 chars", async () => {
    const { registerSchema } = await import("../register.js");
    const result = registerSchema.safeParse({
      email: "alice@example.com",
      password: "StrongP@ss123",
      name: "x".repeat(121),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a name at the boundary (1 char exactly)", async () => {
    const { registerSchema } = await import("../register.js");
    const result = registerSchema.safeParse({
      email: "alice@example.com",
      password: "StrongP@ss123",
      name: "A",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a name at the boundary (120 chars exactly)", async () => {
    const { registerSchema } = await import("../register.js");
    const result = registerSchema.safeParse({
      email: "alice@example.com",
      password: "StrongP@ss123",
      name: "x".repeat(120),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", async () => {
    const { registerSchema } = await import("../register.js");
    const result = registerSchema.safeParse({
      email: "alice@",
      password: "StrongP@ss123",
      name: "Alice",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a weak password (less than 8 chars)", async () => {
    const { registerSchema } = await import("../register.js");
    const result = registerSchema.safeParse({
      email: "alice@example.com",
      password: "1234567",
      name: "Alice",
    });
    expect(result.success).toBe(false);
  });
});

import { describe, it, expect } from "vitest";

/**
 * TDD contract for `forgotPasswordSchema` (slice 3 batch 6 — brief T3.2 RED).
 *
 * Per `openspec/changes/.../design.md` §4.2
 * (`forgot-password.ts — { email }`), the canonical Zod schema lives at
 * `libs/features/auth/shared/schemas/forgot-password.ts`.
 *
 * Boundary contract: only `email` — must be a valid email.
 *
 * RED state: `forgot-password.ts` does NOT exist yet. Every test fails
 * for the expected "feature missing" reason.
 */

describe("forgotPasswordSchema", () => {
  it("accepts a well-formed email", async () => {
    const { forgotPasswordSchema } = await import("../forgot-password.js");
    const result = forgotPasswordSchema.safeParse({
      email: "alice@example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("alice@example.com");
    }
  });

  it("rejects an empty email", async () => {
    const { forgotPasswordSchema } = await import("../forgot-password.js");
    const result = forgotPasswordSchema.safeParse({
      email: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email (no @)", async () => {
    const { forgotPasswordSchema } = await import("../forgot-password.js");
    const result = forgotPasswordSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing email field", async () => {
    const { forgotPasswordSchema } = await import("../forgot-password.js");
    const result = forgotPasswordSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

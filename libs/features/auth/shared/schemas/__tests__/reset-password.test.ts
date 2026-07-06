import { describe, it, expect } from "vitest";

/**
 * TDD contract for `resetPasswordSchema` (slice 3 batch 6 — brief T3.2 RED).
 *
 * Per `openspec/changes/.../design.md` §4.2
 * (`reset-password.ts — { token: z.string().min(32), password: z.string().min(8) }`),
 * the canonical Zod schema lives at
 * `libs/features/auth/shared/schemas/reset-password.ts`.
 *
 * Boundary contract:
 *  - token: 32-128 characters (the reset token is a hex digest of 32 random
 *    bytes → 64 chars; the lower bound matches the design's minimum).
 *  - newPassword: 8-128 characters (mirrors login/register password policy).
 *
 * RED state: `reset-password.ts` does NOT exist yet. Every test fails
 * for the expected "feature missing" reason.
 */

describe("resetPasswordSchema", () => {
  it("accepts a valid token + newPassword", async () => {
    const { resetPasswordSchema } = await import("../reset-password.js");
    const token = "x".repeat(64); // 32 random bytes → 64 hex chars
    const result = resetPasswordSchema.safeParse({
      token,
      newPassword: "NewP@ss123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.token).toBe(token);
      expect(result.data.newPassword).toBe("NewP@ss123");
    }
  });

  it("rejects a token shorter than 32 chars", async () => {
    const { resetPasswordSchema } = await import("../reset-password.js");
    const result = resetPasswordSchema.safeParse({
      token: "x".repeat(31),
      newPassword: "NewP@ss123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty token", async () => {
    const { resetPasswordSchema } = await import("../reset-password.js");
    const result = resetPasswordSchema.safeParse({
      token: "",
      newPassword: "NewP@ss123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a token longer than 128 chars", async () => {
    const { resetPasswordSchema } = await import("../reset-password.js");
    const result = resetPasswordSchema.safeParse({
      token: "x".repeat(129),
      newPassword: "NewP@ss123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing token field", async () => {
    const { resetPasswordSchema } = await import("../reset-password.js");
    const result = resetPasswordSchema.safeParse({
      newPassword: "NewP@ss123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a newPassword shorter than 8 chars", async () => {
    const { resetPasswordSchema } = await import("../reset-password.js");
    const result = resetPasswordSchema.safeParse({
      token: "x".repeat(32),
      newPassword: "1234567",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a newPassword at the boundary (128 chars exactly)", async () => {
    const { resetPasswordSchema } = await import("../reset-password.js");
    const result = resetPasswordSchema.safeParse({
      token: "x".repeat(32),
      newPassword: "x".repeat(128),
    });
    expect(result.success).toBe(true);
  });
});

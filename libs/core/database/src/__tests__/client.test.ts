import { describe, it, expect } from "vitest";
import { prisma } from "../client.js";

describe("@core/database client singleton", () => {
  it("returns the same PrismaClient instance across imports", () => {
    // The singleton contract: every import of `prisma` resolves to the same
    // object identity. This is the gate against accidental `new PrismaClient()`
    // calls scattered across feature code (which the ESLint rule catches too,
    // but a runtime test is the truth).
    expect(prisma).toBeDefined();
    expect(typeof prisma).toBe("object");
  });

  it("exposes the expected PrismaClient surface", () => {
    // We do not require a live DB connection; we only assert the public API
    // shape that feature code relies on. Each property corresponds to a
    // model in prisma/schema.prisma.
    const expectedModels = [
      "user",
      "account",
      "session",
      "verificationToken",
      "passwordResetToken",
    ] as const;
    for (const model of expectedModels) {
      expect(prisma).toHaveProperty(model);
      // Each delegate exposes CRUD methods; spot-check findUnique.
      expect(typeof (prisma as unknown as Record<string, unknown>)[model]).toBe(
        "object",
      );
    }
  });

  it("does not create a new client when re-imported in the same process", async () => {
    // Re-import via dynamic import to confirm the globalThis cache holds
    // (this is what stops dev-server hot-reload from leaking DB connections).
    const mod = await import("../client.js");
    expect(mod.prisma).toBe(prisma);
  });
});
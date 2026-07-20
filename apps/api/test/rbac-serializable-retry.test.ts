import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@core/database";

import { RbacService, type AuthEventDispatcher } from "@features/auth";

const user = {
  id: "user-1",
  email: "user@example.com",
  role: "USER" as const,
  createdAt: new Date("2026-07-01"),
};

function serializationError(code: "40001" | "P2034") {
  return Object.assign(new Error("serialization conflict"), { code });
}

function createPrisma(failures: Array<"40001" | "P2034">) {
  const tx = {
    user: {
      findUnique: vi.fn(async () => user),
      count: vi.fn(async () => 2),
      update: vi.fn(async () => ({ ...user, role: "ADMIN" as const })),
    },
    adminAuditEvent: { create: vi.fn(async () => ({})) },
  };
  const $transaction = vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => {
    const code = failures.shift();
    if (code !== undefined) throw serializationError(code);
    return work(tx);
  });
  return { prisma: { ...tx, $transaction } as unknown as PrismaClient, $transaction };
}

const dispatcher = vi.fn<AuthEventDispatcher>();

describe("RbacService serialization retry", () => {
  it("retries SQLSTATE 40001 once and succeeds on the second attempt", async () => {
    vi.useFakeTimers();
    const { prisma, $transaction } = createPrisma(["40001"]);
    const service = new RbacService(dispatcher, prisma);

    const pending = service.changeRole("user-1", "ADMIN", "admin-1");
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ role: "ADMIN" });
    expect($transaction).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("retries Prisma P2034 once and succeeds on the second attempt", async () => {
    vi.useFakeTimers();
    const { prisma, $transaction } = createPrisma(["P2034"]);
    const service = new RbacService(dispatcher, prisma);

    const pending = service.changeRole("user-1", "ADMIN", "admin-1");
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ role: "ADMIN" });
    expect($transaction).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

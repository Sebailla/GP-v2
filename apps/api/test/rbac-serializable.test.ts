import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@core/database";

import type { AuthEventDispatcher } from "@features/auth";
import { LastAdminError, RbacService } from "@features/auth";

interface UserRow {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: Date;
}

function createConcurrentPrisma() {
  const users = new Map<string, UserRow>([
    ["admin-a", { id: "admin-a", email: "a@example.com", role: "ADMIN", createdAt: new Date("2026-07-01") }],
    ["admin-b", { id: "admin-b", email: "b@example.com", role: "ADMIN", createdAt: new Date("2026-07-02") }],
  ]);
  let activeTransaction = Promise.resolve();

  const tx = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null),
      count: vi.fn(async () => [...users.values()].filter((user) => user.role === "ADMIN").length),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { role: UserRow["role"] } }) => {
        const current = users.get(where.id)!;
        const updated = { ...current, role: data.role };
        users.set(where.id, updated);
        return updated;
      }),
    },
    adminAuditEvent: { create: vi.fn(async () => ({})) },
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>, options?: unknown) => {
      const run = activeTransaction.then(() => work(tx));
      activeTransaction = run.then(() => undefined, () => undefined);
      return run;
    }),
  };

  return { prisma: prisma as unknown as PrismaClient, raw: prisma, users };
}

const dispatcher = vi.fn<AuthEventDispatcher>();

describe("RbacService Serializable concurrent demotion", () => {
  it("allows exactly one of two concurrent admin demotions", async () => {
    const { prisma, raw, users } = createConcurrentPrisma();
    const service = new RbacService(dispatcher, prisma);

    const results = await Promise.allSettled([
      service.changeRole("admin-a", "USER", "admin-b"),
      service.changeRole("admin-b", "USER", "admin-a"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: expect.any(LastAdminError) });
    expect([...users.values()].filter((user) => user.role === "ADMIN")).toHaveLength(1);
    expect(raw.adminAuditEvent.create).toHaveBeenCalledTimes(1);
    expect(raw.$transaction).toHaveBeenCalledTimes(2);
    expect(raw.$transaction.mock.calls[0]?.[1]).toMatchObject({ isolationLevel: "Serializable" });
  });

  it("preserves the last admin when concurrent requests target the same account", async () => {
    const { prisma, raw, users } = createConcurrentPrisma();
    users.set("admin-b", { ...users.get("admin-b")!, role: "USER" });
    const service = new RbacService(dispatcher, prisma);

    const results = await Promise.allSettled([
      service.changeRole("admin-a", "USER", "admin-a"),
      service.changeRole("admin-a", "USER", "admin-a"),
    ]);

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(users.get("admin-a")?.role).toBe("ADMIN");
    expect(raw.user.update).not.toHaveBeenCalled();
  });
});

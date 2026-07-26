import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@core/database";

import { LastAdminError, RbacService, type AuthEventDispatcher } from "@features/auth";

interface UserRow {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: Date;
}

function createSerializableHarness() {
  const users = new Map<string, UserRow>([
    ["admin-a", { id: "admin-a", email: "a@example.com", role: "ADMIN", createdAt: new Date("2026-07-01") }],
    ["admin-b", { id: "admin-b", email: "b@example.com", role: "ADMIN", createdAt: new Date("2026-07-02") }],
  ]);
  let queue = Promise.resolve();
  const tx = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null),
      count: vi.fn(async () => [...users.values()].filter((user) => user.role === "ADMIN").length),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { role: UserRow["role"] } }) => {
        const updated = { ...users.get(where.id)!, role: data.role };
        users.set(where.id, updated);
        return updated;
      }),
    },
    adminAuditEvent: { create: vi.fn(async () => ({})) },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => {
      const current = queue.then(() => work(tx));
      queue = current.then(() => undefined, () => undefined);
      return current;
    }),
  };
  return { prisma: prisma as unknown as PrismaClient, raw: prisma, users };
}

const dispatcher = vi.fn<AuthEventDispatcher>();

describe("RbacService Promise.all concurrency", () => {
  it("keeps one admin and one audit row when opposite demotions run in parallel", async () => {
    const { prisma, raw, users } = createSerializableHarness();
    const service = new RbacService(dispatcher, prisma);

    const [first, second] = await Promise.all([
      service.changeRole("admin-a", "USER", "admin-b").then(
        (value) => ({ status: 200 as const, value }),
        (error: unknown) => ({ status: 409 as const, error }),
      ),
      service.changeRole("admin-b", "USER", "admin-a").then(
        (value) => ({ status: 200 as const, value }),
        (error: unknown) => ({ status: 409 as const, error }),
      ),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const conflict = [first, second].find((result) => result.status === 409);
    expect(conflict).toMatchObject({ error: expect.any(LastAdminError) });
    expect([...users.values()].filter((user) => user.role === "ADMIN")).toHaveLength(1);
    expect(raw.adminAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("allows two parallel promotions because the last-admin invariant is not involved", async () => {
    const { prisma, raw, users } = createSerializableHarness();
    users.set("admin-a", { ...users.get("admin-a")!, role: "USER" });
    users.set("admin-b", { ...users.get("admin-b")!, role: "USER" });
    const service = new RbacService(dispatcher, prisma);

    const promoted = await Promise.all([
      service.changeRole("admin-a", "ADMIN", "root"),
      service.changeRole("admin-b", "ADMIN", "root"),
    ]);

    expect(promoted.map((user) => user.role)).toEqual(["ADMIN", "ADMIN"]);
    expect(raw.adminAuditEvent.create).toHaveBeenCalledTimes(2);
  });
});

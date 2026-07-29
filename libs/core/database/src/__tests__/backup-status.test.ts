import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../client", () => ({
  prisma: {
    backupRun: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "../client";
import { latestBackupStatus } from "../backup-status";

describe("latestBackupStatus", () => {
  beforeEach(() => {
    vi.mocked(prisma.backupRun.findFirst).mockReset();
  });

  it("returns never when no backup row exists", async () => {
    vi.mocked(prisma.backupRun.findFirst).mockResolvedValue(null);
    const s = await latestBackupStatus("staging");
    expect(s).toEqual({ at: null, status: "never" });
  });

  it("returns ok with timestamp when the latest row is ok", async () => {
    const performedAt = new Date("2026-07-15T03:00:00.000Z");
    vi.mocked(prisma.backupRun.findFirst).mockResolvedValue({
      id: "br_1",
      performedAt,
      status: "ok",
      bytes: 1024,
      storageKey: "gastos-2026-07-15.dump",
      message: null,
      environment: "staging",
    });
    const s = await latestBackupStatus("staging");
    expect(s.status).toBe("ok");
    expect(s.at?.toISOString()).toBe("2026-07-15T03:00:00.000Z");
  });

  it("returns failed with timestamp when the latest row is failed", async () => {
    const performedAt = new Date("2026-07-15T03:00:00.000Z");
    vi.mocked(prisma.backupRun.findFirst).mockResolvedValue({
      id: "br_2",
      performedAt,
      status: "failed",
      bytes: null,
      storageKey: null,
      message: "pg_dump crashed",
      environment: "staging",
    });
    const s = await latestBackupStatus("staging");
    expect(s.status).toBe("failed");
    expect(s.at?.toISOString()).toBe("2026-07-15T03:00:00.000Z");
  });

  it("scopes the query by environment so production never sees staging rows", async () => {
    vi.mocked(prisma.backupRun.findFirst).mockResolvedValue(null);
    await latestBackupStatus("production");
    expect(prisma.backupRun.findFirst).toHaveBeenCalledWith({
      where: { environment: "production" },
      orderBy: { performedAt: "desc" },
    });
  });
});
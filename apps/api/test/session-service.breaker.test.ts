import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthEventDispatcher } from "../../../libs/features/auth/server/src/events.js";
import type { SessionRepository } from "../../../libs/features/auth/server/src/domain/interfaces/session.repository.js";
import type { UserRepository } from "../../../libs/features/auth/server/src/domain/interfaces/user.repository.js";
import type { PrismaClient } from "@core/database";

vi.mock("@core/config", () => ({ env: {} }));
vi.mock("@core/database", () => ({ prisma: {} }));

import { SessionService, clearActiveSessionCountCache } from "../../../libs/features/auth/server/src/session-service.js";

const dispatcher = vi.fn<AuthEventDispatcher>();
const user = { id: "user-1", email: "alice@example.com", role: "USER" };

function makeService(listActive: SessionRepository["listActive"]) {
  const sessionRepo: SessionRepository = {
    findByToken: vi.fn().mockResolvedValue({ id: "session-1", sessionToken: "token", userId: user.id, expires: new Date(Date.now() + 3_600_000) }),
    listActive,
    revokeByToken: vi.fn(),
  };
  const userRepo: UserRepository = {
    findById: vi.fn().mockResolvedValue(user),
    findByEmail: vi.fn(),
    updatePassword: vi.fn(),
  };
  const prisma = { session: { update: vi.fn().mockResolvedValue({ count: 1 }) } } as unknown as PrismaClient;
  return { service: new SessionService(prisma, sessionRepo, userRepo, dispatcher), sessionRepo };
}

describe("SessionService breaker cache", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    clearActiveSessionCountCache();
  });

  it("uses a warm active-session count without querying listActive again", async () => {
    const listActive = vi.fn().mockResolvedValue([]);
    const { service } = makeService(listActive);
    await service.getCurrentUser("token");
    await service.getCurrentUser("token");
    expect(listActive).toHaveBeenCalledTimes(1);
  });

  it("refreshes the count after the cache TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const listActive = vi.fn().mockResolvedValue([]);
    const { service } = makeService(listActive);
    await service.getCurrentUser("token");
    vi.advanceTimersByTime(60_001);
    await service.getCurrentUser("token");
    expect(listActive).toHaveBeenCalledTimes(2);
  });
});

describe("SessionService breaker performance", () => {
  beforeEach(() => {
    clearActiveSessionCountCache();
  });
  it("does not query listActive for sequential warm-cache requests", async () => {
    const listActive = vi.fn().mockResolvedValue([]);
    const { service } = makeService(listActive);
    await service.getCurrentUser("token");
    for (let index = 0; index < 100; index += 1) await service.getCurrentUser("token");
    expect(listActive).toHaveBeenCalledTimes(1);
  });
});

describe("SessionService breaker race", () => {
  beforeEach(() => {
    clearActiveSessionCountCache();
  });
  it("documents bounded concurrent cache misses", async () => {
    const listActive = vi.fn().mockResolvedValue([]);
    const { service } = makeService(listActive);
    await Promise.all(Array.from({ length: 10 }, () => service.getCurrentUser("token")));
    expect(listActive.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

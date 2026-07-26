import "reflect-metadata";

import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@core/database";

import { AdminController } from "../src/modules/auth/admin.controller.js";
import {
  RbacService,
  SerializationFailedError,
  type AuthEventDispatcher,
} from "@features/auth";

function serializationError(code: "40001" | "P2034") {
  return Object.assign(new Error("serialization conflict"), { code });
}

function alwaysFailingPrisma(code: "40001" | "P2034") {
  const $transaction = vi.fn(async () => {
    throw serializationError(code);
  });
  return { prisma: { $transaction } as unknown as PrismaClient, $transaction };
}

const dispatcher = vi.fn<AuthEventDispatcher>();

describe("RbacService exhausted serialization retry", () => {
  it.each(["40001", "P2034"] as const)(
    "raises the stable serialization error after three %s attempts",
    async (code) => {
      vi.useFakeTimers();
      const { prisma, $transaction } = alwaysFailingPrisma(code);
      const service = new RbacService(dispatcher, prisma);
      const pending = service.changeRole("admin-1", "USER", "admin-1");
      const rejection = expect(pending).rejects.toMatchObject({ code: "SERIALIZATION_FAILED" });

      await vi.runAllTimersAsync();
      await rejection;
      expect($transaction).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    },
  );

  it("maps exhausted retries to a localized 503 response", async () => {
    const rbacService = {
      changeRole: vi.fn().mockRejectedValue(new SerializationFailedError()),
    };
    const controller = new AdminController(rbacService as never, {} as never, {} as never);

    const pending = controller.changeUserRole(
      "admin-1",
      { role: "USER" },
      { user: { id: "admin-1", email: "admin@example.com", role: "ADMIN" } } as never,
    );

    await expect(pending).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(pending).rejects.toMatchObject({
      response: { error: "SERIALIZATION_FAILED", message: "serialization_failed" },
    });
  });
});

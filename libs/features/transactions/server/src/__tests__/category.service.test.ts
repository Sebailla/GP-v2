import { describe, it, expect, vi } from "vitest";

import {
  CategoryAlreadyExistsError,
  CategoryNotFoundError,
  type CategoryRepository,
} from "../domain/interfaces/category.repository.js";
import type { AuditLogRepository } from "../domain/interfaces/audit-log.repository.js";
import { CategoryService } from "../domain/services/category.service.js";
import type { Category, CategoryKind } from "../domain/entities/category.entity.js";

/**
 * TDD contract for `CategoryService` (slice 5 PR #3a — T5.9).
 *
 * The service orchestrates the repository + the audit log. It does
 * NOT use the event dispatcher (Category lifecycle is intentionally
 * absent from the 9-event catalog per design §4.7). Idempotency
 * for `softDelete` is provided at the repository layer (P2025 swallow).
 *
 * Test pattern: pure mock ports (no Prisma), so the service-level
 * contract is locked independently of the adapter. Each test builds
 * a minimal mock surface for the two ports the service uses.
 */

function fakeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "Groceries",
    slug: "groceries",
    kind: "expense" as CategoryKind,
    updatedBy: "user-1",
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeService(initial?: {
  category?: Category;
  createError?: unknown;
  updateError?: unknown;
}) {
  const list = vi.fn().mockResolvedValue(initial?.category ? [initial.category] : []);
  const findById = vi.fn().mockResolvedValue(initial?.category ?? null);
  const create = vi.fn().mockResolvedValue(initial?.category ?? fakeCategory());
  const update = vi.fn().mockResolvedValue(initial?.category ?? fakeCategory());
  const softDelete = vi.fn().mockResolvedValue(undefined);
  const append = vi.fn().mockResolvedValue(undefined);

  if (initial?.createError) create.mockRejectedValue(initial.createError);
  if (initial?.updateError) update.mockRejectedValue(initial.updateError);

  const categoryRepo: CategoryRepository = {
    list,
    findById,
    create,
    update,
    softDelete,
  };
  const auditLogRepo: AuditLogRepository = { append } as never;

  const service = new CategoryService(categoryRepo, auditLogRepo);
  return {
    service,
    categoryRepo,
    auditLogRepo,
    list,
    findById,
    create,
    update,
    softDelete,
    append,
  };
}

describe("CategoryService", () => {
  describe("list", () => {
    it("delegates to the repository with the supplied filter", async () => {
      const { service, list } = makeService();
      await service.list({ kind: "expense" });

      expect(list).toHaveBeenCalledTimes(1);
      expect(list).toHaveBeenCalledWith({ kind: "expense" });
    });

    it("defaults to an empty filter when called with no arguments", async () => {
      const { service, list } = makeService();
      await service.list();

      expect(list).toHaveBeenCalledWith({});
    });
  });

  describe("findById", () => {
    it("returns the category when the repository returns one", async () => {
      const cat = fakeCategory();
      const { service, findById } = makeService({ category: cat });
      const result = await service.findById("cat-1");

      expect(findById).toHaveBeenCalledWith("cat-1");
      expect(result).toEqual(cat);
    });

    it("returns null when the repository returns null (missing or soft-deleted)", async () => {
      const { service, findById } = makeService();
      const result = await service.findById("cat-missing");

      expect(findById).toHaveBeenCalledWith("cat-missing");
      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    it("calls the repository with the input + actorId and writes the audit log", async () => {
      const cat = fakeCategory();
      const { service, create, append } = makeService({ category: cat });

      const result = await service.create(
        { name: "Groceries", slug: "groceries", kind: "expense" },
        { actorId: "user-1" },
      );

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        name: "Groceries",
        slug: "groceries",
        kind: "expense",
        actorId: "user-1",
      });
      expect(result).toEqual(cat);

      // The audit log records the create with the projected fields.
      expect(append).toHaveBeenCalledTimes(1);
      expect(append).toHaveBeenCalledWith({
        entityType: "Category",
        entityId: cat.id,
        action: "create",
        actorId: "user-1",
        payload: { name: cat.name, slug: cat.slug, kind: cat.kind },
      });
    });

    it("surfaces CategoryAlreadyExistsError (P2002) without writing the audit log", async () => {
      // The audit log MUST NOT record a failed create — that would
      // pollute the audit trail with phantom writes.
      const { service, create, append } = makeService({
        createError: new CategoryAlreadyExistsError("groceries"),
      });

      await expect(
        service.create(
          { name: "Groceries", slug: "groceries", kind: "expense" },
          { actorId: "user-1" },
        ),
      ).rejects.toBeInstanceOf(CategoryAlreadyExistsError);

      expect(create).toHaveBeenCalledTimes(1);
      expect(append).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("passes actorId through the port + records the changed fields in the audit log", async () => {
      const cat = fakeCategory({ name: "New Name" });
      const { service, update, append } = makeService({ category: cat });

      const result = await service.update(
        "cat-1",
        { name: "New Name" },
        { actorId: "user-2" },
      );

      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith("cat-1", {
        name: "New Name",
        actorId: "user-2",
      });
      expect(result).toEqual(cat);

      // The audit log records the changed fields.
      expect(append).toHaveBeenCalledTimes(1);
      const callArg = (
        vi.mocked(append).mock.calls[0] as unknown as [
          { action: string; payload: { changedFields: string[] } },
        ]
      )[0];
      expect(callArg.action).toBe("update");
      expect(callArg.payload.changedFields).toEqual(["name"]);
    });

    it("surfaces CategoryNotFoundError (D-TX-5 + P2025) without writing the audit log", async () => {
      const { service, update, append } = makeService({
        updateError: new CategoryNotFoundError("cat-missing"),
      });

      await expect(
        service.update(
          "cat-missing",
          { name: "New Name" },
          { actorId: "user-1" },
        ),
      ).rejects.toBeInstanceOf(CategoryNotFoundError);

      expect(update).toHaveBeenCalledTimes(1);
      expect(append).not.toHaveBeenCalled();
    });
  });

  describe("softDelete", () => {
    it("delegates to the repository + records the audit log", async () => {
      const { service, softDelete, append } = makeService();

      await service.softDelete("cat-1", { actorId: "user-1" });

      expect(softDelete).toHaveBeenCalledTimes(1);
      expect(softDelete).toHaveBeenCalledWith("cat-1", "user-1");

      expect(append).toHaveBeenCalledTimes(1);
      const callArg = (
        vi.mocked(append).mock.calls[0] as unknown as [
          { action: string; entityId: string; actorId: string; payload: { at: Date } },
        ]
      )[0];
      expect(callArg.action).toBe("softDelete");
      expect(callArg.entityId).toBe("cat-1");
      expect(callArg.actorId).toBe("user-1");
      expect(callArg.payload.at).toBeInstanceOf(Date);
    });

    it("records the audit log even when the row was already soft-deleted (idempotency audit)", async () => {
      // softDelete is idempotent at the repository layer; the service
      // writes the audit log regardless because the log is the system
      // of record for "user X attempted to delete Y at time Z".
      const { service, softDelete, append } = makeService();
      softDelete.mockResolvedValue(undefined);

      await service.softDelete("cat-already-deleted", { actorId: "user-1" });

      expect(softDelete).toHaveBeenCalledTimes(1);
      expect(append).toHaveBeenCalledTimes(1);
    });
  });
});
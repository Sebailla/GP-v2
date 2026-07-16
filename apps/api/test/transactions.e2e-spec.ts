import "reflect-metadata";

import { describe, expect, it, vi } from "vitest";

/**
 * TDD RED-first e2e for the TransactionsController DI chain
 * (`fix-api-nestjs-di`, slice-9 follow-up).
 *
 * This test exists to prove the LATENT bug class observed in
 * `apps/api/src/modules/auth/auth.controller.ts` lines 16-19 (commit
 * `3db761f`, slice-7 PR-2). The transactions controller carries the
 * same `import { type Service }` pattern on CategoryService,
 * ThresholdService, TransactionService; under
 * `isolatedModules: true` (`tsconfig.base.json` line 10) the
 * `import type` form is erased at compile time and NestJS's
 * reflective DI sees `undefined` for the constructor parameter.
 *
 * Per `openspec/changes/fix-api-nestjs-di/spec.md` G2 + R3 + R7 this
 * test MUST fail with the same `?, ?, ?, ?` pattern as the auth
 * suite BEFORE the controller is fixed and MUST pass after.
 *
 * It exercises ONLY the bootstrap (no route coverage) per Q3
 * resolution: minimum proof of the latent bug. Route coverage
 * already exists in `libs/features/transactions/docs/*.feature`
 * (25/25 PASS per slice-7 close-out `bb25aab`).
 *
 * Mock surface mirrors `auth.e2e-spec.ts` lines 35-52 (boundary
 * mocking of `@core/database`) — the controller delegates to
 * services that each take Prisma as their repo-port. We mock the
 * prisma singleton so the test never opens a real connection.
 */

vi.mock("@core/database", () => ({
  prisma: {
    transaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    category: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    },
    currency: { findUnique: vi.fn() },
    fxRate: { findUnique: vi.fn() },
    idempotencyKey: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})),
  },
}));

import { Test, type TestingModule } from "@nestjs/testing";
import { InMemoryRateLimiter } from "@core/rate-limit";

import { TransactionsModule } from "../src/modules/transactions/transactions.module.js";
import { RATE_LIMITER_TOKEN } from "../src/shared/guards/rate-limit.guard.js";

describe("TransactionsController (DI bootstrap — RED-first)", () => {
  it("bootstraps TransactionsModule without unresolved dependencies", async () => {
    let moduleRef: TestingModule | undefined;
    let bootstrapError: unknown;
    try {
      moduleRef = await Test.createTestingModule({
        imports: [TransactionsModule],
      })
        .overrideProvider(RATE_LIMITER_TOKEN)
        .useValue(new InMemoryRateLimiter())
        .compile();
    } catch (err) {
      bootstrapError = err;
    }

    // RED assertion (BEFORE the controller fix lands, this is the
    // exact message Nest throws):
    //   "Nest can't resolve dependencies of the TransactionsController.
    //    Please make sure that the argument CategoryService at index [0]
    //    is available in the TransactionsModule context."
    // GREEN assertion (AFTER the fix, the module compiles without throwing):
    expect(bootstrapError).toBeUndefined();
    expect(moduleRef).toBeDefined();
  });
});
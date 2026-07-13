# Technical Design — `fix-api-nestjs-di`

> **Status**: draft · design phase
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-api-nestjs-di`
> **Artifact store**: hybrid · **Mode**: interactive · **Delivery**: `auto-chain` (irrelevant — single PR under budget) · **Review budget**: 400 lines · **Single PR**: 10 files, ~245 net LOC
> **Strict TDD**: active (AGENTS.md §4)
> **Fix shape**: C (interactive decision captured in proposal §0)
> **Author**: SDD orchestrator → `sdd-design` executor
> **Date**: 2026-07-13
> **Inputs read**: `proposal.md` (Engram #2287), `spec.md` (Engram #2289, 455 lines, 12 requirements, 11 scenarios, 20 acceptance criteria), `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/design.md` (format reference), `apps/api/src/modules/auth/auth.controller.ts` (219 LOC, lines 16-22 carry `type` on 4 services; comment at L112-118 still references the deleted `_ServiceAnchor`), `apps/api/src/modules/transactions/transactions.controller.ts` (489 LOC, lines 23, 25, 27 carry `type` on 3 services; line 87-90 already has an "AUTO-FORMATTER NOTE" comment), `apps/api/src/modules/{auth,transactions}/{auth,transactions}.module.ts` (provider arrays verified sound), `apps/api/test/{auth.e2e-spec.ts,setup-env.ts}` (bootstrap mocking pattern + env setup), `apps/api/vitest.config.ts` (includes `*.e2e-spec.ts`), `tools/eslint-plugin-boundary/{index.cjs,rules/no-{cross-module-import,client-server-import,prisma-outside-core}.cjs}` (rule shape), `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (runner contract; per-rule `allowMultipleInvalids` opt-in already in place), `tools/eslint-plugin-boundary/__fixtures__/{no-cross-module-import,no-prisma-outside-core}/` (valid.ts + invalid.ts layout; production-path mirrored under fixture dir), `eslint.config.mjs` (89 LOC; boundary plugin applied via recommended config block at lines 67-71; add the new rule there), `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md` (ADR format reference)
> **Resolution of proposal open questions**: Q1 (rule name = `no-import-type-injectable`), Q2 (ADR includes anti-example), Q3 (1-scenario e2e test for transactions) — ALL resolved in spec; this design does not re-litigate them.

---

## Table of contents

1. [Goals ↔ Technical approach mapping](#1-goals--technical-approach-mapping)
2. [File-by-file diffs (10 files)](#2-file-by-file-diffs-10-files)
3. [Execution plan (strict TDD)](#3-execution-plan-strict-tdd)
4. [Atomic commits (8)](#4-atomic-commits-8)
5. [Test execution plan](#5-test-execution-plan)
6. [Risks + mitigations (concrete)](#6-risks--mitigations-concrete)
7. [Out of scope](#7-out-of-scope)
8. [Open questions for tasks phase](#8-open-questions-for-tasks-phase)
9. [Validation criteria for `sdd-verify`](#9-validation-criteria-for-sdd-verify)
10. [Traceability: Spec ↔ Design](#10-traceability-spec--design)
11. [Threat matrix](#11-threat-matrix)
12. [Migration / Rollout](#12-migration--rollout)
13. [Cross-references](#13-cross-references)
14. [Appendix A: `_ServiceAnchor` shape decision (Q4 from proposal, deferred to design)](#14-appendix-a-_serviceanchor-shape-decision-q4-from-proposal-deferred-to-design)

---

## 1. Goals ↔ Technical approach mapping

| Goal | Spec anchor | Technical approach |
|------|-------------|--------------------|
| **G1** — Auth e2e tests flip RED → GREEN | §3 G1, R1, R2, R8 | Edit `apps/api/src/modules/auth/auth.controller.ts`: (a) drop `type` keyword from `AuthService`, `PasswordResetService`, `RbacService`, `SessionService` imports at lines 16, 17, 18, 19 (the `type CurrentUser` at line 22 STAYS — it's a type-only DTO reference, not a constructor param); (b) add `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [AuthService, PasswordResetService, RbacService, SessionService] as const;` as the LAST class member (after the constructor, before the closing `}`). The 21 RED tests in `auth.e2e-spec.ts` (14), `jwt-auth-guard.e2e-spec.ts` (4), `session-expiry.e2e-spec.ts` (3) become GREEN. |
| **G2** — Transactions e2e RED-first proof | §3 G2, R3, R7 | Step 1 (RED): write `apps/api/test/transactions.e2e-spec.ts` FIRST with a single-scenario bootstrap of `TransactionsModule` via `Test.createTestingModule({ imports: [TransactionsModule] }).compile()`. Run; must FAIL with `Nest can't resolve dependencies of the TransactionsController (?, ?, ?)`. Step 2 (GREEN): edit `apps/api/src/modules/transactions/transactions.controller.ts` — drop `type` from `CategoryService` (L23), `ThresholdService` (L25), `TransactionService` (L27); add analogous `_ServiceAnchor` as the LAST field; re-run test → GREEN. |
| **G3** — ESLint rule blocks the regression | §3 G3, R4 | New rule file `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs`. Visitor listens on `ImportDeclaration`. Predicate: (a) the file contains at least one top-level `ClassDeclaration` decorated with `@Controller()` (literal-string check on `Decorator.expression.callee.name === 'Controller'`), AND (b) the class has a constructor whose parameter type annotations reference the imported name (resolves conservatively file-locally via `MethodDefinition` + `FunctionExpression` param + `TSTypeReference` walk), AND (c) the `ImportSpecifier` carries `importKind: 'type'`. Conservative tie-breaker: if the imported symbol cannot be resolved in the same file (e.g. it lives in a different file resolved through tsconfig paths), SKIP — never over-report. Rule registered in `tools/eslint-plugin-boundary/index.cjs` `plugin.rules` map AND in `configs.recommended.rules` (per Q1 resolution). |
| **G4** — `pnpm lint:fixtures` exits 0 | §3 G4, R5, R6 | New fixtures `__fixtures__/no-import-type-injectable/{valid,invalid}.ts`. `valid.ts` includes a controller that imports services as runtime values AND imports a `DTO` type with `import { type DTO }` (allowed). `invalid.ts` includes a controller that uses `import { type FooService }` for a constructor parameter (must trigger ≥1 error). Register fixture directory in `scripts/run-fixtures.mjs` `RULES` array. |
| **G5** — Full turbo pipeline green | §3 G5, R10 | No new code beyond the 10 files in scope; run `pnpm turbo run test bdd lint typecheck` and confirm exit 0 on the `feat/fix-api-nestjs-di` branch. This gate is observable, not engineered. |
| **G6** — ADR 0008 + Spanish mirror | §3 G6, R9, R11, R12 | New `docs/architecture/decisions/0008-no-import-type-injectable.md` (EN) + `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (ES mirror). Per Q2 resolution, the EN ADR includes a small anti-example. Both files pass `grep -P '[\x{4e00}-\x{9fff}]' …` returning empty (CJK-clean). |

**Chain dependencies**:

- G1, G2 → G5 (tests must pass before the full turbo gate).
- G3, G4 → G5 (fixtures must exit 0 before the full turbo gate).
- G6 → independent of G1-G5 (docs can ship in any order; AGENTS.md §13 hard rule bundles EN + ES in the same atomic commit).

---

## 2. File-by-file diffs (10 files)

> **Reading guide**: every file in scope gets the EXACT final content. The design is the source of truth for `sdd-apply`; the apply phase MUST NOT re-derive line numbers or import choices.

---

### File 1 — `apps/api/src/modules/auth/auth.controller.ts` (EDIT, +2 / -2 net)

**Current state** (broken — `type` keyword on 4 services, no `_ServiceAnchor`):

- Lines 15-27 import block carries `type` on `AuthService`, `PasswordResetService`, `RbacService`, `SessionService`, and `CurrentUser`.
- Lines 112-118 still contain the "AUTO-FORMATTER MITIGATION" comment that PROMISES a `_ServiceAnchor` runtime anchor that does not exist in the file.

**Final state**:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import {
  AuthService,
  PasswordResetService,
  RbacService,
  SessionService,
  AuthError,
  ValidationError,
  type CurrentUser,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@features/auth";

import { JwtAuthGuard } from "../../shared/guards/jwt.guard.js";

/**
 * Map an AuthError code to the HTTP status the controller should
 * return. Centralized so every route uses the same mapping; per design
 * §4.1.
 */
function authErrorToHttpStatus(error: AuthError | ValidationError): number {
  if (error instanceof ValidationError) {
    return 400;
  }
  switch (error.code) {
    case "USER_NOT_FOUND":
    case "INVALID_CREDENTIALS":
    case "INVALID_RESET_TOKEN":
    case "INVALID_SESSION":
    case "SESSION_EXPIRED":
      return 401;
    case "EMAIL_ALREADY_EXISTS":
      return 409;
    default:
      return 500;
  }
}

async function runOrThrowHttp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthError) {
      throw new HttpException(
        { error: error.code, message: error.message },
        authErrorToHttpStatus(error),
      );
    }
    if (error instanceof ValidationError) {
      throw new HttpException(
        {
          error: "VALIDATION_FAILED",
          message: error.message,
          issues: error.issues,
        },
        authErrorToHttpStatus(error),
      );
    }
    throw error;
  }
}

function validateOrThrow<T extends import("zod").ZodTypeAny>(
  raw: unknown,
  schema: T,
): import("zod").infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.map((segment) =>
          typeof segment === "symbol" ? String(segment) : segment,
        ),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

/**
 * AuthController (slice 3 batch 6b — T3.6 e2e fix).
 *
 * Per design §2 the controller is a thin DI-wiring + route-binding
 * layer. All business code lives in the auth services exported by
 * `@features/auth`. The controller:
 *  1. Binds each of the 6 design-§4.1 routes to a service method.
 *  2. Validates the body via the canonical Zod schemas (Pattern A:
 *     `validateOrThrow(schema)` — runs before the service is called).
 *  3. Maps service errors to HTTP status codes.
 *  4. Attaches the JWT guard to the two authenticated routes.
 *
 * T3.3 (NextAuth v5 config) is deferred to batch 7; the current
 * JwtAuthGuard is a stub that reads the bearer token and looks up
 * the session via SessionService. Real JWT verification lands later.
 *
 * AUTO-FORMATTER MITIGATION (per ADR 0008): NestJS's reflective DI
 * reads `import { Foo }` symbols as runtime class references, not
 * types. Under `isolatedModules: true` (`tsconfig.base.json` line 10)
 * the `import { type Foo }` form is fully erased at compile time and
 * Nest's container sees `undefined` for the constructor parameter.
 * The harness's biome auto-formatter prefers `import { type Foo }`
 * when the symbol looks like a type-only reference, which silently
 * breaks DI. We defeat that heuristic with a class-level static field
 * that references each service as a VALUE (not a type). After NestJS
 * resolves the constructor at startup, this anchor is unused at
 * runtime; it exists purely to keep the runtime import alive.
 *
 * Enforced by ESLint rule `@gpr/boundary/no-import-type-injectable`
 * (see ADR 0008).
 */
@Controller("/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly passwordResetService: PasswordResetService,
    private readonly rbacService: RbacService,
  ) {}

  @Post("/login")
  @HttpCode(200)
  async login(
    @Body() raw: unknown,
  ): Promise<{ id: string; email: string; role: string; sessionToken: string }> {
    return runOrThrowHttp(async () => {
      const body = validateOrThrow<typeof loginSchema>(raw, loginSchema);
      const result = await this.authService.login(body.email, body.password);
      return {
        id: result.id,
        email: result.email,
        role: result.role,
        sessionToken: result.sessionToken,
      };
    });
  }

  @Post("/register")
  @HttpCode(201)
  async register(
    @Body() raw: unknown,
  ): Promise<{ id: string; email: string; role: string; sessionToken: string }> {
    return runOrThrowHttp(async () => {
      const body = validateOrThrow<typeof registerSchema>(raw, registerSchema);
      const result = await this.authService.register(body.email, body.password, body.name);
      return {
        id: result.id,
        email: result.email,
        role: result.role,
        sessionToken: result.sessionToken,
      };
    });
  }

  @Post("/forgot-password")
  @HttpCode(202)
  async forgotPassword(@Body() raw: unknown): Promise<void> {
    const body = validateOrThrow<typeof forgotPasswordSchema>(raw, forgotPasswordSchema);
    await this.passwordResetService.requestReset(body.email);
  }

  @Post("/reset-password")
  @HttpCode(200)
  async resetPassword(@Body() raw: unknown): Promise<void> {
    return runOrThrowHttp(async () => {
      const body = validateOrThrow<typeof resetPasswordSchema>(raw, resetPasswordSchema);
      await this.passwordResetService.consumeReset(body.token, body.newPassword);
    });
  }

  @Get("/sessions")
  @UseGuards(JwtAuthGuard)
  async listSessions(
    @Req() request: Request & { user: CurrentUser },
  ): Promise<ReadonlyArray<{ id: string; sessionToken: string; expires: Date }>> {
    return runOrThrowHttp(async () => {
      const allowed = this.rbacService.can(
        { id: request.user.id, role: "USER" },
        "session:read:own",
        { kind: "session", ownerId: request.user.id },
      );
      if (!allowed) {
        throw new Error("RbacService denied session:read:own — invariant violation");
      }
      return this.sessionService.listActiveSessions(request.user.id);
    });
  }

  @Delete("/sessions/:id")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async revokeSession(
    @Param("id") sessionId: string,
    @Req() request: Request & { user: CurrentUser },
  ): Promise<void> {
    return runOrThrowHttp(async () => {
      const allowed = this.rbacService.can(
        {
          id: request.user.id,
          role: request.user.role === "ADMIN" ? "ADMIN" : "USER",
        },
        "session:revoke:own",
        { kind: "session", ownerId: request.user.id, id: sessionId },
      );
      if (!allowed) {
        throw new Error("RbacService denied session:revoke:own — invariant violation");
      }
      await this.sessionService.revokeSession(sessionId, request.user.id);
    });
  }

  /**
   * Runtime anchor — LAST field, defensive against future `import type`
   * regressions (see ADR 0008 + ESLint rule
   * `@gpr/boundary/no-import-type-injectable`). The anchor references
   * each service as a VALUE so that even if a future auto-formatter
   * rewrites the import to `import { type Service }`, the symbols
   * remain reachable at runtime.
   */
  private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
    AuthService,
    PasswordResetService,
    RbacService,
    SessionService,
  ] as const;
}
```

**Diff summary**:

- L16: `type AuthService,` → `AuthService,` (drop `type`).
- L17: `type PasswordResetService,` → `PasswordResetService,` (drop `type`).
- L18: `type RbacService,` → `RbacService,` (drop `type`).
- L19: `type SessionService,` → `SessionService,` (drop `type`).
- L22: `type CurrentUser,` STAYS as `type CurrentUser,` (DTO reference, NOT a constructor param; ESLint rule does not fire).
- Comment at L112-118 REWRITTEN to reference ADR 0008 + the ESLint rule + the `isolatedModules` cause.
- New field appended as the LAST class member (before the closing `}` on the class).
- File LOC: 219 → +5 / -3 ≈ 221 LOC (not a budget concern; this single file's edits are within the trivial-edit envelope per AGENTS.md §5).

**NOTE on `CurrentUser`**: `CurrentUser` is a TYPE-only reference (used at L183 `request.user: CurrentUser` as a TS annotation). The spec R1 says "remaining `type` annotations on DTOs and zod-derived schemas NOT used as constructor parameters MUST remain unchanged". `CurrentUser` is a request-extension type — keep `type`. AC1 (`grep -E "type (AuthService|PasswordResetService|RbacService|SessionService)"` returns no matches) does not match `type CurrentUser`.

---

### File 2 — `apps/api/src/modules/transactions/transactions.controller.ts` (EDIT, +5 / -3 net)

**Current state** (latent bug — `type` keyword on 3 services):

- L23: `type CategoryService,`
- L25: `type ThresholdService,`
- L27: `type TransactionService,`
- L34-42: many `type` annotations for DTOs/interfaces (`type Category`, `type CreateCategoryInput`, `type CreateTransactionInput`, `type ListTransactionsQuery`, `type Transaction`, `type TransactionKind`, `type TransactionListItem`, `type UpdateCategoryInput`, `type UpdateTransactionInput`) — these STAY as `type` (per spec R3, only the 3 service imports change).
- L87-90: existing "AUTO-FORMATTER NOTE" comment (different wording than auth's) needs to be updated to reference ADR 0008.

**Final state** (only the import block + new anchor + comment are shown — the rest of the 489-LOC file is unchanged):

```typescript
import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request } from "express";

import {
  CategoryAlreadyExistsError,
  CategoryNotFoundError,
  CategoryService,
  IdempotencyKeyReusedError,
  ThresholdService,
  TransactionNotFoundError,
  TransactionService,
  UnsupportedCurrencyPairError,
  categoryCreateSchema,
  categoryUpdateSchema,
  createSchema,
  listSchema,
  updateSchema,
  type Category,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type ListTransactionsQuery,
  type Transaction,
  type TransactionKind,
  type TransactionListItem,
  type UpdateCategoryInput,
  type UpdateTransactionInput,
} from "@features/transactions";
import { toDecimal } from "@shared-utils/decimal";

import type { CurrentUser } from "@features/auth";

import { JwtAuthGuard } from "../../shared/guards/jwt.guard.js";
import { BodySchema } from "../../shared/decorators/body.decorator.js";
import { QuerySchema } from "../../shared/decorators/query.decorator.js";

/**
 * TransactionsController (slice 5 PR #3 — T5.11).
 *
 * Thin DI-wiring + route-binding layer per design §2 / §5.3. Every
 * endpoint:
 *
 *   1. Mounts under `@UseGuards(JwtAuthGuard)` so every request
 *      carries an authenticated `request.user` (`CurrentUser`
 *      from `@features/auth`). The guard decodes a NextAuth v5 JWT
 *      (slice 3 batch 7) and projects the claims onto `CurrentUser`.
 *   2. Validates the body / query via `@BodySchema` / `@QuerySchema`
 *      (paired with `ZodValidationPipe`). Path params stay raw —
 *      `string` — because the service layer validates ids via the
 *      repository's `findById` boundary (returns `null` for missing
 *      or soft-deleted rows).
 *   3. Delegates to the domain service — TransactionService or
 *      CategoryService. The controller maps domain errors to HTTP
 *      status codes (`NotFoundException`, `ConflictException`,
 *      `BadRequestException`, `UnprocessableEntityException`).
 *
 * POST /transactions additionally requires the `Idempotency-Key`
 * header (D-TX-1 / design §5.4). The header is mandatory; missing
 * it returns 400. The controller computes a SHA-256 fingerprint of
 * the canonical body and forwards both the key and the fingerprint
 * to the service — the service's `idempotencyOrReplay` branch
 * reads the cache and either returns the cached payload (replay)
 * or falls through to the full create path.
 *
 * POST /transactions additionally runs the `ThresholdService.evaluate`
 * AFTER the create returns (per design §5.9 + the design's "the
 * ThresholdService runs in the controller step after create returns"
 * rule). Threshold does NOT block the write — it's a side-effect
 * dispatch for downstream subscribers (notification, audit, slice-6+
 * dashboard).
 *
 * AUTO-FORMATTER MITIGATION (per ADR 0008): NestJS's reflective DI
 * reads `import { Foo }` symbols as runtime class references, not
 * types. Under `isolatedModules: true` (`tsconfig.base.json` line 10)
 * the `import { type Foo }` form is fully erased at compile time and
 * Nest's container sees `undefined` for the constructor parameter.
 * The `_ServiceAnchor` static field references each service as a
 * VALUE so the symbols survive any future biome reformat. Enforced
 * by ESLint rule `@gpr/boundary/no-import-type-injectable`.
 */
@Controller("/transactions")
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly categoryService: CategoryService,
    private readonly thresholdService: ThresholdService,
  ) {}

  // ... (the rest of the 386-line body — create/list/update/softDelete routes,
  //      category routes, projectTransaction, computeRequestFingerprint,
  //      mapServiceError, TransactionResponse interface — stays verbatim)

  /**
   * Runtime anchor — LAST field, defensive against future `import type`
   * regressions (see ADR 0008 + ESLint rule
   * `@gpr/boundary/no-import-type-injectable`). The anchor references
   * each service as a VALUE so that even if a future auto-formatter
   * rewrites the import to `import { type Service }`, the symbols
   * remain reachable at runtime.
   */
  private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
    CategoryService,
    ThresholdService,
    TransactionService,
  ] as const;
}
```

**Diff summary** (only the changed regions):

- L23: `type CategoryService,` → `CategoryService,` (drop `type`).
- L25: `type ThresholdService,` → `ThresholdService,` (drop `type`).
- L27: `type TransactionService,` → `TransactionService,` (drop `type`).
- L34-42: all `type Category`, `type CreateCategoryInput`, etc. STAY as `type` (DTO/interface type-only references, NOT constructor params).
- L87-90 comment: REWRITTEN to reference ADR 0008 + ESLint rule.
- New `_ServiceAnchor` field appended as LAST class member (before closing `}` of the class).
- File LOC: 489 → ~494 (net +5).

**Verification**:

- AC3: `grep -E "type (CategoryService|ThresholdService|TransactionService)" apps/api/src/modules/transactions/transactions.controller.ts` → no matches.
- AC4: `grep -n "_ServiceAnchor" apps/api/src/modules/transactions/transactions.controller.ts` → exactly one match (the field declaration).

---

### File 3 — `apps/api/test/transactions.e2e-spec.ts` (NEW, ~50 LOC)

This is the **RED-first** test. Written BEFORE the controller fix lands. Per spec Q3 resolution: 1 scenario focused on bootstrap.

```typescript
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

import { TransactionsModule } from "../src/modules/transactions/transactions.module.js";

describe("TransactionsController (DI bootstrap — RED-first)", () => {
  it("bootstraps TransactionsModule without unresolved dependencies", async () => {
    let moduleRef: TestingModule | undefined;
    let bootstrapError: unknown;
    try {
      moduleRef = await Test.createTestingModule({
        imports: [TransactionsModule],
      }).compile();
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
```

**WHY minimal**:

- A single `it`-block suffices: the bootstrap is the entire diagnostic signal. NestJS throws at `compile()` if and only if a constructor parameter cannot be resolved. No need for supertest, no need for `INestApplication.init()`, no need for route calls.
- The `bootstrapError` capture surfaces the EXACT Nest error message in the test output when RED.
- Once the GREEN commit lands (transactions.controller.ts value-imports + adds anchor), this same test becomes a regression guard: any future reintroduction of `import type` on a transactions service instantly flips the test back to RED at module resolution.

**Why not mirror `auth.e2e-spec.ts` in full (~304 LOC)**: spec Q3 resolved this. The test's job is RED-first DI proof, not full route coverage. `libs/features/transactions/docs/*.feature` already covers route semantics (25/25 PASS per `bb25aab`).

---

### File 4 — `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (NEW, ~85 LOC)

```javascript
"use strict";

/**
 * Forbid `import { type X }` for NestJS injectable classes referenced
 * from a file decorated with `@Controller()` (or `@Injectable()`).
 *
 * Glob (per design section 3.4 + ADR 0008): **/*.{ts,tsx,js,mjs,cjs}
 * (via the plugin's recommended config).
 *
 * Background: under `isolatedModules: true` in `tsconfig.base.json`,
 * `import type` and `import { type X }` are erased at compile time.
 * NestJS's reflective DI reads `reflect-metadata` from each
 * controller's constructor; if the constructor parameter's class
 * identity has been erased, the DI container sees `undefined` at the
 * positional slot and throws `Nest can't resolve dependencies of the
 * XxxController (?, Object, Object, Object)` — NestJS's own error
 * message literally says "This commonly occurs when using 'import
 * type' instead of 'import' for injectable classes".
 *
 * Predicate (all three conditions must hold to fire):
 *   1. The file contains a top-level `ClassDeclaration` whose
 *      `@Controller()` decorator references the imported name
 *      indirectly (file-local resolution, conservative tie-breaker).
 *   2. The class has a `MethodDefinition(kind=constructor)` whose
 *      parameter type annotations reference the imported binding's
 *      local name. We walk the `TSTypeReference` tree; if the
 *      `typeName` is an `Identifier` whose name matches the binding,
 *      the symbol is in scope.
 *   3. The `ImportSpecifier` (or `ImportDeclaration` as a whole) carries
 *      `importKind: 'type'` — the AST node kind ESLint records when
 *      the source uses either `import type { X }` or
 *      `import { type X }`.
 *
 * Conservative tie-breaker: if the imported symbol cannot be
 * resolved to a same-file reference (e.g. it lives in another file
 * resolved through tsconfig paths / `@features/*` aliases), SKIP —
 * never over-report. False NEGATIVES are accepted; false POSITIVES
 * would erode trust in the rule (slice-1 design §3.4 spirit). The
 * `_ServiceAnchor` static field is the runtime defensive guard; this
 * rule is the lint-time defensive guard. Together they form the
 * ADR 0008 decision.
 *
 * Decorator detection: this rule uses the *literal* decorator-name
 * pattern (`@Controller`, `@Injectable`). It does NOT inspect the
 * decorator's argument list (e.g. `@Controller('auth')`). That's
 * sufficient: any file carrying `@Controller` is a controller, full
 * stop.
 *
 * ESTree subset: the project uses `@typescript-eslint/parser`
 * (configured in eslint.config.mjs lines 14 + 44-52), so node types
 * like `ClassDeclaration`, `MethodDefinition`, `FunctionExpression`,
 * `Identifier`, `TSTypeReference` are all present.
 */

const CONSTRUCTOR_DECORATORS = new Set(["Controller", "Injectable"]);

/**
 * Collect every local-class-anchor: a class in the file whose
 * constructor references an imported binding by name. We return a
 * map { [importedLocalName]: constructorClassName } so the rule can
 * attribute the diagnostic to the right class.
 */
function collectLocalControllerConstructors(program) {
  const anchors = new Map(); // importedLocalName → controllerClassName
  const classNodes = [];

  // Walk Program.body to find top-level ClassDeclarations.
  // ESTree puts top-level declarations in `body`; nested class decls
  // are out of scope (this rule only fires on top-level controllers).
  for (const stmt of program.body || []) {
    if (stmt.type !== "ClassDeclaration") continue;
    if (!stmt.decorators || stmt.decorators.length === 0) continue;
    // Coarse decorator check: any of stmt.decorators.expression.callee.name
    // is in CONSTRUCTOR_DECORATORS.
    const hasDecorator = stmt.decorators.some((d) => {
      const expr = d.expression;
      if (!expr) return false;
      if (expr.type === "Identifier") {
        return CONSTRUCTOR_DECORATORS.has(expr.name);
      }
      // Decoration like @Controller('auth') — the callee is an
      // Identifier wrapping the args list.
      if (
        expr.type === "CallExpression" &&
        expr.callee &&
        expr.callee.type === "Identifier"
      ) {
        return CONSTRUCTOR_DECORATORS.has(expr.callee.name);
      }
      return false;
    });
    if (!hasDecorator) continue;
    classNodes.push(stmt);
  }

  for (const cls of classNodes) {
    const clsName = cls.id && cls.id.name;
    if (!clsName) continue;
    for (const member of cls.body.body || []) {
      if (member.type !== "MethodDefinition") continue;
      if (member.kind !== "constructor") continue;
      if (member.value.type !== "FunctionExpression") continue;
      for (const param of member.value.params || []) {
        // TS-ESTree emits parameter types as `.typeAnnotation` on
        // an Identifier node, OR as a top-level TSTypeAnnotation
        // node (TS 4.7+). We accept both.
        collectReferencedNames(param, anchors, clsName);
      }
    }
  }

  return anchors;
}

/**
 * Recursively walk a node and record every Identifier whose name
 * appears as a type reference (i.e. used in type position). We
 * don't try to distinguish "type" from "value" usage — any
 * reference inside a constructor param is good enough signal for
 * "this symbol is consumed by the controller".
 */
function collectReferencedNames(node, anchors, clsName) {
  if (!node || typeof node !== "object") return;
  if (node.type === "Identifier" && node.name) {
    anchors.set(node.name, clsName);
    return;
  }
  // Recurse over the well-known child keys; do NOT recurse into
  // every property (cost). The keys below cover the TS-ESTree
  // shapes that nest type references.
  for (const key of [
    "typeAnnotation",
    "typeParameters",
    "elementType",
    "typeName",
    "returnType",
    "typeArguments",
    "params",
    "elements",
    "members",
    "body",
    "expression",
    "declaration",
    "init",
    "argument",
    "arguments",
    "callee",
  ]) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) collectReferencedNames(c, anchors, clsName);
    } else if (child && typeof child === "object") {
      collectReferencedNames(child, anchors, clsName);
    }
  }
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid `import { type X }` for NestJS injectable classes (decorated with @Injectable or referenced as a @Controller constructor parameter). Under isolatedModules: true, type imports are erased at compile time and NestJS reflective DI cannot resolve the class.",
      category: "Architectural boundaries",
      recommended: false,
    },
    schema: [],
    messages: {
      forbiddenImportType:
        "Use a value import (drop `type`) for `{{name}}` in '{{file}}' because it is referenced from the constructor of @{{decorator}}-decorated class `{{className}}`. NestJS reflective DI cannot resolve type-erased classes under `isolatedModules: true`. See ADR 0008.",
    },
  },

  create(context) {
    const filename = context.filename || context.getFilename();

    // Two-pass strategy:
    //   pass 1 (Program enter): collect { localName → className } for
    //   every constructor parameter type annotation in every
    //   @Controller / @Injectable class in this file.
    //   pass 2 (ImportDeclaration): for every `import { type X }`
    //   specifier, check if X is in the anchors map; if yes, report.
    //
    // The Program-enter collection makes the rule cheap on Import
    // visits: each ImportDeclaration is O(specifiers).

    const anchorsByLocalName = new Map();
    let topDecorator = "Controller"; // best-effort, used for the diagnostic only

    return {
      Program(node) {
        const collected = collectLocalControllerConstructors(node);
        for (const [k, v] of collected) anchorsByLocalName.set(k, v);
        // (Diagnostic decoration name is controller-agnostic; we just
        // emit "Controller" because @Injectable classes are rare.)
        topDecorator = "Controller";
      },
      ImportDeclaration(node) {
        // Fast bail: only consider `import { type X }` or
        // `import type { X }`. Either shows up in the AST as
        // `node.importKind === 'type'` OR per-specifier
        // `importKind === 'type'`.
        if (!node.specifiers || node.specifiers.length === 0) return;
        for (const spec of node.specifiers) {
          if (spec.type !== "ImportSpecifier") continue;
          const isTypeImport =
            node.importKind === "type" || spec.importKind === "type";
          if (!isTypeImport) continue;
          const localName = spec.local && spec.local.name;
          if (!localName) continue;
          const className = anchorsByLocalName.get(localName);
          if (!className) continue; // conservative skip — not a constructor param
          context.report({
            node: spec,
            messageId: "forbiddenImportType",
            data: {
              name: localName,
              file: filename,
              decorator: topDecorator,
              className,
            },
          });
        }
      },
    };
  },
};
```

**Known false-NEGATIVE cases (documented in the rule comment)**:

1. **Cross-file imports**: `import { type FooService } from "@features/auth"` where `FooService` is exported from a different file — the rule has no cross-file resolution and SKIPS. The `_ServiceAnchor` static field on the consumer class is the runtime fallback; the production lint pass will see the anchor field as a `static readonly _ServiceAnchor` reference (the rule's `Program` walk picks up field references too — see [Appendix A] for an optional V2 enhancement). V1 is intentionally narrow to avoid false positives.

2. **`@Injectable()` decorator on services** (rare in this repo): the rule fires when EITHER the consumer class has `@Controller`/`@Injectable` AND references the symbol in a constructor; if a future `@Injectable()`-decorated service references another injectable via its constructor, the rule fires. The 7 services in `apps/api/src/modules/{auth,transactions}/` are NOT `@Injectable()` (per Hexagonal design §2) — the rule's anchor list starts empty for those, which is the desired outcome.

3. **`as const` or Mapped types**: the rule walks `Identifier` nodes in type positions; generic arguments, mapped types, and conditional types all carry type-position identifiers, and any match against the local name triggers the rule. This is correct behavior.

**Acceptance** — the rule body is intentionally ~85 LOC. V2 enhancements (cross-file resolution, fine-grained severity per decorator kind) are deferred.

---

### File 5 — `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` (NEW, ~30 LOC)

The valid fixture exercises two allowed patterns in one file:

```typescript
/**
 * VALID fixture for `no-import-type-injectable`.
 *
 * This file contains a @Controller-decorated class that:
 *   (a) imports services as RUNTIME values (no `type` keyword) — the
 *       correct pattern enforced by the rule, AND
 *   (b) imports a DTO via `import { type X }` for use as a
 *       parameter type annotation only — also allowed because the
 *       DTO is NOT used as a constructor parameter.
 *
 * The rule's predicate requires `(spec.importKind === 'type')` AND
 * the imported name appears in a constructor parameter type. Both
 * conditions fail here: (a) imports have no `type`; (b) the DTO is
 * used in a method body parameter type, NOT a constructor.
 */

import { AuthService, SessionService } from "@features/auth";
import type { CreateUserInput } from "@features/auth/shared/schemas";

@Controller("/example")
export class ExampleController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}

  @Post("/users")
  async create(@Body() body: CreateUserInput): Promise<void> {
    // `CreateUserInput` is a type-only reference in the method body,
    // not a constructor param. Even though the import uses
    // `import type`, this file MUST NOT trigger the rule.
    return this.auth.register(body.email, body.password, body.name);
  }
}
```

**Why this works** (and what it triangulates):

- The 2 services (`AuthService`, `SessionService`) are imported as values — the rule ignores value imports.
- `CreateUserInput` IS imported with `type`, but it appears as a method parameter type, not a constructor parameter. The rule's predicate requires the type-imported symbol to be in the constructor's anchor set, which only collects from `member.kind === "constructor"` — method bodies are skipped.
- ESLint will report **0 errors** here. The runner accepts it as the GREEN valid case.

---

### File 6 — `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` (NEW, ~30 LOC)

The invalid fixture exercises the exact bug pattern from `auth.controller.ts`:

```typescript
/**
 * INVALID fixture for `no-import-type-injectable`.
 *
 * This file is a @Controller-decorated class that imports an
 * injectable service with `import { type AuthService }` and uses
 * AuthService as a constructor parameter type. Under
 * `isolatedModules: true` the `type` keyword erases the runtime
 * import; NestJS DI sees `undefined` and throws at bootstrap.
 *
 * The rule MUST fire here, reporting at least one diagnostic.
 */

import { type AuthService } from "@features/auth";

@Controller("/auth")
export class BadController {
  constructor(private readonly auth: AuthService) {}

  @Get("/me")
  async me(): Promise<{ ok: boolean }> {
    return { ok: Boolean(this.auth) };
  }
}
```

**Why this triggers the rule**:

1. The file has a `ClassDeclaration` with a `@Controller()` decorator.
2. The class has a `MethodDefinition(kind=constructor)` whose parameter type annotation uses `AuthService`.
3. `AuthService` is the local name of an `ImportSpecifier` with `importKind === 'type'`.
4. ALL three conditions in `collectLocalControllerConstructors` + `ImportDeclaration` visit match → the rule reports.

**Runner acceptance**: `errorCount >= 1`, `fatalErrorCount === 0`, exits 0 overall.

---

### File 7 — `tools/eslint-plugin-boundary/index.cjs` (EDIT, +3 / -0)

Three places to touch in `index.cjs`. Final snippet showing ONLY the diffs (rest of the file unchanged):

```javascript
"use strict";

/**
 * Local ESLint plugin enforcing the vertical-slicing architecture
 * boundaries for gastos-personales-reference.
 *
 * Six non-negotiable rules + one optional doc-mirror rule:
 *
 *   - no-client-server-import
 *   - no-cross-module-import
 *   - no-import-type-injectable      ← NEW (fix-api-nestjs-di)
 *   - no-prisma-outside-core
 *   - no-schemas-outside-shared
 *   - no-mojibake-in-docs (optional)
 *
 * The plugin's `recommended` config wires the rules with the
 * globs from design section 3.4. The runner script
 * `scripts/run-fixtures.mjs` exercises each rule against its
 * valid/invalid fixture pair so a silent regression is caught at
 * fixture time.
 */

const noClientServerImport = require("./rules/no-client-server-import.cjs");
const noCrossModuleImport = require("./rules/no-cross-module-import.cjs");
const noImportTypeInjectable = require("./rules/no-import-type-injectable.cjs"); // ← NEW
const noPrismaOutsideCore = require("./rules/no-prisma-outside-core.cjs");
const noSchemasOutsideShared = require("./rules/no-schemas-outside-shared.cjs");
const noMojibakeInDocs = require("./rules/no-mojibake-in-docs.cjs");

// Build the plugin object in two steps so configs can reference `plugin`
// without tripping the temporal dead zone.
const plugin = {
  meta: {
    name: "@gpr/eslint-plugin-boundary",
    version: "0.0.0",
  },
  rules: {
    "no-client-server-import": noClientServerImport,
    "no-cross-module-import": noCrossModuleImport,
    "no-import-type-injectable": noImportTypeInjectable, // ← NEW
    "no-prisma-outside-core": noPrismaOutsideCore,
    "no-schemas-outside-shared": noSchemasOutsideShared,
    "no-mojibake-in-docs": noMojibakeInDocs,
  },
};

// Attach configs after the plugin object exists.
plugin.configs = {
  recommended: {
    plugins: {
      "@gpr/boundary": plugin,
    },
    rules: {
      "@gpr/boundary/no-prisma-outside-core": "error",
      "@gpr/boundary/no-schemas-outside-shared": "error",
      "@gpr/boundary/no-import-type-injectable": "error", // ← NEW (per Q1 resolution)
      "@gpr/boundary/no-mojibake-in-docs": "error",
    },
  },
  // ... (client-only + features-only configs unchanged)
};

module.exports = plugin;
```

**Verification**:

- AC7: `grep "no-import-type-injectable" tools/eslint-plugin-boundary/index.cjs` returns ≥2 matches (one in the `require` line, one in `plugin.rules`, one in `configs.recommended.rules` — actually 3 matches; AC7's "≥2" passes).

---

### File 8 — `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (EDIT, +1 / -0)

ONE line to add in the `RULES` array (after `no-cross-module-import`, before `no-mojibake-in-docs`):

```javascript
const RULES = [
  { name: "no-client-server-import" },
  { name: "no-prisma-outside-core" },
  { name: "no-schemas-outside-shared" },
  { name: "no-cross-module-import" },
  { name: "no-import-type-injectable" }, // ← NEW (fix-api-nestjs-di)
  // `no-mojibake-in-docs` opts in to multiple invalid fixtures so the
  // triangulation case (CJK on a non-first line) can land alongside the
  // primary fixture (CJK on first lines). Both must still report >=1 CJK.
  { name: "no-mojibake-in-docs", allowMultipleInvalids: true },
];
```

**No other runner edits needed**. The runner's per-rule loop already handles single-invalid `.ts` rules (the new rule does NOT need `allowMultipleInvalids`). The fixture glob `**/invalid*.ts` matches the new `invalid.ts`. The ESLint config applying ONLY the named rule (lines 91-108) auto-handles the new rule.

**Verification**:

- AC8: `grep "no-import-type-injectable" tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` returns exactly 1 match (the `RULES` array entry).

**Note on `eslint.config.mjs` (NOT a separate file in scope)**: the workspace-level `eslint.config.mjs` lines 67-71 spread `boundary.configs.recommended` onto `**/*.{ts,tsx,js,mjs,cjs}`. The new rule is registered in `configs.recommended.rules` (File 7, third edit), so production code gets `pnpm turbo run lint` enforcement AUTOMATICALLY — no extra wiring in `eslint.config.mjs` required. This is the "single source of truth" property AGENTS.md §8 names; the rule lives once in `configs.recommended` and is consumed twice (runner + workspace lint).

---

### File 9 — `docs/architecture/decisions/0008-no-import-type-injectable.md` (NEW, EN, ~70 LOC)

```markdown
# ADR 0008 — Forbid `import { type X }` for NestJS injectable classes in @Controller files

- **Status**: Accepted
- **Date**: 2026-07-13
- **Deciders**: Sebastián Illa (sole maintainer) + `sdd-verify` sub-agent
- **Context**: Slice `fix-api-nestjs-di` of `gastos-personales-reference`

## Context and problem statement

Slice 7 PR-2 (commit `3db761f`, "remove unused imports + auto-formatter anchor") rewrote
`import { AuthService, … }` to `import { type AuthService, … }` AND deleted the runtime
anchor `private static readonly _ServiceAnchor = [AuthService, …]` in
`apps/api/src/modules/auth/auth.controller.ts`. Under `isolatedModules: true`
(`tsconfig.base.json` line 10) the `import type` form is fully erased at compile time,
so NestJS's reflective DI sees `undefined` for the constructor parameter at index `[0]`
and throws `Nest can't resolve dependencies of the AuthController (?, Object, Object, Object)`
— NestJS's own error literally says "This commonly occurs when using 'import type' instead
of 'import' for injectable classes". Slice-8 verify (`develop@ea7732f`) recorded this
under follow-up F1 of ADR 0007 as Gate 3 / pre-existing slice-7 debt.

The same `import { type X }` pattern was latent in
`apps/api/src/modules/transactions/transactions.controller.ts` (lines 23, 25, 27) for
`CategoryService`, `ThresholdService`, `TransactionService`. No e2e test exercised
`TransactionsModule`, so the bug class had been silently shipping since slice 5.

## Decision

We adopt the following rule for ALL NestJS controllers in this monorepo:

> Class services that are referenced from a file decorated with `@Controller()`
> MUST be imported using a value import (NOT `import { type X }`). The controller
> MUST additionally declare a `private static readonly _ServiceAnchor` field
> referencing all such services as a runtime anchor to defend against future
> `import type` regressions.

This rule is enforced by three independent guards:

1. The new ESLint rule `@gpr/boundary/no-import-type-injectable` (added by this change)
   in `tools/eslint-plugin-boundary/rules/`.
2. The `_ServiceAnchor` static field convention (stylistic but enforced by review).
3. CI: `pnpm lint:fixtures` exercises the rule's fixtures; `pnpm turbo run lint` applies
   the rule globally via `boundary.configs.recommended`.

## Anti-example (DO NOT do this)

```typescript
// auth.controller.ts — BROKEN; will fail at NestJS bootstrap with
//   "Nest can't resolve dependencies of the AuthController (?, Object, Object, Object)".
import { type AuthService, type SessionService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}
  // No `_ServiceAnchor` runtime anchor — the two `type` imports are erased
  // at compile time and the controller's constructor parameters resolve to
  // `undefined` at runtime.
}
```

## Correct pattern

```typescript
// auth.controller.ts — FIXED; NestJS reflective DI resolves the
//   constructor parameters at runtime.
import { AuthService, SessionService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}

  /**
   * Runtime anchor — LAST field, defensive against future `import type`
   * regressions. Enforced by `@gpr/boundary/no-import-type-injectable`.
   */
  private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
    AuthService,
    SessionService,
  ] as const;
}
```

## Consequences

**Positive**:

- All 21 currently-failing auth e2e tests pass (`auth.e2e-spec.ts` 14 + `jwt-auth-guard.e2e-spec.ts` 4 + `session-expiry.e2e-spec.ts` 3).
- The latent transactions DI bug is closed (verified by the new `transactions.e2e-spec.ts`).
- The ESLint rule blocks future regressions automatically in CI.

**Negative**:

- Every NestJS controller in the codebase must follow the rule. The fix does NOT
  retroactively audit controllers beyond `AuthController` and `TransactionsController`;
  the ESLint rule will surface any other violations on the next `pnpm lint:fixtures`
  run. Per spec §4 non-goal #15, no other controller receives a `_ServiceAnchor` in
  this slice — the rule covers them at lint time only.
- The rule's predicate is conservative (file-local resolution only); see ADR body.

## References

- Proposal: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`)
- Spec: `openspec/changes/fix-api-nestjs-di/spec.md` (Engram `#2289`; R1-R12)
- Design: `openspec/changes/fix-api-nestjs-di/design.md` §2 File 4 (rule body)
- Tasks: `openspec/changes/fix-api-nestjs-di/tasks.md`
- Regression source: commit `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor")
- Smoking gun: NestJS error — "This commonly occurs when using 'import type' instead of 'import' for injectable classes"
- `tsconfig.base.json` line 10: `"isolatedModules": true` — the compile-time predicate that erases `import type`
- Follow-up F1 of ADR 0007 (`docs/architecture/decisions/0007-slice-8-doc-loc-exception.md`)
- Mirror (Spanish): `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md`
```

---

### File 10 — `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (NEW, ES mirror, ~75 LOC)

Per AGENTS.md §13 — Spanish translation of File 9, technical and literal, NOT cultural. Code fences stay verbatim in English (the bilingual split is structural: prose-translated, code-frozen). CJK-clean by construction (hand-written, no auto-translation pipeline).

```markdown
# ADR 0008 — Prohibir `import { type X }` para clases inyectables de NestJS en archivos con `@Controller`

- **Estado**: Aceptada
- **Fecha**: 2026-07-13
- **Decisores**: Sebastián Illa (mantenedor único) + sub-agente `sdd-verify`
- **Contexto**: Slice `fix-api-nestjs-di` de `gastos-personales-reference`

## Contexto y planteamiento del problema

El PR-2 del slice 7 (commit `3db761f`, "remove unused imports + auto-formatter anchor")
reescribió `import { AuthService, … }` a `import { type AuthService, … }` Y eliminó el ancla
de runtime `private static readonly _ServiceAnchor = [AuthService, …]` en
`apps/api/src/modules/auth/auth.controller.ts`. Bajo `isolatedModules: true`
(`tsconfig.base.json` línea 10) la forma `import type` se borra completamente en tiempo
de compilación, por lo que el DI reflexivo de NestJS ve `undefined` para el parámetro del
constructor en el índice `[0]` y lanza `Nest can't resolve dependencies of the AuthController
(?, Object, Object, Object)` — el propio mensaje de error de NestJS dice literalmente "This
commonly occurs when using 'import type' instead of 'import' for injectable classes". La
verificación del slice-8 (`develop@ea7732f`) registró este caso bajo el seguimiento F1 del
ADR 0007 como Gate 3 / deuda preexistente del slice-7.

El mismo patrón `import { type X }` estaba latente en
`apps/api/src/modules/transactions/transactions.controller.ts` (líneas 23, 25, 27) para
`CategoryService`, `ThresholdService`, `TransactionService`. Ningún test e2e ejercía
`TransactionsModule`, por lo que esta clase de bug se había estado enviando silenciosamente
desde el slice 5.

## Decisión

Adoptamos la siguiente regla para TODOS los controllers de NestJS en este monorepo:

> Las clases de servicio que se referencian desde un archivo decorado con
> `@Controller()` DEBEN importarse usando un import de valor (NO `import { type X }`).
> El controller DEBE además declarar un campo `private static readonly _ServiceAnchor`
> que referencie todos esos servicios como ancla de runtime para defenderse contra
> regresiones futuras de `import type`.

Esta regla se enforce mediante tres guardias independientes:

1. La nueva regla ESLint `@gpr/boundary/no-import-type-injectable` (añadida por este
   cambio) en `tools/eslint-plugin-boundary/rules/`.
2. La convención del campo estático `_ServiceAnchor` (estilística pero enforced por
   review).
3. CI: `pnpm lint:fixtures` ejercita los fixtures de la regla; `pnpm turbo run lint`
   aplica la regla globalmente vía `boundary.configs.recommended`.

## Anti-ejemplo (NO hacer esto)

```typescript
// auth.controller.ts — ROTO; fallará al bootstrap de NestJS con
//   "Nest can't resolve dependencies of the AuthController (?, Object, Object, Object)".
import { type AuthService, type SessionService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}
  // Sin ancla de runtime `_ServiceAnchor` — los dos imports `type` se borran
  // en tiempo de compilación y los parámetros del constructor resuelven a
  // `undefined` en runtime.
}
```

## Patrón correcto

```typescript
// auth.controller.ts — CORREGIDO; el DI reflexivo de NestJS resuelve los
//   parámetros del constructor en runtime.
import { AuthService, SessionService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}

  /**
   * Ancla de runtime — ÚLTIMO campo, defensiva contra regresiones futuras
   * de `import type`. Enforced por `@gpr/boundary/no-import-type-injectable`.
   */
  private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
    AuthService,
    SessionService,
  ] as const;
}
```

## Consecuencias

**Positivas**:

- Los 21 tests e2e de auth que actualmente fallan pasan (`auth.e2e-spec.ts` 14 +
  `jwt-auth-guard.e2e-spec.ts` 4 + `session-expiry.e2e-spec.ts` 3).
- El bug latente de DI en transactions queda cerrado (verificado por el nuevo
  `transactions.e2e-spec.ts`).
- La regla ESLint bloquea regresiones futuras automáticamente en CI.

**Negativas**:

- Todo controller de NestJS en el codebase debe seguir la regla. El fix NO audita
  retroactivamente controllers más allá de `AuthController` y `TransactionsController`;
  la regla ESLint surfaceará cualquier otra violación en la próxima ejecución de
  `pnpm lint:fixtures`. Según spec §4 non-goal #15, ningún otro controller recibe un
  `_ServiceAnchor` en este slice — la regla los cubre solo en lint time.
- El predicado de la regla es conservador (resolución solo a nivel de archivo local);
  ver cuerpo del ADR.

## Referencias

- Propuesta: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`)
- Spec: `openspec/changes/fix-api-nestjs-di/spec.md` (Engram `#2289`; R1-R12)
- Diseño: `openspec/changes/fix-api-nestjs-di/design.md` §2 File 4 (cuerpo de la regla)
- Tareas: `openspec/changes/fix-api-nestjs-di/tasks.md`
- Fuente de la regresión: commit `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor")
- Smoking gun: error de NestJS — "This commonly occurs when using 'import type' instead of 'import' for injectable classes"
- `tsconfig.base.json` línea 10: `"isolatedModules": true` — el predicado en tiempo de compilación que borra `import type`
- Seguimiento F1 del ADR 0007 (`docs/architecture/decisions/0007-slice-8-doc-loc-exception.md`)
```

**CJK-clean guarantee**: the ES file was hand-written from the EN source. No auto-translation pipeline was invoked. The only Spanish characters used are standard extended-Latin (á, é, í, ó, ú, ñ — none of which fall in the `U+4E00`–`U+9FFF` CJK range). Verification: `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` → exit 1.

---

## 3. Execution plan (strict TDD)

> 8 steps. Every RED is observed BEFORE the GREEN. Every TRIANGULATE follows GREEN.

### Step 1 — RED (transactions e2e test)

**Action**: write `apps/api/test/transactions.e2e-spec.ts` (File 3 content above).
**Verify RED**: `pnpm --filter api test transactions.e2e-spec` exits non-zero; the captured `bootstrapError` contains `Nest can't resolve dependencies of the TransactionsController`.

**Expected output (verbatim)**:
```
FAIL  apps/api/test/transactions.e2e-spec.ts > TransactionsController (DI bootstrap — RED-first) > bootstraps TransactionsModule without unresolved dependencies
Error: Nest can't resolve dependencies of the TransactionsController (?).
Please make sure that the argument CategoryService at index [0] is available
in the TransactionsModule context.
```

**Capture**: the exact phrase `bootstrapError.toBeUndefined()` is the predicate that flips RED → GREEN.

### Step 2 — GREEN (transactions controller)

**Action**: edit `apps/api/src/modules/transactions/transactions.controller.ts` — drop `type` on L23/L25/L27, add `_ServiceAnchor` field as LAST class member, update the L87-90 comment.
**Verify GREEN**: `pnpm --filter api test transactions.e2e-spec` exits 0 with 1/1 PASS.

### Step 3 — GREEN (auth controller)

**Action**: edit `apps/api/src/modules/auth/auth.controller.ts` — drop `type` on L16-L19 (keep `type CurrentUser` at L22), add `_ServiceAnchor` field as LAST class member, update the L112-118 comment.
**Verify GREEN**: `pnpm --filter api test` exits 0 with 21/21 PASS for `auth.e2e-spec.ts` (14) + `jwt-auth-guard.e2e-spec.ts` (4) + `session-expiry.e2e-spec.ts` (3); plus 1/1 PASS for the new `transactions.e2e-spec.ts` (22 total).

### Step 4 — TRIANGULATE (rule RED fixture)

**Action**: add `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` (File 6). Wire the rule stub: create `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` but with a TEMPORARY body that intentionally reports 0 errors (e.g. an empty `module.exports.create = () => ({})`). Add the rule to `index.cjs` (File 7) and the runner (File 8). Run `pnpm lint:fixtures`.
**Expected output (RED)**: `FAIL no-import-type-injectable/invalid.ts (errors=0)` — the fixture expects ≥1 but the empty rule body reports 0.

This step proves the runner + fixture infrastructure is wired BEFORE we trust the rule's logic.

### Step 5 — GREEN (rule body)

**Action**: replace the temporary stub body of `no-import-type-injectable.cjs` with the full File 4 content.
**Verify GREEN**: `pnpm lint:fixtures` reports:
```
PASS  no-import-type-injectable/valid.ts  (errors=0)
PASS  no-import-type-injectable/invalid.ts  (errors>=1)
```
exit 0 on the rule's loop.

### Step 6 — TRIANGULATE (valid fixture)

**Action**: add `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` (File 5) — note: this fixture was MISSING from Step 4 to force a focused RED on the `invalid` case first. Now it's added.
**Verify GREEN**: `pnpm lint:fixtures` reports 0/≥1 across both fixtures, exit 0 overall.

### Step 7 — GREEN (ADR)

**Action**: write `docs/architecture/decisions/0008-no-import-type-injectable.md` (File 9) + `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (File 10) in the SAME atomic commit (AGENTS.md §13).
**Verify CLEAN**: `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` returns exit 1 (no match). Same for the EN file.

### Step 8 — REFACTOR (verify)

**Action**: run the full turbo pipeline.
**Verify**: `pnpm turbo run test bdd lint typecheck` exits 0 on all 4 tasks. `pnpm lint:fixtures` exits 0. `pnpm --filter api test` exits 0 with 22/22 PASS.

---

## 4. Atomic commits (8)

> Work-unit aligned (AGENTS.md §5). Every commit is independently revertible. The ADR + ES mirror are fused into ONE commit (AGENTS.md §13 hard rule). Type vocabulary per AGENTS.md §6. No `Co-Authored-By`. Subjects ≤ 72 chars, imperative, no trailing period.

| # | Commit hash (placeholder) | Type | Subject | Files | TDD phase |
|---|---------------------------|------|---------|-------|-----------|
| 1 | TBD | `test` | `test(api): RED — add transactions.e2e-spec proving latent DI bug` | `apps/api/test/transactions.e2e-spec.ts` (NEW, +50 / 0) | RED (Step 1) |
| 2 | TBD | `fix` | `fix(api): transactions.controller.ts — drop type kw + restore _ServiceAnchor` | `apps/api/src/modules/transactions/transactions.controller.ts` (EDIT, +5 / -3) | GREEN transactions (Step 2) |
| 3 | TBD | `fix` | `fix(api): auth.controller.ts — drop type kw + restore _ServiceAnchor` | `apps/api/src/modules/auth/auth.controller.ts` (EDIT, +5 / -3) | GREEN auth (Step 3) |
| 4 | TBD | `feat` | `feat(eslint): wire no-import-type-injectable rule scaffolding (rule body stub + fixtures dir + runner entry + plugin registration)` | `tools/eslint-plugin-boundary/index.cjs` (+3 / 0), `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (+1 / 0), `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` (NEW, +30), `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (NEW, +5 — empty stub) | RED rule wiring (Step 4) |
| 5 | TBD | `feat` | `feat(eslint): implement no-import-type-injectable rule body` | `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (EDIT, +85 / -5) | GREEN rule (Step 5) |
| 6 | TBD | `feat` | `feat(eslint): add valid.ts triangulation fixture for no-import-type-injectable` | `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` (NEW, +30) | TRIANGULATE (Step 6) |
| 7 | TBD | `docs` | `docs(adr): ADR 0008 — forbid import type for NestJS injectables in controllers (EN + ES mirror)` | `docs/architecture/decisions/0008-no-import-type-injectable.md` (NEW, +70), `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (NEW, +75) | ADR (Step 7) |
| 8 | TBD | `chore` | `chore(api): verify turbo test+bdd+lint+typecheck exits 0` | (no file changes; turbo gate) | REFACTOR (Step 8) |

**Totals**: 8 commits, +250 / -16 ≈ +234 net LOC (within budget). PR diff vs `develop` includes commits 1-7; commit 8 is empty (chore-only verification — can be elided at the orchestrator's option, but inlining it gives the reviewer a final touch-point).

**Single-PR** (no auto-chain): 250 LOC additions / 16 deletions sits comfortably under the 400-line review budget. Per spec §1 Delivery field.

---

## 5. Test execution plan

| Spec goal | Scenario | Test command | Expected outcome |
|-----------|----------|--------------|------------------|
| **G1.1** | Auth e2e flips RED → GREEN | `pnpm --filter api test auth.e2e-spec` | exit 0; 14/14 PASS |
| **G1.2** | JWT auth guard e2e flips RED → GREEN | `pnpm --filter api test jwt-auth-guard.e2e-spec` | exit 0; 4/4 PASS |
| **G1.3** | Session expiry e2e flips RED → GREEN | `pnpm --filter api test session-expiry.e2e-spec` | exit 0; 3/3 PASS |
| **G2.1** | Transactions e2e RED → GREEN | `pnpm --filter api test transactions.e2e-spec` | BEFORE fix: exit non-zero (Nest can't resolve). AFTER fix: exit 0; 1/1 PASS |
| **G3.1** | Rule blocks controller case | `pnpm lint:fixtures` (invalid.ts) | invalid fixture reports ≥1 error |
| **G3.2** | Rule allows DTO `import type` | `pnpm lint:fixtures` (valid.ts) | valid fixture reports 0 errors |
| **G3.3** | Rule skips unresolved symbols | (manual check; rule's `collectLocalControllerConstructors` returns empty map when the import lives in another file → SKIPS) | the rule does NOT fire on `import { type ExternalService } from "@features/external"` |
| **G4.1** | `pnpm lint:fixtures` exits 0 | `pnpm lint:fixtures` | exit 0; valid=0 errors, invalid≥1 error |
| **G5.1** | Full turbo pipeline green | `pnpm turbo run test bdd lint typecheck` | exit 0 on all 4 tasks |
| **G6.1** | ADR + ES mirror CJK-clean | `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` | empty output (no CJK) |
| **G6.2** | ADR contains anti-example | `grep -c "^## Anti-example" docs/architecture/decisions/0008-no-import-type-injectable.md` | ≥1 match |
| **G6.3** | ADR cites regression source | `grep -c "3db761f" docs/architecture/decisions/0008-no-import-type-injectable.md` | ≥1 match |

---

## 6. Risks + mitigations (concrete)

> Mirrors proposal §7 R1-R6 with the concrete mitigation that this design adopts (not a one-line restatement).

| ID | Risk | Likelihood | Concrete mitigation in this design |
|----|------|------------|------------------------------------|
| **R1** | Auth controller fix breaks an `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` internal because their factories miss a hidden dependency. | Low | The 4 services live in `@features/auth` (NOT touched by this design). `auth.module.ts` (File 7 reference: verified provider array) registers all 4 with `useFactory` and zero constructor args. Step 3 GREEN `pnpm --filter api test` is the empirical check — any provider-wiring regression surfaces as a `compile()` failure with a Nest error message pointing at the provider name, not the controller. If a test still fails AFTER the controller edit, the failure mode is `Nest can't resolve dependencies of the …Service` (provider issue), distinct from `?` (controller issue). |
| **R2** | New ESLint rule false-positives on legitimate `import { type X }` for DTOs / interfaces. | Med | The rule's predicate is **narrow AND** (cf. File 4 §"Predicate"): it requires (a) `importKind === 'type'`, AND (b) the imported name appears in a `@Controller`/`@Injectable` class's constructor parameter type annotation. DTOs and interfaces are NOT constructor parameters of a controller/injectable — they appear in method parameter types, return types, or `implements` clauses. The `valid.ts` fixture (File 5) exercises `import type { CreateUserInput }` in a method-body `@Body()` parameter type and asserts 0 violations. The TRIANGULATE Step 6 fixes it before trust is extended to the production pass. |
| **R3** | Biome or another auto-formatter re-introduces `type` on the 4+3 imports. | Low | The new ESLint rule is wired into `boundary.configs.recommended.rules` (File 7) and runs as part of `pnpm turbo run lint`. CI fails any re-introduction. The `_ServiceAnchor` static fields are a SECOND independent defense — even if the formatter defeats the import line, the static field's `AuthService` reference keeps the symbol reachable at runtime. The rule's error message (File 4 `messages.forbiddenImportType`) explicitly names the file + class + symbol so a future maintainer sees the conflict immediately. |
| **R4** | The 3 currently-skipped/failing e2e files could have a `skip` / `todo` decorator that we miss. | Low | Step 3 RED requires running `pnpm --filter api test --reporter=verbose` and asserting every scenario in `auth.e2e-spec.ts` (14), `jwt-auth-guard.e2e-spec.ts` (4), `session-expiry.e2e-spec.ts` (3) actually executes `compile()`. The verify step G1 enumerates the 21 explicitly. If a test carries `it.skip` or `it.todo`, vitest's reporter prefixes the scenario with `(skip)` or `(todo)` and the count "21/21 PASS" cannot be reached. AC11 (`pnpm --filter api test` exit 0) is the binary gate. |
| **R5** | The new ESLint rule's AST logic mis-fires on generic type arguments (`Param<T>`) or decorator arguments (`@Controller('auth')`). | Low | The rule walks `Identifier` nodes with conservative recursion (cf. File 4 `collectReferencedNames`). Generic arguments, mapped types, and conditional types all carry type-position identifiers — any match against the local name triggers the rule, which is the correct behavior (a type-erased generic instantiation breaks DI just as a type-erased class does). Decorator argument inspection (`@Controller('auth')`) is handled by the `CallExpression` branch in the `hasDecorator` predicate; the route string is ignored. The valid fixture (File 5) imports `CreateUserInput` as `import type` in a method parameter — the rule does NOT fire (because the symbol is NOT in the constructor's anchor set). |
| **R6** | The Spanish mirror ships with CJK drift. | Low | The mirror is hand-written from the EN ADR (File 9), not auto-translated. AGENTS.md §13 forbids the auto-translation pipeline (which leaves CJK codepoints as drift). Verify step G6.1 runs `grep -P '[\x{4e00}-\x{9fff}]'` against the ES file and asserts exit 1 (no match). Same grep applied to the EN file (defensive). The future `no-mojibake-in-docs` rule (slice-8 8.3 + ESLint config lines 78-82) catches drift at lint time once `@eslint/markdown` is fully active (which it IS today per `eslint.config.mjs` lines 60-64 — the rule is enforced on the production `Documents-es/**/*.md` glob). |

---

## 7. Out of scope

> Restated from spec §4 + proposal §2.2 (mirrors AGENTS.md §11). The orchestrator MUST NOT add items here without a new SDD change.

1. Refactoring `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` / `CategoryService` / `ThresholdService` / `TransactionService` internals.
2. Adding `@Injectable()` decorators to the 7 services (would violate Hexagonal design §2: "domain code is framework-free").
3. Migration of the slice-1 reference scaffold pattern to a different DI mechanism (`useClass`, `useFactory: ... inject[]`, or a runtime anchor persisted as a different shape).
4. Touching `AuthModule` / `TransactionsModule` provider arrays — wiring is sound (verified in File 8 reference). The bug is upstream of provider resolution.
5. New BDD scenarios beyond the 1 minimal RED transactions e2e test (per Q3 resolution).
6. Any change to `apps/web` / `libs/features/*/client/*` (the fix is API-only).
7. Any change to `tsconfig.base.json` (`isolatedModules: true` is correct for the project's module system; the bug is in the import choice, not the config).
8. Any change to Prisma client wiring, env config, or `@core/database`.
9. Coverage gate enforcement at CI (AGENTS.md §11).
10. Migration of `gastos-personales/` to the vertical-slicing model (AGENTS.md §11; the playbook ships separately in slice-8 8.4).
11. i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening, observability, audit log UI (AGENTS.md §11).
12. Refactoring `tools/eslint-plugin-boundary` to TypeScript (rules are `.cjs`; converting is its own change).
13. Replacing the controller's error handling, logging shape, response projection, or HTTP status mapping.
14. Replacing `@features/auth` / `@features/transactions` barrel-export resolution (no need — the fix is at the import site, not the package layout).
15. Adding `_ServiceAnchor` to any other controller besides `AuthController` and `TransactionsController` (per spec §4 non-goal #15; these are the only two NestJS controllers in `apps/api/` carrying the bug class).

---

## 8. Open questions for tasks phase

**None expected.** All three proposal open questions (Q1, Q2, Q3) were resolved in the spec phase (Engram #2289, §11 "Open Questions — RESOLVED"). `sdd-tasks` proceeds with the 8-commit / 3-step execution plan above as its canonical input.

If `sdd-tasks` discovers a new blocker during task planning (e.g. a fixture-path collision with an existing rule), it MUST escalate via `mem_judge` per Engram protocol — NOT silently expand scope.

---

## 9. Validation criteria for `sdd-verify`

`sdd-verify` will check the following, ALL of which this design enables to PASS deterministically:

### Functional gates

1. **All 21 auth e2e tests pass**: `pnpm --filter api test auth.e2e-spec jwt-auth-guard.e2e-spec session-expiry.e2e-spec` → exit 0; reporter shows 21 PASS.
2. **New transactions e2e test passes**: `pnpm --filter api test transactions.e2e-spec` → exit 0; 1/1 PASS.
3. **`pnpm lint:fixtures` exits 0**: `bash pnpm lint:fixtures` → exit 0; stdout reports `PASS  no-import-type-injectable/valid.ts  (errors=0)` AND `PASS  no-import-type-injectable/invalid.ts  (errors>=1)`.
4. **`pnpm turbo run test bdd lint typecheck` exits 0**: on `feat/fix-api-nestjs-di`; all 4 tasks report exit code 0.
5. **AC1-AC20** (spec §9): every acceptance criterion passes its grep / file-presence / exit-code test.

### Hygiene gates (per AGENTS.md §12 pre-commit checklist)

6. **No `Co-Authored-By`**: `git log feat/fix-api-nestjs-di --pretty=format:"%B" | grep -i "co-authored-by"` → empty.
7. **No amendment of `main`**: `git log main -1` still shows `ea7732f` after the PR merges (or whatever the latest `develop` HEAD was pre-PR).
8. **No amendment of slice-7 chain evidence**: `git show 3db761f` and `git show a9b550d` and `git show bb25aab` return the original commit SHAs verbatim.
9. **ADR + ES mirror in the SAME atomic commit**: `git log --diff-filter=A --pretty=format:"%H" -- docs/architecture/decisions/0008-no-import-type-injectable.md Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md | wc -l` → 1 (both files share a single add-commit).

### ADR-specific gates

10. **ADR contains anti-example**: `grep -c "^## Anti-example" docs/architecture/decisions/0008-no-import-type-injectable.md` → ≥1.
11. **ADR cites regression source**: `grep -c "3db761f" docs/architecture/decisions/0008-no-import-type-injectable.md` → ≥1.
12. **Both ADR files CJK-clean**:
    ```bash
    grep -P '[\x{4e00}-\x{9fff}]' docs/architecture/decisions/0008-no-import-type-injectable.md
    grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md
    ```
    Both exit 1 (no match).
13. **`_ServiceAnchor` is the LAST field** in both controllers (R12 SHOULDs):
    ```bash
    grep -n "_ServiceAnchor" apps/api/src/modules/auth/auth.controller.ts
    grep -n "_ServiceAnchor" apps/api/src/modules/transactions/transactions.controller.ts
    ```
    Both show the field declaration as the LAST class member (line number > constructor line number, < closing `}` line number).

---

## 10. Traceability: Spec ↔ Design

| Spec requirement | Spec scenarios | Design section | File(s) |
|------------------|---------------|----------------|---------|
| **R1** — `auth.controller.ts` value-imports the 4 services | G1.1-G1.3 | §2 File 1 | `auth.controller.ts` |
| **R2** — `auth.controller.ts` restores `_ServiceAnchor` | G1.1-G1.3, G3.4 anchor-last | §2 File 1 | `auth.controller.ts` |
| **R3** — `transactions.controller.ts` value-imports the 3 services + adds anchor | G2.1, G3.4 | §2 File 2 | `transactions.controller.ts` |
| **R4** — New ESLint rule exists with conservative predicate | G3.1, G3.2, G3.3 | §2 File 4 | `no-import-type-injectable.cjs` |
| **R5** — Rule registered in plugin + recommended config + runner | G3.1-G3.3 | §2 Files 7, 8 | `index.cjs`, `run-fixtures.mjs` |
| **R6** — Rule has valid + invalid fixtures | G4.1 | §2 Files 5, 6 | `__fixtures__/no-import-type-injectable/{valid,invalid}.ts` |
| **R7** — RED-first transactions e2e test exists | G2.1 | §2 File 3, §3 Step 1 | `transactions.e2e-spec.ts` |
| **R8** — 21 previously-failing auth e2e scenarios all pass | G1.1, G1.2, G1.3 | §3 Step 3 | (test files unchanged; controller fix in File 1) |
| **R9** — ADR 0008 + ES mirror CJK-clean | G6.1 | §2 Files 9, 10 | `0008-no-import-type-injectable.md` (EN+ES) |
| **R10** — Full turbo pipeline green | G5.1 | §3 Step 8 | (no file; verification gate) |
| **R11** (SHOULD) — ADR cites regression-source commit `3db761f` | G6.1 | §2 File 9 References | `0008-no-import-type-injectable.md` |
| **R12** (SHOULD) — `_ServiceAnchor` is LAST field in each controller | G3.4 anchor-last | §2 Files 1, 2 | `auth.controller.ts`, `transactions.controller.ts` |

### Goal ↔ Design cross-walk

| Goal | Design sections delivering it |
|------|-------------------------------|
| **G1** | §2 File 1; §3 Step 3; §5 G1.1-G1.3 |
| **G2** | §2 File 3; §2 File 2; §3 Step 1 (RED), Step 2 (GREEN); §5 G2.1 |
| **G3** | §2 File 4; §2 File 7; §2 File 8; §5 G3.1-G3.3 |
| **G4** | §2 File 5; §2 File 6; §3 Step 4 (RED wiring), Step 5 (GREEN body), Step 6 (TRIANGULATE); §5 G4.1 |
| **G5** | §3 Step 8; §5 G5.1 |
| **G6** | §2 File 9; §2 File 10; §3 Step 7; §5 G6.1-G6.3 |

### Acceptance criterion ↔ design section

| AC | §2 file | §3 step | §4 commit |
|----|---------|---------|-----------|
| AC1 (no `type Service` in auth) | File 1 | Step 3 | #3 |
| AC2 (`_ServiceAnchor` last field, auth) | File 1 | Step 3 | #3 |
| AC3 (no `type Service` in transactions) | File 2 | Step 2 | #2 |
| AC4 (`_ServiceAnchor` last field, transactions) | File 2 | Step 2 | #2 |
| AC5 (transactions.e2e-spec.ts exists) | File 3 | Step 1 | #1 |
| AC6 (rule file exists) | File 4 | Step 5 | #5 |
| AC7 (rule in `plugin.rules` + `configs.recommended`) | File 7 | Step 4 | #4 |
| AC8 (rule in `RULES` array) | File 8 | Step 4 | #4 |
| AC9 (fixtures exist) | Files 5, 6 | Steps 4, 6 | #4, #6 |
| AC10 (`pnpm lint:fixtures` exits 0) | Files 4-6 | Steps 5, 6 | #5, #6 |
| AC11 (`pnpm --filter api test` exits 0, 21/21 + 1/1) | Files 1-3 | Steps 2, 3 | #2, #3 |
| AC12 (`pnpm turbo run test bdd lint typecheck` exits 0) | (gate) | Step 8 | #8 |
| AC13 (ADR EN exists) | File 9 | Step 7 | #7 |
| AC14 (ADR ES mirror exists) | File 10 | Step 7 | #7 |
| AC15 (both ADRs CJK-clean) | Files 9, 10 | Step 7 | #7 |
| AC16 (EN ADR contains anti-example) | File 9 (Anti-example section) | Step 7 | #7 |
| AC17 (EN ADR cites `3db761f`) | File 9 (References section) | Step 7 | #7 |
| AC18 (no `main` mutation) | (branch discipline) | n/a | n/a |
| AC19 (no `Co-Authored-By`) | (commit hygiene) | n/a | n/a |
| AC20 (single PR targets `develop`) | (PR creation) | n/a | n/a |

---

## 11. Threat matrix

> Per `sdd-design` §Step 2a: this design does NOT change routing, shell commands, subprocesses, VCS/PR automation, executable-file classification, or process integration. The threat matrix is therefore **N/A — none of these boundaries is touched by `fix-api-nestjs-di`**.

| Row category | Applicable? | Reason |
|--------------|-------------|--------|
| Routing changes | N/A | No HTTP route additions; the existing controller routes continue to bind to the same paths. |
| Shell commands / subprocesses | N/A | No new shell scripts; `pnpm lint:fixtures`, `pnpm turbo run test bdd lint typecheck`, `pnpm --filter api test` are existing turbo/pnpm commands re-used without modification. |
| VCS / PR automation | N/A | Single PR against `develop`; no GitHub Actions changes; no branch-automation scripts. |
| Executable-file classification | N/A | No new binaries; no chmod changes; no `.env.example` updates. |
| Process integration | N/A | No new long-running processes; the controller's Nest bootstrap is unchanged in shape (only the import metadata). |

---

## 12. Migration / Rollout

> Per slice-1 design §3 + the `git revert` precedent (ADR 0007): no data migration, no feature flag, no phased rollout. The change is a **fix** with two production-code files (`auth.controller.ts`, `transactions.controller.ts`), five new artifacts (test + rule + 2 fixtures + ADR-ES), and one wiring edit (plugin + runner).

### Per-file rollback

| Sub-change | `git revert <sha>` effect |
|------------|--------------------------|
| Commits #1 (RED test) | The test reverts; `transactions.e2e-spec.ts` disappears. `pnpm --filter api test` returns to its original 21-FAIL state. No production code is affected. |
| Commits #2-3 (controller fixes) | The 21 auth tests + new transactions test return to RED (same `Nest can't resolve dependencies` error). Rollback is **idempotent** with the bug class this change was created to fix — they're equivalent. |
| Commits #4-6 (rule + fixtures) | Reverts the plugin / runner / fixture files. ESLint returns to its 5-rule baseline. No production code is affected. The 4 fixed rules (`no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`) continue to enforce. |
| Commit #7 (ADR + ES) | Reverts the documentation. The rule's decision rationale lives in commit message + `openspec/changes/fix-api-nestjs-di/spec.md` even after the ADR deletion. No runtime impact. |
| Commit #8 (verify chore) | Empty commit; revert is a no-op. |

### Whole-change rollback

`git revert <merge-sha>` of the PR on `develop` undoes the entire change cleanly. The 21 e2e tests return to their previously-broken state (the same state they were in at `develop@ea7732f` per slice-8 verify F1 observation). The boundary plugin returns to 5 rules; the 4 existing rules remain intact.

### MUST NOT do

- Force-push, rewrite history, touch `main`, modify `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/`, or amend commits `3db761f`, `a9b550d`, `bb25aab`.
- Re-introduce `type` on any of the 4+3 service imports even after reverting — the rule would catch any reintroduction in CI.

---

## 13. Cross-references

- **Proposal**: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`)
- **Spec**: `openspec/changes/fix-api-nestjs-di/spec.md` (Engram `#2289`)
- **Explore brief**: `openspec/changes/fix-api-nestjs-di/explore.md` (Engram `#2286`)
- **Root-cause commit**: `3db761f` (slice-7 PR-2)
- **Smoking-gun error**: NestJS's "This commonly occurs when using 'import type' instead of 'import' for injectable classes"
- **`tsconfig.base.json`**: line 10 (`isolatedModules: true`) — the compile-time predicate that erases `import type`
- **Modified files**:
  - `apps/api/src/modules/auth/auth.controller.ts` (219 LOC → ~221 LOC)
  - `apps/api/src/modules/transactions/transactions.controller.ts` (489 LOC → ~494 LOC)
- **New files**:
  - `apps/api/test/transactions.e2e-spec.ts` (~50 LOC)
  - `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (~85 LOC)
  - `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` (~30 LOC)
  - `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` (~30 LOC)
  - `docs/architecture/decisions/0008-no-import-type-injectable.md` (~70 LOC, EN)
  - `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (~75 LOC, ES mirror)
- **Wiring edits**:
  - `tools/eslint-plugin-boundary/index.cjs` (+3 LOC)
  - `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (+1 LOC)
- **Module wiring (sound)**: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/modules/transactions/transactions.module.ts`
- **Failing tests (21)**: `apps/api/test/{auth,jwt-auth-guard,session-expiry}.e2e-spec.ts`
- **Boundary plugin**: `tools/eslint-plugin-boundary/index.cjs` + `scripts/run-fixtures.mjs` + 5 existing rules
- **ADR precedent**: `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md`
- **Slice-8 follow-up (F1 of ADR 0007)**: this change closes Gate 3 of slice-8 verify.
- **Project conventions**: AGENTS.md §2 (branch), §4 (strict TDD), §5 (atomic commits), §6 (Conventional Commits, no AI attribution), §7 (boundary plugin), §8 (single source of truth), §11 (out-of-scope), §13 (Spanish mirror)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`
- **Format reference**: `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/design.md`
- **Next phase**: `sdd-tasks` (will produce `openspec/changes/fix-api-nestjs-di/tasks.md` aligned with the 8 commits in §4).

---

## 14. Appendix A: `_ServiceAnchor` shape decision (Q4 from proposal, deferred to design)

> The proposal §10 Q4 asked: "should both controllers share a single canonical shape (`_ServiceAnchor = [ServiceA, ServiceB] as const`), or each controller names its own anchor (`_AuthServiceAnchor`, `_TransactionServiceAnchor`)?"

**Decision**: **canonical shape — `_ServiceAnchor = [...] as const` on both controllers**.

**Rationale**:

1. **Symmetry**: Future maintainers reading the 2 controllers side-by-side see the same field name on each. Grep for `_ServiceAnchor` across the codebase returns ALL controller anchors uniformly.
2. **`as const` immutability**: TypeScript's `as const` gives the tuple type `readonly [AuthService, typeof PasswordResetService, typeof RbacService, typeof SessionService]` which is structurally identical to the runtime array. The advantage over per-controller naming (`_AuthServiceAnchor`) is that the field name documents its role (a service anchor), not its scope. The role-oriented name is more language-neutral.
3. **`private static readonly` visibility**: `private` means the field is invisible outside the class; ESLint / TS strict mode enforces no usage at runtime. `static` means it lives on the class, not an instance — fine for compile-time erasure defense.
4. **`ReadonlyArray<unknown>` annotation**: the explicit type widens the array's element type so future services of different shapes (e.g. a service whose constructor signature is `new (a: A, b: B) => Service`) can be added without TypeScript complaining. The runtime value is still `[AuthService, PasswordResetService, …]` (the tuple of class references).
5. **Last field**: matches the existing "AUTO-FORMATTER MITIGATION" comment in the auth controller at L112-118 of the pre-fix file. The comment was kept by `3db761f` even after the field was deleted; restoring the field as LAST honors the original author's intent.

**Final shape** (used in Files 1 and 2):

```typescript
private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
  AuthService,
  PasswordResetService,
  RbacService,
  SessionService,
] as const;
```

The transactions controller's anchor mirrors this exact shape with the 3 transactions services:

```typescript
private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
  CategoryService,
  ThresholdService,
  TransactionService,
] as const;
```

---

## 15. Document footer

**Phase**: design · completed in this session.
**Status**: success · design artifact produced.
**Artifact persistence**: this design MUST be persisted in TWO places (hybrid artifact store):
- File: `openspec/changes/fix-api-nestjs-di/design.md` (this file, English source-of-truth)
- Engram: `topic_key=sdd/fix-api-nestjs-di/design`, `project=gp-v2`, `scope=project`, `type=architecture`, `capture_prompt=false`

**Next phase**: `sdd-tasks` — will read this design + the spec and produce a TDD-aligned task plan with checkboxes matching the 8 commits and 8 execution steps above.

**Apply phase readiness**: this design gives `sdd-apply` everything needed. The 10 file diffs include the exact final content (where reasonable) or the exact lines to edit (where file size exceeds the inline budget). No re-derivation required.

**Memory hygiene**: no proactive `mem_save` from this design phase — the artifact store writes the Engram observation as part of the persistence step in the wrapping protocol. `mem_save` is NOT called here because the design itself is the artifact; persisting twice would create a duplicate. The Engram topic_key `sdd/fix-api-nestjs-di/design` is reserved for the orchestrator's persistence step.

**Spanish mirror of THIS design**: per AGENTS.md §13 + the precedent at `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/design.md` (no ES mirror was generated for that design file either — the rule fires on `.md` files under `docs/` and `openspec/changes/.../{proposal,spec}.md`, NOT on `design.md` itself). The ES mirror rule applies to the ADR (Files 9, 10) only.

**Hard rules honored**:

- AGENTS.md §2: feature branch `feat/fix-api-nestjs-di` cut from `develop`; no `main` mutation.
- AGENTS.md §4: strict TDD — RED captured in Step 1 before any production fix.
- AGENTS.md §5: 8 atomic commits, every commit is a work-unit.
- AGENTS.md §6: Conventional Commits, no AI attribution, subjects ≤ 72 chars, no trailing period.
- AGENTS.md §7: ESLint boundaries preserved (no Prisma, no cross-module import, no client-server import introduced).
- AGENTS.md §8: single source of truth — Zod schemas / Prisma client / cross-module events unchanged.
- AGENTS.md §11: out-of-scope list honored (15 items, mirrored from spec).
- AGENTS.md §13: EN + ES ADR land in the SAME atomic commit (#7).

---

**END OF DESIGN**.

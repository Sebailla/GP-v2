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

  // ---- /transactions ----

  @Post()
  @HttpCode(201)
  async create(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @BodySchema(createSchema) body: CreateTransactionInput,
    @Req() request: Request & { user: CurrentUser },
  ): Promise<TransactionResponse> {
    if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
      throw new BadRequestException({
        error: "IDEMPOTENCY_KEY_REQUIRED",
        message: "POST /transactions requires the Idempotency-Key header (D-TX-1).",
      });
    }
    // R1-004 — cap the Idempotency-Key at the boundary. A multi-megabyte
    // header would bloat the request pipeline (ZodValidationPipe +
    // cache write + DB column) without ever matching a previous key.
    // 128 chars matches the cursor cap on `listSchema`.
    const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
    if (idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      throw new BadRequestException({
        error: "IDEMPOTENCY_KEY_TOO_LONG",
        message: `POST /transactions requires the Idempotency-Key header to be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
      });
    }
    const fingerprint = computeRequestFingerprint(body);

    let transaction: Transaction;
    try {
      transaction = await this.transactionService.create(this.toServiceCreateInput(body), {
        userId: request.user.id,
        actorId: request.user.id,
        idempotencyKey,
        requestFingerprint: fingerprint,
      });
    } catch (err) {
      throw mapServiceError(err, {
        IdempotencyKeyReused: () =>
          new ConflictException({
            error: "IDEMPOTENCY_KEY_REUSED",
            message: "The Idempotency-Key was previously used with a different request payload.",
          }),
        CategoryNotFound: (id) =>
          new NotFoundException({
            error: "CATEGORY_NOT_FOUND",
            message: `Category "${id}" not found or already soft-deleted.`,
          }),
        UnsupportedCurrencyPair: (from, to) =>
          new UnprocessableEntityException({
            error: "UNSUPPORTED_CURRENCY_PAIR",
            message: `No FX rate configured for ${from} → ${to}.`,
          }),
      });
    }

    // Threshold evaluation runs AFTER the create succeeds. Per design §5.9,
    // it is informational — it does NOT block the write. The threshold
    // service dispatches `transactions.threshold.exceeded` internally when
    // crossed; the controller doesn't surface the result. Failures here
    // (e.g. a downstream subscriber that throws) MUST NOT surface as 500
    // because the transaction is already persisted — the idempotency-key
    // cache protects against duplicate creation on retry, but a 500
    // would lose the threshold event with no recovery path. Log + continue
    // (R3-001 review finding).
    try {
      await this.thresholdService.evaluate(transaction);
    } catch (err) {
      // TODO(slice-7): structured logger once NestJS Logger is wired.
      // For now, swallow + log to stderr so the 201 path is preserved.
      // The project's ESLint config loads the @typescript-eslint parser
      // only — the `no-console` rule is not registered (id 2155
      // discovery); a disable directive would fail with "rule not
      // found", so we rely on the runtime console.error without
      // suppressing the lint signal.
      console.error(
        "[transactions.controller] threshold evaluation failed; transaction persisted",
        { transactionId: transaction.id, error: err },
      );
    }

    return projectTransaction(transaction);
  }

  @Get()
  async list(
    @QuerySchema(listSchema) query: ListTransactionsQuery,
    @Req() request: Request & { user: CurrentUser },
  ): Promise<{
    readonly items: ReadonlyArray<TransactionListItem>;
    readonly nextCursor: string | null;
  }> {
    // Spread conditionally so the call satisfies
    // `exactOptionalPropertyTypes: true` (the service-layer filter
    // forbids `undefined` on optional fields; omitting them via
    // spread is the canonical escape hatch).
    const filter = {
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.pageSize !== undefined ? { pageSize: query.pageSize } : {}),
      ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
      ...(query.fromDate !== undefined ? { fromDate: query.fromDate } : {}),
      ...(query.toDate !== undefined ? { toDate: query.toDate } : {}),
      ...(query.currencyCode !== undefined ? { currencyCode: query.currencyCode } : {}),
    };
    const page = await this.transactionService.list(request.user.id, filter);
    return {
      items: page.rows,
      nextCursor: page.cursor,
    };
  }

  @Patch("/:id")
  async update(
    @Param("id") id: string,
    @BodySchema(updateSchema) body: UpdateTransactionInput,
    @Req() request: Request & { user: CurrentUser },
  ): Promise<TransactionResponse> {
    try {
      const transaction = await this.transactionService.update(
        id,
        this.toServiceUpdateInput(body),
        request.user.id,
      );
      return projectTransaction(transaction);
    } catch (err) {
      throw mapServiceError(err, {
        TransactionNotFound: (notFoundId) =>
          new NotFoundException({
            error: "TRANSACTION_NOT_FOUND",
            message: `Transaction "${notFoundId}" not found or already soft-deleted.`,
          }),
        CategoryNotFound: (catId) =>
          new NotFoundException({
            error: "CATEGORY_NOT_FOUND",
            message: `Category "${catId}" not found or already soft-deleted.`,
          }),
      });
    }
  }

  @Delete("/:id")
  @HttpCode(204)
  async softDelete(
    @Param("id") id: string,
    @Req() request: Request & { user: CurrentUser },
  ): Promise<void> {
    try {
      await this.transactionService.softDelete(id, request.user.id);
    } catch (err) {
      if (err instanceof TransactionNotFoundError) {
        // Soft-delete is idempotent at the repository layer (P2025
        // swallow); the service surfaces `TransactionNotFoundError`
        // only when the call lands on a truly non-existent row. We
        // accept the soft-deleted case as success (204) and reserve
        // 404 for the genuinely-missing case. The slice's design
        // §5.3 marks DELETE as "204 on success" — re-deleting a
        // soft-deleted row is a no-op, not an error.
        throw new NotFoundException({
          error: "TRANSACTION_NOT_FOUND",
          message: `Transaction "${id}" not found.`,
        });
      }
      throw err;
    }
  }

  // ---- /categories ----

  @Get("/categories")
  async listCategories(): Promise<Category[]> {
    return this.categoryService.list();
  }

  @Post("/categories")
  @HttpCode(201)
  async createCategory(
    @BodySchema(categoryCreateSchema) body: CreateCategoryInput,
    @Req() request: Request & { user: CurrentUser },
  ): Promise<Category> {
    try {
      return await this.categoryService.create(
        {
          name: body.name,
          slug: body.slug,
          kind: body.kind,
        },
        { actorId: request.user.id },
      );
    } catch (err) {
      if (err instanceof CategoryAlreadyExistsError) {
        throw new ConflictException({
          error: "CATEGORY_ALREADY_EXISTS",
          message: `Category with slug "${err.slug}" already exists.`,
        });
      }
      throw err;
    }
  }

  @Patch("/categories/:id")
  async updateCategory(
    @Param("id") id: string,
    @BodySchema(categoryUpdateSchema) body: UpdateCategoryInput,
    @Req() request: Request & { user: CurrentUser },
  ): Promise<Category> {
    // Spread conditionally so the patch matches the service-layer's
    // `exactOptionalPropertyTypes`-strict input shape.
    const patch = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
    };
    try {
      return await this.categoryService.update(id, patch, {
        actorId: request.user.id,
      });
    } catch (err) {
      if (err instanceof CategoryNotFoundError) {
        throw new NotFoundException({
          error: "CATEGORY_NOT_FOUND",
          message: `Category "${err.id}" not found or already soft-deleted.`,
        });
      }
      throw err;
    }
  }

  @Delete("/categories/:id")
  @HttpCode(204)
  async softDeleteCategory(
    @Param("id") id: string,
    @Req() request: Request & { user: CurrentUser },
  ): Promise<void> {
    // Soft-delete is idempotent at the repository layer (P2025
    // swallow); the service writes an audit-log row even when the
    // category was already deleted. We let it succeed silently.
    await this.categoryService.softDelete(id, { actorId: request.user.id });
  }

  // ---- private mapping helpers ----

  /**
   * Project the Zod-validated body to the service's `CreateTransactionInput`.
   * The service uses `Decimal` (decimal.js), but the controller receives
   * `number` (the Zod schema coerces with `z.coerce.number()`). The
   * conversion lives here — never at the schema boundary (the slice-wide
   * Decimal vocabulary would leak into the wire contract).
   *
   * The auth context flows through `TransactionServiceContext` (the
   * second argument of `create`), not through the input body. Keeping
   * user-identity out of the input shape makes accidental caller-side
   * tampering type-impossible.
   */
  private toServiceCreateInput(
    body: CreateTransactionInput,
  ): Parameters<TransactionService["create"]>[0] {
    return {
      amount: toDecimal(String(body.amount)),
      currencyCode: body.currencyCode,
      kind: body.kind as TransactionKind,
      categoryId: body.categoryId,
      notes: body.notes ?? null,
      occurredAt: body.occurredAt,
      reportingCurrencyCode: body.currencyCode,
      reportingAmount: null,
      fxRateId: null,
    };
  }

  /**
   * Same shape as the create input minus the unset fields. `undefined`
   * fields are dropped before the call; `null` is preserved (the
   * service layer treats `null` as "clear this column").
   */
  private toServiceUpdateInput(
    body: UpdateTransactionInput,
  ): Parameters<TransactionService["update"]>[1] {
    const result: Record<string, unknown> = { updatedBy: "" };
    if (body.amount !== undefined) result["amount"] = toDecimal(String(body.amount));
    if (body.currencyCode !== undefined) result["currencyCode"] = body.currencyCode;
    if (body.kind !== undefined) result["kind"] = body.kind;
    if (body.categoryId !== undefined) result["categoryId"] = body.categoryId;
    if (body.notes !== undefined) result["notes"] = body.notes;
    if (body.occurredAt !== undefined) result["occurredAt"] = body.occurredAt;
    return result as Parameters<TransactionService["update"]>[1];
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
    CategoryService,
    ThresholdService,
    TransactionService,
  ] as const;
}

// ---- module-private helpers ----

/**
 * Compute a SHA-256 fingerprint of the canonical request body. The
 * service uses the fingerprint to detect an idempotency replay with a
 * different payload (D-TX-1) — same key + same fingerprint = cache hit;
 * same key + different fingerprint = 409. The fingerprint MUST be
 * deterministic; `JSON.stringify` on the Zod-validated body is
 * deterministic because the schema `.strict()`s unknown keys and the
 * field order is fixed by the schema declaration.
 */
function computeRequestFingerprint(body: CreateTransactionInput): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

/**
 * Canonical response shape for a single `Transaction`. Mirrors the
 * idempotency cache payload (decimal-as-string + ISO timestamps) so
 * a replay returns the SAME wire bytes as the first call — that is
 * the contract D-TX-1 promises to clients.
 */
interface TransactionResponse {
  id: string;
  amount: string;
  currencyCode: string;
  kind: TransactionKind;
  reportingAmount: string | null;
  reportingCurrencyCode: string | null;
  fxRateId: string | null;
  categoryId: string;
  notes: string | null;
  occurredAt: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function projectTransaction(t: Transaction): TransactionResponse {
  return {
    id: t.id,
    amount: t.amount.toString(),
    currencyCode: t.currencyCode,
    kind: t.kind,
    reportingAmount: t.reportingAmount === null ? null : t.reportingAmount.toString(),
    reportingCurrencyCode: t.reportingCurrencyCode,
    fxRateId: t.fxRateId,
    categoryId: t.categoryId,
    notes: t.notes,
    occurredAt: t.occurredAt.toISOString(),
    createdBy: t.createdBy,
    updatedBy: t.updatedBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    deletedAt: t.deletedAt === null ? null : t.deletedAt.toISOString(),
  };
}

/**
 * Map a service-layer domain error to the canonical HTTP exception.
 * The error vocabulary is closed (IdempotencyKeyReusedError,
 * CategoryNotFoundError, etc.); the matcher table enumerates the
 * closed set. Anything not matched propagates as a 500 (NestJS's
 * default for unknown thrown errors). The handlers are factory
 * functions so the controller code stays declarative.
 */
function mapServiceError(
  err: unknown,
  handlers: Partial<{
    IdempotencyKeyReused: (userId: string, key: string) => Error;
    CategoryNotFound: (id: string) => Error;
    TransactionNotFound: (id: string) => Error;
    UnsupportedCurrencyPair: (from: string, to: string) => Error;
  }>,
): Error {
  if (err instanceof IdempotencyKeyReusedError) {
    if (!handlers.IdempotencyKeyReused) throw err;
    return handlers.IdempotencyKeyReused(err.userId, err.key);
  }
  if (err instanceof CategoryNotFoundError) {
    if (!handlers.CategoryNotFound) throw err;
    return handlers.CategoryNotFound(err.id);
  }
  if (err instanceof TransactionNotFoundError) {
    if (!handlers.TransactionNotFound) throw err;
    return handlers.TransactionNotFound(err.id);
  }
  if (err instanceof UnsupportedCurrencyPairError) {
    if (!handlers.UnsupportedCurrencyPair) throw err;
    return handlers.UnsupportedCurrencyPair(err.from, err.to);
  }
  if (err instanceof CategoryAlreadyExistsError) {
    // The category-create path maps this directly; mirror the
    // conflict shape so the wire contract stays consistent.
    return new ConflictException({
      error: "CATEGORY_ALREADY_EXISTS",
      message: `Category with slug "${err.slug}" already exists.`,
    });
  }
  throw err;
}

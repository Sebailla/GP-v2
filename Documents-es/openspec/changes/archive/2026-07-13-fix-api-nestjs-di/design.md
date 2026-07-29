# Diseño Técnico — `fix-api-nestjs-di`

> **Estado**: borrador · fase de diseño
> **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-api-nestjs-di`
> **Almacén de artefactos**: hybrid · **Modo**: interactivo · **Entrega**: `auto-chain` (irrelevante — PR único bajo presupuesto) · **Presupuesto de revisión**: 400 líneas · **PR único**: 10 archivos, ~245 LOC netas
> **TDD estricto**: activo (AGENTS.md §4)
> **Forma del fix**: C (decisión interactiva capturada en proposal §0)
> **Autor**: Orquestador SDD → ejecutor `sdd-design`
> **Fecha**: 2026-07-13
> **Entradas leídas**: `proposal.md` (Engram #2287), `spec.md` (Engram #2289, 455 líneas, 12 requerimientos, 11 escenarios, 20 criterios de aceptación), `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/design.md` (referencia de formato), `apps/api/src/modules/auth/auth.controller.ts` (219 LOC, líneas 16-22 llevan `type` en 4 servicios; el comentario en L112-118 todavía referencia el `_ServiceAnchor` eliminado), `apps/api/src/modules/transactions/transactions.controller.ts` (489 LOC, líneas 23, 25, 27 llevan `type` en 3 servicios; línea 87-90 ya tiene un comentario "AUTO-FORMATTER NOTE"), `apps/api/src/modules/{auth,transactions}/{auth,transactions}.module.ts` (arrays de providers verificados sólidos), `apps/api/test/{auth.e2e-spec.ts,setup-env.ts}` (patrón de mocking de bootstrap + setup de env), `apps/api/vitest.config.ts` (incluye `*.e2e-spec.ts`), `tools/eslint-plugin-boundary/{index.cjs,rules/no-{cross-module-import,client-server-import,prisma-outside-core}.cjs}` (forma de regla), `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (contrato del runner; opt-in por regla `allowMultipleInvalids` ya en su lugar), `tools/eslint-plugin-boundary/__fixtures__/{no-cross-module-import,no-prisma-outside-core}/` (layout de valid.ts + invalid.ts; path de producción espejado bajo directorio de fixture), `eslint.config.mjs` (89 LOC; plugin de boundary aplicado vía bloque de config recomendada en líneas 67-71; añadir la nueva regla allí), `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md` (referencia de formato de ADR)
> **Resolución de preguntas abiertas de la propuesta**: Q1 (nombre de regla = `no-import-type-injectable`), Q2 (ADR incluye anti-ejemplo), Q3 (test e2e de transactions de 1 escenario) — TODAS resueltas en spec; este diseño no las re-litiga.

---

## Tabla de contenidos

1. [Mapeo de metas ↔ enfoque técnico](#1-mapeo-de-metas--enfoque-técnico)
2. [Diffs archivo por archivo (10 archivos)](#2-diffs-archivo-por-archivo-10-archivos)
3. [Plan de ejecución (TDD estricto)](#3-plan-de-ejecución-tdd-estricto)
4. [Commits atómicos (8)](#4-commits-atómicos-8)
5. [Plan de ejecución de tests](#5-plan-de-ejecución-de-tests)
6. [Riesgos + mitigaciones (concretas)](#6-riesgos--mitigaciones-concretas)
7. [Fuera de alcance](#7-fuera-de-alcance)
8. [Preguntas abiertas para fase de tareas](#8-preguntas-abiertas-para-fase-de-tareas)
9. [Criterios de validación para `sdd-verify`](#9-criterios-de-validación-para-sdd-verify)
10. [Trazabilidad: Spec ↔ Diseño](#10-trazabilidad-spec--diseño)
11. [Matriz de amenazas](#11-matriz-de-amenazas)
12. [Migración / Rollout](#12-migración--rollout)
13. [Referencias cruzadas](#13-referencias-cruzadas)
14. [Apéndice A: Decisión de forma de `_ServiceAnchor` (Q4 de propuesta, diferida a diseño)](#14-apéndice-a-decisión-de-forma-de-_serviceanchor-q4-de-propuesta-diferida-a-diseño)

---

## 1. Mapeo de metas ↔ enfoque técnico

| Meta | Anchor de spec | Enfoque técnico |
|------|----------------|-----------------|
| **G1** — Tests e2e de auth cambian RED → GREEN | §3 G1, R1, R2, R8 | Editar `apps/api/src/modules/auth/auth.controller.ts`: (a) quitar la palabra clave `type` de los imports de `AuthService`, `PasswordResetService`, `RbacService`, `SessionService` en las líneas 16, 17, 18, 19 (el `type CurrentUser` en línea 22 SE QUEDA — es una referencia solo de tipo DTO, no un parámetro de constructor); (b) añadir `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [AuthService, PasswordResetService, RbacService, SessionService] as const;` como el ÚLTIMO miembro de la clase (después del constructor, antes del `}` de cierre). Los 21 tests RED en `auth.e2e-spec.ts` (14), `jwt-auth-guard.e2e-spec.ts` (4), `session-expiry.e2e-spec.ts` (3) se vuelven GREEN. |
| **G2** — Prueba e2e de transactions RED-first | §3 G2, R3, R7 | Paso 1 (RED): escribir `apps/api/test/transactions.e2e-spec.ts` PRIMERO con un bootstrap de un solo escenario de `TransactionsModule` vía `Test.createTestingModule({ imports: [TransactionsModule] }).compile()`. Ejecutar; debe FALLAR con `Nest can't resolve dependencies of the TransactionsController (?, ?, ?)`. Paso 2 (GREEN): editar `apps/api/src/modules/transactions/transactions.controller.ts` — quitar `type` de `CategoryService` (L23), `ThresholdService` (L25), `TransactionService` (L27); añadir `_ServiceAnchor` análogo como el ÚLTIMO campo; re-ejecutar test → GREEN. |
| **G3** — La regla ESLint bloquea la regresión | §3 G3, R4 | Nuevo archivo de regla `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs`. El visitor escucha en `ImportDeclaration`. Predicado: (a) el archivo contiene al menos un `ClassDeclaration` de nivel superior decorado con `@Controller()` (verificación de string literal sobre `Decorator.expression.callee.name === 'Controller'`), Y (b) la clase tiene un constructor cuyas anotaciones de tipo de parámetro referencian el nombre importado (resuelve conservadoramente local al archivo vía walk de `MethodDefinition` + `FunctionExpression` param + `TSTypeReference`), Y (c) el `ImportSpecifier` lleva `importKind: 'type'`. Tie-breaker conservador: si el símbolo importado no puede resolverse en el mismo archivo (por ejemplo, vive en un archivo diferente resuelto a través de paths de tsconfig), OMITIR — nunca sobre-reportar. Regla registrada en el map `plugin.rules` de `tools/eslint-plugin-boundary/index.cjs` Y en `configs.recommended.rules` (según resolución de Q1). |
| **G4** — `pnpm lint:fixtures` sale con 0 | §3 G4, R5, R6 | Nuevas fixtures `__fixtures__/no-import-type-injectable/{valid,invalid}.ts`. `valid.ts` incluye un controller que importa servicios como valores de runtime E importa un tipo `DTO` con `import { type DTO }` (permitido). `invalid.ts` incluye un controller que usa `import { type FooService }` para un parámetro de constructor (debe disparar ≥1 error). Registrar directorio de fixtures en el array `RULES` de `scripts/run-fixtures.mjs`. |
| **G5** — Pipeline turbo completo en verde | §3 G5, R10 | Sin código nuevo más allá de los 10 archivos en alcance; ejecutar `pnpm turbo run test bdd lint typecheck` y confirmar salida 0 en la rama `feat/fix-api-nestjs-di`. Esta puerta es observable, no ingenierizada. |
| **G6** — ADR 0008 + espejo en español | §3 G6, R9, R11, R12 | Nuevo `docs/architecture/decisions/0008-no-import-type-injectable.md` (EN) + `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (espejo ES). Según resolución de Q2, la ADR EN incluye un pequeño anti-ejemplo. Ambos archivos pasan `grep -P '[\x{4e00}-\x{9fff}]' …` retornando vacío (CJK-clean). |

**Dependencias de cadena**:

- G1, G2 → G5 (los tests deben pasar antes de la puerta turbo completa).
- G3, G4 → G5 (las fixtures deben salir con 0 antes de la puerta turbo completa).
- G6 → independiente de G1-G5 (los docs pueden entregarse en cualquier orden; la regla dura de AGENTS.md §13 agrupa EN + ES en el mismo commit atómico).

---

## 2. Diffs archivo por archivo (10 archivos)

> **Guía de lectura**: cada archivo en alcance recibe el contenido final EXACTO. El diseño es la fuente de verdad para `sdd-apply`; la fase de apply NO DEBE re-derivar números de línea o elecciones de import.

---

### Archivo 1 — `apps/api/src/modules/auth/auth.controller.ts` (EDITAR, +2 / -2 netas)

**Estado actual** (roto — palabra clave `type` en 4 servicios, sin `_ServiceAnchor`):

- Las líneas 15-27 del bloque de import llevan `type` en `AuthService`, `PasswordResetService`, `RbacService`, `SessionService`, y `CurrentUser`.
- Las líneas 112-118 todavía contienen el comentario "AUTO-FORMATTER MITIGATION" que PROMETE un ancla de runtime `_ServiceAnchor` que no existe en el archivo.

**Estado final**:

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

**Resumen del diff**:

- L16: `type AuthService,` → `AuthService,` (quitar `type`).
- L17: `type PasswordResetService,` → `PasswordResetService,` (quitar `type`).
- L18: `type RbacService,` → `RbacService,` (quitar `type`).
- L19: `type SessionService,` → `SessionService,` (quitar `type`).
- L22: `type CurrentUser,` SE QUEDA como `type CurrentUser,` (referencia DTO, NO parámetro de constructor; la regla ESLint no dispara).
- Comentario en L112-118 REESCRITO para referenciar ADR 0008 + la regla ESLint + la causa `isolatedModules`.
- Nuevo campo añadido como el ÚLTIMO miembro de la clase (antes del `}` de cierre de la clase).
- LOC del archivo: 219 → +5 / -3 ≈ 221 LOC (no es preocupación de presupuesto; las ediciones de este único archivo están dentro de la envolvente trivial-edit según AGENTS.md §5).

**NOTA sobre `CurrentUser`**: `CurrentUser` es una referencia solo de TIPO (usada en L183 `request.user: CurrentUser` como anotación TS). La spec R1 dice "las anotaciones `type` restantes en DTOs y esquemas derivados de zod NO usados como parámetros de constructor DEBEN permanecer sin cambios". `CurrentUser` es un tipo de extensión de request — mantener `type`. AC1 (`grep -E "type (AuthService|PasswordResetService|RbacService|SessionService)"` retorna sin matches) no matchea `type CurrentUser`.

---

### Archivo 2 — `apps/api/src/modules/transactions/transactions.controller.ts` (EDITAR, +5 / -3 netas)

**Estado actual** (bug latente — palabra clave `type` en 3 servicios):

- L23: `type CategoryService,`
- L25: `type ThresholdService,`
- L27: `type TransactionService,`
- L34-42: muchas anotaciones `type` para DTOs/interfaces (`type Category`, `type CreateCategoryInput`, `type CreateTransactionInput`, `type ListTransactionsQuery`, `type Transaction`, `type TransactionKind`, `type TransactionListItem`, `type UpdateCategoryInput`, `type UpdateTransactionInput`) — estas SE QUEDAN como `type` (según spec R3, solo los 3 imports de servicios cambian).
- L87-90: comentario existente "AUTO-FORMATTER NOTE" (wording diferente al del auth) necesita ser actualizado para referenciar ADR 0008.

**Estado final** (solo se muestran el bloque de import + nuevo ancla + comentario — el resto del archivo de 489-LOC queda sin cambios):

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

**Resumen del diff** (solo las regiones cambiadas):

- L23: `type CategoryService,` → `CategoryService,` (quitar `type`).
- L25: `type ThresholdService,` → `ThresholdService,` (quitar `type`).
- L27: `type TransactionService,` → `TransactionService,` (quitar `type`).
- L34-42: todos los `type Category`, `type CreateCategoryInput`, etc. SE QUEDAN como `type` (referencias solo de tipo DTO/interface, NO parámetros de constructor).
- Comentario en L87-90: REESCRITO para referenciar ADR 0008 + regla ESLint.
- Nuevo campo `_ServiceAnchor` añadido como ÚLTIMO miembro de la clase (antes del `}` de cierre de la clase).
- LOC del archivo: 489 → ~494 (neto +5).

**Verificación**:

- AC3: `grep -E "type (CategoryService|ThresholdService|TransactionService)" apps/api/src/modules/transactions/transactions.controller.ts` → sin matches.
- AC4: `grep -n "_ServiceAnchor" apps/api/src/modules/transactions/transactions.controller.ts` → exactamente un match (la declaración del campo).

---

### Archivo 3 — `apps/api/test/transactions.e2e-spec.ts` (NUEVO, ~50 LOC)

Este es el test **RED-first**. Escrito ANTES de que el fix del controller aterrice. Según resolución de Q3 de spec: 1 escenario enfocado en bootstrap.

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

**POR QUÉ mínimo**:

- Un único bloque `it` basta: el bootstrap es la señal diagnóstica completa. NestJS lanza en `compile()` si y solo si un parámetro de constructor no puede resolverse. No hay necesidad de supertest, no hay necesidad de `INestApplication.init()`, no hay necesidad de llamadas a rutas.
- La captura de `bootstrapError` surfacea el mensaje de error EXACTO de Nest en la salida del test cuando está RED.
- Una vez que el commit GREEN aterriza (transactions.controller.ts importa como valor + añade ancla), este mismo test se vuelve una guarda de regresión: cualquier re-introducción futura de `import type` en un servicio de transactions instantáneamente devuelve el test a RED en la resolución del módulo.

**Por qué no espejar `auth.e2e-spec.ts` completo (~304 LOC)**: la spec Q3 resolvió esto. El trabajo del test es prueba RED-first de DI, no cobertura completa de rutas. `libs/features/transactions/docs/*.feature` ya cubre la semántica de rutas (25/25 PASAN según `bb25aab`).

---

### Archivo 4 — `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (NUEVO, ~85 LOC)

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

**Casos de falsos NEGATIVOS conocidos (documentados en el comentario de la regla)**:

1. **Imports cross-file**: `import { type FooService } from "@features/auth"` donde `FooService` se exporta de un archivo diferente — la regla no tiene resolución cross-file y OMITE. El campo estático `_ServiceAnchor` en la clase consumidora es el fallback de runtime; el pase de lint de producción verá el campo ancla como una referencia `static readonly _ServiceAnchor` (el walk de `Program` de la regla también recoge referencias de campos — ver [Apéndice A] para una mejora opcional V2). V1 es intencionalmente estrecho para evitar falsos positivos.

2. **Decorador `@Injectable()` en servicios** (raro en este repo): la regla se dispara cuando YA SEA la clase consumidora tiene `@Controller`/`@Injectable` Y referencia el símbolo en un constructor; si un futuro servicio decorado con `@Injectable()` referencia otro inyectable vía su constructor, la regla se dispara. Los 7 servicios en `apps/api/src/modules/{auth,transactions}/` NO son `@Injectable()` (según diseño hexagonal §2) — la lista de anclas de la regla empieza vacía para esos, que es el resultado deseado.

3. **`as const` o tipos Mapeados**: la regla camina nodos `Identifier` en posiciones de tipo; argumentos genéricos, tipos mapeados, y tipos condicionales llevan todos identificadores en posición de tipo, y cualquier match contra el nombre local dispara la regla. Este es el comportamiento correcto.

**Aceptación** — el cuerpo de la regla es intencionalmente ~85 LOC. Las mejoras V2 (resolución cross-file, severidad de grano fino por tipo de decorador) están diferidas.

---

### Archivo 5 — `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` (NUEVO, ~30 LOC)

La fixture válida ejercita dos patrones permitidos en un archivo:

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

**Por qué funciona** (y qué triangula):

- Los 2 servicios (`AuthService`, `SessionService`) se importan como valores — la regla ignora los imports de valor.
- `CreateUserInput` SÍ se importa con `type`, pero aparece como tipo de parámetro de método, no como parámetro de constructor. El predicado de la regla requiere que el símbolo importado con tipo esté en el conjunto de anclas del constructor, que solo recoge de `member.kind === "constructor"` — los cuerpos de método se omiten.
- ESLint reportará **0 errores** aquí. El runner lo acepta como el caso válido GREEN.

---

### Archivo 6 — `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` (NUEVO, ~30 LOC)

La fixture inválida ejercita el patrón exacto del bug de `auth.controller.ts`:

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

**Por qué dispara la regla**:

1. El archivo tiene un `ClassDeclaration` con un decorador `@Controller()`.
2. La clase tiene un `MethodDefinition(kind=constructor)` cuya anotación de tipo del parámetro usa `AuthService`.
3. `AuthService` es el nombre local de un `ImportSpecifier` con `importKind === 'type'`.
4. Las TRES condiciones en `collectLocalControllerConstructors` + visita de `ImportDeclaration` coinciden → la regla reporta.

**Aceptación del runner**: `errorCount >= 1`, `fatalErrorCount === 0`, sale con 0 en general.

---

### Archivo 7 — `tools/eslint-plugin-boundary/index.cjs` (EDITAR, +3 / -0)

Tres lugares a tocar en `index.cjs`. Snippet final mostrando SOLO los diffs (el resto del archivo sin cambios):

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

**Verificación**:

- AC7: `grep "no-import-type-injectable" tools/eslint-plugin-boundary/index.cjs` retorna ≥2 matches (uno en la línea `require`, uno en `plugin.rules`, uno en `configs.recommended.rules` — en realidad 3 matches; el "≥2" de AC7 pasa).

---

### Archivo 8 — `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (EDITAR, +1 / -0)

UNA línea a añadir en el array `RULES` (después de `no-cross-module-import`, antes de `no-mojibake-in-docs`):

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

**No se necesitan otras ediciones del runner**. El loop por regla del runner ya maneja fixtures `.ts` inválidas únicas (la nueva regla NO necesita `allowMultipleInvalids`). El glob de fixtures `**/invalid*.ts` matchea el nuevo `invalid.ts`. La config de ESLint que aplica SOLO la regla nombrada (líneas 91-108) auto-maneja la nueva regla.

**Verificación**:

- AC8: `grep "no-import-type-injectable" tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` retorna exactamente 1 match (la entrada del array `RULES`).

**Nota sobre `eslint.config.mjs` (NO es un archivo separado en alcance)**: el `eslint.config.mjs` de nivel workspace líneas 67-71 esparce `boundary.configs.recommended` sobre `**/*.{ts,tsx,js,mjs,cjs}`. La nueva regla está registrada en `configs.recommended.rules` (Archivo 7, tercera edición), por lo que el código de producción obtiene la enforcement de `pnpm turbo run lint` AUTOMÁTICAMENTE — no se requiere cableado extra en `eslint.config.mjs`. Esta es la propiedad de "única fuente de verdad" que AGENTS.md §8 nombra; la regla vive una vez en `configs.recommended` y se consume dos veces (runner + workspace lint).

---

### Archivo 9 — `docs/architecture/decisions/0008-no-import-type-injectable.md` (NUEVO, EN, ~70 LOC)

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

### Archivo 10 — `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (NUEVO, espejo ES, ~75 LOC)

Ver `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` para la traducción al español del Archivo 9. Los bloques de código se preservan verbatim (los fences de código bilingüe son estructurales: prosa traducida, código congelado). CJK-clean por construcción (escrito a mano, sin pipeline de auto-traducción).

---

## 3. Plan de ejecución (TDD estricto)

> 8 pasos. Cada RED se observa ANTES del GREEN. Cada TRIANGULATE sigue al GREEN.

### Paso 1 — RED (test e2e de transactions)

**Acción**: escribir `apps/api/test/transactions.e2e-spec.ts` (contenido del Archivo 3 arriba).
**Verificar RED**: `pnpm --filter api test transactions.e2e-spec` sale non-zero; el `bootstrapError` capturado contiene `Nest can't resolve dependencies of the TransactionsController`.

**Salida esperada (verbatim)**:

```
FAIL  apps/api/test/transactions.e2e-spec.ts > TransactionsController (DI bootstrap — RED-first) > bootstraps TransactionsModule without unresolved dependencies
Error: Nest can't resolve dependencies of the TransactionsController (?).
Please make sure that the argument CategoryService at index [0] is available
in the TransactionsModule context.
```

**Captura**: la frase exacta `bootstrapError.toBeUndefined()` es el predicado que cambia RED → GREEN.

### Paso 2 — GREEN (transactions controller)

**Acción**: editar `apps/api/src/modules/transactions/transactions.controller.ts` — quitar `type` en L23/L25/L27, añadir campo `_ServiceAnchor` como ÚLTIMO miembro de clase, actualizar comentario L87-90.
**Verificar GREEN**: `pnpm --filter api test transactions.e2e-spec` sale 0 con 1/1 PASANDO.

### Paso 3 — GREEN (auth controller)

**Acción**: editar `apps/api/src/modules/auth/auth.controller.ts` — quitar `type` en L16-L19 (mantener `type CurrentUser` en L22), añadir campo `_ServiceAnchor` como ÚLTIMO miembro de clase, actualizar comentario L112-118.
**Verificar GREEN**: `pnpm --filter api test` sale 0 con 21/21 PASANDO para `auth.e2e-spec.ts` (14) + `jwt-auth-guard.e2e-spec.ts` (4) + `session-expiry.e2e-spec.ts` (3); más 1/1 PASANDO para el nuevo `transactions.e2e-spec.ts` (22 en total).

### Paso 4 — TRIANGULATE (fixture RED de la regla)

**Acción**: añadir `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` (Archivo 6). Cablear el stub de la regla: crear `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` pero con un cuerpo TEMPORAL que intencionalmente reporta 0 errores (por ejemplo, un `module.exports.create = () => ({})` vacío). Añadir la regla a `index.cjs` (Archivo 7) y al runner (Archivo 8). Ejecutar `pnpm lint:fixtures`.
**Salida esperada (RED)**: `FAIL  no-import-type-injectable/invalid.ts (errors=0)` — la fixture espera ≥1 pero el cuerpo de regla vacío reporta 0.

Este paso prueba que el runner + infraestructura de fixtures está cableado ANTES de que confiemos en la lógica de la regla.

### Paso 5 — GREEN (cuerpo de la regla)

**Acción**: reemplazar el cuerpo stub temporal de `no-import-type-injectable.cjs` con el contenido completo del Archivo 4.
**Verificar GREEN**: `pnpm lint:fixtures` reporta:

```
PASS  no-import-type-injectable/valid.ts  (errors=0)
PASS  no-import-type-injectable/invalid.ts  (errors>=1)
```

sale 0 en el loop de la regla.

### Paso 6 — TRIANGULATE (fixture válida)

**Acción**: añadir `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` (Archivo 5) — nota: esta fixture se AUSENTÓ intencionalmente del Paso 4 para forzar un RED enfocado en el caso `invalid` primero. Ahora se añade.
**Verificar GREEN**: `pnpm lint:fixtures` reporta 0/≥1 entre ambas fixtures, sale 0 en general.

### Paso 7 — GREEN (ADR)

**Acción**: escribir `docs/architecture/decisions/0008-no-import-type-injectable.md` (Archivo 9) + `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (Archivo 10) en el MISMO commit atómico (AGENTS.md §13).
**Verificar CLEAN**: `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` retorna exit 1 (sin match). Igual para el archivo EN.

### Paso 8 — REFACTOR (verificar)

**Acción**: ejecutar el pipeline turbo completo.
**Verificar**: `pnpm turbo run test bdd lint typecheck` sale 0 en las 4 tareas. `pnpm lint:fixtures` sale 0. `pnpm --filter api test` sale 0 con 22/22 PASANDO.

---

## 4. Commits atómicos (8)

> Alineado por unidad de trabajo (AGENTS.md §5). Cada commit es independientemente reversible. La ADR + espejo ES se fusionan en UN commit (regla dura de AGENTS.md §13). Vocabulario de tipos según AGENTS.md §6. Sin `Co-Authored-By`. Subjects ≤ 72 chars, imperativos, sin punto final.

| # | Hash de commit (placeholder) | Tipo | Subject | Archivos | Fase TDD |
|---|-------------------------------|------|---------|----------|----------|
| 1 | TBD | `test` | `test(api): RED — add transactions.e2e-spec proving latent DI bug` | `apps/api/test/transactions.e2e-spec.ts` (NUEVO, +50 / 0) | RED (Paso 1) |
| 2 | TBD | `fix` | `fix(api): transactions.controller.ts — drop type kw + restore _ServiceAnchor` | `apps/api/src/modules/transactions/transactions.controller.ts` (EDITAR, +5 / -3) | GREEN transactions (Paso 2) |
| 3 | TBD | `fix` | `fix(api): auth.controller.ts — drop type kw + restore _ServiceAnchor` | `apps/api/src/modules/auth/auth.controller.ts` (EDITAR, +5 / -3) | GREEN auth (Paso 3) |
| 4 | TBD | `feat` | `feat(eslint): wire no-import-type-injectable rule scaffolding (rule body stub + fixtures dir + runner entry + plugin registration)` | `tools/eslint-plugin-boundary/index.cjs` (+3 / 0), `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (+1 / 0), `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` (NUEVO, +30), `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (NUEVO, +5 — stub vacío) | RED cableado de regla (Paso 4) |
| 5 | TBD | `feat` | `feat(eslint): implement no-import-type-injectable rule body` | `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (EDITAR, +85 / -5) | GREEN regla (Paso 5) |
| 6 | TBD | `feat` | `feat(eslint): add valid.ts triangulation fixture for no-import-type-injectable` | `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` (NUEVO, +30) | TRIANGULATE (Paso 6) |
| 7 | TBD | `docs` | `docs(adr): ADR 0008 — forbid import type for NestJS injectables in controllers (EN + ES mirror)` | `docs/architecture/decisions/0008-no-import-type-injectable.md` (NUEVO, +70), `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (NUEVO, +75) | ADR (Paso 7) |
| 8 | TBD | `chore` | `chore(api): verify turbo test+bdd+lint+typecheck exits 0` | (sin cambios de archivo; puerta turbo) | REFACTOR (Paso 8) |

**Totales**: 8 commits, +250 / -16 ≈ +234 LOC netas (dentro del presupuesto). El diff del PR vs `develop` incluye los commits 1-7; el commit 8 está vacío (verificación solo-chore — puede omitirse a opción del orquestador, pero inlinearlo le da al revisor un punto de contacto final).

**PR único** (sin auto-chain): 250 LOC de adiciones / 16 de eliminaciones se asienta cómodamente bajo el presupuesto de revisión de 400 líneas. Según el campo Delivery de spec §1.

---

## 5. Plan de ejecución de tests

| Meta de spec | Escenario | Comando de test | Resultado esperado |
|--------------|-----------|-----------------|--------------------|
| **G1.1** | El e2e de auth cambia RED → GREEN | `pnpm --filter api test auth.e2e-spec` | sale 0; 14/14 PASAN |
| **G1.2** | El e2e de jwt-auth-guard cambia RED → GREEN | `pnpm --filter api test jwt-auth-guard.e2e-spec` | sale 0; 4/4 PASAN |
| **G1.3** | El e2e de session-expiry cambia RED → GREEN | `pnpm --filter api test session-expiry.e2e-spec` | sale 0; 3/3 PASAN |
| **G2.1** | e2e de transactions RED → GREEN | `pnpm --filter api test transactions.e2e-spec` | ANTES del fix: sale non-zero (Nest can't resolve). DESPUÉS del fix: sale 0; 1/1 PASA |
| **G3.1** | La regla bloquea caso de controller | `pnpm lint:fixtures` (invalid.ts) | la fixture inválida reporta ≥1 error |
| **G3.2** | La regla permite `import type` de DTO | `pnpm lint:fixtures` (valid.ts) | la fixture válida reporta 0 errores |
| **G3.3** | La regla omite símbolos no resueltos | (verificación manual; el `collectLocalControllerConstructors` de la regla retorna map vacío cuando el import vive en otro archivo → OMITE) | la regla NO dispara en `import { type ExternalService } from "@features/external"` |
| **G4.1** | `pnpm lint:fixtures` sale 0 | `pnpm lint:fixtures` | sale 0; valid=0 errores, invalid≥1 error |
| **G5.1** | Pipeline turbo completo en verde | `pnpm turbo run test bdd lint typecheck` | sale 0 en las 4 tareas |
| **G6.1** | ADR + espejo ES CJK-clean | `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` | salida vacía (sin CJK) |
| **G6.2** | La ADR contiene anti-ejemplo | `grep -c "^## Anti-example" docs/architecture/decisions/0008-no-import-type-injectable.md` | ≥1 match |
| **G6.3** | La ADR cita la fuente de la regresión | `grep -c "3db761f" docs/architecture/decisions/0008-no-import-type-injectable.md` | ≥1 match |

---

## 6. Riesgos + mitigaciones (concretas)

> Espejo de proposal §7 R1-R6 con la mitigación concreta que este diseño adopta (no un re-statement de una línea).

| ID | Riesgo | Probabilidad | Mitigación concreta en este diseño |
|----|--------|--------------|------------------------------------|
| **R1** | El fix del auth controller rompe un interno de `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` porque sus factories pierden una dependencia oculta. | Baja | Los 4 servicios viven en `@features/auth` (NO tocados por este diseño). `auth.module.ts` (referencia de Archivo 7: array de providers verificado) registra los 4 con `useFactory` y cero argumentos de constructor. El Paso 3 GREEN `pnpm --filter api test` es la verificación empírica — cualquier regresión de cableado de provider surfaceará como un fallo de `compile()` con un mensaje de error de Nest apuntando al nombre del provider, no al controller. Si un test aún falla DESPUÉS de la edición del controller, el modo de fallo es `Nest can't resolve dependencies of the …Service` (problema del provider), distinto de `?` (problema del controller). |
| **R2** | La nueva regla ESLint da falsos positivos en `import { type X }` legítimos para DTOs / interfaces. | Media | El predicado de la regla es **estrecho Y** (cf. Archivo 4 §"Predicado"): requiere (a) `importKind === 'type'`, Y (b) el nombre importado aparece en una anotación de tipo de parámetro de constructor de una clase `@Controller`/`@Injectable`. Los DTOs e interfaces NO son parámetros de constructor de un controller/injectable — aparecen en tipos de parámetros de método, tipos de retorno, o cláusulas `implements`. La fixture `valid.ts` (Archivo 5) ejercita `import type { CreateUserInput }` en un tipo de parámetro de `@Body()` del cuerpo de método y assere 0 violaciones. El Paso 6 TRIANGULATE lo corrige antes de que se extienda confianza al pase de producción. |
| **R3** | Biome u otro auto-formateador re-introduce `type` en los 4+3 imports. | Baja | La nueva regla ESLint está cableada en `boundary.configs.recommended.rules` (Archivo 7) y corre como parte de `pnpm turbo run lint`. CI falla cualquier re-introducción. Los campos estáticos `_ServiceAnchor` son una SEGUNDA defensa independiente — incluso si el formateador vence la línea de import, la referencia `AuthService` del campo estático mantiene el símbolo alcanzable en runtime. El mensaje de error de la regla (Archivo 4 `messages.forbiddenImportType`) nombra explícitamente el archivo + clase + símbolo para que un futuro mantenedor vea el conflicto inmediatamente. |
| **R4** | Los 3 archivos e2e actualmente saltados/fallando podrían tener un decorador `skip` / `todo` que pasemos por alto. | Baja | El Paso 3 RED requiere ejecutar `pnpm --filter api test --reporter=verbose` y asserir que cada escenario en `auth.e2e-spec.ts` (14), `jwt-auth-guard.e2e-spec.ts` (4), `session-expiry.e2e-spec.ts` (3) realmente ejecuta `compile()`. El paso de verificación G1 enumera los 21 explícitamente. Si un test lleva `it.skip` o `it.todo`, el reporter de vitest prefijará el escenario con `(skip)` o `(todo)` y el conteo "21/21 PASAN" no se puede alcanzar. AC11 (`pnpm --filter api test` sale 0) es la puerta binaria. |
| **R5** | La lógica AST de la nueva regla ESLint se dispara erróneamente en argumentos de tipo genéricos (`Param<T>`) o argumentos de decorador (`@Controller('auth')`). | Baja | La regla camina nodos `Identifier` con recursión conservadora (cf. Archivo 4 `collectReferencedNames`). Los argumentos genéricos, tipos mapeados, y tipos condicionales llevan todos identificadores en posición de tipo — cualquier match contra el nombre local dispara la regla, que es el comportamiento correcto (una instanciación genérica con tipo borrado rompe DI igual que una clase con tipo borrado). La inspección de argumentos del decorador (`@Controller('auth')`) se maneja por la rama `CallExpression` en el predicado `hasDecorator`; el string de ruta se ignora. La fixture válida (Archivo 5) importa `CreateUserInput` como `import type` en un parámetro de método — la regla NO dispara (porque el símbolo NO está en el conjunto de anclas del constructor). |
| **R6** | El espejo en español se entrega con drift CJK. | Baja | El espejo se escribe a mano desde la ADR EN (Archivo 9), no auto-traducido. AGENTS.md §13 prohíbe el pipeline de auto-traducción (que deja codepoints CJK como drift). El paso de verificación G6.1 ejecuta `grep -P '[\x{4e00}-\x{9fff}]'` contra el archivo ES y assere exit 1 (sin match). Mismo grep aplicado al archivo EN (defensivo). La futura regla `no-mojibake-in-docs` (slice-8 8.3 + líneas ESLint config 78-82) captura drift en tiempo de lint una vez que `@eslint/markdown` esté completamente activo (que SÍ está hoy según `eslint.config.mjs` líneas 60-64 — la regla está enforced sobre el glob de producción `Documents-es/**/*.md`). |

---

## 7. Fuera de alcance

> Replanteado de spec §4 + proposal §2.2 (espejo de AGENTS.md §11). El orquestador NO DEBE añadir ítems aquí sin un nuevo cambio SDD.

1. Refactorizar los internos de `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` / `CategoryService` / `ThresholdService` / `TransactionService`.
2. Añadir decoradores `@Injectable()` a los 7 servicios (violaría el diseño hexagonal §2: "el código de dominio es libre de framework").
3. Migración del patrón de scaffold de referencia del slice-1 a un mecanismo de DI diferente (`useClass`, `useFactory: ... inject[]`, o un ancla de runtime persistida con una forma diferente).
4. Tocar los arrays de providers de `AuthModule` / `TransactionsModule` — el cableado es sólido (verificado en referencia de Archivo 8). El bug está aguas arriba de la resolución de providers.
5. Nuevos escenarios BDD más allá del 1 test e2e RED mínimo para transactions (según resolución de Q3).
6. Cualquier cambio en `apps/web` / `libs/features/*/client/*` (el fix es solo de API).
7. Cualquier cambio en `tsconfig.base.json` (`isolatedModules: true` es correcto para el sistema de módulos del proyecto; el bug está en la elección del import, no en la config).
8. Cualquier cambio en el cableado del cliente Prisma, env config, o `@core/database`.
9. Enforzamiento del gate de cobertura en CI (AGENTS.md §11).
10. Migración de `gastos-personales/` al modelo de vertical-slicing (AGENTS.md §11; el playbook se entrega por separado en slice-8 8.4).
11. i18n más allá de `en` + `es`, Sentry, rate-limiting de API, proveedores OAuth más allá de Google, hardening de producción, observabilidad, UI de audit log (AGENTS.md §11).
12. Refactorizar `tools/eslint-plugin-boundary` a TypeScript (las reglas son `.cjs`; convertirlas es su propio cambio).
13. Reemplazar el manejo de errores del controller, la forma de logging, la proyección de respuesta, o el mapeo de HTTP status.
14. Reemplazar la resolución de barrel export de `@features/auth` / `@features/transactions` (no se necesita — el fix está en el sitio del import, no en el layout del paquete).
15. Añadir `_ServiceAnchor` a cualquier otro controller aparte de `AuthController` y `TransactionsController` (según spec §4 no-meta #15; estos son los únicos dos controllers de NestJS en `apps/api/` que cargan la clase del bug).

---

## 8. Preguntas abiertas para fase de tareas

**Ninguna esperada.** Las tres preguntas abiertas de la propuesta (Q1, Q2, Q3) se resolvieron en la fase de spec (Engram #2289, §11 "Preguntas abiertas — RESUELTAS"). `sdd-tasks` procede con el plan de 8 commits / 8 pasos de ejecución arriba como su entrada canónica.

Si `sdd-tasks` descubre un nuevo bloqueador durante la planificación de tareas (por ejemplo, una colisión de path de fixture con una regla existente), DEBE escalar vía `mem_judge` según protocolo Engram — NO expandir el alcance silenciosamente.

---

## 9. Criterios de validación para `sdd-verify`

`sdd-verify` verificará lo siguiente, TODOS los cuales este diseño permite PASAR determinísticamente:

### Puertas funcionales

1. **Los 21 tests e2e de auth pasan**: `pnpm --filter api test auth.e2e-spec jwt-auth-guard.e2e-spec session-expiry.e2e-spec` → sale 0; el reporter muestra 21 PASAN.
2. **El nuevo test e2e de transactions pasa**: `pnpm --filter api test transactions.e2e-spec` → sale 0; 1/1 PASA.
3. **`pnpm lint:fixtures` sale 0**: `pnpm lint:fixtures` → sale 0; stdout reporta `PASS  no-import-type-injectable/valid.ts  (errors=0)` Y `PASS  no-import-type-injectable/invalid.ts  (errors>=1)`.
4. **`pnpm turbo run test bdd lint typecheck` sale 0**: en `feat/fix-api-nestjs-di`; las 4 tareas reportan código de salida 0.
5. **AC1-AC20** (spec §9): cada criterio de aceptación pasa su grep / presencia de archivo / prueba de código de salida.

### Puertas de higiene (según checklist pre-commit de AGENTS.md §12)

6. **Sin `Co-Authored-By`**: `git log feat/fix-api-nestjs-di --pretty=format:"%B" | grep -i "co-authored-by"` → vacío.
7. **Sin amend de `main`**: `git log main -1` todavía muestra `ea7732f` después de que el PR mergea (o cualquier HEAD de `develop` pre-PR).
8. **Sin amend de la evidencia de la cadena del slice-7**: `git show 3db761f` y `git show a9b550d` y `git show bb25aab` retornan los SHAs de commit originales verbatim.
9. **ADR + espejo ES en el MISMO commit atómico**: `git log --diff-filter=A --pretty=format:"%H" -- docs/architecture/decisions/0008-no-import-type-injectable.md Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md | wc -l` → 1 (ambos archivos comparten un único commit de add).

### Puertas específicas de la ADR

10. **La ADR contiene anti-ejemplo**: `grep -c "^## Anti-example" docs/architecture/decisions/0008-no-import-type-injectable.md` → ≥1.
11. **La ADR cita la fuente de la regresión**: `grep -c "3db761f" docs/architecture/decisions/0008-no-import-type-injectable.md` → ≥1.
12. **Ambos archivos de ADR CJK-clean**:

    ```bash
    grep -P '[\x{4e00}-\x{9fff}]' docs/architecture/decisions/0008-no-import-type-injectable.md
    grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md
    ```

    Ambos salen 1 (sin match).

13. **`_ServiceAnchor` es el ÚLTIMO campo** en ambos controllers (R12 SHOULDs):

    ```bash
    grep -n "_ServiceAnchor" apps/api/src/modules/auth/auth.controller.ts
    grep -n "_ServiceAnchor" apps/api/src/modules/transactions/transactions.controller.ts
    ```

    Ambos muestran la declaración del campo como el ÚLTIMO miembro de la clase (número de línea > número de línea del constructor, < número de línea del `}` de cierre).

---

## 10. Trazabilidad: Spec ↔ Diseño

| Requerimiento de spec | Escenarios de spec | Sección de diseño | Archivo(s) |
|-----------------------|--------------------|-------------------|------------|
| **R1** — `auth.controller.ts` importa como valor los 4 servicios | G1.1-G1.3 | §2 Archivo 1 | `auth.controller.ts` |
| **R2** — `auth.controller.ts` restaura `_ServiceAnchor` | G1.1-G1.3, G3.4 ancla-último | §2 Archivo 1 | `auth.controller.ts` |
| **R3** — `transactions.controller.ts` importa como valor los 3 servicios + añade ancla | G2.1, G3.4 | §2 Archivo 2 | `transactions.controller.ts` |
| **R4** — Nueva regla ESLint existe con predicado conservador | G3.1, G3.2, G3.3 | §2 Archivo 4 | `no-import-type-injectable.cjs` |
| **R5** — Regla registrada en plugin + config recomendada + runner | G3.1-G3.3 | §2 Archivos 7, 8 | `index.cjs`, `run-fixtures.mjs` |
| **R6** — La regla tiene fixtures válida + inválida | G4.1 | §2 Archivos 5, 6 | `__fixtures__/no-import-type-injectable/{valid,invalid}.ts` |
| **R7** — Test e2e RED-first de transactions existe | G2.1 | §2 Archivo 3, §3 Paso 1 | `transactions.e2e-spec.ts` |
| **R8** — Los 21 escenarios e2e de auth previamente fallando pasan todos | G1.1, G1.2, G1.3 | §3 Paso 3 | (archivos de test sin cambios; fix del controller en Archivo 1) |
| **R9** — ADR 0008 + espejo ES CJK-clean | G6.1 | §2 Archivos 9, 10 | `0008-no-import-type-injectable.md` (EN+ES) |
| **R10** — Pipeline turbo completo en verde | G5.1 | §3 Paso 8 | (sin archivo; puerta de verificación) |
| **R11** (SHOULD) — La ADR cita el commit fuente de la regresión `3db761f` | G6.1 | §2 Archivo 9 References | `0008-no-import-type-injectable.md` |
| **R12** (SHOULD) — `_ServiceAnchor` es el ÚLTIMO campo en cada controller | G3.4 ancla-último | §2 Archivos 1, 2 | `auth.controller.ts`, `transactions.controller.ts` |

### Cross-walk meta ↔ diseño

| Meta | Secciones de diseño que la entregan |
|------|------------------------------------|
| **G1** | §2 Archivo 1; §3 Paso 3; §5 G1.1-G1.3 |
| **G2** | §2 Archivo 3; §2 Archivo 2; §3 Paso 1 (RED), Paso 2 (GREEN); §5 G2.1 |
| **G3** | §2 Archivo 4; §2 Archivo 7; §2 Archivo 8; §5 G3.1-G3.3 |
| **G4** | §2 Archivo 5; §2 Archivo 6; §3 Paso 4 (RED cableado), Paso 5 (GREEN cuerpo), Paso 6 (TRIANGULATE); §5 G4.1 |
| **G5** | §3 Paso 8; §5 G5.1 |
| **G6** | §2 Archivo 9; §2 Archivo 10; §3 Paso 7; §5 G6.1-G6.3 |

### Criterio de aceptación ↔ sección de diseño

| AC | Archivo §2 | Paso §3 | Commit §4 |
|----|------------|---------|-----------|
| AC1 (sin `type Service` en auth) | Archivo 1 | Paso 3 | #3 |
| AC2 (`_ServiceAnchor` último campo, auth) | Archivo 1 | Paso 3 | #3 |
| AC3 (sin `type Service` en transactions) | Archivo 2 | Paso 2 | #2 |
| AC4 (`_ServiceAnchor` último campo, transactions) | Archivo 2 | Paso 2 | #2 |
| AC5 (transactions.e2e-spec.ts existe) | Archivo 3 | Paso 1 | #1 |
| AC6 (archivo de regla existe) | Archivo 4 | Paso 5 | #5 |
| AC7 (regla en `plugin.rules` + `configs.recommended`) | Archivo 7 | Paso 4 | #4 |
| AC8 (regla en array `RULES`) | Archivo 8 | Paso 4 | #4 |
| AC9 (fixtures existen) | Archivos 5, 6 | Pasos 4, 6 | #4, #6 |
| AC10 (`pnpm lint:fixtures` sale 0) | Archivos 4-6 | Pasos 5, 6 | #5, #6 |
| AC11 (`pnpm --filter api test` sale 0, 21/21 + 1/1) | Archivos 1-3 | Pasos 2, 3 | #2, #3 |
| AC12 (`pnpm turbo run test bdd lint typecheck` sale 0) | (puerta) | Paso 8 | #8 |
| AC13 (ADR EN existe) | Archivo 9 | Paso 7 | #7 |
| AC14 (ADR ES espejo existe) | Archivo 10 | Paso 7 | #7 |
| AC15 (ambas ADRs CJK-clean) | Archivos 9, 10 | Paso 7 | #7 |
| AC16 (ADR EN contiene anti-ejemplo) | Archivo 9 (sección Anti-ejemplo) | Paso 7 | #7 |
| AC17 (ADR EN cita `3db761f`) | Archivo 9 (sección References) | Paso 7 | #7 |
| AC18 (sin mutación de `main`) | (disciplina de rama) | n/a | n/a |
| AC19 (sin `Co-Authored-By`) | (higiene de commit) | n/a | n/a |
| AC20 (PR único apunta a `develop`) | (creación de PR) | n/a | n/a |

---

## 11. Matriz de amenazas

> Según `sdd-design` §Paso 2a: este diseño NO cambia routing, comandos shell, subprocesos, automatización de VCS/PR, clasificación de archivos ejecutables, ni integración de procesos. La matriz de amenazas es por lo tanto **N/A — ninguna de estas fronteras es tocada por `fix-api-nestjs-di`**.

| Categoría de fila | ¿Aplicable? | Razón |
|-------------------|-------------|-------|
| Cambios de routing | N/A | Sin adiciones de rutas HTTP; las rutas existentes del controller continúan vinculándose a los mismos paths. |
| Comandos shell / subprocesos | N/A | Sin nuevos scripts shell; `pnpm lint:fixtures`, `pnpm turbo run test bdd lint typecheck`, `pnpm --filter api test` son comandos turbo/pnpm existentes reusados sin modificación. |
| Automatización de VCS / PR | N/A | PR único contra `develop`; sin cambios en GitHub Actions; sin scripts de automatización de ramas. |
| Clasificación de archivos ejecutables | N/A | Sin nuevos binarios; sin cambios de chmod; sin actualizaciones de `.env.example`. |
| Integración de procesos | N/A | Sin nuevos procesos de larga duración; el bootstrap de Nest del controller queda sin cambios en forma (solo los metadatos del import). |

---

## 12. Migración / Rollout

> Según slice-1 design §3 + el precedente de `git revert` (ADR 0007): sin migración de datos, sin feature flag, sin rollout por fases. El cambio es un **fix** con dos archivos de código de producción (`auth.controller.ts`, `transactions.controller.ts`), cinco nuevos artefactos (test + regla + 2 fixtures + ADR-ES), y una edición de cableado (plugin + runner).

### Rollback por archivo

| Sub-cambio | Efecto de `git revert <sha>` |
|------------|------------------------------|
| Commits #1 (test RED) | El test se revierte; `transactions.e2e-spec.ts` desaparece. `pnpm --filter api test` retorna a su estado original de 21-FALL. Sin código de producción afectado. |
| Commits #2-3 (fixes de controllers) | Los 21 tests de auth + el nuevo test de transactions vuelven a RED (mismo error `Nest can't resolve dependencies`). El rollback es **idempotente** con la clase del bug que este cambio se creó para corregir — son equivalentes. |
| Commits #4-6 (regla + fixtures) | Revierte el plugin / runner / archivos de fixtures. ESLint retorna a su línea base de 5 reglas. Sin código de producción afectado. Las 4 reglas fijas (`no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`) continúan enforce. |
| Commit #7 (ADR + ES) | Revierte la documentación. La rationale de decisión de la regla vive en el mensaje de commit + `openspec/changes/fix-api-nestjs-di/spec.md` incluso tras la eliminación de la ADR. Sin impacto en runtime. |
| Commit #8 (chore de verificación) | Commit vacío; el revert es un no-op. |

### Rollback de todo el cambio

`git revert <merge-sha>` del PR en `develop` deshace todo el cambio limpiamente. Los 21 tests e2e retornan a su estado previamente roto (el mismo estado en que estaban en `develop@ea7732f` según observación F1 de la verificación del slice-8). El plugin de boundary retorna a 5 reglas; las 4 reglas existentes quedan intactas.

### NO SE DEBE

- Force-push, reescritura de historial, tocar `main`, modificar `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/`, o hacer amend de los commits `3db761f`, `a9b550d`, `bb25aab`.
- Re-introducir `type` en cualquiera de los 4+3 imports de servicios incluso después del revert — la regla capturaría cualquier reintroducción en CI.

---

## 13. Referencias cruzadas

- **Propuesta**: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`)
- **Spec**: `openspec/changes/fix-api-nestjs-di/spec.md` (Engram `#2289`)
- **Brief de exploración**: `openspec/changes/fix-api-nestjs-di/explore.md` (Engram `#2286`)
- **Commit de causa raíz**: `3db761f` (slice-7 PR-2)
- **Smoking-gun error**: "This commonly occurs when using 'import type' instead of 'import' for injectable classes" de NestJS
- **`tsconfig.base.json`**: línea 10 (`isolatedModules: true`) — el predicado en tiempo de compilación que borra `import type`
- **Archivos modificados**:
  - `apps/api/src/modules/auth/auth.controller.ts` (219 LOC → ~221 LOC)
  - `apps/api/src/modules/transactions/transactions.controller.ts` (489 LOC → ~494 LOC)
- **Archivos nuevos**:
  - `apps/api/test/transactions.e2e-spec.ts` (~50 LOC)
  - `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (~85 LOC)
  - `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` (~30 LOC)
  - `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` (~30 LOC)
  - `docs/architecture/decisions/0008-no-import-type-injectable.md` (~70 LOC, EN)
  - `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (~75 LOC, espejo ES)
- **Ediciones de cableado**:
  - `tools/eslint-plugin-boundary/index.cjs` (+3 LOC)
  - `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (+1 LOC)
- **Cableado de módulo (sólido)**: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/modules/transactions/transactions.module.ts`
- **Tests fallando (21)**: `apps/api/test/{auth,jwt-auth-guard,session-expiry}.e2e-spec.ts`
- **Plugin de boundary**: `tools/eslint-plugin-boundary/index.cjs` + `scripts/run-fixtures.mjs` + 5 reglas existentes
- **Precedente de ADR**: `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md`
- **Seguimiento del slice-8 (F1 de ADR 0007)**: este cambio cierra Gate 3 de la verificación del slice-8.
- **Convenciones del proyecto**: AGENTS.md §2 (rama), §4 (TDD estricto), §5 (commits atómicos), §6 (Conventional Commits, sin atribución de IA), §7 (plugin de boundary), §8 (única fuente de verdad), §11 (fuera de alcance), §13 (espejo en español)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`
- **Referencia de formato**: `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/design.md`
- **Siguiente fase**: `sdd-tasks` (producirá `openspec/changes/fix-api-nestjs-di/tasks.md` alineado con los 8 commits en §4).

---

## 14. Apéndice A: Decisión de forma de `_ServiceAnchor` (Q4 de la propuesta, diferida a diseño)

> La Q4 de proposal §10 preguntó: "¿deberían ambos controllers compartir una única forma canónica (`_ServiceAnchor = [ServiceA, ServiceB] as const`), o cada controller nombra su propio ancla (`_AuthServiceAnchor`, `_TransactionServiceAnchor`)?"

**Decisión**: **forma canónica — `_ServiceAnchor = [...] as const` en ambos controllers**.

**Razonamiento**:

1. **Simetría**: Futuros mantenedores leyendo los 2 controllers lado a lado ven el mismo nombre de campo en cada uno. `grep` para `_ServiceAnchor` a través del codebase retorna TODOS los anclas de controller uniformemente.
2. **Inmutabilidad de `as const`**: El `as const` de TypeScript da el tipo tupla `readonly [AuthService, typeof PasswordResetService, typeof RbacService, typeof SessionService]` que es estructuralmente idéntico al array de runtime. La ventaja sobre el nombrado por-controller (`_AuthServiceAnchor`) es que el nombre del campo documenta su rol (un ancla de servicio), no su alcance. El nombre orientado al rol es más neutral al lenguaje.
3. **Visibilidad `private static readonly`**: `private` significa que el campo es invisible fuera de la clase; ESLint / modo TS estricto enforce ningún uso en runtime. `static` significa que vive en la clase, no en una instancia — fine para defensa de borrado en tiempo de compilación.
4. **Anotación `ReadonlyArray<unknown>`**: el tipo explícito amplía el tipo de elemento del array para que servicios futuros de formas diferentes (por ejemplo, un servicio cuya firma de constructor es `new (a: A, b: B) => Service`) puedan añadirse sin que TypeScript se queje. El valor de runtime sigue siendo `[AuthService, PasswordResetService, …]` (la tupla de referencias de clase).
5. **Último campo**: coincide con el comentario existente "AUTO-FORMATTER MITIGATION" en el auth controller en L112-118 del archivo pre-fix. El comentario se mantuvo por `3db761f` incluso después de que el campo se eliminara; restaurar el campo como ÚLTIMO honra la intención del autor original.

**Forma final** (usada en Archivos 1 y 2):

```typescript
private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
  AuthService,
  PasswordResetService,
  RbacService,
  SessionService,
] as const;
```

El ancla del transactions controller espeja esta forma exacta con los 3 servicios de transactions:

```typescript
private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
  CategoryService,
  ThresholdService,
  TransactionService,
] as const;
```

---

## 15. Pie de documento

**Fase**: diseño · completada en esta sesión.
**Estado**: success · artefacto de diseño producido.
**Persistencia del artefacto**: este diseño DEBE persistirse en DOS lugares (almacén de artefactos hybrid):
- Archivo: `openspec/changes/fix-api-nestjs-di/design.md` (este archivo, fuente de verdad en inglés)
- Engram: `topic_key=sdd/fix-api-nestjs-di/design`, `project=gp-v2`, `scope=project`, `type=architecture`, `capture_prompt=false`

**Siguiente fase**: `sdd-tasks` — leerá este diseño + la spec y producirá un plan de tareas alineado con TDD con checkboxes que coincidan con los 8 commits y 8 pasos de ejecución arriba.

**Readiness de la fase de apply**: este diseño le da a `sdd-apply` todo lo necesario. Los 10 diffs de archivo incluyen el contenido final exacto (donde es razonable) o las líneas exactas a editar (donde el tamaño del archivo excede el presupuesto inline). Sin re-derivación requerida.

**Higiene de memoria**: sin `mem_save` proactivo desde esta fase de diseño — la escritura del almacén de artefactos hace la observación Engram como parte del paso de persistencia en el protocolo envolvente. `mem_save` NO se llama aquí porque el diseño en sí es el artefacto; persistir dos veces crearía un duplicado. El `topic_key` Engram `sdd/fix-api-nestjs-di/design` está reservado para el paso de persistencia del orquestador.

**Espejo en español de ESTE diseño**: según AGENTS.md §13 + el precedente en `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/design.md` (tampoco se generó ningún espejo ES para ese archivo de diseño — la regla se dispara en archivos `.md` bajo `docs/` y `openspec/changes/.../{proposal,spec}.md`, NO en `design.md` mismo). La regla del espejo ES aplica solo a la ADR (Archivos 9, 10).

**Reglas duras honradas**:

- AGENTS.md §2: rama de feature `feat/fix-api-nestjs-di` cortada desde `develop`; sin mutación de `main`.
- AGENTS.md §4: TDD estricto — RED capturado en el Paso 1 antes de cualquier fix de producción.
- AGENTS.md §5: 8 commits atómicos, cada commit es una unidad de trabajo.
- AGENTS.md §6: Conventional Commits, sin atribución de IA, subjects ≤ 72 chars, sin punto final.
- AGENTS.md §7: fronteras ESLint preservadas (sin Prisma, sin cross-module import, sin client-server import introducido).
- AGENTS.md §8: única fuente de verdad — esquemas Zod / cliente Prisma / eventos cross-module sin cambios.
- AGENTS.md §11: lista de fuera de alcance honrada (15 ítems, espejados de spec).
- AGENTS.md §13: EN + ES ADR aterrizan en el MISMO commit atómico (#7).

---

**FIN DEL DISEÑO**.
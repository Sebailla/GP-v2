# Explore: `fix-api-nestjs-di`

> **Phase**: explore · pre-proposal
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `ea7732f`)
> **Author**: SDD orchestrator → `sdd-explore` (executor · model `MiniMax-M3`)
> **Date**: 2026-07-13
> **Read-only investigation**. No code or config mutated.
> **Inputs**: Engram observation `#2278` (slice 8 verify report), the 3 failing e2e files, AGENTS.md §7–§8 boundary rules, slice-7 PR-2 commit `3db761f`.

---

## §1. Executive summary

**Root cause** — one sentence: `apps/api/src/modules/auth/auth.controller.ts` (and `transactions.controller.ts`) import the 4 domain services with the **`import { type Foo }` syntax**, which TypeScript + the runtime module loader fully erase; NestJS's reflective DI therefore sees `undefined` for the constructor parameter at index `[0]` and cannot resolve any of the 4 services (`AuthService`, `SessionService`, `PasswordResetService`, `RbacService`).

**Why it survived slice 7**: A previous iteration (commit `3db761f` — "remove unused imports + auto-formatter anchor") deleted the **only runtime anchor** that kept those symbols alive (`private static readonly _ServiceAnchor = [AuthService, …]`) **at the same time** as it converted the `import { Foo }` to `import { type Foo }`. The author kept the documentation comment that promises the anchor but removed the implementation. Result: every test that goes through `Test.createTestingModule({ imports: [AuthModule] }).compile()` blows up at module-resolution time.

**Blast radius**: 4 services in 1 controller (auth) + 3 services in 1 controller (transactions) = **8 hidden DI breakpoints**, of which only the 4 auth-side ones are currently exercised by tests. The transactions controller has the exact same `import { type Foo }` pattern (lines 22, 25, 27) but ships no NestJS e2e test, so the bug is latent there.

**Fix-shape candidates**: 3 — the cheapest is one-line (drop the `type` keyword on 4 imports), but a class-level ESM anchor or an ESLint rule to forbid `import type` for `@Injectable`/`@Controller` constructors is the durable answer.

---

## §2. The exact 4 unmapped dependencies

`AuthController` (apps/api/src/modules/auth/auth.controller.ts lines 121–127):

```ts
@Controller("/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,          // index [0] — undefined at runtime → "?"
    private readonly sessionService: SessionService,    // index [1] — undefined → "Object"
    private readonly passwordResetService: PasswordResetService,  // index [2] — same
    private readonly rbacService: RbacService,          // index [3] — same
  ) {}
}
```

| Index | Constructor param | Declared type | Where it is `provide`-d | Provider mechanism |
|------:|-------------------|---------------|--------------------------|--------------------|
| `[0]` | `authService`     | `AuthService`         | `auth.module.ts` L48-50 | `useFactory: () => new AuthService()` |
| `[1]` | `sessionService`  | `SessionService`      | `auth.module.ts` L52-60 | `useFactory` w/ 4 deps (prisma + 2 repos + dispatcher) |
| `[2]` | `passwordResetService` | `PasswordResetService` | `auth.module.ts` L62-71 | `useFactory` w/ 5 deps (2 repos + dispatcher + prisma + sink) |
| `[3]` | `rbacService`     | `RbacService`         | `auth.module.ts` L73-75 | `useFactory: () => new RbacService(dispatcher.dispatch)` |

All four providers are correctly registered under the **class identity** (token = the class itself). All four factories return a live instance. All four services are **plain TypeScript classes** — none carry `@Injectable()`:

```
$ grep -n "@Injectable\|@nestjs/common" libs/features/auth/server/src/auth-service.ts \
                                               libs/features/auth/server/src/session-service.ts \
                                               libs/features/auth/server/src/password-reset.service.ts \
                                               libs/features/auth/server/src/rbac-service.ts
(no output)
```

That detail is **not** the bug. `useFactory` providers do not need `@Injectable()` on the produced type — NestJS uses the factory return value as the resolved instance. The bug is upstream: the **controller's constructor parameter types** were erased at compile time, so reflect-metadata has no class reference to look up in the provider registry.

---

## §3. AuthModule wiring (current state)

`apps/api/src/modules/auth/auth.module.ts`:

```ts
@Module({
  controllers: [AuthController],
  providers: [
    { provide: AuthService,           useFactory: () => new AuthService() },
    { provide: SessionService,        useFactory: () => new SessionService(
        defaultPrisma,
        new PrismaSessionRepository(defaultPrisma),
        new PrismaUserRepository(defaultPrisma),
        dispatcher.dispatch,
    ) },
    { provide: PasswordResetService,  useFactory: () => new PasswordResetService(
        new PrismaUserRepository(defaultPrisma),
        new PrismaPasswordResetTokenRepository(defaultPrisma),
        dispatcher.dispatch, defaultPrisma, defaultAuditSink,
    ) },
    { provide: RbacService,           useFactory: () => new RbacService(dispatcher.dispatch) },
    { provide: AuthCronService,       useFactory: () => new AuthCronService(
        new PrismaPasswordResetTokenRepository(defaultPrisma),
    ) },
    JwtAuthGuard,                  // class provider — JwtAuthGuard IS @Injectable (jwt.guard.ts L62)
  ],
  exports: [AuthService, SessionService, RbacService, PasswordResetService, AuthCronService, JwtAuthGuard],
})
```

| Token | Mechanism | Class is `@Injectable()`? | Resolved by NestJS? |
|-------|-----------|---------------------------|---------------------|
| `AuthService`           | useFactory (no deps)        | **No** | Yes (factory produces) |
| `SessionService`        | useFactory (4 deps, no `inject[]`) | **No** | Yes (factory produces) |
| `PasswordResetService`  | useFactory (5 deps, no `inject[]`) | **No** | Yes (factory produces) |
| `RbacService`           | useFactory (1 dep)          | **No** | Yes (factory produces) |
| `AuthCronService`       | useFactory (1 dep)          | **Yes** (auth-cron.service.ts L21) | Yes (factory produces — note: class IS @Injectable, but factory bypasses it) |
| `JwtAuthGuard`          | class provider shorthand    | **Yes** | Yes (NestJS constructs) |

**No mismatches between AuthModule's providers and the controller's constructor types.** The wiring is sound. The bug is that the controller's constructor never sees the resolved tokens because the type references were erased.

Note: `transactions.module.ts` uses a richer `useFactory + inject[]` pattern (L113-157) — also valid, also works at runtime — proving the auth slice's `useFactory` w/o `inject[]` is not the issue.

---

## §4. The 4 suspect services

| Class | File | `@Injectable()` | Constructor deps (all required-or-optional?) | DI-wiring shape |
|-------|------|-----------------|----------------------------------------------|-----------------|
| `AuthService`         | `libs/features/auth/server/src/auth-service.ts` L102 | **No** | `prisma?: PrismaClient, userRepo?: UserRepository` (both optional, default to singleton + PrismaUserRepository) | No DI — pure TypeScript class |
| `SessionService`      | `libs/features/auth/server/src/session-service.ts` L69 | **No** | `prisma?, sessionRepo?, userRepo?, dispatcher?` (last is REQUIRED; F8 guard at L87 throws `TypeError`) | No DI |
| `PasswordResetService`| `libs/features/auth/server/src/password-reset.service.ts` L148 | **No** | `userRepo, tokenRepo, dispatcher, prisma?, auditSink?` (dispatcher REQUIRED; F8 guard at L169) | No DI |
| `RbacService`         | `libs/features/auth/server/src/rbac-service.ts` L113 | **No** | `dispatcher` (REQUIRED; F8 guard at L119) | No DI |

All four are **imported into `AuthModule.providers` and called from `AuthController`**, so they're not orphaned. They all live in `libs/features/auth/server/src/` — the correct location per AGENTS.md §7 / design §2 ("no cross-module import"). None use `@nestjs/common`. They are domain services in the Hexagonal sense (ports + adapters, framework-free by design).

**Why no `@Injectable()`**: by intent. They are constructed by `useFactory` with explicit args, not by NestJS. Adding `@Injectable()` would force each service to import from `@nestjs/common`, which would violate design §2 ("domain code is framework-free"). **The fix must not require `@Injectable()` on these classes.**

---

## §5. Test infrastructure

All 3 failing files share the same bootstrap pattern:

```ts
vi.mock("@core/database", () => ({ prisma: { ... } }));   // L35-52 / L57-76 / L61-80
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(), hash: vi.fn() } }));  // L54-59 / L78-83 / L82-87
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthModule } from "../src/modules/auth/auth.module.js";

beforeEach(async () => {
  vi.resetAllMocks();
  moduleRef = await Test.createTestingModule({
    imports: [AuthModule],   // ← the boom point
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});
```

| Test file | Tests | Bootstrap | `overrideProvider`? |
|-----------|------:|-----------|---------------------|
| `auth.e2e-spec.ts`           | 14 | `Test.createTestingModule({ imports: [AuthModule] }).compile()` | **None** |
| `jwt-auth-guard.e2e-spec.ts` |  4 | Same as above | **None** |
| `session-expiry.e2e-spec.ts` |  3 | Same as above (+ `mintJwt` helper) | **None** |

The bootstrap is a **full-module integration test** — no `.overrideProvider()` shims. That means the test surface IS the production wiring, which is why the failure is observed.

`apps/api/test/setup-env.ts` (loaded by `vitest.config.ts` via `setupFiles`) supplies the env vars `@core/config` requires so the import chain `AuthModule → @features/auth → @core/database → @core/config` doesn't crash before reaching DI.

---

## §6. Blast radius

### §6.1 Production code paths that depend on these services

| Caller | Service | Same bug? |
|--------|---------|-----------|
| `apps/api/src/lib/auth.config.ts` L66-71 | `AuthService` (`new AuthService()`) | **No** — explicit `new`, no NestJS DI |
| `apps/api/src/modules/auth/auth.controller.ts` | all 4 | **YES — current bug** |
| `libs/features/auth/docs/support/service-context.ts` | `AuthService` | Uses `new` (confirmed via codegraph blast radius) — not a NestJS DI consumer |

### §6.2 Other NestJS controllers in `apps/api/`

| Controller | Module | Same bug class? |
|------------|--------|-----------------|
| `apps/api/src/modules/transactions/transactions.controller.ts` | `TransactionsModule` | **YES — latent**. L22 (`type CategoryService`), L25 (`type ThresholdService`), L27 (`type TransactionService`) use `import { type Foo }` for constructor params. Currently latent because there is no `apps/api/test/transactions.e2e-spec.ts` (confirmed — only `auth.*`, `jwt-auth-guard.*`, `session-expiry.*` exist in `apps/api/test/`). |
| `apps/api/src/modules/auth/auth.controller.ts` | `AuthModule` | **YES — current bug** |

### §6.3 Other tests that exercise AuthController indirectly

- `libs/features/auth/server/src/__tests__/auth-service.*.test.ts` — unit tests on the bare services (no NestJS) — pass.
- `libs/features/auth/server/src/__tests__/session-service.test.ts` — same — passes.
- `libs/features/auth/server/src/__tests__/rbac-service.test.ts` — same — passes.
- `libs/features/auth/server/src/__tests__/pattern-a-dispatch.test.ts` — same — passes.
- `libs/features/auth/server/src/__tests__/integration/multi-provider.test.ts` — same — passes.
- The 3 e2e files listed above — **FAIL** with `?, Object, Object, Object`.

### §6.4 Side-effect surfaces that will break if the auth fix alters `AuthModule`'s public surface

- `apps/api/src/app.module.ts` imports `AuthModule` (codegraph blast radius). The module's `exports: [AuthService, SessionService, RbacService, PasswordResetService, AuthCronService, JwtAuthGuard]` are the public DI surface. If a fix changes any export (rename, drop), this consumer breaks.
- `apps/api/src/modules/transactions/transactions.controller.ts` imports `JwtAuthGuard` (L48) — orthogonal to the auth services but co-located. Must keep working.

---

## §7. Constraints from project conventions

- **AGENTS.md §7 (architectural boundaries)** — `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` MUST stay in `libs/features/auth/server/src/`. The fix cannot relocate them.
- **AGENTS.md §7 ESLint `no-prisma-outside-core`** — none of the 4 services construct `new PrismaClient()`. They take `PrismaClient?` as an optional ctor arg and fall back to `defaultPrisma`. Fix cannot introduce `new PrismaClient()` anywhere outside `libs/core/database/src/`.
- **AGENTS.md §4 (strict TDD)** — any fix MUST land test-first. Specifically: a new failing-test that reproduces the DI failure, observed in RED, before the production change.
- **AGENTS.md §8 (single source of truth)** — the 4 services are the canonical implementations; do NOT duplicate them under `apps/api/src/modules/auth/` to "give NestJS a class". Route DI through the existing `AuthModule`.
- **AGENTS.md §6 (no Co-Authored-By / no AI attribution)** — applies to any commit produced by the fix.
- **Design §2 / `tsconfig.base.json`** — `verbatimModuleSyntax: false` BUT `isolatedModules: true`. Under `isolatedModules`, `import { type X }` is erased at compile time **regardless of `verbatimModuleSyntax`**. This is the actual mechanic of the bug.
- **Spanish mirror rule** — `openspec/changes/fix-api-nestjs-di/explore.md` (this file) does not need a `Documents-es/` mirror until it is referenced by a `proposal.md`/`spec.md`/`design.md`/`tasks.md`. None of those exist yet; the mirror rule fires on the **atomic commit** that adds the `.md` files under `openspec/`. The fix's proposal/spec/design/tasks commit must mirror them.
- **`AuthModule` "AUTO-FORMATTER NOTE" (auth.controller.ts L112-118)** — the existing comment promises a class-level static anchor to defeat the auto-formatter heuristic. If the fix adopts the anchor approach, the field must actually exist in code.

---

## §8. Prior attempts / dead ends

### §8.1 What happened in slice 7 PR-2 (commit `3db761f`)

`git show 3db761f -- apps/api/src/modules/auth/auth.controller.ts` reveals the **delete-the-safety-net** sequence:

```diff
-import {
-  AuthService,
-  PasswordResetService,
-  RbacService,
-  SessionService,
+import {
+  type AuthService,
+  type PasswordResetService,
+  type RbacService,
+  type SessionService,
   AuthError,
   ValidationError,
   type CurrentUser,
@@ …
-import {
-  type ForgotPasswordInput,
-  type LoginInput,
-  type RegisterInput,
-  type ResetPasswordInput,
-} from "@features/auth";

 @Controller("/auth")
 export class AuthController {
-  /**
-   * Static runtime anchors. These force the services to be imported
-   * as runtime values (the linter's `useImportType` rule preserves
-   * imports when the symbol is used as a value). The anchors are
-   * never accessed at runtime — they're a marker for the linter.
-   */
-  private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
-    AuthService,
-    PasswordResetService,
-    RbacService,
-    SessionService,
-  ];
-
   constructor( … )
```

The commit:
1. Changed `import { Foo }` → `import { type Foo }` (4 services).
2. **Deleted the static anchor** (the only runtime consumer of those symbols).
3. Updated the surrounding comment to read "a class-level static field … it exists purely to keep the runtime import" — but the field no longer exists.

Result: the symbols became `undefined` at runtime, so NestJS's reflective DI sees `AuthController(?, Object, Object, Object)`. The very first test in `auth.e2e-spec.ts` to call `Test.createTestingModule({ imports: [AuthModule] }).compile()` fails before any route is exercised.

The author almost certainly meant to remove unused imports (`ForgotPasswordInput`, `LoginInput`, `RegisterInput`, `ResetPasswordInput`) — the diff `-import { type ForgotPasswordInput, … }` makes that clear. But the cleanup conflates the **removable** type-only imports (which were correctly typed `type`) with the **runtime-required** value imports (which were incorrectly rewritten to `type Foo`).

### §8.2 Dead ends / things to NOT try

- **Adding `@Injectable()` to the 4 services** — would not help: the controller's constructor types are still erased, and the boundary violation (NestJS import in domain code) is the wrong trade.
- **Switching `useFactory` to `useClass`** — would not help: same root cause. NestJS still reads `reflect-metadata` from the controller's constructor, which is empty.
- **Adding `overrideProvider(AuthService).useFactory(...)` in each test** — would NOT help. The error happens during controller resolution, before any provider override can intercept. The controller is unresolvable.
- **Disabling `isolatedModules` in `tsconfig.base.json`** — would not help. `isolatedModules` is correct for the project's module system; the bug is in the import choice, not the config.
- **Setting `verbatimModuleSyntax: true`** — would not help; the bug is upstream of that knob.

---

## §9. Fix-shape candidates (for `sdd-propose` to decide — NOT committed)

### Shape A — minimal: drop `type` on the 4 imports (1-line change)

In `apps/api/src/modules/auth/auth.controller.ts` L15-27, change:

```ts
import {
  type AuthService,             // ← remove `type`
  type PasswordResetService,    // ← remove `type`
  type RbacService,             // ← remove `type`
  type SessionService,          // ← remove `type`
  AuthError,
  ValidationError,
  type CurrentUser,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@features/auth";
```

to `import { AuthService, PasswordResetService, RbacService, SessionService, … }`.

- **Pros**: smallest diff; touches no other file; 1 commit; pure fix, no refactor.
- **Cons**: doesn't address the **latent** transactions.controller.ts bug; the linter can re-introduce the `type` keyword if anyone runs biome.
- **Effort**: ~5 min.
- **Test impact**: same 21 tests pass; no new tests needed (the existing tests are the regression suite).

### Shape B — durable: keep the static anchor (per the original comment) + drop `type`

Restores the field that commit `3db761f` deleted; combine with Shape A so that if either the anchor OR the non-`type` import is reverted in the future, DI still works.

- **Pros**: belt-and-suspenders; survives a biome reformat; matches the in-tree comment.
- **Cons**: still doesn't catch `transactions.controller.ts` (needs the same treatment in 3 places).
- **Effort**: ~10 min.
- **Test impact**: same 21 pass.

### Shape C — comprehensive: Shapes A+B in auth + mirror to transactions + ESLint rule

Apply Shape A to `auth.controller.ts` AND `transactions.controller.ts` (4 imports there too: `CategoryService`, `ThresholdService`, `TransactionService`, plus `type CreateCategoryInput` etc. — only the 3 service types matter). Add an ESLint rule `@typescript-eslint/no-import-type-on-injectable` (or custom boundary plugin rule) that flags `import { type X }` whenever `X` is used as a constructor parameter of a class decorated with `@Controller` / `@Injectable`.

- **Pros**: closes the latent transactions bug in the same change; the ESLint rule prevents regression; fits the project's slice-1 ESLint-plugin-boundary pattern (`tools/eslint-plugin-boundary/rules/`).
- **Cons**: largest diff; new ESLint rule requires its own fixture pair (`__fixtures__/<rule>/{valid,invalid}.ts`); the rule needs TDD (RED-then-GREEN per AGENTS.md §4).
- **Effort**: 1–2 hours (rule + fixture + activation in `eslint.config.mjs` + `pnpm lint:fixtures` exit 0).
- **Test impact**: same 21 pass + new RED/GREEN for the ESLint rule + fixtures.

### Recommendation (this explore does not commit, only informs)

Shape C is the right call IF the orchestrator treats `transactions.controller.ts` as in-scope. The change is "fix the existing 21-test failure" but the same one-line mistake exists in `transactions.controller.ts` — every slice added since slice 5 has been one future regression away from a hidden DI break. The ESLint rule is the durable enforcement.

If the orchestrator wants the smallest possible change that closes the failing gate, Shape A is enough for the verify report to flip green, with Shape C tracked as a follow-up.

---

## §10. Verification contract

After the fix lands:

1. **`pnpm --filter api test`** exits 0; all 21 currently-failing tests pass.
2. **`AuthController` constructor resolves with 4 real class references** — observable via `Test.createTestingModule({ imports: [AuthModule] }).compile()` succeeding.
3. **The 4 service classes remain constructible** (no `@Injectable()` added — boundary preserved).
4. **`AuthModule`'s public exports are unchanged**: `AuthService, SessionService, RbacService, PasswordResetService, AuthCronService, JwtAuthGuard`.
5. **No new ESLint boundary violations**: `pnpm turbo run lint` exit 0; `pnpm lint:fixtures` exit 0.
6. **No new `new PrismaClient()` outside `libs/core/database/src/`** — existing rule already enforces this; just confirm.
7. **(If Shape C)** transactions e2e bootstrap (when it lands) also resolves the 3 services; new ESLint rule fires RED on a synthetic invalid fixture, GREEN on the valid one.
8. **Strict-TDD trail**: a failing test reproducing the DI error is observed BEFORE the production change. The simplest reproduction is `expect(() => Test.createTestingModule({ imports: [AuthModule] }).compile()).resolves.toBeDefined()` — currently it rejects. Watch that flip from RED → GREEN.
9. **Spanish mirror**: any new `.md` under `openspec/changes/fix-api-nestjs-di/` (proposal/spec/design/tasks) gets a `Documents-es/` mirror in the same atomic commit; grep `-P '[\x{4e00}-\x{9fff}]'` returns 0 CJK codepoints in the mirror.

---

## §11. Files read (for traceability)

Code read via `codegraph_explore` + targeted Read tools. The codegraph MCP tool was the primary read mechanism (per AGENTS.md / CodeGraph protocol). All sources are verbatim.

- `apps/api/src/modules/auth/auth.controller.ts` (L1–219)
- `apps/api/src/modules/auth/auth.module.ts` (L1–91)
- `apps/api/src/modules/auth/auth-cron.service.ts` (L1–37)
- `apps/api/src/modules/transactions/transactions.controller.ts` (L1–489)
- `apps/api/src/modules/transactions/transactions.module.ts` (L1–202)
- `apps/api/src/lib/auth.config.ts` (L1–100, partial)
- `apps/api/src/shared/guards/jwt.guard.ts` (L1–155, partial)
- `libs/features/auth/server/src/auth-service.ts` (L82–134)
- `libs/features/auth/server/src/session-service.ts` (L60–227)
- `libs/features/auth/server/src/password-reset.service.ts` (L118–203)
- `libs/features/auth/server/src/rbac-service.ts` (L1–186)
- `libs/features/auth/server/src/infrastructure/repositories/prisma-user.repository.ts`
- `libs/features/auth/server/src/infrastructure/repositories/prisma-session.repository.ts`
- `libs/features/auth/server/src/infrastructure/repositories/prisma-password-reset-token.repository.ts`
- `libs/features/auth/server/src/index.ts` (L23–44)
- `libs/features/auth/server/src/domain/interfaces/session.repository.ts`
- `libs/features/auth/shared/schemas/session-list.ts`
- `apps/api/test/auth.e2e-spec.ts` (L1–304)
- `apps/api/test/jwt-auth-guard.e2e-spec.ts` (L1–233)
- `apps/api/test/session-expiry.e2e-spec.ts` (L1–260)
- `apps/api/vitest.config.ts`
- `apps/api/tsconfig.json`, `tsconfig.base.json`
- Engram observation `#2278` (slice 8 verify report)
- `git show 3db761f -- apps/api/src/modules/auth/auth.controller.ts`

## §12. Open questions for `sdd-propose`

1. **In-scope or not**: does `transactions.controller.ts` belong to this change? Latent bug, same shape.
2. **Shape selection**: A (minimal), B (anchor + drop), or C (A+B+ESLint rule + transactions)?
3. **Branch model**: per AGENTS.md §2 the work branch is `feat/fix-api-nestjs-di` cut from `develop` (not from `main`); confirm.
4. **Pre-existing-ness acknowledgment**: should the proposal.md explicitly cite Engram `#2278` ("pre-existing slice-7 inheritance, not slice-8 regression") as the discovery trail?
5. **Strict-TDD RED seed**: agree that the RED test is `expect(Test.createTestingModule({ imports: [AuthModule] }).compile()).resolves.toBeDefined()`?

---

**End of brief.**
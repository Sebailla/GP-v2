# Delta Spec — `fix-api-nestjs-di`

> **Change**: `fix-api-nestjs-di` · **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-api-nestjs-di`
> **Mode**: interactive · **Artifact store**: hybrid
> **Date**: 2026-07-13
> **Fix shape (interactive decision)**: **C** — drop `type` + restore anchor in BOTH controllers + cover transactions + new ESLint rule.
> **Single PR**: 10 files, ~245 net LOC, well under the 400-line review budget.
> **Proposal**: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`, `sdd/fix-api-nestjs-di/proposal`)
> **Explore brief**: `openspec/changes/fix-api-nestjs-di/explore.md` (Engram `#2286`)
> **Root-cause commit**: `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor")

---

## 1. Header

| Field | Value |
|-------|-------|
| Project | `gastos-personales-reference` |
| Project key | `gp-v2` |
| Branch | `feat/fix-api-nestjs-di` (cut from `develop@ea7732f`) |
| Date | 2026-07-13 |
| Author | SDD orchestrator → `sdd-spec` (executor · model `MiniMax-M3`) |
| Status | draft · spec phase |
| Source | Proposal Engram `#2287`; Explore Engram `#2286`; slice-7 PR-2 commit `3db761f` |
| Fix shape | C (interactive decision captured in proposal §0) |
| Artifact store | hybrid (Engram + OpenSpec) |
| Delivery strategy | `auto-chain` (>400 LOC auto-chains) — **N/A this change**; 245 LOC stays single-PR |

---

## 2. Intent

Slice-7 PR-2 (`3db761f`) rewrote `import { AuthService, … }` → `import { type AuthService, … }` in `apps/api/src/modules/auth/auth.controller.ts` AND deleted the `private static readonly _ServiceAnchor` runtime anchor in the same commit, but kept the comment that promised the anchor. Under `isolatedModules: true` (`tsconfig.base.json` line 10) the `import type` form is fully erased at compile time, so NestJS's reflective DI sees `undefined` for the constructor parameter at index `[0]` and throws `Nest can't resolve dependencies of the AuthController (?, Object, Object, Object)` — its own error explicitly says "This commonly occurs when using 'import type' instead of 'import' for injectable classes". The latent transactions controller has the same `import { type Foo }` pattern on 3 services (`CategoryService`, `ThresholdService`, `TransactionService` at L22, 25, 27) but ships no e2e test, so the bug is one regression away from re-emerging. This spec locks the fix into 6 testable goals: drop `type` + restore the anchor in BOTH controllers, write a RED-first transactions e2e spec proving the latent bug, add a new boundary-plugin ESLint rule `no-import-type-injectable` so the regression cannot return undetected, write ADR 0008 + its Spanish mirror documenting the decision, and prove all of the above with a green turbo pipeline.

---

## 3. Goals

### G1 — Auth e2e tests flip from RED to GREEN

The 21 currently-failing e2e scenarios in `apps/api/test/{auth,jwt-auth-guard,session-expiry}.e2e-spec.ts` (14 + 4 + 3) MUST pass after the auth controller's import sites are fixed and the runtime anchor is restored. The flip MUST be observed in strict-TDD RED-then-GREEN order: a failing test that reproduces the DI error exists BEFORE the production change; only the minimum code to pass is written; more cases triangulate edge behavior.

### G2 — Transactions controller DI chain is wired correctly (RED-first test)

`apps/api/test/transactions.e2e-spec.ts` MUST be written as a NEW RED-first e2e spec that bootstraps `TransactionsModule` via `Test.createTestingModule({ imports: [TransactionsModule] }).compile()`. The test MUST fail with the same `?, Object, Object, Object` pattern as the auth tests BEFORE the transactions controller is fixed (because the 3 service imports are erased under `isolatedModules`), and MUST pass after the controller is fixed. The transactions test exercises a latent bug that has been silently shipping since slice 5.

### G3 — ESLint rule blocks the regression at the source

A new boundary-plugin rule named `no-import-type-injectable` (resolved from proposal Q1 — clearer than the originally-suggested name) MUST be added to `tools/eslint-plugin-boundary/rules/` and activated in `configs.recommended`. The rule MUST flag `import { type X }` whenever `X` is used as a constructor parameter of a class decorated with `@Controller` or `@Injectable` in the same module. The rule MUST be conservative: if the symbol cannot be resolved in the same file (e.g. imported from another file), the rule MUST skip — never over-report. DTOs and interfaces used only as type annotations MUST NOT trigger the rule (verified by the valid fixture).

### G4 — `pnpm lint:fixtures` exits 0 with the new rule active

The new rule MUST have a `valid.ts` fixture (0 errors) and an `invalid.ts` fixture (≥1 error) under `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/`, and `pnpm lint:fixtures` MUST exit 0 with the rule registered in `scripts/run-fixtures.mjs`'s `RULES` array. The runner MUST exercise both fixtures as a RED-then-GREEN TDD pair: rule wired before the rule body is implemented (RED); rule body implemented and fixtures pass (GREEN).

### G5 — Full turbo pipeline green on the fix branch

`pnpm turbo run test bdd lint typecheck` MUST exit 0 on `feat/fix-api-nestjs-di`. All four tasks MUST report exit code 0. The `apps/api` test suite MUST report 0 failing tests, including the new transactions e2e spec from G2 and the 21 previously-failing scenarios from G1.

### G6 — ADR 0008 documents the decision (with anti-example)

ADR 0008 MUST exist at `docs/architecture/decisions/0008-no-import-type-injectable.md`, covering root cause, considered options, decision, and consequences. Per interactive resolution of proposal Q2, the ADR MUST include a small anti-example showing the broken `import { type Service }` pattern so future maintainers see what the rule prevents. The Spanish mirror at `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` MUST exist in the same atomic commit, MUST mirror the English structure, and MUST be CJK-clean (`grep -P '[\x{4e00}-\x{9fff}]'` returns empty).

---

## 4. Non-Goals

The following are explicitly **out of scope** for this change (mirrored from proposal §2.2 + AGENTS.md §11):

1. Refactoring `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` / `CategoryService` / `ThresholdService` / `TransactionService` internals — they stay where they are.
2. Adding `@Injectable()` to the 7 services — would violate Hexagonal design §2 ("domain code is framework-free").
3. Migration of the slice-1 reference scaffold pattern to a different DI mechanism (`useClass`, `useFactory: ... inject[]`, or anchors persisted as a different shape).
4. Touching `AuthModule` / `TransactionsModule` provider arrays — wiring is sound; the bug is upstream of provider resolution.
5. New BDD scenarios beyond the 1 minimal RED test for transactions (already a deliberate per-Q3 decision).
6. Any change to `apps/web` or `libs/features/*/client/*` — fix is API-only.
7. Changing `tsconfig.base.json` (`isolatedModules: true` is correct; the bug is in the import choice).
8. Any change to Prisma client wiring, env config, or `@core/database`.
9. Coverage gate enforcement at CI (AGENTS.md §11).
10. Migrating `gastos-personales/` to the vertical-slicing model (AGENTS.md §11; playbook ships separately in slice-8 8.4).
11. i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening, observability, audit log UI (AGENTS.md §11).
12. Refactoring `tools/eslint-plugin-boundary` to TypeScript (rules are `.cjs`; converting is its own change).
13. Replacing the controller's error handling, logging shape, response projection, or HTTP status mapping.
14. Replacing `@features/auth` barrel export resolution (no need — the fix is at the import site, not the package layout).
15. Adding a `_ServiceAnchor` to any other controller besides `AuthController` and `TransactionsController` — these are the only two NestJS controllers in `apps/api/` confirmed to carry the bug class (verified by codegraph blast radius; see explore §6.2).

---

## 5. Functional Requirements

> Keywords per RFC 2119. MUST = absolute requirement. SHOULD = recommended but not blocking. MAY = optional.

### R1 — `auth.controller.ts` value-imports the 4 services

The `apps/api/src/modules/auth/auth.controller.ts` constructor parameter types for `AuthService`, `PasswordResetService`, `RbacService`, and `SessionService` MUST be imported with the `type` keyword REMOVED (use value imports) so that NestJS reflective DI can resolve the classes at runtime under `isolatedModules: true`. The remaining `type` annotations on DTOs (`CurrentUser`) and on zod-derived schemas that are NOT used as constructor parameters MUST remain unchanged.

### R2 — `auth.controller.ts` restores the `_ServiceAnchor` runtime anchor

The `AuthController` class MUST declare a `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [AuthService, PasswordResetService, RbacService, SessionService]` runtime anchor that references all 4 services as runtime values. This anchor provides a second independent defense against future `import type` regressions — even if the linter or a future biome run re-introduces `type` on the imports, the anchor keeps the symbols alive at runtime. The anchor MUST be the LAST field in the class (stylistic preference; matches the existing "AUTO-FORMATTER MITIGATION" comment at L112-118 of the file before the fix).

### R3 — `transactions.controller.ts` value-imports the 3 services and adds an anchor

The `apps/api/src/modules/transactions/transactions.controller.ts` constructor parameter types for `CategoryService`, `ThresholdService`, and `TransactionService` MUST be imported with the `type` keyword REMOVED, and the class MUST declare an analogous `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [CategoryService, ThresholdService, TransactionService]` runtime anchor as the LAST field in the class. An "AUTO-FORMATTER MITIGATION" comment block analogous to the auth controller's MUST accompany the anchor.

### R4 — New ESLint rule `no-import-type-injectable` exists and is registered

A new ESLint rule MUST be added to `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (mirroring the `.cjs` single-module `module.exports = { meta, create }` shape of the 5 existing rules). The rule's predicate MUST fire when `(specifier.importKind === "type")` AND the imported name resolves (via conservative file-local symbol resolution) to a class used as a constructor parameter in a class decorated with `@Controller` or `@Injectable` in the same file. The rule MUST skip (not report) when the symbol cannot be resolved in the same file (conservative tie-breaker; never over-report). DTOs and interfaces used only as type annotations MUST NOT trigger the rule.

### R5 — The new rule is registered in the plugin, the recommended config, the runner, and the workspace ESLint config

The new rule MUST be registered in `tools/eslint-plugin-boundary/index.cjs` (added to `plugin.rules` map AND to `configs.recommended` block) AND in `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (added to the `RULES` array). It MUST be exercised by `pnpm lint:fixtures` (no extra glob needed; the `recommended` config globs apply globally on `**/*.{ts,tsx,js,mjs,cjs}` per `eslint.config.mjs`).

### R6 — The new rule has a positive and negative fixture pair

A `valid.ts` fixture (no errors) and an `invalid.ts` fixture (≥1 error) MUST exist under `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/`. The `valid.ts` MUST include a controller that (a) imports services as runtime values (allowed) and (b) imports at least one DTO / interface with `import { type X }` (allowed). The `invalid.ts` MUST include a controller that imports an injectable class with `import { type Service }` for use as a constructor parameter.

### R7 — RED-first transactions e2e test exists and exercises the DI chain

A new e2e test MUST be written at `apps/api/test/transactions.e2e-spec.ts` BEFORE the transactions controller is fixed. The test MUST bootstrap `TransactionsModule` via `Test.createTestingModule({ imports: [TransactionsModule] }).compile()` and assert that the resolved module is defined. The test MUST mock `@core/database` and `bcryptjs` at the boundary (mirroring `auth.e2e-spec.ts` L35-52). The test MUST fail with the same `?, Object, Object, Object` pattern as the auth tests BEFORE the fix and MUST pass after the fix.

### R8 — The 21 previously-failing auth e2e scenarios all pass

The 14 scenarios in `apps/api/test/auth.e2e-spec.ts`, the 4 scenarios in `apps/api/test/jwt-auth-guard.e2e-spec.ts`, and the 3 scenarios in `apps/api/test/session-expiry.e2e-spec.ts` (total 21) MUST all pass after the fix. No `skip` / `todo` / `xfail` decorator may be added to any of these scenarios as a workaround. Every scenario MUST execute the real `compile()` call (no `overrideProvider` shim that would mask the DI failure).

### R9 — ADR 0008 + Spanish mirror exist, mirror is CJK-clean

ADR 0008 MUST exist at `docs/architecture/decisions/0008-no-import-type-injectable.md` following the `0007-slice-8-doc-loc-exception.md` format: Context, Decision, Consequences, plus a small anti-example showing the broken `import { type Service }` pattern (per interactive resolution of proposal Q2). The Spanish mirror MUST exist at `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` in the same atomic commit per AGENTS.md §13, and MUST be a technical Spanish translation (not cultural localization). `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` MUST return empty (exit 1).

### R10 — Full turbo pipeline green

`pnpm turbo run test bdd lint typecheck` MUST exit 0 on `feat/fix-api-nestjs-di`. The `apps/api` test suite MUST report 0 failing tests, including the 21 previously-failing auth scenarios from R8 and the new transactions scenario from R7.

### R11 — ADR cites the regression-source commit

The ADR 0008 SHOULD reference commit `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor") as the regression source so future maintainers can trace the bug class to its origin.

### R12 — `_ServiceAnchor` is the LAST field in each controller class

The `_ServiceAnchor` static field SHOULD be declared as the LAST field in both `AuthController` and `TransactionsController`. This is a stylistic preference so future maintainers see it as a side concern, separate from the controller's actual behavior. (Anchors are never accessed at runtime; they're a marker for the linter.)

---

## 6. Scenarios

> Gherkin Given/When/Then format. Every scenario MUST be runnable as an automated test.
>
> 11 scenarios total: G1 (3 — one per failing file), G2 (1), G3 (3 — block / allow DTO / skip unresolved), G4 (1), G5 (1), G6 (1).

### G1 scenarios (auth e2e flip RED → GREEN)

#### Scenario: Auth e2e test bootstraps without DI failure

- GIVEN `apps/api/src/modules/auth/auth.controller.ts` declares a constructor that takes `AuthService`, `SessionService`, `PasswordResetService`, `RbacService` as value imports (no `type` keyword)
- AND `AuthController` declares a `private static readonly _ServiceAnchor` runtime anchor referencing all 4 services
- WHEN the test bootstrap runs `Test.createTestingModule({ imports: [AuthModule] }).compile()`
- THEN NestJS MUST NOT log `Nest can't resolve dependencies of the AuthController`
- AND `apps/api/test/auth.e2e-spec.ts` MUST exit 0 with all 14 scenarios PASS

#### Scenario: JWT auth guard e2e test bootstraps without DI failure

- GIVEN `AuthModule` is fully wired with all 4 services resolved at runtime
- WHEN the test bootstrap in `apps/api/test/jwt-auth-guard.e2e-spec.ts` runs `Test.createTestingModule({ imports: [AuthModule] }).compile()`
- THEN NestJS MUST NOT log `Nest can't resolve dependencies of the AuthController`
- AND `apps/api/test/jwt-auth-guard.e2e-spec.ts` MUST exit 0 with all 4 scenarios PASS

#### Scenario: Session expiry e2e test bootstraps without DI failure

- GIVEN `AuthModule` is fully wired with all 4 services resolved at runtime
- WHEN the test bootstrap in `apps/api/test/session-expiry.e2e-spec.ts` runs `Test.createTestingModule({ imports: [AuthModule] }).compile()`
- THEN NestJS MUST NOT log `Nest can't resolve dependencies of the AuthController`
- AND `apps/api/test/session-expiry.e2e-spec.ts` MUST exit 0 with all 3 scenarios PASS

### G2 scenarios (transactions RED-first test)

#### Scenario: Transactions controller DI chain is wired correctly

- GIVEN `apps/api/src/modules/transactions/transactions.controller.ts` declares a constructor that takes `TransactionService`, `CategoryService`, `ThresholdService` as value imports (no `type` keyword)
- AND `TransactionsController` declares a `private static readonly _ServiceAnchor` runtime anchor referencing all 3 services
- WHEN a new e2e test bootstraps the `TransactionsModule` via `Test.createTestingModule({ imports: [TransactionsModule] }).compile()`
- THEN NestJS MUST NOT log `Nest can't resolve dependencies of the TransactionsController`
- AND the new `apps/api/test/transactions.e2e-spec.ts` MUST exit 0 with its bootstrap scenario PASS

### G3 scenarios (ESLint rule blocks the regression)

#### Scenario: ESLint rule blocks `import { type Service }` for injectable classes in @Controller files

- GIVEN a file that has a `@Controller()` decorator
- AND the file imports a class decorated with `@Injectable()` using `import { type X }` syntax for use as a constructor parameter
- WHEN ESLint runs the `no-import-type-injectable` rule on that file
- THEN the rule MUST report a diagnostic
- AND the diagnostic message MUST reference both the import statement (file + line) and the controller name

#### Scenario: ESLint rule does NOT block `import { type DTO }` for type-only references

- GIVEN a controller file that imports a DTO type with `import { type CreateUserInput }` for use as a request body type annotation only (NOT as a constructor parameter)
- WHEN ESLint runs the `no-import-type-injectable` rule on that file
- THEN the rule MUST NOT report a diagnostic
- AND `pnpm lint` on the file MUST exit 0

#### Scenario: ESLint rule skips when the imported symbol is not resolved in the same file

- GIVEN a controller file imports `import { type ExternalService }` from `@features/external` (a barrel-exported symbol whose definition lives in a different file)
- WHEN ESLint runs the `no-import-type-injectable` rule on that file
- THEN the rule MUST skip the report (conservative tie-breaker; never over-report when the symbol cannot be file-locally resolved)
- AND the file MUST NOT show the rule's diagnostic in `pnpm lint` output

#### Scenario: `_ServiceAnchor` is the LAST field in both controllers

- GIVEN `AuthController` and `TransactionsController` both declare a `_ServiceAnchor` static field
- WHEN a future maintainer reads either file
- THEN the `_ServiceAnchor` MUST appear after the constructor in source order (verified via `grep -n` line numbers)
- AND the anchor field MUST be marked `private static readonly` so it is invisible at runtime (no public API surface change)

### G4 scenarios (lint:fixtures green)

#### Scenario: `pnpm lint:fixtures` exits 0 with the new rule active

- GIVEN the `valid.ts` fixture has 1+ `import { type X }` for DTOs/interfaces (allowed) and 0 for injectables
- AND the `invalid.ts` fixture has 1+ `import { type Service }` for an injectable class
- WHEN `pnpm lint:fixtures` runs
- THEN the valid fixture MUST report 0 errors
- AND the invalid fixture MUST report ≥1 error
- AND the exit code MUST be 0

### G5 scenario (full turbo pipeline green)

#### Scenario: All turbo tasks pass on `feat/fix-api-nestjs-di`

- GIVEN the fix has been applied (auth + transactions controllers + ESLint rule + ADR + mirror)
- WHEN `pnpm turbo run test bdd lint typecheck` runs on `feat/fix-api-nestjs-di`
- THEN all 4 tasks MUST exit 0
- AND `apps/api` test suite MUST pass with 0 failing tests
- AND the 21 previously-failing auth scenarios MUST PASS
- AND the new transactions scenario MUST PASS

### G6 scenario (ADR documents the decision)

#### Scenario: ADR 0008 exists with anti-example and Spanish mirror

- GIVEN the maintainer approved Shape C in the proposal phase
- AND proposal Q2 was resolved to include a small anti-example
- WHEN ADR 0008 is written at `docs/architecture/decisions/0008-no-import-type-injectable.md`
- THEN the ADR MUST include a small anti-example showing the broken `import { type Service }` pattern in a controller constructor
- AND the ADR MUST explain why `import { type X }` is erased under `isolatedModules: true` (cite `tsconfig.base.json` line 10)
- AND the Spanish mirror at `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` MUST exist with the same structure (Context / Decision / Consequences / Anti-example sections)
- AND `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` MUST exit 1 (no match)
- AND `grep -P '[\x{4e00}-\x{9fff}]' docs/architecture/decisions/0008-no-import-type-injectable.md` MUST exit 1 (no match, defensive check on the English source)

---

## 7. Constraint Surface

### 7.1 Architectural boundaries (AGENTS.md §7 — enforced by ESLint)

- **`no-prisma-outside-core`**: The fix MUST NOT introduce `new PrismaClient()` anywhere outside `libs/core/database/src/`. The 7 services all take `PrismaClient?` as an optional constructor arg and fall back to `defaultPrisma`; this MUST remain unchanged.
- **`no-schemas-outside-shared`**: Zod schemas MUST stay in `libs/features/<x>/shared/schemas/` or `libs/core/config/env.schema.ts`. The fix touches no Zod schemas.
- **`no-client-server-import`**: `libs/features/<x>/client/` MUST NOT import from `*/server/` paths. The fix is API-only and touches no client code.
- **`no-cross-module-import`**: `libs/features/<x>/...` MUST NOT import directly from `libs/features/<y>/...`. The fix preserves the existing import shape (`@features/auth`, `@features/transactions`).
- **`no-mojibake-in-docs`** (optional, slice-8 8.3): `Documents-es/**/*.md` MUST NOT contain CJK codepoints. R9 enforces this at spec level for the new ADR mirror; the rule itself becomes operational once `@eslint/markdown` is wired (slice-8 8.3).
- **NEW `no-import-type-injectable`** (this change): flag `import { type X }` for injectable classes used as controller / injectable class constructor parameters. See R4, R5, R6.

### 7.2 Strict TDD (AGENTS.md §4)

The fix follows **RED → GREEN → TRIANGULATE → REFACTOR** order. Every production change in this change lands ONLY after a failing test that reproduces the failure has been observed:

| Step | Order | Test first? | Production code first? |
|------|-------|-------------|------------------------|
| 1. Write `transactions.e2e-spec.ts` | 1 | YES (RED: test fails with `?, Object, Object, Object`) | no |
| 2. Drop `type` + restore anchor in `auth.controller.ts` | 2 | already RED via existing 21 tests | YES (GREEN: 21 tests pass) |
| 3. Drop `type` + add anchor in `transactions.controller.ts` | 3 | already RED via step 1 | YES (GREEN: new test passes) |
| 4. ESLint rule body + fixtures | 4 | RED: `invalid.ts` fixture throws or returns wrong count | YES: rule body GREENs the fixtures |
| 5. Verify | 5 | n/a | n/a |

### 7.3 Atomic commits (AGENTS.md §5) and Conventional Commits (AGENTS.md §6)

- Every commit is a work-unit (tests + the production change they verify land together).
- No "Co-Authored-By" / no AI attribution in any commit message.
- Type vocabulary: `fix`, `feat`, `test`, `docs`, `chore`, `refactor`.
- Subject ≤72 chars, imperative, no trailing period.
- ADR + Spanish mirror MUST land in the same atomic commit (AGENTS.md §13 hard rule).

### 7.4 Branch model (AGENTS.md §2)

- Work branch: `feat/fix-api-nestjs-di` cut from `develop` (NOT from `main`).
- `main` is immutable; no force-push, no delete, no amend of historic commits.
- `git revert <merge-sha>` cleanly reverses the entire PR.

### 7.5 Single source of truth (AGENTS.md §8)

- No duplication of services. The 7 services stay at their canonical paths; only the controller imports and the controller anchor field change.
- The new ESLint rule is the single source of truth for "do not use `import type` for injectables" — no duplicate guard elsewhere.

### 7.6 Spanish mirror (AGENTS.md §13)

- This spec file (`openspec/changes/fix-api-nestjs-di/spec.md`) is intentionally NOT mirrored at spec-creation time. The mirror rule fires on the atomic commit that introduces the source-of-truth `.md` files (`docs/architecture/decisions/0008-no-import-type-injectable.md` + its `Documents-es/` mirror) — which lands at the apply phase.
- The proposal and explore briefs were also not mirrored (they predate this spec). The mirror rule does NOT retroactively apply to existing `openspec/changes/fix-api-nestjs-di/{proposal,explore}.md` — see slice-8 archive precedent where the spec.md was likewise not mirrored.

---

## 8. Test Plan

| Goal | Test command | Expected outcome |
|------|--------------|------------------|
| G1 (auth flip) | `pnpm --filter api test auth.e2e-spec jwt-auth-guard.e2e-spec session-expiry.e2e-spec` | exit 0; 21/21 PASS |
| G2 (transactions RED-first) | `pnpm --filter api test transactions.e2e-spec` | exit 0; 1/1 PASS (after fix lands; BEFORE fix it MUST exit non-zero) |
| G3 (ESLint rule blocks) | `pnpm lint:fixtures` (invalid fixture) | invalid fixture reports ≥1 error |
| G4 (lint:fixtures green) | `pnpm lint:fixtures` | exit 0; valid=0 / invalid≥1 |
| G5 (full turbo) | `pnpm turbo run test bdd lint typecheck` | exit 0 on all 4 tasks |
| G6 (ADR + mirror) | `bash -c 'grep -P "[\x{4e00}-\x{9fff}]" Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md'` | exit 1 (no match) — same for the English source |

### Manual / non-CI verification steps

- `pnpm --filter api test --reporter=verbose` to enumerate each of the 21 scenarios and confirm no `.skip` / `.todo` decoration.
- `git show 3db761f -- apps/api/src/modules/auth/auth.controller.ts` to confirm the regression-source commit is preserved (NOT amended or rebased).
- `ls Documents-es/docs/architecture/decisions/` to confirm ADR 0008 mirror is present.
- `wc -l docs/architecture/decisions/0008-no-import-type-injectable.md` to confirm the ADR is a real artifact (not a stub).

---

## 9. Acceptance Criteria

> Binary pass/fail conditions for `sdd-verify`. Every criterion MUST be testable from a fresh `git checkout feat/fix-api-nestjs-di && pnpm install`.

| # | Criterion | Pass condition |
|---|-----------|----------------|
| AC1 | `auth.controller.ts` has no `import { type Service }` for the 4 services | `grep -E "type (AuthService\|PasswordResetService\|RbacService\|SessionService)" apps/api/src/modules/auth/auth.controller.ts` returns no matches |
| AC2 | `auth.controller.ts` declares `_ServiceAnchor` as last field | `grep -n "_ServiceAnchor" apps/api/src/modules/auth/auth.controller.ts` shows the field declaration present after the constructor |
| AC3 | `transactions.controller.ts` has no `import { type Service }` for the 3 services | `grep -E "type (CategoryService\|ThresholdService\|TransactionService)" apps/api/src/modules/transactions/transactions.controller.ts` returns no matches |
| AC4 | `transactions.controller.ts` declares `_ServiceAnchor` as last field | `grep -n "_ServiceAnchor" apps/api/src/modules/transactions/transactions.controller.ts` shows the field present |
| AC5 | `apps/api/test/transactions.e2e-spec.ts` exists | file is present and bootstraps `TransactionsModule` |
| AC6 | Rule file exists | `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` is present |
| AC7 | Rule registered in plugin | `grep "no-import-type-injectable" tools/eslint-plugin-boundary/index.cjs` returns ≥2 matches (rules map + recommended config) |
| AC8 | Rule registered in runner | `grep "no-import-type-injectable" tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` returns ≥1 match |
| AC9 | Fixtures exist | `ls tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/{valid,invalid}.ts` succeeds |
| AC10 | `pnpm lint:fixtures` exits 0 | exit code 0; valid=0 errors, invalid≥1 error |
| AC11 | `pnpm --filter api test` exits 0 | exit code 0; 21/21 previously-failing auth tests PASS; 1/1 new transactions test PASS |
| AC12 | `pnpm turbo run test bdd lint typecheck` exits 0 | exit code 0 on all 4 tasks |
| AC13 | ADR 0008 EN exists | `docs/architecture/decisions/0008-no-import-type-injectable.md` is present |
| AC14 | ADR 0008 ES mirror exists | `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` is present |
| AC15 | Both ADRs are CJK-clean | `grep -P "[\x{4e00}-\x{9fff}]" <both files>` exits 1 for both |
| AC16 | ADR contains anti-example | the EN ADR contains a fenced code block showing `import { type Service }` as the broken pattern |
| AC17 | ADR cites `3db761f` | the EN ADR mentions commit `3db761f` (or "slice-7 PR-2") as the regression source |
| AC18 | No commit touches `main` | `git log main` is unchanged from `ea7732f` after the PR merges |
| AC19 | No `Co-Authored-By` in any commit | `git log feat/fix-api-nestjs-di --pretty=format:"%B" \| grep -i "co-authored-by"` returns empty |
| AC20 | Single PR targets `develop` | the PR base branch is `develop` (not `main`) |

---

## 10. Out of Scope

(Mirrored from proposal §2.2 + AGENTS.md §11; non-goals above are operational, this section is the formal review check.)

1. Anything in AGENTS.md §11.
2. Refactoring the 7 services' internals.
3. Adding `@Injectable()` to the 7 services.
4. Changing `AuthModule` / `TransactionsModule` provider arrays.
5. Touching `apps/web` or `libs/features/*/client/*`.
6. Changing `tsconfig.base.json` (`isolatedModules: true` stays).
7. Adding new BDD scenarios (only the 1 minimal RED transactions e2e test).
8. Adding the Playwright e2e job to CI.
9. Refactoring `tools/eslint-plugin-boundary` to TypeScript.
10. Touching `openspec/changes/{vertical-slicing-reference-scaffold, slice-8-closing-bdd-and-docs}/`.
11. Touching the slice-7 chain evidence (`3db761f`, `a9b550d`, `bb25aab`).
12. Migration of `gastos-personales/` (the playbook ships in slice-8 8.4).
13. Coverage gate enforcement at CI.
14. Replacing the controller's error handling, logging, or response projection.
15. A `_ServiceAnchor` field on any controller besides `AuthController` and `TransactionsController`.

---

## 11. Open Questions — RESOLVED

The proposal deferred 3 questions to the spec phase. They are now resolved:

### Q1 — ESLint rule name

**Resolved**: name the rule **`no-import-type-injectable`**.

Rationale: the name reads as a negative predicate (don't import a type for an injectable class), which is exactly the rule's behavior. It is narrower and clearer than `@typescript-eslint/no-import-type-on-injectable` (which falsely implies a typescript-eslint ecosystem plugin) and clearer than the originally-suggested `no-import-type-in-controller` (which would imply the rule fires on all controller files regardless of constructor usage, when in fact it fires only when the type is used as a constructor parameter of a controller/injectable). Predicate scope: NestJS injectable classes (`@Controller` or `@Injectable` decorators) referenced as constructor parameters in the same module.

### Q2 — ADR anti-example

**Resolved**: include a small anti-example in ADR 0008.

Rationale: per `0007-slice-8-doc-loc-exception.md` precedent, ADRs in this repo are narrative prose without code. The interactive decision to include an anti-example (a fenced code block showing the broken `import { type AuthService }` pattern) helps future maintainers see what the rule prevents — the same intuition principle as a "BAD" / "GOOD" pair in a CONTRIBUTING.md. The anti-example is short (≤10 LOC) and lives inline with the Decision section, not as a separate appendix.

### Q3 — Transactions e2e test coverage

**Resolved**: a single-scenario (1 `it`-block) focused test.

Rationale: minimum proof of the latent bug. Avoids over-specifying the transactions controller at this point — the controller already has 25/25 BDD scenarios passing per slice-7 close-out `bb25aab`, so the e2e test's job is RED-first proof of the DI chain, not full route coverage. The 30-LOC allocation in the proposal's affected-areas table covers this single scenario cleanly. If the orchestrator later wants more e2e coverage for transactions, that is a separate change with its own SDD lifecycle.

---

## 12. Traceability

Goal → Requirement → Scenario → Test command:

| Goal | Requirements | Scenarios | Test command |
|------|-------------|-----------|--------------|
| G1 | R1, R2, R8 | G1.1 (`auth.e2e-spec`), G1.2 (`jwt-auth-guard.e2e-spec`), G1.3 (`session-expiry.e2e-spec`) | `pnpm --filter api test` |
| G2 | R3, R7 | G2.1 (`transactions.e2e-spec`) | `pnpm --filter api test transactions.e2e-spec` |
| G3 | R4 | G3.1 (block on controller), G3.2 (allow DTO type-only), G3.3 (skip unresolved symbols from other files) | `pnpm lint:fixtures` (invalid fixture) |
| G4 | R5, R6 | G4.1 (fixtures green) | `pnpm lint:fixtures` |
| G5 | R10 | G5.1 (full turbo) | `pnpm turbo run test bdd lint typecheck` |
| G6 | R9, R11, R12 | G6.1 (ADR + mirror + anti-example + CJK-clean), plus anchor-last style check | `grep -P "[\x{4e00}-\x{9fff}]" <ADR files>` (manual) |

### Acceptance criterion ↔ requirement matrix

| Requirement | Acceptance criterion |
|-------------|----------------------|
| R1 | AC1 |
| R2 | AC2 |
| R3 | AC3, AC4 |
| R4 | AC6 |
| R5 | AC7, AC8 |
| R6 | AC9 |
| R7 | AC5 |
| R8 | AC11 |
| R9 | AC13, AC14, AC15 |
| R10 | AC11, AC12 |
| R11 | AC17 |
| R12 | AC2, AC4 |

### Risk ↔ requirement mitigation

| Risk (proposal §7) | Mitigated by |
|--------------------|--------------|
| R1 (auth controller fix breaks AuthModule provider) | R8 + G1 scenarios (full RED-then-GREEN flip is the empirical check) |
| R2 (ESLint rule false-positives on DTOs/interfaces) | R4 conservative predicate + R6 valid.ts fixture includes a DTO `import { type X }` case |
| R3 (auto-formatter re-introduces `type`) | R2 + R3 (anchors) + R4 (ESLint rule) — defense in depth |
| R4 (silent skip/todo masks failures) | G1 scenarios + `pnpm --filter api test --reporter=verbose` manual check |
| R5 (rule mis-fires on generic type arguments) | R4 conservative predicate + R6 valid.ts fixture |
| R6 (Spanish mirror ships with CJK drift) | R9 + AC15 + G6.1 explicit grep gate |

---

## Cross-references

- **Proposal**: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`)
- **Explore brief**: `openspec/changes/fix-api-nestjs-di/explore.md` (Engram `#2286`)
- **Root-cause commit**: `3db761f` (slice-7 PR-2)
- **Smoking-gun error**: NestJS's "This commonly occurs when using 'import type' instead of 'import' for injectable classes"
- **`tsconfig.base.json`**: line 10 (`isolatedModules: true`)
- **Smoking-gun test bootstrap**: `apps/api/test/auth.e2e-spec.ts` L35-52
- **Failing tests (21)**: `apps/api/test/{auth,jwt-auth-guard,session-expiry}.e2e-spec.ts`
- **Latent bug**: `apps/api/src/modules/transactions/transactions.controller.ts` L22, 25, 27
- **Module wiring (sound)**: `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/modules/transactions/transactions.module.ts`
- **Boundary plugin**: `tools/eslint-plugin-boundary/index.cjs` + `scripts/run-fixtures.mjs` + 5 existing rules
- **ADR precedent**: `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md`
- **Slice-8 follow-up**: ADR 0007 §F1 (this change closes Gate 3 of slice-8 verify)
- **Project conventions**: AGENTS.md §2 (branch), §4 (strict TDD), §5 (atomic commits), §6 (Conventional Commits), §7 (boundary plugin), §8 (single source of truth), §11 (out-of-scope), §13 (Spanish mirror)
- **Canonical spec format reference**: `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/spec.md` (slice-8 archive)

---

**Next phase**: `design` (sdd-design will produce the exact `.cjs` rule body shape, the fixture contents, the controller diff lines, and the ADR skeleton — all translating this WHAT into HOW).
# Proposal — `fix-api-nestjs-di`

> **Status**: draft · proposal phase · **Date**: 2026-07-13
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `ea7732f`) → tracker `feat/fix-api-nestjs-di`
> **Artifact store**: hybrid · **Mode**: interactive
> **Fix shape (interactive decision)**: **C** — drop `type` + restore anchor + cover transactions + add ESLint guard.
> **Single PR**: 10 files, ~245 net LOC, well under the 400-line review budget.

---

## 1. Intent

Slice 8 (`slice-8-closing-bdd-and-docs`) verified on `develop@ea7732f` and reported Gate 3 / pre-existing slice-7 debt under observation F1: **21 e2e tests across `apps/api/test/{auth,jwt-auth-guard,session-expiry}.e2e-spec.ts` fail with `Nest can't resolve dependencies of the AuthController (?, Object, Object, Object)`**. The root cause is verified (not hypothesised): slice-7 PR-2 commit `3db761f` simultaneously rewrote `import { AuthService, … }` → `import { type AuthService, … }` AND deleted the `private static readonly _ServiceAnchor` runtime anchor in `apps/api/src/modules/auth/auth.controller.ts`. With `isolatedModules: true` in `tsconfig.base.json` (line 10), `import type` is fully erased at compile time, so NestJS's reflective DI sees `undefined` for the constructor parameter at index `[0]` and cannot resolve any of the 4 services (`AuthService`, `SessionService`, `PasswordResetService`, `RbacService`). NestJS's own error message explicitly says "This commonly occurs when using 'import type' instead of 'import' for injectable classes". The same `import { type Service }` pattern is present (latent, untested) in `apps/api/src/modules/transactions/transactions.controller.ts` at lines 23, 25, 27 for `CategoryService`, `ThresholdService`, `TransactionService` — every slice added since slice 5 has been one future e2e test away from a hidden DI break. This change drops the `type` keyword + restores the static anchor in BOTH controllers, writes a RED-first e2e spec proving the transactions bug, and adds a new ESLint rule `no-import-type-injectable` to the local boundary plugin so the regression cannot return undetected. Blast radius: 4 services in auth (current) + 3 in transactions (latent) = 8 hidden DI breakpoints, 21 broken tests, all to be resolved by a single PR.

---

## 2. Scope

### 2.1 In Scope

1. `apps/api/src/modules/auth/auth.controller.ts` — drop the `type` keyword on the 4 service imports (`AuthService`, `PasswordResetService`, `RbacService`, `SessionService`) at lines 16-19, and restore `private static readonly _ServiceAnchor` field that commit `3db761f` deleted (referenced by the still-present "AUTO-FORMATTER MITIGATION" comment at lines 112-118).
2. `apps/api/src/modules/transactions/transactions.controller.ts` — same treatment on the 3 service imports at lines 23, 25, 27 (`CategoryService`, `ThresholdService`, `TransactionService`) and add an analogous `_ServiceAnchor` field + comment block.
3. New RED-first test `apps/api/test/transactions.e2e-spec.ts` — minimal e2e spec (1 controller-bootstrap scenario) that exercises the transactions DI chain; reproduces the same error pattern currently seen in `auth.e2e-spec.ts`; lands GREEN after the controller fix.
4. New ESLint rule `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` — flags `import { type X }` whenever `X` is used as a constructor parameter of a class decorated with `@Controller` / `@Injectable` in the same module. Mirrors the structure of `no-cross-module-import.cjs` (`.cjs`, ESTree visitor pattern).
5. ESLint rule fixtures: `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/{valid,invalid}.ts` (mirror the production path shape used by `no-prisma-outside-core`).
6. Wire the new rule into `tools/eslint-plugin-boundary/index.cjs` (register in `plugin.rules` map, add to `configs.recommended` block) and `eslint.config.mjs` (no extra glob; the `recommended` config globs apply globally on `**/*.{ts,tsx,js,mjs,cjs}`).
7. Register the new rule in `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (`RULES` array entry).
8. `pnpm lint:fixtures` exits 0 with the new rule active (positive fixture reports 0 errors; negative fixture reports ≥1).
9. The 21 currently-failing e2e scenarios in `auth.e2e-spec.ts` (14) + `jwt-auth-guard.e2e-spec.ts` (4) + `session-expiry.e2e-spec.ts` (3) all pass.
10. New RED-first transactions scenario passes after the fix.
11. New ADR `docs/architecture/decisions/0008-no-import-type-injectable.md` documents the maintainer-approved decision (per `0007-slice-8-doc-loc-exception.md` precedent for size exceptions, but no exception is needed here — well under any cap).
12. Spanish mirror `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` per AGENTS.md §13 (same atomic commit; `grep -P '[\x{4e00}-\x{9fff}]'` returns 0).
13. Engram observation at `topic_key sdd/fix-api-nestjs-di/proposal`, `type=architecture`, `project=gp-v2`, `scope=project` persists the proposal in the hybrid artifact store.

### 2.2 Out of Scope

- Any refactor of `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` / `CategoryService` / `ThresholdService` / `TransactionService` internals.
- Adding `@Injectable()` decorators to the 4+3 services (would violate the Hexagonal "domain code is framework-free" boundary — design §2).
- Migration of the slice-1 reference scaffold pattern to a different DI mechanism (`useClass`, `useFactory: ... inject[]`, or runtime anchors persisted as a different shape).
- Touching `AuthModule` / `TransactionsModule` providers — they are sound; the bug is upstream of provider resolution.
- Any new BDD scenarios, any new e2e scenarios beyond the 1 minimal RED test for the latent transactions bug.
- Any change to `apps/web` / `libs/features/*/client/*` (the fix is API-only).
- Any change to `tsconfig.base.json` (`isolatedModules: true` is correct for the project's module system; the bug is in the import choice).
- Any change to Prisma client wiring, env config, or `@core/database`.
- Coverage gate enforcement (declared out of scope per AGENTS.md §11).
- Migration of the `gastos-personales/` parent repo to the vertical-slicing model (the playbook ships in `slice-8-closing-bdd-and-docs`; the migration runs in a separate change).
- i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening, observability, audit log UI (AGENTS.md §11).
- Refactoring the boundary plugin to TypeScript (rules are `.cjs`; converting is its own change).
- Replacing the controller's error handling, logging shape, response projection, or HTTP status mapping.
- Replacing `@features/auth` barrel export resolution (no need — the fix is at the import site, not the package layout).

---

## 3. Approach

Five steps, ordered strict-TDD style. **No production change lands without a RED test observed first.**

### Step 1 — Write the RED-first test for the latent transactions bug

Add `apps/api/test/transactions.e2e-spec.ts` with a single `it("boots TransactionsModule")` scenario that calls `expect(await Test.createTestingModule({ imports: [TransactionsModule] }).compile()).toBeDefined()`. Currently this **fails** with the same `?, Object, Object` pattern that auth tests already exhibit (the 3 service imports in `transactions.controller.ts` are erased at compile time under `isolatedModules`). Mock `@core/database` + bcryptjs at the boundary (mirroring the pattern in `auth.e2e-spec.ts` L35-52). Run `pnpm --filter api test` and observe the failure. RED captured.

### Step 2 — GREEN the auth controller

Edit `apps/api/src/modules/auth/auth.controller.ts` L15-27: drop `type` from the 4 service imports; restore `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [AuthService, PasswordResetService, RbacService, SessionService]` after the class declaration (matching the comment at L112-118). Re-run `pnpm --filter api test`. The 21 previously-broken e2e scenarios in `auth.e2e-spec.ts` + `jwt-auth-guard.e2e-spec.ts` + `session-expiry.e2e-spec.ts` all turn GREEN.

### Step 3 — GREEN the transactions controller

Same treatment on `apps/api/src/modules/transactions/transactions.controller.ts`: drop `type` from the 3 service imports at L23, 25, 27; add an analogous `_ServiceAnchor` field. Re-run `pnpm --filter api test`; the new RED test from Step 1 turns GREEN.

### Step 4 — Add the ESLint rule (RED fixture → GREEN rule)

Build the rule file `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs`:
- Visitor listens on `ImportDeclaration` + `ImportSpecifier`.
- Predicate fires when `(specifier.importKind === "type")` AND the imported name resolves (via file-local symbol resolution, conservative approach: only same-file references) to a class used as a constructor parameter in a class decorated with `@Controller` or `@Injectable` in the same file.
- Conservative tie-breaker: if the rule cannot resolve the symbol (e.g. imported from another file), skip — never over-report.
- Register in `tools/eslint-plugin-boundary/index.cjs` rules map and add to `configs.recommended`; register in `scripts/run-fixtures.mjs`'s `RULES` array.
- Write `__fixtures__/no-import-type-injectable/valid.ts` (a controller that imports services as runtime values, plus a controller importing a DTO type as `import { type X }`) and `__fixtures__/no-import-type-injectable/invalid.ts` (a controller with `import { type AuthService }` for a constructor parameter).
- Run `pnpm lint:fixtures`. RED first (rule is uninitialized; fixtures throw or fail); GREEN once the rule is wired correctly and the fixtures show the expected 0 / ≥1 error counts.

### Step 5 — Verify

`pnpm turbo run test bdd lint typecheck` exits 0 on the `feat/fix-api-nestjs-di` branch. The 21 previously-broken e2e tests + the new transactions test + the ESLint rule fixtures all pass. The 4 production code files are edited minimally (+2/-2 lines each for the controllers). Open the single PR against `develop`.

---

## 4. Capabilities

> Contract between this proposal and `sdd-spec`. Research `openspec/specs/` first to use correct existing capability names.

### 4.1 New Capabilities

- `api-di-runtime-anchor`: documents the requirement that NestJS controllers (and any `@Injectable()` class) must NOT use `import { type X }` for symbols used as constructor parameters; those symbols must be referenced as runtime values (either by an explicit non-`type` import or by a `_ServiceAnchor` static field). Will become `openspec/specs/api-di-runtime-anchor/spec.md`.

### 4.2 Modified Capabilities

- `bootstrap-e2e`: the existing `apps/api/test/auth.e2e-spec.ts` / `jwt-auth-guard.e2e-spec.ts` / `session-expiry.e2e-spec.ts` will flip from a RED baseline (failing with DI errors) to a GREEN baseline. No behaviour-change to the production routes — only the bootstrap succeeds where it previously threw. Tracks the new `apps/api/test/transactions.e2e-spec.ts` for the latent transactions case. Will become a delta spec in `openspec/changes/fix-api-nestjs-di/spec.md` (modifies the existing `bootstrap-e2e` capability).

### 4.3 Architectural-boundary ESLint plugin

- The boundary plugin (`tools/eslint-plugin-boundary/`) gains a 6th rule, `no-import-type-injectable`. The rule is added to the `recommended` config and is exercised by `pnpm lint:fixtures` along with the existing 5.

---

## 5. Affected Areas

| File | Change | LOC delta |
|------|--------|----------:|
| `apps/api/src/modules/auth/auth.controller.ts` | Edit (drop `type` on 4 imports + restore `_ServiceAnchor` field) | +2 / -2 |
| `apps/api/src/modules/transactions/transactions.controller.ts` | Edit (drop `type` on 3 imports + add `_ServiceAnchor`) | +2 / -2 |
| `apps/api/test/transactions.e2e-spec.ts` | New (RED-first e2e spec, 1 controller-bootstrap scenario, mocks) | +30 / 0 |
| `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` | New (ESLint rule) | +50 / 0 |
| `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` | New (positive fixture: controller w/ runtime service imports + DTO type imports) | +15 / 0 |
| `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` | New (negative fixture: controller w/ `import { type AuthService }` for a constructor parameter) | +20 / 0 |
| `tools/eslint-plugin-boundary/index.cjs` | Edit (register rule + add to `recommended` config) | +3 / 0 |
| `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` | Edit (add `RULES` entry for `no-import-type-injectable`) | +2 / 0 |
| `docs/architecture/decisions/0008-no-import-type-injectable.md` | New (small ADR per `0007` precedent format) | +60 / 0 |
| `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` | New (Spanish mirror per AGENTS.md §13) | +60 / 0 |

**Total estimated**: +249 / -4, ~245 net LOC. Stays well under the 400-line review budget → **single PR is appropriate** (no auto-chain needed).

---

## 6. Success Criteria

`sdd-verify` will run these 12 gates.

**Functional (G1–G4)**: G1 — all 21 currently-failing tests in `apps/api/test/{auth,jwt-auth-guard,session-expiry}.e2e-spec.ts` PASS. G2 — new RED-first `transactions.e2e-spec.ts` test PASSES after the controller fix. G3 — `Test.createTestingModule({ imports: [AuthModule] }).compile()` and `Test.createTestingModule({ imports: [TransactionsModule] }).compile()` both resolve with 4 + 3 real class references respectively (observable via the bootstrap succeeding). G4 — `AuthModule`'s public exports are unchanged: `AuthService, SessionService, RbacService, PasswordResetService, AuthCronService, JwtAuthGuard`.

**ESLint rule (G5–G7)**: G5 — new rule `@gpr/boundary/no-import-type-injectable` is registered in `tools/eslint-plugin-boundary/index.cjs`, present in `configs.recommended`, and referenced by `scripts/run-fixtures.mjs`. G6 — `pnpm lint:fixtures` exits 0 with the rule active: positive fixture reports 0 errors, negative fixture reports ≥1 error, no fatalErrorCount. G7 — `pnpm turbo run lint` reports 0 violations on the current `develop` tree (conservatively confirming no existing code already violates the rule).

**Hygiene (G8–G12)**: G8 — `pnpm turbo run test bdd lint typecheck` exits 0 on `feat/fix-api-nestjs-di`. G9 — ADR 0008 exists and follows the `0007-slice-8-doc-loc-exception.md` format; covers root cause, considered options, decision, consequences. G10 — Spanish mirror `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` exists; `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` returns empty. G11 — Engram observation persisted at `topic_key sdd/fix-api-nestjs-di/proposal` with `type=architecture`, `project=gp-v2`, `scope=project`; matches `openspec/changes/fix-api-nestjs-di/proposal.md`. G12 — single PR targeting `develop`; every commit respects atomic-commits (AGENTS.md §5), no Co-Authored-By (AGENTS.md §6), and the ADR + mirror land in the same atomic commit (AGENTS.md §13).

---

## 7. Risks

| ID | Risk | Likelihood | Mitigation |
|----|------|------------|------------|
| R1 | The auth controller fix could break something in `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` if their factories miss a hidden dependency. | Low | The explore brief (§3) already audited `AuthModule` providers vs. controller constructor params — the wiring is sound. The 21-test RED-then-GREEN flip in Step 2 is the empirical check: same fixtures, real Prisma mocks, real bcryptjs mocks. If any test still fails after the fix, the failure mode points at a provider (not the controller). |
| R2 | The new ESLint rule could false-positive on legitimate `import { type X }` for DTOs / interfaces / parameter types. | Med | The rule's predicate is narrow: it only fires when (a) `specifier.importKind === "type"`, AND (b) the imported name is used as a constructor parameter in the same file's class that carries `@Controller` or `@Injectable`. DTOs and interfaces are not constructor parameters of a controller/injectable (their only reference sites are type annotations), so the predicate excludes them. Valid fixture exercises the DTO/`import type` case explicitly. |
| R3 | Biome or another auto-formatter could re-introduce `type` on the 4+3 imports on next run. | Low | The new ESLint rule is wired into `configs.recommended` and runs as part of `pnpm turbo run lint`. CI fails any re-introduction. The `_ServiceAnchor` static fields provide a SECOND independent defense — even if the formatter defeats the import line, the anchor holds the runtime reference alive. |
| R4 | The 3 currently-skipped/failing e2e files could have a `skip` / `todo` decorator that we miss — failing tests would silently return PASS. | Low | Step 2 runs `pnpm --filter api test --reporter=verbose` and confirms every scenario in `auth.e2e-spec.ts` (14), `jwt-auth-guard.e2e-spec.ts` (4), `session-expiry.e2e-spec.ts` (3) executes the actual `compile()`. The verify step G1 enumerates the 21 explicitly. |
| R5 | The new ESLint rule's AST logic could mis-fire on `import { type X }` for symbols that ARE decorators (e.g. `type Param<T>` used as a type argument). | Low | The rule's resolution is conservative: it only flags when the same-file symbol-usage as a constructor param is present. Generic type arguments pass through untouched. Valid fixture includes a controller that imports a generic DTO type to triangulate this case. |
| R6 | The Spanish mirror could ship with CJK drift (auto-translation artifact per AGENTS.md §13). | Low | The mirror is hand-translated from the English ADR (not auto-translated). Verify step G10 runs the CJK grep explicitly; the future `no-mojibake-in-docs` rule (slice-8 PRD 8.3) will flag any drift at lint time once `@eslint/markdown` is wired. |

---

## 8. Rollback Plan

**Whole-change**: `git revert <merge-sha>` on `develop` undoes the single PR cleanly. All 21 e2e tests in `apps/api/test/` return to their previously-broken state (acceptable because the same tests were already broken on `develop@ea7732f` — slice-8 verify report confirmed Gate 3 / pre-existing slice-7 debt under F1). The boundary plugin returns to 5 rules; no other rule depends on the new one's predicate. AGENTS.md §11's out-of-scope constraints are not touched.

**Per-step rollback**:
- Step 1+2+3 (controllers + transactions test) — revert the controller edits. Tests fail again as before.
- Step 4 (ESLint rule + fixtures + wiring) — revert the plugin / config / runner edits. Other 4 boundary rules continue to enforce. The fixture files disappear; `pnpm lint:fixtures` resumes its 4-rule baseline.
- Step 5 (ADR + mirror) — revert the `.md` files. No runtime impact.

**Will NOT do**: force-push, rewrite history, touch `main`, modify `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/`, or amend commit `3db761f`. The slice-7 chain evidence (`3db761f`, `a9b550d`, `bb25aab`) stays intact.

---

## 9. Dependencies

- `tools/eslint-plugin-boundary/` rule format (`.cjs`, single-module `module.exports = { meta, create }` shape) — established by `no-prisma-outside-core.cjs` and the other 4 rules; no new pattern is introduced.
- `tsconfig.base.json#isolatedModules: true` — preserved as-is; the rule's predicate is exactly the predicate that the existing TypeScript compiler applies for `import { type X }` erasure.
- `@types/estree` AST node kinds used by the existing rules (`ImportDeclaration`, `ImportSpecifier`) — re-used as-is; no new dependency.
- Existing test infra: `apps/api/test/setup-env.ts` (env var bootstrap) + `apps/api/vitest.config.ts` (`setupFiles` already references it) — re-used as-is; no new setup needed for `transactions.e2e-spec.ts`.
- OpenSpec change directory `openspec/changes/fix-api-nestjs-di/` already exists with `explore.md` (Engram #2286).
- `docs/architecture/decisions/` already exists; ADR 0007 is the size-exception precedent. ADR 0008 (this change) does NOT trigger the size cap.
- `no-mojibake-in-docs` rule (slice-8 8.3) is wired but currently inert per AGENTS.md §13. The grep-based verification in G10 is the substitute for the ESLint-level guard until `@eslint/markdown` is fully active.

---

## 10. Open Questions for `sdd-spec`

1. **ESLint rule scope** — should the new rule apply to ALL files in `apps/api/src/modules/**/*.controller.ts`, or should it be confined to files that import from `@features/*` (the actual surface where DI is at risk)? Spec phase picks one; the proposal stays neutral.
2. **Conservative symbol resolution** — the rule's predicate skips if the imported symbol cannot be resolved in the same file. Should `sdd-design` explore an opt-in mode that does cross-file resolution via `tsconfig.paths` + project graph (larger scope, higher value, harder to keep runtime-stable)? Deferred unless the spec/design phase escalates.
3. **The new transactions e2e spec coverage** — should it be a single scenario (1 it-block, bootstrap-only) or a small set covering all 3 services (3 it-blocks, one per service method)? Proposal picks single-scenario for the RED proof. Spec phase may extend to the small-set variant if it can stay under the 30-LOC allocation.
4. **`_ServiceAnchor` shape** — should both controllers share a single canonical shape (e.g. `private static readonly _ServiceAnchor = [ServiceA, ServiceB] as const`), or each controller names its own anchor (e.g. `_AuthServiceAnchor`, `_TransactionServiceAnchor`)? Proposal defers to spec/design.

---

## 11. Cross-references

- Explore brief: `openspec/changes/fix-api-nestjs-di/explore.md` (Engram observation #2286).
- Root-cause commit: `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor").
- Smoking gun: NestJS's own error message — "This commonly occurs when using 'import type' instead of 'import' for injectable classes".
- `tsconfig.base.json` line 10: `"isolatedModules": true` — the compile-time predicate that erases `import type`.
- E2E bootstrap pattern: `apps/api/test/auth.e2e-spec.ts` L35-52 (mock `@core/database` + bcryptjs at the boundary).
- Failing tests: `apps/api/test/auth.e2e-spec.ts` (14), `apps/api/test/jwt-auth-guard.e2e-spec.ts` (4), `apps/api/test/session-expiry.e2e-spec.ts` (3).
- Latent bug: `apps/api/src/modules/transactions/transactions.controller.ts` L23, 25, 27.
- Module wiring (sound): `apps/api/src/modules/auth/auth.module.ts`, `apps/api/src/modules/transactions/transactions.module.ts`.
- Boundary plugin: `tools/eslint-plugin-boundary/index.cjs` + `scripts/run-fixtures.mjs` + 5 existing rules in `rules/*.cjs`.
- ADR precedent: `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md` (size-exception pattern, not invoked here).
- Slice-8 follow-up (F1 of ADR 0007): this change is exactly F1 — closing Gate 3 of slice-8 verify.
- Project conventions: AGENTS.md §4 (strict TDD), §5 (atomic commits), §6 (Conventional Commits, no AI attribution), §7 (architectural boundaries), §8 (single source of truth), §11 (out-of-scope list), §13 (Spanish mirror).
- Proposal-format precedent: `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/proposal.md` (slice-8 archive).

---

## 12. Next Phase

`next_recommended`: **`spec`**.

`sdd-spec` should:
- Create `openspec/specs/api-di-runtime-anchor/spec.md` capturing the new capability (G5–G7 of §6).
- Create the delta spec for `bootstrap-e2e` in `openspec/changes/fix-api-nestjs-di/spec.md` (G1–G4 of §6).
- Resolve Q1 (rule scope) and Q4 (anchor shape) explicitly.
- For the ADR (G9–G10), declare the cross-link to Engram #2286 + `0007-slice-8-doc-loc-exception.md`.

`status`: **`success`** · `skill_resolution`: **`paths-injected`** · `risks`: R1–R6 (see §7).

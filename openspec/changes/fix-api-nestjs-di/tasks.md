# Tasks — `fix-api-nestjs-di` — `gastos-personales-reference`

> **Status**: draft · tasks phase · **Date**: 2026-07-13
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `6cd56a2`) · tracker `feat/fix-api-nestjs-di` (off develop)
> **Mode**: interactive · **Artifact store**: hybrid · **Delivery**: `auto-chain` (>400 LOC) · **irrelevant this change** (245 LOC ≤ budget)
> **Strict TDD**: ACTIVE (AGENTS.md §4; `openspec/config.yaml strict_tdd: true`)
> **Approval inputs**: `proposal.md` (Engram `#2287`), `spec.md` (Engram `#2289`), `design.md` (Engram `#2291`)
> **Regression source**: commit `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor")
> **Single PR**: 10 files, ~245 net LOC, well under the 400-line review budget
> **Author**: SDD orchestrator → `sdd-tasks` (executor)
> **Next phase**: user pauses before `sdd-apply` (interim check per orchestrator protocol)

---

## Conventions used in this file

- **Work-unit commits**: every commit MUST be independently revertible. Tests land in the same commit as the behavior they verify. The EN ADR + `Documents-es/` ES mirror land in the SAME atomic commit (AGENTS.md §13 hard rule).
- **No "Co-Authored-By"** trailers (AGENTS.md §6 / project rule).
- **Conventional Commits**: `type(scope): subject` — imperative, ≤72 chars, no trailing period.
- **RED before GREEN**: the first commit of each TDD pair MUST be a failing test observed before any production code is written. For docs (commit #7) there is no Vitest RED; verification is `wc -l`, `grep`, `grep -P '[\x{4e00}-\x{9fff}]'`.
- **`MUST / SHALL / MUST NOT`** are RFC 2119; anything weaker (should, may) is non-binding.
- The 8 tasks below map 1:1 to the 8 atomic commits in `design.md` §4. **No 9th commit. No merging.**

---

## §1. Dependency graph

```
T1 (RED test — transactions.e2e-spec)
    │
    ├──────────────────────┐
    ▼                      ▼
T2 (GREEN transactions    T4 (RED rule wiring:
controller — drop            stub body + plugin +
type + add anchor)           runner + invalid fixture;
                             no valid.ts yet — runner
T3 (GREEN auth               expects RED)
controller — same               │
treatment + rewrite              ▼
auto-formatter comment)     T5 (GREEN rule body
    │                       implementation — replaces
    │                       the stub. invalid.ts now
    ▼                       reports ≥1; valid.ts still
T6 (TRIANGULATE valid       missing → runner still
fixture — also re-asserts    complains about a missing
4 prior + 1 + lint:fixtures  valid.* file)
green)                           │
    │                              ▼
    └────────────┐         T6 ↘ (valid.ts adds the
                 ▼         triangulation; both fixtures
                 T7 (ADR    pass concurrently)
                 0008 EN +    │
                 ES mirror   │
                 atomic      │
                 commit)     │
                 │           │
                 └────┬──────┘
                      ▼
                     T8 (chore — turbo verify; no file changes)
```

**Execution order invariant**: `T1 → { T2, T4 } → T3 → T5 → T6 → T7 → T8`. T2 and T4 are parallelizable (different files); the orchestrator sequences them as `T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8` because T3 observes the 21-test green flip that proves T2's RED was real, and T6 needs T5's rule body.

---

## §2. Per-task tables (8 tasks)

### T1 — RED-first transactions e2e test

| Field | Value |
|-------|-------|
| Commit | `test(api): RED — add transactions.e2e-spec proving latent DI bug` |
| Files | `apps/api/test/transactions.e2e-spec.ts` (NEW, ~50 LOC) |
| Depends on | — (first task; nothing to depend on) |
| LOC | +50 / 0 |
| TDD | RED-first. Write the test, run it, CONFIRM it fails with `Nest can't resolve dependencies of the TransactionsController (?, ?, ?)`. Do NOT touch any production code in this commit. |
| Verify | `pnpm --filter api test transactions.e2e-spec` MUST exit non-zero (Vitest FAIL); stdout MUST contain the literal phrase `Nest can't resolve dependencies of the TransactionsController`. |

---

### T2 — GREEN transactions controller fix

| Field | Value |
|-------|-------|
| Commit | `fix(api): transactions.controller.ts — drop type kw + add _ServiceAnchor` |
| Files | `apps/api/src/modules/transactions/transactions.controller.ts` (EDIT, +5 / -3 net) |
| Depends on | T1 |
| LOC | +5 / -3 |
| TDD | GREEN. The RED test from T1 already fails; this commit drops `type` from the 3 imports at L23/L25/L27 (`CategoryService`, `ThresholdService`, `TransactionService`); appends `_ServiceAnchor = [CategoryService, ThresholdService, TransactionService] as const;` as the LAST class field; updates the L87-90 "AUTO-FORMATTER NOTE" comment to reference ADR 0008 + the ESLint rule. `type CurrentUser` at L46 STAYS (DTO reference, NOT constructor param). All other `type DTO` annotations (L34-42) STAY unchanged. |
| Verify | `pnpm --filter api test transactions.e2e-spec` MUST exit 0 with `1/1 PASS`. AC3 (`grep -E "type (CategoryService\|ThresholdService\|TransactionService)" …/transactions.controller.ts` no matches) MUST hold. AC4 (`grep -n "_ServiceAnchor" …/transactions.controller.ts` shows exactly one match, with line number > constructor) MUST hold. |

---

### T3 — GREEN auth controller fix (closes the 21-test RED baseline)

| Field | Value |
|-------|-------|
| Commit | `fix(api): auth.controller.ts — drop type kw + restore _ServiceAnchor` |
| Files | `apps/api/src/modules/auth/auth.controller.ts` (EDIT, +5 / -3 net) |
| Depends on | T2 (T3 reuses the same TDD pattern; sequencing ensures the 21-test flip is observed AFTER T2's narrow transactions GREEN, isolating any regression signal) |
| LOC | +5 / -3 |
| TDD | GREEN. Drop `type` from the 4 service imports at L16-19 (`AuthService`, `PasswordResetService`, `RbacService`, `SessionService`); restore `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [AuthService, PasswordResetService, RbacService, SessionService] as const;` as the LAST class member (matches the comment at L112-118 that already references the anchor). Rewrite the L112-118 comment to reference ADR 0008 + the ESLint rule. `type CurrentUser` at L22 STAYS (DTO reference, NOT constructor param). |
| Verify | `pnpm --filter api test auth.e2e-spec jwt-auth-guard.e2e-spec session-expiry.e2e-spec transactions.e2e-spec` MUST exit 0; reporter MUST show `22/22 PASS` (14 + 4 + 3 + 1). AC1 (`grep -E "type (AuthService\|PasswordResetService\|RbacService\|SessionService)" …/auth.controller.ts` no matches) MUST hold. AC2 (`grep -n "_ServiceAnchor" …/auth.controller.ts` shows the field AFTER the constructor) MUST hold. |

---

### T4 — ESLint rule scaffold + plugin wiring + invalid.ts RED fixture

| Field | Value |
|-------|-------|
| Commit | `feat(eslint): wire no-import-type-injectable rule scaffolding + invalid fixture` |
| Files | `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (NEW EMPTY STUB, +5 lines), `tools/eslint-plugin-boundary/index.cjs` (EDIT, +3 LOC: `require` + `plugin.rules` entry + `configs.recommended.rules` entry), `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (EDIT, +1 LOC in `RULES` array), `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` (NEW, ~30 LOC) |
| Depends on | T1 (provides the "regression source" rationale for the rule); independent of T2/T3 (the rule guards the future, the controllers are the present fix) |
| LOC | +39 / 0 |
| TDD | RED scaffold. Create the rule file as an INTENTIONAL EMPTY STUB (`module.exports = { meta: { ... }, create: () => ({}) }`) that reports no errors. Create `invalid.ts` with the exact broken pattern (`import { type AuthService } from "@features/auth"; @Controller("/auth") export class BadController { constructor(private readonly auth: AuthService) {} }`). Wire registration in `index.cjs` and `run-fixtures.mjs`. Run `pnpm lint:fixtures`; EXPECT FAIL — the runner expects `invalid.ts` to report ≥1 error but the empty stub reports 0. **valid.ts is INTENTIONALLY MISSING in this commit** so the runner exits early on the "missing valid fixture" invariant before it gets to the empty-rule-body assertion; this forces the failure mode to be predictable. The fixture path mirrors the production path shape (no `libs/...` nesting — the new rule is path-agnostic; it only cares about the @Controller decorator in the same file). |
| Verify | `pnpm lint:fixtures` MUST exit non-zero with `FAIL  no-import-type-injectable (invalid.ts): expected >=1 errors, got 0` (or equivalent runner error). The 4 existing rules' fixtures remain green (no regression). |

---

### T5 — GREEN rule body (replace stub with full implementation)

| Field | Value |
|-------|-------|
| Commit | `feat(eslint): implement no-import-type-injectable rule body` |
| Files | `tools/eslint-plugin-boundary/rules/no-import-type-injectable.cjs` (EDIT: +85 / -5, full implementation replaces the stub) |
| Depends on | T4 |
| LOC | +85 / -5 |
| TDD | GREEN. Replace the empty stub body with the full `collectLocalControllerConstructors` + `collectReferencedNames` + `ImportDeclaration` visitor logic per `design.md` §2 File 4. Predicate: `(specifier.importKind === 'type' || node.importKind === 'type')` AND `localName ∈ anchorsByLocalName`. Conservative tie-breaker: if the imported symbol is NOT used as a constructor parameter in a `@Controller`/`@Injectable` class in the same file, SKIP silently. Run `pnpm lint:fixtures`. EXPECT: invalid.ts now reports ≥1 error (the rule fires on the broken pattern); runner still complains about the missing valid.ts (this is by design — valid.ts lands in T6). |
| Verify | `pnpm lint:fixtures` MUST exit non-zero (still waiting on valid.ts), BUT the failure mode MUST be `FAIL  no-import-type-injectable: missing valid fixture` (NOT "invalid.ts reported 0 errors"). The 4 existing rules' fixtures remain green. The pattern check `pnpm eslint --no-config-lookup --rulesdir tools/eslint-plugin-boundary/rules --rule '{"no-import-type-injectable":"error"}' tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/invalid.ts` MUST report ≥1 diagnostic (manual round-trip; this is the AC6 + AC10 binary). |

---

### T6 — TRIANGULATE: add valid.ts fixture (rule is now production-ready)

| Field | Value |
|-------|-------|
| Commit | `feat(eslint): add valid.ts triangulation fixture for no-import-type-injectable` |
| Files | `tools/eslint-plugin-boundary/__fixtures__/no-import-type-injectable/valid.ts` (NEW, ~30 LOC) |
| Depends on | T5 |
| LOC | +30 / 0 |
| TDD | TRIANGULATE. Add the valid.ts per `design.md` §2 File 5: a controller that (a) imports services as runtime values (allowed), AND (b) imports a DTO `import type { CreateUserInput }` for a method-body parameter (allowed; NOT a constructor param). Run `pnpm lint:fixtures`. EXPECT: valid=0 errors, invalid≥1 error, exit 0 overall. This commit also confirms the rule's conservative predicate DTO-pass-through case (G3.2 spec scenario). |
| Verify | `pnpm lint:fixtures` MUST exit 0 with stdout containing `PASS  no-import-type-injectable/valid.ts (errors=0)` AND `PASS  no-import-type-injectable/invalid.ts (errors>=1)`. AC6 + AC9 + AC10 all hold. |

---

### T7 — ADR 0008 (EN + ES mirror in the same atomic commit)

| Field | Value |
|-------|-------|
| Commit | `docs(adr): ADR 0008 — forbid import type for NestJS injectables in controllers (EN + ES mirror)` |
| Files | `docs/architecture/decisions/0008-no-import-type-injectable.md` (NEW EN, ~70 LOC), `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` (NEW ES mirror, ~75 LOC) |
| Depends on | T6 (the rule is fully wired before the rationale ship; AGENTS.md §13 hard rule bundles EN + ES in the same atomic commit) |
| LOC | +145 / 0 |
| TDD | Documentation commit (no Vitest RED exists). The body must include a small anti-example per `spec.md` Q2 resolution (a fenced TypeScript block showing the broken `import { type Service }` pattern). The EN ADR must cite commit `3db761f` in the References section per spec R11. The ES mirror is hand-translated from the EN (never auto-translated); per AGENTS.md §13 + design §2 File 10, the prose is technical Spanish, code fences stay verbatim. |
| Verify | `wc -l docs/architecture/decisions/0008-no-import-type-injectable.md` MUST report ≥50 (real artifact, not a stub). `grep -c "^## Anti-example" docs/architecture/decisions/0008-no-import-type-injectable.md` MUST be ≥1 (AC16). `grep -c "3db761f" docs/architecture/decisions/0008-no-import-type-injectable.md` MUST be ≥1 (AC17). `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` MUST return empty stdout (AC15 — exit 1 means no match; we check stdout directly to be portable across grep/perl). `ls Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` MUST succeed. |

---

### T8 — REFACTOR / verify (full turbo pipeline green)

| Field | Value |
|-------|-------|
| Commit | `chore(api): verify turbo test+bdd+lint+typecheck exits 0 on feat/fix-api-nestjs-di` |
| Files | (no file changes — verification gate only; the orchestrator MAY elide this commit if the verification runs on the prior commit's tree instead) |
| Depends on | T7 |
| LOC | 0 / 0 |
| TDD | REFACTOR gate. Re-run the full turbo pipeline and confirm exit 0 on every task. This is the binary acceptance for AC11 + AC12 + the slice-8 follow-up F1 of ADR 0007. The `apps/api` test suite MUST report 22/22 PASS (14 + 4 + 3 + 1). `pnpm lint:fixtures` MUST exit 0 with the new rule's fixtures green. |
| Verify | `pnpm turbo run test bdd lint typecheck` MUST exit 0 on all 4 turbo tasks. `pnpm --filter api test` MUST show `22/22 PASS`. `pnpm lint:fixtures` MUST exit 0. `git log feat/fix-api-nestjs-di --pretty=format:"%B" \| grep -i "co-authored-by"` MUST return empty (AC19). |

---

## §3. PR plan (single PR)

**PR title**: `fix(api): close Gate 3 (NestJS DI) + blind with no-import-type-injectable rule`

**Branch**: `feat/fix-api-nestjs-di` (cut from `develop` at HEAD `6cd56a2`)

**Base branch**: `develop` (NOT `main` — AGENTS.md §2; AC20)

**Merge strategy**: squash-merge at PR end (standard for single-PR fixes; preserves the 8-commit story in the PR description while collapsing to a single revertible change on `develop`).

**Pre-PR checklist**:

- [ ] All 8 commits land in order on `feat/fix-api-nestjs-di`.
- [ ] Each commit message is `type(scope): <subject>`, imperative present, ≤72 chars subject, no trailing period.
- [ ] No `Co-Authored-By` trailers in any commit (AC19).
- [ ] No commit modifies `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold}/` (slice-1 + slice-8 umbrellas are immutable).
- [ ] No commit amends or rebases the slice-7 chain evidence (`3db761f`, `a9b550d`, `bb25aab`).
- [ ] `pnpm turbo run test bdd lint typecheck` exits 0 on the branch (T8 verification).
- [ ] `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md` returns empty stdout (T7 verification; AC15).
- [ ] `git diff --stat develop..feat/fix-api-nestjs-di` shows ≤10 files and ≤+250 / -16 LOC delta (per `design.md` §4 final total).
- [ ] ESLint boundaries (`pnpm lint:fixtures`) still pass for the 4 existing rules (`no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`).

---

## §4. Delivery strategy

- **Delivery strategy** (from `openspec/config.yaml`): `auto-chain` (auto-slices on >400 LOC).
- **This change's effective strategy**: single PR. 245 net LOC sits well under the 400-line budget; no auto-chain trigger fires.
- **No chained PRs recommended** for `fix-api-nestjs-di`.
- **Branch**: `feat/fix-api-nestjs-di` cut from `develop` after the user's "go" signal.
- **Reviewer**: maintainer (Sebastián Illa). Run `gentle-ai review start` after the 8 commits land on the branch.
- **Risk profile**: 6 risks catalogued in `proposal.md` §7 + `design.md` §6 (R1-R6); all have concrete mitigations already in the design.

---

## §5. Apply order

1. **Create branch** `feat/fix-api-nestjs-di` off `develop@6cd56a2`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-api-nestjs-di
   ```
2. **Apply the 8 commits** in strict TDD order per §2 above (T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8). Each commit lands ATOMICALLY — never split, never squash mid-stream.
3. **Run the full turbo verification**:
   ```bash
   pnpm install
   pnpm turbo run test bdd lint typecheck   # MUST exit 0
   pnpm --filter api test                   # MUST exit 0; 22/22 PASS
   pnpm lint:fixtures                      # MUST exit 0
   ```
4. **Push the branch**:
   ```bash
   git push -u origin feat/fix-api-nestjs-di
   ```
5. **Open the PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-api-nestjs-di \
     --title "fix(api): close Gate 3 (NestJS DI) + blind with no-import-type-injectable rule" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
6. **Wait for CI** (turbo + lint:fixtures + boundary-plugin fixtures).
7. **Review + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-api-nestjs-di   # after maintainer approval
   ```
8. **`sdd-verify` runs on `develop` post-merge** to confirm Gate 3 closes (the 21-test flip + the new transactions e2e spec + the ESLint rule fixtures all PASS independently of the PR-side history).
9. **`sdd-archive` moves** `openspec/changes/fix-api-nestjs-di/{explore,proposal,spec,design,tasks}.md` to `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/` per the orchestrator's archive protocol.

---

## §6. Resolved design open questions

- **Q1 (ESLint rule name)**: `no-import-type-injectable` — resolved in `spec.md` §11.
- **Q2 (ADR examples)**: include a small anti-example in the EN ADR (fenced code block showing the broken `import { type Service }` pattern) — resolved in `spec.md` §11.
- **Q3 (transactions e2e test scope)**: 1-scenario focused (single `it`-block, bootstrap-only) — resolved in `spec.md` §11.
- **Q4 (`_ServiceAnchor` shape, raised in `design.md` Appendix A)**: canonical `_ServiceAnchor` (NOT per-controller-named like `_AuthServiceAnchor`) with `private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [...services...] as const;` as the LAST class field — resolved in `design.md` §14.

**No open questions remain at the tasks phase.** `sdd-apply` proceeds directly with the 8 tasks above.

---

## §7. Out of scope (whole change)

(Orchestrator-enforced; mirrors `spec.md` §4 + `proposal.md` §2.2 + AGENTS.md §11.)

1. Refactoring `AuthService` / `SessionService` / `PasswordResetService` / `RbacService` / `CategoryService` / `ThresholdService` / `TransactionService` internals.
2. Adding `@Injectable()` decorators to the 7 services (would violate Hexagonal design §2: "domain code is framework-free").
3. Migration of the slice-1 reference scaffold pattern to a different DI mechanism (`useClass`, `useFactory: ... inject[]`, or a runtime anchor persisted as a different shape).
4. Touching `AuthModule` / `TransactionsModule` provider arrays — wiring is sound (verified in `design.md` File 1 + File 2 references); the bug is upstream of provider resolution.
5. New BDD scenarios beyond the 1 minimal RED transactions e2e test (per Q3 resolution).
6. Any change to `apps/web` / `libs/features/*/client/*` (fix is API-only).
7. Any change to `tsconfig.base.json` (`isolatedModules: true` is correct; the bug is in the import choice, not the config).
8. Any change to Prisma client wiring, env config, or `@core/database`.
9. Coverage gate enforcement at CI (AGENTS.md §11).
10. Migration of `gastos-personales/` to the vertical-slicing model (AGENTS.md §11; the playbook ships separately in slice-8 8.4).
11. i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening, observability, audit log UI (AGENTS.md §11).
12. Refactoring `tools/eslint-plugin-boundary` to TypeScript (rules are `.cjs`; converting is its own change).
13. Replacing the controllers' error handling, logging shape, response projection, or HTTP status mapping.
14. Replacing `@features/auth` / `@features/transactions` barrel-export resolution (no need — the fix is at the import site, not the package layout).
15. Adding `_ServiceAnchor` to any other controller besides `AuthController` and `TransactionsController` (per `spec.md` §4 non-goal #15; these are the only two NestJS controllers in `apps/api/` carrying the bug class).
16. Spawning sub-tasks for ESLint rule V2 enhancements (cross-file symbol resolution via `tsconfig.paths` + project graph) — deferred (see `design.md` §2 File 4 "Known false-NEGATIVE cases").

---

## §8. Risks

(Mirrors `proposal.md` §7 + `design.md` §6 R1-R6 with concrete task-level mitigations.)

- **R1 (auth controller fix breaks a `*Service` factory)** — Low. Mitigated by the T3 verification (`22/22 PASS` after the controller edit). Any provider-wiring regression surfaces as `Nest can't resolve dependencies of the …Service` (provider issue, distinct from `?` (controller issue)).
- **R2 (ESLint rule false-positives on legitimate `import { type X }` for DTOs / interfaces)** — Medium. Mitigated by the narrow predicate (file-local resolution, requires SAME-file constructor-param reference) AND the T6 valid.ts triangulation fixture (uses `import type { CreateUserInput }` in a method-body parameter — proves the rule does NOT fire).
- **R3 (Biome or another auto-formatter re-introduces `type` on the 4+3 imports)** — Low. Defense in depth: (a) the ESLint rule (T4-T6) runs in `pnpm turbo run lint` via `boundary.configs.recommended`; (b) the `_ServiceAnchor` static fields (T2 + T3) keep the symbols alive at runtime even if the formatter defeats the import line.
- **R4 (silent `skip` / `todo` decorators mask failures)** — Low. The T8 verbose reporter enumeration (`22/22 PASS`) catches this; AC11 is the binary gate. The 21 previously-failing e2e files have no `.skip` / `.todo` decorators per slice-8 verify (`develop@ea7732f` F1 observation).
- **R5 (rule mis-fires on generic type arguments `Param<T>`)** — Low. The rule walks `Identifier` nodes in type positions and any match against the local name triggers — this is the correct behavior (type-erased generics break DI just as type-erased classes do). T6 valid.ts triangulates the case where the type-imported symbol is NOT used as a constructor parameter.
- **R6 (Spanish mirror ships with CJK drift)** — Low. The ES mirror is hand-translated from the EN ADR (never auto-translated; AGENTS.md §13 forbids the auto-translation pipeline). The T7 verification `perl -ne 'print if /\p{Han}/'` returns empty stdout by construction.

---

## §9. Review Workload Forecast

| Field | Value |
|-------|-------|
| **Estimated changed lines** | 245 net LOC (`+250 / -16` per `design.md` §4 footer) |
| **400-line budget risk** | Low (245 << 400; 61% of budget unused) |
| **Chained PRs recommended** | No |
| **Delivery strategy** | `auto-chain` (project default); auto-chain trigger NOT fired (245 < 400) |
| **Effective strategy** | single-pr |
| **Single-PR rationale** | 245 net LOC well under 400; one PR keeps the story coherent (RED test → GREEN transactions → GREEN auth → RED rule scaffold → GREEN rule body → TRIANGULATE valid fixture → ADR + ES mirror → verify) |
| **Decision needed before apply** | No (no `ask-on-risk` trigger; all 6 risks have concrete mitigations already engineered into the 8 tasks) |
| **Chain strategy** | n/a (single-PR path) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

---

## §10. Status

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, `tdd`) · `risks`: R1-R6 (concrete mitigations baked into the 8 tasks above)

`next_recommended`: **`apply`** — orchestrator creates `feat/fix-api-nestjs-di` off `develop@6cd56a2` and applies the 8 tasks in §2 sequentially.

---

## Cross-references

- **Proposal**: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`)
- **Spec**: `openspec/changes/fix-api-nestjs-di/spec.md` (Engram `#2289`; 6 goals, 12 requirements, 11 scenarios, 20 acceptance criteria)
- **Design**: `openspec/changes/fix-api-nestjs-di/design.md` (Engram `#2291`; 10 file diffs, 8 atomic commits, 8 execution steps)
- **Explore brief**: `openspec/changes/fix-api-nestjs-di/explore.md` (Engram `#2286`)
- **Root-cause commit**: `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor")
- **`tsconfig.base.json`** line 10 (`isolatedModules: true`) — the compile-time predicate that erases `import type`
- **Boundary plugin**: `tools/eslint-plugin-boundary/` (existing 5 rules + 1 new `no-import-type-injectable`)
- **ADR precedent**: `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md` (format reference; NOT invoked — this change sits well under any size cap)
- **Slice-8 follow-up**: ADR 0007 §F1 (Gate 3 of slice-8 verify) — this change closes it
- **Slice-8 tasks format**: `openspec/changes/archive/2026-07-13-slice-8-closing-bdd-and-docs/tasks.md`
- **Project conventions**: AGENTS.md §2 (branch), §4 (strict TDD), §5 (atomic commits), §6 (Conventional Commits), §7 (boundary plugin), §8 (single source of truth), §11 (out-of-scope), §13 (Spanish mirror hard rule)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`

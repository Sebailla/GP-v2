# Proposal — `slice-8-closing-bdd-and-docs`

> **Status**: draft · proposal phase · **Date**: 2026-07-12
> **Project**: `gastos-personales-reference` · **Branch**: `develop` · tracker `feat/slice-8-closing-bdd-and-docs`
> **Artifact store**: hybrid · **Mode**: interactive

---

## 1. Why

Slice 7 closed on `develop` (`bb25aab`, squash of PR-51) with **25/25 transactions BDD scenarios passing** via the bridge fix in `a9b550d`. That fix exposed four open debts:

1. **Auth has the same bridge bug transactions had.** `libs/features/auth/docs/support/register.ts` (80 LOC) still uses the broken `(world, ...args) => void | Promise<void>` rest-args wrapper; cucumber 13's `UserCodeRunner` will flag it the same way and every auth scenario times out at 5000ms.
2. **BDD has no CI gate.** `.github/workflows/ci.yml` ends with a documented placeholder at line 188 ("When slice 7 lands the suite, add the BDD and e2e jobs back"). The slice-7 commit landed; the gate did not.
3. **`no-mojibake-in-docs` is wired but inert.** The rule file is correct, but `@eslint/markdown` is not in `eslint.config.mjs` and there is **no `invalid.md` fixture**; CJK drift can land silently in `Documents-es/**/*.md`.
4. **Docs are stubs.** `docs/architecture.md` is 77 LOC; `docs/migration-playbook.md` does **not exist on disk**. The playbook is the reason this repo exists — shipping without it is shipping a 90% artifact.

This change closes the four debts. It does not start any new feature work.

---

## 2. What Changes

Four sub-slices, each a chained PR under `feat/slice-8-closing-bdd-and-docs`.

### 2.1 Sub-slice 8.1 — auth BDD bridge fix

- **File**: `libs/features/auth/docs/support/register.ts` (replace wrapper only)
- **Test**: new `libs/features/auth/docs/__tests__/register.test.ts` mirroring `libs/features/transactions/docs/__tests__/register.test.ts`
- **Pattern**: reuse `buildWrapper(numCaptures, stepFn)` from `a9b550d`. For N ≥ 1, synthesize via `new Function()` so `fn.length === N + 1`; cucumber 13's `callbackInterface` branch fires exclusively.
- **Discipline**: touch only the bridge + add the test. Do NOT modify `cucumber.mjs`, `env-bootstrap.js`, `service-context.ts`, or `.feature` files.
- **Outcome**: `cd libs/features/auth/server && pnpm bdd` → 18/18 PASS, <2s.

### 2.2 Sub-slice 8.2 — BDD as a CI job

- **File**: `.github/workflows/ci.yml` (append 5th job)
- **Shape**: `bdd: needs: [static, test] · timeout-minutes: 30` · Postgres 16-alpine service (matches existing `test` job)
- **Steps**: checkout → pnpm/action-setup → setup-node → `pnpm install --frozen-lockfile` → `prisma generate` → `prisma migrate deploy` → `pnpm turbo run bdd`
- **Trigger**: `pull_request` to `develop`/`main` + `push` to `develop`/`main` (matches existing trigger set)
- **Outcome**: future bridge regressions fail at PR time with the cucumber log.

### 2.3 Sub-slice 8.3 — wire `@eslint/markdown` + activate `no-mojibake-in-docs`

- **Parser wire**: add `@eslint/markdown` to `eslint.config.mjs` as parser for `**/*.md`; add the plugin to the existing `plugins: { ... }` object.
- **Fixture**: create `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/invalid.md` with one intentional CJK character.
- **Runner**: update `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` to include `Documents-es/**/*.md` in the lint target list.
- **Pin**: exact `@eslint/markdown` version in workspace `package.json` (per slice-1 §5 "Stack churn" mitigation).
- **Outcome**: `pnpm lint:fixtures` exits 0 with the rule active AND `pnpm lint` flags CJK chars in any `Documents-es/**/*.md`.

### 2.4 Sub-slice 8.4 — expand `docs/architecture.md` + write `docs/migration-playbook.md` (+ mirrors)

- **`docs/architecture.md`**: expand 77 → ~400-600 LOC. Sections: `apps/web`, `apps/api`, `libs/core` (database/events/config), `libs/features/<x>/{client,server,shared}`, `libs/shared-utils`, `docs/` conventions, BDD colocated strategy, ESLint boundaries, branch model.
- **`docs/migration-playbook.md`**: **new**, ~600-1000 LOC. Concrete playbook for migrating a Next.js + NestJS monolith into `libs/features/<x>/{client,server,shared}` slices. Includes slice-by-slice extraction order, ≥3 before/after snippets per stage, ESLint boundaries as enforcer, dual-format `.md`+`.sh` from slice-1, when to introduce `@core/events`.
- **Spanish mirrors**: `Documents-es/docs/architecture.md` + `Documents-es/docs/migration-playbook.md`. Technical translation, NOT cultural localization. Industry-standard English terms stay in English (`commit`, `merge`, `ADR`, `PR`, `branch`, `slice`).
- **Verification**: `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/<file>.md` returns empty.
- **Outcome**: both English docs are no longer stubs; both mirrors exist with no CJK drift.

---

## 3. Impact

**Touches**: `libs/features/auth/docs/support/register.ts` (~30-50 LOC), `libs/features/auth/docs/__tests__/register.test.ts` (NEW ~177 LOC), `.github/workflows/ci.yml` (+~30 LOC 5th job), `eslint.config.mjs` (parser + plugin wire), `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/invalid.md` (NEW 1-3 LOC), `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` (target list), `docs/architecture.md` (77 → ~400-600 LOC), `docs/migration-playbook.md` (NEW ~600-1000 LOC), and their Spanish mirrors.

**Size vs. 400-line review budget**: 8.1 ≈ 180-220 (1 PR), 8.2 ≈ 30-40 (1 PR), 8.3 ≈ 40-60 (1 PR), 8.4 ≈ 1500-2000 (**2 chained PRs**: PR-A = `architecture.md` + mirror; PR-B = `migration-playbook.md` + mirror). Orchestrator's `Review Workload Guard` escalates per `delivery_strategy=ask-on-risk` if either 8.4 PR exceeds 400.

**Does NOT change**: the vertical-slicing layout, the branch model (`develop` working, `main` immutable), the artifact store (`hybrid`), the SDD pipeline, the slice-7 chain evidence (`a9b550d`, `bb25aab`, 25/25 transactions BDD), and AGENTS.md §11's out-of-scope list (i18n beyond en/es, Sentry, rate-limit, OAuth beyond Google, prod hardening, observability, audit log UI, migration of `gastos-personales/`, coverage gate enforcement at CI).

---

## 4. Out of Scope

1. Anything in AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limit, OAuth beyond Google, prod hardening, observability, audit log UI, coverage gate enforcement, migration of `gastos-personales/`).
2. Adding new BDD scenarios (this slice only fixes the bridge).
3. Migrating `gastos-personales/` to vertical slicing — playbook ships here; migration runs in a separate change.
4. Touching the slice-7 chain evidence (`a9b550d`, `bb25aab`).
5. Adding e2e to CI as a new job — the slice-1 CI placeholder at line 188 covers both BDD and e2e; this slice adds **only** BDD.
6. Replacing the `a9b550d` bridge pattern with anything else — reinventing is forbidden.
7. Refactoring `tools/eslint-plugin-boundary` to TypeScript (rules are `.cjs`; converting is its own change).
8. Non-English artifact language.

---

## 5. Success Criteria

`sdd-verify` will run these 25 gates.

**BDD (G1–G5)**: `pnpm turbo run bdd` exits 0 across workspaces; `pnpm bdd` in auth server → 18/18 PASS <2s; transactions BDD still 25/25 (no regression); auth register test 2/2 PASS; transactions register test still 2/2 PASS.

**CI (G6–G8)**: `ci.yml` declares `bdd` job with `needs: [static, test]`; job runs `pnpm turbo run bdd` against a Postgres service; on a PR to `develop`, the new job appears in the GitHub checks list (post-merge).

**Lint (G9–G13)**: `pnpm lint:fixtures` exits 0 with `no-mojibake-in-docs` active; `pnpm lint` flags CJK in any `Documents-es/**/*.md` (round-trip); `eslint.config.mjs` declares `@eslint/markdown` as parser for `**/*.md`; `invalid.md` fixture exists with ≥1 CJK character; `valid.md` fixture still has zero CJK.

**Docs (G14–G18)**: `docs/architecture.md` ≥400 LOC with §2.4 sections; `docs/migration-playbook.md` exists ≥600 LOC with ≥3 before/after snippets; both Spanish mirrors exist and mirror the English; `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md` returns empty.

**Hygiene (G19–G25)**: no commits to `main` (`git log main` unchanged from `bb25aab`); four chained PRs under `feat/slice-8-closing-bdd-and-docs`; every commit respects atomic-commits + no-Co-Authored-By + Conventional-Commits (AGENTS.md §5–§6); every docs commit includes the `Documents-es/` mirror in the same commit (AGENTS.md §13); Engram observation at `topic_key sdd/slice-8-closing-bdd-and-docs/proposal` exists with `type=architecture`, `project=gp-v2`, `scope=project`; `openspec/changes/slice-8-closing-bdd-and-docs/proposal.md` matches the Engram observation; `openspec/changes/vertical-slicing-reference-scaffold/` is untouched.

---

## 6. Risks

**R1 — Auth bridge world-contract differs from transactions (WARNING)**. The transactions wrapper was applied against `setWorldConstructor(TransactionsWorldWrapper)`; the auth slice's `service-context.ts` may bind a different world type, so copying the bridge blindly could read the wrong inner world off `this`. **Mitigation**: 8.1 MUST read `service-context.ts` (and `step-defs/world.ts` if it exists) before applying. The RED test asserts the same `(world.inner, capture_1, ..., capture_N)` contract. If the auth world wrapper differs materially, escalate per `ask-on-risk`.

**R2 — Docs expansion exceeds 400-line review budget (WARNING)**. §3 estimates 8.4 at ~1500-2000 LOC; even split across 2 chained PRs, PR-B (`migration-playbook.md` + mirror, ~1000 LOC) sits at ~2.5× the budget. Per `delivery_strategy=ask-on-risk`, the orchestrator stops before applying 8.4 and offers three options: (a) split PR-B into 3 PRs (skeleton, stages, Spanish mirror), (b) accept an explicit `size:exception`, (c) defer the playbook to slice 9 and ship only `architecture.md` expansion in 8.4.

**R3 — `@eslint/markdown` is `0.x` and may shift its parser API (SUGGESTION)**. The parser has shipped breaking parser-API changes between minor versions in the past. **Mitigation**: pin the exact version in workspace `package.json`; document the pin in the 8.3 commit body. Future bumps are mechanical.

---

## 7. Rollback

**Whole-change**: `git revert` the squash merge from `feat/slice-8-closing-bdd-and-docs` into `develop`. Slice-7 chain evidence (`a9b550d`, `bb25aab`) and all prior slices remain intact.

**Per-sub-slice**: each sub-slice is a self-contained revert target. 8.1 → auth BDD returns to timeouts; 8.2 → CI loses the BDD gate but local `pnpm bdd` still works; 8.3 → `no-mojibake-in-docs` returns to inert; 8.4 → docs return to stubs (no runtime impact).

**Will NOT do**: force-push, rewrite history, touch `main`, modify `openspec/changes/vertical-slicing-reference-scaffold/`, or amend `a9b550d` / `bb25aab`.

---

## 8. Open Questions for `sdd-spec`

1. **Auth slice's `setWorldConstructor` contract** — does `service-context.ts` follow `TransactionsWorldWrapper`'s shape? Sub-slice 8.1 needs this confirmed before applying the bridge; spec phase should declare the auth world's type explicitly.
2. **Playbook format** — should `migration-playbook.md` expand the slice-1 dual-format contract (one `.sh` per stage in `scripts/migrate/`), or ship prose-only and add scripts in a later change? Spec phase picks one.

---

## 9. Cross-references

Slice 7 close-out: `bb25aab` on `develop` (PR-51 squash; 25/25 transactions BDD PASS). Bridge-fix pattern: `a9b550d` (source for 8.1). Prior proposal: `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` (untouched slice-1 umbrella). Prior spec: Engram #2134, `sdd/vertical-slicing-reference-scaffold/spec`. Project context: Engram #2130, `sdd-init/gastos-personales-reference`. Preflight: Engram #2128, `gastos-personales-reference/decisions/sdd-preflight` (interactive + hybrid + ask-on-risk + 400-line budget). Boundary plugin: `tools/eslint-plugin-boundary/` (8.3 wiring + fixture + runner). CI workflow: `.github/workflows/ci.yml` line 188 placeholder (8.2 appends 5th job). AGENTS.md §11 lines 117-130 (out-of-scope mirrored into §4). AGENTS.md §13 lines 145-158 (Spanish mirror contract; 8.3 wires lint-time enforcement).

---

## 10. Next Phase

`next_recommended`: **`spec`**. `sdd-spec` should lock the four sub-slices as four specs (or one spec with four capability sections, per slice-1 convention); for 8.1, declare the auth world's type explicitly (resolves §8.1); for 8.4, pick the playbook format (resolves §8.2); for 8.3, declare the exact `@eslint/markdown` pin and the fixture's intentional CJK character; for 8.2, declare the BDD job's `timeout-minutes`, Postgres service shape, and `needs` relationship.

`status`: **`success`** · `skill_resolution`: **`paths-injected`** · `risks`: R1 (WARNING), R2 (WARNING), R3 (SUGGESTION).

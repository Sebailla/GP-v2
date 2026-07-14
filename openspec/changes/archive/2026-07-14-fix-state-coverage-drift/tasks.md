# Tasks — `fix-state-coverage-drift` — `gastos-personales-reference`

> **Status**: draft · tasks phase · **Date**: 2026-07-14
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `e0dc2eb`) · tracker `feat/fix-state-coverage-drift` (off develop)
> **Mode**: `auto` · **Artifact store**: hybrid · **Delivery**: `auto-chain` (>400 LOC) — **N/A this change** (~10 net LOC)
> **Strict TDD**: ACTIVE (AGENTS.md §4; `openspec/config.yaml strict_tdd: true`)
> **Approval inputs**: `proposal.md` (Engram `#2373`), `spec.md` (Engram `#2374`, G1–G6, R1–R9, 6 scenarios, 20 ACs), `design.md` (Engram `#2375`, 1 file edit, 2 atomic commits, 9 sections)
> **Single PR**: 1 file edited (`apps/web/__tests__/components/transactions/state-coverage.test.tsx`, +25 / -15), 2 atomic commits
> **Author**: SDD orchestrator → `sdd-tasks` (executor)
> **Next phase**: user pauses before `sdd-apply` (per orchestrator protocol — interim check on 10-LOC small-but-impactful follow-up to PR #66)

---

## Conventions used in this file

- **Work-unit commits**: every commit MUST be independently revertible. The change lands as a single test-harness edit; the production behavior of any component is unchanged.
- **No "Co-Authored-By"** trailers (AGENTS.md §6 / project rule).
- **Conventional Commits**: `type(scope): subject` — imperative, ≤72 chars, no trailing period.
- **RED before GREEN**: the RED is the EXISTING `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exit-1 (13/25 failing because next-intl 3.26.5 `resolvePath` walks `messages` per dot-separated segment and the harness's flat-with-dots keys fail). No new test file is needed; `state-coverage.test.tsx` IS the regression surface per AGENTS.md §4 ("a failing test that reproduces the failure must exist BEFORE the production change" — the existing file already exists, the change makes it pass).
- **`MUST / SHALL / MUST NOT`** are RFC 2119; anything weaker (should, may) is non-binding.
- The 2 tasks below map 1:1 to the 2 atomic commits in `design.md` §4. **No 3rd commit. No merging mid-stream.**

---

## §1. Dependency graph

```
T1 (messages reshape + 2 assertion edits + JSDoc in state-coverage.test.tsx)
    │
    ▼
T2 (chore verify marker — full turbo pipeline, no file changes)
```

**Execution order invariant**: `T1 → T2`. T1 is the only file edit (the GREEN-causing change, per R1 + R2 + R3 + R8); T2 is the verification gate that proves the GREEN observation is real and that the slice-7 PR-7 `pool: "forks"` workaround coexists cleanly with the PR #66 `vi.mock("next/navigation", …)` hoist.

---

## §2. Per-task tables (2 tasks)

### T1 — Reshape harness `messages` constant + adjust 2 row assertions + add JSDoc paragraph

| Field | Value |
|-------|-------|
| Commit | `test(web): state-coverage.test.tsx — nest messages object + adjust 2 assertions (R1, R3)` |
| Files | `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (EDIT, +25 / -15) |
| Depends on | — (RED is already observed: `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 1 with 13/25 failing — 11 i18n-shape failures because `resolvePath` walks `messages["transactions"]["list"]["loading"]` and gets `undefined`, plus 2 row-id assertion failures because `<TransactionsRow>` never renders `tx.id`) |
| LOC | +25 / -15 (per proposal §4 estimate; matches design §2 File 1 footer) |
| TDD | RED → GREEN. The RED is the existing exit-1 of `state-coverage.test.tsx` (no new test file needed per AGENTS.md §4 exception). This commit lands the GREEN. Edit `apps/web/__tests__/components/transactions/state-coverage.test.tsx` to (a) INSERT a JSDoc comment block IMMEDIATELY ABOVE the existing `const messages = {` at L73 explaining the next-intl 3.26.5 `resolvePath` contract, the failure mode of flat-with-dots keys, the mirror requirement with production `apps/web/messages/en.json`, and the `openspec/changes/fix-state-coverage-drift/{proposal,spec,design}.md` trail (verbatim text per design §2 File 1 Part A); (b) RESHAPE the `messages` constant at L73-188 from flat-with-dots (`"transactions.list": { … }`) to nested-objects (`transactions: { list: { … } }`), merging all 8 `transactions.*` parents under a single `transactions` parent, all 4 `categories.*` parents under a single `categories` parent, and the single `auth.sessions` parent under `auth` (per design §2 File 1 Part B diff hunk — leaf strings remain identical; only the wrapping hierarchy changes; `common` was already correctly nested and stays put); (c) EDIT the 2 row assertion lines (L271, L296) replacing `findByText("txn-1")` and `findByText("txn-2")` with `findByText("cat-1")`, plus a 2-line inline comment per design §2 File 1 Part C (`// TransactionsRow renders categoryId/currencyCode/kind/amount/date but not tx.id; assert on the rendered categoryId (unique per row).`). Fixture data on the test transaction objects at L250-264 and L275-288 stays unchanged (only the assertion text changes per R3). |
| Verify | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` MUST exit 0 with `Tests 25 passed (25)`. The 11 i18n-shape failures close via R1+R2 (next-intl resolves the nested key segments); the 2 row-id failures close via R3 (assertions look for `cat-1` which `<TransactionsRow>` renders as `{tx.categoryId}`). No `.skip` / `.todo` decoration added (per AC14). `grep -nE '"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` MUST return zero hits (AC1). `grep -nE '^  (transactions\|categories\|auth\|common): \{$' apps/web/__tests__/components/transactions/state-coverage.test.tsx` MUST return ≥4 hits (AC2). `grep -nE 'findByText\("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` MUST return zero hits (AC4). `grep -nE 'next-intl.*resolvePath\|resolvePath.*next-intl' apps/web/__tests__/components/transactions/state-coverage.test.tsx` MUST return ≥1 hit (AC5 — JSDoc paragraph present). |

---

### T2 — Chore verify marker (full turbo pipeline, no file changes)

| Field | Value |
|-------|-------|
| Commit | `chore(web): verify pnpm --filter web test exits 0 with 145/145 + turbo bdd preserved (R4 marker)` |
| Files | (no file changes — verification gate only; the orchestrator MAY elide this commit if the verification runs on the prior commit's tree instead) |
| Depends on | T1 |
| LOC | 0 / 0 |
| TDD | REFACTOR gate. Re-run the full turbo pipeline to confirm (a) the apps/web unit test suite exits 0 at 145/145 (the 1-file edit is harness-local; the other 18 test files / 120 tests stay GREEN), (b) the BDD gate is not regressed (was 43/43 on `develop@e0dc2eb` per Engram `#2278`), (c) no OOM cascade (the PR #66 `vi.mock("next/navigation", …)` hoist at `apps/web/__tests__/setup.ts` is preserved; the slice-7 PR-7 `pool: "forks"` workaround at `apps/web/vitest.config.ts:54-63` is preserved), (d) ESLint boundary fixtures still pass (no new rule needed; the nested-objects contract is enforced by the test itself, not by a lint rule per spec §7.1), (e) TypeScript still compiles cleanly. This commit exists to give the slice-8 close-out a paper trail distinguishing the GREEN observation (this commit) from the GREEN-causing change (T1). Splits the WHY from the WHAT in the commit log. |
| Verify | `pnpm turbo run test bdd lint typecheck` MUST exit 0 on all 4 turbo tasks. `pnpm --filter web test` MUST show `Tests 145 passed (145)`. `pnpm turbo run bdd` MUST show 43/43 PASS. `pnpm lint:fixtures` MUST exit 0 (the 5 active boundary rules — `no-prisma-outside-core`, `no-schemas-outside-shared`, `no-client-server-import`, `no-cross-module-import`, `no-mojibake-in-docs` — stay green; no new rule is added per spec §7.1). `git log feat/fix-state-coverage-drift --pretty=format:"%B" \| grep -i "co-authored-by"` MUST return empty (AC16). The slice-7 PR-7 workaround at `apps/web/vitest.config.ts:54-63` (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`) MUST remain unchanged (AC6, AC15). The PR #66 hoist at `apps/web/__tests__/setup.ts` (`vi.mock("next/navigation", …)`) MUST remain unchanged (AC12). `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/'` MUST return exactly `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (AC11 — only the state-coverage file is edited under apps/web). `git diff --stat develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` MUST be empty (AC10 — no source file touched). |

---

## §3. PR plan (single PR)

**PR title**: `test(web): state-coverage.test.tsx — nest messages + fix 2 row assertions (closes 13 i18n resolution failures)`

**Branch**: `feat/fix-state-coverage-drift` (cut from `develop` at HEAD `e0dc2eb`)

**Base branch**: `develop` (NOT `main` — AGENTS.md §2; AC17)

**Merge strategy**: squash-merge at PR end (standard for single-PR fixes; preserves the 2-commit story in the PR description while collapsing to a single revertible change on `develop`). The PR body MUST include a "Context" section per spec R9 that names PR #66 (`fix-web-vitest-crash`) as the immediate predecessor and explains why this follow-up matters: PR #66 closed the OOM cascade and brought the apps/web vitest runner back online, but 13 scenarios in this single test file still fail because the harness was written with the wrong message shape. This fix completes the apps/web unit-test gate (slice-8 verify Gate 3) so the slice can finally close.

**Pre-PR checklist**:

- [ ] All 2 commits land in order on `feat/fix-state-coverage-drift` (T1 → T2).
- [ ] Each commit message is `type(scope): <subject>`, imperative present, ≤72 chars subject, no trailing period.
- [ ] No `Co-Authored-By` trailers in any commit (AC15).
- [ ] `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 0 with `Tests 25 passed (25)` (AC6 — state-coverage file GREEN).
- [ ] `pnpm --filter web test` exits 0 with `Tests 145 passed (145)` (AC7 — full apps/web suite GREEN).
- [ ] `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR"` exits 1 — no OOM signature in stderr (AC8 — PR #66 hoist still working).
- [ ] `pnpm turbo run bdd` exits 0 with 43/43 (AC9, no BDD regression).
- [ ] `pnpm lint:fixtures` exits 0 (boundary plugin still passes; no new rule added per spec §7.1).
- [ ] `grep -nE '"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns zero hits (AC1 — no flat-dotted keys remain).
- [ ] `grep -nE '^  (transactions|categories|auth|common): \{$' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns ≥4 hits (AC2 — 4 nested parents present).
- [ ] `grep -nE 'findByText\("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns zero hits (AC4 — row-id assertions replaced).
- [ ] `grep -nE 'next-intl.*resolvePath|resolvePath.*next-intl' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns ≥1 hit (AC5 — JSDoc paragraph present).
- [ ] `grep -cE '\.(skip|todo)\(' apps/web/__tests__/components/transactions/state-coverage.test.tsx` equals the count on `develop@e0dc2eb` (AC14 — no new decorations).
- [ ] `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/'` returns exactly `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (AC11 — only the state-coverage file is edited under apps/web).
- [ ] `git diff --stat develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` is empty (AC10 — no source file touched).
- [ ] `git diff --shortstat develop..feat/fix-state-coverage-drift -- 'apps/web/__tests__/components/transactions/state-coverage.test.tsx'` shows ≤+30 / ≤-20 lines (AC20 — matches proposal §4 estimate of ~10 net LOC).
- [ ] `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` returns ≥1 hit (AC12 — PR #66 hoist preserved).
- [ ] `grep -n 'pool: "forks"' apps/web/vitest.config.ts` returns 1 hit (AC13 — slice-7 workaround preserved).
- [ ] The PR's `base` ref is `develop` (NOT `main`) (AC17).
- [ ] `git log feat/fix-state-coverage-drift --pretty=format:"%B" | grep -i "co-authored-by"` returns empty (AC15).
- [ ] The PR body includes a "Context" section explicitly naming `fix-web-vitest-crash` (PR #66) as the immediate predecessor (AC19).
- [ ] GitHub Actions apps/web tests CI job reports `pass` (this job was GREEN on `develop@e0dc2eb` for the runner-only but 13/25 failing on the state-coverage file; first time it'll be 145/145 fully green since `fix-web-vitest-crash`).

---

## §4. Delivery strategy

- **Delivery strategy** (from `openspec/config.yaml`): `auto-chain` (auto-slices on >400 LOC).
- **This change's effective strategy**: single PR. ~10 net LOC sits well under the 400-line budget; no auto-chain trigger fires.
- **No chained PRs recommended** for `fix-state-coverage-drift`.
- **Branch**: `feat/fix-state-coverage-drift` cut from `develop@e0dc2eb` after the user's "go" signal.
- **Reviewer**: maintainer (Sebastián Illa). Run `gentle-ai review start` after the 2 commits land on the branch.
- **Risk profile**: 3 risks catalogued in `proposal.md` §7 + `design.md` §6 (R1–R3); all have concrete mitigations already engineered into the 2 tasks.

---

## §5. Apply order

1. **Create branch** `feat/fix-state-coverage-drift` off `develop@e0dc2eb`:
   ```bash
   git checkout develop
   git pull --ff-only
   git checkout -b feat/fix-state-coverage-drift
   ```
2. **Apply the 2 commits** in strict TDD order per §2 above (T1 → T2). Each commit lands ATOMICALLY — never split, never squash mid-stream.
3. **Run the full turbo verification**:
   ```bash
   pnpm install
   pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx   # MUST exit 0; 25/25 PASS
   pnpm --filter web test                                                         # MUST exit 0; 145/145 PASS
   pnpm turbo run bdd                                                             # MUST exit 0; 43/43 PASS
   pnpm lint:fixtures                                                             # MUST exit 0
   pnpm turbo run lint typecheck                                                  # MUST exit 0
   ```
4. **Push the branch**:
   ```bash
   git push -u origin feat/fix-state-coverage-drift
   ```
5. **Open the PR**:
   ```bash
   gh pr create \
     --base develop \
     --head feat/fix-state-coverage-drift \
     --title "test(web): state-coverage.test.tsx — nest messages + fix 2 row assertions (closes 13 i18n resolution failures)" \
     --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   The PR body MUST include a "Context" section (per spec R9) that names `fix-web-vitest-crash` (PR #66) as the immediate predecessor and explains why this follow-up matters.
6. **Wait for CI** (turbo + lint:fixtures + boundary-plugin fixtures + GitHub Actions apps/web tests job). The apps/web tests job MUST report `pass` — this is the primary signal (first time it'll be 145/145 since `fix-web-vitest-crash`).
7. **Review + squash-merge**:
   ```bash
   gh pr merge --squash feat/fix-state-coverage-drift   # after maintainer approval
   ```
8. **`sdd-verify` runs on `develop` post-merge** to confirm Gate 3 of slice-8 closes (the 145/145 flip + the preserved PR #66 hoist + the preserved slice-7 workaround + the BDD gate still green + the 1-file diff per AC10/AC11).
9. **`sdd-archive` moves** `openspec/changes/fix-state-coverage-drift/{explore,proposal,spec,design,tasks}.md` to `openspec/changes/archive/2026-07-14-fix-state-coverage-drift/` per the orchestrator's archive protocol.

---

## §6. Resolved design open questions

- **Q1 (nested-objects contract documentation — JSDoc vs new ADR)**: **JSDoc comment block above the `messages` constant (NO new ADR)**. Resolved in `spec.md` §11 / `design.md` §2 File 1 Part A.
- **Q2 (`messages` export for reuse across test files)**: **NO. Keep it file-local.** Resolved in `spec.md` §11.
- **Q3 (row assertion text — `cat-1` vs `100.00`)**: **`cat-1`** (the `categoryId` cell, unique per row in the test fixture, lower collision risk than amount/currency/kind). Resolved in `spec.md` §11 / `design.md` §2 File 1 Part C.

**No open questions remain at the tasks phase.** `sdd-apply` proceeds directly with the 2 tasks above.

---

## §7. Out of scope (whole change)

(Orchestrator-enforced; mirrors `spec.md` §4 + §10 + `proposal.md` §2 + AGENTS.md §11.)

1. Modifying `TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`, `CategoryManager`, or `SessionList` source code — components are spec-compliant; the harness was wrong-shaped.
2. Adding a hidden `<span data-testid="tx-id">` or visible id column to `<TransactionsRow>` — the test asserts on row-rendered content, not on a hidden DOM hook (per R3, per Q3 resolution).
3. Changing `apps/web/messages/en.json` or `apps/web/messages/es.json` — production messages are already correctly nested; only the harness was wrong.
4. Upgrading or downgrading next-intl / use-intl — version stays at 3.26.5.
5. Restructuring `vi.mock("@/lib/transactions-api", …)` at `state-coverage.test.tsx:39-54` — the per-file mock is sound.
6. Adding new tests or `.skip` / `.todo` / `.xfail` decorations to any of the 25 scenarios (AC14).
7. Adding a new ESLint rule to `tools/eslint-plugin-boundary/` for nested-objects shape — the boundary plugin does NOT gain a new rule per spec §7.1; the nested-objects contract is enforced by the test itself.
8. Exporting `messages` for reuse across test files — deferred per Q2 resolution; the harness is file-local.
9. Authoring an ADR under `docs/architecture/decisions/` for the nested-objects contract — JSDoc comment in the harness is sufficient per Q1 resolution.
10. Any change to `apps/api/`, `libs/features/*/`, `libs/core/*/` — fix is apps/web-only (AC10).
11. Touching `apps/web/__tests__/setup.ts` (PR #66 hoisted mock stays the single source of truth for `next/navigation`; AC12).
12. Touching `apps/web/vitest.config.ts` (slice-7 `pool: "forks"` workaround stays unchanged; AC13).
13. Amending, rebasing, or removing commits `36386e1` (slice-7 PR-7 workaround), `2e05fc5` (slice-8 PR-2 auth split), or any commit of `fix-web-vitest-crash` (PR #66).
14. Touching `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash}/`.
15. A Spanish mirror of any file under `openspec/changes/fix-state-coverage-drift/` (no `.md` source of truth ships in this change; change-folder spec/design/proposal are coordination artifacts between SDD phases, not user-facing docs, per the `fix-web-vitest-crash` + `fix-api-nestjs-di` precedents and AGENTS.md §13 exception).
16. Anything in AGENTS.md §11 (i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening, observability, audit log UI, coverage gate enforcement, migration of `gastos-personales/`, etc.).

---

## §8. Risks

(Mirrors `proposal.md` §7 + `design.md` §6 R1–R3 with concrete task-level mitigations.)

- **R1 (a passing test may rely on a literal dotted fallback)** — Low. Mitigated by the T1 verification (the focused state-coverage command exits 0 with 25/25 PASS; if any of the 12 originally-passing scenarios breaks, the failure points at the assertion, not at the resolver — the apply sub-agent inspects and either rewords the assertion or flags for follow-up). The 12 currently-passing scenarios are enumerated in explore brief §1.1; none of them assert on a literal dotted key (they assert on `common.*` strings, mock-thrown errors, or hard-coded English copy that doesn't go through `t()`). Verification: G1 (AC6) catches any regression.
- **R2 (row assertions may become less specific — `cat-1` could appear in a `<select>` option or `aria-describedby`)** — Low. Mitigated by Q3 resolution: `cat-1` is the fixture transaction's `categoryId`, rendered as a plain `TableCell` text node at `TransactionsList.tsx:241`; `cat-1` does not appear in any `<option>` (the form uses `<option>expense</option>` / `<option>income</option>` as kind labels, not category ids). `cat-1` is unique per row in the test fixture. Verification: G2 (AC6 — 25/25 PASS) and AC4 (zero `findByText("txn-")` hits).
- **R3 (multiple-`Loading` collisions may persist due to a stray text node)** — Low. Per explore brief §3.3, the "multiple Loading" failures are caused by the i18n-shape bug: when `t("loading")` returned the literal `transactions.list.loading` (because the resolver fell back to `joinPath(namespace, key)`), that literal contained the substring "Loading" and matched the `/Loading/i` regex in multiple places. After R1+T1, `t("loading")` returns the resolved `"Loading..."` string exactly once. Verification: G1 (AC6) catches any remaining collision; if any persist, the apply sub-agent re-investigates per explore brief §3.3.

---

## §9. Review Workload Forecast

| Field | Value |
|-------|-------|
| **Estimated changed lines** | ~10 net LOC (`+25 / -15` per `design.md` §2 File 1 footer; `+30 / -20` upper bound per AC20) |
| **400-line budget risk** | Low (~10 << 400; ~2.5% of budget used) |
| **Chained PRs recommended** | No |
| **Delivery strategy** | `auto-chain` (project default); auto-chain trigger NOT fired (~10 < 400) |
| **Effective strategy** | single-pr |
| **Single-PR rationale** | ~10 net LOC well under 400; one PR keeps the story coherent (RED → GREEN via state-coverage harness reshape → chore verify) and matches the 1-file, 1-PR invariant from design §4 |
| **Decision needed before apply** | No (no `ask-on-risk` trigger; all 3 risks have concrete mitigations already engineered into the 2 tasks) |
| **Chain strategy** | n/a (single-PR path) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

---

## §10. Status

`status`: **`success`** · `skill_resolution`: **`paths-injected`** (`work-unit-commits`, `tdd`) · `risks`: R1–R3 (concrete mitigations baked into the 2 tasks above)

`next_recommended`: **`apply`** — orchestrator creates `feat/fix-state-coverage-drift` off `develop@e0dc2eb` and applies the 2 tasks in §2 sequentially.

---

## Cross-references

- **Proposal**: `openspec/changes/fix-state-coverage-drift/proposal.md` (Engram `#2373`)
- **Spec**: `openspec/changes/fix-state-coverage-drift/spec.md` (Engram `#2374`; 6 goals, 9 requirements, 6 scenarios, 20 acceptance criteria)
- **Design**: `openspec/changes/fix-state-coverage-drift/design.md` (Engram `#2375`; 1 file edit, 2 atomic commits, 9 sections, +25/-15 LOC)
- **Explore brief**: `openspec/changes/fix-state-coverage-drift/explore.md` (Engram `#2372`; smoking-gun reproduction at §1.1, 13/25 failure enumeration)
- **Predecessor PR**: PR #66 (`fix-web-vitest-crash`, merged on `develop@e0dc2eb`) — hoisted `vi.mock("next/navigation", …)` to `apps/web/__tests__/setup.ts`; closed the V8 OOM cascade. **PRESERVED unchanged by this PR.**
- **Smoking-gun code path**: `use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65` (`resolvePath` walks messages per dot-separated segment) and `use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66` (`defaultGetMessageFallback` returns the literal dotted path)
- **Production reference (correctly nested, source of truth)**: `apps/web/messages/en.json` (191 lines; 4 top-level parents: `auth`, `transactions`, `categories`, `common`). The harness's flat-with-dots shape is the only place in the repo using the wrong shape.
- **Affected components (NOT modified)**: `apps/web/components/transactions/TransactionsList.tsx:247-261` (`<TransactionsRow>` renders date/amount/categoryId/currencyCode/kind but never `id`); `apps/web/components/transactions/CreateTransactionForm.tsx:166-250`; `apps/web/components/transactions/EditTransactionForm.tsx:179-266`; `apps/web/components/transactions/CategoryManager.tsx:95-118`; `apps/web/components/auth/SessionList.tsx:113-153`
- **Regression surface**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 lines → ~691 after this PR; 25 scenarios across 5 describe blocks; `messages` constant at L73-188)
- **PR #66 setup mock (PRESERVED)**: `apps/web/__tests__/setup.ts` (`vi.mock("next/navigation", …)`)
- **Slice-7 workaround (PRESERVED, commit `36386e1`)**: `apps/web/vitest.config.ts` lines 54-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`)
- **Project conventions**: AGENTS.md §1 (stack), §2 (branch model — `main` immutable, cut from `develop`), §4 (strict TDD — RED is the existing exit-1, no new test file), §5 (atomic commits), §6 (Conventional Commits, no AI attribution), §7 (architectural boundaries — no new boundary rule), §8 (single source of truth — nested-objects contract enforced at the canonical site via JSDoc), §9 (UI complete not scaffold — N/A, test-only), §10 (testing — vitest colocated, `clearMocks: true`), §11 (out-of-scope list), §13 (Spanish mirror — N/A for change-folder tasks per orchestrator instruction + `fix-web-vitest-crash` + `fix-api-nestjs-di` precedents)
- **`openspec/config.yaml`**: `strict_tdd: true`, `delivery_strategy: auto-chain`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`
- **Format precedents**: `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/tasks.md` (predecessor PR; same 2-task shape), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/tasks.md` (8 tasks, 10 sections)
- **Slice-8 verify report (gate context)**: Engram `#2278` (confirmed BDD gate GREEN; 13/25 unit-test failures were Gate 3 on `develop@e0dc2eb`)

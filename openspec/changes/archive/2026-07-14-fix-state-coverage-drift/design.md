# Technical Design — `fix-state-coverage-drift`

> **Status**: draft · design phase
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `e0dc2eb`) → tracker `feat/fix-state-coverage-drift` (off develop)
> **Artifact store**: hybrid · **Mode**: auto · **Delivery**: `auto-chain` NOT triggered (~10 net LOC stays single-PR) · **Review budget**: 400 lines
> **Strict TDD**: active (AGENTS.md §4) · **Single PR**: 1 file edited (+25 / -15), 2 atomic commits
> **Fix shape**: A (auto decision captured in proposal §3)
> **Author**: SDD orchestrator → `sdd-design` executor (model `MiniMax-M3`)
> **Date**: 2026-07-14
> **Inputs read**: `proposal.md` (Engram `#2373`, 59 LOC), `spec.md` (Engram `#2374`, 446 LOC, 6 goals, 9 requirements, 6 scenarios, 20 ACs), `explore.md` (Engram `#2372`, 431 LOC), `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/design.md` (format precedent, 14 sections), `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 lines, `messages` const at L73-188), `apps/web/messages/en.json` (191 lines, production nested tree), `apps/web/__tests__/setup.ts` (post-#66 mock surface, PRESERVED).
> **Resolution of spec open questions**: Q1 (JSDoc, no ADR), Q2 (file-local `messages`, no export), Q3 (`cat-1` for row assertions) — ALL resolved in spec; this design does not re-litigate them.

---

## 1. Goals ↔ Technical approach mapping

| Goal | Spec anchor | Technical approach |
|------|-------------|--------------------|
| **G1** — focused state-coverage command exits 0 with 25/25 passing | §3 G1, R1, R3, R4 | Reshape the harness `messages` constant at `state-coverage.test.tsx:73-188` from flat-with-dots (`"transactions.list": { … }`) to nested-objects (`transactions: { list: { … } }`) so next-intl 3.26.5 `resolvePath()` (`use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65`) can walk the segments. The 11 i18n-shape failures close. The 2 row-id assertion failures (`#2`, `#3`) close via `txn-1`/`txn-2` → `cat-1`/`cat-1` edits. |
| **G2** — all 13 previously-failing tests pass | §3 G2, R1, R2, R3 | Same reshape + 2 assertion edits. The 11 i18n failures flip via messages nesting (R1+R2); the 2 row-id failures flip via assertion edits (R3). Zero `.skip` / `.todo` decorators added. |
| **G3** — the 12 previously-passing tests stay green | §3 G3 | The 12 already-passing scenarios are the ones that either (a) assert on English strings sourced from the already-correctly-nested `common` namespace (e.g. `/Retry/i` at line 233), or (b) assert on mock-thrown errors that never go through `t()` (e.g. `/net fail/i` at line 232). The reshape is purely additive on the tree; no leaf string changes. The 12 stay green. |
| **G4** — full apps/web suite exits 0 with 145/145 passing | §3 G4, R4, R5 | Same reshape + 2 assertion edits. The 18 other test files under `apps/web/__tests__/` are unaffected — they have their own per-file `messages` constants or don't render next-intl components at all. The global `vi.mock("next/navigation", …)` from PR #66 stays. The slice-7 `pool: "forks"` workaround at `apps/web/vitest.config.ts:54-63` stays. No OOM regression. |
| **G5** — BDD gate not regressed (43/43) | §3 G5, R6 | Implicit. No Cucumber feature file, step definition, world file, or workspace-port is touched. The BDD harness was GREEN on `develop@e0dc2eb` per slice-8 verify Engram `#2278`; this fix is apps/web-vitest-only. |
| **G6** — no component source file modified | §3 G6, R7 | The reshape + assertion edits live entirely inside the test harness. The diff filtered by `apps/web/components/\|apps/web/lib/\|apps/web/app/\|apps/api/\|libs/` is empty. The production `apps/web/messages/en.json` is unchanged. |

---

## 2. File-by-file diffs

### File 1 — `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (EDIT, +25 / -15)

This is the ONLY file edited by this change. The diff consists of three logical parts:

**(A)** A JSDoc comment block inserted immediately above the `messages` constant (per R8), explaining the nested-objects contract for next-intl 3.26.5.

**(B)** A reshape of the `messages` constant (lines 73-188) from flat-with-dots to nested-objects (per R1). Leaf strings are preserved exactly. The tree merges under 4 parents (`transactions`, `categories`, `auth`, `common`); the `common` namespace is unchanged.

**(C)** Two assertion edits at line 271 and line 296 (per R3, Q3 resolution): replace `findByText("txn-1")` and `findByText("txn-2")` with `findByText("cat-1")`, with an inline comment explaining why.

#### Part A — JSDoc paragraph (NEW, inserted before line 73 `const messages = {`)

```typescript
/**
 * Harness `messages` for the `NextIntlClientProvider` (slice 8 — fix-state-coverage-drift).
 *
 * `next-intl` 3.26.5 `resolvePath()`
 * (`use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65`)
 * walks `messages` by splitting the requested key on `.` and stepping
 * through nested objects per segment. Flat keys with embedded dots
 * (e.g. `"transactions.list": { … }`) cause `messages["transactions"]`
 * to be `undefined`; the resolver throws and `defaultGetMessageFallback`
 * (`use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66`)
 * returns the literal dotted path, which the component renders as visible
 * text (e.g. `<p>transactions.list.loading</p>`).
 *
 * This harness's `messages` tree MUST mirror the production
 * `apps/web/messages/en.json` nesting: every leaf string AND every
 * intermediate level must match. `common` was correctly nested on
 * `develop@e0dc2eb`; the 13 `transactions.*` / `categories.*` /
 * `auth.*` flat-dotted keys are reshaped into the
 * `transactions: { list, totals, new, edit, detail, delete, actions, threshold }`,
 * `categories: { list, form, delete, kinds }`, and
 * `auth: { sessions }` parents.
 *
 * Adding a new top-level message namespace in `en.json` requires this
 * harness's `messages` to be updated with the same nested-object
 * structure, or the corresponding test scenarios will silently fall
 * back to literal key rendering. See
 * `openspec/changes/fix-state-coverage-drift/{proposal,spec,design}.md`.
 */
```

#### Part B — `messages` constant reshape (lines 73-188 → +25 / -15)

The flat-with-dots shape on `develop@e0dc2eb` becomes nested-objects. The 13 flat parents (`transactions.list`, `transactions.totals`, `transactions.new`, `transactions.edit`, `transactions.detail`, `transactions.delete`, `transactions.actions`, `transactions.threshold`, `categories.list`, `categories.form`, `categories.delete`, `categories.kinds`, `auth.sessions`) all merge under their respective top-level namespaces. `common` is already nested and stays put.

**Diff hunk (abridged — same shape applied to all 13 trees):**

```diff
 const messages = {
-  "transactions.list": {
-    title: "Transactions",
-    subtitle: "Browse.",
-    empty: "No transactions yet.",
-    error: { load: "load fail", network: "net fail" },
-    columns: {
-      date: "Date",
-      amount: "Amount",
-      category: "Category",
-      currency: "Currency",
-      kind: "Kind",
-      actions: "Actions",
-    },
-    filter: {
-      fromDate: "From",
-      toDate: "To",
-      category: "Category",
-      currency: "Currency",
-      apply: "Apply",
-      reset: "Reset",
-    },
-    loadMore: "Load more",
-    loading: "Loading...",
-    retry: "Retry",
-  },
-  "transactions.totals": {
-    income: "Income",
-    expense: "Expense",
-    net: "Net",
-  },
-  "transactions.new": {
-    title: "New",
-    submit: "Create",
-    success: "Created",
-    error: {
-      invalidData: "Invalid",
-      duplicate: "Dup",
-      server: "Server",
-    },
-    amount: "Amount",
-    currency: "Currency",
-    kind: { income: "Income", expense: "Expense" },
-    category: "Category",
-    notes: "Notes",
-    occurredAt: "Date",
-  },
-  "transactions.edit": {
-    title: "Edit",
-    submit: "Save",
-    success: "Saved",
-    error: {
-      load: "load fail",
-      update: "save fail",
-    },
-  },
-  "transactions.detail": {
-    delete: "Delete",
-    deleteConfirm: "Delete?",
-  },
-  "transactions.delete": {
-    success: "Deleted",
-    error: "delete fail",
-  },
-  "transactions.actions": {
-    edit: "Edit",
-    delete: "Delete",
-    view: "View",
-  },
-  "transactions.threshold": {
-    title: "Threshold",
-    dismissed: "Dismissed",
-  },
-  "categories.list": {
-    title: "Categories",
-    subtitle: "Org",
-    empty: "No categories yet.",
-    new: "New category",
-  },
-  "categories.form": {
-    name: "Name",
-    kind: { income: "Income", expense: "Expense" },
-    submit: "Save",
-    success: "Saved",
-    error: "save fail",
-    slug: "Slug",
-    slugHint: "lower only",
-  },
-  "categories.delete": {
-    confirm: "Delete?",
-    success: "Deleted",
-    error: "delete fail",
-  },
-  "categories.kinds": { income: "Income", expense: "Expense" },
-  "auth.sessions": {
-    title: "Sessions",
-    list: "Devices",
-    revokeButton: "Revoke",
-    empty: "No active sessions.",
-  },
+  transactions: {
+    list: {
+      title: "Transactions",
+      subtitle: "Browse.",
+      empty: "No transactions yet.",
+      error: { load: "load fail", network: "net fail" },
+      columns: {
+        date: "Date",
+        amount: "Amount",
+        category: "Category",
+        currency: "Currency",
+        kind: "Kind",
+        actions: "Actions",
+      },
+      filter: {
+        fromDate: "From",
+        toDate: "To",
+        category: "Category",
+        currency: "Currency",
+        apply: "Apply",
+        reset: "Reset",
+      },
+      loadMore: "Load more",
+      loading: "Loading...",
+      retry: "Retry",
+    },
+    totals: {
+      income: "Income",
+      expense: "Expense",
+      net: "Net",
+    },
+    new: {
+      title: "New",
+      submit: "Create",
+      success: "Created",
+      error: {
+        invalidData: "Invalid",
+        duplicate: "Dup",
+        server: "Server",
+      },
+      amount: "Amount",
+      currency: "Currency",
+      kind: { income: "Income", expense: "Expense" },
+      category: "Category",
+      notes: "Notes",
+      occurredAt: "Date",
+    },
+    edit: {
+      title: "Edit",
+      submit: "Save",
+      success: "Saved",
+      error: {
+        load: "load fail",
+        update: "save fail",
+      },
+    },
+    detail: {
+      delete: "Delete",
+      deleteConfirm: "Delete?",
+    },
+    delete: {
+      success: "Deleted",
+      error: "delete fail",
+    },
+    actions: {
+      edit: "Edit",
+      delete: "Delete",
+      view: "View",
+    },
+    threshold: {
+      title: "Threshold",
+      dismissed: "Dismissed",
+    },
+  },
+  categories: {
+    list: {
+      title: "Categories",
+      subtitle: "Org",
+      empty: "No categories yet.",
+      new: "New category",
+    },
+    form: {
+      name: "Name",
+      kind: { income: "Income", expense: "Expense" },
+      submit: "Save",
+      success: "Saved",
+      error: "save fail",
+      slug: "Slug",
+      slugHint: "lower only",
+    },
+    delete: {
+      confirm: "Delete?",
+      success: "Deleted",
+      error: "delete fail",
+    },
+    kinds: { income: "Income", expense: "Expense" },
+  },
+  auth: {
+    sessions: {
+      title: "Sessions",
+      list: "Devices",
+      revokeButton: "Revoke",
+      empty: "No active sessions.",
+    },
+  },
   common: {
     loading: "Loading...",
     genericError: "Generic error.",
     cancel: "Cancel",
     save: "Save",
     delete: "Delete",
     edit: "Edit",
     add: "Add",
     back: "Back",
     submit: "Submit",
     yes: "Yes",
     no: "No",
     close: "Close",
     retry: "Retry",
   },
 };
```

**Key invariant — every leaf string is preserved verbatim.** The reshape only changes the wrapping hierarchy. This guarantees AC3 (leaf strings unchanged) and G3 (the 12 already-passing scenarios that match on `common.*` strings stay green because those leaves don't move).

#### Part C — 2 row assertion edits (lines 271 and 296)

```diff
   it("success-non-empty: shows a row for each item", async () => {
     vi.mocked(listTransactions).mockResolvedValue({
       items: [
         {
           id: "txn-1",
           amount: "100.00",
           currencyCode: "USD",
           kind: "expense",
           reportingAmount: null,
           reportingCurrencyCode: null,
           fxRateId: null,
           categoryId: "cat-1",
           occurredAt: "2026-06-01T12:00:00.000Z",
         },
       ],
       nextCursor: null,
     });
     render(
       <Providers>
         <TransactionsList />
       </Providers>,
     );
-    expect(await screen.findByText("txn-1")).toBeInTheDocument();
+    // TransactionsRow renders categoryId/currencyCode/kind/amount/date but
+    // not tx.id; assert on the rendered categoryId (unique per row).
+    expect(await screen.findByText("cat-1")).toBeInTheDocument();
   });

   it("validation-error: row click surfaces no validation error (it's a read-only list)", async () => {
     vi.mocked(listTransactions).mockResolvedValue({
       items: [
         {
           id: "txn-2",
           amount: "12.34",
           currencyCode: "USD",
           kind: "expense",
           reportingAmount: null,
           reportingCurrencyCode: null,
           fxRateId: null,
           categoryId: "cat-1",
           occurredAt: "2026-06-01T12:00:00.000Z",
         },
       ],
       nextCursor: null,
     });
     render(
       <Providers>
         <TransactionsList />
       </Providers>,
     );
-    expect(await screen.findByText("txn-2")).toBeInTheDocument();
+    // TransactionsRow renders categoryId/currencyCode/kind/amount/date but
+    // not tx.id; assert on the rendered categoryId (unique per row).
+    expect(await screen.findByText("cat-1")).toBeInTheDocument();
     // No form fields exist in the list component, so the
     // "validation-error" state is a non-applicable for the read-only
     // list. The harness asserts the 5 applicable states for
     // the list; the 4 read-only-state pass on every render.
   });
```

The fixture data (the `id`, `amount`, `currencyCode`, `kind`, `categoryId`, `occurredAt` fields on the test transaction objects at lines 250-264 and 275-288) is unchanged — only the assertion text changes (per R3).

#### Diff summary

- **+25 / -15** net LOC (per proposal §4 estimate).
- File LOC: 681 → ~691.
- No other declaration in the file changes.
- Mock block (L39-54), Providers helper (L192-198), beforeEach/afterEach (L200-212), and all 5 describe blocks (L214-680) stay verbatim except for the 2 assertion lines in Part C.

#### Verification (gates the apply sub-agent will run)

| Gate | Command | Expected |
|------|---------|----------|
| AC1: no flat-dotted keys remain | `grep -nE '"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | zero hits |
| AC2: nested parents present | `grep -nE '^  (transactions\|categories\|auth\|common): \{$' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | ≥4 hits |
| AC3: leaf strings unchanged | `grep -E 'empty: "No transactions yet\.\|empty: "No active sessions\.\|submit: "Create"\|submit: "Save"\|loading: "Loading\.\.\."\|name: "Food"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | same hits as `develop@e0dc2eb` |
| AC4: no `txn-` row-id assertions | `grep -nE 'findByText\("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | zero hits |
| AC5: JSDoc paragraph present | `grep -nE 'next-intl.*resolvePath\|resolvePath.*next-intl' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | ≥1 hit |
| AC6: state-coverage file exits 0 | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25 PASS / 0 FAIL |
| AC14: no new `.skip`/`.todo` | `grep -cE '\.(skip\|todo)\(' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | equals count on `develop@e0dc2eb` |

### File 2 — `apps/web/__tests__/setup.ts` (VERIFY ONLY, no edit)

This file is **not** modified by this change. We verify only that the PR #66 `vi.mock("next/navigation", …)` global mock is preserved unchanged (per R7 + spec AC12).

**Verification** (during apply):

- `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` returns ≥1 hit (the PR #66 hoist).
- `grep -n 'useRouter' apps/web/__tests__/setup.ts` returns ≥1 hit (factory present).
- File LOC matches `develop@e0dc2eb` (no drift introduced).

### File 3 — `apps/web/vitest.config.ts` (VERIFY ONLY, no edit)

The slice-7 `pool: "forks"` + `poolOptions: { forks: { singleFork: true } }` workaround at lines 54-63 is **preserved** (per R8). The `setupFiles: ["./__tests__/setup.ts"]` at line 39 still wires the PR #66 mock.

**Verification** (during apply):

- `grep -n 'setupFiles' apps/web/vitest.config.ts` shows `["./__tests__/setup.ts"]` (AC5).
- `grep -n 'pool' apps/web/vitest.config.ts` still shows `pool: "forks"` AND `singleFork: true` (AC6).
- `git log --oneline | grep 36386e1` returns 1 hit (slice-7 commit intact, no force-push).

### File 4 — `apps/web/messages/en.json` (VERIFY ONLY, no edit)

The production message tree is **already correctly nested** per explore brief §1. The harness's flat-with-dots shape was the only wrong-shaped `messages` in the repo. This file stays unchanged.

**Verification** (during apply):

- `git diff --stat develop..feat/fix-state-coverage-drift -- 'apps/web/messages/'` is empty.
- File remains 191 lines, 4 top-level parents (`auth`, `transactions`, `categories`, `common`).

---

## 3. Execution plan (strict TDD)

Per AGENTS.md §4, strict TDD requires RED → GREEN → TRIANGULATE → REFACTOR order. The RED is already captured by the current `pnpm --filter web test` exit-1 (13/25 failing in `state-coverage.test.tsx`). No new test file is needed; `state-coverage.test.tsx` IS the regression surface.

1. **RED already observed** (recorded in explore brief Engram `#2372` §1 + proposal §3). `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` currently exits 1 with 13 failed / 12 passed (25). The 13 failures are distributed: 11 are i18n-shape (#1, #4–#13 per explore brief §1.1) + 2 are row-id assertions (#2, #3). No new test file required (AGENTS.md §4 exception for pre-existing RED is explicit).

2. **Edit File 1**: reshape the `messages` constant + adjust the 2 row assertions + add the JSDoc comment (per §2 File 1 Parts A/B/C). No other files touched.

3. **Verify File 2** (`setup.ts`): confirm the PR #66 `vi.mock("next/navigation", …)` global mock is intact. No edit needed.

4. **Verify File 3** (`vitest.config.ts`): confirm `setupFiles: ["./__tests__/setup.ts"]` at line 39 still wires the PR #66 mock AND the slice-7 `pool: "forks"` workaround at lines 54-63 is preserved. No edit needed.

5. **GREEN: state-coverage in isolation**: `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx`. MUST exit 0 with 25/25 PASS. The 11 i18n-shape failures close via R1+R2; the 2 row-id failures close via R3.

6. **GREEN: full apps/web suite**: `pnpm --filter web test`. MUST exit 0 with `Tests 145 passed (145)`. The 18 other test files (120 tests) that already passed continue to pass — the messages reshape is harness-local. No `Worker exited unexpectedly`. No `FATAL ERROR`. No OOM cascade.

7. **Verify BDD not regressed**: `pnpm turbo run bdd`. MUST exit 0 with 43/43.

8. **Verify no source file touched**: `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` MUST be empty.

9. **Commit atomically**: 2 commits per §4 below.

---

## 4. Atomic commits

Single PR, 2 atomic commits (work-unit aligned; per AGENTS.md §5 each commit reverses cleanly with `git revert <sha>`):

1. **`test(web): state-coverage.test.tsx — nest messages object + adjust 2 assertions (R1, R3)`** — the production-code change: reshape the `messages` constant to nested-objects, adjust the 2 row assertions (`txn-1`/`txn-2` → `cat-1`), and add the JSDoc paragraph above the constant (per R8). Note the `test:` type per AGENTS.md §6 vocabulary (the change IS a test-harness change, not a feature).

2. **`chore(web): verify pnpm --filter web test exits 0 with 145/145 + turbo bdd preserved (R4 marker)`** — verification log: the `pnpm --filter web test` exit-0 output captured in the commit body, plus the `pnpm turbo run bdd` exit-0 output. Optional but gives the slice-8 close-out a paper trail. Can be folded into commit 1 if the reviewer prefers fewer commits — but splitting makes the GREEN observation distinct from the GREEN-causing change.

**Commit hygiene** (AGENTS.md §6):

- No `Co-Authored-By` / no AI attribution in any commit message.
- Subjects ≤72 chars, imperative, no trailing period.
- Type vocabulary from §6: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`.
- Bodies explain WHY (next-intl 3.26.5 `resolvePath` requires nested objects; the 13 failures were all i18n-shape drift + 2 row-id assertion drift), not WHAT (the diff already shows what).
- Body of commit 1 cites the spec requirement IDs (R1, R3) and the explore-brief section that proves the diagnosis.
- Body of commit 2 cites the verification commands run (R4, R5, R6 markers).

---

## 5. Test execution plan

| Spec scenario | Test command | Expected outcome |
|---------------|--------------|------------------|
| **G1.1** (state-coverage 25/25) | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25/25 PASS; no `.skip`/`.todo` added (AC6, AC11, AC14) |
| **G2.1** (13 previously-failing close) | same as G1.1 + `grep` for the 13 specific test names | exit 0; all 13 scenario names appear with `✓` markers |
| **G3.1** (12 previously-passing stay green) | same as G1.1 | exit 0; 12 originally-passing scenarios still `✓` |
| **G4.1** (full apps/web suite) | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)`; no OOM (AC7, AC8, AC9) |
| **G5.1** (BDD not regressed) | `pnpm turbo run bdd` | exit 0; 43/43 scenarios continue to pass (AC12) |
| **G6.1** (no source touched) | `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` | empty (AC10, AC11) |

### Manual / non-CI verification steps

- `pnpm --filter web test --reporter=verbose apps/web/__tests__/components/transactions/state-coverage.test.tsx` to enumerate each of the 25 scenarios and confirm no `.skip` / `.todo` decoration.
- `grep -cE '\.(skip\|todo)\(' apps/web/__tests__/components/transactions/state-coverage.test.tsx` — MUST equal the count on `develop@e0dc2eb` (no new decorations; AC14).
- `pnpm --filter web test 2>&1 | grep -E "Worker exited|FATAL ERROR|invariant expected"` to confirm the OOM signature + the `useRouter()` invariant are absent from stderr.
- `time pnpm --filter web test` to capture the wall time (no regression expected; should be ~10-30s).
- `git log --oneline develop..feat/fix-state-coverage-drift` to confirm the 2 work-unit commits (subjects ≤72 chars, no "Co-Authored-By", per AC15 + AC16).
- `git show feat/fix-state-coverage-drift -- apps/web/components apps/web/lib apps/web/app apps/api libs apps/web/messages` to confirm no source-file modifications (AC10, AC11).
- `pnpm lint:fixtures` to confirm the boundary plugin still passes (no new rule added per spec §7.1; the nested-objects contract is enforced by the test itself, not by a lint rule).
- `pnpm turbo run lint typecheck` to confirm ESLint and TypeScript still pass (no production source touched, so trivial).

---

## 6. Risks + mitigations (concrete)

| ID | Risk | Mitigation |
|----|------|------------|
| **R1** (proposal §7) | A passing test may rely on a literal dotted fallback — i.e. some test could be passing today precisely because `t("transactions.list.loading")` returns the literal key, which then matches some loose assertion somewhere. | After R1 the `messages` tree is fully nested. If any passing test breaks, the failure points at the assertion (not at the resolver); the apply sub-agent inspects the broken assertion and either rewords it to match the resolved English copy or flags it for a follow-up. The 12 currently-passing scenarios are enumerated in explore brief §1.1 (`TransactionsList > loading`, `TransactionsList > error`, `TransactionsList > success-non-empty` → row-id broken, `CreateTransactionForm > error`, `CreateTransactionForm > empty`, `EditTransactionForm > error`, `EditTransactionForm > success`, `EditTransactionForm > empty`, `CategoryManager > error`, `CategoryManager > empty`, `SessionList > success`); none of them assert on a literal dotted key (they all assert on `common.*` strings, error messages thrown by mocks, or hard-coded "No categories yet." text). Verification: G1.1 catches any regression. |
| **R2** (proposal §7) | Row assertions may become less specific — i.e. `cat-1` could appear in multiple text nodes if `cat-1` is also a `<option>` value, a `<datalist>` entry, or an `aria-describedby` target. | `cat-1` is used as the `categoryId` on the fixture transaction (line 260). `<TransactionsRow>` renders `{tx.categoryId}` as a plain `TableCell` text node at `TransactionsList.tsx:241`. `cat-1` does not appear in any other `<select>` `<option>` (the form uses `<option>expense</option>` / `<option>income</option>` as kind labels, not category ids). `cat-1` is unique per row in the test fixture. Verification: G2.1 (all 13 close, including the 2 row tests). Per spec Q3 resolution, `cat-1` was chosen over `100.00` / `USD` / `expense` for this exact reason. |
| **R3** (proposal §7) | Multiple-`Loading` collisions may persist due to a stray text node (e.g. an `aria-label` that contains "loading" leaking through to `getByText`). | Per explore brief §3.3, the "multiple Loading" failures are caused by the i18n-shape bug: when `t("loading")` returns the literal `transactions.list.loading` (because the resolver falls back to `joinPath(namespace, key)`), that literal contains the substring "Loading" and matches the `/Loading/i` regex. After R1, `t("loading")` returns the resolved `"Loading..."` string exactly once. No stray text node adds a second match (verified by the production `apps/web/messages/en.json` — only `common.loading`, `auth.common.loading`, and `transactions.list.loading` (if any) carry the substring; all resolve to the same `"Loading…"` leaf). If any "multiple Loading" symptom persists after R1+R2, the apply sub-agent re-investigates per explore brief §3.3 step. Verification: G1.1 catches any remaining collision. |

---

## 7. Out of scope

Restated from proposal §2 + spec §10 + AGENTS.md §11. The following are explicitly NOT touched by this PR:

1. Component source code (`TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`, `CategoryManager`, `SessionList`) — components are spec-compliant; the harness was wrong-shaped.
2. Adding a hidden `<span data-testid="tx-id">` or visible id column to `<TransactionsRow>` — the test asserts on row-rendered content, not on a hidden DOM hook (per R3, per Q3 resolution).
3. Changing `apps/web/messages/en.json` or `apps/web/messages/es.json` — production messages are already correctly nested; only the harness was wrong.
4. Upgrading or downgrading next-intl / use-intl — version stays at 3.26.5.
5. Restructuring `vi.mock("@/lib/transactions-api", …)` at `state-coverage.test.tsx:39-54` — the per-file mock is sound.
6. Adding new tests or `.skip` / `.todo` / `.xfail` decorations to any of the 25 scenarios.
7. Adding a new ESLint rule to `tools/eslint-plugin-boundary/` (e.g. for nested-objects shape) — the boundary plugin does NOT gain a new rule per spec §7.1; the nested-objects contract is enforced by the test itself.
8. Exporting `messages` for reuse across test files — deferred per Q2 resolution; the harness is file-local.
9. Authoring an ADR under `docs/architecture/decisions/` for the nested-objects contract — JSDoc comment in the harness is sufficient per Q1 resolution.
10. Any change to `apps/api/`, `libs/features/*/`, `libs/core/*/` — fix is apps/web-only.
11. Anything in AGENTS.md §11 (i18n beyond `en` + `es`, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening, observability, audit log UI, coverage gate enforcement, migration of `gastos-personales/`, etc.).
12. Touching `apps/web/__tests__/setup.ts` (PR #66 hoisted mock stays the single source of truth for `next/navigation`; spec AC12).
13. Touching `apps/web/vitest.config.ts` (slice-7 `pool: "forks"` workaround stays unchanged; spec AC13).
14. Amending, rebasing, or removing commits `36386e1` (slice-7 PR-7 workaround), `2e05fc5` (slice-8 PR-2 auth split), or any commit of `fix-web-vitest-crash` (PR #66).
15. Touching `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash}/`.
16. A Spanish mirror of any file under `openspec/changes/fix-state-coverage-drift/` (no `.md` source of truth ships in this change; per orchestrator instruction + `fix-web-vitest-crash` + `fix-api-nestjs-di` precedents — change-folder specs are coordination artifacts, not user-facing docs).

---

## 8. Open questions for tasks phase

**None.** All 3 questions deferred from the proposal are resolved in the spec:

- Q1 (nested-objects contract documentation) → resolved: JSDoc comment block above the `messages` constant (NO new ADR). Spec §11.
- Q2 (`messages` export for reuse) → resolved: file-local, NO export. Spec §11.
- Q3 (row assertion text) → resolved: `cat-1` (the `categoryId` cell, most unique per row). Spec §11.

---

## 9. Validation criteria for `sdd-verify`

`sdd-verify` will check post-merge:

| # | Criterion | Pass condition |
|---|-----------|----------------|
| 1 | `pnpm --filter web test` exits 0 | exit 0; `Tests 145 passed (145)` (AC7) |
| 2 | No OOM signature in stderr | `pnpm --filter web test 2>&1 \| grep -E "Worker exited\|FATAL ERROR"` exits 1 (AC8) |
| 3 | State-coverage file exits 0 | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` exits 0; 25 PASS / 0 FAIL (AC6) |
| 4 | No `.skip` / `.todo` decoration added | `grep -cE '\.(skip\|todo)\(' apps/web/__tests__/components/transactions/state-coverage.test.tsx` equals the count on `develop@e0dc2eb` (AC14) |
| 5 | `messages` is nested-objects | `grep -nE '"transactions\.list"\|"transactions\.totals"\|"transactions\.new"\|"transactions\.edit"\|"transactions\.detail"\|"transactions\.delete"\|"transactions\.actions"\|"transactions\.threshold"\|"categories\.list"\|"categories\.form"\|"categories\.delete"\|"categories\.kinds"\|"auth\.sessions"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns zero hits (AC1) |
| 6 | 4 nested parents present | `grep -nE '^  (transactions\|categories\|auth\|common): \{$' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns ≥4 hits (AC2) |
| 7 | Leaf strings unchanged | `grep -E 'empty: "No transactions yet\.\|empty: "No active sessions\.\|submit: "Create"\|submit: "Save"\|loading: "Loading\.\.\."\|name: "Food"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns the same hits as on `develop@e0dc2eb` (AC3) |
| 8 | Row-id assertions replaced | `grep -nE 'findByText\("txn-' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns zero hits (AC4) |
| 9 | JSDoc paragraph present | the file contains prose explaining next-intl's `resolvePath` requirement and the failure mode of flat-with-dots keys (AC5) |
| 10 | BDD gate still passes | `pnpm turbo run bdd` exits 0; 43/43 scenarios continue to pass (AC9) |
| 11 | No source file touched | `git diff --stat develop..feat/fix-state-coverage-drift -- 'apps/web/components/' 'apps/web/lib/' 'apps/web/app/' 'apps/api/' 'libs/'` returns empty (AC10) |
| 12 | Only `state-coverage.test.tsx` is edited under `apps/web/` | `git diff --name-only develop..feat/fix-state-coverage-drift -- 'apps/web/'` returns exactly one `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (AC11) |
| 13 | `setup.ts` mock from PR #66 preserved | `grep -n 'vi.mock("next/navigation"' apps/web/__tests__/setup.ts` returns ≥1 hit (AC12) |
| 14 | `pool: "forks"` workaround preserved | `grep -n 'pool: "forks"' apps/web/vitest.config.ts` returns 1 hit (AC13) |
| 15 | No "Co-Authored-By" in any commit | `git log feat/fix-state-coverage-drift --pretty=format:"%B" \| grep -i "co-authored-by"` returns empty (AC15) |
| 16 | Commit subjects are Conventional + ≤72 chars | `git log -1 feat/fix-state-coverage-drift --pretty=format:"%s"` matches `^(fix\|feat\|chore\|docs\|test\|refactor\|build\|ci\|perf\|style)\(.+\): .+` and is ≤72 chars (AC16) |
| 17 | PR base branch is `develop` | the PR's `base` ref is `develop` (NOT `main`) (AC17) |
| 18 | Single PR, no force-push | the merge is a single squash or merge commit; `git log develop..feat/fix-state-coverage-drift --merges` returns ≤1 commit; no history rewrite (AC18) |
| 19 | PR description references PR #66 | the PR body MUST contain a "Context" section explicitly naming `fix-web-vitest-crash` as the immediate predecessor (AC19) |
| 20 | Net LOC delta is bounded | `git diff --shortstat develop..feat/fix-state-coverage-drift -- 'apps/web/__tests__/components/transactions/state-coverage.test.tsx'` shows ≤+30 / ≤-20 lines (matches proposal §4 estimate of ~10 net) (AC20) |

---

## 10. Traceability

### Spec requirement → Design section

| Spec requirement | Design section |
|------------------|----------------|
| R1 (messages reshape to nested-objects) | §2 File 1 Part B (the diff hunk) |
| R2 (11 i18n-shape failures close) | §2 File 1 Part B (implicit — messages fix closes 11/13) + §3 step 5 (GREEN observation) |
| R3 (2 row assertions adjusted to `cat-1`) | §2 File 1 Part C (the 2 assertion diffs) |
| R4 (state-coverage file exits 0, 25/25) | §3 step 5 + §5 G1.1 + §9 row 3 |
| R5 (full apps/web suite exits 0, 145/145) | §3 step 6 + §5 G4.1 + §9 row 1 |
| R6 (BDD gate not regressed, 43/43) | §3 step 7 + §5 G5.1 + §9 row 10 |
| R7 (no component source touched) | §2 (only File 1 edited; File 2/3/4 are verify-only) + §5 G6.1 + §9 rows 11-12 |
| R8 (JSDoc explains nested-objects contract) | §2 File 1 Part A (the JSDoc block) + §9 row 9 |
| R9 (PR description references PR #66) | §4 commit 1 body / PR description (operational; covered by §9 row 19) |

### Goal → Spec scenario → Design section

| Goal | Spec scenario | Design section |
|------|---------------|----------------|
| G1 (state-coverage 25/25) | G1.1 | §3 step 5, §5 G1.1 |
| G2 (13 previously-failing close) | G2.1 | §2 File 1 Parts B + C, §5 G2.1 |
| G3 (12 previously-passing stay green) | G3.1 | §1 G3, §5 G3.1 |
| G4 (full apps/web suite) | G4.1 | §3 step 6, §5 G4.1 |
| G5 (BDD not regressed) | G5.1 | §3 step 7, §5 G5.1 |
| G6 (no source touched) | G6.1 | §1 G6, §2 (only File 1 edited), §5 G6.1 |

### Risk ↔ Requirement mitigation

| Risk (proposal §7) | Mitigated by |
|--------------------|---------------|
| R1 (a passing test may rely on a literal dotted fallback) | R1 + R2 + AC1 + AC2 + AC6 (no flat-dotted keys remain; the 11 i18n tests close) |
| R2 (row assertions become less specific) | R3 + AC4 + Q3 resolution (use `cat-1`, the most unique-per-row fixture value) + inline comment at the assertion site |
| R3 (multiple-`Loading` collisions may persist due to a stray text node) | R2 + AC6 + AC8 (after nesting, the regex `/Loading/i` matches the single `<p>Loading...</p>` exactly once; if any remain, the apply sub-agent re-investigates per explore brief §3.3) |

---

## 11. Threat matrix

> Per `sdd-design/SKILL.md` §2a: applicability-driven. If the design changes routing, shell commands, subprocesses, VCS/PR automation, executable-file classification, or process integration, load `references/threat-matrix.md` and include its matrix.

**N/A** — this design does NOT change routing, shell commands, subprocesses, VCS/PR automation, executable-file classification, or process integration. The fix is a test-harness-only message-shape reshape + 2 assertion edits inside one `.tsx` file. It does not introduce new shell invocations, subprocesses, file watchers, or runtime forks. The slice-7 `pool: "forks"` workaround is the existing process-integration boundary, and it is preserved unchanged — this design does NOT modify it.

Boundary classification: **pure test-harness configuration**, no production behavior change, no executable-file classification change, no VCS automation beyond a single conventional-commit PR (covered by AGENTS.md §6, not by the threat matrix).

---

## 12. Migration / Rollout

**No migration required.** This is a test-harness fix with zero production behavior change. Rollout is the standard single-PR flow:

1. Cut `feat/fix-state-coverage-drift` from `develop@e0dc2eb`.
2. Land the 2 atomic commits per §4.
3. Open a single PR against `develop`.
4. After review + CI green, merge (squash or merge commit; `git log develop..feat/fix-state-coverage-drift --merges` ≤1 per AC18).
5. No feature flag, no phased rollout, no database migration, no backwards-compat shim.

**Rollback plan** (mirror proposal §8):

- **Whole-change**: `git revert <merge-sha>` on `develop`. The `state-coverage.test.tsx` edit reverts to its 681-line flat-with-dots baseline. `setup.ts` and `vitest.config.ts` are unchanged (no revert needed). The 13 scenarios in `state-coverage.test.tsx` return to their previously-failing state (acceptable because the same tests were already broken on `develop@e0dc2eb` — slice-8 verify report Gate 3 / observation F1 of the slice-7-inheritance debt).
- **Per-step rollback**:
  - Commit 1 (the messages reshape + assertion edits) — `git revert <sha>`. Tests fail again as before. Setup file is untouched, so no config revert needed.
  - Commit 2 (verification marker) — optional revert; it carries no executable code change.
- **Will NOT do**: force-push, rewrite history, touch `main`, modify `openspec/changes/{slice-8-closing-bdd-and-docs,vertical-slicing-reference-scaffold,fix-web-vitest-crash}/`, or amend commit `36386e1` (slice-7 workaround), `2e05fc5` (slice-8 PR-2 auth split), or any commit of `fix-web-vitest-crash` (PR #66).

---

## 13. Cross-references

- **Proposal**: `openspec/changes/fix-state-coverage-drift/proposal.md` (Engram `#2373`, 59 LOC)
- **Spec**: `openspec/changes/fix-state-coverage-drift/spec.md` (Engram `#2374`, 446 LOC; G1-G6, R1-R9, 20 ACs)
- **Explore brief**: `openspec/changes/fix-state-coverage-drift/explore.md` (Engram `#2372`, 431 LOC; smoking-gun reproduction at §1.1)
- **Predecessor PR**: PR #66 (`fix-web-vitest-crash`) — hoisted `vi.mock("next/navigation", …)` to `apps/web/__tests__/setup.ts`; closed the V8 OOM cascade. **PRESERVED unchanged by this PR.**
- **Smoking-gun code path**: `use-intl@3.26.5/dist/development/createFormatter-QqAaZwGD.js:65` (`resolvePath` walks messages per dot-separated segment) and `use-intl@3.26.5/dist/development/initializeConfig-BhfMSHP7.js:66` (`defaultGetMessageFallback` returns the literal dotted path)
- **Production reference (correctly nested, source of truth)**: `apps/web/messages/en.json` (191 lines; 4 top-level parents: `auth`, `transactions`, `categories`, `common`). The harness's flat-with-dots shape is the only place in the repo using the wrong shape.
- **Affected components (NOT modified)**: `apps/web/components/transactions/TransactionsList.tsx:247-261` (`<TransactionsRow>` renders date/amount/categoryId/currencyCode/kind but never `id`); `apps/web/components/transactions/CreateTransactionForm.tsx:166-250`; `apps/web/components/transactions/EditTransactionForm.tsx:179-266`; `apps/web/components/transactions/CategoryManager.tsx:95-118`; `apps/web/components/auth/SessionList.tsx:113-153`
- **Regression surface (the file being edited)**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (681 lines, 25 scenarios across 5 describe blocks; `messages` constant at L73-188)
- **Setup mock (preserved from PR #66)**: `apps/web/__tests__/setup.ts` (`vi.mock("next/navigation", …)`)
- **Vitest config (preserved from slice-7 PR-7)**: `apps/web/vitest.config.ts` lines 54-63 (`pool: "forks"` + `poolOptions: { forks: { singleFork: true } }`, commit `36386e1`)
- **Project conventions**: AGENTS.md §1 (identity, stack), §2 (branch model — `main` immutable, cut from `develop`), §4 (strict TDD — RED is the existing exit-1, no new test file), §5 (atomic commits), §6 (Conventional Commits, no AI attribution), §7 (architectural boundaries — no new boundary rule), §8 (single source of truth — nested-objects contract enforced at the canonical site via JSDoc), §9 (UI complete not scaffold — N/A, test-only), §10 (testing — vitest colocated, `clearMocks: true`), §11 (out-of-scope list), §13 (Spanish mirror — N/A for change-folder design per orchestrator instruction + `fix-web-vitest-crash` + `fix-api-nestjs-di` precedents)
- **Format precedents**: `openspec/changes/archive/2026-07-14-fix-web-vitest-crash/design.md` (14-section structure), `openspec/changes/archive/2026-07-13-fix-api-nestjs-di/design.md` (same)
- **Slice-8 verify report (gate context)**: Engram `#2278` (confirmed BDD gate GREEN; OOM was Gate 3 / unit-tests-only on `develop@d9fdfec`)

---

**Next phase**: `tasks` (`sdd-tasks` will break the 2 atomic commits into ordered RED-first sub-tasks with checkpoint gates per AGENTS.md §4 + §5).
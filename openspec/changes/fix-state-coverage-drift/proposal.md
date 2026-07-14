# Proposal — `fix-state-coverage-drift`

> **Status**: draft · proposal phase · **Date**: 2026-07-14
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Mode**: auto · **Artifact store**: hybrid · **Fix shape**: A

## 1. Intent

After `fix-web-vitest-crash` closed the OOM, 13 of 25 transaction state-coverage tests still fail. The harness supplies flat dotted message keys, but next-intl/use-intl 3.26.5 `resolvePath()` requires nested objects. Resolution throws, and the fallback renders the literal dotted path. The verified fix is to nest `messages` and replace two assertions for transaction IDs that `TransactionsRow` never renders. Blast radius: one test-harness file and two assertions; no production code.

## 2. Scope

### In Scope
- `apps/web/__tests__/components/transactions/state-coverage.test.tsx` — nest `messages`; change the `txn-1`/`txn-2` assertions to rendered row content.

### Out of Scope
- Component changes: `TransactionsList`, `CreateTransactionForm`, `EditTransactionForm`, `CategoryManager`, or `SessionList`.
- next-intl/use-intl version changes.
- Mock API or test-infrastructure changes.
- New tests or `.skip`/`.todo` annotations.

## 3. Approach

Use **Shape A**: align the harness with next-intl's nested message contract. Components already ship working behavior and remain unchanged. Replace the two ID assertions with unique rendered fixture text, preferably `cat-1`, because the row exposes category, amount, date, currency, and kind—but not `tx.id`.

## 4. Affected Files Inventory

| File | Change | LOC delta |
|------|--------|-----------|
| `apps/web/__tests__/components/transactions/state-coverage.test.tsx` | Edit: nest `messages`; adjust two assertions | +25 / -15 |

**Total estimated: ~10 net LOC.** Single PR; no auto-chain trigger.

## 5. Goals

- **G1**: Focused state-coverage command exits 0 with 25/25 passing.
- **G2**: All 13 previously failing tests pass.
- **G3**: The 12 previously passing tests remain green.
- **G4**: Full apps/web suite exits 0 with 145/145 passing.
- **G5**: BDD remains green with 43/43 scenarios.
- **G6**: No component source file changes.

## 6. Non-goals

No component, dependency-version, mock API, or test-infrastructure changes; no new tests; no skipped or todo tests.

## 7. Risks

| ID | Risk | Mitigation |
|----|------|------------|
| R1 | A passing test may rely on a literal dotted fallback. | Run all 25 state-coverage tests and investigate any regression. |
| R2 | Row assertions may become less specific. | Assert unique fixture value `cat-1`, not a potentially repeated amount. |
| R3 | Multiple-`Loading` collisions may persist due to a stray text node. | Re-investigate during apply if any remain after nesting messages. |

## 8. Open Questions for the Spec Phase

- **Q1**: Add an ADR for the i18n shape contract? **Recommendation: no**; a harness JSDoc comment is sufficient.
- **Q2**: Export `messages` for reuse? **Recommendation: no**; defer as out of scope.
- **Q3**: Use `cat-1` or `100.00` for row assertions? **Recommendation: `cat-1`**, which is more specific and less collision-prone.

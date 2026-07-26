# Design: M5.1 Coverage Hardening

## 1. Technical Approach

M5.1 is test-infrastructure-only: no production code changes. Two chained PRs target six Vitest workspaces and API tests. PR #1 tries Vitest and coverage-v8 4.1.9→4.2.5, verifies threshold exit codes, stabilizes rate-limit tests, and ships a deterministic validator fallback. PR #2 widens the instrumented bcrypt budget, adds the opt-in 500ms production probe, and documents both behaviors. The 60% lines/branches/functions/statements contract and `coverage.disabled=true` escape hatch remain unchanged.

## 2. Architecture Decisions

| ID / Choice | Alternatives | Rationale |
|---|---|---|
| D1. Try Vitest 4.2.5 across all six configs; retain 4.1.9 if incompatible and use the validator. | Stay on 4.1.9; upgrade beyond v4.2. | v4.2 improves threshold/exit behavior; fallback limits risk. |
| D2. Add `tools/coverage-validator.ts`, reading each `coverage/coverage-summary.json` and checking four metrics against 60. | Trust summaries; parse lcov. | JSON is deterministic, per-package, and bypasses Vitest exit quirks. |
| D3. Use built-in enforcement and the comparator. | Choose one gate. | The contractual gate stays live if library behavior diverges. |
| D4. Instrumented bcrypt becomes 1500ms and logs elapsed time; a separate `BCRYPT_PERF_TEST=1` probe retains 500ms. | Keep 500ms everywhere; remove timing. | Instrumentation slows CI, while the production SLA remains visible. |
| D5. Make rate-limit tests serial, reset mocks/store in hooks, and add timeout only if needed. | Parallel tests; only increase timeout. | Isolation fixes shared state; timeout alone hides races. |
| D6. Add “Coverage Instrumentation Behavior” to the runbook and Spanish mirror. | Test comments only. | Operators need the dual-test model and escape hatch. |

## 3. Data Flow

```text
pnpm turbo run test --coverage
    │
    ├─ each workspace: vitest --coverage
    │    └─ coverage-v8 writes coverage/coverage-summary.json
    ├─ Vitest threshold exit (4.2.5); fallback remains available
    ├─ coverage-validator reads six summaries
    │    ├─ metric < 60 → package + metric → exit 1
    │    └─ all metrics ≥ 60 → exit 0
    └─ turbo succeeds only when tests and validator pass
```

`coverage.disabled=true` makes the validator warn and exit zero, matching `turbo.json`.

## 4. File Changes

| File | Action | Description |
|---|---|---|
| `package.json` | Modify | Bump root Vitest/coverage-v8 to 4.2.x, or retain 4.1.9 as fallback. |
| Six workspace `package.json` files | Modify | Align local Vitest versions. |
| Six `vitest.config.ts` files | Modify | Verify thresholds, V8 output, and v4.2 compatibility. |
| `pnpm-lock.yaml` | Auto | Resolve compatible versions. |
| `tools/coverage-validator.ts` | Create | Compare six V8 summaries and enforce the gate. |
| `tools/coverage-validator.test.ts` | Create | Cover pass, fail, missing, malformed, and opt-out cases. |
| `turbo.json` | Modify | Run validation after tests and expose required environment. |
| `apps/api/test/auth-hash.bcrypt.test.ts` | Modify | Use 1500ms under instrumentation and log elapsed time. |
| `apps/api/test/auth-hash.bcrypt.perf.test.ts` | Create | Opt-in no-coverage 500ms production probe. |
| `apps/api/test/rate-limit.e2e-spec.ts` | Modify | Serialize affected tests and reset state/hooks. |
| `docs/operations/audit-retention-runbook.md` | Modify | Document instrumentation, dual probes, and escape hatch. |
| `Documents-es/docs/operations/audit-retention-runbook.md` | Modify | Spanish runbook mirror. |
| `openspec/changes/module-5.1-coverage-hardening/design.md` | Create | English design source. |
| `Documents-es/openspec/changes/module-5.1-coverage-hardening/design.md` | Create | Spanish design mirror. |

## 5. Interfaces / Contracts

```ts
interface CoverageSummary {
  total: Record<"lines" | "branches" | "functions" | "statements", { pct: number }>;
}
```

The validator reads `coverage/coverage-summary.json` per package, reports percentages, exits 1 for a missing file or under-threshold metric, and exits 0 with warnings when `coverage.disabled=true`.

## 6. Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | Validator | Fixtures prove pass, 50% fail, missing/malformed input, and opt-out. |
| Unit | Bcrypt | Cost 12/14 under 1500ms with coverage; opt-in cost 12 under 500ms; log asserted. |
| Integration | Coverage gate | Full run passes; forced package below 60 exits 1. |
| Integration | Race | API rate-limit suite runs three times without flake. |
| Regression | Vitest | All six configs and existing suites pass. |
| Gate | Repository | `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` is green. |
| Manual | Runbook | Confirm dual probes and `coverage.disabled=true`. |

## 7. Threat Matrix

| Boundary | Applicability | Design response | Planned RED test |
|---|---|---|---|
| Coverage process exit | Applicable | Explicit JSON comparator and exit 1. | Forced 50% summary. |
| Timing under CPU/instrumentation | Applicable | 1500ms budget plus logging. | Slow instrumented probe. |
| Production timing regression | Applicable | Separate 500ms probe. | Opt-in over-budget failure. |
| Shared rate-limit state | Applicable | Serial scope and cleanup hooks. | Three repeated runs. |
| Routing/shell/VCS/executable boundaries | N/A | None are introduced. | None. |

## 8. Migration / Rollout

No migration or production rollout. Revert PR #2, then PR #1. During investigation, `coverage.disabled=true` bypasses only the coverage gate.

## 9. Open Questions

None; the proposal resolves upgrade/fallback, dual timing tests, and race strategy.


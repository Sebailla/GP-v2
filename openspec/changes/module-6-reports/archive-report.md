# Archive Report — module-6-reports (Reports & Analytics)

> **Phase**: SDD archive (cycle close)
> **Cycle close date**: 2026-07-30
> **Branch model**: develop (working) / main (immutable); slice landed via tracker `feat/module-6-reports` → develop
> **Delivery strategy**: auto-chain (5 PRs against a 400-line review budget)
> **Final commit on develop**: `3088fce75f9b5cd784e162763d4be61a21ca6fd8` (`3088fce` short)
> **Verify verdict**: `pass_with_warnings` (0 critical findings, 3 carry-forward warnings, 4 suggestions)
> **Artifact store**: hybrid — OpenSpec files (canonical) + Engram observations (cross-session recovery)

---

## 1. Final State — Source-of-Truth Layout

### 1.1 Canonical specs (landed during apply phase; modified by spec amendment during verify re-run)

| Capability | Path | Sha256 | Status |
|------------|------|--------|--------|
| Reports | `openspec/specs/reports/spec.md` (EN canonical) | `c4e9747f54f8aa6aeecbd67ad7b9cc8385b004c6f9740a19bd1203eae9dd86cf` | Lived at HEAD `3088fce` (346 lines) |
| Reports | `Documents-es/openspec/specs/reports/spec.md` (ES canonical) | `67a7db3102fa0923a5c63246d2fa00cd10e2c15f50edf6d366a7ccf7e549399c` | Lived at HEAD `3088fce` (347 lines) |

The canonical EN spec landed with PR #1 (commit `5fc4e51`) per `apply-progress`. The orchestrator's spec amendment during the verify re-run (post-CRITICAL-C1) marked scenario S20 (WCAG AA) as a **documented deferred invariant** and rewrote §9's compliance bullet to cite the amendment note. The canonical now contains 9 invariants + 20 scenarios (S1–S20) with S20 explicitly `(DEFERRED — see amendment note below)` accompanied by the rationale + cross-reference.

### 1.2 Delta specs (change folder; identical to canonical after amendment)

| Capability | Path | Sha256 | Status |
|------------|------|--------|--------|
| Reports | `openspec/changes/module-6-reports/specs/reports/spec.md` (EN delta) | `c4e9747f54f8aa6aeecbd67ad7b9cc8385b004c6f9740a19bd1203eae9dd86cf` | **Byte-identical to EN canonical** (`diff -q` returns no output) |
| Reports | `Documents-es/openspec/changes/module-6-reports/specs/reports/spec.md` (ES delta) | `67a7db3102fa0923a5c63246d2fa00cd10e2c15f50edf6d366a7ccf7e549399c` | **Byte-identical to ES canonical** (`diff -q` returns no output) |

**Drift check (Step 2 of the archive protocol)**: `diff -q openspec/specs/reports/spec.md openspec/changes/module-6-reports/specs/reports/spec.md` returns no output. `diff -q Documents-es/openspec/specs/reports/spec.md Documents-es/openspec/changes/module-6-reports/specs/reports/spec.md` returns no output. **Zero drift**. No spec merge required for this archive cycle — the apply phase already landed canonical with PR #1 and the verify re-run's amendment was applied to BOTH copies in the same set of 6 working-tree modifications per the verify-report §"Amendment consistency (cross-file)".

### 1.3 Change folder inventory (final)

All files under `openspec/changes/module-6-reports/` at HEAD `3088fce` (working tree clean re: source; 6 spec/proposal files modified by the orchestrator's amendment during verify re-run, no source-code modifications):

| Artifact | Path | Sha256 | Lines |
|----------|------|--------|-------|
| Proposal (EN) | `openspec/changes/module-6-reports/proposal.md` | `ab6b1445474cbd0b1738b1412ad54237c34310da2f1f8cac3c105be9f197e2b9` | 148 |
| Design (EN) | `openspec/changes/module-6-reports/design.md` | `2869d4ec0a2128c835bef2f81edacf86045526544646624a29fb63d4ce525b5f` | 405 |
| Tasks (EN) | `openspec/changes/module-6-reports/tasks.md` | `f66b9fcc72504dc659a172d6c28dd2b63f1dd2b68d1b9968c6aca50cdfa410e9` | 227 |
| Verify report | `openspec/changes/module-6-reports/verify-report.md` | `5b11d6b00e5eb70c4490a34d2099cd8c4767ad079967cc9211e899c79cb3f53c` | 253 |
| Spec delta (EN) | `openspec/changes/module-6-reports/specs/reports/spec.md` | `c4e9747f54f8aa6aeecbd67ad7b9cc8385b004c6f9740a19bd1203eae9dd86cf` | 346 |

### 1.4 Spanish mirrors (Documents-es)

Every English `.md` under the change folder has a Spanish mirror under `Documents-es/openspec/changes/module-6-reports/` (per AGENTS.md §13 — HARD RULE). All files byte-aligned with their English counterparts after the orchestrator's amendment (lines differ by +1 in the two spec files due to the `(DIFERIDO — ver nota de enmienda abajo)` parenthetical spanning one extra line in Spanish):

| Artifact | Path | Sha256 | Lines |
|----------|------|--------|-------|
| Proposal (ES) | `Documents-es/openspec/changes/module-6-reports/proposal.md` | `91261abce85d4ffa3f0c6c75c448149707cce55c5b72216ea468902d6f77f01a` | 148 |
| Design (ES) | `Documents-es/openspec/changes/module-6-reports/design.md` | `066de2bf7250463af4fd9ef80343a2aa1d9d197f43260409ac00eae262bb1f94` | 405 |
| Tasks (ES) | `Documents-es/openspec/changes/module-6-reports/tasks.md` | `9fef8a1ae1e417d747d817f544fcf6b29663bf160577201c4e3847d59ca5f91b` | 227 |
| Spec delta (ES) | `Documents-es/openspec/changes/module-6-reports/specs/reports/spec.md` | `67a7db3102fa0923a5c63246d2fa00cd10e2c15f50edf6d366a7ccf7e549399c` | 347 |

CJK check: `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/module-6-reports/*.md Documents-es/openspec/changes/module-6-reports/specs/reports/*.md Documents-es/openspec/specs/reports/*.md` returns exit 0 with zero matches (Spanish mirror rule holds per AGENTS.md §13).

### 1.5 Total OpenSpec artifact count for this archive

| Bucket | Count | Files |
|--------|-------|-------|
| EN artifacts under change | 5 | proposal, design, tasks, verify-report, specs/reports/spec |
| EN canonical | 1 | specs/reports/spec.md |
| ES mirrors under change | 4 | proposal, design, tasks, specs/reports/spec |
| ES canonical | 1 | specs/reports/spec.md |
| **Total** | **11** | sha256 captured above |

> **Note on launch prompt count**: the user's launch prompt cited "4 EN + 4 ES mirrors". That count reflects the 4 non-verify-report artifacts (proposal/design/tasks/spec). This archive includes the verify-report in the per-file sha256 inventory because it is a first-class OpenSpec artifact in the change folder per `sdd-archive` SKILL §"OpenSpec mode" / `openspec-convention.md` artifact path table.

---

## 2. Spec Sync Result — No Drift Detected

Per the archive protocol (Step 2: "Sync Delta Specs to Main Specs"), the apply phase already landed the canonical spec via PR #1 (commit `5fc4e51`) per `openspec/changes/module-6-reports/tasks.md` line 196: "Capability spec created + ES mirror (PR #1 lands spec)" + "openspec/specs/reports/spec.md created + ES mirror". The verify re-run's orchestrator-driven amendment updated both canonical and delta in the same set of 6 working-tree modifications (no source-code changes). Confirmed by:

- `diff -q openspec/specs/reports/spec.md openspec/changes/module-6-reports/specs/reports/spec.md` → empty output (identical)
- `diff -q Documents-es/openspec/specs/reports/spec.md Documents-es/openspec/changes/module-6-reports/specs/reports/spec.md` → empty output (identical)
- Matching sha256 hashes per the table above

**No copy delta → canonical needed for this archive.** Spec sync had already happened during the apply phase (PR #1) and the verify amendment re-synced atomically. The archive does NOT modify any spec file (per launch prompt instruction 4: "Do NOT modify any source code, any spec file").

---

## 3. Tasks Completion Gate

Per `sdd-archive` SKILL §"Task Completion Gate": inspected `openspec/changes/module-6-reports/tasks.md`. **All implementation tasks are `[x]` checked**:

- PR #1 (Foundation + schemas): 9 atomic commits, all `✓` complete (merged `5fc4e51`)
- PR #2 (Domain: port + TimeBucketService + csvSerializer): 8 atomic commits, all `✓` complete (merged `68370e8`)
- PR #3 (Service + InMemoryRepo + NestJS wiring): note that **the in-memory adapter shipped, NOT the Prisma adapter** (the Prisma `RED` test at `5320dfd` was reverted in `32dcceb` per design decision — the slice ships against `InMemoryReportsRepository`; Prisma adapter is a follow-up per `design.md` and `proposal.md` §"Out of scope"). All tasks completed (merged `6dac941`).
- PR #4 (BDD bridge + 12 Gherkin scenarios): all `✓` complete (merged `a7d8540`)
- PR #5 (UI + i18n + Recharts + slice-completion fixes): all `✓` complete (merged `3088fce` / PR #88)
- Cross-cutting tasks (lines 191-203 of `tasks.md`): 11/11 `[x]`

**No unchecked implementation tasks. No stale-checkbox reconciliation required.** Task Completion Gate passes.

---

## 4. Final-State Authority — What Actually Shipped

Per `sdd-archive` SKILL §"Final-State Authority", the highest-ranked sources for facts about what shipped are:

1. **Native review authority** — verify-report verdict (`pass_with_warnings`, 0 critical findings), evidence_revision `sha256:b8c879b43ae5cb308897da9e5e3903f9d955a9898432a88a6b8ce923f3ce9a83`.
2. **Persisted tasks artifact** — all implementation tasks `[x]`.
3. **Repository evidence at HEAD `3088fce`** — `git log`, source files, test outputs.

Final numbers and facts (NOT echoed from `apply-progress` or `verify-report` without attribution):

| Fact | Source | Value |
|------|--------|-------|
| Final commit hash on develop | `git rev-parse HEAD` + `git log --oneline -1 develop` | `3088fce75f9b5cd784e162763d4be61a21ca6fd8` (`3088fce`) |
| PRs merged to develop | `git log --oneline develop` filter for "Module 6 Reports: PR" | 5 (PRs #1–#5, PR #5 at `3088fce`) |
| Build status | verify-report line 77 | PASS — `NODE_ENV=test pnpm turbo run build` exit 0, 31/31 turbo tasks, 0 cached (forced) |
| Lint status | verify-report line 80 | PASS — `pnpm turbo run lint` exit 0, 14/14 workspaces |
| Typecheck status | verify-report line 83 | PASS — `pnpm turbo run typecheck` exit 0, 15/15 workspaces |
| Test status | verify-report line 86-89 | PASS — `pnpm turbo run test --force` exit 0, 15/15 turbo tasks, 0 cached (forced); @features/reports 124/124, web 248/248, api 247/248 (1 pre-existing skip `auth-hash.bcrypt.perf.test.ts`) |
| Boundary fixtures | verify-report line 92 | PASS — `pnpm lint:fixtures` exit 0, 118/0 |
| BDD | verify-report line 94-99 | PASS — 12 scenarios / 58 steps / 0m 0.19s |
| Coverage @features/reports | verify-report line 105-109 | statements 95.23%, branches 86.66%, functions 90.19%, lines 95.68% (all >> 60% target) |
| Spec invariants verified | verify-report line 144-157 | 9/9 |
| Spec scenarios | verify-report line 117 + line 142 | 20/20 accounted for (17 runtime evidence, 1 deviation W1, 1 no-auto-cover SUGGESTION-S2, 1 deferred SUGGESTION-S4) |

---

## 5. Outstanding Follow-ups — Tracked Obligations

These items MUST be tracked so the slice's debt cannot be lost. Each carries a target resolution, owner context, and traceability back to the verify-report.

### 5.1 Carry-forward warnings (W1/W2/W3)

| ID | Severity | Title | Source | Resolution options | Status |
|----|----------|-------|--------|--------------------|--------|
| **W1** | WARNING | S11 CSV detail filename deviation | verify-report §"Issues Found" → WARNING-W1 | (a) revert impl 1 line (`.detail` instead of `.transactions`); (b) amend canonical + delta spec + both proposal files + ES mirrors to align with impl. Spec currently prefers (a). Files: `reports.service.ts:386`, `common.steps.ts` regex, `spec.md` (both copies), ES mirrors, `proposal.md` (both copies) | **OPEN — pre-existing, not blocking archive** |
| **W2** | WARNING | Recharts integration is structural-only | verify-report §"Issues Found" → WARNING-W2 | Either (a) wire actual Recharts BarChart in `MonthlySummaryCard` and LineChart in `PeriodComparisonPanel`; (b) amend spec + design + proposal to drop the chart promise and document the Stat-card / table render as the final UX | **OPEN — pre-existing, not blocking archive** |
| **W3** | WARNING | Design decision #1 (reuse `TotalsService`) was not followed | verify-report §"Issues Found" → WARNING-W3 | Refactor `ReportsService.aggregateTotals` to delegate to `@features/transactions`' `TotalsService`; eliminates the divergence risk the design wanted to prevent | **OPEN — pre-existing, not blocking archive** |

### 5.2 New suggestion (SUGGESTION-S4)

| ID | Severity | Title | Source | Resolution | Status |
|----|----------|-------|--------|------------|--------|
| **S4** | SUGGESTION | Track S20 deferred WCAG AA audit as a follow-up change | verify-report §"Issues Found" → SUGGESTION-S4 (new) | Follow-up change must: (a) replace in-memory adapter with Prisma adapter for the e2e harness; (b) add `apps/web/e2e/reports.spec.ts` mounting `/en/reports` + `/es/reports` under a seeded session; (c) integrate `@axe-core/playwright` to audit both pages; (d) flip S20 from `DEFERRED` to `COMPLIANT`. **MUST be filed as a GitHub issue before archive closes so it cannot be lost.** | **OPEN — must be filed before the orchestrator's post-archive session-summary call** |

### 5.3 Carry-forward suggestions (SUGGESTION-S1/S2/S3, lower priority)

| ID | Severity | Title | Resolution | Status |
|----|----------|-------|------------|--------|
| **S1** | SUGGESTION | S12 BDD assertion is structural, not behavioral | Either add `description` to `TransactionForReport` and pipe it through, or accept unit-test coverage as load-bearing and remove the misleading BDD step | **OPEN — pre-existing** |
| **S2** | SUGGESTION | No unit test for `ReportsEmptyState` CTA or `ReportsFilterBar` presets | Add Vitest + Testing Library component tests in `apps/web/__tests__/components/reports/` | **OPEN — pre-existing** |
| **S3** | SUGGESTION | Spec scenarios S6/S14 (DST safety) covered only by mathematical argument | Add a TZ-parameterized test that explicitly runs a DST-affected locale timezone | **OPEN — pre-existing** |

### 5.4 Design-deferred follow-up (Prisma adapter swap)

| ID | Severity | Title | Source | Resolution | Status |
|----|----------|-------|--------|------------|--------|
| **F1** | DEFERRED | Prisma adapter swap for `ReportsRepository` | design.md + proposal.md §"Out of scope" + tasks.md note on PR #3 + verify-report line 90 (slice ships against `InMemoryReportsRepository`) | Land `PrismaReportsRepository` (the reverted `RED` at `5320dfd` is the seed), wire it in `apps/api/src/modules/reports/reports.module.ts`, add cross-user isolation integration test against test Postgres | **OPEN — out-of-scope per AGENTS.md §11, deferred to follow-up change** |

### 5.5 Out-of-scope boundaries (AGENTS.md §11) — explicitly NOT follow-ups

Per AGENTS.md §11, the following are out of scope for this reference repo and must NOT ship as part of any slice: i18n beyond en/es, Sentry / error reporting SaaS, API edge rate-limiting, multiple OAuth providers beyond Google, production hardening (secrets manager, HSTS, CSP beyond Next defaults, CDN config), observability (OpenTelemetry, Prometheus, log shipping), coverage gate enforcement at CI, migration of `gastos-personales/` to the vertical-slicing model, audit log UI. **None of these are follow-ups from this slice**; they are project-wide exclusions.

---

## 6. Deliberate Archive Deviations from Standard `sdd-archive` SKILL

The launch prompt for this archive explicitly overrode several standard `sdd-archive` SKILL steps. This section records those deviations so future audits can reconstruct what was decided.

| Standard SKILL step | Launch-prompt override | Rationale |
|---------------------|------------------------|-----------|
| Step 3: Move change folder to `openspec/changes/archive/YYYY-MM-DD-{change-name}/` | **SKIPPED** — change folder stays in place at `openspec/changes/module-6-reports/` | User instruction: "Archive is local-only. Do NOT modify any source code, any spec file, or push anything." The archive-report.md is the terminal record; the move-to-archive step would touch the filesystem in a way the user explicitly disallowed for this internal reference-repo slice. Future cycles may adopt the standard move. |
| Create `git tag` (release flow) | **SKIPPED** — no tag created | Per `obs-2845` project rule + AGENTS.md §11: this slice is not a release. Release flow lives in CHANGELOG.md + a separate PR. Existing tags `v1.0.0`/`v1.1.1`/`v1.2.0` on the repo are version releases from prior slices, not module-6-reports. |
| `sdd-archive` SKILL §"Step 5: Persist Archive Report" using `mem_save` topic_key `sdd/{change-name}/archive-report` | **DEFERRED to orchestrator** — this archive-report.md is the source of truth; orchestrator may additionally persist an Engram observation as part of its session-summary step | The launch prompt specified the file path as the canonical artifact. Hybrid artifact store (per `openspec/config.yaml` line 19) does allow both filesystem + Engram, but the user's prompt specified "the archive-report.md is on disk and validated" as the archive-completion condition. The orchestrator's session-summary call may persist an Engram observation mirroring this report's content; that is the orchestrator's decision, not the archive executor's. |
| Spec sync Step 2 (delta → canonical) | **NO-OP** — confirmed identical via `diff -q` | Apply phase already landed canonical with PR #1. Verify re-run amendment applied to both canonical + delta atomically. Zero drift. |

These deviations are recorded here, in the terminal archive record, so the audit trail is complete. They are NOT modifications to `sdd-archive` SKILL itself — they are per-launch-prompt decisions for this specific cycle.

---

## 7. Repository Evidence Snapshot at HEAD `3088fce`

```text
$ git rev-parse HEAD
3088fce75f9b5cd784e162763d4be61a21ca6fd8

$ git log --oneline -3 develop
3088fce Module 6 Reports: PR #5 — UI + i18n + Recharts + slice completion fixes (#88)
a7d8540 feat(reports): merge PR #4 — BDD bridge (feature + step-defs + binding)
612d350 feat(reports): BDD binding bridge (cucumber 13 callback-vs-promise workaround)

$ git tag -l | grep -i 'module-6\|reports'
(no tags)

$ git status
On branch develop
Your branch is up to date with 'origin/develop'.
Changes not staged for commit:
  modified:   Documents-es/openspec/changes/module-6-reports/proposal.md
  modified:   Documents-es/openspec/changes/module-6-reports/specs/reports/spec.md
  modified:   Documents-es/openspec/specs/reports/spec.md
  modified:   openspec/changes/module-6-reports/proposal.md
  modified:   openspec/changes/module-6-reports/specs/reports/spec.md
  modified:   openspec/specs/reports/spec.md
Untracked files:
  openspec/changes/module-6-reports/verify-report.md
```

> **Note on working-tree state**: the 6 file modifications shown by `git status` are the orchestrator's spec amendment for S20 (still uncommitted at this archive-report write time). The verify-report is `Untracked` because it was just persisted by the verify phase. These working-tree entries reflect state at archive-report write time and are documented in §6 above. The orchestrator will commit them as part of its session-close protocol. This archive-report itself will be `Untracked` when written (see artifact path below).

---

## 8. SDD Cycle Status

The `module-6-reports` slice has completed the full SDD cycle:

- [x] **proposal** — `proposal.md` (148 lines) + ES mirror
- [x] **spec** — `specs/reports/spec.md` EN canonical ≡ EN delta (byte-identical, 346 lines) + ES canonical ≡ ES delta (byte-identical, 347 lines)
- [x] **design** — `design.md` (405 lines) + ES mirror
- [x] **tasks** — `tasks.md` (227 lines, all implementation tasks `[x]`) + ES mirror
- [x] **apply** — 36 atomic commits across PR #1–#5, all merged to develop, strict-TDD RED → GREEN → TRIANGULATE pattern observed in `git log --oneline -20`
- [x] **verify** — `pass_with_warnings`, 0 critical findings, evidence_revision `sha256:b8c879b43ae5cb308897da9e5e3903f9d955a9898432a88a6b8ce923f3ce9a83`
- [x] **archive** — this report (canonical final-state record per Final-State Authority)

The slice `module-6-reports` is **considered archived** when this file exists on disk and is validated by the orchestrator. The SDD cycle for this slice is **complete**.

---

## 9. Archive Metadata

| Field | Value |
|-------|-------|
| Artifact path | `openspec/changes/module-6-reports/archive-report.md` |
| Persisted by | `sdd-archive` sub-agent (this execution) |
| Mode | Local-only archive per launch-prompt overrides (see §6) |
| Persistent follow-up obligations | 8 open items (3 WARNINGS, 1 new SUGGESTION-S4, 3 carried-forward SUGGESTIONS, 1 DEFERRED Prisma adapter — see §5) |
| Next SDD phase | none for this slice; orchestrator should (a) commit the 6 working-tree spec/proposal modifications + verify-report + this archive-report, (b) file the SUGGESTION-S4 follow-up issue, (c) save the Engram session summary |

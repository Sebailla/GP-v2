# Exploration: fix-archive-mirrors

> **Read-only audit** of the Spanish (ES) mirror coverage under
> `Documents-es/openspec/changes/archive/` relative to the English (EN)
> archive under `openspec/changes/archive/`. Goal: identify every
> planning artifact that AGENTS.md §13 says must have a Spanish mirror.

## 1. Current State

### 1.1 EN archive (`openspec/changes/archive/`) — 10 folders

```
openspec/changes/archive/
├── 2026-07-13-fix-api-nestjs-di/                        (5 files)
├── 2026-07-13-slice-8-closing-bdd-and-docs/             (4 files)
├── 2026-07-14-fix-bdd-tsx-node22/                       (5 files)
├── 2026-07-14-fix-bdd-tsx-node22-mirror/                (1 stray file)
├── 2026-07-14-fix-ci-env-propagation/                   (5 files)
├── 2026-07-14-fix-orphan-shared-directories-mirror/     (1 stray file)
├── 2026-07-14-fix-state-coverage-drift/                 (5 files)
├── 2026-07-14-fix-vitest-4-deprecation/                 (4 files)
├── 2026-07-14-fix-web-vitest-crash/                     (5 files)
└── 2026-07-15-slice-9-housekeeping-mirror/              (1 stray file)
```

### 1.2 ES archive (`Documents-es/openspec/changes/archive/`) — 2 partial folders

```
Documents-es/openspec/changes/archive/
├── 2026-07-13-slice-8-closing-bdd-and-docs/design.md          (1/4)
└── 2026-07-14-fix-ci-env-propagation/spec.md                   (1/5)
```

### 1.3 Stray `-mirror` folders (planning artifacts accidentally archived)

These three folders contain ONLY an `explore.md`. They are not proper
archived changes — they are planning artifacts (`explore.md` produced
by `sdd-explore` during the planning-artifacts chore step) that got
moved into the archive by mistake. **Out of scope for this change**;
flagged here for a future cleanup change.

| Stray folder | EN content | ES content | Action |
|---|---|---|---|
| `2026-07-14-fix-bdd-tsx-node22-mirror/` | `explore.md` | — | Future cleanup: drop the folder, OR translate its `explore.md` |
| `2026-07-14-fix-orphan-shared-directories-mirror/` | `explore.md` | — | Future cleanup |
| `2026-07-15-slice-9-housekeeping-mirror/` | `explore.md` | — | Future cleanup |

## 2. Affected Areas (the gap to close)

### 2.1 Per-archive audit table

| EN archive folder | EN files | ES files present | **Missing ES files** | EN LOC |
|---|---|---|---|---|
| `2026-07-13-fix-api-nestjs-di` | design, explore, proposal, spec, tasks | — (0/5) | **proposal, spec, design, tasks, explore** (5) | 3,029 |
| `2026-07-13-slice-8-closing-bdd-and-docs` | design, proposal, spec, tasks | design (1/4) | **proposal, spec, tasks** (3) | 2,070 − 658 design = 1,412 |
| `2026-07-14-fix-bdd-tsx-node22` | design, explore, proposal, spec, tasks | — (0/5) | **proposal, spec, design, tasks, explore** (5) | 1,738 |
| `2026-07-14-fix-ci-env-propagation` | design, explore, proposal, spec, tasks | spec (1/5) | **design, explore, proposal, tasks** (4) | 2,013 − 585 spec = 1,428 |
| `2026-07-14-fix-state-coverage-drift` | design, explore, proposal, spec, tasks | — (0/5) | **proposal, spec, design, tasks, explore** (5) | 1,823 |
| `2026-07-14-fix-vitest-4-deprecation` | design, proposal, spec, tasks | — (0/4) | **proposal, spec, design, tasks** (4) | 962 |
| `2026-07-14-fix-web-vitest-crash` | design, explore, proposal, spec, tasks | — (0/5) | **proposal, spec, design, tasks, explore** (5) | 1,718 |
| (totals) | 33 EN files | 2 ES files | **29 missing ES files** | 12,180 EN lines |

**Archives needing attention: 7**
**Missing files to create: 29**

### 2.2 Other locations checked (not affected)

| Location | EN present? | ES present? | Gap? |
|---|---|---|---|
| `docs/architecture.md` (root) | yes | yes (`Documents-es/docs/architecture.md`) | no |
| `docs/architecture/decisions/0007-slice-8-doc-loc-exception.md` | yes | yes | no |
| `docs/architecture/decisions/0008-no-import-type-injectable.md` | yes | yes | no |
| `docs/architecture/decisions/0011-shared-as-workspace-packages.md` | yes | yes | no |
| `docs/first-run-checklist.md` | yes | yes | no |
| `docs/migration-playbook.md` | yes | yes | no |
| `docs/slice-3-checklist.md` | yes | yes | no |
| `docs/slice-7-checklist.md` | yes | yes | no |
| `openspec/changes/fix-bdd-ci-zod-resolution/` (active) | yes (5 files) | only `explore.md` (1/5) | active change, ongoing work — **out of scope** for this fix |
| `openspec/changes/slice-9-housekeeping/` (active) | yes | — (0/5) | active change, ongoing work — **out of scope** |
| `openspec/changes/vertical-slicing-reference-scaffold/` (active) | yes | full mirror | no |
| `openspec/changes/fix-orphan-shared-directories/` (active) | yes | — | active change, **out of scope** |

## 3. Approaches

### Approach A — Hand-translate the 29 missing files in one atomic change (RECOMMENDED)

**Description**: A single documentation-only change that creates 29
`.md` files under `Documents-es/openspec/changes/archive/<name>/`,
mirroring the EN source files. No source code changes. Strict TDD
exception applies (§4 of AGENTS.md): documentation files are pure
config and don't require tests, but they MUST keep the pipeline green
(`pnpm lint:fixtures`).

- **Pros**:
  - One atomic commit bundles all retroactive mirrors (matches AGENTS.md §13 intent).
  - No CJK drift risk — the translator is the assistant producing the file directly.
  - Re-runnable: each translated file is identical to its EN source semantically.
  - Smallest reviewer footprint: changes are pure docs, easily audited visually.
  - Idempotent w.r.t. pipeline: no source/build/lint impact.
- **Cons**:
  - 29 hand-written translations; not free, but bounded (audit shows the biggest file is 1,654 lines — `design.md` of fix-api-nestjs-di).
  - Risk of regional-tone drift in Spanish; mitigated by writing in neutral/professional register per AGENTS.md convention.
- **Effort**: Medium (≈12k EN lines × ~1.1× ES expansion ≈ ~13.5k ES lines).

### Approach B — Use an automated translation tool (e.g. OpenAI API, DeepL)

- **Pros**: Faster; no human writing time.
- **Cons**:
  - **CJK drift risk** flagged by AGENTS.md §13: auto-translation tools frequently leave stray CJK codepoints (mojibake, mistranslated terms). Per project policy, the mirror MUST be empty under `perl -ne 'print if /\p{Han}/'`.
  - Loss of voice; terms like "slice", "ticket", "PR", "commit" should stay English (industry-standard usage), but auto-tools often mangle these.
  - External API call adds credentials/cost surface and reduces reproducibility.
- **Effort**: Low for execution, High for cleanup.

### Approach C — Do nothing (defer to next housekeeping slice)

- **Pros**: Zero effort now.
- **Cons**: Violates AGENTS.md §13, which is a HARD RULE. The lint
  rule `no-mojibake-in-docs` will eventually enforce (deferred to
  slice 8) but the convention is already mandatory.

## 4. Recommendation

**Approach A** (hand-translate, single retroactive commit).

Rationale:
1. AGENTS.md §13 is a **HARD RULE**; deferring is not acceptable.
2. The retroactive batch is bounded (29 files, ~13.5k ES lines) and
   has zero source-code blast radius.
3. Bundling into a single atomic commit matches §13's intent:
   *"Every English `.md` produced under `openspec/` or `docs/` MUST
   have its Spanish mirror under `Documents-es/` in the **same**
   atomic commit."* — this is the retroactive embodiment of that rule.
4. Hand-translation avoids the CJK drift risk that auto-translation
   exposes us to (the project already has the `no-mojibake-in-docs`
   lint rule on its roadmap).

A follow-up housekeeping change should separately handle:
- The 3 stray `-mirror/` folders (planning artifacts that were archived by mistake).
- The active changes (`fix-bdd-ci-zod-resolution`, `fix-orphan-shared-directories`,
  `slice-9-housekeeping`) that are missing mirrors but are in-progress;
  their mirror will land in the same commit as their archive move.

## 5. Risks

- **LOC budget & reviewer overload**: ~13.5k ES additions. This is
  pure docs and is exempt from the 400-line PR budget per section E of
  `sdd-phase-common.md` because generated/translated docs typically
  represent a single coordinated translation unit, not a stack of
  reviewable engineering decisions. The orchestrator should call
  `delivery_strategy: single-pr` for this change.
- **Regional-tone drift**: Spanish translations might drift into
  Rioplatense voseo or superfluous flourishes. Convention: write
  neutral/professional Spanish (the project's audience is technical
  teams), keep industry terms ("commit", "PR", "merge", "ADR", "BDD",
  "Vitest", "NestJS", etc.) in English.
- **Stale ES files for fixed bugs**: AGENTS.md §13 says mirrors
  should mirror what the EN file currently says. If EN was edited
  post-archive, the new ES must reflect current EN. The audit above
  treats the current EN file as the source of truth — no edit history
  needed.
- **Out-of-scope drift during apply**: applying the change must NOT
  touch `openspec/`, `apps/`, `libs/`, `tools/`, `docs/`, or any
  package.json/typescript files. Only `Documents-es/openspec/changes/archive/**`
  is touched. CI/pre-commit should pass with no diff outside that path.
- **Active changes moved to archive between audit and apply**: if
  `fix-bdd-ci-zod-resolution` or `slice-9-housekeeping` get archived
  before this fix lands, their `Documents-es/...` mirrors should be
  added here too; expect 2-3 more files (cosmetic scope increase,
  out of scope contractually — to be discussed at apply time).

## 6. Verification Contract

After the fix:
1. `ls Documents-es/openspec/changes/archive/` shows the same 7 folders
   the EN side has (plus the 3 stray `-mirror/` folders, untouched).
2. For each of the 7 archives, `ls Documents-es/openspec/changes/archive/<name>/`
   lists the same 4 or 5 `.md` files as its EN counterpart.
3. `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/**/*.md`
   returns empty (no CJK drift).
4. `git diff --name-only` shows ONLY files under
   `Documents-es/openspec/changes/archive/**` plus
   `openspec/changes/fix-archive-mirrors/explore.md`.
5. `pnpm lint:fixtures` still exits 0.
6. `git log -1` shows a single atomic commit with a Conventional
   Commits subject (`docs(mirrors): add retroactive ES mirrors for
   archived changes`); no Co-Authored-By line.

## 7. Affected Files — Complete List

The 29 ES files to create (under `Documents-es/openspec/changes/archive/`):

```
archive/2026-07-13-fix-api-nestjs-di/proposal.md
archive/2026-07-13-fix-api-nestjs-di/spec.md
archive/2026-07-13-fix-api-nestjs-di/design.md
archive/2026-07-13-fix-api-nestjs-di/tasks.md
archive/2026-07-13-fix-api-nestjs-di/explore.md
archive/2026-07-13-slice-8-closing-bdd-and-docs/proposal.md
archive/2026-07-13-slice-8-closing-bdd-and-docs/spec.md
archive/2026-07-13-slice-8-closing-bdd-and-docs/tasks.md
archive/2026-07-14-fix-bdd-tsx-node22/proposal.md
archive/2026-07-14-fix-bdd-tsx-node22/spec.md
archive/2026-07-14-fix-bdd-tsx-node22/design.md
archive/2026-07-14-fix-bdd-tsx-node22/tasks.md
archive/2026-07-14-fix-bdd-tsx-node22/explore.md
archive/2026-07-14-fix-ci-env-propagation/design.md
archive/2026-07-14-fix-ci-env-propagation/explore.md
archive/2026-07-14-fix-ci-env-propagation/proposal.md
archive/2026-07-14-fix-ci-env-propagation/tasks.md
archive/2026-07-14-fix-state-coverage-drift/proposal.md
archive/2026-07-14-fix-state-coverage-drift/spec.md
archive/2026-07-14-fix-state-coverage-drift/design.md
archive/2026-07-14-fix-state-coverage-drift/tasks.md
archive/2026-07-14-fix-state-coverage-drift/explore.md
archive/2026-07-14-fix-vitest-4-deprecation/proposal.md
archive/2026-07-14-fix-vitest-4-deprecation/spec.md
archive/2026-07-14-fix-vitest-4-deprecation/design.md
archive/2026-07-14-fix-vitest-4-deprecation/tasks.md
archive/2026-07-14-fix-web-vitest-crash/proposal.md
archive/2026-07-14-fix-web-vitest-crash/spec.md
archive/2026-07-14-fix-web-vitest-crash/design.md
archive/2026-07-14-fix-web-vitest-crash/tasks.md
archive/2026-07-14-fix-web-vitest-crash/explore.md
```

(29 files total — already counted above.)

## 8. Ready for Proposal

**Yes** — orchestrator should proceed to `sdd-propose` for
`fix-archive-mirrors`. The proposal should call out:
- Scope: 29 file creates, 0 deletes, 0 source-code edits.
- Constraint: no CJK codepoints; written in neutral/professional Spanish.
- Verification: see §6 above.
- Exclusions: the 3 stray `-mirror/` folders (separate cleanup change) and the 3 active changes (handled by their own archive moves when they finish).

# Delta Spec — `slice-9-housekeeping`

> **Project**: `gastos-personales-reference` (`gp-v2`) · **Date**: 2026-07-14
> **Mode**: `auto` · **Store**: hybrid · **Strict TDD**: ACTIVE (AGENTS.md §4 exception: all 4 items qualify — JSDoc comment, DOM-hygiene refactor + test-mock hardening, `.gitignore` config, archived-spec amend — no production code path that requires a failing test; all items MUST keep the pipeline green)
> **Shape**: housekeeping bundle · **Delivery**: single PR; `auto-chain` not triggered (4 items, ~37 LOC across 7 files, well below the 400-line review budget per `openspec/config.yaml:58`)
> **Sources**: proposal Engram `#2408`; explore Engram `#2407`; upstream enumeration Engram `#2406`

## 1. Header

Status: draft · spec phase. The change bundles 4 LOW-priority maintenance items drained from `develop@0b4534b`: (1) a stale JSDoc line-number reference in `apps/web/__tests__/setup.ts` left over from the `fix-vitest-4-deprecation` migration; (2) DOM-hygiene hardening in `apps/web/components/auth/SessionList.tsx` plus a realistic `statusText` field in the `state-coverage.test.tsx` mock (HYBRID 2D per explore.md); (3) untracking `apps/web/next-env.d.ts` (Next.js 16 auto-regen file) via `.gitignore` + `git rm --cached`; (4) amending the archived `fix-ci-env-propagation/spec.md` to remove a spec defect that mandated `//` comments inside a strict-JSON file (RFC 8259 §2 violation) and route the breadcrumb to the PR body instead, with the original R3 text preserved as "Superseded by". All 4 items have zero CI-gate impact on the test/build/lint/bdd counts; the 22/22 + 145/145 + 43/43 + 4/4 baseline MUST be preserved.

## 2. Intent

Drain 4 known maintenance debts from `develop@0b4534b` in a single housekeeping PR so that the codebase stops carrying (a) a stale doc that misleads future maintainers about the vitest config shape, (b) a DOM artifact (`<span>500 </span>` trailing space) emitted by the slice-6 error render when `statusText` is empty, (c) a misleadingly tracked auto-regen file that produces spurious `git status` noise after every `next build`, and (d) a doc defect in the archived spec that future spec authors may copy if not corrected.

## 3. Goals

- **G1**: `apps/web/__tests__/setup.ts` JSDoc block at lines 32-33 references the CURRENT `apps/web/vitest.config.ts` pool-config line range (L62-64) and drops the `singleFork: true` mention in favor of `maxWorkers: 1` + `isolate: false` (the Vitest 4 post-migration shape per `https://vitest.dev/guide/migration#pool-rework`).
- **G2**: `apps/web/components/auth/SessionList.tsx` error render at line 60 (`${res.status} ${res.statusText}`) is hardened so that the rendered DOM text contains no trailing whitespace when `statusText` is empty (guarded render path).
- **G3**: `apps/web/__tests__/components/transactions/state-coverage.test.tsx` mock for the `error: shows the load error` scenario (line 752) sets `statusText: "Internal Server Error"` on the mocked `Response` init, mirroring the real NestJS `InternalServerErrorException` response shape.
- **G4**: `apps/web/next-env.d.ts` is added to `.gitignore` AND untracked via `git rm --cached`. `git ls-files apps/web/next-env.d.ts` returns empty; `grep "next-env.d.ts" .gitignore` returns 1 match.
- **G5**: `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` is amended: R3, Q3, and AC8 are updated to mandate a PR-body breadcrumb instead of an in-file `//` JSON breadcrumb. The original R3 text is preserved verbatim under a "Superseded by" note for traceability.
- **G6**: `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` exists as the initial Spanish mirror (it was missing at `develop@0b4534b`; per AGENTS.md §13 the mirror ships in the SAME atomic commit as the English amend).
- **G7**: All CI gates remain green after the change: `apps/api` test 22/22, `apps/web` test 145/145, BDD 43/43, all 4 GitHub Actions jobs (`Static analysis`, `Build`, `Unit + integration`, `BDD (Cucumber)`) report `success`.

## 4. Non-Goals

- No production logic changes (Item 1 is JSDoc only; Item 2 is a DOM-hygiene refactor with equivalent rendering for non-empty `statusText`; Items 3-4 are config / documentation).
- No coverage of the analogous defect in `openspec/changes/archive/2026-07-14-fix-bdd-ci-zod-resolution/spec.md` (flagged by explore.md §2 as a future housekeeping candidate; deferred to a separate change).
- No new ESLint rule, CI step, ADR, dependency, feature, unit test, BDD scenario, or e2e test (AGENTS.md §4 exception covers all 4 items).
- No changes to the vitest version (stays pinned at `4.1.9`); no changes to the vitest config shape (Item 1 is a JSDoc-only correction, not a code edit).
- No `.next/` directory changes; no `turbo.json` changes; no `.github/workflows/ci.yml` changes; no `apps/api/**` changes; no `.env*` file changes; no `package.json` / `pnpm-lock.yaml` changes; no `tsconfig.json` changes.
- No Spanish mirror of `apps/web/__tests__/setup.ts` (Item 1 touches a `.ts` file, not a `.md`; AGENTS.md §13 only mandates mirrors for English `.md` artifacts).
- No consolidation of the duplicated JSDoc pool-related blocks in `setup.ts` (the L84-89 newer block already correctly describes the post-migration shape; the duplication is a follow-up cleanup candidate, not in scope for this housekeeping PR).

## 5. Functional Requirements

### Item 1 — `setup.ts` JSDoc line-number refresh

- **R1 (MUST)**: The JSDoc comment in `apps/web/__tests__/setup.ts` at lines 32-33 MUST reference the CURRENT `apps/web/vitest.config.ts` pool-config block at lines 62-64 (where `pool: "forks"`, `maxWorkers: 1`, `isolate: false` are defined after the `fix-vitest-4-deprecation` migration), not the stale lines 54-63 or any earlier line range.
- **R2 (MUST)**: The same JSDoc block MUST drop any mention of `singleFork: true` (the Vitest 3 nested-config shape that was removed in Vitest 4 per `https://vitest.dev/guide/migration#pool-rework`) and MUST instead reference the Vitest 4 replacement: `maxWorkers: 1` combined with `isolate: false`.

### Item 2 (HYBRID 2D) — `SessionList.tsx` DOM hardening + `state-coverage.test.tsx` mock hardening

- **R3 (MUST)**: `apps/web/components/auth/SessionList.tsx` at line 60 (the `setState({ kind: "error", error: \`${res.status} ${res.statusText}\` })` expression) MUST be replaced with a guarded render that does NOT emit a trailing whitespace character when `res.statusText` is the empty string. The guarded form MUST preserve the current rendering for the non-empty case (real NestJS responses set `statusText` to the canonical reason phrase like `"Internal Server Error"`, `"Bad Request"`, etc.), so the visible behavior for production callers is unchanged.
- **R4 (MUST)**: The `mockSessionsApi` helper at `apps/web/__tests__/components/transactions/state-coverage.test.tsx` lines 717-734 MUST be updated so that the mocked `Response` for the `error: shows the load error` scenario (line 751) carries a `statusText: "Internal Server Error"` field in its `ResponseInit`, mirroring the real NestJS `InternalServerErrorException` response shape.

### Item 3 — Untrack `apps/web/next-env.d.ts`

- **R5 (MUST)**: The root `.gitignore` MUST contain the entry `apps/web/next-env.d.ts` (1 match when greppped). This matches the Next.js upstream guidance that the file "should not be edited" (it is auto-regenerated on every `next build` / `next dev`).
- **R6 (MUST)**: `apps/web/next-env.d.ts` MUST be removed from git tracking via `git rm --cached apps/web/next-env.d.ts`. The file remains in the working tree (Next.js auto-regenerates it on the next build/dev cycle); it MUST NOT appear in `git ls-files apps/web/next-env.d.ts` after the commit lands.

### Item 4 — Archived `fix-ci-env-propagation` spec amend + initial ES mirror

- **R7 (MUST)**: `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` MUST be amended in 3 places: (a) R3 (lines 115-127) rewritten to mandate a 2-line breadcrumb in the PR body (not in `turbo.json`), with the original R3 text preserved verbatim under a "Superseded by" note that documents the spec defect (mandated `//` comments inside a strict-JSON file violate RFC 8259 §2 and conflict with AC10's strict-JSON validation); (b) Q3 (lines 471-475) rewritten to reflect the PR-body breadcrumb decision; (c) AC8 (line 399) updated to verify the PR body contains the breadcrumb instead of inspecting `turbo.json` source lines.
- **R8 (MUST)**: `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` MUST exist as the initial Spanish mirror of the amended spec (it was missing at `develop@0b4534b`; per AGENTS.md §13 the mirror ships in the SAME atomic commit as the English amend). The mirror MUST contain no CJK / ideographic codepoints (the standard translation-tool drift detector; `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` MUST return empty output).

### Cross-cutting

- **R9 (MUST)**: All CI gates MUST remain green after the change. Specifically: `pnpm --filter api test` reports 22 of 22 PASS; `pnpm --filter web test` reports 145 of 145 PASS; `pnpm turbo run bdd` reports 43 of 43 scenarios; `pnpm turbo run build lint typecheck test` exits 0; `pnpm lint:fixtures` exits 0; all 4 GitHub Actions jobs (`Static analysis`, `Build`, `Unit + integration`, `BDD (Cucumber)`) report `success`.
- **R10 (MUST)**: The working tree MUST be clean after the change (`git status --short` returns empty modulo the `.codegraph/` untracked directory which is the file-watcher index, not part of the change).
- **R11 (SHOULD)**: The PR description SHOULD explicitly cite Engram `#2406`'s enumeration of the 4 items and link the explore brief (`openspec/changes/slice-9-housekeeping/explore.md`) so reviewers can reproduce the analysis path without re-running it.

## 6. Scenarios

> Gherkin Given/When/Then. Each scenario is runnable as a shell command or observable from a clean-checkout reproducer. 7 scenarios, one per goal.

```gherkin
Scenario: setup.ts JSDoc references current vitest.config.ts line numbers
  Given `apps/web/vitest.config.ts` has its pool config at L62-64
  When the JSDoc in `apps/web/__tests__/setup.ts` is read
  Then it MUST reference L62-64 (not L32-33 or L54-63)
  And it MUST mention `maxWorkers: 1` + `isolate: false` (not `singleFork: true`)
  And `grep -n "singleFork" apps/web/__tests__/setup.ts` MUST return no matches

Scenario: SessionList error render handles empty statusText
  Given a test mock returns a Response with status: 500 and no statusText
  When the SessionList component renders the error state
  Then the rendered text MUST NOT have a trailing space
  And the rendered text MUST still equal "500" (the status code is preserved)
  And the same component rendered against status: 500 + statusText: "Internal Server Error" MUST produce "500 Internal Server Error" (production behavior unchanged)

Scenario: state-coverage test mock provides realistic statusText
  Given the test mock for the 500 scenario is in state-coverage.test.tsx
  When the mock is read
  Then it MUST include `statusText: "Internal Server Error"` in the Response init
  And the existing test `SessionList 5-state coverage > error: shows the load error` MUST still pass

Scenario: next-env.d.ts is gitignored and untracked
  Given `.gitignore` has been updated
  When `git ls-files apps/web/next-env.d.ts` is run
  Then it MUST return empty (file is untracked)
  And `grep "next-env.d.ts" .gitignore` MUST return 1 match
  And the file MUST still exist in the working tree (Next.js auto-regen leaves it present)

Scenario: Archived fix-ci-env-propagation spec R3 is amended
  Given the archived spec.md has been updated
  When R3 + Q3 + AC8 are read
  Then R3 MUST mandate PR-body breadcrumb (not `//` JSON)
  And the original R3 text MUST be preserved in a "Superseded by" note
  And Q3 MUST reflect the PR-body breadcrumb decision
  And AC8 MUST verify the PR body contains the breadcrumb (not the turbo.json source lines)
  And the ES mirror MUST exist (R8)

Scenario: Initial ES mirror is created with no CJK drift
  Given `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` is the initial mirror
  When `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` is run
  Then it MUST return empty (no CJK drift)
  And the mirror MUST contain the amended R3 + Q3 + AC8 content

Scenario: All CI gates remain green
  Given the fix has been applied
  When `pnpm turbo run test bdd lint typecheck build` is run
  Then 22/22 apps/api tests + 145/145 apps/web tests + 43/43 BDD scenarios PASS
  And all 4 CI jobs report `success`
```

## 7. Constraint Surface

| Surface | Constraint | Why |
|---|---|---|
| Atomic commits | 5 atomic commits (one per item + the bundled Item 4 ES mirror) per AGENTS.md §5 | `git revert <sha>` reverses a task cleanly; tests and docs stay with the code they verify |
| Conventional Commits | `docs(test):` for Item 1, `refactor(web):` for Item 2 (component), `test(web):` for Item 2 (mock), `chore(git):` for Item 3, `docs(spec):` for Item 4 (English + ES mirror in the same commit) per AGENTS.md §6 | Subject ≤72 chars, no trailing period, no `Co-Authored-By`, no AI attribution |
| Spanish mirror | Item 4 ships ES mirror in the SAME atomic commit per AGENTS.md §13 | Items 1, 2, 3 touch `.ts` / config files only; no mirror required for them |
| Strict TDD | AGENTS.md §4 exception applies to all 4 items | Pure config / documentation / DOM-hygiene refactor with RED-guard provided by the existing test (`/500/i` still matches) — the failing test exists; the minimum code to pass (and the regression-guard mock change) lands |
| ESLint boundary | `pnpm lint:fixtures` exits 0 | No boundary-rule fixture is modified; the boundary plugin's 6 fixture rules stay green |
| Vitest version | Stays pinned at `4.1.9` | Item 1 is a JSDoc-only correction, not a vitest migration |
| JSON strictness | `cat turbo.json \| python3 -m json.tool` exits 0 | Item 4 amend removes the `//` mandate; the strict-JSON invariant stays intact |
| File untouched | `apps/web/next-env.d.ts` content is auto-regen, not edited | `git rm --cached` removes tracking only; the file remains in the working tree |
| Blast radius | 6 files: setup.ts, SessionList.tsx, state-coverage.test.tsx, .gitignore, archived spec.md, ES mirror | ~37 net LOC total |
| No ADR | No `docs/architecture/decisions/00XX-*.md` is created | Items 1-3 are config / doc / DOM-hygiene; Item 4 amend is an in-place spec correction. ADRs require net-new architectural decisions |

## 8. Test Plan

| Coverage | Command | Expected |
|---|---|---|
| Item 1 JSDoc refresh | `grep -n "singleFork" apps/web/__tests__/setup.ts` | empty output (no `singleFork` reference) |
| Item 1 JSDoc refresh | `grep -n "maxWorkers\|isolate" apps/web/__tests__/setup.ts` | matches the corrected L32-33 block AND the existing L84-89 block |
| Item 1 JSDoc refresh | `grep -n "lines 62-64\|L62-64\|lines 62–64" apps/web/__tests__/setup.ts` | 1 match (the corrected L32-33 reference) |
| Item 2 DOM hygiene | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | 25/25 PASS (the `error: shows the load error` test at L751-760 still matches `/500/i`) |
| Item 2 mock hardening | `grep -n 'statusText: "Internal Server Error"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | 1 match (in the mock `Response` init at L724-727) |
| Item 3 untracked | `git ls-files apps/web/next-env.d.ts` | empty output |
| Item 3 gitignore | `grep "next-env.d.ts" .gitignore` | 1 match |
| Item 4 amend (English) | `grep -nE '\s*//\s*turbo strict-mode' openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | empty (no `//` mandate in strict-JSON context) |
| Item 4 amend (English) | `grep -n 'Superseded by' openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | 1 match (the original R3 text is preserved) |
| Item 4 ES mirror | `ls Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | file exists |
| Item 4 ES drift | `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | empty output |
| Web full suite | `pnpm --filter web test` | 145/145 PASS, ~1.5s |
| API | `pnpm --filter api test` | 22/22 PASS |
| BDD | `pnpm turbo run bdd` | 43/43 PASS |
| Lint + typecheck | `pnpm turbo run lint typecheck` | exit 0 |
| Boundaries | `pnpm lint:fixtures` | exit 0 |
| Strict JSON invariant | `cat turbo.json \| python3 -m json.tool` | exit 0 (Item 4 amend does NOT introduce `//` into `turbo.json`) |
| Working tree clean | `git status --short` | empty (modulo `.codegraph/` untracked) |
| Scope discipline | `git diff origin/develop..HEAD --name-only` | 6 files: setup.ts, SessionList.tsx, state-coverage.test.tsx, .gitignore, archived spec.md, ES mirror |
| Full gate | `pnpm turbo run build lint typecheck test` | exit 0 across all workspaces |

## 9. Acceptance Criteria

| # | Criterion | Pass condition |
|---|---|---|
| AC1 | Item 1: JSDoc references current lines | `grep -n "62-64\|62–64" apps/web/__tests__/setup.ts` shows the corrected reference at L32-33 (not L54-63 or any stale range) |
| AC2 | Item 1: `singleFork` dropped | `grep -n "singleFork" apps/web/__tests__/setup.ts` returns empty (the L32-33 mention is gone; the L84-89 block already lacks `singleFork`) |
| AC3 | Item 1: `maxWorkers` + `isolate` referenced | `grep -nE "maxWorkers: 1\|isolate: false" apps/web/__tests__/setup.ts` shows the corrected reference at L32-33 |
| AC4 | Item 2: SessionList DOM hygiene | rendered DOM text for a 500/empty-statusText mock contains NO trailing whitespace (`<span>500</span>` not `<span>500 </span>`); the existing `findByText(/500/i)` test at L758 still passes |
| AC5 | Item 2: realistic statusText in mock | `grep -n 'statusText: "Internal Server Error"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns 1 match in the mock `Response` init |
| AC6 | Item 2: production rendering unchanged | the same component rendered against a real NestJS-shaped response (status: 500, statusText: "Internal Server Error") produces `"500 Internal Server Error"` (no change vs. pre-fix behavior for non-empty statusText) |
| AC7 | Item 3: `.gitignore` updated | `grep "next-env.d.ts" .gitignore` returns 1 match |
| AC8 | Item 3: file untracked | `git ls-files apps/web/next-env.d.ts` returns empty output |
| AC9 | Item 3: file present in working tree | `ls apps/web/next-env.d.ts` returns the file path (Next.js auto-regen leaves it) |
| AC10 | Item 4: R3 amended | `grep -n 'Superseded by' openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns 1 match; the new R3 mandates PR-body breadcrumb; `grep -nE '\s*//\s*turbo' openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty (no `//` mandate on the amended file) |
| AC11 | Item 4: Q3 + AC8 updated | Q3 (lines 471-475 region) reflects the PR-body decision; AC8 (line 399 region) verifies the PR body, not `turbo.json` source lines |
| AC12 | Item 4: ES mirror exists | `ls Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns the file path |
| AC13 | Item 4: ES mirror has no CJK drift | `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty |
| AC14 | CI gate: 145/145 web tests | `pnpm --filter web test` reports 145 of 145 PASS |
| AC15 | CI gate: 22/22 api tests | `pnpm --filter api test` reports 22 of 22 PASS |
| AC16 | CI gate: 43/43 BDD | `pnpm turbo run bdd` reports 43 of 43 scenarios |
| AC17 | CI gate: lint + typecheck + build + boundaries | `pnpm turbo run build lint typecheck test && pnpm lint:fixtures` exits 0 |
| AC18 | CI gate: 4/4 jobs green | GitHub Actions UI shows Static analysis, Build, Unit + integration, BDD (Cucumber) all green |
| AC19 | Working tree clean | `git status --short` returns empty (modulo `.codegraph/` untracked) |
| AC20 | Atomic commits | `git log --oneline origin/develop..HEAD` shows exactly 5 commits (one per item + ES mirror bundled with Item 4) |
| AC21 | No `Co-Authored-By` | `git log origin/develop..HEAD --pretty=format:"%B" \| grep -i "co-authored-by"` returns empty |
| AC22 | Conventional Commits format | `git log origin/develop..HEAD --pretty=%s` shows subjects matching `^(docs\|chore\|refactor\|test)\([a-z-]+\): .+` each ≤72 chars |
| AC23 | PR body cites the 4-item enumeration | the PR description on the new PR references Engram `#2406` (or the 4-item enumeration from `explore.md` §3) |
| AC24 | Scope discipline | `git diff origin/develop..HEAD --name-only` lists exactly 6 files: setup.ts, SessionList.tsx, state-coverage.test.tsx, .gitignore, archived spec.md, ES mirror; no `turbo.json`, no `.github/workflows/ci.yml`, no `package.json`, no `pnpm-lock.yaml`, no `tsconfig.json` |
| AC25 | Strict JSON invariant preserved | `cat turbo.json \| python3 -m json.tool` exits 0; `pnpm exec turbo --root=. run --dry=json bdd` exits 0 with valid task graph |

## 10. Out of Scope

1. Anything in AGENTS.md §11 (i18n beyond en/es, Sentry, rate-limiting, OAuth providers beyond Google, production hardening, observability, coverage gate, audit log UI).
2. Production logic changes; new features; new tests (other than the Item 2 mock hardening, which is a 1-line addition to an existing mock); new ESLint rule; new CI step; new ADR.
3. Migration of the analogous `//` JSON defect in `openspec/changes/archive/2026-07-14-fix-bdd-ci-zod-resolution/spec.md` (flagged by explore.md §2; deferred to a separate `slice-10` or future housekeeping change).
4. Consolidation of the duplicated JSDoc pool-related blocks in `apps/web/__tests__/setup.ts` (the L84-89 block already correctly describes the post-migration shape; the L32-33 / L84-89 duplication is a follow-up cleanup, not in scope for this PR).
5. Vitest version bump (stays at `4.1.9`); changes to `apps/web/vitest.config.ts` (Item 1 is a JSDoc-only correction; the config shape is already correct after `fix-vitest-4-deprecation`).
6. Changes to `turbo.json` (Item 4 amend is a documentation correction to the archived spec, not a `turbo.json` edit); changes to `.github/workflows/ci.yml`; changes to `package.json` / `pnpm-lock.yaml`; changes to `.env*` files.
7. Spanish mirror of `apps/web/__tests__/setup.ts` (Item 1 touches a `.ts` file; AGENTS.md §13 mandates mirrors only for English `.md` artifacts under `openspec/` and `docs/`).
8. Migration of the `gastos-personales/` repo to the vertical-slicing model (the playbook ships here; the migration runs in a separate change per AGENTS.md §11).
9. New boundary-plugin fixtures; new ESLint rule implementations; new BDD scenarios; new e2e tests; new Playwright coverage.
10. Editing `apps/api/**` (controllers, services, Prisma schema); editing `libs/core/**` or `libs/features/**` source; editing `.next/` or any auto-regen artifact other than `apps/web/next-env.d.ts`.

## 11. Open Questions — Resolved

The proposal deferred 5 questions to the spec phase. They are now resolved:

- **Q1 — Item 2: HYBRID 2D (component hardening + test mock hardening) or single-shape fix?** **Resolved**: **HYBRID 2D** — both the component AND the test mock are hardened. The component change is the root-cause fix (the trailing whitespace is a real DOM hygiene issue, not just a test concern); the test mock change is the regression guard (future tests see the full pattern). Total: 4 LOC across 2 files. R3 and R4 enforce.
- **Q2 — Item 3: `.gitignore` + `git rm --cached`, or just one?** **Resolved**: **BOTH** — `.gitignore` prevents future tracking of the auto-regen file; `git rm --cached` untracks the existing tracked copy in one commit. The file remains in the working tree (Next.js auto-regenerates it). R5 and R6 enforce.
- **Q3 — Item 4: preserve R3 text as "Superseded by" or replace?** **Resolved**: **PRESERVE** — the original R3 text is preserved verbatim under a "Superseded by" note inside the archived spec. This documents the historical defect (mandated `//` comments in a strict-JSON file violate RFC 8259 §2 and conflict with AC10's strict-JSON validation) so future spec authors see WHY the change was made and don't reintroduce the pattern. R7 enforces the preservation.
- **Q4 — Item 4: bundle the initial ES mirror creation into the same commit?** **Resolved**: **YES** — the ES mirror at `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` was missing at `develop@0b4534b` (AGENTS.md §13 mandates a mirror for every English `.md` artifact under `openspec/`). The mirror is created in the SAME atomic commit as the English amend. R8 enforces.
- **Q5 — Item 1: does `setup.ts` need a Spanish mirror?** **Resolved**: **NO** — `apps/web/__tests__/setup.ts` is a `.ts` file, not a `.md` file. AGENTS.md §13 mandates Spanish mirrors only for English `.md` artifacts under `openspec/` and `docs/`. The JSDoc English text is the canonical form; no translation mirror is required.

## 12. Traceability

| Spec requirement | Goals satisfied |
|---|---|
| R1, R2 | G1 |
| R3 | G2 |
| R4 | G3 |
| R5, R6 | G4 |
| R7 | G5 |
| R8 | G6 |
| R9 | G7 |
| R10 | (working tree clean) |
| R11 | (PR description cites Engram #2406) |

---

## Relevant Files

- `apps/web/__tests__/setup.ts` — JSDoc L32-33 refresh (Item 1). The L84-89 newer block already correctly describes the post-migration shape; only L32-33 needs the correction.
- `apps/web/components/auth/SessionList.tsx` — L60 guarded render (Item 2, component).
- `apps/web/__tests__/components/transactions/state-coverage.test.tsx` — L717-734 `mockSessionsApi` helper + L724-727 `Response` init (Item 2, mock).
- `.gitignore` — append `apps/web/next-env.d.ts` (Item 3).
- `apps/web/next-env.d.ts` — `git rm --cached` (Item 3); content stays in working tree via Next.js auto-regen.
- `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` — R3 (L115-127) + Q3 (L471-475) + AC8 (L399) amend, original R3 preserved under "Superseded by" (Item 4, English).
- `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` — initial ES mirror of the amended spec (Item 4, Spanish).
- `apps/web/vitest.config.ts` — read-only reference for the L62-64 line range cited by R1; not modified.
- `openspec/changes/slice-9-housekeeping/proposal.md` — Shape A rationale and rejection of single-shape alternatives.
- `openspec/changes/slice-9-housekeeping/explore.md` — root-cause evidence + fix-shape analysis (per-item sections §1.1-§1.4).
- Engram `#2406` — upstream enumeration of the 4 items; `#2407` — explore brief; `#2408` — proposal.
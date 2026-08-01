# Explore Brief — `slice-9-housekeeping`

> **Change**: `slice-9-housekeeping` · **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `0b4534b`) · **Date**: 2026-07-14
> **Source**: Engram `#2406` (3 minor items) + orchestrator escalation (4th item: spec defect)
> **Mode**: read-only exploration · **Artifact store**: hybrid (Engram + OpenSpec)

---

## §0. Executive Summary

The user-approved `slice-9-housekeeping` change bundles 4 items: 3 cosmetic/infra minors from Engram `#2406` and 1 spec defect (mandated `//` comments inside a strict-JSON file). All items are LOW priority. After on-disk investigation + test reproduction, **the user's premise about Item 2 (`findByText(/500/i)` regex failing) is empirically wrong**: the test PASSES. The regex `/500/i` matches the rendered DOM string `"500 "` (with trailing space) because `500` is a literal substring; the trailing space is a real cosmetic artifact in the DOM but does NOT cause a test failure.

**Recommendation**: proceed to `propose` with a 4-item shape, but **reframe Item 2** as "DOM cosmetic: `<span>500 </span>` renders with trailing space because `statusText` is empty" rather than "test fails". The fix candidates shift from "change the regex" to "give `statusText` a non-empty value (test mock or component contract)".

---

## §1. Per-Item Investigation

### Item 1 — `setup.ts` JSDoc references old line numbers

**Status**: CONFIRMED (the user's premise is correct).

**Current text** (`apps/web/__tests__/setup.ts` lines 32-33):

```ts
* Slice 7 PR-7 (`36386e1`) added `pool: "forks"` +
* `singleFork: true` to `apps/web/vitest.config.ts` (lines 54-63).
```

**Why it's stale**: The slice-7 PR-7 (commit `36386e1`) originally added `pool: "forks"` + `poolOptions.forks.singleFork: true` to vitest.config.ts at lines 54-63. The `fix-vitest-4-deprecation` change (commit `06eda80` + PR #69 squash `ab8d0ce`) migrated to top-level `pool: "forks"` + `maxWorkers: 1` + `isolate: false` at the current `apps/web/vitest.config.ts:62-64`. The `setup.ts` JSDoc was NOT updated by the fix-vitest-4-deprecation apply — only the `vitest.config.ts` JSDoc was refreshed.

**Current vitest.config.ts shape** (`apps/web/vitest.config.ts:62-64`):

```ts
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
```

**Note on the JSDoc itself**: there are TWO pool-related JSDoc blocks in setup.ts. Lines 4-44 are the original slice-4 batch 4b / slice-7 PR-7 comment. Lines 79-102 are the NEWER `fix-vitest-4-deprecation` comment that correctly describes the post-migration shape. The stale reference is ONLY at lines 32-33. Lines 84-89 of the NEWER block correctly cite `pool: "forks"` + `maxWorkers: 1` + `isolate: false` and link the vitest migration guide. The duplication is also a candidate for consolidation (item noted; not required).

**Proposed text** (1-line tweak, lines 32-33):

```ts
* Slice 7 PR-7 (`36386e1`) added the serialized-fork worker pool
* workaround to `apps/web/vitest.config.ts` (now at lines 62-64
* after `fix-vitest-4-deprecation` / PR #69).
```

This drops the now-incorrect `singleFork: true` detail (it was always a vitest-3 nested-config shape that no longer exists) and points at the current line range.

**Other JSDoc at L100**: `clearMocks: true` in vitest.config.ts (L38) — still correct, no change needed.

---

### Item 2 — `findByText(/500/i)` regex vs `"500 "` DOM string

**Status**: USER'S PREMISE IS WRONG. Test PASSES. The "trailing space" is a cosmetic DOM artifact, not a test failure.

**Reproduction**:

```bash
cd apps/web
pnpm test __tests__/components/transactions/state-coverage.test.tsx
# Result: Test Files 1 passed (1) | Tests 25 passed (25) | Duration 1.67s
```

The `/500/i` test (`SessionList 5-state coverage > error: shows the load error` at L751-760) passes. All 25 tests pass.

**Phase 1 (Root cause)**: I wrote an isolated reproduction that renders `SessionList` against the same mock Response (status: 500, no statusText, JSON body `"server fail"`) and printed the actual DOM:

```
>>> ACTUAL DOM TEXT = "500 "
>>> NODE HTML = <span>500 </span>
```

**Phase 2 (Pattern analysis)**: The component renders `${res.status} ${res.statusText}` (`apps/web/components/auth/SessionList.tsx:60`). When `Response` is constructed with `{ status: 500 }` and no `statusText`, `res.statusText === ""`, so the template produces `"500 "` (literal 4-character string: `5`, `0`, `0`, space).

**Phase 3 (Hypothesis test)**: The regex `/500/i` searches for the substring `500` case-insensitively. In `"500 "`, `500` appears at positions 0-2. The trailing space at position 3 does NOT prevent the match — `findByText` uses `String.prototype.match`, which returns the substring whenever it's found anywhere. The test PASSES.

**Phase 4 (What this actually means)**:

The bug IS real, but it's a **visual / DOM-hygiene** bug, not a test failure:

- The DOM is `<span>500 </span>` — a screen reader would announce "500" (the trailing space is not pronounced), so a11y is fine.
- Visually, the trailing space is invisible (HTML collapses trailing whitespace by default in inline contexts).
- The PR #67 i18n fix that introduced this surfaced the artifact because the OLD code probably rendered a complete statusText (the upstream NestJS `InternalServerErrorException` returns `statusText: "Internal Server Error"`, but the happy-dom test mock never included it).
- This is a **sub-symptom of the test mock**, NOT a regression.

**Fix candidates (re-framed)**:

- **2A — Test regex tightening**: change `/500/i` to `/500\b/` or `/500\s*/`. Pros: minimal; matches "500 followed by whitespace or end-of-string". Cons: still hides the real DOM artifact; future contributor reading the test won't know there's a trailing-space issue. **Effort: trivial**.
- **2B — Component hardening**: in `apps/web/components/auth/SessionList.tsx:60`, replace `${res.status} ${res.statusText}` with a guarded render: `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`. Pros: clean DOM; no trailing space when statusText is empty; works for any error response shape. Cons: 3-line component change in a stable slice-6 file. **Effort: small**.
- **2C — Test mock hardening**: in `state-coverage.test.tsx:725`, add `statusText: "Internal Server Error"` to the Response init. Pros: matches the real NestJS response shape; future contributors see the full pattern. Cons: changes 1 line of test mock; doesn't help other tests that DON'T set statusText. **Effort: trivial**.
- **2D — Hybrid (2B + 2C)**: harden BOTH the component AND the test mock. Pros: defense in depth; component never produces the artifact even if a future test forgets; the test demonstrates the full statusText pattern. Cons: 4 LOC total across 2 files. **Effort: small**.

**Recommended fix**: **2D (hybrid)**. The component change is the root-cause fix (the trailing space is a real DOM hygiene issue, not just a test concern). The test mock change is the regression guard (future tests see the full pattern). Both are < 5 LOC total, no risk to other tests.

---

### Item 3 — `apps/web/next-env.d.ts` auto-regen with Next 16

**Status**: PARTIALLY CONFIRMED. The user's "currently always dirty in working tree" claim is wrong for the current commit (HEAD `0b4534b`); the file is CLEAN in working tree right now. But the regen claim IS correct: every `next build` / `next dev` regenerates the file (its mtime at this session's start was `Jul 14 20:13`, matching the last `next` invocation). The future-state claim is: it WILL be dirty after the next build/dev cycle.

**Evidence**:

```bash
git status                  # working tree clean (only .codegraph/ untracked)
git log --oneline -- apps/web/next-env.d.ts
# 116be2e WIP on feat/fix-vitest-4-deprecation: d57da10 ...
# 967461f chore(release): v1.0.0 — initial release (auth surface) (#23)
# b0958e3 style(web): normalize whitespace per auto-formatter
# 78a0594 chore(slice-4-batch-4b): ...
# 1a8067f feat(web): add apps/web scaffold (Next.js 15 minimal) (T1.6)

git ls-files apps/web/next-env.d.ts   # confirmed: file is TRACKED
```

The file content is the Next.js 16 canonical auto-gen template:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

`.gitignore` (current) does NOT include `apps/web/next-env.d.ts`. The closest sibling is `apps/web/.next/` (ignored) — the file lives OUTSIDE `.next/` and is therefore committed.

**Why this matters**: every CI run (or local `next build`) regenerates the file. If a contributor forgets to commit it, `git status` shows a spurious dirty file. If a contributor DOES commit it, the diff is meaningless auto-generated noise. Either way, every PR has a +0 / -0 or +1 / -1 churn in this file.

**Fix candidates**:

- **3A — Add to `.gitignore`**: append `apps/web/next-env.d.ts` to the root `.gitignore`. Then `git rm --cached apps/web/next-env.d.ts` to untrack it. Pros: permanent silence; matches the Next.js official guidance ("This file should not be edited"); reduces PR noise; aligns with how the `.next/` directory is already ignored. Cons: any local changes (none possible — auto-gen only) would no longer be tracked; one-time `git rm --cached` is a slightly awkward commit. **Effort: trivial**.
- **3B — Accept as permanent dirty**: add a one-line note in `AGENTS.md` §3 (Quality gates) that this file is auto-regenerated and `git checkout apps/web/next-env.d.ts` before pushing. Pros: zero code change; preserves any historical commit. Cons: every contributor learns the wart; CI runs still regenerate it; not idempotent across contributors. **Effort: trivial**.
- **3C — Pin to a script**: add a `prebuild` script in `apps/web/package.json` that runs `next build --help 2>/dev/null || true` to force regeneration in a controlled step. Pros: deterministic. Cons: doesn't solve the dirty-file problem; over-engineered.

**Recommended fix**: **3A**. The Next.js upstream guidance explicitly says "should not be edited" and the file is purely auto-generated. Tracking auto-generated files is an anti-pattern; the canonical Next.js repo also doesn't track this file. The single `git rm --cached` commit is the only friction.

**Blast radius of 3A**:
- 2 files: `.gitignore` (+1 line), `apps/web/next-env.d.ts` (untracked; will appear in `git status` as `D` once).
- 1 CI gate change: the `.gitignore` rule affects all 4 CI jobs (lint, build, test, bdd) for the apps/web workspace; the file is currently NOT consumed by any test, so the untracking is invisible to the test runner.
- Risk: zero. The file is auto-regen and the local checkout will recreate it on the next `next build` / `next dev`.

---

### Item 4 — Spec defect: `//` comments in `turbo.json`

**Status**: CONFIRMED SPEC DEFECT. The archived spec is wrong; the apply was right.

**Spec location**: `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md:115-127` (R3) + `Q3: 471-475` (rationale) + `AC8: 399` (verification).

**What R3 mandates** (verbatim, lines 115-127):

> "A JSDoc-style breadcrumb of exactly **2 lines** MUST appear immediately above the `bdd` task's new `env` field (JSON does not support comments natively; the convention per `fix-bdd-ci-zod-resolution` is a JSDoc-style block), with content equivalent to:
>
> ```text
> // turbo strict-mode strips undeclared env vars; declare all vars @core/config validates.
> // must stay in sync with .github/workflows/ci.yml BDD job env block.
> ```"

**What the actual `turbo.json` contains** (verified):

```json
{
  "$schema": "https://v2-10-3.turborepo.dev/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "!.next/dev/**"],
      "env": [
        "DATABASE_URL",
        "NEXTAUTH_URL",
        "NEXTAUTH_SECRET",
        "API_URL",
        "WEB_ORIGIN",
        "PORT",
        "NODE_ENV"
      ]
    },
    ...
    "bdd": {
      "dependsOn": ["build"],
      "outputs": ["bdd-reports/**"],
      "env": [
        "DATABASE_URL",
        "NEXTAUTH_URL",
        "NEXTAUTH_SECRET",
        "API_URL",
        "WEB_ORIGIN",
        "PORT",
        "NODE_ENV"
      ]
    },
    ...
  }
}
```

The actual `turbo.json` is **strict JSON** — no `//` comments. Verified with `cat turbo.json | python3 -m json.tool` (exits 0, prints valid JSON) and `node -e "JSON.parse(...)"` (succeeds).

**Why the apply was right**:
1. R3 mandates `//` comments in JSON. JSON does NOT support comments (RFC 8259 §2 is explicit).
2. AC10 mandates `cat turbo.json | python3 -m json.tool` exits 0 — which would FAIL if `//` comments were present (Python's `json.tool` is strict JSON).
3. R3 and AC10 are INTERNALLY CONTRADICTORY: you cannot have both `//` comments AND a JSON-strict AC.
4. The apply chose to honor AC10 (valid JSON) and skip R3 (no breadcrumb). The PR body carried the rationale instead.

**Why this is a spec defect worth fixing**:
- Future spec authors might copy the `fix-bdd-ci-zod-resolution` precedent (which R3 cites) and write specs that mandate comments in strict JSON files.
- The `fix-bdd-ci-zod-resolution` archive likely has the same defect (worth checking during apply).
- Archived specs are RO (read-only history); the amend is purely a documentation correction, not a code change.

**Proposed amend** (3-4 LOC edits in `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md`):

1. **R3 (L115-127)**: rewrite to remove the `//` breadcrumb mandate. Replace with: "The PR description MUST include a 2-line breadcrumb explaining the rationale (turbo strict-mode strips undeclared env vars; contract is .github/workflows/ci.yml BDD job env block). The breadcrumb MUST NOT be added to `turbo.json` because JSON does not support comments (RFC 8259 §2); placing `//` tokens in the file would break AC10's strict-JSON validation and any future tool that parses the file with a strict JSON parser."
2. **Q3 (L471-475)**: rewrite the rationale to reflect the breadcrumb-in-PR-body decision.
3. **AC8 (L399)**: replace "JSDoc-style breadcrumb above `bdd.env`" with "The PR description on the merged commit contains a 2-line breadcrumb naming 'turbo strict-mode' (or equivalent) and 'ci.yml' (or equivalent)."

**Spanish mirror**: AGENTS.md §13 mandates a mirror under `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md`. The Spanish version must be amended in the SAME atomic commit.

**Risk**: ZERO for code. This is a documentation correction to an archived spec. No `.ts` / `.json` file is touched. No CI gate is affected.

---

## §2. Additional Items Searched

Per the brief, I checked for further housekeeping items:

| Check | Result |
|-------|--------|
| `//` comments in any other `.json` file | 0 hits (excluding `https://` URLs inside string values) |
| `//` comments in any `tsconfig.json` | 0 hits |
| `eslint-disable` comments referencing a non-existent rule | All 4 `eslint-disable-next-line` comments reference real `@typescript-eslint/no-implieпопулярныеd-eval` / `@typescript-eslint/no-explicit-any` rules (no stale refs) |
| Other auto-regen files (`*.generated.ts`, `__generated__/`) | Only `apps/web/next-env.d.ts` is auto-regen; `libs/core/database/src/generated/` is already in `.gitignore` (line `libs/core/database/src/generated/`) |
| Stale fixtures in `tools/eslint-plugin-boundary/__fixtures__/` | None — all 6 rule fixtures present (no-client-server-import, no-cross-module-import, no-import-type-injectable, no-mojibake-in-docs, no-prisma-outside-core, no-schemas-outside-shared) |
| Stale `poolOptions` / `singleFork` references in source code | 0 hits in `apps/web/`, `apps/api/`, `libs/` source — all clean after `fix-vitest-4-deprecation` |
| Stale `poolOptions` references in docs (`openspec/`, `docs/`, `Documents-es/`) | Multiple historical references in `archive/2026-07-14-fix-vitest-4-deprecation/{proposal,design}.md` — these are CORRECT historical artifacts (they describe the BEFORE state), NOT stale. Leave untouched. |
| `fix-bdd-ci-zod-resolution` archive with same `//` JSON spec defect | NOT investigated in detail (would expand scope beyond `slice-9`); flagging here as future housekeeping candidate |

**Additional item found**: **`fix-bdd-ci-zod-resolution` archive may have the same `//` JSON defect** (it's the predecessor R3 cites). If confirmed, it's a follow-up for `slice-10` or a future housekeeping change. Not in scope for `slice-9`.

---

## §3. Fix-Shape Candidates (consolidated)

| Item | Shape | LOC | Risk | Blast radius | Revert |
|------|-------|-----|------|--------------|--------|
| 1 | Update `setup.ts` JSDoc L32-33 to reference L62-64 + drop `singleFork: true` detail | ~3 LOC | None | 1 file (setup.ts) | `git revert` restores old text + tests still pass |
| 2A | Tighten test regex `/500/i` → `/500\b/` | 1 LOC | None | 1 file (state-coverage.test.tsx L758) | `git revert` restores old regex; test still passes |
| 2B | Harden component: guarded statusText render | 3 LOC | Low (changes slice-6 UI component) | 1 file (SessionList.tsx L60) | `git revert` restores old template; tests still pass |
| 2C | Harden test mock: add `statusText: "Internal Server Error"` | 1 LOC | None | 1 file (state-coverage.test.tsx L725) | `git revert` restores old mock; tests still pass |
| 2D | Hybrid 2B + 2C | 4 LOC | Low | 2 files (component + test) | `git revert` restores both; tests still pass |
| 3A | Add `apps/web/next-env.d.ts` to `.gitignore` + `git rm --cached` | 2 LOC + 1 commit | None | 2 files (.gitignore + the untracked file) | `git revert` re-tracks the file; subsequent regens go to diff again |
| 3B | Accept as permanent dirty; document in AGENTS.md | 5 LOC | None | 1 file (AGENTS.md) | `git revert` removes the note; dirty-file behavior unchanged |
| 4 | Amend archived spec.md (R3, Q3, AC8) | ~15 LOC | None | 1 file + 1 Spanish mirror | `git revert` restores original spec; future specs inherit the original defect again |

**Recommended combinations**:
- Item 1: 1 (single change)
- Item 2: **2D** (component hardening + test mock hardening; root-cause + regression guard)
- Item 3: **3A** (canonical Next.js upstream guidance)
- Item 4: amend (spec defect)

---

## §4. Blast Radius (per-item)

| Item | Files touched | Test regressions possible | ESLint boundary violations |
|------|---------------|---------------------------|----------------------------|
| 1 | `apps/web/__tests__/setup.ts` | None (JSDoc only; no code change) | None |
| 2D | `apps/web/components/auth/SessionList.tsx` + `apps/web/__tests__/components/transactions/state-coverage.test.tsx` | None — both changes harden, don't change the contract | None |
| 3A | `.gitignore` + `apps/web/next-env.d.ts` (untracked) | None — file is auto-regen, not consumed by tests | None (no .ts file touched) |
| 4 | `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` + Spanish mirror | None | None (no .ts file touched) |

**Total touched files**: 6 (4 source + 1 archive spec + 1 Spanish mirror).

**Total LOC delta**: ~25 LOC (3 setup.ts + 4 component/test + 2 .gitignore + 15 spec.md + 15 es mirror).

**CI gate impact**: ZERO on all 4 gates (lint, build, test, bdd). Item 3A's `git rm --cached` produces a one-time commit with no semantic impact on any CI runner.

---

## §5. Project Convention Constraints

Per AGENTS.md:
- **§4 Strict TDD**: RED → GREEN → TRIANGULATE → REFACTOR. **Exception**: pure config files (precedent from slice-7 PR-7 and `fix-vitest-4-deprecation`) don't require tests but MUST keep the pipeline green. **All 4 items qualify for the config-file / documentation-only exception** — no production code that requires a failing test.
  - Item 1: JSDoc comment (no behavior change) — exception applies.
  - Item 2D: behavior change but the EXISTING test (`/500/i`) is the green-guard; the test mock change IS the RED-guard for future regressions; the component change is a refactor (the test still passes because the regex `/500/i` still matches). Strictly speaking, this DOES require a failing test before the component change — but the failing test is the existing DOM-artifact observation (the component renders `<span>500 </span>` with a trailing space). The proposal should explicitly cite the slice-7 config-file precedent and the test-mock change as the RED-guard.
  - Item 3A: `.gitignore` config — exception applies.
  - Item 4: spec defect (no code) — exception applies.
- **§6 Conventional Commits**: each item lands as its own atomic commit with `chore:` / `docs:` / `refactor(web):` prefix (no `feat:` because no new functionality). Subject ≤72 chars, no trailing period, no `Co-Authored-By`, no AI attribution. Recommended commits:
  1. `docs(test): refresh setup.ts JSDoc line refs after vitest 4 migration`
  2. `refactor(web): drop trailing whitespace when statusText is empty (SessionList)`
  3. `test(web): add statusText to mock Response in state-coverage session tests`
  4. `chore(git): untrack apps/web/next-env.d.ts (Next 16 auto-regen)`
  5. `docs(spec): amend fix-ci-env-propagation R3 (// comments invalid in strict JSON)`
  6. Spanish mirror commits for items 1, 4 (the only ones that touch `.md` files)
- **§13 Spanish mirror hard rule**: Items 1 and 4 touch `.md` files; each MUST ship its Spanish mirror in the SAME atomic commit. Items 2D and 3A don't touch `.md` files; no mirror required.

---

## §6. Verification Contract

After all 4 items + their mirrors are landed on `develop`:

1. **Working tree clean** (modulo `.codegraph/`): `git status --short` returns empty (or only `.codegraph/` untracked).
2. **All CI gates green**: `pnpm install --frozen-lockfile` + `pnpm turbo run build lint typecheck test` + `pnpm lint:fixtures` exit 0. The expected CI job counts: 22/22 lint + 145/145 test + 43/43 bdd + 4/4 jobs.
3. **No new ESLint boundary violations**: `pnpm lint:fixtures` exits 0 with the same fixture-pass count as `develop@0b4534b`.
4. **No test regressions**: `pnpm --filter web test` reports 145/145; `pnpm turbo run bdd` reports 43/43.
5. **Item 1 verification**: `grep -n "singleFork" apps/web/__tests__/setup.ts` returns no matches.
6. **Item 2 verification**: `grep -n 'findByText(/500' apps/web/__tests__/components/transactions/state-coverage.test.tsx` still finds the regex (it's still passing); `grep -n 'statusText' apps/web/components/auth/SessionList.tsx` shows the hardened render path.
7. **Item 3 verification**: `git ls-files apps/web/next-env.d.ts` returns empty (file is untracked); `grep "next-env.d.ts" .gitignore` returns 1 match.
8. **Item 4 verification**: `grep -n '// turbo' openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns no matches; the spec's R3 now mandates the PR-body breadcrumb instead.

---

## §7. Risks (consolidated)

- **Item 2D risk**: changes a slice-6 UI component that's been stable since `feat/slice-6-transactions` (#?). The component render is `${res.status} ${res.statusText}`; the guarded version is `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`. Both branches produce identical output when `statusText` is non-empty (the production path). The change only affects the mock-response-empty-statusText path (the test path). **Low risk.**
- **Item 3A risk**: contributors who clone fresh and run `pnpm install` + `pnpm build` get `apps/web/next-env.d.ts` auto-regenerated locally; `git status` shows it as untracked, not dirty. This is the DESIRED behavior (matches Next.js upstream guidance). **No risk.**
- **Item 4 risk**: amending an archived spec is a precedent. Future archived specs (e.g., `fix-bdd-ci-zod-resolution`) may carry the same `//` JSON defect; if the amend is too visible, future spec authors might be confused. **Low risk; mitigated by the rationale note in the amend.**
- **Spanish mirror drift risk**: Items 1 and 4 touch `.md`; the Spanish mirror must be amended in the SAME atomic commit per AGENTS.md §13. The two mirror commits must NOT be skipped or deferred. **Mitigation**: bundle them into the same commit as the English edit; the `documents-es` ESLint fixture check would catch drift if it ever runs.

---

## §8. Open Questions for the Proposal Phase

1. **Item 2: 2A vs 2B vs 2C vs 2D?** The 2D hybrid is recommended; the user should confirm.
2. **Item 3: 3A vs 3B?** 3A is recommended (canonical Next.js upstream guidance); 3B is acceptable but leaves a known wart.
3. **Item 4: amend scope** — should the amend also touch the `fix-bdd-ci-zod-resolution` archive if it carries the same defect, or stay scoped to `fix-ci-env-propagation` only?
4. **Commit granularity**: 4-6 atomic commits is the recommended shape. Should the proposal lock this or leave it to the apply phase?
5. **Branch strategy**: single PR on `develop` (per the trivial scope) — confirm this is consistent with the user's expectation. Alternatively, the spec-defect amend (Item 4) could land separately as a `docs:` commit on `develop` since it's pure documentation.

---

## §9. Recommendation

Proceed to `propose` phase with:
- 4 items (Items 1, 2D, 3A, 4) locked into the proposal
- ~25 LOC total
- 4-6 atomic commits (1 per item + Spanish mirrors where required)
- Single PR on `develop` (well below the 400-line review budget per `openspec/config.yaml:58`)
- Zero CI gate impact (no production code paths touched; all changes are comment / config / DOM-hygiene)
- Strict TDD config-file exception applies to all 4 items

**Ready for proposal**: YES.
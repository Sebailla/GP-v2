# Technical Design — `slice-9-housekeeping`

> **Status**: draft · design phase
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` (HEAD `0b4534b`) → tracker `feat/slice-9-housekeeping` (off develop)
> **Artifact store**: hybrid · **Mode**: auto · **Delivery**: single PR (NOT auto-chain; ~37 net LOC across 6 files, well below the 400-line review budget per `openspec/config.yaml:58`)
> **Strict TDD**: ACTIVE — AGENTS.md §4 config / DOM-hygiene / docs exception applies to all 4 items (no production code path that requires a failing test); pipeline MUST stay green
> **Fix shape**: HYBRID 2D for Item 2 (component hardening + test mock hardening); 3A for Item 3 (`.gitignore` + `git rm --cached`); amend (with "Superseded by") for Item 4
> **Author**: SDD orchestrator → `sdd-design` executor (model `MiniMax-M3`)
> **Date**: 2026-07-14
> **Inputs read**: `proposal.md` (Engram `#2408`, 57 LOC, 4-item housekeeping bundle), `spec.md` (Engram `#2409`, 239 LOC, 7 goals, 11 requirements, 7 scenarios, 25 ACs), `explore.md` (Engram `#2407`, 349 LOC, root-cause investigation per item), `apps/web/__tests__/setup.ts` (105 lines; stale JSDoc at L32-33 + current JSDoc at L84-89; `clearMocks: true` reference at L100), `apps/web/components/auth/SessionList.tsx` (154 lines; unguarded error render at L60), `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (813 lines; `mockSessionsApi` at L717-734 + 500 mock at L724-727 + `/500/i` test at L758), `apps/web/vitest.config.ts` (121 lines; top-level `pool: "forks"` / `maxWorkers: 1` / `isolate: false` at L62-64 confirmed), `.gitignore` (52 lines; no `next-env.d.ts` entry), `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` (584 lines; R3 at L115-127, Q3 at L471-475, AC8 at L399), `openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/design.md` (456 lines, format precedent), `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` (145 lines, Spanish translation style reference)
> **Resolution of spec open questions**: Q1 (HYBRID 2D) / Q2 (BOTH `.gitignore` + `git rm --cached`) / Q3 (PRESERVE original R3 + "Superseded by") / Q4 (bundle ES mirror into Item 4 commit) / Q5 (no `setup.ts` ES mirror — `.ts` not `.md`) — ALL resolved in spec §11; this design does not re-litigate them.

---

## 1. Goals ↔ Technical approach mapping

| Goal | Spec anchor | Technical approach |
|------|-------------|--------------------|
| **G1** — `apps/web/__tests__/setup.ts` JSDoc at L32-33 references CURRENT vitest.config.ts L62-64 + drops `singleFork: true` | §3 G1, R1, R2 | Drop the 2 stale lines (`pool: "forks" + singleFork: true to apps/web/vitest.config.ts (lines 54-63)`); replace with 3 lines that point at the post-`fix-vitest-4-deprecation` shape (`pool: "forks" + maxWorkers: 1 + isolate: false` at L62-64) per the migration guide. Pure JSDoc, no code change. The newer L84-89 block already correctly describes the post-migration shape and is left untouched. |
| **G2** — `apps/web/components/auth/SessionList.tsx` L60 hardened against empty `statusText` | §3 G2, R3 | Replace `${res.status} ${res.statusText}` with a guarded template literal `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`. Production path (non-empty `statusText`) renders byte-identically to the current implementation; the test-mock path (empty `statusText`) now emits `<span>500</span>` instead of `<span>500 </span>`. |
| **G3** — `apps/web/__tests__/components/transactions/state-coverage.test.tsx` 500 mock carries `statusText: "Internal Server Error"` | §3 G3, R4 | Add ONE field (`statusText: "Internal Server Error"`) to the `ResponseInit` object at L724-727 inside the `mockSessionsApi` helper. Mirrors the real NestJS `InternalServerErrorException` response shape so future contributors see the full pattern. |
| **G4** — `apps/web/next-env.d.ts` gitignored + untracked | §3 G4, R5, R6 | (a) Append `apps/web/next-env.d.ts` (with the 1-line upstream-guidance comment) to `.gitignore` near the existing `apps/web/.next/` ignore. (b) Run `git rm --cached apps/web/next-env.d.ts`. The file remains in the working tree (Next.js auto-regenerates it on every `next build` / `next dev`); `git ls-files apps/web/next-env.d.ts` returns empty post-commit. |
| **G5** — Archived `fix-ci-env-propagation/spec.md` amended at R3 + Q3 + AC8; original R3 preserved verbatim under "Superseded by" | §3 G5, R7 | Edit 3 regions of the archived spec: (a) R3 (L115-127): rewrite to mandate a PR-body breadcrumb instead of an in-file `//` JSON breadcrumb; keep the original R3 text verbatim under a "Superseded by" blockquote that documents the RFC 8259 §2 violation + the AC10 strict-JSON conflict + the apply-phase's correct decision. (b) Q3 (L471-475): rewrite the rationale to reflect the PR-body breadcrumb decision. (c) AC8 (L399): rewrite to verify the PR body contains the breadcrumb, not the `turbo.json` source lines. |
| **G6** — Initial ES mirror at `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md`; CJK-clean | §3 G6, R8 | Hand-translate the amended English spec into Spanish (literal technical translation per `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md`); `perl -ne 'print if /\p{Han}/'` MUST return empty output. Shipped in the SAME atomic commit as the English amend per AGENTS.md §13. |
| **G7** — All CI gates green post-change | §3 G7, R9 | Run `pnpm turbo run test bdd lint typecheck build` post-change; verify exit 0 with the preserved baseline: 22/22 apps/api tests, 145/145 apps/web tests, 43/43 BDD scenarios, all 4 GitHub Actions jobs (`Static analysis`, `Build`, `Unit + integration`, `BDD (Cucumber)`) report `success`. `pnpm lint:fixtures` exits 0 (no new boundary-rule violations). |

---

## 2. File-by-file diffs

### File 1 — `apps/web/__tests__/setup.ts` (EDIT, JSDoc refresh at L32-33)

This is JSDoc-only. The 2-line stale text at L32-33 referencing vitest 3's nested `poolOptions.forks.singleFork` shape (now-removed in Vitest 4) is replaced with a 3-line reference to the current Vitest 4 top-level triple. No runtime / type / test behavior changes.

#### Current state (setup.ts L30-44, the stale paragraph)

```ts
 * Without the stub, the 15/25 scenarios in
 * `apps/web/__tests__/components/transactions/state-coverage.test.tsx`
 * that render `TransactionsList` (via `RowEditMenu`),
 * `CreateTransactionForm`, or `EditTransactionForm` throw at render,
 * the partial fiber stays mounted across tests, and V8 heap grows to
 * ~4 GB before the worker is OOM-killed after ~4 minutes (slice-8
 * verify Gate 3, Engram `#2278`).
 *
 * Slice 7 PR-7 (`36386e1`) added `pool: "forks"` +
 * `singleFork: true` to `apps/web/vitest.config.ts` (lines 54-63).
 * That workaround changed WHEN the worker OOM fires, not WHETHER —
 * it does NOT address the `useRouter()` invariant. This global mock
 * is the root-cause fix; both coexist.
 *
 * The mock lives at the suite's single setup entry so every test
```

#### Final state (L30-46, the corrected paragraph)

```ts
 * Without the stub, the 15/25 scenarios in
 * `apps/web/__tests__/components/transactions/state-coverage.test.tsx`
 * that render `TransactionsList` (via `RowEditMenu`),
 * `CreateTransactionForm`, or `EditTransactionForm` throw at render,
 * the partial fiber stays mounted across tests, and V8 heap grows to
 * ~4 GB before the worker is OOM-killed after ~4 minutes (slice-8
 * verify Gate 3, Engram `#2278`).
 *
 * Slice 7 PR-7 (`36386e1`) added the serialized-fork worker-pool
 * workaround to `apps/web/vitest.config.ts` (now at lines 62-64
 * after `fix-vitest-4-deprecation` / PR #69 — `pool: "forks"`
 * + `maxWorkers: 1` + `isolate: false` per the Vitest 4
 * `poolOptions.forks.singleFork` removal
 * https://vitest.dev/guide/migration#pool-rework).
 * That workaround changed WHEN the worker OOM fires, not WHETHER —
 * it does NOT address the `useRouter()` invariant. This global mock
 * is the root-cause fix; both coexist.
 *
 * The mock lives at the suite's single setup entry so every test
```

#### Diff hunk

```diff
@@ apps/web/__tests__/setup.ts L32-33 @@
- * Slice 7 PR-7 (`36386e1`) added `pool: "forks"` +
- * `singleFork: true` to `apps/web/vitest.config.ts` (lines 54-63).
+ * Slice 7 PR-7 (`36386e1`) added the serialized-fork worker-pool
+ * workaround to `apps/web/vitest.config.ts` (now at lines 62-64
+ * after `fix-vitest-4-deprecation` / PR #69 — `pool: "forks"`
+ * + `maxWorkers: 1` + `isolate: false` per the Vitest 4
+ * `poolOptions.forks.singleFork` removal
+ * https://vitest.dev/guide/migration#pool-rework).
  * That workaround changed WHEN the worker OOM fires, not WHETHER —
```

#### Diff summary

- Drop 2 lines: the now-stale `pool: "forks" + singleFork: true to apps/web/vitest.config.ts (lines 54-63)` block.
- Add 5 lines: the corrected reference pointing at the post-`fix-vitest-4-deprecation` shape at L62-64, naming the Vitest 4 migration guide anchor (`#pool-rework`), and naming the upstream PR (`PR #69`) that performed the migration.
- File LOC: 105 → 108 (+3 net; +5 / −2 raw).
- The NEWER JSDoc block at L84-89 (which already correctly describes the post-migration shape per `fix-vitest-4-deprecation`'s own vitest.config.ts refresh) is unchanged.
- `clearMocks: true` reference at L100 (and its `vitest.config.ts:38` anchor) is unchanged.

#### Verification

| Gate | Command | Expected |
|------|---------|----------|
| G1.1: JSDoc references L62-64 | `grep -n "62-64\|62–64" apps/web/__tests__/setup.ts` | ≥1 hit (the corrected L32-37 reference) |
| G1.2: `singleFork` dropped | `grep -n "singleFork" apps/web/__tests__/setup.ts` | 0 hits |
| G1.3: migration guide cited | `grep -n "vitest.dev/guide/migration" apps/web/__tests__/setup.ts` | ≥1 hit (matches the newer L84-89 block too) |
| G1.4: 145/145 PASS preserved | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)` |

---

### File 2 — `apps/web/components/auth/SessionList.tsx` (EDIT, guarded error render at L60)

The unguarded template literal at L60 produces a trailing whitespace character when `res.statusText` is the empty string (the test mock pattern: `mockResolvedValue({ status: 500, body: "server fail" } as unknown as Response)` without `statusText`). The guarded form preserves the current rendering for non-empty `statusText` (production path: NestJS `InternalServerErrorException` returns `statusText: "Internal Server Error"`, so the visible behavior for production callers is unchanged) and suppresses the trailing whitespace for the empty case.

#### Current state (SessionList.tsx L57-63, the unguarded block)

```tsx
      if (!res.ok) {
        setState({
          kind: "error",
          error: `${res.status} ${res.statusText}`,
        });
        return;
      }
```

#### Final state (L57-63, the guarded block)

```tsx
      if (!res.ok) {
        setState({
          kind: "error",
          error: `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`,
        });
        return;
      }
```

#### Diff hunk

```diff
@@ apps/web/components/auth/SessionList.tsx L60 @@
-          error: `${res.status} ${res.statusText}`,
+          error: `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`,
```

#### Diff summary

- Single-line replace at L60. The template-literal expression swaps from "always emit ` ${res.statusText}`" to "emit ` ${res.statusText}` ONLY when `statusText` is truthy, else emit empty string".
- File LOC: 154 → 154 (net 0; raw change is 2 chars added + 1 char dropped in the literal, but easier to count as 1-line replace with +1/−1 of the surrounding expression).
- Production behavior: byte-identical for non-empty `statusText` (the canonical NestJS responses set `statusText` to `"Internal Server Error"`, `"Bad Request"`, `"Unauthorized"`, etc.).
- Test behavior: the existing `SessionList 5-state coverage > error: shows the load error` test at L758 (`expect(await screen.findByText(/500/i)).toBeInTheDocument()`) still PASSES — the regex `/500/i` matches `"500"` and still matches the (now-deprecated) `"500 Internal Server Error"` after the companion mock-hardening File 3 lands. The DOM hardening is observable as `<span>500</span>` vs the prior `<span>500 </span>`.

#### Verification

| Gate | Command | Expected |
|------|---------|----------|
| G2.1: guarded render shape | `grep -n "statusText ?" apps/web/components/auth/SessionList.tsx` | 1 hit |
| G2.2: 25/25 state-coverage preserved | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25 PASS / 0 FAIL |
| G2.3: 145/145 web preserved | `pnpm --filter web test` | exit 0; 145 PASS |
| G2.4: production-render-helper test (Item 2 + Item 3 in concert) | run with `statusText: "Internal Server Error"` mock → renders `"500 Internal Server Error"`; run without → renders `"500"` | both observable on DOM tree |

---

### File 3 — `apps/web/__tests__/components/transactions/state-coverage.test.tsx` (EDIT, 500 mock `statusText` at L724-727)

The `mockSessionsApi` helper at L717-734 builds a `Response` via `new Response(JSON.stringify(opts.body), { status: opts.status, headers: { "Content-Type": "application/json" } })`. The current call from the `error: shows the load error` scenario at L752 (`mockSessionsApi({ status: 500, body: "server fail" })`) leaves `statusText` unset, so the constructed `Response` defaults to `statusText: ""`. The hardening ADDDS a `statusText` field whose default — when the caller does not pass one — mirrors the real NestJS `InternalServerErrorException` shape (`statusText: "Internal Server Error"`).

#### Current state (state-coverage.test.tsx L717-734, the helper + L751-760, the 500 scenario)

```tsx
  function mockSessionsApi(opts: { status: number; body: unknown; delay?: number }): void {
    const fetchSpy = vi.fn().mockImplementation(
      async () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                new Response(JSON.stringify(opts.body), {
                  status: opts.status,
                  headers: { "Content-Type": "application/json" },
                }),
              ),
            opts.delay ?? 0,
          );
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);
  }
  …
  it("error: shows the load error", async () => {
    mockSessionsApi({ status: 500, body: "server fail" });
    render(
      <Providers>
        <SessionList />
      </Providers>,
    );
    expect(await screen.findByText(/500/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
```

#### Final state (L717-740, the helper now carries a default `statusText`)

```tsx
  function mockSessionsApi(opts: { status: number; body: unknown; delay?: number; statusText?: string }): void {
    const fetchSpy = vi.fn().mockImplementation(
      async () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                new Response(JSON.stringify(opts.body), {
                  status: opts.status,
                  statusText: opts.statusText ?? "Internal Server Error",
                  headers: { "Content-Type": "application/json" },
                }),
              ),
            opts.delay ?? 0,
          );
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);
  }
  …
  it("error: shows the load error", async () => {
    mockSessionsApi({ status: 500, body: "server fail" });
    render(
      <Providers>
        <SessionList />
      </Providers>,
    );
    expect(await screen.findByText(/500/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
```

#### Diff hunk

```diff
@@ apps/web/__tests__/components/transactions/state-coverage.test.tsx L717-734 @@
-  function mockSessionsApi(opts: { status: number; body: unknown; delay?: number }): void {
+  function mockSessionsApi(opts: { status: number; body: unknown; delay?: number; statusText?: string }): void {
     const fetchSpy = vi.fn().mockImplementation(
       async () =>
         new Promise((resolve) => {
           setTimeout(
             () =>
               resolve(
                 new Response(JSON.stringify(opts.body), {
                   status: opts.status,
+                  statusText: opts.statusText ?? "Internal Server Error",
                   headers: { "Content-Type": "application/json" },
                 }),
               ),
             opts.delay ?? 0,
           );
         }),
     );
     vi.stubGlobal("fetch", fetchSpy);
   }
```

#### Diff summary

- Extend `mockSessionsApi` parameter shape with an OPTIONAL `statusText` (preserves backward compatibility for the `loading` / `empty` / `success` scenarios that don't need it).
- Default the missing `statusText` to `"Internal Server Error"` — the NestJS `InternalServerErrorException` reason phrase.
- File LOC: 813 → 815 (+2 net; +3 / −1 raw).
- The `error: shows the load error` scenario at L751-760 is UNCHANGED (still calls `mockSessionsApi({ status: 500, body: "server fail" })`); it now exercises the helper's new default-`statusText` code path automatically.
- The DOM assertion `/500/i` still matches — the rendered text is now `"500 Internal Server Error"` (production-shaped, no trailing whitespace thanks to the File 2 guarded render).

#### Verification

| Gate | Command | Expected |
|------|---------|----------|
| G3.1: helper has statusText default | `grep -n 'opts.statusText ?? "Internal Server Error"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | 1 hit |
| G3.2: helper signature has statusText? | `grep -n "statusText?: string" apps/web/__tests__/components/transactions/state-coverage.test.tsx` | 1 hit |
| G3.3: 25/25 state-coverage preserved | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25 PASS / 0 FAIL |
| G3.4: 145/145 web preserved | `pnpm --filter web test` | exit 0; 145 PASS |

---

### File 4 — `.gitignore` (EDIT, append `apps/web/next-env.d.ts`)

Add the pattern at the end of the existing `# Build outputs` section (L11, alongside `apps/web/.next/`'s next-door neighbor). The accompanying comment matches the canonical Next.js upstream guidance.

#### Current state (`.gitignore` L8-14, the `# Build outputs` block)

```gitignore
# Build outputs
dist/
.next/
.turbo/
out/
build/
```

#### Final state (L8-16, with the new entry)

```gitignore
# Build outputs
dist/
.next/
.turbo/
out/
build/

# Next.js 16 auto-generated types file (auto-regenerated on every build)
apps/web/next-env.d.ts
```

#### Diff hunk

```diff
@@ .gitignore @@
   build/
+
+ # Next.js 16 auto-generated types file (auto-regenerated on every build)
+ apps/web/next-env.d.ts
```

#### Diff summary

- Append a 2-line block: 1 comment + 1 pattern.
- File LOC: 52 → 54 (+2 net).
- Position: at the end of `# Build outputs` (near `apps/web/.next/`; per next-env.d.ts's role as the Next.js types-file peer of `.next/`).

#### Verification

| Gate | Command | Expected |
|------|---------|----------|
| G4.1: pattern present | `grep "next-env.d.ts" .gitignore` | 1 match |
| G4.2: file untracked post-`git rm --cached` | `git ls-files apps/web/next-env.d.ts` | empty |
| G4.3: file present in working tree | `ls apps/web/next-env.d.ts` | file path returns (Next.js auto-regen leaves it present locally) |

#### Companion sub-step (commit 3, §4): `git rm --cached apps/web/next-env.d.ts`

Standalone command run as part of the same commit (not a separate file). Produces a one-time commit with the file appearing as `D` (deleted) in `git diff --stat` but the file remains in the working tree (the `--cached` flag removes it from the index only). Future contributors who clone fresh, run `pnpm install`, and execute `pnpm dev` will see the file regenerated by Next.js as expected.

---

### File 5 — `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` (EDIT, amend R3 + Q3 + AC8)

Three regions. The amend keeps the ORIGINAL R3 text verbatim under a `> **Superseded by**` blockquote so future spec authors reading the archive see both the historical defect AND its resolution. Pure documentation correction; zero code impact.

#### Region A — R3 (L115-127)

**Before** (the spec-defect R3, verbatim):

```text
### R3 — The `env` field is `env`, NOT `passThroughEnv`; JSDoc-style breadcrumb above the `bdd.env` field

The new field added per R1 and R2 MUST be the JSON key `"env"`. It MUST NOT be `"passThroughEnv"`, `"globalEnv"`, or `"globalPassThroughEnv"`. A JSDoc-style breadcrumb of exactly **2 lines** MUST appear immediately above the `bdd` task's new `env` field (JSON does not support comments natively; the convention per `fix-bdd-ci-zod-resolution` is a JSDoc-style block), with content equivalent to:

```text
// turbo strict-mode strips undeclared env vars; declare all vars @core/config validates.
// must stay in sync with .github/workflows/ci.yml BDD job env block.
```

The breadcrumb documents (a) **why** the array exists (Turbo strict-mode strips undeclared vars) and (b) **what the contract is** (must stay in sync with the CI env block). Same style MUST apply to the `build` task's `env` field — the rationale paragraph above the `bdd` task covers both, and reviewers reading the diff see the comment once with no need to repeat it verbatim on both tasks.

The `env` vs `passThroughEnv` distinction is: `env` participates in the cache key (values invalidate the cache), `passThroughEnv` does NOT participate in the cache key (values reach the process environment but stale builds may be served). Since `@core/config`'s validation runs at module load and the build outputs (Next.js page-data bundles) embed env-derived values, env changes MUST invalidate the cache — `env` is the only correct field name.
```

**After** (the amended R3, with the original preserved verbatim under `> **Superseded by**`):

```markdown
### R3 — The `env` field is `env`, NOT `passThroughEnv`; breadcrumb lives in the PR body, not in `turbo.json`

The new field added per R1 and R2 MUST be the JSON key `"env"`. It MUST NOT be `"passThroughEnv"`, `"globalEnv"`, or `"globalPassThroughEnv"`. The PR description on the merged commit MUST include a 2-line breadcrumb explaining (a) **why** the array exists (Turbo strict-mode strips undeclared env vars) and (b) **what the contract is** (must stay in sync with the `.github/workflows/ci.yml` BDD job env block). Same breadcrumb MUST apply for both the `build` task's `env` field and the `bdd` task's `env` field — one PR-body paragraph carries the rationale that covers both tasks, no need to repeat verbatim on each field.

The breadcrumb MUST NOT be embedded in `turbo.json` itself. JSON does not support comments (RFC 8259 §2 — "Whitespace is allowed … no additional syntax is allowed"), and placing `//` tokens inside the file would (a) break the AC10 strict-JSON invariant (`cat turbo.json | python3 -m json.tool` exits 0) and (b) break any future tool that parses the file with a strict JSON parser (e.g., `node -e "JSON.parse(require('fs').readFileSync('turbo.json'))"`). The repository convention for documents that cannot carry inline comments is to put the breadcrumb in the artifact that lives with them — for a closed PR whose `turbo.json` is already merged, that artifact is the PR body / squash commit message, not the file content.

The `env` vs `passThroughEnv` distinction is: `env` participates in the cache key (values invalidate the cache), `passThroughEnv` does NOT participate in the cache key (values reach the process environment but stale builds may be served). Since `@core/config`'s validation runs at module load and the build outputs (Next.js page-data bundles) embed env-derived values, env changes MUST invalidate the cache — `env` is the only correct field name.

> **Superseded by** the apply-phase decision documented in PR #65's squash commit message. The original R3 text mandated a JSDoc-style breadcrumb of two `//` lines inside `turbo.json` (content: `// turbo strict-mode strips undeclared env vars; …` followed by `// must stay in sync with .github/workflows/ci.yml BDD job env block.`). The original R3 was INTERNALLY CONTRADICTORY with AC10 (`cat turbo.json | python3 -m json.tool` exits 0 — i.e., the file MUST be strict-JSON-parseable, which `//` comments invalidate). The apply phase correctly honored AC10 (strict-JSON file with 7 valid `env` keys) and skipped the `//` breadcrumb, carrying the rationale in the PR body instead. The breadcrumb is now mandated in §5 R3 (above) as a PR-body paragraph. The historical R3 text is preserved here for traceability; future spec authors reading this archive SHOULD NOT copy the `//`-in-JSON pattern. The same defect was identified in `fix-bdd-ci-zod-resolution` (not amended in this PR; deferred to a future housekeeping change per `slice-9-housekeeping/explore.md` §2).
>
> Original R3 text, verbatim (lines 115–127 of the original spec, preserved for traceability):
>
> ```text
> R3 (original) — The `env` field is `env`, NOT `passThroughEnv`; JSDoc-style breadcrumb above the `bdd.env` field. The new field added per R1 and R2 MUST be the JSON key `"env"`. It MUST NOT be `"passThroughEnv"`, `"globalEnv"`, or `"globalPassThroughEnv"`. A JSDoc-style breadcrumb of exactly 2 lines MUST appear immediately above the `bdd` task's new `env` field (JSON does not support comments natively; the convention per `fix-bdd-ci-zod-resolution` is a JSDoc-style block), with content equivalent to:
> // turbo strict-mode strips undeclared env vars; declare all vars @core/config validates.
> // must stay in sync with .github/workflows/ci.yml BDD job env block.
> ```
```

#### Region B — Q3 (L471-475)

**Before** (the spec-defect Q3, verbatim):

```text
### Q3 — JSDoc-style breadcrumb in `turbo.json`

**Resolved**: **YES** — R3 mandates a 2-line JSDoc-style breadcrumb immediately above the `bdd` task's `env` field.

Rationale: JSON does not support comments natively; the convention in this repo per `fix-bdd-ci-zod-resolution` is a JSDoc-style block placed inside the `.json` file as consecutive `//` lines. The breadcrumb must (a) name the root cause ("Turbo strict-mode strips undeclared env vars") so future contributors don't wonder why an `env` array was added if they haven't read the explore brief; and (b) name the contract source (`.github/workflows/ci.yml` BDD job env block) so the next contributor who adds an env var to CI is prompted to mirror it in `turbo.json`. Two lines is the minimum sufficient content; longer prose bloats the diff without adding reviewer value.
```

**After**:

```markdown
### Q3 — Breadcrumb location (in `turbo.json` vs in PR body)

**Resolved**: **PR BODY** — R3 (as amended) mandates a 2-line breadcrumb in the PR description / squash commit message, NOT inside `turbo.json`.

Rationale: the original "in `turbo.json` as `//` lines" decision was INTERNALLY CONTRADICTORY with the spec's own AC10 (`cat turbo.json | python3 -m json.tool` exits 0 — strict-JSON invariant). The apply phase correctly honored AC10 over R3 and carried the rationale in PR #65's squash commit body. Future spec authors should be aware that JSON does not support comments (RFC 8259 §2); a breadcrumb inside a JSON file breaks any strict-JSON parser (Python's `json.tool`, `JSON.parse`, jq with default settings, etc.). For documents that cannot carry inline comments, the breadcrumb belongs in the artifact that lives with them — typically the squash commit message / PR body for a closed PR whose `.json` file is already merged, or a sibling `.md` file for an open spec. The breadcrumb must (a) name the root cause ("Turbo strict-mode strips undeclared env vars") so future contributors don't wonder why an `env` array was added if they haven't read the explore brief, and (b) name the contract source (`.github/workflows/ci.yml` BDD job env block) so the next contributor who adds an env var to CI is prompted to mirror it in `turbo.json`. Two lines is the minimum sufficient content; longer prose bloats the diff without adding reviewer value. The same defect pattern was identified in the predecessor `fix-bdd-ci-zod-resolution` archive and is flagged as future housekeeping per `slice-9-housekeeping/explore.md` §2 (not in scope for slice-9).
```

#### Region C — AC8 (L399)

**Before**:

```text
| AC8 | JSDoc-style breadcrumb above `bdd.env` | inspect `turbo.json` source lines: 2 consecutive `//` lines naming "turbo strict-mode" (or equivalent) and "ci.yml" (or equivalent), immediately above the `"env"` key inside the `bdd` task block |
```

**After**:

```text
| AC8 | PR description carries the 2-line breadcrumb | the merged PR's description (or squash commit message) contains 2 consecutive lines naming "turbo strict-mode" (or equivalent) and "ci.yml" (or equivalent), explaining the rationale for the `bdd.env` and `build.env` arrays. The breadcrumb is NOT required to live inside `turbo.json` (JSON does not support comments per RFC 8259 §2). |
```

#### Diff summary

- 3 regions edited: R3 (L115-127, ~13 LOC + 13-LOC original-text blockquote), Q3 (L471-475, ~9 LOC), AC8 (L399, 1 row rewrite).
- File LOC: 584 → ~597 (+13 net; +25 / −12 raw).
- Zero code impact; archived spec is documentation.
- Total LOC delta from this amend is consistent with proposal Affected Files (`+15 / −10` with rounding).

---

### File 6 — `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` (NEW — initial ES mirror)

The mirror is the initial Spanish translation of the amended archived spec (English File 5). Hand-translated following the convention in `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` (technical Spanish, literal translation, established English terms preserved where they are industry-standard: ADR, commit, PR, JSDoc, JSON, Zod, `turbo.json`, etc.). The CJK-drift detector (`perl -ne 'print if /\p{Han}/'`) MUST return empty output post-creation.

#### File skeleton

```markdown
# Especificación Delta — `fix-ci-env-propagation`

> **Cambio**: `fix-ci-env-propagation` · **Proyecto**: `gastos-personales-reference` (clave `gp-v2`)
> **Rama**: `develop` → tracker `feat/fix-ci-env-propagation`
> **Modo**: auto · **Almacén de artefactos**: hybrid (Engram + OpenSpec) · **Entrega**: PR único (NO auto-chain)
> **Fecha**: 2026-07-14
> **Forma del fix**: **A** — declaración `env` en `turbo.json`. 2 arreglos `env` (~14 LOC, 7 vars × 2 tareas) + breadcrumb de 2 líneas en el cuerpo del PR.
> **PR único**: 1 archivo en alcance, 14 LOC netas
> **Propuesta**: `openspec/changes/fix-ci-env-propagation/proposal.md` (Engram `#2343`)
> **Brief de exploración**: `openspec/changes/fix-ci-env-propagation/explore.md` (Engram `#2340`)

---

## 1. Encabezado

| Campo | Valor |
|-------|-------|
| Proyecto | `gastos-personales-reference` |
| Clave del proyecto | `gp-v2` |
| Rama | `feat/fix-ci-env-propagation` (cortada desde `develop`) |
| Fecha | 2026-07-14 |
| Autor | Orquestador SDD → `sdd-spec` (ejecutor · modelo `MiniMax-M3`) |
| Estado | draft · fase de especificación |
| Fuente | Propuesta Engram `#2343`; Exploración Engram `#2340` |
| Forma del fix | A (según propuesta §0 + §3) |
| Almacén de artefactos | hybrid (Engram + OpenSpec) |
| Estrategia de entrega | PR único — `auto-chain` NO disparado (14 LOC netas < presupuesto de revisión de 400 líneas) |
| TDD estricto | activo (AGENTS.md §4) — fix solo de configuración; no se requiere test RED (no se toca código de producción; los Tests 1–5 del brief de exploración SON la evidencia empírica RED→GREEN según explore §4) |

---

## 2. Intención

[El trabajo de CI del gate BDD en `develop` está roto… (mismo contenido que §2 en inglés, traducido literalmente al español)]

---

## 5. Requisitos funcionales

### R3 — El campo `env` es `env`, NO `passThroughEnv`; el breadcrumb vive en el cuerpo del PR, no en `turbo.json`

[Traducción literal de la versión enmendada en File 5, Region A]

> **Reemplazado por** la decisión de la fase de apply documentada en el mensaje del commit squash de PR #65. El texto original de R3… [traducción de la nota "Superseded by"]

### Q3 — Ubicación del breadcrumb (en `turbo.json` vs en el cuerpo del PR)

[Traducción literal de la versión enmendada en File 5, Region B]

### AC8 — La descripción del PR lleva el breadcrumb de 2 líneas

[Traducción literal de la versión enmendada en File 5, Region C]

---

## Cross-references

- **Propuesta**: `openspec/changes/fix-ci-env-propagation/proposal.md` (Engram `#2343`)
- **Brief de exploración**: `openspec/changes/fix-ci-env-propagation/explore.md` (Engram `#2340`)
- **Replica-de-huella del defecto original**: el R3 original de esta especificación queda preservado verbatim bajo el blockquote «Reemplazado por» arriba. El mismo defecto se identificó en `fix-bdd-ci-zod-resolution` (no enmendado en este PR; diferido a un cambio futuro de housekeeping según `slice-9-housekeeping/explore.md` §2).
```

#### Translation rules (per `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` style)

- **Spanish** for prose, explanation, headings, narrative text.
- **English** kept (NOT translated) for: code (`turbo.json`, `next-env.d.ts`, JSDoc blocks), file paths, library/framework names (Zod, Vitest, Next.js, React, Prisma, NestJS), tool names (pnpm, turbo, ESLint), bracket/id terms in spec terminology (ADR, PR, RED/GREEN, breadcrumb, RFC, R3, Q3, AC8), URLs, JSDoc-style comment markers (`//`).
- **Established technical terms** stay in English only when industry-standard usage dictates (`commit`, `merge`, `branch`, `build`, `deploy`, `cache`, `token`, `env vars` → may go either way; prefer `"env vars"` or `"variables de entorno"` — be consistent within the doc).
- **CJK-character check mandatory**: every newly-created file under `Documents-es/` MUST be CJK-clean (`perl -ne 'print if /\p{Han}/' <file>.md` empty).

#### Diff summary

- File: NEW. ~340 LOC of hand-translated Spanish content (per the source spec's 584-line English original); the translation adds some length due to Spanish multi-word nominals (e.g., "almacén de artefactos" vs "artifact store") but trims others.
- Shipped in the SAME atomic commit as the English File 5 amend per AGENTS.md §13.

#### Verification

| Gate | Command | Expected |
|------|---------|----------|
| G6.1: file exists | `ls Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | file path returns |
| G6.2: CJK-clean | `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | empty output |
| G6.3: contains amended R3 | `grep -n "Reemplazado por\|Superseded by" Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | ≥1 hit |

---

## 3. Execution plan (step-by-step)

Per AGENTS.md §4, strict TDD requires RED → GREEN → TRIANGULATE → REFACTOR. The strict-TDD config / DOM-hygiene / docs exception (spec §0 header) applies to all 4 items. The verification gates provide the empirical RED→GREEN evidence.

1. **Edit File 2** (`apps/web/components/auth/SessionList.tsx` L60): swap to the guarded template literal. **Item FIRST** because Item 3 (test mock hardening) tests against this rendering; if the component edit is made second, the test would render `"500 "` for one commit and `"500 Internal Server Error"` after both land — single-commit sequence is cleanest.

2. **Edit File 3** (`apps/web/__tests__/components/transactions/state-coverage.test.tsx` L717-734): extend `mockSessionsApi` signature with optional `statusText`; add `statusText: opts.statusText ?? "Internal Server Error"` to the `ResponseInit`. The `error: shows the load error` scenario at L751-760 is UNCHANGED (calls `mockSessionsApi({ status: 500, body: "server fail" })` and now picks up the default).

3. **GREEN: verify 145/145 web tests**: `pnpm --filter web test` MUST exit 0 with `Tests 145 passed (145)`. The `error: shows the load error` test at L758 still matches `/500/i` (the rendered text is now `"500 Internal Server Error"` which contains `500` as a substring).

4. **GREEN: verify 25/25 state-coverage**: `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` MUST exit 0 with 25 PASS / 0 FAIL.

5. **Edit File 1** (`apps/web/__tests__/setup.ts` L32-37): replace the 2 stale JSDoc lines with 5 corrected lines pointing at `apps/web/vitest.config.ts` L62-64 + the Vitest 4 migration-guide URL. Pure JSDoc; no runtime change.

6. **GREEN: verify `singleFork` dropped**: `grep -n "singleFork" apps/web/__tests__/setup.ts` MUST return empty. The 145/145 baseline holds (the vitest runtime config is unchanged; only the JSDoc was refreshed).

7. **Edit File 4** (`.gitignore` L13-14): append the 2-line `apps/web/next-env.d.ts` block.

8. **`git rm --cached apps/web/next-env.d.ts`**: untrack the file. Working tree retains the file (Next.js auto-regen on next `next build`).

9. **GREEN: verify untracked + gitignore**: `git ls-files apps/web/next-env.d.ts` MUST return empty; `grep "next-env.d.ts" .gitignore` MUST return 1 match; `ls apps/web/next-env.d.ts` MUST return the file path (still in working tree).

10. **Edit File 5** (`openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md`): amend R3 (L115-127) + Q3 (L471-475) + AC8 (L399) per Region A / B / C in §2 File 5 above.

11. **Create File 6** (`Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md`): hand-translate the amended English spec per §2 File 6 above.

12. **GREEN: verify all 4 items + ES mirror**:
    - `grep -n "Superseded by" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` shows ≥1 hit (original R3 preserved).
    - `grep -n "// turbo\|// must stay in sync" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty (the broken `//` JSDoc is gone).
    - `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty (ES mirror CJK-clean).

13. **Verify scope discipline**: `git diff origin/develop..HEAD --name-only` MUST list exactly 6 files: `apps/web/__tests__/setup.ts`, `apps/web/components/auth/SessionList.tsx`, `apps/web/__tests__/components/transactions/state-coverage.test.tsx`, `.gitignore`, `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md`, `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md`. No `turbo.json`, no `.github/workflows/ci.yml`, no `package.json`, no `pnpm-lock.yaml`, no `tsconfig.json`.

14. **Run full turbo pipeline**: `pnpm turbo run test bdd lint typecheck build` MUST exit 0 with the preserved baseline (22/22 + 145/145 + 43/43 + 4/4 jobs green). `pnpm lint:fixtures` exits 0.

15. **Verify working tree clean (modulo `.codegraph/`)**: `git status --short` returns empty.

16. **Commit** files atomically per §4 below.

---

## 4. Atomic commits

Single PR, 5 atomic commits (work-unit aligned; per AGENTS.md §5 each commit reverses cleanly with `git revert <sha>`):

1. **`refactor(web): SessionList guard against empty statusText + state-coverage test mock realistic statusText`** — Files 2 + 3 (component hardening + test mock hardening) lands as ONE atomic commit because they are the HYBRID 2D shape from explore.md; the test mock carries the regression guard while the component carries the root-cause fix. Both lines are required for the test to exercise the production-shape rendering end-to-end. Subject ≤72 chars per AGENTS.md §6.

2. **`docs(test): apps/web/__tests__/setup.ts refresh JSDoc line refs to vitest.config.ts L62-64`** — File 1 (JSDoc-only). Pure documentation; no test count impact; the 145/145 baseline is invariant.

3. **`chore(git): untrack apps/web/next-env.d.ts (Next.js 16 auto-regen file)`** — File 4 (.gitignore) + the `git rm --cached` of the existing tracked copy. One commit because the `.gitignore` rule alone does not untrack the existing file; the `git rm --cached` would re-track if the .gitignore rule were missing. Both lines are co-required for the file to be permanently untracked.

4. **`docs(archive): fix-ci-env-propagation spec amend R3 + Q3 + AC8 to mandate PR-body breadcrumb; ship initial ES mirror`** — Files 5 + 6 (English amend + Spanish initial mirror). One commit per AGENTS.md §13 (the ES mirror MUST ship in the same atomic commit as the English source-of-truth edit). The Spanish mirror is the initial creation of a missing artifact (per explore.md §1.4 + spec §11 Q4).

5. **`chore(verify): pnpm turbo run test bdd lint typecheck build exits 0`** — verification marker citing the captured gate counts (22/22 + 145/145 + 43/43 + 4/4 jobs). Splits the GREEN observation from the GREEN-causing changes so a reviewer can verify each independently. Body cites the 7 spec commands from §5 below. Optional but gives the slice-9 close-out a paper trail; can be folded into commit 1 if the reviewer prefers fewer commits.

**Commit hygiene** (AGENTS.md §6):

- No `Co-Authored-By` / no AI attribution in any commit message.
- Subjects ≤72 chars, imperative, no trailing period. Bodies explain WHY, not WHAT.
- Type vocabulary: `refactor(web):` (commit 1 — component change), `docs(test):` (commit 2 — JSDoc), `chore(git):` (commit 3 — gitignore + untrack), `docs(archive):` (commit 4 — spec amend + ES mirror), `chore(verify):` (commit 5 — verification marker).
- Bodies cite the spec requirement IDs they satisfy.

---

## 5. Test execution plan

| Spec scenario | Test command | Expected outcome |
|---------------|--------------|------------------|
| **G1.1** (JSDoc references L62-64) | `grep -n "62-64\|62–64" apps/web/__tests__/setup.ts` | ≥1 hit (the corrected L32-37 reference) |
| **G1.2** (`singleFork` dropped) | `grep -n "singleFork" apps/web/__tests__/setup.ts` | empty |
| **G1.3** (Vitest 4 guide cited) | `grep -n "vitest.dev/guide/migration" apps/web/__tests__/setup.ts` | ≥1 hit |
| **G2.1** (SessionList guarded render) | `grep -n "statusText ?" apps/web/components/auth/SessionList.tsx` | 1 hit |
| **G2.2** (25/25 state-coverage) | `pnpm --filter web test __tests__/components/transactions/state-coverage.test.tsx` | exit 0; 25 PASS / 0 FAIL |
| **G3.1** (mock has statusText default) | `grep -n 'opts.statusText ?? "Internal Server Error"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` | 1 hit |
| **G3.2** (mock signature has statusText?) | `grep -n "statusText?: string" apps/web/__tests__/components/transactions/state-coverage.test.tsx` | 1 hit |
| **G4.1** (gitignore updated) | `grep "next-env.d.ts" .gitignore` | 1 match |
| **G4.2** (file untracked) | `git ls-files apps/web/next-env.d.ts` | empty |
| **G4.3** (file present in working tree) | `ls apps/web/next-env.d.ts` | file path returns |
| **G5.1** (R3 mandate changed to PR-body) | `grep -n "// turbo\|// must stay in sync" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | empty |
| **G5.2** (original R3 preserved verbatim) | `grep -n "Superseded by\|Reemplazado por" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | ≥1 hit |
| **G5.3** (Q3 rationales PR-body breadcrumb) | `grep -n "PR BODY\|cuerpo del PR" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | ≥1 hit |
| **G5.4** (AC8 verifies PR body) | `grep -n "merged PR's description\|merged commit message\|descripción del PR\|mensaje del commit" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | ≥1 hit |
| **G6.1** (ES mirror exists) | `ls Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | file path returns |
| **G6.2** (ES mirror CJK-clean) | `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` | empty |
| **G7.1** (145/145 web tests) | `pnpm --filter web test` | exit 0; `Tests 145 passed (145)` |
| **G7.2** (22/22 api tests) | `pnpm --filter api test` | exit 0; 22 PASS |
| **G7.3** (43/43 BDD) | `pnpm turbo run bdd` | exit 0; 43 scenarios |
| **G7.4** (lint + typecheck + build) | `pnpm turbo run lint typecheck build` | exit 0 |
| **G7.5** (boundary fixtures) | `pnpm lint:fixtures` | exit 0 |

### Manual / non-CI verification steps

- `pnpm --filter web test --reporter=verbose` to enumerate each of the 145 scenarios and confirm no `.skip` / `.todo` decoration was inadvertently introduced.
- Manual DOM inspection (via the slice-8 verify dashboard or a quick `console.log` in the `SessionList` error branch) to confirm that:
  - With the new mock (`statusText` default `"Internal Server Error"`), the rendered DOM is `<span>500 Internal Server Error</span>` (production-shaped).
  - With `statusText: ""` explicitly, the rendered DOM is `<span>500</span>` (no trailing whitespace).
- `git log --oneline origin/develop..HEAD` to confirm the 5 work-unit commits.
- `git log origin/develop..HEAD --pretty=format:"%B" | grep -i "co-authored-by"` MUST return empty.
- `git diff origin/develop..HEAD --name-only` MUST list exactly 6 files (per scope discipline §3 step 13).
- `pnpm exec turbo --root=. run --dry=json bdd` to confirm the turbo schema still validates (Item 4 amend does NOT change any turbo.json shape; purely a documentation correction).
- `cat turbo.json | python3 -m json.tool` to confirm the strict-JSON invariant preserved (Item 4 amend does NOT introduce `//` into turbo.json).

---

## 6. Risks + mitigations (concrete)

| ID | Risk | Mitigation |
|----|------|------------|
| **R1** (proposal §7) | `setup.ts` JSDoc rewrite drops attribution context (the historic reference to commit `36386e1` and the slice-7 PR-7 lineage). | The replacement JSDoc retains the `Slice 7 PR-7 (36386e1)` attribution (it explicitly says `now at lines 62-64 after fix-vitest-4-deprecation / PR #69`) so the commit + PR lineage is still in the comment for archaeologists. The `singleFork: true` mention is dropped because it describes a Vitest 3 nested-config shape that no longer exists; the equivalent Vitest 4 shape is named inline. |
| **R2** (proposal §7) | `SessionList` hardening regresses the API response rendering (a real NestJS server returns `statusText: "Internal Server Error"` so `${res.status} ${res.statusText}` currently produces `"500 Internal Server Error"`; the hardening changes that path to `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`). | The guarded form is BYTE-IDENTICAL for non-empty `statusText` (the canonical NestJS path). The only behavioral difference is when `statusText` is the empty string — and the prod code path does not exercise that case. The 145/145 baseline + the `error: shows the load error` test at L758 (which now uses the realistic `statusText: "Internal Server Error"` mock) is the regression surface. |
| **R3** (proposal §7) | The 500-mock edit breaks the existing setup (the `mockResolvedValue(new Response(...))` shape changes if we forget to keep the `body`, `headers`, or `delay` fields). | The diff is ADDITIVE only: a new optional `statusText?: string` parameter + a new `statusText: opts.statusText ?? "Internal Server Error"` line inside the `ResponseInit`. The `body`, `headers`, and `delay` paths are UNCHANGED. The `error: shows the load error` scenario call site (`mockSessionsApi({ status: 500, body: "server fail" })`) is UNCHANGED and inherits the new default. |
| **R4** (proposal §7) | `git rm --cached apps/web/next-env.d.ts` is a one-way action (the file disappears from the index immediately). | The file is auto-regenerated by Next.js on every `next build` / `next dev`. The `.gitignore` rule added in File 4 prevents future tracking. `git checkout apps/web/next-env.d.ts` from an older commit restores the tracked copy; `git revert <commit-sha>` re-tracks it via the inverse operation. The verification gate `git ls-files apps/web/next-env.d.ts` is the post-commit observation. |
| **R5** (proposal §7) | The archived `fix-ci-env-propagation` spec amend breaks traceability (future spec authors can't tell which version is canonical). | The original R3 text is preserved verbatim under a `> **Superseded by**` blockquote (Region A in §2 File 5). The blockquote documents the defect, the AC10 contradiction, the apply-phase's correct decision, and links to the slice-9 explore brief §2 for the cross-cutting rationale. The amend is an IN-PLACE correction (not a replacement). |
| **R6** (proposal §7) | The ES mirror drifts from the English amend (auto-translation tool introduces CJK characters or unsupported terminology). | The mirror is HAND-TRANSLATED (not auto-translated) by following the convention in `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md`. Both files ship in the SAME atomic commit per AGENTS.md §13. The `perl -ne 'print if /\p{Han}/'` CJK-drift check is a verification gate. |

---

## 7. Out of scope

Restated from proposal §2 / spec §10 / AGENTS.md §11. The following are explicitly NOT touched by this PR:

1. Production logic changes; new features; new tests (other than the Item 2 mock hardening, which is a 1-line addition to the existing `mockSessionsApi` helper).
2. Migration of the analogous `//` JSON defect in `openspec/changes/archive/2026-07-14-fix-bdd-ci-zod-resolution/spec.md` (flagged by `explore.md` §2 as a future housekeeping candidate; deferred to a separate `slice-10` or future housekeeping change).
3. Consolidation of the duplicated JSDoc pool-related blocks in `apps/web/__tests__/setup.ts` (the L84-89 newer block already correctly describes the post-migration shape; the L32-33 / L84-89 duplication is a follow-up cleanup, NOT in scope for this PR).
4. Vitest version bump (stays at `4.1.9`); changes to `apps/web/vitest.config.ts` (Item 1 is a JSDoc-only correction; the config shape is already correct after `fix-vitest-4-deprecation`).
5. Changes to `turbo.json` (Item 4 amend is a documentation correction to the archived spec, not a `turbo.json` edit); changes to `.github/workflows/ci.yml`; changes to `package.json` / `pnpm-lock.yaml`; changes to `.env*` files.
6. Spanish mirror of `apps/web/__tests__/setup.ts` (Item 1 touches a `.ts` file; AGENTS.md §13 mandates mirrors only for English `.md` artifacts under `openspec/` and `docs/`).
7. Migration of `gastos-personales/` to the vertical-slicing model (the playbook ships here; the migration runs in a separate change per AGENTS.md §11).
8. New boundary-plugin fixtures; new ESLint rule implementations; new BDD scenarios; new e2e tests; new Playwright coverage.
9. Editing `apps/api/**` (controllers, services, Prisma schema); editing `libs/core/**` or `libs/features/**` source; editing `.next/` or any auto-regen artifact other than `apps/web/next-env.d.ts` (the only auto-regen artifact in scope).
10. Coverage gate enforcement at CI.
11. Anything from AGENTS.md §11 (i18n beyond en/es, Sentry, API rate-limiting, OAuth providers beyond Google, production hardening, observability, audit log UI).
12. Touching any `openspec/changes/{fix-bdd-tsx-node22,fix-bdd-ci-zod-resolution}/**` file — those are closed-and-archived siblings; this PR is not a "walk the whole archive and fix all defects" sweep.
13. Touching any other archived spec file (e.g., the `fix-web-vitest-crash` / `fix-state-coverage-drift` / `fix-api-nestjs-di` archives).
14. Editing `apps/web/__tests__/setup.ts` beyond the L32-37 JSDoc (the L84-89 newer block is correct and stays unchanged; the L100 `clearMocks: true` reference is unchanged).
15. Adding coverage at CI (60% lines/branches/functions/statements per `openspec/config.yaml`; declared but **NOT enforced** as a CI gate in this slice).

---

## 8. Open questions for tasks phase

**None.** All 5 questions deferred from the proposal are resolved in the spec (§11):

- Q1 (Item 2: HYBRID 2D vs single-shape) → resolved: HYBRID 2D (File 2 + File 3).
- Q2 (Item 3: gitignore+untrack vs just one) → resolved: BOTH (File 4 + `git rm --cached`).
- Q3 (Item 4: preserve R3 vs replace) → resolved: PRESERVE (Region A blockquote).
- Q4 (Item 4: bundle ES mirror into same commit) → resolved: YES (File 6 bundled with File 5 in commit 4).
- Q5 (Item 1: ES mirror needed) → resolved: NO (`.ts` not `.md`).

---

## 9. Validation criteria for `sdd-verify`

`sdd-verify` will check post-merge:

| # | Criterion | Pass condition |
|---|-----------|----------------|
| 1 | `apps/web/__tests__/setup.ts` references `vitest.config.ts` L62-64 | `grep -n "62-64\|62–64" apps/web/__tests__/setup.ts` returns ≥1 hit |
| 2 | `setup.ts` no longer mentions `singleFork` | `grep -n "singleFork" apps/web/__tests__/setup.ts` returns empty |
| 3 | `setup.ts` cites Vitest 4 migration guide | `grep -n "vitest.dev/guide/migration" apps/web/__tests__/setup.ts` returns ≥1 hit |
| 4 | `SessionList` L60 is guarded | `grep -n "statusText ?" apps/web/components/auth/SessionList.tsx` returns 1 hit |
| 5 | `mockSessionsApi` carries default `statusText` | `grep -n 'opts.statusText ?? "Internal Server Error"' apps/web/__tests__/components/transactions/state-coverage.test.tsx` returns 1 hit |
| 6 | `.gitignore` updated | `grep "next-env.d.ts" .gitignore` returns 1 match |
| 7 | `apps/web/next-env.d.ts` untracked | `git ls-files apps/web/next-env.d.ts` returns empty |
| 8 | `apps/web/next-env.d.ts` present in working tree | `ls apps/web/next-env.d.ts` returns the file path |
| 9 | Archived spec R3 amended to PR-body breadcrumb | `grep -n "// turbo\|// must stay in sync" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty |
| 10 | Archived spec original R3 preserved verbatim | `grep -n "Superseded by" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns 1 hit |
| 11 | Archived spec Q3 rationale updated | `grep -n "PR BODY" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns ≥1 hit |
| 12 | Archived spec AC8 verifies PR body | `grep -n "PR description\|merged commit message" openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns ≥1 hit |
| 13 | ES mirror exists | `ls Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns the file path |
| 14 | ES mirror CJK-clean | `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns empty |
| 15 | ES mirror contains amended R3 marker | `grep -n "Reemplazado por" Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` returns ≥1 hit |
| 16 | `pnpm --filter web test` 145/145 | exit 0; `Tests 145 passed (145)` |
| 17 | `pnpm --filter api test` 22/22 | exit 0; 22 PASS |
| 18 | `pnpm turbo run bdd` 43/43 | exit 0; 43 scenarios |
| 19 | `pnpm turbo run build lint typecheck test` exits 0 | exit 0 |
| 20 | `pnpm lint:fixtures` exits 0 | exit 0 |
| 21 | `turbo.json` strict-JSON invariant preserved | `cat turbo.json \| python3 -m json.tool` exits 0 |
| 22 | GitHub Actions: Static analysis / Build / Unit + integration / BDD all green | GitHub Actions UI shows 4/4 jobs green on the new PR |
| 23 | Working tree clean | `git status --short` returns empty (modulo `.codegraph/` untracked) |
| 24 | Scope discipline | `git diff origin/develop..HEAD --name-only` lists exactly 6 files: `setup.ts`, `SessionList.tsx`, `state-coverage.test.tsx`, `.gitignore`, `archived spec.md`, `ES mirror`; NO `turbo.json`, NO `.github/workflows/ci.yml`, NO `package.json`, NO `pnpm-lock.yaml`, NO `tsconfig.json` |
| 25 | 5 atomic commits | `git log --oneline origin/develop..HEAD` shows exactly 5 commits |
| 26 | No `Co-Authored-By` in any commit | `git log origin/develop..HEAD --pretty=format:"%B" \| grep -i "co-authored-by"` returns empty |
| 27 | Conventional Commits format | `git log origin/develop..HEAD --pretty=%s` shows subjects matching `^(docs\|chore\|refactor\|test)\([a-z-]+\): .+` each ≤72 chars |
| 28 | PR base branch is `develop` | the PR's `base` ref is `develop`, NOT `main` |
| 29 | PR description cites the 4-item enumeration | the PR body references the 4 items from `explore.md` §3 and links to the explore brief |
| 30 | `apps/web/vitest.config.ts` unchanged | `git diff origin/develop..HEAD --name-only \| grep vitest.config` returns empty |

---

## 10. Traceability

### Spec requirement → Design section

| Spec requirement | Design section |
|------------------|----------------|
| R1 (JSDoc references L62-64) | §2 File 1 |
| R2 (JSDoc drops `singleFork`) | §2 File 1 |
| R3 (SessionList guarded render) | §2 File 2 |
| R4 (mock has realistic `statusText`) | §2 File 3 |
| R5 (`.gitignore` updated) | §2 File 4 |
| R6 (`git rm --cached` untracks file) | §2 File 4 + §3 step 8 |
| R7 (archived spec R3 + Q3 + AC8 amended; original preserved) | §2 File 5 (Regions A/B/C) |
| R8 (ES mirror exists + CJK-clean) | §2 File 6 |
| R9 (all CI gates green) | §3 steps 3-4, 6, 9, 12-14 + §5 + §9 |
| R10 (working tree clean) | §3 step 15 + §9 row 23 |
| R11 (PR description cites 4-item enumeration) | §4 commit body + §9 row 29 |

### Goal → Spec scenario → Design section

| Goal | Spec scenario | Design section |
|------|---------------|----------------|
| G1 (setup.ts JSDoc refresh) | G1.1 (JSDoc ref) + G1.2 (`singleFork` dropped) | §2 File 1 + §5 G1.1-G1.3 + §9 rows 1-3 |
| G2 (SessionList DOM hardening) | G2.1 (DOM no trailing space) + G2.2 (production unchanged) | §2 File 2 + §5 G2.1-G2.2 + §9 row 4 |
| G3 (test mock realistic `statusText`) | G3.1 (mock has `statusText`) | §2 File 3 + §5 G3.1-G3.2 + §9 row 5 |
| G4 (next-env.d.ts gitignored + untracked) | G4.1 (gitignore) + G4.2 (file untracked + working-tree present) | §2 File 4 + §3 step 8 + §5 G4.1-G4.3 + §9 rows 6-8 |
| G5 (archived spec R3 + Q3 + AC8 amended; original preserved) | G5.1 (R3 amended) + G5.2 (Q3 updated) + G5.3 (AC8 verifies PR body) | §2 File 5 (Regions A/B/C) + §5 G5.1-G5.4 + §9 rows 9-12 |
| G6 (ES mirror initial + CJK-clean) | G6.1 (mirror exists) + G6.2 (CJK-clean) + G6.3 (mirror carries amended R3) | §2 File 6 + §5 G6.1-G6.3 + §9 rows 13-15 |
| G7 (CI gates green) | G7.1 (145/145 web) + G7.2 (22/22 api) + G7.3 (43/43 BDD) + G7.4 (lint/typecheck/build exit 0) + G7.5 (lint:fixtures exit 0) | §3 step 14 + §5 G7.1-G7.5 + §9 rows 16-22 |

### Risk ↔ Requirement mitigation

| Risk (proposal §7) | Mitigated by |
|--------------------|--------------|
| R1 (setup.ts drops context) | §2 File 1 retains `Slice 7 PR-7 (36386e1)` attribution + names `fix-vitest-4-deprecation / PR #69` + cites Vitest 4 migration guide URL — the lineage is still in the comment |
| R2 (SessionList regresses api) | §2 File 2 guarded form is byte-identical for non-empty `statusText`; §5 G2.2 25/25 state-coverage as regression surface; File 3 mock hardening mirrors the production-shape response |
| R3 (mock edit breaks setup) | §2 File 3 is ADDITIVE only (new optional `statusText?` parameter + new line in `ResponseInit`); the `error:` scenario call site is UNCHANGED |
| R4 (`git rm --cached` is one-way) | §2 File 4 `.gitignore` rule + companion `git rm --cached` commit; file remains in working tree; `git ls-files apps/web/next-env.d.ts` is the verification |
| R5 (amend breaks traceability) | §2 File 5 preserves ORIGINAL R3 verbatim under `> **Superseded by**` blockquote with the historical defect + the AC10 contradiction + the apply-phase's correct decision + the cross-link to slice-9 explore brief |
| R6 (ES mirror drift) | File 6 hand-translated (not auto-translated) following the `0011-shared-as-workspace-packages.md` Spanish translation convention; both files ship in the SAME atomic commit per AGENTS.md §13; CJK-drift detector is a verification gate |

---

## 11. Threat matrix

> Per `sdd-design/SKILL.md` §2a: applicability-driven. If the design changes routing, shell commands, subprocesses, VCS/PR automation, executable-file classification, or process integration, load `references/threat-matrix.md` and include its matrix.

**N/A** — this design does NOT change routing, shell commands, subprocesses, VCS/PR automation, executable-file classification, or process integration.

The boundary evaluation:

| Boundary | Applicable? | Reason |
|----------|-------------|--------|
| Routing | N/A | No new HTTP routes, no route parameters, no middleware. Items 1-4 touch JSDoc, a guarded component expression, a test mock field, a `.gitignore` line, a spec amend, and a Spanish translation. |
| Shell commands | N/A | No new shell invocations. The verification commands in §5 are existing shell utilities (`grep`, `find`, `perl`, `pnpm`, `git`); they are exercised only as gates, not introduced by the change. |
| Subprocesses | N/A | No new subprocesses. The change does not introduce background processes, cron jobs, or worker pools. |
| VCS/PR automation | N/A | The change uses standard `git rm --cached` (1 invocation, idempotent); no new VCS automation. PR description conventions follow AGENTS.md §6 (subject ≤72 chars, no AI attribution), R11 (PR body cites Engram #2406 enumeration). |
| Executable-file classification | N/A | No new executable files. The `.gitignore` change makes `apps/web/next-env.d.ts` non-tracked but the file was already text-only and TypeScript-compiler-only — no executable classification concern. |
| Process integration | N/A | No new process integrations. Items 1-3 do not start, stop, or signal processes. Item 4 is pure documentation. |

Boundary classification: **pure documentation / DOM-hygiene / config change**, no production behavior change, no executable-file classification change, no VCS automation beyond `git rm --cached` (covered by AGENTS.md §5 atomic commit discipline, not by the threat matrix).

---

## 12. Migration / Rollout

**No migration required.** This is a documentation / DOM-hygiene / config housekeeping bundle with zero production behavior change. The component hardening in Item 2 is byte-identical for the production code path (non-empty `statusText`); the test mock hardening in Item 3 mirrors the production-shape response; the `.gitignore` change has zero functional impact on any CI runner. Rollout is the standard single-PR flow:

1. Cut `feat/slice-9-housekeeping` from `develop`.
2. Land the 5 atomic commits per §4.
3. Open a single PR against `develop`.
4. After review + CI green, merge (squash or merge commit; `git log origin/develop..HEAD --merges` ≤1 per AC25).
5. No feature flag, no phased rollout, no database migration, no backwards-compat shim.

**Rollback plan** (mirror proposal §8):

- **Whole-change**: `git revert <merge-sha>` on `develop`. The 6 file edits revert to their pre-PR state. JSDoc, component, test mock, `.gitignore`, and archived spec return to baseline; the untracked file becomes re-tracked at the previous commit's blob. 145/145 + 22/22 + 43/43 + 25/25 baselines restored.
- **Per-commit rollback**:
  - Commit 1 (SessionList + mock hardening) — `git revert <sha>`. Component reverts to unguarded template literal; mock reverts to no-default-`statusText` helper. Tests still pass (the `/500/i` regex matches `"500 "` with trailing space).
  - Commit 2 (setup.ts JSDoc refresh) — `git revert <sha>`. JSDoc reverts to the stale reference; the comment is misleading but non-functional.
  - Commit 3 (gitignore + untrack) — `git revert <sha>`. The `.gitignore` rule disappears AND the file is re-tracked (because `git revert` undoes the `git rm --cached`). Working tree behavior returns to baseline (file tracked + always-regenerated-after-build dirt).
  - Commit 4 (spec amend + ES mirror) — `git revert <sha>`. Both archived files revert to the pre-amend state (original R3 mandate restored, original Spanish spec for the predecessor — wait, the ES mirror is NEW, so revert removes it; that's the desired rollback).
  - Commit 5 (verification marker) — optional revert; carries no executable code change.
- **Will NOT do**: force-push, rewrite history, touch `main`, modify any other `openspec/changes/{fix-bdd-*}/**` archive, or amend any historic commit.

---

## 13. Cross-references

- **Proposal**: `openspec/changes/slice-9-housekeeping/proposal.md` (Engram `#2408`, 57 LOC)
- **Spec**: `openspec/changes/slice-9-housekeeping/spec.md` (Engram `#2409`, 239 LOC; G1-G7, R1-R11, 7 scenarios, 25 ACs)
- **Explore brief**: `openspec/changes/slice-9-housekeeping/explore.md` (Engram `#2407`, 349 LOC; per-item root-cause investigation; flagged `fix-bdd-ci-zod-resolution` as future housekeeping candidate)
- **Upstream enumeration**: Engram `#2406` (4 items list; cited in PR description per R11)
- **Format precedent**: `openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/design.md` (456 lines, 13-section structure)
- **Spanish translation convention reference**: `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` (145 lines, hand-translated Spanish; established English-term preservation)
- **Files affected** (6 total):
  1. `apps/web/__tests__/setup.ts` L32-37 — JSDoc refresh (File 1)
  2. `apps/web/components/auth/SessionList.tsx` L60 — guarded error render (File 2)
  3. `apps/web/__tests__/components/transactions/state-coverage.test.tsx` L717-734 + L724-727 — `mockSessionsApi` default `statusText` (File 3)
  4. `.gitignore` L13-14 — append `apps/web/next-env.d.ts` (File 4)
  4a. `git rm --cached apps/web/next-env.d.ts` — untrack (§3 step 8)
  5. `openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` L115-127 + L471-475 + L399 — amend R3 + Q3 + AC8 (File 5)
  6. `Documents-es/openspec/changes/archive/2026-07-14-fix-ci-env-propagation/spec.md` — NEW (File 6)
- **Read-only references** (NOT modified):
  - `apps/web/vitest.config.ts` L62-64 — the post-`fix-vitest-4-deprecation` shape referenced by File 1
  - `openspec/changes/archive/2026-07-14-fix-vitest-4-deprecation/design.md` — format precedent
  - `Documents-es/docs/architecture/decisions/0011-shared-as-workspace-packages.md` — Spanish translation style reference
- **Predecessor commits NOT touched**:
  - `36386e1` (slice-7 PR-7 — happy-dom + vitest 4 worker-pool workaround; preserved unchanged)
  - `06eda80` (slice-9 — fix-vitest-4-deprecation config migration; preserved unchanged)
  - PR #69 squash (`ab8d0ce`) — fix-vitest-4-deprecation squash; preserved unchanged
  - PR #65 squash — fix-ci-env-propagation squash (the apply-phase whose `//` JSDoc defect this PR amends in archived spec)
- **Project conventions** (AGENTS.md):
  - §2 — branch model: `main` immutable, cut from `develop`
  - §4 — strict TDD: config / docs / DOM-hygiene exception applies to all 4 items
  - §5 — atomic commits: each commit reverses cleanly
  - §6 — Conventional Commits: no AI attribution, ≤72-char subjects
  - §7 — architectural boundaries: no new boundary rule; `pnpm lint:fixtures` exits 0
  - §8 — single source of truth: Spanish mirror is the canonical mirror of the English source-of-truth (initial creation in this PR)
  - §11 — out-of-scope list: not touched
  - §13 — Spanish mirror hard rule: bundled in same atomic commit

---

**Next phase**: `tasks` (`sdd-tasks` will break the 5 atomic commits into ordered RED-first sub-tasks with checkpoint gates per AGENTS.md §4 + §5).

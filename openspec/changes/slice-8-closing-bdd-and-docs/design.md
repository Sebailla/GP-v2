# Technical Design — `slice-8-closing-bdd-and-docs`

> **Status**: draft · design phase
> **Project**: `gastos-personales-reference` · **Branch**: `develop` (tracker `feat/slice-8-closing-bdd-and-docs`)
> **Artifact store**: hybrid · **Mode**: interactive · **Delivery**: `ask-on-risk` · **Chain**: `feature-branch-chain` · **Review budget**: 400 lines
> **Strict TDD**: active (AGENTS.md §4)
> **Author**: SDD orchestrator → `sdd-design` executor
> **Date**: 2026-07-12
> **Inputs read**: `proposal.md` (Engram #2226), `spec.md` (Engram #2228), `libs/features/transactions/docs/support/register.ts` (188 LOC, post-`a9b550d`), `libs/features/transactions/docs/__tests__/register.test.ts` (177 LOC), `libs/features/auth/docs/support/register.ts` (80 LOC, broken), `libs/features/auth/docs/step-defs/world.ts` (126 LOC), `libs/features/auth/docs/support/service-context.ts` (235 LOC), `libs/features/auth/server/{package.json,vitest.config.ts,tsconfig.json}`, `libs/features/transactions/server/vitest.config.ts`, `eslint.config.mjs` (66 LOC, no markdown parser wired), `tools/eslint-plugin-boundary/{index.cjs,rules/no-mojibake-in-docs.cjs,lib/cjk-detect.cjs,scripts/run-fixtures.mjs,__fixtures__/no-mojibake-in-docs/...}`, `.github/workflows/ci.yml` (196 LOC, lines 187-196 placeholder), `package.json` (root, devDeps list, no `@eslint/markdown`), `docs/architecture.md` (77 LOC stub), `openspec/changes/vertical-slicing-reference-scaffold/{design.md,tasks.md,proposal.md}`

---

## 1. Architecture overview

```
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │                        slice-8-closing-bdd-and-docs                          │
   │                                                                              │
   │   ┌────────────────────────┐       ┌─────────────────────────────────────┐    │
   │   │  8.1 auth BDD bridge   │       │       8.2 BDD CI gate               │    │
   │   │  fix (chained PR #1)   │──────▶│  .github/workflows/ci.yml (+30 LOC) │    │
   │   │                        │  dep  │                                     │    │
   │   │  libs/features/auth/   │       │  needs: [static, test] · postgres   │    │
   │   │  docs/support/register │       │  -service · pnpm turbo run bdd      │    │
   │   │  .ts (+ ~150 LOC)      │       │                                     │    │
   │   │  + docs/__tests__/     │       └─────────────────────────────────────┘    │
   │   │  register.test.ts      │                                                  │
   │   │  (NEW ~177 LOC)        │       ┌─────────────────────────────────────┐    │
   │   │  + vitest.config.ts    │       │   8.3 no-mojibake-in-docs wire      │    │
   │   │  include bump (+1 LOC) │       │  (chained PR #3, parallel with 8.2)│    │
   │   └────────────────────────┘       │                                     │    │
   │                                    │  eslint.config.mjs:                 │    │
   │   ┌────────────────────────────────│   - @eslint/markdown pin @ 8.0.3    │    │
   │   │  8.4 docs prose + scripts      │   - parser block for **/*.md        │    │
   │   │  (chained PR #4 + PR #5)      │   - rule block for Documents-es/…/  │    │
   │   │                                │   - '*.md'                           │    │
   │   │  PR-A: docs/architecture.md    │  run-fixtures.mjs:                   │    │
   │   │     + Documents-es/docs/…/…    │   - support multi-invalid fixture   │    │
   │   │     (~500 LOC + 500 mirror)    │                                     │    │
   │   │                                │  __fixtures__/…/secondCjkLine       │    │
   │   │  PR-B: docs/migration-         │   .invalid.md (NEW)                  │    │
   │   │  playbook.md (≥600 LOC) +      │                                     │    │
   │   │  7 scripts/migrate/*.sh +      └─────────────────────────────────────┘    │
   │   │  mirrors (≥600 LOC + 600 LOC)                                                │
   │   └─────────────────────────────────────────────────────────────────────────┘
   │                              ▲                                                 │
   │                              │ slice-7 chain evidence                         │
   │                              │ bb25aab (squash), a9b550d (bridge fix)          │
   └──────────────────────────────────────────────────────────────────────────────┘
```

Dependency graph: **8.1 must merge first** (8.2 runs `pnpm turbo run bdd`; if 8.1 is unmerged the gate would lock on timeouts). 8.3 has zero deps. 8.4 has zero deps. PR chain order: **PR #1 (8.1) → PR #2 (8.2) → PR #3 (8.3) || PR #4 (8.4-PR-A) + PR #5 (8.4-PR-B)** (8.3, PR-A, PR-B are parallelizable against the tracker branch after 8.1 lands).

---

## 2. Sub-slice 8.1 — Auth BDD bridge fix

### 2.1 Architecture decision: shared `buildWrapper` vs duplicate in auth slice

**Choice**: **DUPLICATE `buildWrapper`, `countStringPlaceholders`, `buildPattern`** into `libs/features/auth/docs/support/register.ts` (verbatim from `libs/features/transactions/docs/support/register.ts` lines 72-165), with the substitution table in §2.2 below. **DO NOT extract to a shared `@core/bdd-bridge` or similar.**

**Alternatives considered**:

| Option | Pro | Con | Verdict |
|---|---|---|---|
| **A. Duplicate** | (1) Zero cross-slice coupling; each slice owns its own bridge. (2) Per AGENTS.md §7 the boundary rules say no cross-module import; a shared bridge would still be cross-slice (auth+transactions). (3) Drift risk is low because cucumber 13's `userCodeRunner` API is stable across a 12-month horizon. | Drift risk long-term. | **CHOSEN** |
| B. Shared `libs/core/bdd-bridge/` | Single source of truth (DRY). | (1) Cross-slice shared dep violates the `no-cross-module-import` spirit unless placed in `@core/`; `@core/` is reserved for infrastructure per slice-1 design §3.4 / decision records. (2) Cucumber is a TEST concern; placing it in `@core/` would put test infra in production-imported code. (3) The transactions slice is already merged and stable — refactoring it to a shared bridge adds scope without benefit. | Rejected |
| C. Re-export from `@features/transactions/docs/support/register` | Prevents drift mechanically. | (1) Direct cross-slice import (`libs/features/auth/docs/support/register.ts → libs/features/transactions/docs/support/register`) — explicitly forbidden by `no-cross-module-import` boundary rule (slice-1 design §3.4 table line 316). (2) Couples a stable slice to a refactor in progress. | Rejected |

**Rationale (AGENTS.md §8 "single source of truth")**: AGENTS.md §8 names three SSoT concerns — Zod schemas, Prisma client, and cross-module side effects. The cucumber bridge factory is **not** one of those concerns; it is implementation detail of each slice's bridge file. AGENTS.md §7 says "Zod schema literals live only in `libs/features/<x>/shared/schemas/`" — by analogy, the bridge factory should live in `libs/features/<x>/docs/support/`. Each slice owns its bridge the way each feature owns its slices.

**Verbatim-port requirements** (MUST hold for any future bridge port):

1. The four strings `"[transactions/support/register]"` MUST become `"[auth/support/register]"` (3 occurrences: line 77, 107, and the 0-capture early-return path).
2. The `TxWorld` import (line 44) MUST become `AuthWorld` imported from `../step-defs/world.js`.
3. The `cast as unknown as new () => TxWorld` (line 128) MUST become `cast as unknown as new () => AuthWorld`.
4. The `this.inner` assertion (`(this as { inner: TxWorld } | undefined)?.inner`, line 75) MUST become `(this as { inner: AuthWorld } \| undefined)?.inner`.
5. `countStringPlaceholders` and `buildPattern` (lines 143-165) MUST be copied **byte-for-byte** — they are pure functions of `pattern: string`; do not refactor.

### 2.2 Auth `world.ts` + new `AuthWorldWrapper` — declared shape

**New class** in `libs/features/auth/docs/support/register.ts` (placed at the same position as the transactions wrapper, after `buildWrapper`):

```ts
setWorldConstructor(
  class AuthWorldWrapper {
    public readonly inner: AuthWorld = createAuthWorld();
  } as unknown as new () => AuthWorld,
);
```

This mirrors `libs/features/transactions/docs/support/register.ts` lines 125-129 — same shape, different name.

**Wrapper invocation contract** is verbatim from transactions: `stepFn(world.inner, String(cap_1), …, String(cap_N))`, `fn.length === N + 1`, world off `this.inner`, no Promise returned from sync body. See spec §8.1 lines 132-145.

**Slice imports** the bridge MUST add at line 24 area:

```ts
import { Given, When, Then, setWorldConstructor } from "@cucumber/cucumber";
import { stepDefinitions as authCommon } from "../step-defs/common.steps.js";
import { stepDefinitions as authRealm } from "../step-defs/realm.steps.js";
import { createAuthWorld, type AuthWorld } from "../step-defs/world.js";
```

### 2.3 Step-binding surface — verbatim

The bridge MUST publish every entry from `step-defs/common.steps.ts` (35 entries, verified by `grep -c '^\s\+keyword: "' libs/features/auth/docs/step-defs/common.steps.ts` = 35) and `step-defs/realm.steps.ts` (40 entries). **Total 75 step bindings.** Spec states 37+38=75; the actual count is 35+40=75. Design uses the verified count.

`ALL_BINDINGS = [...authCommon, ...authRealm]` MUST spread both arrays, matching transactions slice line 49.

### 2.4 RED test file — `libs/features/auth/docs/__tests__/register.test.ts`

**Mirror exactly** the transactions test (`libs/features/transactions/docs/__tests__/register.test.ts`, 177 LOC). Three required assertions per spec §8.1 lines 152-176:

1. **Wrapper arity + world off `.inner`**: register a 2-capture binding with `vi.fn()`. Invoke the registered wrapper with `thisArg = new AuthWorldWrapper()` and `argsArray = ["first", "second", callback]`. Assert `stepFn.mock.calls[0]` equals `[world.inner, "first", "second"]` (length exactly 3) and `callback` invoked once with no error. The "FakeWorld" type at the test file is `interface FakeWorld { readonly inner: AuthWorld }` (matching transactions test line 95's shape, retargeted to AuthWorld fields: just verify the world object identity).
2. **Capture-group regex**: assert `match[1]` === `'"alpha"'` and `match[2]` === `'"beta"'` when matching `'the value is "alpha" and "beta"'`. RED because the existing auth bridge at line 60 uses non-capturing `(?:"[^"]*"|[^ s"]+)` (missing the outer `((`).
3. **`setWorldConstructor` invoked at least once**: include `setWorldConstructor: vi.fn()` in the mocked module (transactions mock at line 62). Import `../support/register.js` then assert the spy was called once with a class whose prototype holds `.inner: AuthWorld`.

**Imports pattern** (vitest + mocked cucumber, exact port from transactions lines 48-87):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@cucumber/cucumber", () => {
  const given = vi.fn(); const when = vi.fn(); const thenFn = vi.fn();
  const setWorldConstructor = vi.fn();
  return {
    Given: (p: unknown, fn: unknown) => given(p, fn),
    When:   (p: unknown, fn: unknown) => when(p, fn),
    Then:   (p: unknown, fn: unknown) => thenFn(p, fn),
    setWorldConstructor: (fn: unknown) => setWorldConstructor(fn),
    __mocks__: { given, when, thenFn, setWorldConstructor },
  };
});
import { registerBinding } from "../support/register.js";
import * as cucumberMock from "@cucumber/cucumber";
```

### 2.5 Vitest discoverability — REQUIRED `vitest.config.ts` bump

**Discovery finding**: `libs/features/transactions/server/vitest.config.ts` (line 23) includes `"../docs/__tests__/**/*.test.ts"`. **`libs/features/auth/server/vitest.config.ts` does NOT** — its include is `["src/__tests__/**/*.test.ts", "../shared/schemas/__tests__/**/*.test.ts"]`. The new register test WILL NOT be discovered by `pnpm --filter @features/auth test` unless 8.1 adds the line.

**MUST ADD** to `libs/features/auth/server/vitest.config.ts` (3rd array entry, matching transactions):

```ts
include: [
  "src/__tests__/**/*.test.ts",
  "../shared/schemas/__tests__/**/*.test.ts",
  "../docs/__tests__/**/*.test.ts",  // NEW (8.1)
],
```

This is **one extra LOC** outside the spec's listed scope but mechanically required for the GREEN outcome (`pnpm --filter @features/auth test` exits 0 with 2 PASS). The orchestrator MUST treat this as in-scope for 8.1; calling it out so the orchestrator does not refuse to apply when 8.1's diff exceeds the spec's LOC estimate by a few lines.

### 2.6 Service-context separation (R1 mitigation, verified)

`libs/features/auth/docs/support/service-context.ts` (235 LOC) declares the **module-level singleton** `{ users: InMemoryUserRepository, authService: AuthService }` constructed once per bridge load. Per-scenario `AuthWorld` carries step-level assertions (`sessionCreated`, `lastErrorMessage`); the singleton carries cross-scenario persistence (the in-memory user map).

**The 8.1 bridge MUST NOT alter `service-context.ts`** (spec §8.1 lines 82-90 + 180-188). The two-tier design is intentional and the bridge is the indirection that lets cucumber's `thisArg` carry a fresh `AuthWorldWrapper` per scenario while the singleton lives on.

### 2.7 MUST NOT touch — declared

- `libs/features/auth/docs/cucumber.mjs`
- `libs/features/auth/docs/support/env-bootstrap.js`
- `libs/features/auth/docs/support/service-context.ts`
- `*.feature` under `libs/features/auth/docs/`
- `*.steps.ts` under `libs/features/auth/docs/step-defs/`
- `libs/features/transactions/docs/support/register.ts` (canonical source)

### 2.8 Outcome gates

- `pnpm --filter @features/auth bdd` exits 0 with **18/18 PASS** in <2s (verified scenario count via `grep -c "Scenario:" libs/features/auth/docs/*.feature \| awk`).
- `pnpm --filter @features/auth test` exits 0 with **2/2 PASS** on `register.test.ts`.
- `pnpm --filter @features/transactions bdd` continues to pass **25/25** (no regression).

---

## 3. Sub-slice 8.2 — BDD as a CI gate

### 3.1 YAML shape — declared

Append a 5th job at the end of `.github/workflows/ci.yml` (after the `build` job at lines 143-185 and after the BDD/e2e placeholder comment at lines 187-196). The 5th job MUST replace the placeholder comment; the comment block MUST be removed.

```yaml
  # ---- 5. BDD (Cucumber) gate ------------------------------------------------
  # Runs `pnpm turbo run bdd` against a Postgres service. Gates every PR to
  # develop/main on a passing BDD suite; surfaces cucumber log on failure
  # through GitHub's default step-log retention (90 days).
  #
  # The e2e Playwright job is intentionally deferred to a later slice
  # (per spec §8.2 line 295-298 + proposal §4.5). Adding only BDD here
  # keeps the chain narrow and reviewable.
  bdd:
    name: BDD (Cucumber)
    runs-on: ubuntu-latest
    needs: [static, test]
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: gastos_reference_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/gastos_reference_test
      NEXTAUTH_SECRET: ci-only-do-not-use-in-prod
      NEXTAUTH_URL: http://localhost:3000
      WEB_ORIGIN: http://localhost:3000
      API_URL: http://localhost:3001
      PORT: 3001
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.10.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22.13.0, cache: pnpm }

      - run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        env: { DATABASE_URL: postgresql://placeholder.localhost/db }
        run: pnpm --filter @core/database exec prisma generate

      - name: Apply Prisma migrations
        env: { DATABASE_URL: postgresql://postgres:postgres@localhost:5432/gastos_reference_test }
        run: pnpm --filter @core/database exec prisma migrate deploy

      - name: Run BDD
        run: pnpm turbo run bdd
```

### 3.2 Reuse vs copy decisions

**Service block** (Postgres, ports, healthcheck): COPIED verbatim from the existing `test` job at `.github/workflows/ci.yml` lines 85-101. **NOT refactored to a YAML anchor** — the spec's review-budget guard (400 LOC, 1 PR) cannot absorb YAML-anchor extraction work, and YAML anchors in GitHub Actions have well-known edge cases (sensitive env, action `with: { }` resolution). The duplicate is 17 LOC; the alternative (`anchors: &pg-service` + re-use) saves 8 LOC and adds 2 LOC of anchor metadata — net 6 LOC saved, not worth the obfuscation cost.

**Env vars**: COPIED verbatim from `test` job lines 102-109. Same rationale (no YAML anchor, accepting the 7-line duplicate).

**Action versions** (`pnpm/action-setup@v4` `version: 11.10.0`, `setup-node@v4` `node-version: 22.13.0`): COPIED verbatim from the three existing jobs (lines 32-39, 116-122, 151-156). Per slice-1 §5 "Stack churn" mitigation; pinning is mandatory.

### 3.3 MUST NOT do

- No `actions/upload-artifact` step for cucumber logs — GitHub retains step logs for 90 days by default. Adding an artifact step spends a 1-MB+ artifact budget on data GitHub already keeps.
- No `continue-on-error: true` on the `Run BDD` step. The whole point of this job is to **fail the PR** on bridge regression.
- NO narrowing of the `on:` trigger set (already covers `pull_request: [develop, main]` and `push: [develop, main]` at lines 4-7). The new job MUST inherit those.
- NO Playwright e2e job in this slice (deferred per spec §8.2 line 295-298; the slice-1 placeholder comment at lines 187-196 explicitly mentions both, but 8.2 ships **only** BDD).

### 3.4 Trigger semantics

The job inherits the workflow-level `on:` (lines 4-7). It runs on every `pull_request` to `develop`/`main` AND every `push` to `develop`/`main`. The `concurrency` block (lines 11-13) cancels duplicate runs on the same ref — applies transitively.

---

## 4. Sub-slice 8.3 — `@eslint/markdown` wire + activate `no-mojibake-in-docs`

### 4.1 `@eslint/markdown` pin — declared

Add to the **root** `package.json` `devDependencies` (NOT `@features/auth` or `@features/transactions`, NOT `tools/eslint-plugin-boundary` — `eslint.config.mjs` is loaded by the root eslint process, which resolves via the root):

```json
"@eslint/markdown": "8.0.3"
```

**Exact pin** (no caret, no tilde) per spec §8.3 line 329-336. Per slice-1 §5 "Stack churn" mitigation: the parser has shipped breaking parser-API changes between minor versions historically.

### 4.2 `eslint.config.mjs` changes — declared

**Block 1 — parser block** (insert after the existing TypeScript block at lines 42-52, before the global-rules block at lines 56-59):

```js
import markdownParser from "@eslint/markdown";

{
  files: ["**/*.md"],
  languageOptions: {
    parser: markdownParser,
    parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
},
```

The `boundary` import at line 13 is REUSED (single plugin import — spec §8.3 line 384-385); do NOT add a second plugin import.

**Block 2 — rule-application block** (insert after line 59, before `client-only` at line 62):

```js
{
  files: ["Documents-es/**/*.md"],
  plugins: { "@gpr/boundary": boundary },
  rules: { "@gpr/boundary/no-mojibake-in-docs": "error" },
},
```

**`boundary.configs.recommended`** at line 53-59 includes `no-mojibake-in-docs` (per `tools/eslint-plugin-boundary/index.cjs` line 53) but is restricted to `**/*.{ts,tsx,js,mjs,cjs}` (line 57). The rule fires on EVERY file in that glob — not just `.ts` — because `no-mojibake-in-docs.cjs` has no path filter (it only uses a `Program` visitor and pulls `sourceCode.getText()`). On `.ts`/`.tsx` files the rule would erroneously fire on Spanish-prose comments in `.ts` files. **The current ESLint config DOES NOT lint `*.md` files at all** (no markdown parser). After 8.3's wiring, the Block 2 NEW `Documents-es/**/*.md` glob restricts the rule to the mirror tree.

**Block 1 (parser)** MUST come before any rule block that matches `.md` files — ESLint flat config applies parser first.

### 4.3 Fixture triangulation file — `secondCjkLine.invalid.md`

**Path**: `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md` (sibling of existing `invalid.md`).

**Content** (~6 LOC, with a single CJK character on a non-first line):

```md
# Spanish mirror - secondCjkLine

Este documento prueba que el linter detecta CJK
independientemente de la linea donde aparezca.

Linea intencional con un solo ideograma disperso: U+6F22
```

Where `U+6F22` is the design-time notation for the CJK ideograph at codepoint 0x6F22; the apply phase MUST substitute the actual codepoint when writing the fixture file (so `findCjkInText` reports the hit). This catches a regression class where the runner/rule only scans the first N chars or first line. The CJK character MUST end up on the **last** line (line 5), forcing full-document scan.

### 4.4 Runner update — `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs`

**Two discovery findings** block the spec's scenario "secondCjkLine fixture firing" verbatim:

1. **Line 62 glob**: `glob(\`**/${variant}*.${ext}\`)` matches BOTH `invalid.md` AND `secondCjkLine.invalid.md`. Lines 141-145 throw an error when more than one invalid is matched.

2. **Lines 162-232** treat invalid as "exactly one fixture → ≥1 errors". A second invalid fixture path-matches the same `**/invalid*.md` glob and gets rejected.

**The runner MUST be updated** to support a "named invalids" model for the `no-mojibake-in-docs` rule. Two acceptable implementations:

- **Option A — preferred**: change the rule-loop (lines 115-235) to allow `invalids.length >= 1` for `no-mojibake-in-docs` specifically (other rules keep `length === 1`). Add a per-rule boolean `allowMultipleInvalids` to the `RULES` array (lines 47-53).

- **Option B**: rename the runner's glob from `**/invalid*.md` to `**/invalid.md` (exact match only) for the `no-mojibake-in-docs` rule, and add a SEPARATE loop pattern that iterates all `invalid*.md` files when the rule opts in. Higher diff churn.

**Choose Option A** — single boolean addition, lowest LOC. Implementation sketch:

```js
const RULES = [
  "no-client-server-import",
  "no-prisma-outside-core",
  "no-schemas-outside-shared",
  "no-cross-module-import",
  { name: "no-mojibake-in-docs", allowMultipleInvalids: true },
];
```

Then at the current "exactly one invalid" assertion (lines 137-145), branch on `rule.allowMultipleInvalids`:

```js
if (!rule.allowMultipleInvalids && invalids.length > 1) {
  throw new Error(`ambiguous invalid fixture …`);
}
```

For `no-mojibake-in-docs`, iterates ALL `invalid*.md` files. Each file's `detectCjkInMdFixture` call must report `>=1` errors. The runner header comment (lines 1-30) MUST be updated to document the multi-invalid semantics for `.md` rules only.

### 4.5 Production-tree CJK scan (spec §8.3 line 387-399)

The runner MUST add a target-expansion step after the per-rule fixture loop: glob `Documents-es/**/*.md` (the existing ignore at `eslint.config.mjs` line 30 excludes `__fixtures__/**`, so the glob sees only production mirrors), call `findCjkInText` on each file's content, and exit 1 if any production mirror contains CJK. Implementation sketch (insertion after line 235, before the "Fixture summary" log at line 238):

```js
console.log("");
console.log("Production Documents-es/**/*.md CJK scan:");
const prodMirrorFiles = [];
for await (const entry of glob("Documents-es/**/*.md", { cwd: repoRoot })) {
  prodMirrorFiles.push(resolve(repoRoot, entry));
}
let prodViolations = 0;
for (const file of prodMirrorFiles) {
  const text = readFileSync(file, "utf8");
  const hits = findCjkInText(text);
  if (hits.length === 0) {
    console.log(`PASS  ${relative(repoRoot, file)}  (clean)`);
    passed += 1;
  } else {
    console.error(`FAIL  ${relative(repoRoot, file)}  (${hits.length} CJK codepoints)`);
    failures.push({
      rule: "no-mojibake-in-docs",
      fixture: relative(repoRoot, file),
      reason: `production mirror contains ${hits.length} CJK codepoints`,
    });
    failed += 1;
    prodViolations += 1;
  }
}
```

The fixture suite MUST run this scan on `develop` to assert the existing mirrors (e.g. `Documents-es/docs/architecture.md` slice-1 stub) pass — which they do, because the existing mirror only contains Spanish extended-Latin characters (verified via `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/architecture.md` returns empty at time of design).

### 4.6 Outcome gates

- `pnpm lint:fixtures` exits 0; the runner reports `PASS  no-mojibake-in-docs/Documents-es/invalid.md (errors>=1)`, `PASS  no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md (errors>=1)`, `PASS  no-mojibake-in-docs/valid.md (errors=0)`, and `PASS` for every production `Documents-es/**/*.md`.
- `pnpm lint` exits non-zero when a CJK character is added to any `Documents-es/**/*.md`.
- `eslint.config.mjs` declares the `@eslint/markdown` parser for `**/*.md` and the rule for `Documents-es/**/*.md`.

---

## 5. Sub-slice 8.4 — `docs/architecture.md` expansion + `docs/migration-playbook.md`

### 5.1 `docs/architecture.md` — section outline (LOC budgets per spec §8.4 table 462)

| # | Section heading | Budget (LOC) | Files referenced |
|---|---|---|---|
| 1 | `# Architecture` + Overview + non-goals | 30-50 | openspec/changes/vertical-slicing-reference-scaffold/{proposal,design}.md §1 |
| 2 | `## Repository layout` | 80-120 | full path tree; AGENTS.md §7 boundaries |
| 3 | `## Monorepo tooling` | 50-70 | package.json, turbo.json, tsconfig.base.json |
| 4 | `## Domain design — auth` | 50-70 | libs/features/auth/{client,server,shared,docs}, auth.config.ts |
| 5 | `## Domain design — transactions` | 50-70 | libs/features/transactions/{client,server,shared,docs}, the 6 Prisma adapters |
| 6 | `## libs/core (database, events, config)` | 50-70 | libs/core/{database,events,config}/, prisma.config.ts, env.schema.ts |
| 7 | `## libs/shared-utils` | 20-30 | libs/shared-utils/decimal/ (decimal.js wrapper per D-TX-6) |
| 8 | `## Slicing contract — libs/features/<x>/{client,server,shared}` | 50-70 | each slice's package.json, tsconfig.json |
| 9 | `## BDD colocated strategy` | 30-50 | docs/*.feature + step-defs/, cucumber.mjs, vitest.config.ts include |
| 10 | `## ESLint boundaries (the five rules)` | 50-70 | tools/eslint-plugin-boundary/, the no-prisma-outside-core/no-schemas-outside-shared/no-cross-module-import/no-client-server-import/no-mojibake-in-docs rules, fixture sanity |
| 11 | `## Branch model + SDD workflow` | 30-50 | AGENTS.md §2/§3, openspec/config.yaml `phases`, feature-branch-chain, ask-on-risk |
| 12 | `## Glossary + cross-references` | 20-30 | 9-events taxonomy (slice-1 §3.5), locked decisions #1-#11, links to openspec/changes/{vertical-slicing-reference-scaffold,slice-8-closing-bdd-and-docs}/ |

**Total**: 460-680 LOC; hard cap 600 LOC. The section headers + cross-reference anchors are reused in `Documents-es/docs/architecture.md` (mirror is translated, not localized).

**Style**: each section starts with a 1-2 sentence imperative-mood statement of the invariant, then prose explaining WHY; closing with an anchor `{ #section-N }` so the Spanish mirror can mirror-by-heading-number without renaming.

### 5.2 `docs/migration-playbook.md` — section outline (LOC budgets per spec §8.4 table 484)

| # | Section heading | Budget (LOC) | Source signals |
|---|---|---|---|
| 1 | `# Migration playbook` + Purpose + audience (human reviewer + AI agent) | 30-50 | slice-1 Locked Decision #10 |
| 2 | `## Stage 00 — preflight` | 60-90 | `scripts/migrate/00-preflight.sh` (this slice) |
| 3 | `## Stage 10 — extract domain` | 100-150 | src/modules/<f>/{domain,application,infrastructure} → libs/features/<f>/server/src |
| 4 | `## Stage 20 — create feature slice` | 100-150 | scaffold client/server/shared packages |
| 5 | `## Stage 30 — wire routes` | 80-120 | tsconfig.base.json paths, apps/api/src/app.module.ts |
| 6 | `## Stage 40 — port tests (Vitest + BDD)` | 80-120 | src/__tests__/ + docs/*.feature |
| 7 | `## Stage 50 — update docs` | 60-90 | docs/architecture.md (this slice) |
| 8 | `## Stage 99 — finalize` | 60-90 | lint, typecheck, test, bdd validation |
| 9 | `## ESLint boundaries as the enforcement loop` | 30-50 | `pnpm lint:fixtures` exit-0 contract |
| 10 | `## When to introduce @core/events` | 30-50 | the cross-slice event channel |
| 11 | `## Cross-references + glossary` | 20-30 | links to slice-1/8 artifacts |

**Total**: 650-1030 LOC; hard cap 1000 LOC per spec §8.4 table 485.

**Each stage section MUST include ≥3 before/after code OR file-tree snippets** (spec §8.4 line 499). Each snippet pair goes inside ``` ```fenced``` ``` blocks; a `code-block before/after` macro is not used — the playbook is plain markdown for human reviewer legibility. Example structure for Stage 10:

```md
### Before — `src/modules/<feature>/domain/`

```ts
// src/modules/<feature>/domain/<aggregate>.ts
```

### After — `libs/features/<feature>/server/src/domain/`

```ts
// libs/features/<feature>/server/src/domain/<aggregate>.ts
```
```

A stage snippet token overhead: ~12 LOC per snippet × 3 snippets × 2 fences = ~72 LOC/stage, factoring into the per-stage budgets above.

### 5.3 `scripts/migrate/*.sh` — exact file inventory + idempotency contract

Each script's contract (spec §8.4 table 503-516):

| Filename | Input | Action | Output | Idempotency guard | Exit codes |
|---|---|---|---|---|---|
| `00-preflight.sh` | none | `which pnpm docker git` + `git status --porcelain` (must be empty) + Node 22 check | echo "preflight: OK" | prints "preflight: already applied" when all checks pass (no state to write) | 0 ok / 1 missing-tool / 2 dirty-tree |
| `10-extract-domain.sh <feature>` | positional `<feature>` arg | `cp -r src/modules/<feature>/{domain,application,infrastructure} libs/features/<feature>/server/src/` after target-empty check | libs/features/<feature>/server/src/{domain,application,infrastructure}/<br>echo "stage 10: applied <feature>" | if target dir exists + is non-empty: echo "stage 10: already applied <feature>" exit 0 | 0 / 1 missing-arg / 2 target-non-empty-conflict |
| `20-create-feature-slice.sh <feature>` | positional `<feature>` arg | create `package.json`, `tsconfig.json`, `src/index.ts` for client + server + shared packages | three packages + tsconfig.base.json path alias entry | if `libs/features/<feature>/` exists: echo "stage 20: already applied <feature>" exit 0 | 0 / 1 missing-arg / 2 conflict |
| `30-wire-routes.sh <feature>` | positional `<feature>` arg | (a) append `@features/<feature>` to `tsconfig.base.json` paths (idempotent — skip if present); (b) register wrapper module in `apps/api/src/app.module.ts` | diff shows tsconfig + module wired | echo "stage 30: already applied <feature>" if both wirings detected | 0 / 1 missing-arg / 2 conflict |
| `40-port-tests.sh <feature>` | positional `<feature>` arg | (a) `cp src/modules/<feature>/__tests__/* libs/features/<feature>/server/src/__tests__/`; (b) create empty `docs/*.feature` stub per slice-1 Locked Decision #3 (4-6 features) | tests moved + feature stubs | echo "stage 40: already applied <feature>" if tests count unchanged | 0 / 1 missing-arg |
| `50-update-docs.sh <feature>` | positional `<feature>` arg | (a) append §4.N to `docs/architecture.md` (anchor `{ #<feature> }`); (b) mirror section to `Documents-es/docs/architecture.md` | diff shows both EN/ES sections added | echo "stage 50: already applied <feature>" if anchor exists in both | 0 / 1 missing-arg |
| `99-finalize.sh <feature>` | positional `<feature>` arg | `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @features/<feature> bdd` | exit 0 on full pass | echo "stage 99: already finalized <feature>" if marker file `.migration-<feature>-done` exists | 0 / non-zero propagates from underlying command |

**Common header** (MUST be present in every script):

```sh
#!/usr/bin/env bash
# scripts/migrate/<NN>-<stage>.sh — slice-1 Locked Decision #4 idempotent stage.
# Re-running on an empty branch is a no-op or prints "already applied" and exits 0.
set -euo pipefail
```

**Idempotency test**: `scripts/migrate/__tests__/idempotency.test.sh` (NEW, ~50 LOC, uses a minimal bash loop — no `bats` dependency) MUST assert each script exits 0 when run twice on a fresh temp branch and that the second run prints the `already applied` marker.

### 5.4 Spanish mirror strategy

`Documents-es/docs/architecture.md` (mirror of §5.1) and `Documents-es/docs/migration-playbook.md` (mirror of §5.2) MUST exist.

**Translation policy** (per AGENTS.md §13 hard rule):

- **Translated**: sentence-by-sentence into professional Spanish; full-stop punctuation preserved; sentence structure does not have to mirror 1:1.
- **Stays English (per AGENTS.md §13 industry-standard list + spec §8.4 line 532)**: `commit`, `merge`, `branch`, `ADR`, `PR`, `slice`, `stage`, `BDD`, `e2e`, `lint`, `typecheck`, `test`, `build`, `fixture`, `runner`, `pipeline`, `monorepo`, `feature`, `workspace`, `package`, `import`, `export`, `module`, `function`, `error`, `warning`, `interface`, `type`, `class`, `schema`, `port`, `adapter`, `repository`, `service`, `domain`, `application`, `infrastructure`, `client`, `server`, `shared`, `core`, `utils`, `events`, `database`, `config`, `script`, `shell`, `bash`, `idempotent`, `preflight`, `finalize`.
- **Stays English**: file paths (`libs/features/auth/...`), git refs (`a9b550d`, `bb25aab`), branch names (`develop`, `main`), identifiers, code-block contents (everything inside ``` fences — never translated).
- **Stays English**: German/Italian/etc technical loan-words mapped via snake-case identifiers (e.g., `playbook` stays as `playbook` because that's the locked decision name; `commit` does not translate to `confirmar`).

**Mojibake verification** (spec §8.4 lines 539-548): every docs commit MUST run:

```bash
grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md
```

MUST return exit 1 (no match). The ESLint rule from 8.3 enforces this at `pnpm lint` time too.

### 5.5 PR split for 8.4 (chaining ask-on-risk)

Per spec §8.4 review-workload table 698-707, 8.4 is ~1500-2200 LOC and **MUST split across at least 2 chained PRs (PR-A + PR-B)**:

- **PR-A** (`docs/architecture.md` + `Documents-es/docs/architecture.md`): ~500 LOC EN + ~500 LOC ES = **~1000 LOC**. Still >400 budget.
- **PR-B** (`docs/migration-playbook.md` + `Documents-es/docs/migration-playbook.md` + `scripts/migrate/*.sh` (7 files) + `scripts/migrate/__tests__/idempotency.test.sh`): ~700 LOC EN + ~700 LOC ES + ~70 LOC sh + ~50 LOC test = **~1520 LOC**.

**Re-split recommendation** (orchestrator must ask per `ask-on-risk`):

| PR | Contents | Estimated LOC |
|---|---|---|
| 8.4 PR-A1 | `docs/architecture.md` EN (Sections 1-6) | ~350 |
| 8.4 PR-A2 | `docs/architecture.md` EN (Sections 7-12) + `Documents-es/docs/architecture.md` mirror | ~550 |
| 8.4 PR-B1 | `docs/migration-playbook.md` EN (Sections 1-7) | ~550 |
| 8.4 PR-B2 | `docs/migration-playbook.md` EN (Section 8-11) + ES mirror | ~700 |
| 8.4 PR-C | `scripts/migrate/*.sh` (7 files) + `__tests__/idempotency.test.sh` | ~150 |

Total: 5 chained PRs for 8.4 (instead of 2). Each PR ≤550 LOC, comfortably under the 400-500 budget ceiling. The orchestrator MUST present this split OR a `size:exception` decision to the user before applying 8.4 (per `delivery_strategy=ask-on-risk`).

---

## 6. Dependency graph + PR chain order

```
        8.1 (PR #1, ~150 LOC)
            │
            ▼
        8.2 (PR #2, ~30 LOC) ◄── blocked by 8.1 because BDD job runs against fixed code
            │
            ▼ (8.1+8.2 merge into develop)
            
        ──┬─────────┬──────────┐
          │         │          │
          ▼         ▼          ▼
        8.3      8.4 PR-A    8.4 PR-A2 → ... → 8.4 PR-C
       (PR#3,    (PR#4,
       ~50 LOC)   ~350 LOC)
       
       ┌─────────────────────┐
       │ All three branches  │
       │ can be parallelized │
       │ against the tracker │
       │ feat/slice-8-…      │
       │ (no mutual deps)    │
       └─────────────────────┘
```

**Chain order** (mandatory): `8.1 → 8.2 → 8.3 || 8.4 PR-A1..A2 || 8.4 PR-B1..B2 || 8.4 PR-C` (5-7 chained PRs).

**Parallelization rule**: 8.3, 8.4-PR-A1, 8.4-PR-A2, 8.4-PR-B1, 8.4-PR-B2, 8.4-PR-C all open against the tracker `feat/slice-8-closing-bdd-and-docs` AFTER PR #2 (8.2) merges — they cannot be opened against `develop` because the tracker lives at the tip of the chain. The orchestrator must drive them one-by-one after PR #2 lands.

---

## 7. Rollback strategy

| Sub-slice | `git revert <sha>` | CI behavior after revert | Local behavior after revert |
|---|---|---|---|
| 8.1 | Reverts the `register.ts` rewrite + `vitest.config.ts` 1-line include | (a) PRs to `develop` after 8.2 lands would FAIL the BDD gate at the `pnpm turbo run bdd` step (auth 18/18 = 18/18 timeout-fail → step exits non-zero). (b) `pnpm lint` may fail at `no-mojibake-in-docs` if a CJK char was introduced in this PR (none will be — 8.1 doesn't touch docs). | `pnpm --filter @features/auth bdd` returns to the 5000ms timeouts; `pnpm --filter @features/auth test` reports register.test.ts as the 2-FAIL RED state it was. |
| 8.2 | Reverts the 5th YAML job + removes the placeholder comment | The `BDD (Cucumber)` check DISAPPEARS from the checks list. PRs no longer fail on bridge regressions. No other CI job depends on `bdd` (it's a `needs: [static, test]` consumer, not a `neededBy`), so the other four jobs keep running unchanged. | `pnpm turbo run bdd` still works locally. |
| 8.3 | Reverts the `eslint.config.mjs` parser block + the runner multi-invalid branch + `secondCjkLine.invalid.md` | (a) `pnpm lint` no longer parses `.md` files at all; the rule is dormant again (same state as slice-1). (b) `pnpm lint:fixtures` reverts to the single-invalid-fixture expectation; the new triangulation file MUST also be removed (revert includes it). | `pnpm lint` continues to lint .ts/.tsx files. The rule stays in the `@gpr/boundary` plugin but its only firing path (the new `Documents-es/**/*.md` block) is removed. |
| 8.4 (each sub-PR individually) | Each of the 5 sub-PRs is its own revert target | No CI gate touches the docs prose. If a docs PR reverts and the fixtures still pass, no CI break. | The docs return to their pre-PR state (architecture or playbook). The Spanish mirrors revert in the same commit. |

**Whole-change revert**: revert the squash merge of `feat/slice-8-closing-bdd-and-docs` into `develop`. All slice-7 chain evidence (`a9b550d`, `bb25aab`) is preserved.

**MUST NOT do (per proposal §7)**: force-push, rewrite history, touch `main`, modify `openspec/changes/vertical-slicing-reference-scaffold/`, amend `a9b550d` / `bb25aab`.

---

## 8. Test strategy (strict TDD per AGENTS.md §4 + openspec/config.yaml `strict_tdd: true`)

| Sub-slice | RED test | GREEN path | Triangulation cases |
|---|---|---|---|
| 8.1 | `libs/features/auth/docs/__tests__/register.test.ts` (~177 LOC, NEW). Mirrors transactions test (177 LOC). Three assertions per spec §8.1 lines 152-172. | Modify `libs/features/auth/docs/support/register.ts` (port of transactions lines 1-188 with the substitutions in §2.1). Add `"../docs/__tests__/**/*.test.ts"` to `libs/features/auth/server/vitest.config.ts` include. | (a) 0-capture step (`fn.length === 1`); (b) 1-capture step (`fn.length === 2`); (c) N-capture with N=5 (largest existing auth pattern). Each case asserts `stepFn.mock.calls[0][0]` === `world.inner`. |
| 8.2 | **The test IS the CI job running green on a probe PR.** Manual: open a test PR that reverts `register.ts` to the broken state; expect the `BDD (Cucumber)` check to FAIL. Revert the revert; expect GREEN. | Append the YAML in §3.1. | (a) PR-to-`develop` trigger; (b) push-to-`develop` trigger; (c) BDD step exits non-zero on bridge regression. |
| 8.3 | Extend `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` so `no-mojibake-in-docs` accepts multi-invalid fixtures. Add `secondCjkLine.invalid.md` (line 5 CJK). Add production-tree CJK scan (lines after the fixture loop). | Wire `@eslint/markdown@8.0.3` per §4.1-§4.2. | (a) `invalid.md` (CJK on lines 6, 8) reports ≥1 error; (b) `secondCjkLine.invalid.md` (CJK on line 5) reports ≥1 error; (c) `valid.md` reports 0 errors; (d) production-tree scan reports 0 CJK across all `Documents-es/**/*.md` on a clean branch. |
| 8.4 | `scripts/migrate/__tests__/idempotency.test.sh` (~50 LOC, NEW). For each of the 7 scripts: spawn the script in a temp git worktree, run twice, assert exit 0 + `already applied` text on run 2. | Implement scripts per §5.3. | (a) `00-preflight.sh` with all tools present / with `pnpm` missing; (b) `10-extract-domain.sh` on empty target / on populated target; (c) re-run nested idempotency: same script run 3× still exits 0 each time. |
| 8.4 (docs prose) | NO RED unit test. Verification is: (a) `wc -l docs/architecture.md` ≥400; (b) `wc -l docs/migration-playbook.md` ≥600; (c) `grep -c '^\s*\`\`\`' docs/migration-playbook.md` ≥42 (3 snippets × 2 fences × 7 stages per spec §8.4 scenario line 575-577); (d) `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md` exits 1 (no match). These are manual `sdd-verify` gates, not Vitest tests. |

---

## 9. Risks (mirror proposal §6 + spec cross-references)

| # | Risk | Severity | Failure mode | Mitigation | When to escalate |
|---|---|---|---|---|---|
| R1 | Auth world-contract divergence (resolved at spec §8.4 lines 622-645 + this design §2.6). | INFO (resolved) | N/A — verified `service-context.ts` lives at module scope, `AuthWorld` carries step state. The bridge fix does NOT touch `service-context.ts`. | The new test (`register.test.ts`) catches any future regression in the world-vs-wrapper indirection. | NEVER (resolved). |
| R2 | Docs expansion at ~1500-2200 LOC exceeds 400-line review budget. | WARNING | Reviewer fatigue; PR gets bounced. | §5.5 splits 8.4 into 5 chained PRs (A1, A2, B1, B2, C) instead of 2. Each PR ≤550 LOC. | `ask-on-risk` MUST trigger before 8.4 apply — user picks (a) split further, (b) `size:exception` accepted, (c) defer playbook to slice 9. |
| R3 | `@eslint/markdown` parser API may shift between 8.x minors. | SUGGESTION | Pin breaks after a `pnpm update`. | (a) Exact pin `8.0.3` at root `package.json` devDependencies (no caret). (b) Document the bump procedure in the 8.3 commit body. (c) Future bumps are mechanical — open a new change, bump, re-run `pnpm lint:fixtures`. | Only when bumping the pin (slice-N+1). |
| R4 | **`vitest.config.ts` include bump** is OUTSIDE the spec's listed scope but REQUIRED for the GREEN outcome (`pnpm --filter @features/auth test` exits 0). | WARNING (NEW) | Without it, 8.1's `register.test.ts` is discovered by `vitest` from the slice root but NOT by `pnpm --filter @features/auth test` (the filter resolves the package's `test` script which uses the package's vitest config). The spec's RED test would NOT run; CI would pass without exercising the bridge contract. | Treat as in-scope for 8.1. This design flags it explicitly so the orchestrator does NOT mark 8.1 out-of-spec when apply-stage diff slightly exceeds the spec's LOC estimate. | If the spec's `sdd-verify` later proves the include bump is required AND absent, the bridge fix is incomplete — escalate. |
| R5 | Runner multi-invalid branch in 8.3 may regress the other 4 rules' invariant (single-invalid fixture). | SUGGESTION (NEW) | A future change could re-introduce the "exactly one invalid" assertion as global instead of per-rule. The other 4 rules (`.ts`-based) MUST keep the exactly-one invariant. | Design §4.4 uses a per-rule `allowMultipleInvalids: true` field on `RULES[i]` — keeps the other 4 rules strict. The RED test for 8.3 iterates all 5 rules; if any `.ts` rule's `invalids.length > 1` case fires (only via intentional fixture drift), the runner exits 1. | If the `.ts` rules' `invalid.{ts}` count ever exceeds 1, that's a regression in fixture discipline — escalate per `no-cross-module-import` spirit (one fixture per rule variant). |

---

## 10. Review Workload Forecast

| Sub-slice | PR # | Estimated LOC (additions) | vs 400 budget | ask-on-risk? |
|---|---|---|---|---|
| 8.1 — auth bridge | PR #1 | ~180 (150 register.ts port + 30 register.test.ts minus overlap + 1 vitest.config.ts) | Low | No |
| 8.2 — CI YAML | PR #2 | ~30 (5th job block, replaces placeholder) | Low | No |
| 8.3 — markdown lint | PR #3 | ~50 (eslint config +1 import + 2 blocks + runner multi-invalid branch + production scan + 6 LOC fixture) | Low | No |
| 8.4 PR-A1 | PR #4 | ~350 (architecture.md Sections 1-6 EN) | Low/Med | **Yes** at apply time if merged with PR-A2 |
| 8.4 PR-A2 | PR #5 | ~550 (architecture.md Sections 7-12 EN + full ES mirror) | High | **Yes** — orchestrator MUST stop and ask per `ask-on-risk` |
| 8.4 PR-B1 | PR #6 | ~550 (playbook.md Sections 1-7 EN, includes ≥21 snippet fences) | High | **Yes** |
| 8.4 PR-B2 | PR #7 | ~700 (playbook.md Sections 8-11 EN + full ES mirror) | High | **Yes** |
| 8.4 PR-C | PR #8 | ~150 (7 × ~10 LOC sh + 50 LOC idempotency test) | Low | No |

**Totals**: 8 PRs, ~2560 LOC additions. The 8.4 cluster (PR #4-#8) definitively triggers `ask-on-risk` per spec §8.4 review-workload table 698-707. The orchestrator MUST present the 5-PR split vs. an explicit `size:exception` to the user before applying 8.4 PR-A2.

---

## 11. Cross-references

- **Proposal**: `openspec/changes/slice-8-closing-bdd-and-docs/proposal.md` (Engram #2226).
- **Spec**: `openspec/changes/slice-8-closing-bdd-and-docs/spec.md` (Engram #2228).
- **Slice-7 close**: `bb25aab` on `develop` (squash of PR-51, 25/25 transactions BDD PASS).
- **Bridge-fix pattern**: commit `a9b550d` at `libs/features/transactions/docs/support/register.ts` (lines 72-118 = `buildWrapper`; lines 125-129 = `TransactionsWorldWrapper`; lines 143-165 = pattern + count helpers).
- **Transactions bridge test template**: `libs/features/transactions/docs/__tests__/register.test.ts` (177 LOC).
- **Slice-1 design §3.4 (boundary rules selector for `no-mojibake-in-docs`)**: `openspec/changes/vertical-slicing-reference-scaffold/design.md` line 322-324.
- **Slice-1 Locked Decision #4 (playbook dual format)**: `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` line 93.
- **Slice-1 task T8.5 (7-script contract)**: `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` line 876-882.
- **Slice-1 design §2 (repository layout, scripts/migrate/ path)**: lines 226-233 (the canonical home).
- **Auth world type (verified)**: `libs/features/auth/docs/step-defs/world.ts` lines 55-126 (interface + factory).
- **Auth service context (verified, MUST NOT touch)**: `libs/features/auth/docs/support/service-context.ts` (235 LOC).
- **CI placeholder (replaced by 8.2)**: `.github/workflows/ci.yml` lines 187-196.
- **ESLint flat config**: `eslint.config.mjs` lines 13 (boundary import), 42-52 (TS parser block), 56-59 (global rules block). 8.3 inserts parser block after line 52, rule block after line 59.
- **Runner invariant being changed**: `tools/eslint-plugin-boundary/scripts/run-fixtures.mjs` lines 137-145 (exactly-one-invalid assertion) + lines 162-232 (test set loop).
- **Existing auth fixtures**: `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/{valid.md, Documents-es/invalid.md}` (the new `secondCjkLine.invalid.md` is a sibling).
- **Vitest discoverability gap**: `libs/features/auth/server/vitest.config.ts` line 18-21 (does NOT include `../docs/__tests__/**/*.test.ts`); `libs/features/transactions/server/vitest.config.ts` line 23 (DOES include it). 8.1 must align auth with transactions.
- **AGENTS.md §7 (boundary rules)** + **§8 (SSoT)** + **§11 (out-of-scope)** + **§13 (Spanish mirror)**.
- **openspec/config.yaml**: `strict_tdd: true`, `delivery_strategy: ask-on-risk`, `chain_strategy: feature-branch-chain`, `review_budget_lines: 400`.

---

## 12. Open questions for `sdd-tasks`

The following are NOT blockers for `sdd-design` to complete, but `sdd-tasks` MUST resolve them in `tasks.md` before `sdd-apply` starts:

1. **8.4 PR split confirmation**: which of the 5-PR split (A1, A2, B1, B2, C) does the user want? Spec lists 2-PR split; this design recommends 5. `ask-on-risk` triggers here.
2. **`scripts/migrate/__tests__/idempotency.test.sh` test framework**: bash loop (this design recommends) vs `bats` (per slice-1 T8.5). Bash loop has no new dependency; `bats` would need a devDep. **Recommend bash loop** — slice-1 spec already says "bats OR a tiny shell-test runner"; minimal-dependency choice is the bash loop.
3. **`secondCjkLine.invalid.md` line number**: design picks line 5 (intentionally far from line 1). If apply's TDD pass picks a different line, the rule must still fire — covered by `findCjkInText` which scans the entire document (not just line 1). The line 5 choice is illustrative.
4. **`@eslint/markdown@8.0.3` dependency tree impact**: 8.0.3 may pull in `@eslint/plugin-kit` as a peer. The apply phase MUST run `pnpm install` on the pinned version and verify `pnpm lint` exits 0 with an empty `Documents-es/**/*.md` tree. If the dep tree brings unexpected dups, escalate per R3.
5. **`docs/architecture.md` section §12 cross-references format**: should the cross-references render as a numbered list (slice-1 design style) or as a `<dl>`-style definition list? Recommend numbered list (matches slice-1 design §12).

---

## 13. Status

**Status**: `success`. Design artifact ready at `openspec/changes/slice-8-closing-bdd-and-docs/design.md`.

**Key technical decisions locked** (recap):

1. **DUPLICATE `buildWrapper` into auth** (NOT shared). Single source of truth is per-slice, not per-bridge. AGENTS.md §7 / §8 boundary + slice-1 design §3.4 `no-cross-module-import` forbid cross-slice bridge import; `@core/` is reserved for runtime infra, not test infra.
2. **CI YAML inline-duplicated** (no YAML anchors). Saves 6 LOC vs anchors; review-budget wins.
3. **`vitest.config.ts` include bump IS in-scope for 8.1** (spec silently missed it; without it the RED test never runs in CI). Flagged in §2.5 and §9 R4.
4. **Runner multi-invalid branch is per-rule boolean**, not a global relaxation. Other 4 rules retain their single-invalid discipline.
5. **Docs expansion splits into 5 chained PRs** (not 2 per spec). Per-PR ≤550 LOC; orchestrator MUST ask-on-risk before PR-A2.

**Next phase**: `sdd-tasks` (open question §12.1 needs user resolution before 8.4 apply).

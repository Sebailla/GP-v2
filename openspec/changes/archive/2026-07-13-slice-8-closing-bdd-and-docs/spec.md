# Delta Spec — `slice-8-closing-bdd-and-docs`

> **Change**: `slice-8-closing-bdd-and-docs` · **Project**: `gastos-personales-reference`
> **Branch**: `develop` (tracker `feat/slice-8-closing-bdd-and-docs`)
> **Mode**: interactive · **Artifact store**: hybrid
> **Date**: 2026-07-12
> **Proposal**: `openspec/changes/slice-8-closing-bdd-and-docs/proposal.md` (Engram #2226, `sdd/slice-8-closing-bdd-and-docs/proposal`)
> **Slice-7 close-out**: `bb25aab` on `develop` (25/25 transactions BDD PASS) · **Bridge-fix pattern**: `a9b550d`

---

## Purpose

Lock the four sub-slices of `slice-8-closing-bdd-and-docs` as concrete, testable
requirements with one Given/When/Then scenario per requirement. Every "should" or
"may" in this spec resolves to a `MUST`, `MUST NOT`, or `SHALL` per RFC 2119.

This spec is intentionally **flat** (one `spec.md` at the change root), not split
under `specs/<domain>/spec.md`. The flat shape mirrors the slice-1 convention
from `openspec/changes/vertical-slicing-reference-scaffold/` and matches the
proposal's own flat layout.

## Capability overview

The change adds or modifies exactly four capabilities. The existing transactions
slice (already spec'd at
`openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md`)
is **unmodified** by this change; the auth slice's existing spec is modified
only by 8.1's wrapper change.

| #   | Capability                                          | Type   | Outcomes                                                                                                  |
| --- | --------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| 8.1 | Auth BDD bridge fix                                 | MODIFY | Auth BDD suite: 18/18 PASS in <2s; bridge Vitest test 2/2 PASS; no regression in transactions 25/25.      |
| 8.2 | BDD CI gate                                         | ADD    | New `bdd` job in `.github/workflows/ci.yml` runs on every PR to `develop`/`main`; failure surfaces at PR. |
| 8.3 | `no-mojibake-in-docs` lint activation               | MODIFY | `pnpm lint` flags CJK in any `Documents-es/**/*.md`; `pnpm lint:fixtures` exits 0 with rule active.      |
| 8.4 | Architecture + migration playbook docs (and mirrors) | ADD    | `docs/architecture.md` ≥400 LOC; `docs/migration-playbook.md` ≥600 LOC + 7 idempotent `.sh`; mirrors exist and are CJK-clean. |

---

## Sub-slice 8.1 — Auth BDD bridge fix (MODIFY)

### Capability: Auth BDD bridge contract

The auth slice's cucumber-13 binding bridge at
`libs/features/auth/docs/support/register.ts` MUST publish every step binding
from `step-defs/*.ts` into cucumber's `Given`/`When`/`Then` registries using a
wrapper whose `fn.length` exactly matches the cucumber `argsArray.length` for
the binding's capture count, so cucumber 13 takes the `callbackInterface`
branch exclusively and does NOT throw the "function uses multiple asynchronous
interfaces" error.

#### Auth world type — explicit declaration (resolves proposal §8 question #1)

The auth slice **MUST** declare the following world type at
`libs/features/auth/docs/step-defs/world.ts` (already present, MUST NOT be
removed) and bind it through a `setWorldConstructor` call in the bridge:

```ts
export interface AuthWorld { /* see libs/features/auth/docs/step-defs/world.ts lines 55-97 */ }
export function createAuthWorld(): AuthWorld { /* lines 103-126 */ }
```

The bridge **MUST** introduce a new `setWorldConstructor(AuthWorldWrapper)`
call (currently absent — verified via `grep setWorldConstructor` over
`libs/features/auth/**` returning zero matches) that constructs:

```ts
class AuthWorldWrapper {
  public readonly inner: AuthWorld = createAuthWorld();
}
```

The wrapper is the bridge's `thisArg`. The wrapper's `.inner` is what every
step binding receives as its first argument. **The bridge MUST NOT pass the
wrapper itself to step bindings — it MUST pass `wrapper.inner`.**

This shape mirrors the transactions wrapper at
`libs/features/transactions/docs/support/register.ts` lines 125-129
(`class TransactionsWorldWrapper { public readonly inner: TxWorld = createTransactionsWorld(); }`)
so a single mental model applies to both slices.

**Adapter for the auth slice's existing `service-context.ts`**: the bridge
**MUST NOT** alter `service-context.ts` (per proposal §2.1 "do NOT modify …
`service-context.ts`"). The `service-context.ts` `ServiceContext` (auth service
+ in-memory UserRepository) is a module-level singleton constructed once at
bridge load and shared across scenarios — this is independent of cucumber's
per-scenario world lifecycle. The auth world will continue to carry the
step-level assertions (`sessionCreated`, `lastErrorMessage`, etc.) while the
service context carries cross-scenario persistence (the in-memory user map).
These two concerns are distinct and the bridge fix MUST NOT conflate them.

#### Bridge pattern — must reuse `a9b550d`

The bridge **MUST** reuse `buildWrapper(numCaptures, stepFn)` from
`a9b550d` (`libs/features/transactions/docs/support/register.ts` lines
72-118), ported verbatim with the following substitutions:

- The error message string `"[transactions/support/register]"` **MUST** be
  rewritten to `"[auth/support/register]"` (every occurrence in the
  factory body).
- The `TxWorld` import **MUST** be replaced with an `AuthWorld` import from
  `../step-defs/world.js`.
- `countStringPlaceholders` and `buildPattern` helpers (lines 143-165 of the
  transactions bridge) **MUST** be copied verbatim.

The 0-capture fast path and the `new Function()` capture-arbitrary-arities
path **MUST** both be present. The capture-arbitrary-arities path is required
because the auth slice's 75 step bindings include 28 with at least one
`{string}` placeholder and varying capture counts (verified by
`grep -hE 'pattern: "(.*\{string\}.*)' libs/features/auth/docs/step-defs/*.ts |
wc -l` = 28).

#### Step binding registry — full surface to be re-published

The bridge **MUST** publish every entry from
`libs/features/auth/docs/step-defs/common.steps.ts` (37 entries,
`stepDefinitions` export) and `libs/features/auth/docs/step-defs/realm.steps.ts`
(38 entries, `stepDefinitions` export) — total 75 step bindings. Verified at
2026-07-12 via `grep -c '^\s\+keyword: "' libs/features/auth/docs/step-defs/*.ts`.

#### Pattern transformation rules — declared

For every binding's `pattern`, the bridge **MUST**:

1. Replace `{string}` placeholders with the regex capture group
   `((?:"[^"]*"|[^\\s"]+))` — the outer `((` makes each placeholder a real
   capturing group (cucumber's `getInvocationParameters` relies on
   `String.prototype.matchAll` returning the captures).
2. Escape forward-slash characters with `\/`.
3. Anchor the regex with `^` and `$`.

#### Wrapper invocation contract (verbatim from `a9b550d`)

For a binding with N `{string}` captures, cucumber's `argsArray` at invocation
time has shape `[capture_1, ..., capture_N, (err, result) => void]`
(length = N + 1). The wrapper **MUST**:

1. Declare exactly N named capture parameters plus a trailing `done`
   callback. `fn.length === N + 1`.
2. Read `world` from `this.inner` (cucumber passes the `AuthWorldWrapper`
   instance as `thisArg`); error if `world === undefined`.
3. Call `void Promise.resolve(stepFn(world, String(cap_1), ...,
   String(cap_N))).then(() => done(), (err) => done(err instanceof Error ? err : new Error(String(err))))`.
4. Never return a Promise from the synchronous body (so the dual-interface
   guard cannot fire).

#### RED test contract

`libs/features/auth/docs/__tests__/register.test.ts` MUST be added
(mirroring `libs/features/transactions/docs/__tests__/register.test.ts`,
177 LOC) and MUST assert at minimum the following:

1. **Wrapper arity + world off `.inner`**: mock
   `@cucumber/cucumber` (`Given`, `When`, `Then`, `setWorldConstructor`
   spies). Register a 2-capture binding `{ keyword: "Given", pattern:
   "the value is {string} and {string}", fn: vi.fn() }`. Invoke the
   registered wrapper with `thisArg = new AuthWorldWrapper()` and
   `argsArray = ["first", "second", callback]`. Assert the inner `fn`
   is called with `expect.objectContaining` matching `world.inner` (a
   fresh `AuthWorld`) at position 0, `"first"` at position 1, `"second"`
   at position 2, and length exactly 3. Assert the `callback` is invoked
   once with no error arg.
2. **Capture-group regex**: assert the `RegExp` registered to cucumber
   exposes the two captures via `match[1]` / `match[2]` when matched
   against `'the value is "alpha" and "beta"'`. This is the RED
   assertion that the auth slice's existing non-capturing-group regex
   bug fails today.
3. **`setWorldConstructor` is called once at bridge load**: assert the
   spy is invoked at least once during `import "../support/register.js"`,
   with a class/constructor whose instances expose a `.inner` of type
   `AuthWorld`. This is the RED assertion that proves the bridge now
   binds a wrapper (today: zero `setWorldConstructor` calls).

The test file MUST be runnable via `pnpm --filter @features/auth test` and
exit 0 with 2 PASS (per the proposal's stated contract; the transactions
test runs 2 cases by analogy).

#### MUST NOT touch

The bridge change **MUST NOT** modify any of:

- `libs/features/auth/docs/cucumber.mjs`
- `libs/features/auth/docs/support/env-bootstrap.js`
- `libs/features/auth/docs/support/service-context.ts`
- Any `*.feature` file under `libs/features/auth/docs/`
- Any `*.steps.ts` file under `libs/features/auth/docs/step-defs/`
- `libs/features/transactions/docs/support/register.ts` (the canonical
  source of `buildWrapper`)

#### Outcome gate (G1–G5 from proposal §5)

`pnpm --filter @features/auth bdd` exits 0 with 18/18 PASS in <2s.
`pnpm --filter @features/auth test` exits 0 with the new bridge test
≥2/2 PASS. `pnpm --filter @features/transactions bdd` continues to pass
25/25 (no regression).

#### Scenario: Bridge wrapper routes 2-capture binding correctly

- GIVEN a step binding with `pattern: "the value is {string} and {string}"` and `fn: vi.fn()`
- WHEN the bridge publishes the binding and cucumber invokes the wrapper with `thisArg = new AuthWorldWrapper()` and `argsArray = ["first", "second", callback]`
- THEN the inner `fn` is called with `(world.inner, "first", "second")` exactly
- AND `callback` is invoked once with no error argument

#### Scenario: Capture-group regex exposes both captures

- GIVEN the bridge registered a binding with 2 `{string}` placeholders
- WHEN the registered `RegExp` is matched against `'the value is "alpha" and "beta"'`
- THEN `match[1]` equals `'"alpha"'` and `match[2]` equals `'"beta"'`

#### Scenario: Auth bridge calls setWorldConstructor at load

- GIVEN a fresh vitest process with `@cucumber/cucumber` mocked
- WHEN `import "../support/register.js"` runs (bridge load)
- THEN the `setWorldConstructor` spy is invoked at least once
- AND the registered class yields instances with a typed `.inner: AuthWorld`

---

## Sub-slice 8.2 — BDD as a CI gate (ADD)

### Capability: BDD CI job

`.github/workflows/ci.yml` MUST be appended with a 5th job (`bdd`) that
runs `pnpm turbo run bdd` against a Postgres 16-alpine service, gating
every `pull_request` and every `push` to `develop`/`main` on a passing
BDD suite.

#### Job shape — declared

```yaml
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
      run: pnpm --filter @core/database exec prisma migrate deploy
      env: { DATABASE_URL: postgresql://postgres:postgres@localhost:5432/gastos_reference_test }
    - name: Run BDD
      run: pnpm turbo run bdd
```

The job **MUST** declare `needs: [static, test]` so it runs only after
the lint + unit/integration gate passes (skipping BDD on a static-only
failure saves ~3 min of CI time). `timeout-minutes: 30` is the upper
bound; the slice-7 baseline shows full BDD runs at <30s on cold caches.

#### Trigger set — declared

The `on:` block at the top of `ci.yml` already covers
`pull_request: [develop, main]` and `push: [develop, main]`. The new
job **MUST NOT** narrow the trigger set.

#### What happens when BDD fails

The `bdd` job fails the workflow (default GitHub Actions behaviour — no
`continue-on-error`). The failure surfaces in the PR checks list within
the 30-minute timeout window. The cucumber log is uploaded as the step
output (no extra `actions/upload-artifact` step required — GitHub retains
step logs for 90 days by default).

#### MUST NOT add in this sub-slice

This sub-slice **MUST NOT** add the Playwright e2e job. The slice-1
placeholder at line 188 of `ci.yml` covers both BDD and e2e; this slice
ships **only** the BDD gate. The e2e job is deferred to a future slice.

#### Scenario: BDD job appears on PR to develop

- GIVEN a PR opened against `develop` after this change lands
- WHEN the CI workflow runs
- THEN the checks list contains a `BDD (Cucumber)` check
- AND the check passes within the 30-minute timeout

#### Scenario: Bridge regression fails the BDD gate

- GIVEN the auth bridge file has been reverted to the broken state (the `(world, ...args) => ...` rest-args wrapper)
- WHEN the BDD job runs on a PR
- THEN the `pnpm turbo run bdd` step exits non-zero
- AND the PR check `BDD (Cucumber)` is marked failed

---

## Sub-slice 8.3 — `@eslint/markdown` + `no-mojibake-in-docs` activation (MODIFY)

### Capability: CJK detection in `Documents-es/**/*.md` via ESLint

The `no-mojibake-in-docs` rule (already implemented at
`tools/eslint-plugin-boundary/rules/no-mojibake-in-docs.cjs`, 65 LOC) MUST
fire during `pnpm lint` against every `Documents-es/**/*.md` file. The
rule's `Program` visitor reads source text and reports each CJK codepoint
via `context.report` — `@eslint/markdown` provides the markdown AST so
ESLint's default `Program` hook fires.

#### `@eslint/markdown` pin — declared

The workspace `package.json` MUST pin `@eslint/markdown` to the exact
version **`8.0.3`** (latest published; verified via
`npm view @eslint/markdown version` at 2026-07-12). The pin is exact
(not a caret range) per slice-1 §5 "Stack churn" mitigation: the
parser has shipped breaking parser-API changes between minor versions
historically. The pin MUST be in `devDependencies` at
the repo-root `package.json`. Future bumps are mechanical — open a new
change, bump, re-run the fixture suite.

#### Fixture state — pre-existing (the proposal's claim is inaccurate)

The proposal §2.3 states the `invalid.md` fixture "does not exist" — this
is **incorrect**. The fixture is already present at
`tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/invalid.md`
(8 LOC; contains the CJK characters `东亚语言测试` on line 6 and
`日本語のテスト` on line 8) alongside the `valid.md` (8 LOC; no CJK).
The runner (`scripts/run-fixtures.mjs`) already covers this fixture
path through `detectCjkInMdFixture` (lines 94-108).

**8.3 therefore does NOT need to create the fixture.** 8.3 MUST add a
`secondCjkLine.invalid.md` triangulation case at
`tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md`
containing exactly one CJK character on a non-first line — to prove the
rule detects CJK regardless of line position (catches a regression
class where the runner only scans the first N characters).

#### `eslint.config.mjs` changes — declared

`eslint.config.mjs` MUST add two blocks:

1. A parser block (after the existing `**/*.{ts,tsx}` block at lines
   42-52) that registers `@eslint/markdown` as the parser for
   `**/*.md`:

   ```js
   {
     files: ["**/*.md"],
     languageOptions: {
       parser: markdownParser,
       parserOptions: { ecmaVersion: 2022, sourceType: "module" },
     },
   }
   ```

2. A rule-application block (after the existing globally-applicable
   block at lines 57-59) restricted to `Documents-es/**/*.md`:

   ```js
   {
     files: ["Documents-es/**/*.md"],
     plugins: { "@gpr/boundary": boundary },
     rules: { "@gpr/boundary/no-mojibake-in-docs": "error" },
   }
   ```

The `boundary` import (line 13) MUST be reused; do NOT add a second
plugin import.

#### `run-fixtures.mjs` target expansion

The runner MUST add a target-expansion step (one new function, no
changes to existing rule loops): after the per-rule fixture loop
completes, the runner MUST glob `Documents-es/**/*.md` (excluding the
fixtures directory via the existing ignore pattern at line 30 of
`eslint.config.mjs`) and assert that no file in the production mirror
tree contains a CJK character. The check uses the existing
`findCjkInText` from `tools/eslint-plugin-boundary/lib/cjk-detect.cjs`.

If any production `Documents-es/**/*.md` contains CJK, the runner
exits 1 with the offending file path + offset printed. The runner
target list in the script header MUST be updated to document this
expanded scope.

#### Outcome gates (G9–G13 from proposal §5)

`pnpm lint:fixtures` exits 0 with the rule active and the
secondCjkLine fixture firing. `pnpm lint` exits non-zero when any
`Documents-es/**/*.md` contains CJK. `eslint.config.mjs` declares
`@eslint/markdown` as the parser for `**/*.md`. `valid.md` continues
to report 0 errors; `invalid.md` continues to report ≥1 errors;
`secondCjkLine.invalid.md` reports ≥1 errors.

#### Scenario: Wire `@eslint/markdown` exposes CJK in production mirror

- GIVEN `Documents-es/docs/architecture.md` is mutated to contain a single `漢` character mid-paragraph
- WHEN `pnpm lint` runs
- THEN ESLint exits non-zero
- AND the error message names the file path and offset

#### Scenario: SecondCjkLine triangulation fixture fires

- GIVEN `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/secondCjkLine.invalid.md` contains a single CJK character on line 5 (not line 1)
- WHEN `pnpm lint:fixtures` runs
- THEN the runner reports `PASS  no-mojibake-in-docs/secondCjkLine.invalid.md  (errors>=1)`

---

## Sub-slice 8.4 — `docs/architecture.md` expansion + `docs/migration-playbook.md` (ADD)

### Capability: Architecture + playbook prose with Spanish mirrors

The repo's two architecture artefacts MUST be full prose (not stubs).
The architecture document MUST cover every layout invariant the reference
repo enforces. The playbook MUST give a concrete, executable recipe
for migrating a Next.js + NestJS module into the
`libs/features/<x>/{client,server,shared}` shape.

#### Playbook format — RESOLVED (proposal §8 question #2)

The slice-1 proposal's **Locked Decision #4** declares the playbook
**dual format**: `.md` prose + sibling `scripts/migrate/<stage>.sh`
idempotent shells (one per playbook stage). Locked Decision #4 is part
of the slice-1 umbrella and was NEVER amended. Therefore slice 8 **MUST
honour the dual format**.

Rationale for honouring (not breaking):

- Breaking a Locked Decision requires a new ADR-style decision record.
  No such record exists in slice 8's scope.
- The dual format was specifically designed for AI-agent consumers
  (`scripts/migrate/*.sh`) — slice 8 has no human-only framing argument
  to override that.
- Slice-1 task T8.5 names the exact seven scripts
  (`00-preflight.sh` through `99-finalize.sh`); the names are a
  contract, not a hint.

The seven scripts **MUST** be idempotent: re-running on an empty branch
is a no-op or prints `already applied` and exits 0.

#### `docs/architecture.md` — sections and LOC budget

The existing 77-LOC stub MUST expand to **≥400 LOC, ≤600 LOC**. Sections:

| #   | Section                                                              | Budget (LOC) | Hard limit |
| --- | -------------------------------------------------------------------- | ------------ | ---------- |
| 1   | Overview + non-goals                                                 | 30-50        | 50         |
| 2   | Repository layout (apps, libs, tools, openspec, docs, scripts)       | 80-120       | 120        |
| 3   | Monorepo tooling (pnpm, turbo, tsconfig path aliases, eslint)        | 50-70        | 70         |
| 4   | Domain design: auth (`libs/features/auth/{client,server,shared}`)    | 50-70        | 70         |
| 5   | Domain design: transactions (`libs/features/transactions/{...}`)     | 50-70        | 70         |
| 6   | `libs/core` (database, events, config)                               | 50-70        | 70         |
| 7   | `libs/shared-utils`                                                  | 20-30        | 30         |
| 8   | `libs/features/<x>` slicing contract (client / server / shared)      | 50-70        | 70         |
| 9   | BDD colocated strategy (`docs/*.feature` + `step-defs/*.steps.ts`)   | 30-50        | 50         |
| 10  | ESLint boundaries (the five rules, what each forbids, fixture sanity) | 50-70       | 70         |
| 11  | Branch model + SDD workflow                                          | 30-50        | 50         |
| 12  | Glossary + cross-references                                          | 20-30        | 30         |

Hard limits are upper bounds; the totals MUST land between 400 and 600
LOC per G14 of the proposal §5.

#### `docs/migration-playbook.md` — sections and LOC budget

The playbook MUST be a NEW file of **≥600 LOC, ≤1000 LOC**. Sections:

| #   | Section                                              | Budget (LOC) | Hard limit |
| --- | ---------------------------------------------------- | ------------ | ---------- |
| 1   | Purpose + audience (human reviewer + AI agent)       | 30-50        | 50         |
| 2   | Stage 00 — preflight                                 | 60-90        | 90         |
| 3   | Stage 10 — extract domain                            | 100-150      | 150        |
| 4   | Stage 20 — create feature slice                      | 100-150      | 150        |
| 5   | Stage 30 — wire routes                               | 80-120       | 120        |
| 6   | Stage 40 — port tests (Vitest + BDD)                 | 80-120       | 120        |
| 7   | Stage 50 — update docs (architecture + glossary)     | 60-90        | 90         |
| 8   | Stage 99 — finalize (PR checklist, rollback)         | 60-90        | 90         |
| 9   | ESLint boundaries as the enforcement loop            | 30-50        | 50         |
| 10  | When to introduce `@core/events`                      | 30-50        | 50         |
| 11  | Cross-references + glossary                          | 20-30        | 30         |

**Each stage section MUST include ≥3 before/after code or file-tree
snippets** (per G15 of the proposal §5).

#### `scripts/migrate/*.sh` — exact file inventory

Seven scripts MUST be created at `scripts/migrate/`:

1. `00-preflight.sh` — verify `pnpm`, `docker`, `.git`, no uncommitted changes.
2. `10-extract-domain.sh` — copy `src/modules/<feature>/{domain,application,infrastructure}` into `libs/features/<feature>/server/src/`.
3. `20-create-feature-slice.sh` — scaffold `libs/features/<feature>/{client,server,shared}` skeleton (package.json, tsconfig.json, src/index.ts).
4. `30-wire-routes.sh` — register `@features/<feature>` in `tsconfig.base.json` paths and `apps/api/src/app.module.ts`.
5. `40-port-tests.sh` — copy Vitest suites into the slice; add `docs/*.feature` BDD scaffold.
6. `50-update-docs.sh` — append `<feature>` section to `docs/architecture.md`; mirror to `Documents-es/`.
7. `99-finalize.sh` — final pre-PR validation (lint, typecheck, test, bdd, e2e).

Each script MUST guard with `set -euo pipefail`, print a header on
start, and end with `echo "stage NN: already applied" && exit 0` when
re-running on an empty branch (the idempotency contract from slice-1
Locked Decision #4).

Each script MUST be testable for idempotency. A RED test in
`scripts/migrate/__tests__/idempotency.test.sh` (NEW; uses `bats` or a
minimal bash loop) MUST assert: run the script twice on a fresh temp
branch; both invocations exit 0; the second invocation prints
`already applied` (or equivalent). GREEN: scripts implement the
guard. TRIANGULATE: missing `pnpm`, missing `docker`, missing `.git`.
REFACTOR: share an `ensure-tools.sh` helper across the seven.

#### Spanish mirrors

`Documents-es/docs/architecture.md` and
`Documents-es/docs/migration-playbook.md` MUST exist. The mirror MUST be
a technical Spanish translation (not cultural localization) of the
English source per AGENTS.md §13. Industry-standard English terms stay
in English: `commit`, `merge`, `branch`, `ADR`, `PR`, `slice`, `stage`,
`BDD`, `e2e`, `lint`, `typecheck`, `test`, `build`. Spanish prose
otherwise — sentences translated, not transposed word-for-word.

Both mirrors MUST be in the same atomic commit as their English source
(AGENTS.md §13 hard rule).

#### Mojibake verification

The verification command:

```bash
grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md
```

MUST return empty (exit 1 = no match). The verification MUST be run
manually before each docs commit lands.

#### Outcome gates (G14–G18 from proposal §5)

`docs/architecture.md` ≥400 LOC with the 12 sections above.
`docs/migration-playbook.md` ≥600 LOC with 11 sections, each ≥3
before/after snippets. `scripts/migrate/*.sh` exists with 7 files.
`Documents-es/docs/architecture.md` + `Documents-es/docs/migration-playbook.md`
exist. Mojibake verification returns empty.

#### MUST NOT touch

This sub-slice **MUST NOT** migrate `gastos-personales/` (AGENTS.md §11).
The playbook ships here; the actual migration runs in a separate
change with its own SDD lifecycle (per slice-1 §3 Locked Decision #7 +
slice-1 proposal line 822). This sub-slice MUST NOT introduce any
new e2e fixtures; the playbook references e2e by name only.

#### Scenario: Architecture document reaches the LOC floor

- GIVEN `docs/architecture.md` is rewritten from the 77-LOC stub
- WHEN `wc -l docs/architecture.md` runs
- THEN the count is ≥400 and ≤600
- AND the 12 sections listed above are all present (grep for each section heading)

#### Scenario: Playbook has ≥3 before/after snippets per stage

- GIVEN `docs/migration-playbook.md` is created
- WHEN `grep -c '^\s*```' docs/migration-playbook.md` runs
- THEN the count is ≥ (3 snippets × 2 fences × 7 stages) = 42 fenced blocks minimum

#### Scenario: Scripts are idempotent

- GIVEN `scripts/migrate/__tests__/idempotency.test.sh` is written
- WHEN the test runs each of the 7 scripts twice on a fresh temp branch
- THEN each script exits 0 on both invocations
- AND the second invocation prints `already applied` (or stage-NN-equivalent)

#### Scenario: Spanish mirrors exist and are CJK-clean

- GIVEN both English docs are committed in the same atomic commit as their Spanish mirrors
- WHEN `grep -P '[\x{4e00}-\x{9fff}]' Documents-es/docs/{architecture,migration-playbook}.md` runs
- THEN exit code is 1 (no match)
- AND `wc -l Documents-es/docs/{architecture,migration-playbook}.md` reports counts within ±20% of the English originals

---

## Cross-references

- **Proposal**: `openspec/changes/slice-8-closing-bdd-and-docs/proposal.md` (Engram #2226, `sdd/slice-8-closing-bdd-and-docs/proposal`)
- **Slice-7 close-out**: `bb25aab` on `develop` (PR-51 squash; 25/25 transactions BDD PASS)
- **Bridge-fix pattern source**: commit `a9b550d` in `libs/features/transactions/docs/support/register.ts`
- **Transactions spec template** (for shape reference, NOT a delta target):
  `openspec/changes/vertical-slicing-reference-scaffold/specs/transactions/spec.md` (507 LOC)
- **Slice-1 Locked Decision #4** (playbook dual format):
  `openspec/changes/vertical-slicing-reference-scaffold/proposal.md` line 93
- **Slice-1 task T8.5** (7 idempotent scripts):
  `openspec/changes/vertical-slicing-reference-scaffold/tasks.md` line 876
- **AGENTS.md §11** (out-of-scope, mirrored into proposal §4)
- **AGENTS.md §13** (Spanish mirror hard rule)
- **Existing fixtures** (pre-existing, NOT created by 8.3):
  `tools/eslint-plugin-boundary/__fixtures__/no-mojibake-in-docs/Documents-es/{invalid,valid}.md`
- **CI placeholder** (replaced by 8.2):
  `.github/workflows/ci.yml` line 187-196
- **Existing auth bridge** (replaced by 8.1):
  `libs/features/auth/docs/support/register.ts` (80 LOC, broken at lines 38-76)
- **Existing transactions bridge** (template for 8.1):
  `libs/features/transactions/docs/support/register.ts` (188 LOC, fixed at `a9b550d`)
- **Auth step bindings surface** (75 entries — 37 common + 38 realm — to be re-published):
  `libs/features/auth/docs/step-defs/{common,realm}.steps.ts`
- **Auth world type** (already declared, will be wrapped by 8.1):
  `libs/features/auth/docs/step-defs/world.ts` lines 55-126

---

## Resolved open questions (proposal §8)

### Question #1 — Auth slice's `setWorldConstructor` contract

**Answer**: The auth slice currently has NO `setWorldConstructor` call
(verified by `grep setWorldConstructor libs/features/auth/` returning
zero matches — only the transactions slice uses it). 8.1 MUST introduce
`setWorldConstructor(AuthWorldWrapper)` in the bridge, mirroring the
transactions wrapper at `libs/features/transactions/docs/support/register.ts`
lines 125-129.

The auth world's existing interface (`AuthWorld`, declared at
`libs/features/auth/docs/step-defs/world.ts` lines 55-97) is the canonical
state container and MUST remain unchanged — the wrapper just provides
the `.inner` indirection cucumber's `thisArg` mechanism requires.

The proposal's R1 mitigation (read `service-context.ts` before applying)
was performed. `service-context.ts` (235 LOC) is a module-level singleton
of `{ users: InMemoryUserRepository, authService: AuthService }`. It is
constructed once per bridge load and shared across scenarios. The
per-scenario `AuthWorld` carries step-level assertions; the
`ServiceContext` carries cross-scenario persistence. The 8.1 bridge fix
**MUST NOT** alter this two-tier design.

### Question #2 — Playbook format

**Answer**: Honour slice-1's **Locked Decision #4**: dual format
(`.md` prose + sibling `scripts/migrate/<stage>.sh` idempotent shells,
one per playbook stage). The seven script names from slice-1 task T8.5
are the contract: `00-preflight.sh`, `10-extract-domain.sh`,
`20-create-feature-slice.sh`, `30-wire-routes.sh`, `40-port-tests.sh`,
`50-update-docs.sh`, `99-finalize.sh`. Idempotency is mandatory.

The orchestrator's framing said "slice 1 introduced a dual-format `.md`
+ `.sh` contract" — the framing is correct; the artefact was NOT
delivered (slice-1's umbrella closed without shipping the playbook),
which is precisely why slice 8 picks it up. Locked Decision #4 has not
been amended; honour it.

---

## Out of scope

Mirrored from proposal §4 (which mirrors AGENTS.md §11) plus the slice-8-specific
additions:

1. Anything in AGENTS.md §11 (i18n beyond `en`/`es`, Sentry, rate-limit,
   OAuth beyond Google, prod hardening, observability, audit log UI,
   coverage gate enforcement at CI, migration of `gastos-personales/`).
2. Adding new BDD scenarios (slice 8 only fixes the bridge).
3. Migrating `gastos-personales/` to vertical slicing — playbook ships
   here; migration runs in a separate change.
4. Touching the slice-7 chain evidence (`a9b550d`, `bb25aab`).
5. Adding the Playwright e2e job to CI — the slice-1 placeholder at
   line 188 covers both BDD and e2e; slice 8 ships **only** the BDD gate.
6. Replacing the `a9b550d` bridge pattern with anything else —
   reinventing is forbidden.
7. Refactoring `tools/eslint-plugin-boundary` to TypeScript (rules are
   `.cjs`; converting is its own change).
8. Non-English artifact language (UI strings, comments, identifiers
   remain English; Spanish lives only in the mirror).
9. Adding a coverage gate to CI.
10. Building the OneNote mirror automation (the documented exception in
    AGENTS.md's docs-mirror rule).
11. Touching `openspec/changes/vertical-slicing-reference-scaffold/`
    (the slice-1 umbrella is immutable to slice 8).

---

## Review workload forecast

Per the orchestrator's `ask-on-risk` delivery strategy and the 400-line
review budget:

| Sub-slice | Estimated LOC | Budget risk | Decision needed before apply |
| --------- | ------------- | ----------- | ---------------------------- |
| 8.1       | ~180-220      | Low         | No                           |
| 8.2       | ~30-40        | Low         | No                           |
| 8.3       | ~40-60        | Low         | No                           |
| 8.4 PR-A  | ~800-1100     | High        | **Yes** — orchestrator stops per `ask-on-risk` if LOC > 1200 |
| 8.4 PR-B  | ~1500-2200    | High        | **Yes** — orchestrator stops per `ask-on-risk` if LOC > 1800; expect 3 chained PRs (skeleton, stages, mirror) |

**Chained PRs recommended**: Yes — slice 8 ships as 5 chained PRs under
`feat/slice-8-closing-bdd-and-docs` (8.1 → 8.2 → 8.3 → 8.4 PR-A → 8.4
PR-B, with 8.4 PR-B likely splitting further at apply time).

---

## Next phase

`next_recommended`: **`design`**.

The design phase (sdd-design) will produce:
- The exact `buildWrapper` adaptation for auth (path-level diff against
  the transactions bridge).
- The CI YAML shape with every `env` var aligned to the existing
  `test` job (slice-1 already has the Postgres service block at lines
  85-101 — design must declare reuse vs copy).
- The `eslint.config.mjs` parser block contents (per
  `@eslint/markdown@8.0.3` API surface).
- The 7 `scripts/migrate/*.sh` script bodies (one per stage; idempotency
  guard pattern).
- A `docs/architecture.md` outline showing every section's heading
  hierarchy.
- A `docs/migration-playbook.md` outline with the ≥3 before/after
  snippet locations per stage.

`status`: **`success`** · `skill_resolution`: **`paths-injected`**
(architecture-patterns, turborepo, work-unit-commits) · `risks`: R1
(WARNING — world-contract divergence resolved as documented above),
R2 (WARNING — docs expansion at ~2500 LOC total may need further PR
splitting at apply time), R3 (SUGGESTION — `@eslint/markdown` pin to
8.0.3 is the latest at spec time; document the bump procedure for
future upgrades).
# Tasks — `fix-build-env-runtime-validation`

> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` → tracker `feat/fix-build-env-runtime-validation`
> **Artifact store**: hybrid (Engram + `openspec/`)
> **Author**: SDD orchestrator → sdd-apply
> **Strict TDD**: ACTIVE
> **Reference**: `proposal.md` acceptance criteria, `explore.md` discovery facts

## Task ordering (3 tasks, 1 atomic PR)

The work is small enough to ship as a single PR with 3 atomic commits. Each commit is independently reviewable + revertable. Order: schema first (foundation), then barrel + 11 file swaps (mechanical), then verification + release (the gate that proves the fix).

---

## T1. Add `webEnvSchema` + `parseWebEnv` to a new `libs/core/config/web-env.schema.ts`

**TDD step**: RED first. Write a test that imports `webEnvSchema` and `parseWebEnv` and asserts both exist. Run the test → fail (module not found). GREEN: write the schema file. Test passes. TRIANGULATE: add a test for malformed input (missing field, bad URL) and for the prod-only fields being absent (must NOT fail).

**What**:
- Create `libs/core/config/web-env.schema.ts` with:
  - `NODE_ENV_VALUES = ["development", "test", "staging", "production"] as const`
  - `export type NodeEnv = ...`
  - `export const webEnvSchema = z.object({ NEXTAUTH_URL, NEXTAUTH_SECRET, JWT_SECRET, COOKIE_SECRET, PUBLIC_WEB_URL, PUBLIC_API_URL, API_URL, WEB_ORIGIN, NODE_ENV, ...optional like GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_ENABLED, AUDIT_RETENTION_DAYS, AUDIT_RETENTION_ENABLED, LOG_LEVEL, PORT })`
  - Note: only the fields the web actually reads. The full audit from `explore.md` §"Fields the web app actually reads" lists exactly what to include.
  - `export type WebEnv = z.infer<typeof webEnvSchema>`
  - `export const productionWebEnvSchema = webEnvSchema.superRefine(...)` — for v1.4.1, NO prod-only fields are required for the web, so the `superRefine` is a no-op (returns early if NODE_ENV !== "production"). The shape is preserved so future web-only prod fields have a home.
  - `export function parseWebEnv(source: Readonly<Record<string, unknown>>): WebEnv`

- Create `libs/core/config/__tests__/web-env.test.ts` with the TDD assertions.
  - **RED**: import the schema, assert it has the right fields.
  - **GREEN**: write the schema.
  - **TRIANGULATE**: add a test that asserts BACKUP_DSN is NOT in the WebEnv type (compile-time check: `const x: WebEnv = ...; // expect no BACKUP_DSN` — use a `// @ts-expect-error` comment to pin the negative case). Add a runtime test that asserts `parseWebEnv({...valid web fields})` succeeds when BACKUP_DSN is absent.

**Acceptance**:
- [ ] The new file exists and exports `webEnvSchema`, `WebEnv`, `parseWebEnv`, `productionWebEnvSchema`.
- [ ] The new test passes.
- [ ] The TypeScript compile-time check confirms `BACKUP_DSN` is NOT in `WebEnv`.

**Files touched**: 1 created, 1 created (test).

---

## T2. Add barrel `@core/config/web` + update 11 files in `apps/web` to import from the new entry point

**TDD step**: not TDD in the test-first sense — this is a mechanical import-line change. The verification is typecheck (which IS a test of sorts) + the build gate that was the whole point of the fix.

**What**:
- Create `libs/core/config/web.ts` (single-line barrel):
  ```ts
  export { webEnvSchema, productionWebEnvSchema, parseWebEnv } from "./web-env.schema.js";
  export type { WebEnv } from "./web-env.schema.js";
  import { parseWebEnv } from "./web-env.schema.js";
  import { envSchema as _apiEnvSchema } from "./env.schema.js"; // unused at runtime; kept for type-only re-export
  export const env = parseWebEnv(process.env);
  ```
  Wait — re-check. The `env` constant is parsed at module load time, so the barrel needs to be careful: it should NOT cause `process.env` parsing on the API path. Confirm: the new barrel lives at `@core/config/web` and is only imported by `apps/web`. `apps/api` keeps importing from `@core/config`. No cross-pollution.

- Update `tsconfig.base.json` (or `apps/web/tsconfig.json` if paths are local) to add the path alias `@core/config/web` → `libs/core/config/web.ts`. (The path alias is already in place for `@core/config`; we just add a sibling.)

- Update the 11 files in `apps/web` (the list from `explore.md`):
  - `apps/web/auth.ts`
  - `apps/web/app/api/status/route.ts`
  - `apps/web/app/[locale]/welcome/page.tsx`
  - `apps/web/app/[locale]/status/page.tsx`
  - `apps/web/app/[locale]/(auth)/reset-password/[token]/page.tsx`
  - `apps/web/app/[locale]/(auth)/sign-in/page.tsx`
  - `apps/web/app/[locale]/(auth)/sign-up/page.tsx`
  - `apps/web/app/[locale]/(auth)/forgot-password/page.tsx`
  - `apps/web/app/[locale]/(auth)/dev/mailbox/[userId]/page.tsx`
  - plus 2 more that the rg will surface during the apply phase.

  Change: `from "@core/config"` → `from "@core/config/web"`.

**Acceptance**:
- [ ] `libs/core/config/web.ts` exists and exports `env`, `webEnvSchema`, `parseWebEnv`, `WebEnv`.
- [ ] The tsconfig path alias is in place.
- [ ] All 11+ files in `apps/web` updated.
- [ ] `rg "from ['\"]@core/config['\"]" apps/web` returns ZERO matches.
- [ ] `rg "from ['\"]@core/config/web['\"]" apps/web` returns the expected count.
- [ ] `pnpm turbo run typecheck` is green.

**Files touched**: 1 created, 1 modified (tsconfig), 11+ modified (imports).

---

## T3. Verify all gates + release as v1.4.1

**TDD step**: not applicable — this is the verification + release phase.

**What**:
- Run the full quality matrix:
  - `pnpm turbo run typecheck` (15/15)
  - `pnpm turbo run lint` (14/14)
  - `pnpm turbo run test` (15/15, including the new web-env tests from T1)
  - `pnpm turbo run bdd` (5/5)
  - `pnpm playwright test` (66/66)
  - **`pnpm turbo run build --filter=web`** in a clean shell with NO env secrets set — this is the new gate, must be green for the first time ever.
  - `pnpm turbo run build --filter=api` with the API env secrets set — must still be green (regression check that the API schema is unchanged).

- Bump versions: `apps/web/package.json` and `apps/api/package.json` from 1.4.0 → 1.4.1 (PATCH).

- Update `CHANGELOG.md` with the v1.4.1 entry (notes the build fix, the schema split, and the verification matrix).

- Commit the 3 work-unit commits on `feat/fix-build-env-runtime-validation`:
  - Commit 1: T1 (schema + tests)
  - Commit 2: T2 (barrel + 11 import swaps)
  - Commit 3: T3 (bumps + CHANGELOG)

- Push the branch. Open PR against `develop` → merge → open PR against `main` → merge with `--admin` (branch protection). Tag `v1.4.1`. `gh release create v1.4.1` with the CHANGELOG body.

- Update the engram observation #3022 ("Web build requires BACKUP_DSN + GMAIL secrets under NODE_ENV=production") to mark it closed by the v1.4.1 release.

**Acceptance**:
- [ ] All gates green.
- [ ] The new "build with no secrets" gate is green.
- [ ] The API regression check is green.
- [ ] v1.4.1 tag + release published.
- [ ] engram obs #3022 updated.

**Files touched**: 2 modified (package.jsons), 1 modified (CHANGELOG).

---

## Risk and rollback

- **T1 risk**: the schema misses a field the web actually reads → typecheck fails (the `env.X` reference becomes `any` or errors). Rollback: `git revert T1`.
- **T2 risk**: the import swap misses a file → that file still imports the API env schema. Mitigation: `rg` post-swap asserts the count. Rollback: `git revert T2`.
- **T3 risk**: the build passes locally but fails in CI due to a missing env. Mitigation: the build host in GH Actions injects the same env as v1.4.0 did, so the API build still works. The WEB build now ignores that env, so the addition or removal of API env vars in CI is irrelevant to the web build. Rollback: `gh release delete v1.4.1` + `git push --delete origin v1.4.1` + revert the PR.

The slice is small enough that a single PR with 3 atomic commits is the right shape (per the AGENTS.md §5 work-unit guidance).

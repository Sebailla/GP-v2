# AGENTS.md

Project-local conventions for any AI agent (or human) operating on
`gastos-personales-reference`. Mirrors the relevant subset of
`openspec/config.yaml` so an agent that does not traverse the
openspec folder still has the rules.

## §1. Identity

- **Project**: `gastos-personales-reference`.
- **Purpose**: reference / spike repo validating the vertical-slicing
  monorepo model.
- **Stack**: TypeScript 5 strict, pnpm 10.x, Turbo 2.x, Next.js 15
  (apps/web), NestJS 10 (apps/api), Prisma + Postgres, Zod, next-auth
  v5 + `@auth/prisma-adapter`, Vitest, Cucumber, Playwright +
  @axe-core/playwright.
- **License**: MIT.

## §2. Branch model

- `main` is **immutable**. Never commit, push, merge, rebase, or
  delete from `main` (GitHub-protected: no force-push, no delete).
- `develop` is the working branch. Feature branches are cut from
  `develop`, never from `main`.
- For SDD-chained PRs, the tracker branch is
  `feat/<change-name>`; child PRs target the tracker branch per
  `chain_strategy=feature-branch-chain`.

## §3. Quality gates

- `pnpm install` exits 0.
- `pnpm db:up && docker compose ps` shows Postgres healthy.
- `pnpm turbo run build lint typecheck test` exits 0 across all
  workspaces.
- `pnpm lint:fixtures` exits 0 (boundary plugin sanity check).
- `pnpm turbo run bdd e2e` exits 0 (slices 7+).

## §4. Strict TDD

`strict_tdd: true` is active. Every production-code task follows
**RED → GREEN → TRIANGULATE → REFACTOR**. A failing test must exist
before any production code is written; the failing test must be
observed; only the minimum code to pass is written; more cases
triangulate edge behavior; refactor cleans up without changing
behavior. Exceptions: throwaway prototypes, generated code,
pure config files (these do not require tests but must keep the
pipeline green).

## §5. Atomic commits

Each task lands as its own atomic commit. `git revert <sha>`
reverses a task cleanly. Tests and docs stay with the code they
verify. Work-unit commits over file-type commits: avoid
`add models`, then `add services`, then `add tests`; prefer
`feat(auth): add token validation domain model and tests`.

## §6. Conventional Commits

- Type: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`,
  `build`, `ci`, `perf`, `style`.
- Subject: imperative present, ≤72 chars, no trailing period.
- Body explains WHY, not WHAT.
- **No "Co-Authored-By" or AI attribution** in commit messages.

## §7. Architectural boundaries (enforced by ESLint)

The custom plugin at `tools/eslint-plugin-boundary/` enforces:

- `no-prisma-outside-core` — `new PrismaClient()` is allowed only
  in `libs/core/database/src/`. Use `@core/database` everywhere else.
- `no-schemas-outside-shared` — Zod schema literals live only in
  `libs/features/<x>/shared/schemas/` and
  `libs/core/config/env.schema.ts`.
- `no-client-server-import` — `libs/features/<x>/client/` files
  MUST NOT import from `*/server/` paths.
- `no-cross-module-import` — `libs/features/<x>/...` MUST NOT
  import directly from `libs/features/<y>/...` (route through
  `@core/events` or a shared port instead).
- `no-mojibake-in-docs` (optional) — `Documents-es/**/*.md` MUST
  NOT contain CJK / ideographic codepoints (auto-translation drift).

Run `pnpm lint:fixtures` to assert every rule fires on its
`invalid.{ts,md}` fixture and stays silent on its `valid.{ts,md}`.

## §8. Single source of truth (no duplication)

- Zod schemas: one module per logical input, imported by both
  client form and server validation pipe. ESLint enforces.
- Prisma client: one singleton, exported from `@core/database`.
  ESLint enforces.
- Cross-module side effects: `@core/events` only. ESLint enforces.

## §9. UI complete, not scaffold (USER-PROVIDED RULE)

Every `libs/features/*` module ships with its complete final UI:

- All 5 form states (loading, error, success, empty, validation-error).
- WCAG AA (per `@axe-core/playwright` audit).
- Locale-prefixed routes via `next-intl` (`/en/...`, `/es/...`).
- Component tests + e2e tests per critical surface.
- No placeholder pages, no stub components.

## §10. Testing

- **Unit / integration**: Vitest, colocated as `__tests__/*.test.ts`.
- **BDD**: `@cucumber/cucumber`, reading
  `libs/features/*/docs/*.feature`. Step definitions shared per
  feature under `docs/step-defs/`.
- **E2E**: Playwright with two projects (`en`, `es`).
  `@axe-core/playwright` integrated per project.
- **Coverage target**: 60% lines / branches / functions / statements
  (declared in `openspec/config.yaml`; **not enforced as a CI gate**
  in this slice).

## §11. Out of scope

The following are explicitly **out of scope** for this reference
repo and must NOT ship as part of any slice:

- i18n beyond `en` + `es`.
- Sentry / error reporting SaaS.
- API edge rate-limiting.
- Multiple OAuth providers beyond Google.
- Production hardening (secrets manager, HSTS, CSP beyond Next
  defaults, CDN config).
- Observability (OpenTelemetry, Prometheus, log shipping).
- Coverage gate enforcement at CI.
- Migration of `gastos-personales/` to the vertical-slicing model
  (the playbook ships here; the migration runs in a separate change).
- Audit log UI.

## §12. Pre-commit checklist

Before `git commit`:

- [ ] The change has one clear purpose (work-unit commit).
- [ ] Tests or docs for this unit are included when relevant.
- [ ] Rollback is reasonable without reverting unrelated work.
- [ ] Commit message explains WHY, not WHAT.
- [ ] No "Co-Authored-By" line; no AI attribution.
- [ ] ESLint boundaries still pass (`pnpm lint:fixtures`).
- [ ] If Markdown was added under `openspec/` or `docs/`, the
      Spanish mirror under `Documents-es/` is in the **same** commit.

## §13. Spanish mirror (HARD RULE)

Every English `.md` produced under `openspec/` or `docs/` MUST
have its Spanish mirror under `Documents-es/` in the **same
atomic commit**. Verify with:

```bash
grep -P '[\x{4e00}-\x{9fff}]' Documents-es/<file>.md
```

The mirror MUST be empty (no CJK characters; usually indicates
auto-translation drift). The ESLint rule `no-mojibake-in-docs`
will eventually enforce this at lint time once the
`@eslint/markdown` parser is wired (deferred to slice 8).

## §14. Conventions cache

Project-scoped conventions persisted in Engram:

- `gastos-personales-reference/conventions/branch-model` (id 2129).
- `gastos-personales-reference/conventions/doc-mirror-spanish` (id 2132).
- `gastos-personales-reference/conventions/ui-complete-not-scaffold` (id 2133).

When in doubt, `mem_search(query="<topic>", project="gastos-personales-reference")`.

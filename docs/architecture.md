# Architecture

> **Status**: expanded sections 1-6 (slice 8 PR-A1). Sections 7-12 land in
> slice 8 PR-A2 (`feat/v1.1.2-slice-8-docs-arch-a2`); Spanish mirror
> (`Documents-es/docs/architecture.md`) ships with PR-A2 per
> AGENTS.md §13.
> **Project**: `gastos-personales-reference`.
> **Source of truth**: `openspec/changes/vertical-slicing-reference-scaffold/`
> (slice-1 umbrella) + `openspec/changes/slice-8-closing-bdd-and-docs/`
> (this slice).

This document is the architectural map of the
`gastos-personales-reference` monorepo. Read it before adding a
feature, refactoring a slice, or wiring a new ESLint boundary. The
intent is to let a reviewer verify intent from one document rather
than reconstruct it from fifty files.

## 1. Overview + non-goals

The repo is a runnable, publicable reference scaffold that validates
the vertical-slicing monorepo model documented in
`openspec/changes/vertical-slicing-reference-scaffold/proposal.md`.
It is **not** a 1:1 copy of the existing `gastos-personales/`
project; it exists to validate the model before any production
migration. Slice-1 Locked Decision #11 keeps the repo alive only
until the first real migration slice from `gastos-personales/` is
started — at which point this repo archives.

**What this repo IS**: two runnable apps (`apps/web` Next.js 15,
`apps/api` NestJS 10), three shared library roots (`libs/core`,
`libs/features`, `libs/shared-utils`), an executable migration
playbook, bilingual docs, and a custom ESLint plugin that enforces
the architectural boundaries at lint time.

**What this repo IS NOT** (AGENTS.md §11, locked at slice-1):

- A production deployment target (no secrets manager, no HSTS, no
  CDN, no rate limiting, no observability beyond what Node logs).
- i18n beyond `en` + `es`.
- A migration of `gastos-personales/` — the playbook ships here;
  the migration runs in a separate change.
- An opinion on every OAuth provider, error-reporting SaaS, or
  coverage-gate policy.

{ #section-1 }

## 2. Repository layout

The workspace is `pnpm`-based with three roots (`apps/`, `libs/`,
`tools/`) plus planning artifacts under `openspec/` and `docs/`.
Every workspace is a path-aliased package; consumers import via the
alias, never by relative path into another workspace.

```text
.
├── apps/
│   ├── api/                # NestJS 10 — thin module wrappers around @features/*
│   └── web/                # Next.js 15 App Router
├── libs/
│   ├── core/
│   │   ├── config/         # Zod env schema + env.ts entry
│   │   ├── database/       # Prisma client singleton + schema + migrations
│   │   └── events/         # In-memory dispatcher + 9-event catalog
│   ├── features/
│   │   ├── auth/           # { server, shared, docs }
│   │   └── transactions/   # { server, shared, docs }
│   └── shared-utils/
│       ├── currency/
│       ├── date-formatting/
│       └── decimal/        # decimal.js wrapper (D-TX-6)
├── tools/
│   └── eslint-plugin-boundary/   # the five boundary rules + fixtures
├── docs/                   # English documentation
├── Documents-es/docs/      # Spanish mirror of docs/
├── openspec/               # SDD artifacts (proposal, spec, design, tasks)
├── scripts/migrate/        # 7 idempotent .sh scripts (Locked Decision #4)
├── AGENTS.md               # project-local conventions
├── docker-compose.yml      # Postgres 16-alpine only
├── eslint.config.mjs       # flat config + boundary rules
├── package.json            # root workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json      # strict + 11 path aliases
└── turbo.json              # 8 pipelines: build/dev/lint/test/typecheck/bdd/e2e/clean
```

**Why three library roots, not one.** `libs/core` holds the
non-feature infrastructure (Prisma client, env config, event
dispatcher) that every slice consumes. `libs/features/<x>` holds
domain slices whose `client/server/shared/docs` boundary is the
reference's core architectural contract. `libs/shared-utils` holds
pure helpers (no I/O, no framework deps) — the `decimal.js` wrapper
here is what D-TX-6 requires for monetary math.

**The `client/` anomaly in this slice's current state.** Slice-1's
proposal design (lines 189-202) and the `tsconfig.base.json` paths
(`@features/auth/*` → `libs/features/auth/*`) declare a `client/`
subdirectory under every feature slice. The current scaffold does
NOT yet have `libs/features/<x>/client/` — client components live
under `apps/web/components/auth/` and `apps/web/components/transactions/`.
The migration playbook (`docs/migration-playbook.md`, PR-B) is what
fixes that asymmetry for the first real migration slice from
`gastos-personales/`. The `@features/auth/*` alias already covers
both the future `client/` path and the current `server/` path, so
no path-alias change is needed when the `client/` directories land.

{ #section-2 }

## 3. Monorepo tooling

The monorepo is `pnpm` 10.x workspaces orchestrated by `turbo.json`.
TypeScript 5 strict, with `noUncheckedIndexedAccess` +
`exactOptionalPropertyTypes`, is the single source of type truth
across every workspace.

**Path aliases** (`tsconfig.base.json`):

| Alias | Resolves to |
|---|---|
| `@core/database` | `libs/core/database/src` |
| `@core/database/*` | `libs/core/database/src/*` |
| `@core/events` | `libs/core/events/src` |
| `@core/events/*` | `libs/core/events/src/*` |
| `@core/config` | `libs/core/config` |
| `@core/config/*` | `libs/core/config/*` |
| `@features/auth` | `libs/features/auth/server` |
| `@features/auth/*` | `libs/features/auth/*` |
| `@features/transactions` | `libs/features/transactions/server` |
| `@features/transactions/*` | `libs/features/transactions/*` |
| `@shared-utils/*` | `libs/shared-utils/*` |

Every workspace consumes dependencies via these aliases, never by
relative `../../../libs/...` reach-throughs. The boundary ESLint
plugin enforces the same rule at the AST level (§10).

**Turbo pipelines** (`turbo.json`):

| Task | `dependsOn` | Cacheable | Notes |
|---|---|---|---|
| `build` | `^build` | yes | outputs `dist/**` + `.next/**` (excluding `.next/cache` and `.next/dev`) |
| `dev` | — | no | persistent; never cached |
| `lint` | `^build` | yes | flat config + boundary rules |
| `test` | `^build` | yes | Vitest, output `coverage/**` |
| `typecheck` | `^build` | yes | `tsc --noEmit` per workspace |
| `bdd` | `build` | yes | Cucumber; output `bdd-reports/**` (slice 7+) |
| `e2e` | `build` | yes | Playwright; output `playwright-report/**` + `test-results/**` |
| `coverage` | `^build` | yes | output `coverage/**` |
| `clean` | — | no | nukes `dist`, `.next`, `.turbo`, `coverage`, `bdd-reports`, `playwright-report` |

`dependsOn: ["^build"]` means "build my dependencies before I
build." Combined with `turbo`'s content-hash cache, this gives
PR-level incremental rebuilds.

**ESLint**: flat config (`eslint.config.mjs`) wires the
custom `eslint-plugin-boundary` for the five boundary rules plus
the standard TypeScript and Prettier rules. The `no-mojibake-in-docs`
rule ships with slice 8 PR #3 (#56): it scans
`Documents-es/**/*.md` for CJK / ideographic codepoints so
auto-translation drift fails at lint time, not in production.

**Prettier**: `prettier.config.mjs` at the root, applied via
`pnpm format`. Slice 7 PR #3 (#43) anchored a repo-wide format pass
so subsequent diffs stay readable.

{ #section-3 }


# gastos-personales-reference

Reference repository validating the **vertical-slicing monorepo model**
for personal expense tracking. Greenfield, runnable, publicable.

This repo is **not** a 1:1 copy of the existing `gastos-personales/`
project. It exists to validate the proposed architecture before
migrating production code.

## Stack

- **TypeScript 5** strict, `pnpm@10.15.0`, `turbo@2.3.3`.
- **Next.js 15** App Router (`apps/web`).
- **NestJS 10** (`apps/api`).
- **Prisma + Postgres** (`libs/core/database`).
- **Zod** as the single source of truth for validation on both sides.
- **NextAuth v5** + `@auth/prisma-adapter` for auth.
- **Vitest** for unit tests; **Cucumber** for BDD; **Playwright + @axe-core** for e2e + a11y.
- **ESLint flat config** with a custom boundary plugin enforcing
  the vertical-slicing architecture.

## Quickstart

```bash
pnpm install                    # install workspace deps
pnpm db:up                      # boot Postgres via docker-compose
pnpm prisma migrate dev         # apply database migrations
pnpm dev                        # run apps/web + apps/api concurrently
```

Then open `http://localhost:3000` (web) and `http://localhost:3001` (api).

## Layout

```
.
├── apps/
│   ├── web/                    # Next.js 15 App Router
│   └── api/                    # NestJS 10
├── libs/
│   ├── core/                   # database (Prisma), events, config
│   ├── features/               # auth + transactions (client/server/shared)
│   └── shared-utils/           # date-formatting, currency, decimal
├── tools/
│   └── eslint-plugin-boundary/ # custom ESLint plugin (4 architectural rules)
├── docs/                       # English documentation (canonical)
├── Documents-es/               # Spanish mirror (HARD RULE)
├── openspec/                   # SDD planning artifacts
└── scripts/migrate/            # idempotent migration playbook scripts
```

## Scripts

| Command                   | What it does                        |
| ------------------------- | ----------------------------------- |
| `pnpm dev`                | Run both apps concurrently (turbo)  |
| `pnpm build`              | Build all workspaces                |
| `pnpm test`               | Run Vitest across workspaces        |
| `pnpm typecheck`          | `tsc --noEmit` across workspaces    |
| `pnpm lint`               | ESLint across workspaces            |
| `pnpm lint:fixtures`      | Run boundary plugin's rule fixtures |
| `pnpm bdd`                | Cucumber scenarios                  |
| `pnpm e2e`                | Playwright (with axe-core a11y)     |
| `pnpm db:up`              | docker compose up -d postgres       |
| `pnpm db:down`            | docker compose down                 |
| `pnpm db:reset`           | docker compose down -v && up -d     |
| `pnpm db:logs`            | docker compose logs -f postgres     |
| `pnpm prisma migrate dev` | Apply Prisma migrations             |
| `pnpm format`             | Prettier write                      |
| `pnpm format:check`       | Prettier check                      |

## Conventions

- Branch model: `main` (immutable) ← `develop` ← `feat/<name>`.
- Every `.md` under `openspec/` or `docs/` has a Spanish mirror under
  `Documents-es/`, produced in the **same atomic commit** (HARD RULE).
- Every `libs/features/*` module ships complete UI, not scaffolds.
- Strict TDD: every production-code change is preceded by a failing
  test (RED → GREEN → TRIANGULATE → REFACTOR).

See `AGENTS.md` for the project-local conventions and
`openspec/config.yaml` for the canonical configuration.

## License

MIT — see `LICENSE`.

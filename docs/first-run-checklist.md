# First-run Checklist

> Validates a clean clone of `gastos-personales-reference` end-to-end.
> Replays the same gates `sdd-verify` runs. **Success criterion: all exit 0.**

## 1. Prerequisites

- Node ≥ 22.13.0 (see `.nvmrc`)
- pnpm ≥ 11 (auto-installed via `packageManager` field via corepack)
- Docker daemon running (Postgres container)

## 2. Install

```bash
corepack enable
pnpm install
```

## 3. Database (Postgres via Docker Compose)

```bash
pnpm db:up
docker compose ps   # expect service `postgres` healthy
```

## 4. Prisma migrations (deferred from sandbox; run on local machine)

```bash
pnpm prisma:generate
pnpm prisma:migrate:dev --name init
```

## 5. Quality gates

```bash
pnpm turbo run build lint typecheck
pnpm turbo run test
node tools/eslint-plugin-boundary/scripts/run-fixtures.mjs
```

## 6. Apps smoke

```bash
pnpm --filter web build    # Next.js production build
pnpm --filter api build    # Nest production build
```

## 7. Success criterion

**All exit 0.** If any check fails, file a fix-task against the offending slice's task in `openspec/changes/archive/2026-07-05-vertical-slicing-reference-scaffold/tasks.md`.

# Contributing

Thanks for your interest in `gastos-personales-reference`. This is a
reference repository for validating a vertical-slicing monorepo
model. Contributions should advance the goal of producing a faithful
reusable scaffold.

## How to contribute

1. **Open an issue first** describing the change you want to make.
   Even small changes benefit from a one-line alignment on intent.
2. **Branch from `develop`**: `git checkout -b feat/<short-name>`
   (or `chore/<short-name>`, `fix/<short-name>` per Conventional Commits).
3. **Keep commits atomic and conventional**: one logical change per
   commit, message in the form `<type>(<scope>): <subject>`.
   Subject is imperative present, ≤72 chars; body explains WHY.
4. **Tests are required** for production-code changes (strict TDD).
   Config / docs / scaffolding changes do not require tests but
   must keep `pnpm turbo run build lint typecheck` green.
5. **Documentation in both languages**: every `.md` under `openspec/`
   or `docs/` MUST have its Spanish mirror under `Documents-es/` in
   the same atomic commit (HARD RULE; see `AGENTS.md` §13).
6. **Open a PR against `develop`** (not `main`). The PR description
   should list the slice (1-8) and the gate(s) it advances.

## Commit message format

```
<type>(<scope>): <subject>

<body explaining WHY, not WHAT>

<footer with references>
```

Allowed `type`: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`,
`build`, `ci`, `perf`, `style`.

## Quality gates

Every PR must leave these green:

- `pnpm install` → exit 0.
- `pnpm db:up && docker compose ps` → Postgres healthy.
- `pnpm turbo run build lint typecheck test` → exit 0.
- `pnpm lint:fixtures` → exit 0 (boundary plugin sanity check).
- The relevant slice's `docs/slice-<n>-checklist.md` items pass.

## What we don't accept

- Direct commits to `main` or `develop` — always use a feature branch.
- AI attribution in commit messages.
- Placeholder UI or stub components on `libs/features/*`.
- Zod schemas outside `libs/features/*/shared/schemas/*` (enforced
  by ESLint).
- `new PrismaClient()` outside `libs/core/database/src/`
  (enforced by ESLint).

## Reporting bugs

Open an issue with a minimal reproduction. For security issues,
see `SECURITY.md` (placeholder; create one if reporting privately).

## License

By contributing you agree your contributions are licensed under the
MIT License (see `LICENSE`).

# `@shared-utils/*`

Pure helpers shared across the `gastos-personales-reference`
monorepo. Each helper is a standalone package with its own
`tsconfig.json`, barrel `src/index.ts`, and Vitest suite under
`src/__tests__/`.

## Packages

| Package | Purpose | Depends on |
|---------|---------|------------|
| `@shared-utils/date-formatting` | Timezone-safe date formatting via `Intl.DateTimeFormat`; ISO 8601 parsing. | none |
| `@shared-utils/currency` | Format `decimal.js` values to localized currency strings via `Intl.NumberFormat`. | `decimal.js` |
| `@shared-utils/decimal` | Thin wrappers around `decimal.js` for monetary math. **Never `BigInt`** (per D-TX-6). | `decimal.js` |

## Conventions

- Every helper is a **pure function** — no I/O, no framework deps.
- Tests live next to the source under `__tests__/`. Strict TDD: every
  helper ships with RED → GREEN → TRIANGULATE → REFACTOR evidence
  in the slice's `apply-progress.md`.
- The path alias `@shared-utils/<name>` resolves to this folder's
  `<name>/src/index.ts` (per `tsconfig.base.json`).
- `@shared-utils/decimal` is the **only** place `BigInt` is
  forbidden by architecture convention; arithmetic helpers wrap
  `decimal.js` so the rest of the codebase never reaches for
  primitive `number` math on money.

## When to add a new helper

Add a new package under this folder when:

- Two or more feature modules need the same pure helper.
- The helper has no dependencies beyond the standard library or
  `decimal.js` (no Prisma, no NestJS, no React).

Do NOT add a package here for:

- Type aliases or constants — co-locate with the consumer.
- Anything that touches `process.env`, the network, or the file
  system — those belong in `libs/core/`.

## Spanish mirror

This file is mirrored under
`Documents-es/libs/shared-utils/README.md` per AGENTS.md §13.

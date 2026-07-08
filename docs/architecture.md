# Architecture

> **Status**: stub (slice 1). Full content lands in slice 8
> (`openspec/changes/vertical-slicing-reference-scaffold/tasks.md`
> §T8.1 + §T8.2).
> **Project**: `gastos-personales-reference`.
> **Spanish mirror**: `Documents-es/docs/architecture.md`
> (HARD RULE per AGENTS.md §13).

This document captures the architecture of the `gastos-personales-reference`
monorepo. The slice-1 stub below names the six sections that the
full document will cover; each section gets 2–4 lines of placeholder
prose so reviewers can confirm the structure exists today.

## 1. Overview

The repo is a runnable, publicable reference scaffold that validates
the vertical-slicing monorepo model described in the proposal
(`openspec/changes/vertical-slicing-reference-scaffold/proposal.md`).
It is **not** a 1:1 copy of the existing `gastos-personales/`
project; it exists to validate the model before any production
migration.

## 2. Repository layout

Two runnable apps (`apps/web` for Next.js 15, `apps/api` for NestJS
10), three shared library roots (`libs/core`, `libs/features`,
`libs/shared-utils`), the boundary ESLint plugin (`tools/`), and
planning artifacts under `openspec/`. Full tree in
`openspec/changes/vertical-slicing-reference-scaffold/design.md`
§2; slice 8 expands this section with prose per directory.

## 3. Monorepo tooling

pnpm 10.15.0 with `pnpm-workspace.yaml`, Turbo 2.3.3 with the eight
pipelines declared in `turbo.json` (`build`, `dev`, `lint`,
`lint:fixtures`, `test`, `typecheck`, `bdd`, `e2e`, `coverage`,
`clean`). TypeScript 5.6.3 strict across every workspace; base
config in `tsconfig.base.json` declares the eleven path aliases
that downstream packages consume.

## 4. Domain design: auth

Lives under `libs/features/auth/{client,server,shared,docs}`. The
server slice ships AuthService, SessionService, RbacService,
PasswordResetService, NextAuth v5 config (Credentials + Google via
`@auth/prisma-adapter`), and the four emitted events. The shared
slice ships five Zod schemas reused by client forms and the
NestJS ZodValidationPipe. Full design in
`openspec/changes/vertical-slicing-reference-scaffold/design.md` §4.

## 5. Domain design: transactions

Lives under `libs/features/transactions/{client,server,shared,docs}`.
The server slice ships TransactionService, CategoryService,
TotalsService, ThresholdService; six Prisma repository adapters;
the InMemoryFxRateProvider; and five emitted events. The shared
slice ships five Zod schemas. Soft-delete filter on every category
query is a non-negotiable invariant (D-TX-5). Full design in
`openspec/changes/vertical-slicing-reference-scaffold/design.md` §5.

## 6. Cross-cutting concerns

Single-source invariants enforced by ESLint: `new PrismaClient()` is
allowed only in `libs/core/database/src/`; Zod schemas live only in
`libs/features/<x>/shared/schemas/` and `libs/core/config/env.schema.ts`;
cross-module side effects route through `@core/events`. The custom
boundary plugin (`tools/eslint-plugin-boundary/`) exposes five rules
with fixture-driven sanity check via `pnpm lint:fixtures`. Locale
prefixing uses `next-intl` (slice 4); design tokens extract from the
existing `gastos-personales/` repo (slice 4).

---

_Full prose for each section lands in slice 8. See
`openspec/changes/vertical-slicing-reference-scaffold/tasks.md` §T8.1
(English) and §T8.2 (Spanish mirror)._

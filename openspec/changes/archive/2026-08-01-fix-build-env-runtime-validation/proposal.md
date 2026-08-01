# Proposal — `fix-build-env-runtime-validation`

> **Status**: draft · proposal phase · **Date**: 2026-08-01
> **Project**: `gastos-personales-reference` (key: `gp-v2`)
> **Branch**: `develop` → tracker `feat/fix-build-env-runtime-validation`
> **Mode**: auto · **Artifact store**: hybrid · **Delivery strategy**: `single-pr` (small fix, no chained work units) · **Version bump**: v1.4.0 → v1.4.1 (PATCH) · **Strict TDD ACTIVE**

## Intent

Split the `@core/config` env schema into a web-only minimal schema and keep the existing API schema intact, so the Next.js production build (`NODE_ENV=production`) for `apps/web` no longer requires the API's runtime-only env vars (`BACKUP_DSN`, `METRICS_TOKEN`, `UPSTASH_REDIS_REST_*`, `GMAIL_*`). Closes the engram obs #3022 discovery and makes `pnpm turbo run build` runnable in any clean dev environment without the API's secrets.

## What changes

### New file: `libs/core/config/web-env.schema.ts`

A self-contained Zod schema for the web app's env surface, with only the 6-7 fields the web actually reads (plus a small `superRefine` for prod-only web fields, if any are added later — not needed for v1.4.1). The schema mirrors the structure of the existing `env.schema.ts` (importable `parseWebEnv` + exported `webEnvSchema` + `WebEnv` type) so the consumption pattern is identical.

### New file: `libs/core/config/web.ts` (or `index.web.ts`)

A thin barrel that exports `env`, `webEnvSchema`, `parseWebEnv`, and the `WebEnv` type from the new schema. The 11 files in `apps/web` that currently import `env` from `@core/config` are updated to import from the new entry point.

### Updated files (import-line edits, no behavior change)

11 files in `apps/web` swap `from "@core/config"` to `from "@core/config/web"` (or whichever subpath name the implementation chooses). The change is mechanical: a `rg`-based find-and-replace verified before commit.

### NOT changed

- `apps/api/**` — the API keeps importing from `@core/config` and continues to fail-fast at startup on missing prod-only fields. This is the correct contract for the API.
- `libs/core/database/**` — same.
- `libs/core/config/env.schema.ts` — untouched.
- `.env.example` — untouched (the existing file documents the API env; the web env can be documented inline in `web-env.schema.ts` if needed).
- GitHub Actions workflow — the workflow can keep injecting the API env vars (the API process still consumes them at runtime); the web build no longer cares.

## Acceptance criteria

- [ ] `libs/core/config/web-env.schema.ts` exists with the 6 web fields + the same `parseEnv` / `Env` type pattern.
- [ ] `libs/core/config/web.ts` (or `index.web.ts`) re-exports from the new schema.
- [ ] All 11 files in `apps/web` import `env` from the new entry point.
- [ ] `pnpm turbo run typecheck` is green (15/15).
- [ ] `pnpm turbo run lint` is green (14/14).
- [ ] `pnpm turbo run test` is green (15/15, no new test changes).
- [ ] `pnpm turbo run bdd` is green (5/5).
- [ ] `pnpm playwright test` is green (66/66).
- [ ] **`pnpm turbo run build --filter=web` is green** in a clean shell with NO env secrets set (the env file can be empty or absent). This is the new assertion that didn't exist before the fix.
- [ ] `pnpm turbo run build` (full, including `apps/api`) is still green **with** the API env secrets set (the API still consumes them at startup).
- [ ] The `apps/api` process still fail-fast if the prod-only env is missing at runtime.
- [ ] No new public API surface; no version bump beyond v1.4.1.
- [ ] `rg "from ['\"]@core/config['\"]" apps/web` returns ZERO matches (the web uses only the new entry point).
- [ ] `rg "from ['\"]@core/config['\"]" apps/api libs` returns the same set as before (the API still uses the full schema).

## Out of scope

- Renaming `@core/config` to `@core/config/api` (the existing barrel still works for the API; the name change is a cosmetic refactor that can ship separately).
- Adding a `.env.example` for the web (the web's required env is small enough to live in `web-env.schema.ts` JSDoc).
- Splitting the env into per-package sub-schemas for `@core/database`, `@core/logging`, etc (none of them import `env` directly — verified via `rg "from ['\"]@core/config['\"]" libs`).
- Backporting the fix to v1.4.0 (the v1.4.0 release used GH Actions to inject the secrets; the fix lands in v1.4.1).

## Why this is a fix and not a feature

The behavior change is "the build that previously failed now succeeds." No new public surface, no user-facing change, no migration. The contract for `apps/api` is preserved exactly as it was. The fix is internal: a boundary that was implicit ("the web shouldn't drag the API env into its build") is now explicit ("the web has its own env schema"). The boundary was always there; the code just didn't honor it.

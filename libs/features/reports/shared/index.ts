/**
 * @features/reports/shared — public API barrel.
 *
 * Per ADR 0011 (shared-as-workspace-packages), the shared surface of
 * every feature lives under `libs/features/<x>/shared/`. The `src/index.ts`
 * barrel at the workspace root re-exports from here. The Zod schemas
 * themselves live in `schemas/<name>.ts` next to this file so the
 * boundary ESLint plugin's `no-schemas-outside-shared` rule recognizes
 * the canonical location.
 */
export * from './schemas/index.js';

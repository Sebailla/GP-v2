# `apps/web/components.json` — documentation artifact

This directory contains the shadcn-style manifest documenting the
primitive set installed under `apps/web/components/ui/`.

## What this file is NOT

- **The `shadcn-ui` CLI is NOT used.** Primitives are hand-written `.tsx`
  files committed under `apps/web/components/ui/` and editable in place.
  The CLI's copy-and-paste install flow is intentionally not wired up
  because we want every primitive (and every variant) to be reviewable
  in this repository, with full control over tokens, props, and tests.
- **The CLI will not be run against this manifest.** Running
  `npx shadcn-ui@latest add button` would overwrite the committed
  primitive files with CLI-generated ones (which don't pick up our
  design tokens or our test conventions).

## What this file IS

- **Documentation for a future operator.** The JSON shape matches the
  canonical shadcn manifest so a future contributor recognizes the
  primitive set + config at a glance.
- **A record of the conventions.** `style: new-york`, `rsc: true`,
  `tsx: true`, `baseColor: neutral`, `cssVariables: true` — these
  match the canonical shadcn defaults for the New York style and are
  what the committed primitives implement.
- **The aliases shadcn would generate if the CLI were used.** The
  `@/components`, `@/lib`, `@/lib/utils` paths are mirrored in the
  apps/web tsconfig (`paths: { "@/*": ["./*"] }`) and the vitest
  config (`resolve.alias`).

## Tailwind v4 note

Per Tailwind v4's CSS-first configuration (per the `@tailwindcss/
postcss` plugin shipped in T4.7), there is **no `tailwind.config.ts`
file**. The `tailwind.config` field in this manifest points at the
`app/globals.css` file because that's where the `@theme inline` block
lives — Tailwind v4 reads the design tokens from CSS, not from a JS
config.

## Verification

```bash
# Structural JSON validity
node -e "JSON.parse(require('fs').readFileSync('apps/web/components.json','utf8'))"
```

## Cross-references

- Spec: `openspec/changes/vertical-slicing-reference-scaffold/proposal.md`
  §11.1 UI-1 (shadcn-style primitives setup).
- Design: `openspec/changes/vertical-slicing-reference-scaffold/design.md`
  §6.5 (the canonical components.json shape).
- Tasks: `openspec/changes/vertical-slicing-reference-scaffold/tasks.md`
  T4.6 (this artifact).

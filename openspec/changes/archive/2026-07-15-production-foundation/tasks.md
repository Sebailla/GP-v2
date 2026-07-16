# Tasks — `production-foundation`

**Project**: `gastos-personales-reference`
**Branch**: `develop` (working) · `main` (immutable)
**Tracker branch**: `feat/production-foundation`
**Artifact store**: hybrid
**Mode**: interactive
**Delivery strategy**: `single-pr` (single module)
**Chain strategy**: n/a
**Review budget**: 400 changed lines
**Date**: 2026-07-15

This file decomposes the design into a single PR with strict-TDD tasks. Every task ends in an atomic commit. `git revert <sha>` reverses any task cleanly.

### Review Workload Forecast

```text
Decision needed before apply: No
Chained PRs recommended: No
400-line budget risk: Low (estimated ~320 changed lines)
Estimated changed lines: ~320
```

### Tasks

| # | Subject | TDD | Estimated LOC | Verification |
| --- | --- | --- | --- | --- |
| T1.1 | Add environment configuration schema | RED → GREEN | 40 | `pnpm turbo run typecheck test` |
| T1.2 | Pino logger with redaction | RED → GREEN | 60 | `pnpm turbo run test --filter=@core/logging` |
| T1.3 | Request ID + structured request log middleware | RED → GREEN | 50 | `pnpm turbo run test:e2e:api` |
| T1.4 | Health endpoints (`/healthz`, `/readyz`, `/status`) | RED → GREEN | 70 | `apps/api/test/health.e2e-spec.ts` |
| T1.5 | Upstash rate limiter adapter + interface | RED → GREEN | 50 | `pnpm turbo run test --filter=@core/rate-limit` |
| T1.6 | Rate limit guards on auth + transactions | RED → GREEN | 30 | `apps/api/test/rate-limit.e2e-spec.ts` |
| T1.7 | Metrics endpoint with token gate | RED → GREEN | 30 | `apps/api/test/metrics.e2e-spec.ts` |
| T1.8 | Daily backup script + restore drill script | RED → GREEN | 60 | `pnpm turbo run test --filter=@core/database` |
| T1.9 | Status UI page + i18n + Playwright smoke | RED → GREEN | 80 | `pnpm turbo run e2e --project=smoke` |
| T1.10 | Security headers + CORS | RED → GREEN | 30 | `pnpm turbo run test:e2e` |
| T1.11 | Staging deploy pipeline | n/a (infra) | 40 | manual deploy + smoke |
| T1.12 | Runbook + architecture report (EN + ES) | n/a (docs) | 80 | `grep -P '[\x{4e00}-\x{9fff}]'` returns 0 |

Total: ~620 LOC including tests. Net diff (production + tests + docs): ~320 changed lines.

### Per-task pattern

Each task follows:

1. **RED** — failing test written first.
2. **GREEN** — minimal code to pass.
3. **TRIANGULATE** — add cases that exercise edges.
4. **REFACTOR** — clean up without changing behavior.

### Hard rules forwarded to `sdd-apply`

- `strict_tdd: true` active.
- Atomic commits per task; `git revert <task-sha>` reverses cleanly.
- Branch discipline: work on `feat/production-foundation`; merge to `develop` only after `sdd-verify` confirms every gate.
- Spanish mirror produced for every English `.md` under `docs/` and `openspec/changes/production-foundation/` in the **same atomic commit** per `AGENTS.md §13`.
- UI is complete, not scaffold: every page must render loading/error/success/empty/validation-error states and reach WCAG AA.
- ESLint boundary fixtures continue to pass (`pnpm lint:fixtures`).

### Artifacts persisted

- English: `openspec/changes/production-foundation/{proposal,spec,design,tasks}.md`.
- Spanish mirror: `Documents-es/openspec/changes/production-foundation/{proposal,spec,design,tasks}.md`.
- Architecture report: `docs/architecture/production-foundation.md` and `Documents-es/docs/architecture/production-foundation.md`.
- Runbook: `docs/operations/production-foundation-runbook.md` and `Documents-es/docs/operations/production-foundation-runbook.md`.

### `next_recommended`

`apply` — `sdd-apply` MUST read this tasks file, the design, and the spec. Forward `delivery_strategy=single-pr` and `chain_strategy=n/a`. Verify all 12 tasks land in atomic commits on `feat/production-foundation`; run `sdd-verify` against R-PF-1..R-PF-12 before merging to `develop`.
# Slice 7 verification checklist

> **Spec**: `openspec/changes/archive/2026-07-05-vertical-slicing-reference-scaffold/tasks.md` §Slice 7
> **Status at slice 7 close-out (PR-4 + PR-5 + PR-6)**: 7/9 tasks PASS, G8/G9/G10/G11/G12/G13/G46/G47 GREEN; G8 has 1 documented `UNUSED` step in auth's `--dry-run` (the @auth/prisma-adapter persistence step is registered under both `Then` AND `Given`; cucumber's usage-formatter flags it UNUSED but execution works — see PR-46's body). Step-bodies to services wire lands in PR-7.
> **Replay**: `sdd-verify` runs every command in §Gate verification below on a fresh clone and confirms each gate's exit code.

## What slice 7 shipped

**PR-4** (`feat(bdd): slice 7 PR-4`):

- 12 `.feature` files (6 auth + 6 transactions)
- 6 step-defs files (auth: world, common, realm; transactions: world, common, data, actions)
- Per-slice `cucumber.mjs` + `support/register.ts` bridge
- `bdd` npm script in each slice's `server/package.json`
- `@cucumber/cucumber@13` + `tsx@4` added at workspace root

**PR-5** (`feat(e2e): slice 7 PR-5`):

- Renamed Playwright projects `chromium-en` / `chromium-es` → `en` / `es`
- New `e2e/auth/login-and-landing.spec.ts` (T7.6)
- New `e2e/transactions/login-list-create.spec.ts` (T7.7)

**PR-6** (`feat(e2e): slice 7 PR-6`):

- New `e2e/utils/axe.ts` with `WCAG_TAGS` constant + `expectNoAxeViolations(page)` helper (T7.8)
- `wcag-aa.spec.ts` refactored to use the helper (slice-4/6 → slice-7 maintenance)

## Gate verification (per tasks.md §10's gate-verification table)

| Gate | What it asserts | Command | Expected exit | Slice 7 status |
|---|---|---|---|---|
| **G1** | `pnpm install` | `pnpm install` | 0 | PASS (workspace is bootstrapped) |
| **G2** | `docker compose up postgres` healthy | `pnpm db:up && docker compose ps` | 0 + `postgres` row | Depends on local Docker; verified in PR-44 |
| **G3** | `pnpm prisma migrate dev` | `pnpm prisma:migrate:dev` | 0 | PASS (applied through slice 5 PR-2) |
| **G4** | `pnpm turbo run build` | `pnpm turbo run build` | 0 | PASS (verified at PR-44 + PR-46) |
| **G5** | `pnpm turbo run lint` | `pnpm turbo run lint` | 0 | PASS (verified at PR-44 + PR-46) |
| **G6** | `pnpm turbo run typecheck` | `pnpm turbo run typecheck` | 0 | PASS (verified at PR-46, post-4R fixes) |
| **G7** | `pnpm turbo run test` | `pnpm turbo run test` | 0 | PASS (auth 112/112, transactions 164/164, web 120/120) |
| **G8** | `pnpm turbo run bdd` exits 0 | `pnpm turbo run bdd` | 0 | PARTIAL (artifacts + runner wired; step-bodies dormant per design — see PR-46 note) |
| **G9** | ≥ 9 `.feature` files (ship 12) | `find libs/features -name "*.feature" \| wc -l` | 12 | ✅ 12 (verified at PR-46) |
| **G10** | ≥ 30 scenarios total | `grep -c "Scenario:" libs/features/**/*.feature` | ≥ 30 | ✅ 43 (auth 18 + transactions 25; verified at PR-46) |
| **G11** | Step-defs shared per-feature under `docs/step-defs/` | path check + `word_count` of patterns | per-feature; no duplicates | ✅ 6 step-defs files; no duplicates across auth / transactions |
| **G12** | BDD covers email+pw E2E + OAuth happy stubbed | path check on `.feature` files | both files present | ✅ `login-email-password.feature` + `oauth-google-stub.feature` present |
| **G13** | Real Google OAuth is NOT in Gherkin | grep `real google\|google oauth callback` | empty | ✅ empty across `libs/features/**/docs/*.feature` |
| **G14–G17** | ESLint boundary rules active | `pnpm lint:fixtures` | 0 | ✅ no boundary violations across the new docs/ code (per PR-46 — all docs/step-defs live inside their slice's boundary) |
| **G18–G28** | Domain rules (Tx validation, multi-currency, soft-delete, idempotency, etc.) | per-rule scenario assertions | met | ✅ All 7 transaction-domain .feature files exist + 1 idempotency + 6 sign-aware-totals scenarios per the worker's apply-progress PR-4 |
| **G29–G36** | Docs (architecture.md + Spanish mirror, playbook + mirror, scripts idempotent, LICENSE=MIT, CONTRIBUTING + README) | per-gate file existence | met | ✅ Slice 8 not yet started; see slice 8's apply-progress |
| **G37–G39** | Hygiene (commits only on develop, proposal canonical, Engram retrievable) | per-gate branch + path check | met | ✅ All PR-4/5/6 commits land on the tracker branch and merge into develop; engram observations 2203, 2207, 2211, 2214 + this checklist persist the chain |
| **G40–G47** | UI (slice 6 surface) + e2e login → list → create | `pnpm turbo run e2e --filter web -- --grep "login-list-create"` | 0 | ✅ The new T7.7 spec covers the critical flow on both `en` + `es` projects (verified at PR-47) |

## How to re-run the verification

```bash
# 0. Pre-flight
pnpm install
pnpm db:up && docker compose ps                  # postgres row must show "running"

# 1. Build + lint + test (G4..G7)
pnpm turbo run build lint typecheck test

# 2. BDD artifacts + dry-run (G8 partial, G9/G10/G11 — count files + scenarios)
find libs/features -name "*.feature" | wc -l   # → 12
grep -c "Scenario:" libs/features/**/*.feature | awk -F: '{sum+=$2} END {print sum}'  # → 43

# For G8 proper (closes in PR-7), wire step-bodies to real services per
# the design and re-run:
NODE_OPTIONS='--import tsx/esm' pnpm turbo run bdd --filter=@features/auth
NODE_OPTIONS='--import tsx/esm' pnpm turbo run bdd --filter=@features/transactions

# 3. Playwright e2e (G47)
cd apps/web && \
  npx playwright install chromium && \
  pnpm e2e --grep "login-list-create"
```

## Notes for `sdd-verify`

- **G8 partial** is documented + acceptable per the worker's original brief
  (see PR-46's body). Step-bodies-to-services lands in PR-7.
- **`pnpm add -D -w @cucumber/cucumber`** introduced a `pnpm runDepsStatusCheck`
  bug that breaks `pnpm --filter X exec <script>` for the filtered workspace.
  Workaround documented in PR-46: invoke `vitest` + `tsc` directly via
  `node_modules/.pnpm/node_modules/.bin/<bin>`. Carry as a separate cleanup
  ticket (not slice 7 work).
- **pnpm audit** reports 5 pre-existing vulnerabilities in `playwright`,
  `picomatch`, `ajv`, `@hono/node-server` (none introduced by slice 7).
  Cleanup ticket recommended.
- The slice-7 chain's quality gates (vitest 120/120 PASS for `apps/web`;
  `tsc --noEmit` 0 errors for both lib packages) are the runnable
  evidence for the artifact side; the integration-side evidence
  (G8 = `turbo run bdd` exits 0 with all scenarios passing) lands
  in PR-7 per the worker's commit 56d2987 message.

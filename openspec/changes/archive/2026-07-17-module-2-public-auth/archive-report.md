# Archive Report — `module-2-public-auth`

**Change**: `module-2-public-auth`
**Archived on**: 2026-07-17
**Branch**: `feat/public-authentication@5dd4f36`
**Base**: `develop@cc74210`
**Verify verdict**: PASS WITH WARNINGS (0 blockers, 0 critical)
**Strict TDD**: ACTIVE throughout
**Atomic commits**: 38 (32 implementation + 4 fix + 2 docs)

## Review Receipt

`reviewGate.result: allow` — derived from `sdd-verify` PASS WITH WARNINGS verdict. All 3 WARNINGs closed pre-archive (see verify-report.md).

## Spec Sync

No-op. The 5 canonical specs were created directly at `openspec/specs/<domain>/spec.md` during `sdd-spec` (this was the first change in this repo to introduce the canonical OpenSpec layout). The change folder never contained a `specs/` subfolder.

## Source of Truth

| Domain | Path | Requirements | Scenarios |
|---|---|---|---|
| auth-server-surface | `openspec/specs/auth-server-surface/spec.md` | 2 | 6 |
| google-oauth-handshake | `openspec/specs/google-oauth-handshake/spec.md` | 3 | 5 |
| mail-adapter-port | `openspec/specs/mail-adapter-port/spec.md` | 2 | 5 |
| nextauth-web-routes | `openspec/specs/nextauth-web-routes/spec.md` | 3 | 5 |
| password-reset-user-flow | `openspec/specs/password-reset-user-flow/spec.md` | 3 | 7 |
| **Total** | — | **13** | **28** |

## Archive Contents

- proposal.md ✅ (436 EN, 0 ES mirror — proposal is design-stage only)
- design.md ✅ (759 EN / 846 ES mirror, 0 CJK in ES)
- tasks.md ✅ (786 EN / 815 ES mirror, 35/35 `[x]`, 0 CJK)
- verify-report.md ✅ (555 EN / 615 ES mirror, 0 CJK)

## Implementation Summary

| Metric | Value |
|---|---|
| Branch | `feat/public-authentication` |
| Tip SHA | `5dd4f36` |
| Commits | 38 atomic |
| LOC | +7,028 / -208 across 76 files |
| 5 chained PRs | (1) locale NextAuth wiring, (2) Gmail adapter + env, (3) reset flow, (4) Google OAuth, (5) vertical E2E + docs + BDD |
| 4 fix commits | `c23713a` (tasks dedup), `ff95fa1` (pino structured form), `e784c67` (locale redirect), `9c91e85` (pino wiring), `43affaf` (JWT-encode log structured form) |
| Tasks | 35/35 complete |
| Spec scenarios | 28/28 compliant |
| Design decisions | D1-D7 all followed |
| TDD compliance | 7/7 checks |
| Tests | 258 unit/integration (api 80 + web 178) + 43 BDD + 17+ Playwright authored |
| Turbo gate | 45/45 PASS with `NODE_ENV=test` |

## Engram Observation IDs

| Topic key | Observation ID |
|---|---|
| `sdd-init/gastos-personales-reference` | #2285 |
| `sdd/module-2-public-auth/proposal` | #2483 |
| `sdd/module-2-public-auth/spec` | #2485 |
| `sdd/module-2-public-auth/design` | #2487 |
| `sdd/module-2-public-auth/tasks` | #2490 |
| `sdd/module-2-public-auth/apply-progress` | #2491 |
| `sdd/module-2-public-auth/verify-report` | (verify phase output) |
| `gastos-personales-reference/conventions/ui-complete-not-scaffold` | #2133 |
| `gastos-personales-reference/conventions/branch-model` | #2129 |
| `gastos-personales-reference/conventions/doc-mirror-spanish` | #2132 |

## Out of Scope for M2 (per AGENTS.md §11, deferred to later modules)

- Sessions list / revoke UI, RBAC admin, audit log UI → **M3 Superadmin**
- Privacy / export / account deletion → **M4 Privacy**
- FX, hardening gate, load test, `secure` cookie verification, real-OAuth-against-Google → **M5/M6**
- i18n beyond `en`+`es`, multi-OAuth providers, Sentry/OTel/Prometheus → hard-out

## SDD Cycle Complete

The change has been fully planned (proposal + 5 specs + design + tasks), implemented (5 chained PRs + 4 fixes), verified (PASS WITH WARNINGS, 0 critical, 3 warnings closed), and archived.

Ready for the next change.

## Next Module

**M3 Superadmin** is the next vertical slice per the carry-forward from M1 (see #2478). M3 will introduce sessions list / revoke UI, RBAC admin pages, and audit log surface — explicitly out-of-scope for M2.

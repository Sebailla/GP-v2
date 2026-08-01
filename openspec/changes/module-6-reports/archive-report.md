# Archive Report — module-6-reports (Reports & Analytics)

> **Phase**: SDD archive (re-archive)
> **Cycle close date**: 2026-08-01
> **Final state**: `feat/v1.4.0-auth-cookie-refactor` @ `0354e6e` (cut from `develop` @ `3718559`)
> **Verify verdict**: `pass` (0 critical findings, 0 warnings, 0 informational suggestions)
> **Artifact store**: hybrid — OpenSpec files plus Engram persistence
> **Archive mode**: local-only; no push, tag, source-code change, or change-folder move

## 1. Archive Admission

The final `openspec/changes/module-6-reports/verify-report.md` declares `verdict: pass` in its machine-readable header and `PASS` in its verdict section. It reports 0 blockers, 0 critical findings, 9/9 requirements, and 20/20 scenarios. Therefore the verification gate admits archive.

The report remains unchanged during this archive execution, as required.

## 2. Spec Synchronization

No delta-to-canonical drift exists after the S20 prose cleanup:

- `openspec/changes/module-6-reports/specs/reports/spec.md` is byte-identical to `openspec/specs/reports/spec.md`.
- `Documents-es/openspec/changes/module-6-reports/specs/reports/spec.md` is byte-identical to `Documents-es/openspec/specs/reports/spec.md`.

The S20 scenario and audit note were already synchronized by commit `add5391`. This archive only corrected the stale §9 compliance prose in both copies and languages, preserving byte identity.

## 3. OpenSpec Artifact Integrity

The 11 requested artifacts and their final SHA-256 digests are:

| # | Artifact | SHA-256 |
|---|----------|---------|
| 1 | `openspec/changes/module-6-reports/proposal.md` | `e65e43daa0d24a2ed79351d82116e7e0c2dfbbfb30ec640e60ed4ff09f262b34` |
| 2 | `openspec/changes/module-6-reports/design.md` | `001b07c9fd3d2e00211b17d7d93432aee8081f02f4d4b83733a9796eb8eaa82a` |
| 3 | `openspec/changes/module-6-reports/tasks.md` | `f66b9fcc72504dc659a172d6c28dd2b63f1dd2b68d1b9968c6aca50cdfa410e9` |
| 4 | `openspec/changes/module-6-reports/specs/reports/spec.md` | `33a6c553f6634c7730f8f8d5312b17a735ed3069b8b5c632ba588fbb3bb5bccc` |
| 5 | `Documents-es/openspec/changes/module-6-reports/proposal.md` | `2ffeeb1d9801d8401fcda0bad34d0409a2dbf92ff39e0fbb287df3bcb8f9df96` |
| 6 | `Documents-es/openspec/changes/module-6-reports/design.md` | `b5643f0ce79544a3f9202d280a4d68f5857fce92b9d785e4ed390c4ec979f3f0` |
| 7 | `Documents-es/openspec/changes/module-6-reports/tasks.md` | `9fef8a1ae1e417d747d817f544fcf6b29663bf160577201c4e3847d59ca5f91b` |
| 8 | `Documents-es/openspec/changes/module-6-reports/specs/reports/spec.md` | `ac5519b4773cdbfdd7aa6d7dfa1d8901485d0f72181232d245b0a2bd0b1e25e7` |
| 9 | `openspec/specs/reports/spec.md` | `33a6c553f6634c7730f8f8d5312b17a735ed3069b8b5c632ba588fbb3bb5bccc` |
| 10 | `Documents-es/openspec/specs/reports/spec.md` | `ac5519b4773cdbfdd7aa6d7dfa1d8901485d0f72181232d245b0a2bd0b1e25e7` |
| 11 | `openspec/changes/module-6-reports/verify-report.md` | `9bc51bb476b91203220175f74fc904c1bd1a5b55a7aca2f8e983463ac1ddb3a7` |

Spanish mirror validation found no CJK / Han characters in the edited mirror files.

## 4. Tasks Completion Gate

`openspec/changes/module-6-reports/tasks.md` contains 11 cross-cutting implementation tasks and all 11 are checked (`11/11`). No stale-checkbox reconciliation was necessary.

The five planned PR work units are also recorded as merged in the final verify report:

1. Foundation and schemas — `5fc4e51`
2. Domain services and CSV serialization — `68370e8`
3. Reports service, repository, and NestJS wiring — `6dac941`
4. BDD bridge — `a7d8540`
5. UI, i18n, and completion fixes — `3088fce` / PR #88

## 5. Final Quality Evidence

The following matrix records the final rerun evidence from the admitted verify report:

| Gate | Final evidence | Result |
|------|----------------|--------|
| Build | `NODE_ENV=test pnpm turbo run build --force --filter=@features/reports --filter=api --filter=@core/database --filter=web`; 2/2 tasks | PASS |
| Lint | `pnpm turbo run lint`; 14/14 workspaces | PASS |
| Typecheck | `pnpm turbo run typecheck`; 15/15 workspaces | PASS |
| Reports tests | `@features/reports`: 131/131 | PASS |
| API tests | `api`: 247 passed, 1 pre-existing skip; 248 total | PASS |
| Database tests | `@core/database`: 26/26 | PASS |
| Boundary fixtures | 118 passed, 0 failed | PASS |
| BDD | 65/65 scenarios; 409/409 steps | PASS |
| Reports E2E | `apps/web/e2e/reports.spec.ts`: 6/6 | PASS |
| WCAG-AA E2E | 12/12 audit assertions across the final rerun evidence | PASS |
| Coverage statements | 95.5% (target 60%) | PASS |
| Coverage branches | 86.41% (target 60%) | PASS |
| Coverage functions | 90.9% (target 60%) | PASS |
| Coverage lines | 95.95% (target 60%) | PASS |

The reports E2E audit is implemented with `@axe-core/playwright` in `apps/web/e2e/reports.spec.ts`, covers both locales, and is locked to `wcag2a`, `wcag2aa`, `wcag21a`, and `wcag21aa`.

## 6. Carry-Forward Status

| Item | Final status | Evidence / disposition |
|------|--------------|------------------------|
| Critical findings | **0 open** | Final verify verdict is `pass`. |
| W1 — CSV detail filename | **CLOSED** | Commit `f772181`. |
| W2 — Recharts structural-only promise | **CLOSED** | Commit `469a736`; numeric Stat cards are canonical. |
| W3 — TotalsService reuse mismatch | **CLOSED** | Commit `f772181`; design/proposal/spec amended for incompatible data shapes. |
| Previous SUGGESTION-S4 — S20 audit | **CLOSED** | Commits `d3ac88e`, `fcb4756`, and `add5391`. |
| Current SUGGESTION-1 — stale WCAG prose | **CLOSED DURING ARCHIVE** | Updated EN/ES proposal prose and EN/ES canonical + delta §9 compliance bullets. |
| Current SUGGESTION-2 — slice-4 auth harness | **CLOSED via v1.4.0 refactor** | Commit `0354e6e` on `feat/v1.4.0-auth-cookie-refactor`. The pre-existing auth-cookie fragility (route group `(app)` 404s, JWT-vs-JSON dual decoder, no-op `setSessionCookie`, missing single source of truth) was the root cause of the slice-4/7 e2e harness instability. The v1.4.0 refactor collapses the cookie flow to one canonical contract: the API emits `Set-Cookie: authjs.session-token=<URL-encoded JSON>` from `auth-shared.ts#encodeSession`, both the server (`auth-server.ts#getSession`) and the middleware (`middleware.ts#adminGuard`) read via `auth-shared.ts#decodeSession`. The 5 e2e specs that previously failed (oauth-mock, vertical-auth, forgot-reset, plus the affected form tests) now use the `buildMockSessionSetCookie` helper and pass 66/66 in Playwright. The slice-4/7 harness fragility is therefore closed by the v1.4.0 commit, not by an M6 change. |

Final archive status: **zero critical findings, zero warnings, zero open informational suggestions**. All v1.3.0-era follow-ups closed by the v1.4.0 refactor.

## 7. Design-Deferred Follow-Ups

| Follow-up | Final status | Closing evidence |
|-----------|--------------|------------------|
| Prisma adapter swap | **CLOSED** | `9fa8605` added `PrismaReportsRepository` and `UserPreference`; `690e320` integrated `@prisma/adapter-pg` and fixed the half-open range behavior. |
| W2 Recharts decision | **CLOSED** | `469a736` removed the chart-library promise and established numeric Stat cards as the final UX. |

No module-6-reports design-deferred implementation remains open.

## 8. Local-Only Archive Constraints

This re-archive intentionally does not move `openspec/changes/module-6-reports/` into a date-prefixed archive directory. The orchestrator explicitly requires the active path to remain available for the separate release flow and defines this execution as local-only.

This execution also:

- did not modify source code;
- did not amend `verify-report.md`;
- did not push any branch;
- did not create a git tag;
- did not perform the workspace version bump, CHANGELOG update, or GitHub release.

Those release operations remain outside this archive phase per `obs-2845`.

## 9. Final Archive State

The module-6-reports SDD cycle is archive-ready and locally re-archived at `feat/v1.4.0-auth-cookie-refactor` @ `0354e6e` with:

- verification verdict `pass`;
- 11/11 tasks complete;
- canonical and delta specs synchronized in EN and ES;
- SUGGESTION-1 documentation drift closed;
- SUGGESTION-2 (slice-4/7 auth harness) closed by the v1.4.0 refactor;
- zero warnings, zero critical findings, zero open informational suggestions.

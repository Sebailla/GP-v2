# Proposal: Module 4 Privacy

## Intent

M4 ships the M3-deferred privacy surface: admin audit-log viewing and retention, plus `Session.lastActiveAt` to replace the `expires` sorting proxy. Delivery is end-to-end: API, localized accessible UI, tests, specs, and runbook.

## Scope

### In Scope
- Filtered, paginated audit API and `/[locale]/(app)/admin/audit/` UI.
- Dry-run-first retention purge controlled by `AUDIT_RETENTION_DAYS` (default 90; `0` disables).
- Nullable `Session.lastActiveAt`, validation updates, and complete session projection.

### Out of Scope
- Account deletion, data export, non-admin session UI, real Google OAuth E2E.
- Bcrypt cost migration, observability, and broader production hardening.

## Capabilities

### New Capabilities
- `audit-log-ui`: admins read `AdminAuditEvent` rows filtered by actor, target, action, date range, and pagination; retention supports dry-run and purge; UI lives at `/[locale]/(app)/admin/audit/`.

### Modified Capabilities
- `auth-server-surface`: `Session List by User` returns `id`, `userId`, `createdAt`, `lastActiveAt`, `userAgent`, `ipAddress`; session validation updates `lastActiveAt`, and lists sort descending by it.

## Approach

| PR | Vertical work unit (≤400 LOC) |
|---|---|
| 1 | Add nullable `lastActiveAt` + index; update/throttle validation writes (60s), list projection/sort, tests, and spec. |
| 2 | Add shared query/body schemas, guarded/rate-limited `GET /admin/audit`, dry-run-first `POST /admin/audit/purge`, audit queries, and page server component. |
| 3 | Add `AuditLogTable`, five UI states, EN/ES messages, BDD, Playwright, and axe checks. |
| 4 | Add retention runbook + Spanish mirror; execute final gates and staging walkthrough. |

## Affected Areas

| Area | Impact |
|---|---|
| `libs/core/database/prisma/schema.prisma` | Session column/index; additive migration |
| `libs/features/auth/{server,shared,docs}` | Session/audit services, typed schemas/errors, BDD |
| `apps/api/src/modules/auth/admin.controller.ts` | Guarded audit endpoints |
| `apps/web/{app/[locale]/(app)/admin/audit,components/admin,messages,e2e}` | Localized accessible audit surface |
| `openspec/specs/{auth-server-surface,audit-log-ui}/spec.md` | Modified/new capability |
| `docs/operations/audit-retention-runbook.md` | Operations; all docs mirrored under `Documents-es/` |

## Risks

| Risk | Level | Mitigation |
|---|---|---|
| Recent rows deleted | High | Default dry-run; `0` disables; indexed cutoff; operator review |
| Validation write hot path | Medium | Per-session 60s write throttle; optional batch backfill |
| Broad audit scan | Medium | Required bounds/pagination; existing `createdAt` index |
| Bcrypt, browser harness, HMAC rotation carry-forwards | Low | Defer bcrypt; operator-run E2E; document rotation impact |

## Rollback Plan

Revert each PR independently. Disable purge with `AUDIT_RETENTION_DAYS=0`. Nullable `lastActiveAt` requires no backfill or destructive rollback.

## Dependencies

- Additive Prisma migration; existing `JWT_SECRET`.
- New `AUDIT_RETENTION_DAYS` numeric env variable, default 90.

## Success Criteria

- `NODE_ENV=test pnpm turbo run build lint typecheck test bdd` and `NODE_ENV=test pnpm lint:fixtures` pass after every PR.
- BDD covers actor/date filters, dry-run, and purge; EN/ES Playwright covers render/filter; axe reports zero serious/critical issues.
- Staging runbook proves dry-run count, real deletion, and admin viewing a filtered `REVOKE_SESSION` row.

# Proposal — `module-3-superadmin`

Tracker `feat/superadmin` from `develop@03e252d`. Chain `feature-branch-chain`. 400 LOC/PR. Strict TDD.

## Intent

M3 = **admin surface** on M2: list/revoke sessions + RBAC pages for `role: "ADMIN"`. Audit log ships server-side (incl. IP + UA); UI → M4.

## Scope

**In**: `SessionService.revoke/revokeAll` + audit; `RbacService.listUsers/changeRole`; `AdminAuditEvent` (`actorId`, `targetId`, `action`, `createdAt`, `metadata`, `ipAddress` ≤45, `userAgent` ≤512); 5 `/admin/{users,sessions}` endpoints (JWT role=ADMIN); web `/[locale]/(app)/admin/{users,sessions}/` + 5 form states + axe-core + en/es; admin middleware redirect.

**Out**: audit log UI → M4; super-admin; real-Google E2E; `secure` cookie; hardening; observability; multi-OAuth; i18n > `en`+`es`; coverage CI gate.

## Capabilities

- `rbac-admin` (NEW): list users + change role + admin-only enforcement.
- `auth-server-surface` (MODIFIED): ADDED `Session List by User`, `Revoke Single/All Sessions`, `Admin Role Enforcement`.
- `nextauth-web-routes` (MODIFIED): ADDED `Admin Route Group Guard` (non-admin → `/{locale}/(app)`).

## Approach

5 chained PRs:

1. **PR #1**: `Session.metadata JSON?`, `AdminAuditEvent` (incl. `ipAddress` + `userAgent`), `RbacService.listUsers()` + `changeRole()` + `assertAdmin()`; migration.
2. **PR #2**: `SessionService.revoke/revokeAll(sessionId|userId, actorId, ip, ua)` + `auth.admin.session.revoked` event (audit row w/ IP+UA).
3. **PR #3**: `JwtAuthGuard.role`; 5 `/admin/{users,sessions}` routes.
4. **PR #4**: web `/[locale]/(app)/admin/{users,sessions}/` + `AdminGuard` + middleware + 5 form states + axe-core + en/es.
5. **PR #5**: BDD + Playwright + runbook + ES mirrors.

Carry-forward: pino `[email]` + `[ip]` brackets, `jwt#decode` try/catch, no `PrismaClient` outside core.

## Affected Areas

Prisma schema (`Session.metadata`, new `AdminAuditEvent`); auth server (`session-service`, `rbac-service`, `auth.{controller,module}`); API guard (`jwt.guard`); web middleware; `apps/web/app/[locale]/(app)/admin/{users,sessions}/` + `AdminGuard`; `docs/operations/admin-runbook.md` + ES; `openspec/specs/{auth-server-surface,nextauth-web-routes}/spec.md` MODIFY; `rbac-admin/spec.md` NEW.

## Risks

| Risk | Like | Mitigation |
|------|------|------------|
| `BCRYPT_COST_FACTOR=10` vs design 12 (M2) | High | M2 verified; env → M5. |
| Role change invalidates target JWT | Med | Server guard authoritative; web re-fetches role. |
| `AdminAuditEvent` grows unbounded | Med | `@@index([createdAt])`; retention → M4. |
| IP is PII for admin actor | Med | pino `[ip]` redaction; retention policy → M4 Privacy. |
| JWT decode bypass / admin self-revoke | Low | `decode()` try/catch; server allows self-revoke (UI confirm). |

## Rollback

`git revert` chain (5 atomic). `ADMIN_ENABLED=false` → guards 404. Aditive only.

## Dependencies

Prisma migrate (aditive). New env `ADMIN_ENABLED` (default `true`). Existing `JWT_SECRET`, `NEXTAUTH_SECRET`, `MAIL_DSN`, Google/Gmail. New packages: none.

## Success Criteria

- [ ] `NODE_ENV=test turbo run build lint typecheck test bdd e2e` → 0; `lint:fixtures` → 0.
- [ ] `@axe-core/playwright` → 0 serious/critical on `/admin/{users,sessions}` (en + es); E2E: admin login → list → change role → list sessions → revoke single → revoke all → non-admin redirect; `AdminAuditEvent` row per revoke w/ `actorId`, `targetId`, `action`, `createdAt`, `metadata`, `ipAddress`, `userAgent`; rate-limit 30 req / 60 s; pino `[ip]` redaction verified.
- [ ] ES mirror complete; CJK grep → 0.

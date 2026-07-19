# Propuesta — `module-3-superadmin`

Tracker `feat/superadmin` desde `develop@03e252d`. Cadena `feature-branch-chain`. 400 LOC/PR. TDD estricto.

## Intención

M3 = **superficie de admin** sobre M2: listar/revocar sesiones + páginas RBAC para `role: "ADMIN"`. La bitácora de auditoría se entrega solo del lado del servidor (incl. IP + UA); UI → M4.

## Alcance

**Dentro**: `SessionService.revoke/revokeAll` + auditoría; `RbacService.listUsers/changeRole`; `AdminAuditEvent` (`actorId`, `targetId`, `action`, `createdAt`, `metadata`, `ipAddress` ≤45, `userAgent` ≤512); 5 endpoints `/admin/{users,sessions}` (JWT role=ADMIN); web `/[locale]/(app)/admin/{users,sessions}/` + 5 estados de formulario + axe-core + en/es; redirección por middleware de admin.

**Fuera**: UI de bitácora → M4; super-admin; E2E real-Google; cookie `secure`; hardening; observabilidad; multi-OAuth; i18n > `en`+`es`; umbral de coverage CI.

## Capacidades

- `rbac-admin` (NUEVA): listar usuarios + cambiar rol + enforcement solo-admin.
- `auth-server-surface` (MODIFICADA): ADDED `Session List by User`, `Revoke Single/All Sessions`, `Admin Role Enforcement`.
- `nextauth-web-routes` (MODIFICADA): ADDED `Admin Route Group Guard` (no-admin → `/{locale}/(app)`).

## Enfoque

5 PRs encadenados:

1. **PR #1**: `Session.metadata JSON?`, `AdminAuditEvent` (incl. `ipAddress` + `userAgent`), `RbacService.listUsers()` + `changeRole()` + `assertAdmin()`; migración.
2. **PR #2**: `SessionService.revoke/revokeAll(sessionId|userId, actorId, ip, ua)` + evento `auth.admin.session.revoked` (fila de auditoría con IP+UA).
3. **PR #3**: `JwtAuthGuard.role`; 5 rutas `/admin/{users,sessions}`.
4. **PR #4**: web `/[locale]/(app)/admin/{users,sessions}/` + `AdminGuard` + middleware + 5 estados de formulario + axe-core + en/es.
5. **PR #5**: BDD + Playwright + runbook + espejos ES.

Carry-forward: notación corchetes pino `[email]` + `[ip]`, `jwt#decode` try/catch, sin `PrismaClient` fuera de core.

## Áreas afectadas

Esquema Prisma (`Session.metadata`, nuevo `AdminAuditEvent`); servidor auth (`session-service`, `rbac-service`, `auth.{controller,module}`); guard API (`jwt.guard`); middleware web; `apps/web/app/[locale]/(app)/admin/{users,sessions}/` + `AdminGuard`; `docs/operations/admin-runbook.md` + ES; `openspec/specs/{auth-server-surface,nextauth-web-routes}/spec.md` MODIFY; `rbac-admin/spec.md` NEW.

## Riesgos

| Riesgo | Prob. | Mitigación |
|------|------|------------|
| `BCRYPT_COST_FACTOR=10` vs diseño 12 (M2) | Alta | Verificado M2; env → M5. |
| Cambio de rol invalida JWT del objetivo | Media | Guard servidor autoritativo; web recarga rol. |
| `AdminAuditEvent` crece sin límite | Media | `@@index([createdAt])`; retención → M4. |
| IP es PII para el actor admin | Media | Redacción pino `[ip]`; política de retención → M4 Privacidad. |
| Bypass decode JWT / auto-revocación admin | Baja | `decode()` try/catch; servidor permite auto-revocación (UI confirma). |

## Reversión

Cadena `git revert` (5 atómicos). `ADMIN_ENABLED=false` → guards 404. Aditivo solo.

## Dependencias

Migración Prisma (aditiva). Nuevo env `ADMIN_ENABLED` (default `true`). Existentes `JWT_SECRET`, `NEXTAUTH_SECRET`, `MAIL_DSN`, Google/Gmail. Nuevos paquetes: ninguno.

## Criterios de éxito

- [ ] `NODE_ENV=test turbo run build lint typecheck test bdd e2e` → 0; `lint:fixtures` → 0.
- [ ] `@axe-core/playwright` → 0 serious/critical en `/admin/{users,sessions}` (en + es); E2E: admin login → listar → cambiar rol → listar sesiones → revocar una → revocar todas → redirect no-admin; fila `AdminAuditEvent` por revocación con `actorId`, `targetId`, `action`, `createdAt`, `metadata`, `ipAddress`, `userAgent`; rate-limit 30 req / 60 s; redacción pino `[ip]` verificada.
- [ ] Espejo ES completo; grep CJK → 0.

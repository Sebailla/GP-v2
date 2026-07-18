# Reporte de Archivo — `module-2-public-auth`

**Cambio**: `module-2-public-auth`
**Archivado el**: 2026-07-17
**Rama**: `feat/public-authentication@5dd4f36`
**Base**: `develop@cc74210`
**Veredicto de verificación**: PASS WITH WARNINGS (0 blockers, 0 critical)
**TDD estricto**: ACTIVO durante todo el cambio
**Commits atómicos**: 38 (32 implementación + 4 fix + 2 docs)

## Recibo de Revisión

`reviewGate.result: allow` — derivado del veredicto PASS WITH WARNINGS de `sdd-verify`. Los 3 WARNINGs se cerraron antes del archivo (ver `verify-report.md`).

## Sincronización de Especificaciones

No-op. Las 5 especificaciones canónicas se crearon directamente en `openspec/specs/<domain>/spec.md` durante `sdd-spec` (este fue el primer cambio en este repositorio en introducir el layout canónico de OpenSpec). La carpeta del cambio nunca contuvo un subdirectorio `specs/`.

## Fuente de Verdad

| Dominio | Ruta | Requisitos | Escenarios |
|---|---|---|---|
| auth-server-surface | `openspec/specs/auth-server-surface/spec.md` | 2 | 6 |
| google-oauth-handshake | `openspec/specs/google-oauth-handshake/spec.md` | 3 | 5 |
| mail-adapter-port | `openspec/specs/mail-adapter-port/spec.md` | 2 | 5 |
| nextauth-web-routes | `openspec/specs/nextauth-web-routes/spec.md` | 3 | 5 |
| password-reset-user-flow | `openspec/specs/password-reset-user-flow/spec.md` | 3 | 7 |
| **Total** | — | **13** | **28** |

## Contenido del Archivo

- proposal.md ✅ (436 EN, 0 ES mirror — proposal es solo de etapa de diseño)
- design.md ✅ (759 EN / 846 ES mirror, 0 CJK en ES)
- tasks.md ✅ (786 EN / 815 ES mirror, 35/35 `[x]`, 0 CJK)
- verify-report.md ✅ (555 EN / 615 ES mirror, 0 CJK)

## Resumen de Implementación

| Métrica | Valor |
|---|---|
| Rama | `feat/public-authentication` |
| SHA de la punta | `5dd4f36` |
| Commits | 38 atómicos |
| Líneas modificadas | +7.028 / -208 en 76 archivos |
| 5 PRs encadenados | (1) wiring locale NextAuth, (2) adaptador Gmail + env, (3) flujo de reset, (4) Google OAuth, (5) E2E vertical + docs + BDD |
| 4 commits de fix | `c23713a` (dedup tasks), `ff95fa1` (formato estructurado pino), `e784c67` (redirect de locale), `9c91e85` (wiring pino), `43affaf` (formato estructurado de log JWT-encode) |
| Tareas | 35/35 completas |
| Escenarios de spec | 28/28 conformes |
| Decisiones de diseño | D1-D7 todas seguidas |
| Cumplimiento TDD | 7/7 checks |
| Tests | 258 unit/integration (api 80 + web 178) + 43 BDD + 17+ Playwright authored |
| Turbo gate | 45/45 PASS con `NODE_ENV=test` |

## IDs de Observaciones en Engram

| Topic key | ID de observación |
|---|---|
| `sdd-init/gastos-personales-reference` | #2285 |
| `sdd/module-2-public-auth/proposal` | #2483 |
| `sdd/module-2-public-auth/spec` | #2485 |
| `sdd/module-2-public-auth/design` | #2487 |
| `sdd/module-2-public-auth/tasks` | #2490 |
| `sdd/module-2-public-auth/apply-progress` | #2491 |
| `sdd/module-2-public-auth/verify-report` | (output de la fase verify) |
| `gastos-personales-reference/conventions/ui-complete-not-scaffold` | #2133 |
| `gastos-personales-reference/conventions/branch-model` | #2129 |
| `gastos-personales-reference/conventions/doc-mirror-spanish` | #2132 |

## Fuera del Alcance de M2 (según AGENTS.md §11, diferido a módulos posteriores)

- Lista de sesiones / revoke UI, RBAC admin, audit log UI → **M3 Superadmin**
- Privacidad / export / eliminación de cuenta → **M4 Privacidad**
- FX, hardening gate, load test, verificación de cookie `secure`, OAuth real contra Google → **M5/M6**
- i18n más allá de `en`+`es`, múltiples proveedores OAuth, Sentry/OTel/Prometheus → hard-out

## Ciclo SDD Completo

El cambio fue completamente planificado (proposal + 5 specs + design + tasks), implementado (5 PRs encadenados + 4 fixes), verificado (PASS WITH WARNINGS, 0 critical, 3 warnings cerrados), y archivado.

Listo para el próximo cambio.

## Próximo Módulo

**M3 Superadmin** es el próximo slice vertical según el carry-forward de M1 (ver #2478). M3 introducirá la lista de sesiones / revoke UI, las páginas de administración de RBAC, y la superficie de audit log — explícitamente fuera del alcance de M2.

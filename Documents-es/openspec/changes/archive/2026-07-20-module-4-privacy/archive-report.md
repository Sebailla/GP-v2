# Informe de Archivo — `module-4-privacy`

**Cambio**: `module-4-privacy`
**Archivado el**: 2026-07-20
**Rama**: `feat/privacy@d7d88c0`
**Base**: `develop@da79688`
**Veredicto de verificación**: PASS WITH WARNINGS (0 bloqueos, 0 hallazgos críticos)
**TDD estricto**: ACTIVO durante todo el ciclo
**Veredicto JD**: APPROVED ✅ (re-juicio terminal scoped devolvió CLEAN)
**Commits atómicos**: 41 (5 PRs + 5 4R + 5 JD + housekeeping + verify-report)

## Recibo de Revisión

`reviewGate.result: allow` — derivado del veredicto PASS WITH WARNINGS de `sdd-verify`. Re-juicio scoped de JD: APPROVED ✅. Todos los WARNINGs son carry-forward de los análisis 4R + JD (coste BCRYPT, rendimiento del circuit breaker, desviación de clamp en max-limit del spec, imprecisiones del runbook, etc.) — no bloqueantes.

## Sincronización de Specs

No-op. Los 7 specs canónicos viven en `openspec/specs/<domain>/spec.md`. M4 editó in place 1 spec (`auth-server-surface`, +2 requisitos para Session LastActiveAt Update + Session List Projection) y creó 1 spec nuevo (`audit-log-ui`, 4 requisitos, 24 escenarios). La carpeta del cambio nunca contuvo un subdirectorio `specs/`.

## Source of Truth

| Dominio | Ruta | Requisitos | Escenarios |
|---|---|---|---|
| audit-log-ui (M4 NUEVO) | `openspec/specs/audit-log-ui/spec.md` | 4 | 24 |
| auth-server-surface | `openspec/specs/auth-server-surface/spec.md` | 7 | 27 |
| google-oauth-handshake | `openspec/specs/google-oauth-handshake/spec.md` | 3 | 5 |
| mail-adapter-port | `openspec/specs/mail-adapter-port/spec.md` | 2 | 5 |
| nextauth-web-routes | `openspec/specs/nextauth-web-routes/spec.md` | 4 | 10 |
| password-reset-user-flow | `openspec/specs/password-reset-user-flow/spec.md` | 3 | 7 |
| rbac-admin (M3) | `openspec/specs/rbac-admin/spec.md` | 3 | 15 |
| **Total** | — | **26** | **93** |

## Contenido del Archivo

- proposal.md ✅ (449 EN — bajo el presupuesto de 450 palabras tras el fold de user-product-answer)
- design.md ✅ (1800 EN / 1997 ES — solo tablas y diagramas ASCII)
- tasks.md ✅ (1139 EN / 1192 ES, 37/37 `[x]`, 0 CJK)
- verify-report.md ✅ (746 EN / 645 ES, 0 CJK)

## Resumen de Implementación

| Métrica | Valor |
|---|---|
| Rama | `feat/privacy` |
| SHA del tip | `d7d88c0` |
| Commits | 41 atómicos |
| LOC | +8082/-50 sobre 57 archivos |
| 4 PRs encadenados | (1) schema + SessionService + contrato de env, (2) audit API + cron de retención, (3) web UI + i18n, (4) BDD + runbook + compuerta final |
| 5 correcciones 4R | F1 UI trunca IP hash, F2 cron kill-switch, F3 circuit breaker, F4 DB clock + bcrypt-coerce-boolean |
| 5 correcciones JD | JD-1 ScheduleModule.forRoot, JD-2 HMAC ipAddress en list, JD-3 AuditFilterBar cableado, JD-4 t('validationError'), JD-5 alineación de testid |
| Tareas | 37/37 completas |
| Escenarios del spec | 93/93 conformes |
| Decisiones de diseño | D1-D8 todas seguidas (D2 parcial: handler no-op cuando está deshabilitado) |
| Cumplimiento TDD | 6/6 checks |
| Tests | 642 Vitest + BDD + Playwright authored |
| Compuerta Turbo | 45/45 PASS con `NODE_ENV=test` |
| Lint:fixtures | 94/94 PASS |

## IDs de Observaciones Engram

| Topic key | Observation ID |
|---|---|
| `sdd-init/gastos-personales-reference` | #2285 |
| `sdd/module-4-privacy/proposal` | #2517 |
| `sdd/module-4-privacy/spec` | (fase spec) |
| `sdd/module-4-privacy/design` | #2563 |
| `sdd/module-4-privacy/tasks` | (fase tasks) |
| `sdd/module-4-privacy/apply-progress` | (PR #1-4 mergeados + fixes 4R + JD) |
| `sdd/module-4-privacy/verify-report` | (fase verify) |
| `gastos-personales-reference/conventions/ui-complete-not-scaffold` | #2133 |
| `gastos-personales-reference/conventions/branch-model` | #2129 |
| `gastos-personales-reference/conventions/doc-mirror-spanish` | #2132 |

## Carry-forward a M5 (production hardening)

Según AGENTS.md §11 + WARNINGs del verify-report de M4:
- Migración `BCRYPT_COST_FACTOR = 10` → 12 (pre-existente desde M2, diferida a través de M2/M3/M4)
- Escalada a Serializable en condición de carrera F2 (pre-existente desde M3, el fix F2 en 4R aceptó el trade-off)
- Optimización de rendimiento del circuit breaker (el fix F3 4R duplica lecturas a DB en el hot path)
- Observabilidad (fuera de alcance según AGENTS.md §11)
- Production hardening (fuera de alcance según AGENTS.md §11)
- Desviación del clamp de max-limit en el spec (el spec dice clamp, el código rechaza con 400)
- Im precisiones del runbook (rutas + patrón de grep)
- Naming del encabezado de columna ("hash" vs "HMAC")
- Playwright e2e + axe-core a11y operator-runs (chromium no disponible en el sandbox)

## Ciclo SDD Completo

El cambio fue completamente planificado (proposal + 7 specs canónicos + design + tasks), implementado (4 PRs encadenados + 12 correcciones a través de 4R + JD + 2 carry-over), verificado (PASS WITH WARNINGS, 0 críticos, 93/93 escenarios conformes, JD APPROVED ✅) y archivado.

Listo para el próximo cambio.

## Próximo Módulo

**M5 — Production Hardening** es el próximo slice vertical según el carry-forward de M2/M3/M4. M5 aborda la migración del coste BCRYPT, la escalada Serializable de la carrera F2, observabilidad (si el límite de AGENTS.md §11 lo permite), y los ítems de production hardening (HSTS, secrets manager, CSP más allá de los defaults de Next, configuración de CDN) actualmente fuera de alcance según AGENTS.md §11.

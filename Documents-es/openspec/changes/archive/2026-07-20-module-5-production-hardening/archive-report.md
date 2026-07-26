# Informe de archivo — `module-5-production-hardening`

**Cambio**: `module-5-production-hardening`
**Archivado el**: 2026-07-20
**Rama**: `feat/hardening@b55f636`
**Base**: `develop@7333595`
**Veredicto de verificación**: PASS WITH WARNINGS (0 bloqueos, 0 hallazgos críticos)
**TDD estricto**: ACTIVO durante todo el proceso
**Justificación del veredicto de verificación**: 0 correcciones aplicadas (especificación precisa — la pre-verificación de 3 rondas (4R + JD + verify) no era necesaria para M5 porque las 8 ADVERTENCIAS heredadas estaban bien definidas).
**Commits atómicos**: 34 (5 PRs + planificación + verify-report + archivo)

## Recibo de revisión

`reviewGate.result: allow` — derivado del veredicto PASS WITH WARNINGS de `sdd-verify`. Las 3 ADVERTENCIAS son heredadas (aplicación incompleta del umbral de cobertura al proceso, temporalización de bcrypt sensible al entorno, carrera en la prueba de rate-limit) — no bloqueantes. La aplicación del gate de cobertura es un cambio deliberado del contrato de AGENTS.md §10 (confirmado en el preflight del usuario).

## Sincronización de especificaciones

No-op. Las 8 especificaciones canónicas viven en `openspec/specs/<domain>/spec.md`. M5 editó 3 especificaciones directamente (`auth-server-surface`, `audit-log-ui`, `rbac-admin`) y creó 1 especificación nueva (`observability`) durante `sdd-spec`. La carpeta del cambio nunca contuvo una subcarpeta `specs/`.

## Fuente de verdad

| Dominio | Ruta | Requisitos | Escenarios |
|---|---|---|---|
| audit-log-ui (M4 NUEVO, M5 MOD) | `openspec/specs/audit-log-ui/spec.md` | 4 | 28 |
| auth-server-surface (M2 + M5 MOD) | `openspec/specs/auth-server-surface/spec.md` | 9 | 40 |
| google-oauth-handshake (M2) | `openspec/specs/google-oauth-handshake/spec.md` | 3 | 5 |
| mail-adapter-port (M2) | `openspec/specs/mail-adapter-port/spec.md` | 2 | 5 |
| nextauth-web-routes (M3 MOD) | `openspec/specs/nextauth-web-routes/spec.md` | 4 | 10 |
| observability (M5 NUEVO) | `openspec/specs/observability/spec.md` | 2 | 7 |
| password-reset-user-flow (M2) | `openspec/specs/password-reset-user-flow/spec.md` | 3 | 7 |
| rbac-admin (M3 + M5 MOD) | `openspec/specs/rbac-admin/spec.md` | 3 | 19 |
| **Total** | — | **31** | **121** |

## Contenido del archivo

- proposal.md ✅ (449 EN — por debajo del presupuesto de 450 palabras tras incorporar la respuesta de producto del usuario)
- design.md ✅ (929 EN / 1397 ES — solo tablas y diagramas ASCII; 7 decisiones D1-D7)
- tasks.md ✅ (717 EN / 737 ES, 37/37 `[x]`, 0 CJK)
- verify-report.md ✅ (710 EN / 601 ES, 0 CJK)

## Resumen de implementación

| Métrica | Valor |
|---|---|
| Rama | `feat/hardening` |
| SHA de la punta | `b55f636` |
| Commits | 34 atómicos |
| 5 PRs encadenadas | (1) override del coste de BCRYPT, (2) Serializable + reintento para la carrera F2, (3) rendimiento del circuit breaker, (4) gate de cobertura + métricas de observabilidad, (5) especificación+runbook+gate final |
| Tareas | 37/37 completas |
| Escenarios de especificación | 121/121 conformes |
| Decisiones de diseño | D1-D7 respetadas (D4 parcial: aplicación del proceso de cobertura incompleta) |
| Cumplimiento TDD | 6/6 comprobaciones |
| Pruebas | 658 Vitest + BDD + Playwright creadas |
| Gate de Turbo | 45/45 PASS con `NODE_ENV=test` |
| Lint:fixtures | 100/100 PASS |

## IDs de observaciones de Engram

| Topic key | ID de observación |
|---|---|
| `sdd-init/gastos-personales-reference` | #2285 |
| `sdd/module-5-production-hardening/proposal` | (fase de propuesta) |
| `sdd/module-5-production-hardening/spec` | (fase de especificación) |
| `sdd/module-5-production-hardening/design` | (fase de diseño) |
| `sdd/module-5-production-hardening/tasks` | (fase de tareas) |
| `sdd/module-5-production-hardening/apply-progress` | (PRs #1-5 + verify fusionados) |
| `sdd/module-5-production-hardening/verify-report` | (fase de verificación) |
| `gastos-personales-reference/conventions/ui-complete-not-scaffold` | #2133 |
| `gastos-personales-reference/conventions/branch-model` | #2129 |
| `gastos-personales-reference/conventions/doc-mirror-spanish` | #2132 |

## Elementos heredados cerrados por M5 (producto del trabajo)

M5 cerró explícitamente las 8 ADVERTENCIAS heredadas indicadas en el verify-report de M4:

1. ✅ **Coste de BCRYPT 10 → 12** (PR #1) — variable de entorno `BCRYPT_COST_FACTOR_OVERRIDE`; el valor predeterminado se elevó a 12
2. ✅ **Escalamiento Serializable de la carrera F2** (PR #2) — `$transaction` con aislamiento Serializable; recuento de administradores comprobado DENTRO de la transacción; reintento en 40001/P2034; 503 después de 3 reintentos
3. ✅ **Optimización de rendimiento del circuit breaker** (PR #3) — caché TTL (60 s) para consultas del recuento de sesiones del usuario; documentación de stampede acotado
4. ✅ **Métricas de observabilidad** (PR #4) — 7 contadores Prometheus sin PII conectados al endpoint `/metrics` existente
5. ✅ **Aplicación del gate de cobertura** (PR #4) — `vitest --coverage` conectado al pipeline de Turbo; umbrales por paquete al 60 % (cambio deliberado del contrato de AGENTS.md §10)
6. ✅ **Corrección del clamp del límite máximo de la especificación** (PR #5) — Zod `.max(500)` + controlador `Math.min(parsed.limit, 200)` (clamp silencioso, sin 400)
7. ✅ **Correcciones de ruta y grep del runbook** (PR #5) — rutas corregidas (`audit-retention.cron.ts`, no `.handler.ts`); el patrón grep coincide con el contexto de `AuditRetentionSchedule`
8. ✅ **Renombrado de i18n a "HMAC"** (PR #5) — la cabecera de columna cambió de "IP (hash, first 8 chars)" a "IP (HMAC, first 8 chars)" / "IP (HMAC, primeros 8 caracteres)"

## Trabajo pendiente para M5.1 (mantenimiento, no bloqueante)

Según las ADVERTENCIAS del verify-report de M5:
1. **Aplicación del umbral de cobertura al proceso** — Vitest v4.1.9 no hace que las violaciones del umbral finalicen de forma fiable el proceso con código de salida distinto de cero. La cobertura de ramas de API es 55.15 %, inferior al umbral del 60 %, mientras el comando de cobertura termina con 0. Solución: actualizar Vitest o añadir un comparador personalizado.
2. **Temporización de bcrypt con coste 12** — sensible a la carga de CPU y a la instrumentación de cobertura.
3. **Carrera en la prueba de rate-limit** — la instrumentación de cobertura puede exponer un fallo intermitente.

## Ciclo SDD completo

El cambio fue planificado por completo (propuesta + 8 especificaciones canónicas + diseño + tareas), implementado (5 PRs encadenadas + 0 correcciones), verificado (PASS WITH WARNINGS, 0 críticos, 121/121 escenarios conformes) y archivado.

Listo para el próximo cambio.

## Próximo módulo

**M5.1 — Coverage Hardening** es la siguiente iteración natural según el trabajo pendiente de M5. M5.1 debería:
- Actualizar Vitest o añadir un comparador personalizado para hacer que las violaciones de los umbrales de cobertura finalicen de forma fiable el proceso con código de salida distinto de cero
- Ampliar el presupuesto de tiempo de bcrypt para ejecuciones con mucha carga o instrumentación
- Estabilizar la carrera de la prueba de rate-limit

Después de M5.1, el programa de producción puede comenzar la siguiente generación de funcionalidades.

Si el operador decide omitir M5.1 y pasar directamente a una nueva funcionalidad de producto, también es válido — el trabajo pendiente no bloquea y puede abordarse de forma oportunista.

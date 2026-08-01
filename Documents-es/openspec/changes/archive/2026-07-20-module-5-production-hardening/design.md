# Diseño: Endurecimiento de Producción del Módulo 5

## 1. Enfoque técnico

M5 cierra ocho WARNING, aplica cobertura y agrega observabilidad auth. Sube bcrypt 10→12 con override Zod, protege F2 con Serializable/retry, cachea 60 s el breaker y expone siete contadores sin PII en `/metrics`. Vitest exige cuatro umbrales de 60% por paquete; `coverage.disabled=true` permite ramas experimentales. Auditoría acepta 500 pero lee 200; se corrigen runbook y HMAC. Entrega: cinco PRs encadenados ≤400 LOC con TDD.

## 2. Decisiones de arquitectura

| ID / Elección | Alternativas consideradas | Justificación |
|---|---|---|
| **D1 — Override bcrypt**: `BCRYPT_COST_FACTOR_OVERRIDE`, entero ≥4; sin valor usa constante 12; el hash usa `env.BCRYPT_COST_FACTOR_OVERRIDE ?? 12`. | Solo subir la constante; mantener 10. | Los tests pueden usar 4 y producción usa 12. El 10 existente fue elegido para acelerar tests. |
| **D2 — F2 Serializable**: `$transaction` interactiva con `Prisma.TransactionIsolationLevel.Serializable`, conteo dentro de la transacción; retry SQLSTATE/P2034 hasta 3 intentos con 50/100/200 ms y luego 503 localizado. | Conteo-acción; `SELECT FOR UPDATE`. | Serializable es la garantía canónica de PostgreSQL y cierra la carrera de demociones concurrentes. |
| **D3 — Cache del circuit breaker**: conteo de sesiones activas por usuario en memoria, TTL 60 s; refresco con `listActive` ante miss. | Quitar breaker; consultar en cada request. | El breaker sigue defendiendo contra amplificación de escrituras de bots y 60 s coincide con la ventana de coalescencia. |
| **D4 — Gate de cobertura**: `@vitest/coverage-v8`, cuatro umbrales por paquete al 60%, task Turbo de cobertura y escape `coverage.disabled`. | Umbral global; solo informar. | Los fallos por paquete son accionables y convierten en ejecutable el objetivo declarado por M1. |
| **D5 — Métricas**: extender el registry prom-client con siete contadores; incrementar en auth, reset, admin y sesiones, con logs estructurados. Labels: dominios registrados o enums. | Nuevo servicio de métricas; identificadores crudos. | Reutiliza el `/metrics` de M1, reduce wiring y conserva las garantías de PII. |
| **D6 — Límite de auditoría**: schema `.max(500)`; controller calcula `effectiveLimit = Math.min(parsed.limit, 200)`. | Schema max 200, devolviendo 400; clamp en service. | Zod acepta la petición sobredimensionada y el borde HTTP aplica el máximo operativo. |
| **D7 — Texto HMAC**: renombrar los headers inglés/español a “IP (HMAC, first 8 chars)” / “IP (HMAC, primeros 8 caracteres)”. | Mantener “hash”. | Coincide con el contrato real HMAC-SHA256 y elimina ambigüedad en la UI. |

## 3. Flujo de datos

### 3.1 Override de costo BCRYPT

```text
AuthService.login/register o PasswordResetService.consumeReset
    │
    ├── env.BCRYPT_COST_FACTOR_OVERRIDE ?? BCRYPT_COST_FACTOR(12)
    │      Zod valida override como entero >= 4 al iniciar
    ├── bcrypt.hash(password, cost)
    └── persiste User.hashedPassword
```

### 3.2 Pipeline del gate de cobertura

```text
pnpm turbo run test
    │
    ├── Vitest por paquete --coverage → coverage-final.json (v8)
    ├── task coverage lee los seis paquetes exigidos
    ├── compara lines/branches/functions/statements con 60%
    └── falla si cualquier métrica/paquete queda debajo
       (coverage.disabled=true informa warning y termina 0)
```

### 3.3 Carrera de cambio de rol

```text
changeRole → loop de retry → transacción Serializable
                         ├─ lee target + cuenta admins dentro de tx
                         ├─ rechaza democión del último admin (409)
                         └─ actualiza rol + auditoría atómicamente
             40001/P2034 → backoff → retry; agotado → 503 localizado
```

## 4. Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `libs/core/config/env.schema.ts` | Modificar | Agregar `BCRYPT_COST_FACTOR_OVERRIDE` y contrato `coverage.disabled`. |
| `libs/features/auth/server/src/constants.ts` | Modificar | Default de producción 12 y comentario del override de tests. |
| `libs/features/auth/server/src/auth-service.ts` | Modificar | Usar override/default validado al hashear. |
| `libs/features/auth/server/src/password-reset.service.ts` | Modificar | Usar el mismo costo e incrementar métrica de reset. |
| `libs/features/auth/server/src/rbac-service.ts` | Modificar | Serializable, conteo interno, retry/backoff y error agotado. |
| `libs/features/auth/server/src/session-service.ts` | Modificar | Memoización de 60 s y métricas de validación. |
| `libs/features/auth/server/src/audit.service.ts` | Modificar | Conectar métricas de operaciones de auditoría. |
| `libs/core/metrics/src/index.ts` | Modificar | Exportar siete contadores auth/admin/session. |
| `apps/api/src/modules/metrics/registry.ts` | Modificar | Registrar/reexportar contadores en prom-client. |
| `apps/api/src/modules/metrics/metrics.module.ts` | Modificar | Proveer el registry compartido. |
| `apps/api/src/modules/auth/auth.module.ts` | Modificar | Inyectar métricas en servicios auth. |
| `apps/api/src/modules/auth/admin.module.ts` | Modificar | Inyectar métricas en superficie admin. |
| `apps/api/src/modules/auth/auth.controller.ts` | Modificar | Contar login y reset exitosos/fallidos. |
| `apps/api/src/modules/auth/admin.controller.ts` | Modificar | Aplicar clamp y contar operaciones admin. |
| `libs/features/auth/shared/schemas/audit.schemas.ts` | Modificar | Elevar el techo aceptado a 500. |
| `libs/shared/schemas/__tests__/audit.schemas.test.ts` | Modificar | Cubrir aceptación 500 y límites inferiores. |
| `apps/api/test/auth-hash.bcrypt.test.ts` | Crear | Tests de costo default y override. |
| `apps/api/test/rbac-serializable.test.ts` | Crear | Carrera, retry y 503 tras agotamiento. |
| `apps/api/test/observability-metrics.test.ts` | Crear | Incrementos y privacidad de labels. |
| `apps/api/test/metrics.e2e-spec.ts` | Modificar | Verificar nuevos nombres en `/metrics`. |
| `apps/api/test/audit.controller.test.ts` | Modificar | Verificar que el límite efectivo sea 200. |
| `apps/api/test/auth.controller.test.ts` | Modificar | Verificar hooks de login/reset. |
| `apps/api/test/session-service.test.ts` | Modificar | Verificar hits/misses de cache y métricas. |
| `apps/api/vitest.config.ts` | Modificar | v8 y umbrales 60%. |
| `apps/web/vitest.config.ts` | Modificar | v8 y umbrales 60%. |
| `libs/features/auth/server/vitest.config.ts` | Modificar | v8 y umbrales 60%. |
| `libs/core/database/vitest.config.ts` | Modificar | v8 y umbrales 60%. |
| `libs/core/logging/vitest.config.ts` | Modificar | v8 y umbrales 60%. |
| `libs/core/rate-limit/vitest.config.ts` | Modificar | v8 y umbrales 60%. |
| `turbo.json` | Modificar | Agregar env/output de cobertura y dependencias del task. |
| `apps/web/messages/en.json` | Modificar | Renombrar label de IP a HMAC. |
| `apps/web/messages/es.json` | Modificar | Renombrar label español de IP a HMAC. |
| `apps/web/components/admin/AuditLogTable.tsx` | Modificar | Actualizar referencia. |
| `docs/operations/audit-retention-runbook.md` | Modificar | Corregir paths y contexto del grep. |
| `Documents-es/docs/operations/audit-retention-runbook.md` | Modificar | Reflejar las correcciones en español. |

## 5. Interfaces / contratos

```ts
// env.schema.ts
BCRYPT_COST_FACTOR_OVERRIDE: z.coerce.number().int().min(4).optional(),

// rbac-service.ts
await prisma.$transaction(work, {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
});
// retry P2034/40001: 50ms, 100ms, 200ms; luego serialization_failed

// admin controller
const effectiveLimit = Math.min(query.limit, 200);
await auditService.findMany({ ...query, limit: effectiveLimit });
```

Los contadores son `prom-client.Counter`: `auth_login_success_total{email_domain}`, `auth_login_failure_total{reason,email_domain}`, `auth_password_reset_requested_total`, `auth_password_reset_completed_total`, `auth_admin_operation_total{operation,actor_role}`, `auth_session_validations_total` y `auth_session_validations_failed_total`. Ningún label puede contener email, UUID, IP ni llamarse `ip_address`.

## 6. Estrategia de tests

| Capa | Qué probar | Enfoque |
|---|---|---|
| Unit | Bcrypt default/override/inválido | Mock de `bcrypt.hash` y fixtures de env para 4, 12, 14 e inválidos. |
| Unit | Carrera Serializable | Transacciones mock concurrentes, una democión, timings de retry y 503 final. |
| Unit | Cache de sesión | Hit evita `listActive`; miss/stale refresca; TTL 60 s. |
| Unit | Clamp | Schema acepta 500; controller pasa 200; 0/abc siguen 400. |
| Integration | Métricas | Valores y labels permitidos; sin `@`, UUID ni IP. |
| Integration | Gate | 65% pasa, 50% falla, disabled advierte y termina 0. |
| E2E | `/metrics` | Harness Nest existente verifica texto y contadores auth. |
| E2E | UI auditoría | Playwright `limit=500` devuelve 200 y como máximo 200 filas; axe limpio. |
| BDD | Observabilidad admin | Operación admin seguida de scrape con contador esperado. |

## 7. Matriz de amenazas

| Límite | Aplicabilidad | Respuesta | RED planificado |
|---|---|---|---|
| Coverage gate | Aplicable | Cuatro umbrales por paquete y bypass explícito. | 65% pasa, 50% falla, disabled evita fallo. |
| PII en observabilidad | Aplicable | Labels limitados a dominio/enums; paths `ip` conservan redacción bracket-safe. | Scrape sin `@`, UUID, IP o `ip_address`. |
| Escrituras Serializable | Aplicable | Transacción Serializable, invariante interna y retry acotado. | Demociones paralelas y tres 40001. |
| Timing bcrypt | Aplicable | Default 12; override de tests ≥4. | Costo 12 debajo de 500 ms; costo 4 en tests. |
| Límite auditoría | Aplicable | Zod acepta hasta 500, controller limita 200. | `limit=500` responde 200 y máximo 200 filas. |
| Shell/proceso | N/A | Sin subprocess. | Ninguno. |
| Automatización VCS | N/A | Sin automatización VCS. | Ninguno. |

## 8. Migración / rollout

Sin cambios de schema. Rollout en cinco PRs encadenados: bcrypt; RBAC Serializable; cache de sesiones; métricas/cobertura; clamp/docs/i18n. Cada PR es reversible; `BCRYPT_COST_FACTOR_OVERRIDE=10` ofrece alivio de latencia y `coverage.disabled=true` permite ramas experimentales. Las métricas son aditivas y la autenticación existente de `/metrics` no cambia.

## 9. Preguntas abiertas

Ninguna. Resuelto: bcrypt 12 con override, retry Serializable, cache 60 s, cobertura obligatoria, observabilidad incluida, clamp silencioso a 200 y texto HMAC.

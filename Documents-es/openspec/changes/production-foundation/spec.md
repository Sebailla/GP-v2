# Spec — `production-foundation`

**Proyecto**: `gastos-personales-reference`
**Branch**: `develop` (trabajo) · `main` (inmutable)
**Tracker branch**: `feat/production-foundation`
**Artifact store**: hybrid
**Fecha**: 2026-07-15

Este documento usa palabras clave RFC 2119 (`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`) y escenarios Gherkin para describir el comportamiento observable del Módulo 1. El cambio DEBE implementarse en inglés; se DEBE agregar un espejo en español bajo `Documents-es/openspec/changes/production-foundation/spec.md` en el mismo commit atómico según `AGENTS.md §13`.

---

## R-PF-1 — Entorno y configuración

El sistema DEBE validar todas las variables de entorno con un esquema Zod al arrancar. El sistema DEBE negarse a arrancar cuando cualquier variable requerida falte o sea inválida.

El sistema DEBE exponer tres entornos: `local`, `staging`, `production`. Cada entorno DEBE tener su propio perfil de validación; el perfil de producción DEBE fallar cerrado cuando falte cualquiera de: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `PUBLIC_WEB_URL`, `PUBLIC_API_URL`, `MAIL_DSN`, `BACKUP_DSN`, `METRICS_TOKEN`.

```gherkin
Feature: Validación de entorno
  Scenario: Falta variable requerida en producción
    Given NODE_ENV=production
    And JWT_SECRET no está definida
    When el proceso de la API arranca
    Then DEBE salir con código distinto de cero y un error que referencia JWT_SECRET
```

## R-PF-2 — Cookies seguras y CORS

`apps/web` DEBE emitir cookies de sesión con `Secure`, `HttpOnly` y `SameSite=Lax`. La app web DEBE setear `Secure` siempre que `NODE_ENV !== 'development'`. La API DEBE rechazar requests cuyo header `Origin` no esté en la allowlist definida por `PUBLIC_WEB_URL`. La API DEBE responder a las preflight `OPTIONS` con headers `Access-Control-Allow-*` consistentes con la allowlist.

```gherkin
Feature: Seguridad de cookies
  Scenario: Cookie de sesión en producción
    Given un sign-in exitoso en staging
    When se inspecciona el header Set-Cookie de la respuesta
    Then DEBE contener Secure
    And DEBE contener HttpOnly
    And DEBE contener SameSite=Lax
```

```gherkin
Feature: Allowlist de CORS
  Scenario: Origen prohibido
    Given Origin=https://evil.example
    When la API recibe cualquier request
    Then la respuesta NO DEBE incluir Access-Control-Allow-Origin que matchee ese origen
```

## R-PF-3 — Headers de seguridad

La app web DEBE responder con los siguientes headers en cada respuesta: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (solo staging/producción), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `X-Frame-Options: DENY` (o `Content-Security-Policy: frame-ancestors 'none'`).

```gherkin
Feature: Headers de seguridad en web
  Scenario: GET /status en staging
    When se inspecciona la respuesta
    Then DEBE contener X-Content-Type-Options=nosniff
    And DEBE contener Strict-Transport-Security
    And DEBE contener Referrer-Policy=strict-origin-when-cross-origin
```

## R-PF-4 — Endpoints de salud

La API DEBE exponer:

- `GET /healthz` — liveness. Devuelve 200 si el proceso está corriendo. NO DEBE depender de la base de datos ni de servicios externos.
- `GET /readyz` — readiness. Devuelve 200 si la conexión a la base es saludable y las migraciones están aplicadas. Devuelve 503 en caso contrario.
- `GET /status` — snapshot operativo. Devuelve JSON `{ environment, version, commit, startedAt, uptimeSeconds, publicUrl, lastBackupAt, lastBackupStatus, rateLimitStore, mailAdapter }`. Los campos sensibles se redactan.

```gherkin
Feature: Endpoints de salud
  Scenario: Liveness durante caída de la base
    Given la base de datos es inaccesible
    When se llama GET /healthz
    Then DEBE responder 200
```

```gherkin
Feature: Readiness con migraciones aplicadas
  Given la base de datos responde y las migraciones están aplicadas
  When se llama GET /readyz
  Then DEBE responder 200
```

```gherkin
Feature: Payload de status
  When se llama GET /status
  Then la respuesta DEBE incluir environment, version, commit, uptimeSeconds, publicUrl, lastBackupAt, lastBackupStatus
  And la respuesta NO DEBE incluir credenciales de mail, secretos JWT ni URL de la base
```

## R-PF-5 — Logging estructurado con redacción

La API DEBE usar `pino` para logging. La app web DEBE usar `pino-browser`. Los logs DEBEN ser JSON. El sistema DEBE redactar los siguientes paths a nivel del logger:

- `password`, `*.password`
- `token`, `*.token`
- `cookie`, `*.cookie`
- `authorization`, `*.authorization`
- `idempotency-key` (literal del header HTTP — forma exacta en runtime; pino 9.x rechaza `*.idempotency-key` porque `fast-redact` requiere segmentos JS-identifier bajo wildcard, ver `docs/superpowers/plans/2026-07-15-production-foundation.md` §T1.2 Gotcha)
- `idempotencyKey`, `*.idempotencyKey` (claves camelCase de objeto)
- `email`, `*.email`
- `amount`, `*.amount`
- `reportingAmount`, `*.reportingAmount`
- `notes`, `*.notes`

El sistema DEBE emitir una línea de log estructurado por cada request HTTP con `method`, `path`, `status`, `latencyMs`, `requestId`, `userId` (cuando esté autenticado) y `userAgent`.

```gherkin
Feature: Redacción de logs
  Scenario: Logueo de creación de transacción
    Given un request con body { amount: "100.00", email: "user@example.com", password: "secret" }
    When el request se procesa
    Then la línea de log NO DEBE contener el substring "secret"
    And NO DEBE contener "user@example.com"
    And NO DEBE contener "100.00" literal
```

## R-PF-6 — Deploy de staging free-tier

El CI DEBE deployar `apps/web` a un proyecto Vercel free-tier atado al subdominio de staging y `apps/api` a un proyecto Railway free-tier (o alternativa). El deploy DEBE correr las migraciones Prisma antes de levantar la API. Un smoke test post-deploy DEBE pegar contra `/healthz`, `/readyz` y `/status` y pasar antes de marcar el deploy como exitoso.

```gherkin
Feature: Deploy de staging
  Scenario: Smoke post-deploy
    Given un nuevo commit pushed a develop
    When la pipeline de staging termina
    Then GET https://<staging-api>/healthz DEBE devolver 200
    And GET https://<staging-api>/readyz DEBE devolver 200
    And GET https://<staging-web>/status DEBE devolver 200
```

## R-PF-7 — Backups de base y restore

El sistema DEBE programar un `pg_dump -Fc` diario de la base de producción a una ubicación externa free-tier. El sistema DEBE retener 7 backups diarios. El job de backup DEBE verificar integridad con `pg_restore --list` tras escribir. El sistema DEBE proveer un procedimiento documentado de restore que:

1. Cree una base aislada (mismo host, nombre distinto).
2. Restaure el dump con `pg_restore --clean --if-exists`.
3. Corra un smoke que liste conteo de usuarios, transacciones y categorías.
4. Elimine la base aislada.

Un drill de restore DEBE ejecutarse al menos una vez antes del gate de lanzamiento público, y el resultado DEBE registrarse en el runbook.

```gherkin
Feature: Backup diario
  Scenario: Backup exitoso
    Given la schedule es 03:00 UTC diaria
    When el job corre
    Then DEBE escribirse un dump en el DSN de backup
    And el dump DEBE pasar el check de integridad `pg_restore --list`
    And el endpoint /status DEBE reflejar lastBackupAt y lastBackupStatus=ok
```

```gherkin
Feature: Restore drill
  Scenario: Restaurar el último dump en una base aislada
    When una operadora corre el script de restore documentado
    Then la base aislada DEBE contener los mismos conteos de filas que producción al momento del dump
    And la base aislada DEBE eliminarse tras el drill
```

## R-PF-8 — Rate limiting

El sistema DEBE aplicar rate limits sobre los siguientes grupos de endpoints, usando el store compartido free-tier:

| Grupo | Identificador | Límite |
| --- | --- | --- |
| `POST /auth/login` | IP + email | 10 / 10 min |
| `POST /auth/register` | IP | 5 / hora |
| `POST /auth/forgot-password` | IP + email | 3 / hora |
| `POST /auth/reset-password` | IP | 10 / hora |
| `GET/POST/PATCH/DELETE /transactions*` | user | 120 / min |
| `GET /transactions/*` (list) | user | 60 / min |
| `GET /fx/*` | user | 60 / min |
| `GET /healthz`, `/readyz`, `/status` | (ninguno) | ilimitado |

Las respuestas de rate limit DEBEN usar HTTP 429 con header `Retry-After`.

```gherkin
Feature: Rate limit de auth
  Scenario: 11° intento de login desde la misma IP en 10 minutos
    Given ya se hicieron 10 intentos desde 203.0.113.5 en los últimos 10 minutos
    When se hace el 11°
    Then la respuesta DEBE ser 429
    And la respuesta DEBE incluir Retry-After
```

```gherkin
Feature: Degradación del store de rate limit
  Scenario: Store de rate limit inalcanzable
    Given el store devuelve un error
    When se llama un endpoint de auth
    Then la respuesta DEBE ser 429 (fail-closed por defecto para endpoints de auth)
```

## R-PF-9 — Endpoint de métricas

La API DEBE exponer `GET /metrics` con texto estilo Prometheus. El endpoint DEBE requerir el `METRICS_TOKEN` vía `Authorization: Bearer` o el mismo valor en el header `X-Metrics-Token`. El endpoint DEBE exponer al menos:

- `http_requests_total{method,path,status}`
- `http_request_duration_seconds_bucket{method,path,le}`
- `http_errors_5xx_total`
- `rate_limit_blocked_total{endpoint}`

```gherkin
Feature: Endpoint de métricas
  Scenario: Métricas sin token
    Given METRICS_TOKEN está seteado
    When GET /metrics se llama sin token
    Then DEBE responder 401

  Scenario: Métricas con token
    When GET /metrics se llama con el token correcto
    Then DEBE responder 200 con content type text/plain
    And DEBE incluir líneas http_requests_total
```

## R-PF-10 — UI de status

`apps/web` DEBE renderizar una página pública `/status` mostrando:

- Label de entorno.
- Commit SHA corto de la API.
- Timestamp del último backup exitoso.
- Uptime desde el último arranque del proceso.
- URLs públicas (web y API).

La página DEBE ser server-rendered y localizada en inglés y español. La página DEBE polear `/status` cada 60 segundos.

```gherkin
Feature: UI de status
  Scenario: Render por defecto
    Given la API de staging está sana
    When un usuario visita https://<staging-web>/status
    Then la página DEBE mostrar el entorno "staging"
    And DEBE mostrar el commit SHA de la API
    And DEBE mostrar el timestamp del último backup
```

```gherkin
Feature: Actualización de la UI de status
  Scenario: Refresh por polling
    Given la página está abierta por 70 segundos
    When ocurre el próximo poll
    Then la página DEBE reflejar cualquier cambio en lastBackupAt sin recarga completa
```

## R-PF-11 — Smoke e2e

Playwright DEBE cubrir los siguientes flujos en un proyecto `smoke` distinto de los proyectos por locale:

1. Visitar `/status` y asertar badges de salud.
2. Pegar contra `/api/healthz`, `/api/readyz`, `/api/status` y asertar 200.
3. Disparar un login rate-limited y asertar 429 + `Retry-After`.

```gherkin
Feature: Smoke e2e
  Scenario: Página de status renderiza
    When Playwright visita /status
    Then DEBE ver el label de entorno
    And DEBE ver el timestamp del último backup
```

## R-PF-12 — Runbook y camino de migración

El repositorio DEBE contener `docs/operations/production-foundation-runbook.md` (inglés) y su espejo `Documents-es/docs/operations/production-foundation-runbook.md` cubriendo:

- Manejo de suspensión del free tier.
- Pasos de verificación diaria del backup.
- Procedimiento de restore drill.
- Pasos de migración del subdominio gratuito a un dominio propio.
- Pasos de migración del hosting free-tier a un proveedor pago.
- Rotación de credenciales Gmail.
- Reconfiguración del store de rate limit.

```gherkin
Feature: Presencia del runbook
    When una operadora inspecciona docs/operations
    Then production-foundation-runbook.md DEBE existir
    And el espejo en español DEBE existir
```

## Requisitos no funcionales

- La API DEBE responder `/healthz` en menos de 50 ms cuando la base es inalcanzable.
- La API DEBE responder `/readyz` en menos de 200 ms cuando la base responde.
- La página de status DEBE alcanzar >= 95 en Lighthouse Performance y >= 95 en Accessibility en visita fría.
- Todo código nuevo DEBE seguir el workflow strict-TDD definido en `openspec/config.yaml`.
- Todos los endpoints públicos DEBEN ser alcanzables desde un navegador sin configuración manual más allá de visitar la URL.
- Todos los fixtures de ESLint boundary DEBEN seguir pasando.
- Todas las cadenas localizadas DEBEN estar presentes en `apps/web/messages/en.json` y `apps/web/messages/es.json`.
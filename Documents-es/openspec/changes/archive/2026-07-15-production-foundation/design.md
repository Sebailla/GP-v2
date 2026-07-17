# Diseño — `production-foundation`

**Proyecto**: `gastos-personales-reference`
**Branch**: `develop` (trabajo) · `main` (inmutable)
**Tracker branch**: `feat/production-foundation`
**Artifact store**: hybrid
**Fecha**: 2026-07-15

Este documento captura las decisiones técnicas del Módulo 1. Todas las bibliotecas, la arquitectura, el por qué / cómo / dónde / cuándo de cada elección y el camino de migración también están resumidos en `docs/architecture/production-foundation.md` (inglés) y `Documents-es/docs/architecture/production-foundation.md` (espejo en español).

---

## 1. Comparación de hosting free-tier

| Proveedor | Web | API | Postgres | Cuota | Región | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Vercel | Sí | No | No | 100 GB bandwidth/mes | us-east-1 por defecto | Mejor fit para `apps/web` (Next.js). |
| Netlify | Sí | Sí (functions) | No | 100 GB bandwidth/mes | us-east-1 | Podría hospedar la API como functions pero los cold starts pegan a transactions. |
| Railway | No | Sí | Sí (trial post-2024) | USD 5 trial | us-west | Postgres ya no es free para cuentas nuevas desde 2024. |
| Render | No | Sí | Sí (90 días free) | Spins down tras 15 min idle | us-east/us-west | Cold starts problemáticos. |
| Fly.io | No | Sí | Sí (free allowance) | 3 VMs compartidas + 1 GB volumen | múltiples regiones | Mejor camino free-tier para API + Postgres. |
| Koyeb | No | Sí | Sí (free tier) | 1 servicio free, Postgres free | Frankfurt, Paris | Free tier limitado pero viable. |

### Decisión (Q-PF-A)

- **Web**: Vercel.
- **API**: Fly.io free allowance con Postgres attached (VM compartida + volumen de 1 GB). Fallback: Koyeb si Fly cambia cuotas.
- **Postgres**: managed Postgres de Fly.io (free para 1 GB de volumen).

Justificación: el free allowance de Fly.io deja la API y la base en la misma región, soporta procesos de larga duración (sin cold starts) y provee un volumen de 1 GB que sobrevive reinicios. El riesgo de churn del free tier está documentado en el runbook.

## 2. Stack de logging

| Capa | Librería | Por qué | Dónde | Cuándo |
| --- | --- | --- | --- | --- |
| Logging API | `pino` | Logger JSON más rápido de Node; soporta redacción y child loggers por request. | `apps/api/src/logging/logger.ts` | Inicializado al arrancar el proceso; un child logger por request HTTP. |
| Logging Web | `pino-browser` | Mismo shape JSON que la API; seguro para navegador. | `apps/web/lib/logger.ts` | Errores del cliente y fallos del polling de `/status`. |
| Request ID | `nanoid` | Generador de IDs pequeño, rápido y URL-safe. | `apps/api/src/middleware/request-id.ts` | Al inicio de cada request; se propaga al child logger. |

## 3. Store de rate limit

| Opción | Free tier | Persistencia | Decisión |
| --- | --- | --- | --- |
| Upstash Ratelimit | 10k requests/día free | Distribuido | **Seleccionado** — SDK para Node; cold starts rápidos. |
| Postgres token bucket | n/a (usa nuestra DB free) | Persistente | Backup si Upstash no está disponible. |

### Decisión (Q-PF-B)

`@upstash/ratelimit` con `@upstash/redis` (free 10k req/día). Cuando el store devuelve error, los endpoints de auth DEBEN fallar cerrado (429) y los de lectura DEBEN fallar abierto (permitir y loguear warning). URL y token del store DEBEN venir por env vars.

## 4. Diseño del backup

- **Cron**: scheduled job de Fly.io (la máquina arranca, corre `pg_dump`, sale).
- **Storage**: Cloudflare R2 free tier (10 GB, 1M ops Class A free).
- **Formato**: `pg_dump -Fc` (custom, comprimido).
- **Naming**: `gastos-<UTC-date>.dump`.
- **Retención**: 7 días (cron local borra dumps viejos).
- **Integridad**: tras escribir, `pg_restore --list <file>` DEBE pasar; si no, el job DEBE marcar `lastBackupStatus=failed`.
- **Restore drill**: `scripts/operations/restore-drill.sh` corre contra el mismo host de Postgres usando una base separada (`gastos_restore_drill`). Drill invocado manualmente y con schedule semanal.

## 5. Shape del payload de `/status`

```ts
interface StatusPayload {
  environment: "local" | "staging" | "production";
  version: string;        // package.json version
  commit: string;         // short SHA del env de CI
  startedAt: string;      // timestamp ISO
  uptimeSeconds: number;
  publicUrl: { web: string; api: string };
  lastBackupAt: string | null;
  lastBackupStatus: "ok" | "failed" | "never";
  rateLimitStore: "upstash" | "postgres" | "memory";
  mailAdapter: "smtp-gmail" | "console";
}
```

Los valores sensibles DEBEN redactarse antes de serializar. El endpoint público `/status` NO DEBE incluir DSN, secretos ni PII.

## 6. UI de status (`apps/web/app/[locale]/status/page.tsx`)

- Server component, fetche `/status` una vez en el render y pasa al cliente.
- Client component polea `/api/status` (proxy web → API) cada 60 s.
- Renderiza tres badges: entorno, último backup, salud de la API.
- Strings localizados en `apps/web/messages/en.json` y `apps/web/messages/es.json` bajo `status.*`.
- WCAG AA; objetivo Lighthouse >= 95 en Performance y Accessibility.

## 7. Mapa de configuración

| Variable | Requerida | Perfil | Descripción |
| --- | --- | --- | --- |
| `NODE_ENV` | sí | todos | `local`, `staging`, `production`. |
| `DATABASE_URL` | sí | todos | Connection string de Postgres. |
| `JWT_SECRET` | sí | todos | Secreto de 32+ bytes para firma JWT. |
| `COOKIE_SECRET` | sí | todos | Secreto de 32+ bytes para firma de cookies. |
| `PUBLIC_WEB_URL` | sí | todos | URL pública de la app web. |
| `PUBLIC_API_URL` | sí | todos | URL pública de la API. |
| `MAIL_DSN` | sí | staging+ | URL SMTP con App Password de Gmail. |
| `BACKUP_DSN` | sí | staging+ | URL R2 / S3-compatible. |
| `METRICS_TOKEN` | sí | staging+ | Requerido para `/metrics`. |
| `UPSTASH_REDIS_REST_URL` | sí | staging+ | URL Upstash para rate limit. |
| `UPSTASH_REDIS_REST_TOKEN` | sí | staging+ | Token Upstash para rate limit. |
| `LOG_LEVEL` | no | todos | `trace|debug|info|warn|error|fatal`. Default `info`. |
| `STATUS_DETAIL_TOKEN` | no | staging+ | Token para ver `/status?detail=full`. |

## 8. Estrategia de tests

- Tests unitarios colocados con el código bajo `__tests__/`.
- Tests de integración contra un Postgres real usando `docker-compose` en CI.
- Playwright e2e con tres proyectos: `en`, `es`, `smoke`.
- Redacción de `pino` verificada con snapshot del output de log en test unitario.
- Job de backup testeado con `pg_dump` y `pg_restore --list` contra un Postgres fixture en CI.
- Restore drill testeado corriendo el script en CI contra una base descartable.

## 9. Descomposición del módulo en tareas

Este módulo sale en un solo PR con cadena estricta de work-unit commits. Diff total estimado: ~320 líneas modificadas, muy por debajo del budget de 400.

### T1.1 — Esquema de configuración de entorno

- **Qué**: esquema Zod para todas las env vars; `parseEnv` devuelve objeto tipado; los secretos solo de producción deben estar presentes.
- **Dónde**: `libs/core/config/src/env.schema.ts`, `libs/core/config/src/env.ts`.
- **TDD**: RED — escribir un test que arranque `parseEnv({ NODE_ENV: 'production' })` sin `JWT_SECRET` y espere throw.
- **Verificación**: `pnpm turbo run typecheck test`.

### T1.2 — Logger pino con redacción

- **Qué**: módulo logger exportando `logger` (raíz) y `childLogger(bindings)`; paths de redacción según R-PF-5.
- **Dónde**: `apps/api/src/logging/logger.ts`, `apps/web/lib/logger.ts`.
- **TDD**: RED — test que logs con `password`, `token`, `email`, `amount` produzcan output redactado.
- **Verificación**: snapshots de test unitario + inspección manual con `curl`.

### T1.3 — Request ID y middleware de log estructurado

- **Qué**: middleware NestJS (o middleware global Express) que setea `x-request-id` y emite una línea de log por request.
- **Dónde**: `apps/api/src/middleware/request-id.ts`, `apps/api/src/middleware/request-logger.ts`.
- **TDD**: RED — test de integración que asserte el shape del log tras un request.
- **Verificación**: `pnpm turbo run test:e2e:api`.

### T1.4 — Endpoints de salud

- **Qué**: controllers `GET /healthz`, `GET /readyz`, `GET /status`; `/status` devuelve el payload documentado.
- **Dónde**: `apps/api/src/modules/health/health.controller.ts`, `apps/api/src/modules/health/health.module.ts`.
- **TDD**: RED — tests de controller assertean shape del payload y 503 en `readyz` cuando la DB es inalcanzable.
- **Verificación**: e2e en `apps/api/test/health.e2e-spec.ts`.

### T1.5 — Adaptador de rate limiter Upstash

- **Qué**: interface `RateLimiter` + adaptador `UpstashRateLimiter` + `InMemoryRateLimiter` para tests; fail-closed por defecto para endpoints de auth.
- **Dónde**: `libs/core/rate-limit/src/`.
- **TDD**: RED — tests para `InMemoryRateLimiter` primero, luego portar a Upstash.
- **Verificación**: `pnpm turbo run test`.

### T1.6 — Aplicar rate limits a controllers de auth y transactions

- **Qué**: decorador o guard que consume el limiter y tira HTTP 429 con `Retry-After`.
- **Dónde**: `apps/api/src/shared/guards/rate-limit.guard.ts` + bindings a nivel controller.
- **TDD**: RED — tests de integración assertean 429 en el 11° intento de login.
- **Verificación**: `apps/api/test/rate-limit.e2e-spec.ts`.

### T1.7 — Endpoint de métricas

- **Qué**: registry de contadores en memoria; `/metrics` devuelve texto Prometheus gateado por `METRICS_TOKEN`.
- **Dónde**: `apps/api/src/modules/metrics/metrics.controller.ts`.
- **TDD**: RED — tests de controller assertean 401 sin token, 200 con token, nombres de métricas esperados.
- **Verificación**: `apps/api/test/metrics.e2e-spec.ts`.

### T1.8 — Job de backup

- **Qué**: script Node invocado por scheduled task de Fly; corre `pg_dump -Fc`, sube a R2, corre `pg_restore --list`, actualiza fila `last_backup_status`.
- **Dónde**: `scripts/operations/backup.ts`, `libs/core/database/src/backup-status.ts`.
- **TDD**: RED — test del script usando un container Postgres temporal.
- **Verificación**: `pnpm turbo run test --filter=@core/database`.

### T1.9 — UI de status

- **Qué**: página `/status` en `apps/web` con labels localizados y polling cada 60 s.
- **Dónde**: `apps/web/app/[locale]/status/page.tsx`, `apps/web/components/status/*`, `apps/web/messages/{en,es}.json`.
- **TDD**: tests de componente + Playwright smoke.
- **Verificación**: `pnpm turbo run e2e --project=smoke`.

### T1.10 — Headers de seguridad y CORS

- **Qué**: middleware Next.js que agrega `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`; allowlist de CORS en NestJS restringida a `PUBLIC_WEB_URL`.
- **Dónde**: `apps/web/middleware.ts`, `apps/api/src/main.ts`.
- **TDD**: RED — test web assertea headers; test API assertea preflight CORS.
- **Verificación**: `pnpm turbo run test:e2e`.

### T1.11 — Pipeline de deploy a staging

- **Qué**: workflow de GitHub Actions que buildea `apps/web` y `apps/api`, corre migraciones, deploya a Vercel y Fly.io, corre smoke post-deploy.
- **Dónde**: `.github/workflows/deploy-staging.yml`.
- **TDD**: no aplica; cambio infra-as-code validado por deploy manual + smoke.
- **Verificación**: pipeline verde en staging; proyecto `smoke` pasa.

### T1.12 — Runbook e informe de arquitectura

- **Qué**: `docs/operations/production-foundation-runbook.md` (inglés + espejo español); `docs/architecture/production-foundation.md` (inglés + espejo español) resumiendo el informe de arquitectura.
- **Dónde**: `docs/operations/`, `Documents-es/docs/operations/`, `docs/architecture/`, `Documents-es/docs/architecture/`.
- **TDD**: no aplica.
- **Verificación**: documentos presentes, sin drift CJK, espejo en sync.

## 10. Migración a proveedores pagos

La aplicación DEBE ser portable. Cada dependencia externa está oculta detrás de una interfaz o env var:

| Externa | Interface | Fallback |
| --- | --- | --- |
| Host web | Config Vercel; alternativa: Netlify / Cloudflare Pages. |
| Host API | `fly.toml`; alternativa: Render / Koyeb / AWS. |
| Postgres | Connection string; alternativa: managed Postgres (Supabase, Neon, RDS). |
| Rate limit store | `@upstash/ratelimit`; alternativa: token bucket sobre Postgres. |
| Object storage | SDK S3; alternativa: cualquier bucket S3-compatible. |
| Email | `MailAdapter` (introducido en T1.x); alternativa: Resend / SES. |
| Uptime monitor | Webhook UptimeRobot; alternativa: BetterStack / Cronitor. |

Cambiar de proveedor DEBE requerir solo updates de env vars + swap de adaptador. Sin cambios de código fuera del adaptador.

## 11. Preguntas abiertas respondidas en diseño

- **Q-PF-A**: lock a Vercel + Fly.io + Cloudflare R2.
- **Q-PF-B**: lock a Upstash Ratelimit.
- **Q-PF-C**: `/status` devuelve el payload público; `/status?detail=full` requiere `STATUS_DETAIL_TOKEN`.
- **Q-PF-D**: el restore drill corre contra la base `gastos_restore_drill` del mismo host y se elimina tras el drill.

## 12. Cross-references

- Propuesta: `openspec/changes/production-foundation/proposal.md`.
- Spec: `openspec/changes/production-foundation/spec.md`.
- Informe de arquitectura: `docs/architecture/production-foundation.md` y `Documents-es/docs/architecture/production-foundation.md`.
- Runbook: `docs/operations/production-foundation-runbook.md` y `Documents-es/docs/operations/production-foundation-runbook.md`.
- Módulos siguientes: Autenticación (Módulo 2), Superadmin (Módulo 3), Privacidad (Módulo 4), FX (Módulo 5), Hardening (Módulo 6).
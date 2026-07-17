# Informe de Arquitectura — Módulo 1: Fundación de Producción

**Fecha**: 2026-07-15
**Proyecto**: `gastos-personales-reference`
**Cambio**: `production-foundation`
**Autor**: orquestador SDD
**Estado**: propuesto

Este documento describe **qué stack usamos, qué bibliotecas, por qué, cómo, dónde y cuándo** para el Módulo 1 del programa de puesta en producción. Es deliberadamente exhaustivo para que una persona operadora (o un yo futuro) pueda reconstruir el sistema sin rederivar las decisiones.

Espejo en inglés: `docs/architecture/production-foundation.md`.

---

## 1. Stack

| Capa | Elección | Por qué |
| --- | --- | --- |
| Hosting web | Vercel (free tier) | Mejor soporte para Next.js 15; 100 GB de ancho de banda por mes; subdominios incluidos. |
| Hosting API | Fly.io (free allowance) | Procesos de larga duración (sin cold starts); volumen persistente de 1 GB; add-on de Postgres gratuito. |
| Postgres | Fly.io Postgres administrado (volumen de 1 GB gratis) | Co-localizado con la región de la API; backups y métricas incluidos. |
| Logging (API) | `pino` | Logger JSON más rápido para Node; redacción nativa; child loggers por request. |
| Logging (Web) | `pino-browser` | Mismo formato JSON que la API; seguro para navegador. |
| Rate limiting | `@upstash/ratelimit` + Upstash Redis free tier | Estado distribuido; SDK en TypeScript; 10k requests/día gratis. |
| Almacenamiento de backups | Cloudflare R2 free tier (10 GB, 1M ops) | Compatible con S3; sin costo de egreso; confiable. |
| Email (cableado diferido) | Gmail dedicado + App Password | Costo inicial cero; aislado detrás de `MailAdapter`. |
| Monitoreo de uptime | UptimeRobot free tier | Chequeos HTTP(s) cada 5 minutos; alertas por email. |
| CI | GitHub Actions (existente) | Ya está en el repo; suma un job de deploy. |
| Tests | Vitest + Playwright + Cucumber (existente) | Ya configurado. |

## 2. Bibliotecas — qué, por qué, dónde, cuándo

### `pino` — logging estructurado de la API

- **Qué**: logger JSON de bajo overhead para Node.
- **Por qué**: latencia predecible, redacción nativa y child loggers que propagan request ID y user ID.
- **Dónde**: `apps/api/src/logging/logger.ts` exporta el logger raíz; el middleware crea child loggers por request.
- **Cuándo**: al iniciar el proceso; uno por request; una línea por request (y eventos de dominio).

### `pino-browser` — logging estructurado del web

- **Qué**: build compatible con navegador, con el mismo formato JSON.
- **Por qué**: formato de log consistente entre API y web; seguro para enviar a clientes.
- **Dónde**: `apps/web/lib/logger.ts`; lo consume el cliente de polling de `/status`.
- **Cuándo**: errores del lado cliente; fallos de polling de `/status`; warnings visibles para el usuario.

### `nanoid` — generación de request ID

- **Qué**: generador diminuto de IDs aleatorios y URL-safe.
- **Por qué**: correlación por request sin dependencia criptográfica.
- **Dónde**: `apps/api/src/middleware/request-id.ts`.
- **Cuándo**: al inicio de cada request HTTP; se propaga a las líneas de log y al header `x-request-id`.

### `@upstash/ratelimit` y `@upstash/redis`

- **Qué**: rate limit sliding window / token bucket sobre Upstash Redis.
- **Por qué**: estado distribuido; poco código; encaja en el free tier.
- **Dónde**: `libs/core/rate-limit/src/upstash.ts`.
- **Cuándo**: en cada request que coincide con una ruta protegida; los endpoints de auth fallan cerrado y los de lectura fallan abierto.

### `pino-pretty` (solo desarrollo)

- **Qué**: pretty printer para pino.
- **Por qué**: legibilidad en desarrollo local.
- **Dónde**: `apps/api/scripts/dev.ts`.
- **Cuándo**: solo cuando `NODE_ENV=local`.

### `tsx` (existente) — ejecución de scripts TS

- **Qué**: ejecutor TS zero-config.
- **Por qué**: reutiliza el ecosistema Node sin build para scripts puntuales.
- **Dónde**: `scripts/operations/*.ts`.
- **Cuándo**: scripts de backup y restore-drill en CI y en scheduled jobs de Fly.io.

### `@aws-sdk/client-s3` (compatible con R2)

- **Qué**: SDK de AWS para S3; funciona con Cloudflare R2 mediante un endpoint custom.
- **Por qué**: cliente S3 portable; evita lock-in de proveedor.
- **Dónde**: `scripts/operations/backup.ts`.
- **Cuándo**: subida de dumps diarios; listado para limpieza por retención.

### `pg_dump`, `pg_restore`, `psql` (herramientas existentes de Postgres)

- **Qué**: utilidades oficiales de Postgres.
- **Por qué**: estándar, bien documentadas, disponibles en la imagen de Postgres de Fly.io.
- **Dónde**: invocadas por el script de backup y el de restore-drill.
- **Cuándo**: cada noche a las 03:00 UTC; bajo demanda durante los drills.

### `prom-client`

- **Qué**: registry de métricas en formato Prometheus.
- **Por qué**: formato estándar; trivial de scrapear; sin SaaS externo.
- **Dónde**: `apps/api/src/modules/metrics/*`.
- **Cuándo**: contadores actualizados por request; expuesto en `/metrics` detrás de `METRICS_TOKEN`.

### `react-hook-form`, `zod`, `next-intl` (existentes) — UI de status

- **Qué**: ya están en el repo.
- **Por qué**: consistencia con el resto de la aplicación web.
- **Dónde**: `apps/web/components/status/*`.
- **Cuándo**: render de la página de status y del cliente de polling.

### `MailAdapter` — seam de email transaccional

- **Qué**: port específico del runtime de la API con implementaciones console y Gmail.
- **Por qué**: mantiene el código de negocio independiente del transporte SMTP y hace testeable el flujo de recuperación de contraseña del Módulo 2.
- **Dónde**: `apps/api/src/mail/mail.adapter.ts`, con composición DI en `apps/api/src/mail/mail.module.ts`.
- **Cuándo**: el adapter console se selecciona sin DSN o en development; el skeleton Gmail se selecciona en entornos que no sean development cuando existe `MAIL_DSN` y se conectará en el Módulo 2.

## 3. Arquitectura

```
┌───────────────────────────────┐    ┌────────────────────────────────────┐
│ Navegador (público)           │    │ Fly.io (región: GRU/EZE)           │
│ ┌───────────────────────────┐ │    │ ┌───────────────┐ ┌──────────────┐  │
│ │ apps/web (Vercel)         │ │    │ │ apps/api      │ │ Postgres     │  │
│ │ Next.js 15 + next-intl    │ │◀──▶│ │ NestJS + pino │ │ (1 GB)       │  │
│ │ Status UI + middleware    │ │    │ └──────┬────────┘ └──────┬───────┘  │
│ └─────────────┬─────────────┘ │    │        │                │           │
└────────────────┼──────────────┘    │        ▼                ▼           │
                 │ HTTPS             │ ┌──────────────────────────────┐   │
                 │                   │ │ Upstash Redis (free tier)   │   │
                 │                   │ └──────────────────────────────┘   │
                 │                   │ ┌──────────────────────────────┐   │
                 │                   │ │ Scheduled job: backup        │──▶ Cloudflare R2
                 │                   │ └──────────────────────────────┘   │
                 │                   │ ┌──────────────────────────────┐   │
                 │                   │ │ Check UptimeRobot            │──▶ Gmail
                 │                   │ └──────────────────────────────┘   │
                 │                   └────────────────────────────────────┘
```

## 4. Cuándo se activa cada pieza

| Disparador | Qué sucede |
| --- | --- |
| `git push develop` | CI: lint + test + build → deploy Vercel + Fly → migrate → smoke. |
| `GET /healthz` | Devuelve 200 mientras el proceso esté vivo. |
| `GET /readyz` | Devuelve 200 solo si la DB responde y las migraciones están aplicadas. |
| `GET /status` | Devuelve snapshot JSON consumido por la página de status. |
| `GET /metrics` (con token) | Devuelve texto Prometheus. |
| Cada request HTTP | Una línea de log estructurado; rate limit por IP/usuario; request ID asignado. |
| 03:00 UTC diario | Scheduled job de Fly corre `backup.ts`; ante una falla, `lastBackupStatus=failed`. |
| `pnpm run restore-drill` manual | Corre el script de restore drill en `gastos_restore_drill`. |
| Cron semanal (manual) | Ejecuta restore drill; actualiza la entrada del runbook. |
| Check de uptime cada 5 min | UptimeRobot consulta `/healthz`; ante una falla, envía un email por Gmail. |

## 5. Migración a proveedores pagos

Cada dependencia externa vive detrás de una sola variable de entorno o interfaz:

- Hosting web: cambiar `apps/web` a cualquier host Next.js.
- Hosting API: `fly.toml` es el único artefacto; otros hosts aceptan la misma imagen Docker.
- Postgres: cambiar `DATABASE_URL`.
- Rate limit store: reemplazar `@upstash/ratelimit` por un token bucket respaldado por Postgres.
- Almacenamiento de objetos: `BACKUP_DSN` acepta cualquier endpoint compatible con S3.
- Email: `MailAdapter` permite cambiar Gmail por Resend o SES más adelante.
- Monitor de uptime: migrar a BetterStack o a una instancia autoalojada de kenerl.

No cambia código de aplicación fuera del adaptador correspondiente.

## 6. Archivos creados o modificados

- `libs/core/config/src/env.schema.ts` (esquema Zod).
- `libs/core/config/src/env.ts` (singleton tipado de env).
- `libs/core/logging/src/logger.ts` (pino + redacción).
- `libs/core/rate-limit/src/*` (interface + Upstash + InMemory).
- `apps/api/src/middleware/{request-id,request-logger}.ts`.
- `apps/api/src/modules/health/*`.
- `apps/api/src/modules/metrics/*`.
- `apps/api/src/shared/guards/rate-limit.guard.ts`.
- `apps/api/test/{health,rate-limit,metrics}.e2e-spec.ts`.
- `apps/web/app/[locale]/status/page.tsx`.
- `apps/web/components/status/*`.
- `apps/web/messages/{en,es}.json` (nuevas claves `status.*`).
- `apps/web/middleware.ts` (headers de seguridad).
- `apps/web/lib/logger.ts`.
- `scripts/operations/{backup,restore-drill}.ts`.
- `.github/workflows/deploy-staging.yml`.
- `apps/api/src/mail/*` (port MailAdapter y adapters skeleton).
- `docs/architecture/production-foundation.md` (versión en inglés).
- `Documents-es/docs/architecture/production-foundation.md` (este archivo).
- `docs/operations/production-foundation-runbook.md`.
- `Documents-es/docs/operations/production-foundation-runbook.md` (espejo).

## 7. Resumen de aceptación

Este módulo se cierra cuando:

- Los 12 requisitos R-PF-N pasan la verificación.
- Las 12 tareas T1.1–T1.12 aterrizan como commits atómicos en `feat/production-foundation`.
- `pnpm turbo run build lint typecheck test e2e` sale con código 0.
- El proyecto Playwright `smoke` pasa.
- El restore drill finaliza correctamente.
- `pnpm lint:fixtures` sale con código 0.
- El espejo en español está sincronizado sin drift de caracteres CJK.

Una vez cerrado, comienza el Módulo 2 (Autenticación Pública).

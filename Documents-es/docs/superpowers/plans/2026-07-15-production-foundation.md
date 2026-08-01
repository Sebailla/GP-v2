# Plan de Implementación — Fundación de Producción

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para tracking.

**Goal:** Aterrizar el Módulo 1 del programa de puesta en producción de `gastos-personales-reference`: una rebanada vertical que vuelve la app desplegable en servicios administrados free-tier, observable, recuperable y verificable en el navegador, sin entregar ninguna funcionalidad de usuario final.

**Arquitectura:** Un nuevo cambio `production-foundation` que suma validación de env, logging estructurado, endpoints de salud, rate limiting, métricas, job de backup + restore drill, página `/status` en `apps/web`, headers de seguridad y un pipeline de deploy. Cada tarea aterriza como commit atómico en `feat/production-foundation` y produce una rebanada vertical completa (backend + frontend + UI + tests + docs).

**Tech Stack:** TypeScript 5 strict, NestJS 11, Next.js 15, pnpm 11, Turbo 2.x, Prisma 7, Zod 4, pino (API) + pino-browser (web), @upstash/ratelimit + @upstash/redis (rate limit), prom-client (métricas), @aws-sdk/client-s3 (backups a R2), Vitest, Playwright, GitHub Actions.

## Restricciones globales

- **Strict TDD**: cada tarea de código de producción sigue RED → GREEN → TRIANGULATE → REFACTOR. Un test fallido DEBE existir antes de cualquier código de producción.
- **Commits atómicos**: un commit por tarea; `git revert <sha>` revierte limpio.
- **Disciplina de branch**: trabajo en `feat/production-foundation`; merge a `develop` solo después de que `sdd-verify` confirme cada gate; `main` es inmutable.
- **Espejo español**: cada `.md` inglés producido bajo `openspec/changes/production-foundation/` o `docs/` DEBE tener espejo bajo `Documents-es/` en el mismo commit atómico. Verificar con `perl -ne 'print if /\p{Han}/' <file>` retornando vacío.
- **UI completa, no scaffold**: cada página nueva DEBE renderizar estados loading / error / success / empty / validation-error y pasar WCAG AA.
- **Fixtures de ESLint boundary**: `pnpm lint:fixtures` DEBE seguir verde.
- **Sin `new PrismaClient()` fuera de `@core/database`**: lo enforce ESLint.
- **Sin schemas Zod fuera de `libs/core/config/env.schema.ts` y `libs/features/*/shared/schemas/`**: lo enforce ESLint.
- **`MailAdapter` se introduce como interface en T1.12**, aunque el cableado de Gmail se difiere al Módulo 2. Esto deja la costura disponible.
- **Reusar helpers de test existentes**: `apps/api/test/setup-env.ts` ya siembra `process.env`; no duplicar esa lógica. Las nuevas vars de entorno extienden el schema y el fixture.
- **Reusar los decoradores existentes**: `@BodySchema(schema)` y `@QuerySchema(schema)` desde `apps/api/src/shared/decorators/*` son los decoradores de parámetro canónicos. Los nuevos endpoints deben usarlos.
- **Reusar los patrones NestJS existentes**: los controllers deben terminar con el campo estático `_ServiceAnchor` para sobrevivir refactors de `import type` (lo enforce el ESLint rule `@gpr/boundary/no-import-type-injectable`).
- **Reusar convenciones del proyecto Playwright e2e smoke**: la config de Playwright en `apps/web/playwright.config.ts` ya tiene proyectos `en` + `es`; este plan agrega un tercer proyecto llamado `smoke`.
- **Respetar la frontera `MailAdapter`** introducida en T1.12 (ningún código de negocio puede importar `nodemailer` directo).

---

## Estructura de archivos

Este plan introduce los siguientes archivos (nombres en inglés; entradas del espejo español notadas donde apliquen):

### Paquetes y módulos nuevos

- `libs/core/logging/src/` — logger pino + redacción.
- `libs/core/logging/package.json` — nuevo paquete `@core/logging`.
- `libs/core/logging/tsconfig.json` — extiende `tsconfig.base.json`.
- `libs/core/logging/vitest.config.ts` — setup de vitest.
- `libs/core/logging/src/__tests__/logger.test.ts` — snapshots de redacción.
- `libs/core/rate-limit/src/` — interface `RateLimiter` + `InMemoryRateLimiter` + `UpstashRateLimiter`.
- `libs/core/rate-limit/package.json`.
- `libs/core/rate-limit/tsconfig.json`.
- `libs/core/rate-limit/vitest.config.ts`.
- `libs/core/rate-limit/src/__tests__/in-memory.test.ts`.
- `libs/core/rate-limit/src/__tests__/upstash.test.ts`.
- `apps/api/src/middleware/request-id.ts`.
- `apps/api/src/middleware/request-logger.ts`.
- `apps/api/src/modules/health/health.controller.ts`.
- `apps/api/src/modules/health/health.module.ts`.
- `apps/api/src/modules/health/status.builder.ts`.
- `apps/api/src/modules/metrics/metrics.controller.ts`.
- `apps/api/src/modules/metrics/metrics.module.ts`.
- `apps/api/src/modules/metrics/registry.ts`.
- `apps/api/src/shared/guards/rate-limit.guard.ts`.
- `apps/api/src/shared/guards/rate-limit.decorator.ts`.
- `apps/api/src/mail/mail.adapter.ts`.
- `apps/api/src/mail/console-mail.adapter.ts`.
- `apps/api/src/mail/gmail-mail.adapter.ts`.
- `apps/api/src/mail/mail.module.ts`.
- `apps/api/test/health.e2e-spec.ts`.
- `apps/api/test/rate-limit.e2e-spec.ts`.
- `apps/api/test/metrics.e2e-spec.ts`.
- `apps/api/test/middleware.e2e-spec.ts`.
- `apps/api/src/mail/__tests__/console-mail.adapter.test.ts`.
- `apps/api/src/mail/__tests__/gmail-mail.adapter.test.ts`.
- `scripts/operations/backup.ts` — `pg_dump` diario + upload a R2.
- `scripts/operations/restore-drill.ts` — restore en base aislada.
- `apps/web/app/[locale]/status/page.tsx`.
- `apps/web/app/[locale]/status/layout.tsx`.
- `apps/web/app/[locale]/status/loading.tsx`.
- `apps/web/app/[locale]/status/error.tsx`.
- `apps/web/app/[locale]/status/not-found.tsx`.
- `apps/web/app/[locale]/status/__tests__/page.test.tsx`.
- `apps/web/components/status/StatusCard.tsx`.
- `apps/web/components/status/StatusPolling.tsx`.
- `apps/web/components/status/StatusBadge.tsx`.
- `apps/web/lib/status-client.ts`.
- `apps/web/lib/logger.ts`.
- `apps/web/middleware.ts` — extiende el middleware de next-intl con headers de seguridad.
- `apps/web/__tests__/middleware.test.ts`.
- `apps/web/e2e/status/status.spec.ts`.
- `.github/workflows/deploy-staging.yml`.
- `docs/operations/production-foundation-runbook.md` (inglés).
- `Documents-es/docs/operations/production-foundation-runbook.md` (espejo español).
- `docs/architecture/production-foundation.md` (inglés).
- `Documents-es/docs/architecture/production-foundation.md` (espejo español).

### Archivos modificados

- `libs/core/config/env.schema.ts` — suma las nuevas env vars y el perfil de producción.
- `libs/core/config/env.ts` — exporta el env tipado con los nuevos campos.
- `libs/core/config/__tests__/env.test.ts` — extendido para los nuevos campos.
- `libs/core/config/package.json` — agrega peer de `@core/logging` + `@core/rate-limit`.
- `apps/api/src/main.ts` — cablea middleware request-id + request-logger, headers de seguridad y `/metrics`.
- `apps/api/src/app.module.ts` — importa `HealthModule` + `MetricsModule` + `MailModule`.
- `apps/api/src/modules/auth/auth.module.ts` — aplica `@RateLimit` a los métodos del controller.
- `apps/api/src/modules/auth/auth.controller.ts` — agrega metadata del decorador `@RateLimit`.
- `apps/api/src/modules/transactions/transactions.module.ts` — aplica `@RateLimit` a los métodos del controller.
- `apps/api/src/modules/transactions/transactions.controller.ts` — agrega metadata del decorador `@RateLimit`.
- `apps/api/src/modules/health/health.controller.ts` — lee `lastBackupAt` desde la base.
- `apps/api/package.json` — suma `pino`, `pino-http`, `nanoid`, `prom-client`, `@upstash/ratelimit`, `@upstash/redis`, `@aws-sdk/client-s3`, `pg` (dev), `@core/logging`, `@core/rate-limit`.
- `apps/api/test/setup-env.ts` — suma las nuevas env vars al fixture de test.
- `apps/web/package.json` — suma `pino-browser`, `nanoid` (browser build).
- `apps/web/playwright.config.ts` — agrega el proyecto `smoke`.
- `apps/web/messages/en.json` — agrega namespace `status.*`.
- `apps/web/messages/es.json` — agrega namespace `status.*`.
- `apps/web/app/api/status/route.ts` — proxy de `/status` desde el web a la API.
- `package.json` (raíz) — agrega tareas `backup` y `restore-drill`.
- `tsconfig.base.json` — agrega path aliases para `@core/logging` y `@core/rate-limit`.
- `libs/core/database/src/index.ts` — exporta los helpers de backup-status.
- `libs/core/database/src/backup-status.ts` — NUEVO.
- `libs/core/database/prisma/schema.prisma` — agrega modelo `BackupRun`.
- `libs/core/database/prisma/migrations/<timestamp>_backup_status/migration.sql` — NUEVO.

### Archivos NO tocados en este módulo

- `libs/features/auth/server/**` — la lógica de negocio queda intacta.
- `libs/features/transactions/server/**` — la lógica de negocio queda intacta.
- `libs/features/auth/shared/schemas/**` — sin cambios de schema.
- `libs/features/transactions/shared/schemas/**` — sin cambios de schema.
- `openspec/changes/archive/2026-07-05-vertical-slicing-reference-scaffold/**` — artefactos históricos.

---

## Matriz de verificación

| Requisito | Verificado por |
| --- | --- |
| R-PF-1 — validación de env | `libs/core/config/__tests__/env.test.ts` |
| R-PF-2 — cookies seguras + CORS | asserciones de CORS en `apps/api/test/health.e2e-spec.ts` + `apps/web/__tests__/app/status.test.tsx` |
| R-PF-3 — headers de seguridad | `apps/web/__tests__/middleware.test.ts` + Playwright `smoke` |
| R-PF-4 — endpoints de salud | `apps/api/test/health.e2e-spec.ts` + Playwright `smoke` |
| R-PF-5 — logging estructurado con redacción | `libs/core/logging/__tests__/logger.test.ts` + snapshot |
| R-PF-6 — deploy free-tier de staging | `.github/workflows/deploy-staging.yml` + deploy manual a staging |
| R-PF-7 — backups de DB y restore | `libs/core/database/__tests__/backup-status.test.ts` + `scripts/operations/__tests__/backup.test.ts` |
| R-PF-8 — rate limiting | `apps/api/test/rate-limit.e2e-spec.ts` + `libs/core/rate-limit/__tests__/in-memory.test.ts` |
| R-PF-9 — endpoint de métricas | `apps/api/test/metrics.e2e-spec.ts` |
| R-PF-10 — UI de status | `apps/web/__tests__/app/status/page.test.tsx` + Playwright `smoke` |
| R-PF-11 — smoke e2e | `apps/web/e2e/status/status.spec.ts` |
| R-PF-12 — presencia del runbook | `git ls-files docs/operations/production-foundation-runbook.md` + espejo español |

---

## Mapa de tareas

| Tarea | Tema | Archivos | LOC est. |
| --- | --- | --- | --- |
| T1.1 | Esquema de configuración de entorno | env.schema.ts, env.ts, env.test.ts, setup-env.ts | 40 |
| T1.2 | Logger pino con redacción | libs/core/logging/* | 60 |
| T1.3 | Middleware request ID + log | apps/api/src/middleware/* | 50 |
| T1.4 | Endpoints de salud | apps/api/src/modules/health/* + e2e | 70 |
| T1.5 | Adaptador de rate limiter Upstash | libs/core/rate-limit/* | 50 |
| T1.6 | Guards de rate limit | shared/guards/* + e2e | 30 |
| T1.7 | Endpoint de métricas | modules/metrics/* + e2e | 30 |
| T1.8 | Script de backup + restore drill | scripts/operations/* + tests | 60 |
| T1.9 | UI de status | apps/web/app/[locale]/status/* + i18n | 80 |
| T1.10 | Headers de seguridad + CORS | apps/web/middleware.ts + main.ts | 30 |
| T1.11 | Pipeline de deploy a staging | .github/workflows/deploy-staging.yml | 40 |
| T1.12 | Runbook + esqueleto MailAdapter | docs/operations/* + Documents-es | 80 |

Total estimado (producción + tests + docs): ~620. Diff neto bajo el budget de 400 líneas filtrando tests/docs: ~320.

---

## Self-Review Checklist (correr antes de `sdd-verify`)

- [ ] `pnpm install` sale con código 0.
- [ ] `pnpm lint:fixtures` sale con código 0.
- [ ] `pnpm turbo run typecheck` sale con código 0.
- [ ] `pnpm turbo run lint` sale con código 0.
- [ ] `pnpm turbo run test` sale con código 0.
- [ ] `pnpm --filter api test` sale con código 0.
- [ ] `pnpm --filter web test` sale con código 0.
- [ ] `pnpm --filter @core/config test` sale con código 0.
- [ ] `pnpm --filter @core/logging test` sale con código 0.
- [ ] `pnpm --filter @core/rate-limit test` sale con código 0.
- [ ] `pnpm --filter @core/database test` sale con código 0.
- [ ] `perl -ne 'print if /\p{Han}/' Documents-es/docs/architecture/production-foundation.md Documents-es/docs/operations/production-foundation-runbook.md` retorna vacío.
- [ ] `git diff --stat develop` muestra 12 commits atómicos en `feat/production-foundation`.
- [ ] `/status` es alcanzable localmente vía `pnpm dev` (API + web), con `lastBackupStatus: "never"` hasta que T1.8 escriba su primera fila de backup.

---

## `next_recommended`

`apply` — implementar las 12 tareas de arriba como commits atómicos en `feat/production-foundation`. Después de que todas las tareas aterricen, correr `sdd-verify` para asertar R-PF-1..R-PF-12. Una vez verificado, mergear a `develop` vía PR (no requiere PRs encadenados — total de líneas modificadas bajo 400 filtrando tests + docs).

Las 12 tareas individuales (T1.1..T1.12) están detalladas paso a paso en el archivo en inglés:

`docs/superpowers/plans/2026-07-15-production-foundation.md`

Cada tarea incluye sus archivos, interfaces producidas, contratos de test y comandos de verificación. Este espejo sirve como referencia de alto nivel para revisión; el detalle operacional vive en la versión en inglés.
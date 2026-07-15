# Tareas — `production-foundation`

**Proyecto**: `gastos-personales-reference`
**Branch**: `develop` (trabajo) · `main` (inmutable)
**Tracker branch**: `feat/production-foundation`
**Artifact store**: hybrid
**Modo**: interactivo
**Delivery strategy**: `single-pr` (módulo único)
**Chain strategy**: n/a
**Review budget**: 400 líneas modificadas
**Fecha**: 2026-07-15

Este archivo descompone el diseño en un único PR con tareas strict-TDD. Cada tarea termina en un commit atómico. `git revert <sha>` revierte cualquier tarea limpiamente.

### Forecast de carga de review

```text
Decision needed before apply: No
Chained PRs recommended: No
400-line budget risk: Low (estimado ~320 líneas modificadas)
Estimated changed lines: ~320
```

### Tareas

| # | Tema | TDD | LOC estimado | Verificación |
| --- | --- | --- | --- | --- |
| T1.1 | Esquema de configuración de entorno | RED → GREEN | 40 | `pnpm turbo run typecheck test` |
| T1.2 | Logger pino con redacción | RED → GREEN | 60 | `pnpm turbo run test --filter=@core/logging` |
| T1.3 | Middleware de request ID + log estructurado | RED → GREEN | 50 | `pnpm turbo run test:e2e:api` |
| T1.4 | Endpoints de salud (`/healthz`, `/readyz`, `/status`) | RED → GREEN | 70 | `apps/api/test/health.e2e-spec.ts` |
| T1.5 | Adaptador de rate limiter Upstash + interface | RED → GREEN | 50 | `pnpm turbo run test --filter=@core/rate-limit` |
| T1.6 | Guards de rate limit en auth + transactions | RED → GREEN | 30 | `apps/api/test/rate-limit.e2e-spec.ts` |
| T1.7 | Endpoint de métricas con token | RED → GREEN | 30 | `apps/api/test/metrics.e2e-spec.ts` |
| T1.8 | Script de backup diario + restore drill | RED → GREEN | 60 | `pnpm turbo run test --filter=@core/database` |
| T1.9 | UI de status + i18n + Playwright smoke | RED → GREEN | 80 | `pnpm turbo run e2e --project=smoke` |
| T1.10 | Headers de seguridad + CORS | RED → GREEN | 30 | `pnpm turbo run test:e2e` |
| T1.11 | Pipeline de deploy a staging | n/a (infra) | 40 | deploy manual + smoke |
| T1.12 | Runbook + informe de arquitectura (EN + ES) | n/a (docs) | 80 | `grep -P '[\x{4e00}-\x{9fff}]'` retorna 0 |

Total: ~620 LOC incluyendo tests. Diff neto (producción + tests + docs): ~320 líneas modificadas.

### Patrón por tarea

Cada tarea sigue:

1. **RED** — test fallido escrito primero.
2. **GREEN** — código mínimo para pasar.
3. **TRIANGULATE** — sumar casos que ejerciten bordes.
4. **REFACTOR** — limpiar sin cambiar comportamiento.

### Reglas duras derivadas a `sdd-apply`

- `strict_tdd: true` activo.
- Commits atómicos por tarea; `git revert <task-sha>` revierte limpio.
- Disciplina de branch: trabajo en `feat/production-foundation`; merge a `develop` solo después de que `sdd-verify` confirme cada gate.
- Espejo español producido por cada `.md` inglés bajo `docs/` y `openspec/changes/production-foundation/` en el **mismo commit atómico** según `AGENTS.md §13`.
- UI completa, no scaffold: cada página debe renderizar loading/error/success/empty/validation-error y alcanzar WCAG AA.
- Fixtures de ESLint boundary siguen pasando (`pnpm lint:fixtures`).

### Artefactos persistidos

- Inglés: `openspec/changes/production-foundation/{proposal,spec,design,tasks}.md`.
- Espejo español: `Documents-es/openspec/changes/production-foundation/{proposal,spec,design,tasks}.md`.
- Informe de arquitectura: `docs/architecture/production-foundation.md` y `Documents-es/docs/architecture/production-foundation.md`.
- Runbook: `docs/operations/production-foundation-runbook.md` y `Documents-es/docs/operations/production-foundation-runbook.md`.

### `next_recommended`

`apply` — `sdd-apply` DEBE leer este archivo de tareas, el diseño y el spec. Forward `delivery_strategy=single-pr` y `chain_strategy=n/a`. Verificar que las 12 tareas aterricen como commits atómicos en `feat/production-foundation`; correr `sdd-verify` contra R-PF-1..R-PF-12 antes de mergear a `develop`.
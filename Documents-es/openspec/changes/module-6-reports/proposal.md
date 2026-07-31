# Propuesta — module-6-reports (Reports & Analytics)

> **Autor**: Sebastián Illa
> **Fecha**: 2026-07-29
> **Estado**: proposed (el orchestrator marca archived después de apply + verify)
> **Branch**: `feat/module-6-reports` (cortada desde `develop` @ `da81865`)
> **Artifact store**: hybrid (archivos OpenSpec + observaciones Engram)
> **Strict TDD**: ACTIVO (per `openspec/config.yaml` strict_tdd: true)
> **Delivery strategy**: auto-chain (per SDD preflight; este slice pronostica >400 líneas)
> **Review budget**: 400 líneas

## Intent

Agregar un vertical slice de Reports & Analytics a `gastos-personales-reference`. El outcome visible al usuario es una página `/[locale]/(app)/reports` que muestra insight pre-agregado sobre los datos existentes de `Transaction` + `Category` del usuario: resumen mensual, desglose por categoría con comparación de período, y exportación CSV. Es la primera capability user-facing que entrega *insight* en lugar de *capture* — cierra la brecha entre "registré mis gastos" y "entiendo dónde se va mi plata".

El slice es **read-only en la capa de datos**: ninguna tabla nueva de Prisma, ninguna migración, ningún cambio de schema. Reports reutiliza el port existente `TransactionRepository.findManyForUser(userId, range)` vía `@features/transactions` para el seam de lectura crudo. El código nuevo es una capa fina de composición (`TimeBucketService` + controllers de reports + page UI + BDD) sobre el seam de lectura, más sus propios helpers de agregación in-service.

> **Enmienda (follow-up PR #6)**: la proposal original se comprometió a reusar `TotalsService` de `@features/transactions` para evitar duplicar agregación. La investigación mostró que **no es factible** por construcción: `TotalsService` opera sobre entidades `Transaction` con `kind: 'income' | 'expense'` (signo codificado en la fila), mientras que reports agrega sobre proyecciones `TransactionForReport` donde `amount` ya es un `Decimal` string sign-aware **después de la conversión FX** a la primary currency del usuario. Los dos data models no son intercambiables; la agregación de reports es una operación distinta (post-FX, sign-en-amount) que la API de `TotalsService` no puede consumir sin acoplarla al layer FX o duplicar la superficie del port. El `ReportsService.aggregateTotals` in-service es la implementación correcta y mínima. Ver `design.md` §"Architecture decisions" decision #1 enmienda para la rationale completa.

## Scope (in-scope)

- Capability spec en `openspec/specs/reports/spec.md` (y mirror ES).
- Vertical slice bajo `libs/features/reports/` con el split canónico:
  - `shared/schemas/` — Zod schemas para query/response: `report-query.schema.ts`, `report-summary.schema.ts`, `report-by-category.schema.ts`, `report-by-period.schema.ts`.
  - `server/` — port `ReportsRepository` (entry point read-only de agregación) + `TimeBucketService` (weekly/monthly grouping) + `ReportsService` (orquesta queries → retorna `SummaryReport`, `CategoryBreakdownReport`, `PeriodComparisonReport`) + `ReportsController` + wiring del módulo NestJS.
  - `client/` — componentes React: `ReportsFilterBar`, `MonthlySummaryCard`, `CategoryBreakdownTable`, `PeriodComparisonPanel`, `ExportCsvButton`, más wrappers de estado loading/error/empty/success.
  - `docs/` — feature BDD `reports.feature` + step definitions + binding `realm.steps.ts`.
- Rutas API bajo `/api/reports/*`:
  - `GET /api/reports/summary?fromDate&toDate` → `SummaryReport`.
  - `GET /api/reports/by-category?fromDate&toDate` → `CategoryBreakdownReport[]`.
  - `GET /api/reports/by-period?fromDate&toDate&bucket=week|month` → `PeriodComparisonReport`.
  - `GET /api/reports/export.csv?fromDate&toDate[&detail=transactions]` → CSV stream.
- Page UI en `apps/web/app/[locale]/(app)/reports/page.tsx` (server component, locale-aware) consumiendo los componentes de `client/`. *(Solo `<Stat>` cards numéricas — sin chart library; ver enmienda Recharts en design.md §"Visualization".)*
- Strict TDD: RED → GREEN → TRIANGULATE → REFACTOR para cada service + controller + componente.
- Cobertura BDD para los 4 user flows (summary, breakdown, comparison, CSV export).
- Tests de componentes (Vitest) por cada componente de `client/`, cobertura 5 estados per AGENTS.md §9.
- E2E (Playwright) para un critical flow por locale (`/en/reports` y `/es/reports`).
- Patrones de accesibilidad entregados (HTML semántico, `aria-live`, labels asociados); el audit automatizado WCAG AA vía `@axe-core/playwright` está cubierto por `apps/web/e2e/reports.spec.ts` y bloqueado a `wcag2a`, `wcag2aa`, `wcag21a` y `wcag21aa`.
- Mirror en español de cada `.md` bajo `openspec/changes/module-6-reports/` en `Documents-es/openspec/changes/module-6-reports/` (per AGENTS.md §13). Verificación de caracteres chinos en los archivos ES: `grep -P '[\x{4e00}-\x{9fff}]'` retorna vacío.
- Cobertura 60% por paquete en los nuevos paquetes `libs/features/reports/{shared,server,client}` (per `openspec/config.yaml`, soft target).

## Out of scope

- Nuevas tablas Prisma o migraciones.
- Transactions recurrentes / cron / scheduler.
- Multi-account / wallets (un slice aparte necesitaría tabla `Account` + FK `transaction.accountId` + migración).
- Multi-user / shared budgets (per AGENTS.md §11).
- Export PDF (solo CSV, está in-scope).
- Tax reports / fiscal-year reporting.
- Forecast / predictive charts (no ML, no extrapolación).
- Reports admin-side (p.ej., MRR global, actividad por usuario). Reports son user-facing.
- Push notifications para budget threshold breaches (el `ThresholdService` server-side existe pero la integración UI es un slice aparte).
- Otras librerías de charts (sin chart library en este slice — solo `<Stat>` cards numéricas; ver enmienda Recharts en design.md §"Visualization").
- Anomaly detection / outlier highlighting.
- Tagging de transactions (slice aparte).

## Surface (read / write)

**Read** (tablas existentes):
- `Transaction` (vía `TransactionRepository.findManyForUser`)
- `Category` (vía `CategoryRepository`)
- `Currency`, `FxRate` (vía `CurrencyRepository`, `FxRateRepository`)

**Write**: nada. Reports es un slice read-only.

## Decisiones de arquitectura

1. **Agregación in-service en `ReportsService` (NO delegada a `TotalsService`)** — *enmendado desde la intención original de "reusar TotalsService"*. La decisión original era delegar per-category + per-user totals al `TotalsService` de `@features/transactions` para evitar la trampa de dos implementaciones divergiendo. Esto **no es factible** por construcción: `TotalsService` consume `Transaction` (con `kind: 'income' | 'expense'`, signo codificado en la fila) y montos `Decimal` en la currency original; `ReportsService` consume `TransactionForReport` (con `amount: string` sign-aware, ya FX-convertido a la primary currency del usuario). Las dos data shapes no son intercambiables, y la agregación de reports es intrínsecamente *post-FX-conversion* — operación distinta. El helper `ReportsService.aggregateTotals` es la implementación correcta y mínima; el "riesgo de divergencia" original no aplica porque las dos agregaciones responden preguntas diferentes (totales undifferentiated per-user vs totales FX-normalizados per-user / per-category / per-period).
2. **Nuevo `TimeBucketService` en `libs/features/reports/server/src/domain/`** — lógica de dominio pura para weekly/monthly grouping. RED-testable, sin I/O, sin Prisma. Toma `Transaction[]` y `bucket: 'week' | 'month'`; retorna `Bucket[]`.
3. **Schemas en `libs/features/reports/shared/schemas/`** — Zod schemas estrictos, uno por shape de query/response. Mirror del shape del schema list canónico: cursor pagination + half-open `[fromDate, toDate)` + ISO-4217 `currencyCode`.
4. **Las server routes retornan JSON pre-agregado**; el client renderiza `<Stat>` cards numéricas y una tabla de comparación (sin chart library — ver enmienda Recharts en design.md §"Visualization"). No hay generación de CSV en el client.
5. **Todos los endpoints `/api/reports/*` requieren sesión autenticada** vía el `JwtAuthGuard` existente; cada query filtra por `userId` de la sesión. No hay endpoints admin-only.
6. **Endpoint de export CSV** en `GET /api/reports/export.csv?fromDate&toDate[&detail=transactions]`. Modo default = filas de resumen (una por categoría). Con `?detail=transactions` = line items (una fila por transacción). CSV injection guard: celdas que empiezan con `=`, `+`, `-`, `@` reciben un prefijo de comilla simple.
7. **Page UI es server component** con `getTranslations` + page header, y el área de filter + tabla es un client component (`<ReportsWorkspace />`). Locale-aware; usa catálogos `next-intl` en `apps/web/messages/{en,es}/reports.json`.
8. **Normalización FX a currency primaria** — todas las agregaciones convierten vía `FxRateProvider` (existente). La currency primaria del usuario viene de `CurrencyRepository.findPrimaryForUser(userId)` (método nuevo sobre el port existente; si falta, default a USD con console warn + counter de observability). Detail CSV export mantiene `currencyCode` por fila.
9. **Comparativa de período** — ventana de comparación = la ventana inmediatamente anterior con la misma duración. Si `fromDate=2026-07-01&toDate=2026-07-29`, comparación = `2026-06-02..2026-06-30` (29 días hacia atrás). La respuesta carga `current` + `previous` + `delta` (absoluto + porcentual) para que el client renderice "Este período: $X vs $Y anterior (+Z%)".
10. *(Eliminado — ver enmienda Recharts en design.md §"Visualization".)*
11. **Reglas de boundary** enforced vía `tools/eslint-plugin-boundary/`: schemas en `shared/`, port + service + impl en `server/`, componentes en `client/`, BDD en `docs/`. Reports NO importa de `apps/web/` (one-way: web importa de features). Reports NO importa de `apps/api/` (el lado server usa el módulo NestJS desde `apps/api/src/modules/reports/` que importa de `@features/reports/server`).
12. **No se emiten eventos nuevos en `@core/events`** — reports es read-only, no necesita audit signal para un usuario mirando sus propios datos. Si compliance requiere después auditar CSV-export, eso es follow-up.

## Capabilities

- **Nueva**: `openspec/specs/reports/spec.md` — capability spec para Reports & Analytics.
- **Touched (read)**: `openspec/specs/auth-server-surface/spec.md` (auth boundary), `openspec/specs/observability/spec.md` (metrics sobre latencia del endpoint de reports — pequeño follow-up al wiring de observability existente).
- **Sin tocar**: `rbac-admin`, `audit-log-ui`, `password-reset-user-flow`, `mail-adapter-port`, `google-oauth-handshake`, `nextauth-web-routes`.

## Test plan

- **Unit (Vitest) RED → GREEN → TRIANGULATE → REFACTOR**:
  - `TimeBucketService` — array vacío, tx única, signo mixto, límites week vs month (incl. fin de año de la semana, día bisiesto), rango invertido, duplicados exactos.
  - `ReportsService` — orquestación: toma port + FX provider, retorna summary/breakdown/period con valores FX-convertidos. Triangular: rango vacío, mes parcial, categoría única, mezcla multi-currency.
  - CSV serializer — filas vacías, fila única, caracteres especiales (`=`, `+`, `-`, `@`), normalización CRLF, BOM para compatibilidad con Excel.
- **Integration (Vitest + NestJS Test module)**:
  - `ReportsController` con `ReportsRepository` mock + `TimeBucketService` real + `JwtAuthGuard` mock inyectando `userId`.
  - `GET /api/reports/summary` con auth → 200 + shape de response válido.
  - Cross-user leak test: `userId-A` pide un rango; la response contiene solo transactions de `userId-A` incluso si el repo es consultado con un `userId` distinto (belt-and-suspenders test).
- **Component (Vitest + Testing Library + happy-dom)**:
  - `ReportsFilterBar` — 5 estados: loading / error / success / empty / validation-error.
  - `MonthlySummaryCard` — mismos 5 estados.
  - `CategoryBreakdownTable` — mismos 5 estados.
  - `PeriodComparisonPanel` — mismos 5 estados.
  - `ExportCsvButton` — loading / error / success / disabled-when-empty.
- **BDD (Cucumber 13)**:
  - `reports.feature` cubre: monthly summary para usuario nuevo; category breakdown después de 5 transactions en 2 categorías; period comparison con delta; CSV export summary mode; CSV export detail mode; CSV injection guard.
- **E2E (Playwright)**:
  - Un critical flow por locale: `/en/reports` abre → filter "this month" → ve monthly summary → click "export CSV" → archivo descarga.
  - `/es/reports` mirror del mismo flow.
  - El audit WCAG AA vía `@axe-core/playwright` está cubierto por `apps/web/e2e/reports.spec.ts` y bloqueado a `wcag2a`, `wcag2aa`, `wcag21a` y `wcag21aa`.
- **Coverage target**: 60% lines/branches/functions/statements per `openspec/config.yaml`. Por paquete en los nuevos `libs/features/reports/{shared,server,client}`.

## Quality gates (deben pasar antes de merge)

| Gate | Comando | Esperado |
| --- | --- | --- |
| Install | `pnpm install` | exits 0 |
| DB | `pnpm db:up && docker compose ps` | Postgres healthy |
| Build | `pnpm turbo run build` | exits 0 |
| Lint | `pnpm turbo run lint` | exits 0 |
| Typecheck | `pnpm turbo run typecheck` | exits 0 |
| Test | `pnpm turbo run test` | exits 0 |
| Boundary fixtures | `pnpm lint:fixtures` | exits 0 |
| BDD | `pnpm turbo run bdd` | exits 0 (todos los escenarios verdes) |
| E2E | `pnpm turbo run e2e` | exits 0 (ambos locales + axe pass) |

## Risks

- **Drift de normalización de currency** — si el usuario mezcla currencies en el rango de tiempo, la staleness del FX rate podría dar deltas engañosos. **Mitigation**: usar el mismo `FxRateProvider` que transactions; respetar su política de staleness de 24h; en el reporte, exponer un campo `fxFreshness` (p.ej., `fresh | stale`) para que la UI muestre un banner.
- **CSV injection en el export** — celdas que empiezan con `=`, `+`, `-`, `@` ejecutan fórmulas en Excel/Sheets. **Mitigation**: prefix `'` para cualquier celda que matchee `^[=+\-@]`. Agregar test unitario explícito.
- **Performance: agregaciones sobre rangos grandes** — un usuario con 5 años de transactions podría timeout-ear. **Mitigation**: enforce max range de 365 días; retornar 400 Bad Request con mensaje claro en caso contrario. Agregar counter de observability sobre el endpoint.
- **Edge aritmético de la comparación de período** — bordes DST + diferencias de longitud de mes podrían desalinear la ventana de comparación por 1 día. **Mitigation**: la ventana de comparación se computa vía `(fromDate - duration, fromDate)` donde `duration = toDate - fromDate` en días; explícitamente NO usamos "mismo mes calendario del año pasado" para evitar drift por DST.

## Migration

Ninguna. Slice read-only, sin cambios de DB, sin cambios de schema, sin backfill de datos.

## Open questions (deferred — respondidas para esta propuesta)

1. ✅ Date range presets — Presets (Esta semana, Este mes, Últimos 3 meses, YTD) + Custom.
2. ✅ Period comparison — Dual (current vs previous, con delta).
3. ✅ CSV export columns — Dual mode (`?detail=transactions` para line items, default = summary).
4. ✅ Charts — *Eliminado del scope per la enmienda Recharts en design.md §"Visualization". Las `<Stat>` cards numéricas son la UX final.*
5. ✅ Empty state — Onboarding CTA → `/transactions/new`.
6. ✅ Default currency — FX-normalizar a primary currency; detail mantiene `currencyCode` por fila.

## Next phase

`sdd-spec` — escribir capability spec en `openspec/changes/module-6-reports/specs/reports/spec.md` (EN) + mirror español.

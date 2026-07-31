# Spec — Capability Reports (module-6-reports)

> **Autor**: Sebastián Illa
> **Fecha**: 2026-07-29
> **Estado**: draft
> **Capability**: `reports` — insight financiero sobre los datos de `Transaction` + `Category` del usuario
> **Read-only**: sí (sin escrituras Prisma, sin emisión de eventos)

## Propósito

Define el comportamiento observable de la superficie de Reports & Analytics: rutas del servidor que retornan JSON pre-agregado para resumen mensual, desglose por categoría y comparación de período sobre el historial de `Transaction` del usuario, más un endpoint de export CSV, más una page UI que renderiza estas agregaciones. El slice es read-only en la capa de datos y hereda los invariantes de auth + boundary existentes de `@features/auth` y `@features/transactions`.

El outcome de cara al usuario es una página `/[locale]/(app)/reports` que convierte "qué registré" en "en qué gasté, dónde, y comparado con qué" — habilitando decisiones de presupuesto.

## Dependencias

- `@features/auth/server` — `JwtAuthGuard`, resolución de sesión, inyección de `userId`.
- `@features/transactions/server` — `TransactionRepository.findManyForUser`, `CategoryRepository`, `CurrencyRepository`, `FxRateProvider`. **`TotalsService` NO se consume** (ver nota de enmienda en `proposal.md` §"Intent" y `design.md` §"Ports + services + impl split" — los dos data models no son intercambiables). Reports provee sus propios helpers de agregación in-service.
- `@core/database` — Prisma client (usado solo dentro de la impl del port; no en `ReportsService`).
- `@core/events` — no usado (slice read-only).
- `recharts` — agregado como dependencia de `apps/web`, usado solo en componentes de `client/`.
- `next-intl` — strings locale-aware bajo `apps/web/messages/{en,es}/reports.json`.

## Surface

### Server routes (bajo `/api/reports/*`)

Todas las rutas requieren autenticación vía `JwtAuthGuard`. El `userId` se toma de la sesión y se propaga a cada query. El rango máximo es 365 días; pasado eso, retorna 400 Bad Request.

#### `GET /api/reports/summary?fromDate&toDate[&currencyCode]`

Retorna `SummaryReport` (objeto único).

- **Query** (todos requeridos, validados por `report-query.schema.ts`):
  - `fromDate` — string ISO-8601 fecha `YYYY-MM-DD`.
  - `toDate` — string ISO-8601 fecha `YYYY-MM-DD`.
  - `currencyCode` — código ISO-4217 opcional; default a la currency primaria del usuario.
- **Response** (`ReportsSummary`):
  - `fromDate` (echo del input)
  - `toDate` (echo del input)
  - `currencyCode` (resuelto)
  - `income` — string `Decimal`, income total en el rango, FX-convertido a `currencyCode`.
  - `expense` — string `Decimal`, expense total en el rango, sign-aware (negativo).
  - `net` — string `Decimal`, `income - expense.abs()`.
  - `transactionCount` — int.
  - `fxFreshness` — `'fresh' | 'stale'`; `'stale'` si algún FX rate con más de 24h fue usado.
- **Status codes**:
  - `200 OK` — éxito.
  - `400 Bad Request` — query inválido, falta `fromDate`/`toDate`, rango > 365 días, rango invertido.
  - `401 Unauthorized` — sin sesión.
  - `500 Internal Server Error` — inesperado.

#### `GET /api/reports/by-category?fromDate&toDate[&currencyCode]`

Retorna `CategoryBreakdownReport[]` (array, ordenado por expense absoluto DESC).

- **Query**: igual que `/summary`.
- **Elemento de response** (`CategoryBreakdownReport`):
  - `categoryId` — cuid.
  - `categoryName` — string, human-readable desde `CategoryRepository`.
  - `total` — string `Decimal`, suma FX-convertida de transactions en esta categoría en el rango.
  - `transactionCount` — int.
  - `share` — número `0..1`, fracción del expense total para esta categoría.
- **Rango vacío**: retorna `[]` (no 404).
- **Status codes**: igual que `/summary`.

#### `GET /api/reports/by-period?fromDate&toDate&bucket=week|month[&currencyCode]`

Retorna `PeriodComparisonReport`.

- **Query**:
  - `fromDate`, `toDate` — requeridos.
  - `bucket` — enum `'week' | 'month'`, requerido.
  - `currencyCode` — opcional.
- **Response** (`PeriodComparisonReport`):
  - `current` — `PeriodSeries`:
    - `totals` — `ReportsSummary` (mismo shape que `/summary`).
    - `buckets` — `Array<{ label: string; fromDate: string; toDate: string; income: Decimal; expense: Decimal; net: Decimal }>`.
  - `previous` — `PeriodSeries` (mismo shape, computado para la ventana inmediatamente anterior a `fromDate..toDate` con la misma duración).
  - `delta` — `{ income: Decimal; expense: Decimal; net: Decimal; netPercent: number }`. `netPercent` es `number`, posiblemente negativo; `Infinity`/`NaN` serializado como `null`.
- **Status codes**: igual que `/summary`.

#### `GET /api/reports/export.csv?fromDate&toDate[&detail=transactions][&currencyCode]`

Retorna stream `text/csv; charset=utf-8`.

- **Query**:
  - `fromDate`, `toDate` — requeridos.
  - `detail` — enum opcional `'summary' | 'transactions'`; default `'summary'`.
  - `currencyCode` — opcional.
- **Response**:
  - `Content-Type: text/csv; charset=utf-8`.
  - `Content-Disposition: attachment; filename="reports-<fromDate>-<toDate>[.detail].csv"`.
  - Body: documento CSV.
- **Modo default (`detail=summary`)**:
  - Columns: `category_id,category_name,total,currency_code,transaction_count,share`.
  - Una fila por categoría.
  - Última fila es `__TOTAL__` con los grand totals.
- **Modo detail (`detail=transactions`)**:
  - Columns: `id,occurred_at,description,category_id,category_name,amount,currency_code,amount_in_primary,primary_currency_code`.
  - Una fila por transacción.
  - `amount_in_primary` es FX-convertido.
- **CSV injection guard**: celdas que empiezan con `=`, `+`, `-`, `@` reciben prefijo de comilla simple.
- **Encoding**: UTF-8 con BOM (`\xEF\xBB\xBF`) para compatibilidad con Excel.
- **Line endings**: CRLF (`\r\n`).
- **Status codes**: igual que `/summary`, más `404 Not Found` si `categoryId` referencia una categoría soft-deleted.

### Page UI

`apps/web/app/[locale]/(app)/reports/page.tsx` es server component.

- Renderiza `<h1>` con título de página vía `getTranslations('ReportsPage')`.
- Renderiza `<ReportsWorkspace />` (client component, lazy-loaded).
- El prefijo de locale `/en/reports` o `/es/reports` se enforce por el middleware `next-intl` existente; la página no maneja resolución de locale ella misma.

`<ReportsWorkspace />` (client component):
- Mantiene el estado del filtro de rango de fechas (`fromDate`, `toDate`, `bucket`, `currencyCode`).
- Renderiza 4 cards en orden:
  1. `<MonthlySummaryCard />` — llama a `/api/reports/summary`, renderiza `income` / `expense` / `net` + un `<BarChart />` de Recharts.
  2. `<CategoryBreakdownTable />` — llama a `/api/reports/by-category`, renderiza una tabla con `categoryName`, `total`, `share` (formateado como %).
  3. `<PeriodComparisonPanel />` — llama a `/api/reports/by-period`, renderiza `current.buckets` + `previous.buckets` alineados side-by-side, más un `<LineChart />` de Recharts mostrando `net` sobre los buckets, y un header "Este período: $X (vs $Y anterior, +Z%)".
  4. `<ExportCsvButton />` — llama a `/api/reports/export.csv?detail=summary`, después `?detail=transactions`. Muestra dos botones: "Export summary" y "Export transactions".
- Renderiza los 5 estados per AGENTS.md §9: loading, error, success, empty ("No data in this range — create your first transaction"), validation-error (rango > 365 días).

## Invariantes

1. **Auth requerida**: cada server route retorna 401 sin sesión.
2. **Aislamiento por usuario**: cada query filtra por `userId` de la sesión. Sin cross-user leak. El cross-user leak test es parte de la suite de integración.
3. **Cap de rango**: `toDate - fromDate <= 365 días`. Pasado eso, 400.
4. **Rango half-open**: `[fromDate, toDate)` — `toDate` es exclusivo. Rangos invertidos se permiten por diseño (zero-result probe).
5. **FX freshness**: si algún FX rate usado en la agregación tiene más de 24h, la response lleva `fxFreshness: 'stale'`. La UI muestra un banner.
6. **Sin writes**: reports NO debe emitir eventos en `@core/events`, NO debe llamar Prisma writes, NO debe mutar session o audit log.
7. **Locale-aware**: las responses del server son locale-neutral; el client renderiza strings locale-aware vía catálogos `next-intl`.
8. **CSV safety**: cualquier celda que empiece con `=`, `+`, `-`, `@` lleva prefijo `'`. UTF-8 BOM en la response. CRLF line endings.
9. **Sin chart en el server**: el server retorna solo JSON; Recharts se carga solo en componentes client.

## Escenarios (Given-When-Then)

### Escenario S1 — Auth requerida

```
Given un usuario autenticado con 10 transactions en 2026-06
When el usuario navega a /en/reports
Then la página renderiza ReportsPage con el ReportsWorkspace
And los cuatro componentes hijos se montan en su estado loading
```

### Escenario S2 — Monthly summary, usuario nuevo

```
Given un usuario autenticado con 0 transactions en el mes actual
When el usuario abre /en/reports
Then el MonthlySummaryCard muestra el empty state con el CTA de onboarding
And el link de create-transaction apunta a /en/transactions/new
```

### Escenario S3 — Monthly summary, populado

```
Given un usuario autenticado con 5 transactions en 2026-07 (3 en "Food", 2 en "Transport")
And la currency primaria del usuario es USD
When el usuario pide GET /api/reports/summary?fromDate=2026-07-01&toDate=2026-08-01
Then la response contiene income=0, expense=-150, net=150, transactionCount=5
And fxFreshness es "fresh"
```

### Escenario S4 — Category breakdown

```
Given el mismo setup que S3
When el usuario pide GET /api/reports/by-category?fromDate=2026-07-01&toDate=2026-08-01
Then la response es un array de dos CategoryBreakdownReport
And el array está ordenado por expense absoluto DESC
And los valores de share suman 1.0 (dentro de 0.01 de rounding)
```

### Escenario S5 — Period comparison con delta

```
Given un usuario autenticado con:
  - 2026-07-01..2026-07-29: 5 transactions, expense=100
  - 2026-06-02..2026-06-30: 5 transactions, expense=80
When el usuario pide GET /api/reports/by-period?fromDate=2026-07-01&toDate=2026-07-29&bucket=month
Then la response contiene current.net = 100 y previous.net = 80
And delta.netPercent = 0.25 (incremento del 25%)
```

### Escenario S6 — Period comparison, DST-safe

```
Given el usuario pide un rango que cruza un borde DST en su locale
When se computa la ventana de comparación
Then la ventana de comparación es duration-equivalente (duración en días, no basada en mes-calendario)
And las fechas no se desplazan 1 día por DST
```

### Escenario S7 — Cap de rango

```
Given un usuario autenticado
When el usuario pide GET /api/reports/summary?fromDate=2024-01-01&toDate=2026-01-01
Then la response es 400 Bad Request
And el mensaje de error menciona el cap de 365 días
```

### Escenario S8 — Rango invertido es válido

```
Given un usuario autenticado
When el usuario pide GET /api/reports/summary?fromDate=2026-08-01&toDate=2026-07-01
Then la response es 200 OK con data vacía (income=0, expense=0, net=0, transactionCount=0)
```

### Escenario S9 — Aislamiento cross-user

```
Given usuarios A y B, ambos con sesiones autenticadas
When user A pide GET /api/reports/summary?fromDate=2026-07-01&toDate=2026-08-01
Then la response contiene SOLO transactions de user A, nunca de user B
```

### Escenario S10 — CSV export summary mode

```
Given un usuario autenticado con 5 transactions en 2 categorías para 2026-07
When el usuario clickea "Export summary"
Then el browser descarga reports-2026-07-01-2026-08-01.csv
And el archivo tiene UTF-8 BOM
And el archivo tiene CRLF line endings
And el archivo tiene columns: category_id, category_name, total, currency_code, transaction_count, share
And hay una fila por categoría más una fila __TOTAL__
```

### Escenario S11 — CSV export detail mode

```
Given el mismo setup que S10
When el usuario clickea "Export transactions"
Then el browser descarga reports-2026-07-01-2026-08-01.detail.csv
And el archivo tiene columns: id, occurred_at, description, category_id, category_name, amount, currency_code, amount_in_primary, primary_currency_code
And hay una fila por transacción
```

### Escenario S12 — CSV injection guard

```
Given un usuario tiene una transacción con description = "=cmd|'/c calc'!A0"
When el usuario exporta en detail mode
Then la celda description en el CSV está prefijada con una comilla simple: "'=cmd|'/c calc'!A0"
```

### Escenario S13 — Banner de FX freshness

```
Given un usuario autenticado con transactions en EUR
And el FX rate para EUR tiene más de 24 horas
When el usuario abre /en/reports
Then la response lleva fxFreshness="stale"
And la UI muestra un banner "FX rates may be stale — figures are approximate"
```

### Escenario S14 — DST boundary en period comparison

```
Given un usuario autenticado con transactions en un locale afectado por DST
When el usuario pide un período que cruza un borde DST
Then la ventana de comparación se computa por duración (días), no por mes-calendario
And las fechas no se desplazan 1 día
```

### Escenario S15 — Locale routing

```
Given el usuario accede a la página desde el prefijo de locale EN
When la página se renderiza
Then todos los strings visibles están en inglés
And la URL queda en /en/reports (sin redirect client-side de locale)
```

### Escenario S16 — Check de caracteres Vietnamitas/Chinos

```
Given un archivo mirror español en Documents-es/openspec/changes/module-6-reports/
When el archivo se commitea
Then no contiene ningún caracter CJK (per el check de perl regex sobre \p{Han})
```

### Escenario S17 — Empty state CTA

```
Given el usuario tiene 0 transactions en el rango seleccionado
When el ReportsWorkspace se renderiza
Then el copy del empty state dice "No data in this range"
And un botón "Create your first transaction" linkea a /[locale]/transactions/new
```

### Escenario S18 — Agregación multi-currency

```
Given el usuario tiene transactions en USD y EUR dentro del rango
And la currency primaria del usuario es USD
When el usuario pide /api/reports/summary
Then la response muestra income + expense + net en USD (FX-convertido)
And el detail CSV export mantiene currencyCode de cada transacción y agrega amount_in_primary en USD
```

### Escenario S19 — Concurrencia (sin contención de write)

```
Given dos tabs del navegador del mismo usuario autenticado
When ambos piden /api/reports/summary con rangos distintos
Then ambas responses retornan exitosa e independientemente
And ninguno de los tabs muta estado compartido
```

### Escenario S20 — Conformidad WCAG AA (DIFERIDO — ver nota de enmienda abajo)

```
Given el ReportsPage está renderizado
When corre el audit de @axe-core/playwright
Then no se reportan violaciones de WCAG AA
```

**Nota de enmienda (PR #6 / archive-amendment)**: el proposal original
se comprometió con un audit de `@axe-core/playwright` sobre la página
renderizada `/[locale]/reports`. El repo de referencia sí envía
patrones de accesibilidad (HTML semántico, `aria-live="polite"` en
`FxStalenessBanner`, `<label htmlFor>` en cada input de formulario,
`<th scope>` en la tabla de breakdown), pero el spec automatizado de
audit se difirió — el entorno de dev requiere Postgres corriendo
para el harness de e2e, y el slice se entrega read-only contra el
adapter in-memory, por lo que el audit debe aterrizar en un change de
follow-up una vez que el adapter Prisma reemplace al in-memory. Este
escenario queda como invariante diferido; el slice se archiva con S20
UNTESTED y el follow-up queda trackeado en el archive report.

## Compliance

- **AGENTS.md §9 (UI complete, not scaffold)**: cobertura de 5 estados por componente `client/`. Patrones de accesibilidad enviados (HTML semántico, `aria-live`, labels asociados), pero el audit automatizado WCAG AA vía `@axe-core/playwright` se difiere a un slice de follow-up (ver nota de enmienda S20). Rutas con prefijo de locale vía `/en/...` y `/es/...`. Component tests + E2E tests por surface crítica. Sin páginas placeholder, sin componentes stub.
- **AGENTS.md §4 (Strict TDD)**: cada service + controller + service client impl + componente escrito bajo RED → GREEN → TRIANGULATE → REFACTOR.
- **AGENTS.md §7 (boundary rules)**: Prisma solo en `libs/core/database`. Schemas solo en `libs/features/reports/shared/schemas/`. Sin imports client↔server. Sin imports cross-module; rutear vía `@core/events` o shared ports.
- **AGENTS.md §13 (Spanish mirror)**: cada `.md` bajo `openspec/changes/module-6-reports/` viene con mirror `Documents-es/openspec/changes/module-6-reports/` en el mismo commit atómico. Check CJK pasa.
- **AGENTS.md §11 (out of scope)**: sin tablas Prisma nuevas, sin i18n más allá de en/es, sin infra de observability (usa el wiring M5 existente), sin UI de audit-log.

## Next phase

`sdd-design` — el diseño técnico que responde *cómo* se implementa este spec (file layout, port + service + impl, wiring NestJS, composición de página, BDD bridge).

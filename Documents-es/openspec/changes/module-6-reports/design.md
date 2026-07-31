# Design — module-6-reports (Reports & Analytics)

> **Autor**: Sebastián Illa
> **Fecha**: 2026-07-29
> **Estado**: draft
> **Phase**: diseño técnico que responde al proposal + spec
> **Source**: `openspec/changes/module-6-reports/{proposal,specs/reports/spec}.md`

## File layout

```
libs/features/reports/
├── package.json                                # paquete workspace, nombre @features/reports
├── tsconfig.json                               # extiende ../../tsconfig.base.json
├── vitest.config.ts                            # extiende slice-8 happy-dom pool
├── src/
│   ├── shared/
│   │   ├── schemas/
│   │   │   ├── index.ts                        # barrel
│   │   │   ├── report-query.schema.ts          # Zod: reportQuerySchema (fromDate/toDate/currencyCode/bucket)
│   │   │   ├── report-summary.schema.ts        # Zod: reportSummarySchema (income/expense/net/count/fxFreshness)
│   │   │   ├── report-by-category.schema.ts    # Zod: reportByCategorySchema
│   │   │   └── report-by-period.schema.ts      # Zod: reportByPeriodSchema (current/previous/delta)
│   │   └── __tests__/
│   │       ├── report-query.schema.test.ts     # strict-shape contract
│   │       ├── report-summary.schema.test.ts
│   │       └── report-by-period.schema.test.ts
│   ├── server/
│   │   ├── domain/
│   │   │   ├── ports/
│   │   │   │   ├── reports.repository.ts       # port: ReportsRepository (seam de agregación read-only)
│   │   │   │   └── reports.repository.token.ts # token TSyringe-style (o @Inject de NestJS)
│   │   │   ├── services/
│   │   │   │   ├── time-bucket.service.ts      # puro: Transaction[] + bucket → Bucket[]
│   │   │   │   ├── reports.service.ts          # orquesta: repo + FX + time-bucket → ReportsSummary/Category/Period
│   │   │   │   └── csv-serializer.ts           # puro: rows → CSV string con BOM + CRLF + injection guard
│   │   │   └── types.ts                        # re-export tipos desde shared/schemas
│   │   ├── infrastructure/
│   │   │   └── adapters/
│   │   │       └── prisma-reports.repository.ts # impl usando PrismaTransactionRepository + PrismaCategoryRepository
│   │   ├── http/
│   │   │   ├── reports.controller.ts           # controller NestJS, 4 endpoints
│   │   │   ├── reports.module.ts               # wiring módulo NestJS
│   │   │   └── decorators/
│   │   │       └── user-id.decorator.ts        # @UserId() — extrae userId de request.user
│   │   └── __tests__/
│   │       ├── time-bucket.service.test.ts     # unit
│   │       ├── reports.service.test.ts         # unit (repo + FX mockeados)
│   │       ├── csv-serializer.test.ts          # unit (incl. injection guard)
│   │       ├── reports.controller.test.ts      # integration (NestJS Test module)
│   │       └── prisma-reports.repository.integration.test.ts  # integration (Postgres real de test)
│   ├── client/
│   │   ├── reports-workspace.tsx               # container: tiene filter state, monta 4 cards
│   │   ├── reports-filter-bar.tsx              # date presets + custom range + bucket + apply
│   │   ├── monthly-summary-card.tsx            # usa Recharts BarChart
│   │   ├── category-breakdown-table.tsx        # usa shadcn Table
│   │   ├── period-comparison-panel.tsx         # usa Recharts LineChart + delta header
│   │   ├── export-csv-button.tsx               # dos botones: summary / transactions
│   │   ├── fx-staleness-banner.tsx             # se muestra cuando response.fxFreshness === 'stale'
│   │   ├── reports-empty-state.tsx             # empty + CTA a /[locale]/transactions/new
│   │   ├── reports-error-state.tsx             # error con botón retry
│   │   ├── reports-loading-state.tsx           # skeleton
│   │   ├── hooks/
│   │   │   ├── use-reports-summary.ts          # SWR-lite (o RQ-lite) client fetch
│   │   │   ├── use-reports-by-category.ts
│   │   │   ├── use-reports-by-period.ts
│   │   │   └── use-reports-csv.ts              # descarga vía fetch + Blob
│   │   ├── api/
│   │   │   └── reports-api.ts                  # fetchers tipados; contraparte client-side de los Zod schemas
│   │   └── __tests__/
│   │       ├── monthly-summary-card.test.tsx   # cobertura 5 estados
│   │       ├── category-breakdown-table.test.tsx
│   │       ├── period-comparison-panel.test.tsx
│   │       ├── export-csv-button.test.tsx
│   │       ├── reports-filter-bar.test.tsx
│   │       └── reports-workspace.test.tsx
│   └── docs/
│       ├── reports.feature                     # escenarios BDD S1-S20 mapeados a Given-When-Then
│       ├── step-defs/
│       │   ├── realm.steps.ts                  # binding @features/reports (mirror del patrón slice-8 auth)
│       │   ├── summary.steps.ts                # When user requests /api/reports/summary
│       │   ├── breakdown.steps.ts              # When user requests /api/reports/by-category
│       │   ├── comparison.steps.ts             # When user requests /api/reports/by-period
│       │   ├── export.steps.ts                 # When user exports CSV
│       │   └── auth.steps.ts                   # Given un usuario autenticado
│       └── support/
│           ├── world.ts                        # tipo World compartido
│           └── fixture-loader.ts               # siembra transactions para los escenarios
└── apps/api/src/modules/reports/
├── reports.controller.ts                       # passthrough fino a @features/reports/server
├── reports.module.ts                           # importa ReportsModule del server, registra controller
└── __tests__/
└── reports.e2e.test.ts                         # supertest + NestJS

apps/web/app/[locale]/(app)/reports/
└── page.tsx                                    # server component, renderiza ReportsWorkspace

apps/web/messages/
├── en/reports.json                             # catálogo next-intl
└── es/reports.json

openspec/specs/reports/
├── spec.md                                     # capability spec canónica
└── tests/                                      # test plan de la capability (linkeado desde spec)

Documents-es/openspec/specs/reports/
└── spec.md                                     # mirror español
```

## Ports + services + impl split

### Port: `ReportsRepository`

`libs/features/reports/server/src/domain/ports/reports.repository.ts`

```ts
import type { TransactionId, UserId, CategoryId, Decimal, CurrencyCode, IsoDate, Bucket } from '@core/types';

export interface TransactionForReport {
  readonly id: TransactionId;
  readonly userId: UserId;
  readonly occurredAt: Date;
  readonly amount: Decimal;          // signed: income > 0, expense < 0
  readonly currencyCode: CurrencyCode;
  readonly categoryId: CategoryId;
  readonly categoryName: string;
}

export interface ReportsRepository {
  findForUserInRange(
    userId: UserId,
    range: { fromDate: IsoDate; toDate: IsoDate },
  ): Promise<readonly TransactionForReport[]>;

  findPrimaryCurrencyForUser(userId: UserId): Promise<CurrencyCode | null>;
}
```

El port es **deliberadamente estrecho** — apenas suficiente data para que `ReportsService` haga su trabajo. Sin filtering, sin agregación; eso es trabajo del service. Esto mantiene la impl swappable (Prisma adapter para prod, in-memory para tests).

### Domain service: `TimeBucketService`

Función pura. Sin I/O. Sin Prisma. Sin dependencia de clock (toma `now: Date` como parámetro para testabilidad).

```ts
export type Bucket = 'week' | 'month';

export interface BucketSeriesPoint {
  readonly label: string;             // '2026-W27' o '2026-07'
  readonly fromDate: IsoDate;
  readonly toDate: IsoDate;
  readonly transactions: readonly TransactionForReport[];
  readonly income: Decimal;
  readonly expense: Decimal;
  readonly net: Decimal;
}

export const timeBucketService = {
  bucketize(transactions: readonly TransactionForReport[], bucket: Bucket, range: { fromDate: IsoDate; toDate: IsoDate }): readonly BucketSeriesPoint[],
};
```

- `bucket=week` usa ISO-8601 week numbering (Mon-Sun).
- `bucket=month` usa meses-calendario en el timezone del locale del usuario (el server asume UTC por simplicidad; el client renderiza el locale del usuario encima).
- Rangos invertidos: retorna `[]`.
- Rango vacío: retorna `[]`.

### Domain service: `ReportsService`

Compone `ReportsRepository` + `FxRateProvider` + `TimeBucketService`. **No delega a `TotalsService` de `@features/transactions`** — ver la enmienda a Architecture decision #1 abajo para la rationale (diferentes data shapes: `Transaction` con `kind` vs `TransactionForReport` con `amount` sign-aware post-FX).

```ts
export const reportsService = {
  async getSummary(userId: UserId, range: ReportQuery, currencyCode?: CurrencyCode): Promise<ReportsSummary>,
  async getByCategory(userId: UserId, range: ReportQuery, currencyCode?: CurrencyCode): Promise<readonly CategoryBreakdownReport[]>,
  async getByPeriod(userId: UserId, range: ReportQuery, bucket: Bucket, currencyCode?: CurrencyCode): Promise<PeriodComparisonReport>,
  async exportCsv(userId: UserId, range: ReportQuery, detail: 'summary' | 'transactions', currencyCode?: CurrencyCode): Promise<{ filename: string; body: string; contentType: 'text/csv' }>,
};
```

Internals:

1. `getSummary` llama `repo.findForUserInRange(userId, range)`, corre cada uno por `fxRateProvider.convertTo(amount, currencyCode)` (paralelo con concurrencia acotada), agrega vía el helper `aggregateTotals` in-service (sign-on-amount post-FX), retorna `ReportsSummary` con `fxFreshness` seteado a `'stale'` si algún rate tiene más de 24h.
2. `getByCategory` similar, corre la misma conversión FX + bucketing per-category hecho in-service (sin delegación a `TotalsService.perCategory`), computa `share` como `categoryTotal.abs() / totalExpense.abs()`.
3. `getByPeriod`:
   - Computa ventana de comparación: `comparisonFrom = fromDate - duration`, `comparisonTo = fromDate`, donde `duration = toDate - fromDate` en días. Explícitamente NO mes-calendario para evitar drift por DST.
   - Fetch ambas ventanas desde `repo`.
   - Bucketiza ambas vía `timeBucketService.bucketize`.
   - Computa delta entre current y previous totals.
   - Retorna `PeriodComparisonReport`.
4. `exportCsv` delega a `csvSerializer.serialize(rows, columns)` con las columnas apropiadas según el modo `detail`.

### Domain: `csvSerializer`

Función pura. Sin I/O. Testeable con `expect(csv).toBe(...)`.

```ts
export const csvSerializer = {
  serialize(rows: readonly Record<string, string | number>[], columns: readonly string[]): string,
};
```

Notas de implementación:

- Prefix UTF-8 BOM (`\uFEFF`).
- CRLF line endings (`\r\n`).
- CSV injection guard: cualquier string de celda que empiece con `=`, `+`, `-`, `@` recibe prefijo de comilla simple. Celdas numéricas pasan tal cual.
- Celdas conteniendo `,`, `"`, `\r`, `\n` se envuelven en `"..."` con `"` embebido duplicado.

### NestJS module: `ReportsModule`

`apps/api/src/modules/reports/reports.module.ts`

```ts
@Module({
  imports: [
    TransactionsModule,        // para FxRateProvider, CategoryRepository, CurrencyRepository (TotalsService NO se consume — ver enmienda decision #1)
    AuthModule,                 // para JwtAuthGuard, resolución de user
    PrismaModule,               # para PrismaService
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    TimeBucketService,
    {
      provide: ReportsRepositoryToken,
      useClass: PrismaReportsRepository,
    },
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
```

El controller en `apps/api/src/modules/reports/reports.controller.ts` es un passthrough fino a los métodos de `ReportsService`, después de extraer `userId` del request vía `@UserId()` decorator.

## HTTP layer

### `reports.controller.ts`

```ts
@Controller('api/reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  async getSummary(
    @UserId() userId: UserId,
    @Query() query: ReportQueryDto,
  ): Promise<ReportsSummary> {
    return this.reports.getSummary(userId, query);
  }

  @Get('by-category')
  async getByCategory(
    @UserId() userId: UserId,
    @Query() query: ReportQueryDto,
  ): Promise<readonly CategoryBreakdownReport[]> {
    return this.reports.getByCategory(userId, query);
  }

  @Get('by-period')
  async getByPeriod(
    @UserId() userId: UserId,
    @Query() query: ReportByPeriodQueryDto,
  ): Promise<PeriodComparisonReport> {
    return this.reports.getByPeriod(userId, query);
  }

  @Get('export.csv')
  async exportCsv(
    @UserId() userId: UserId,
    @Query() query: ReportExportQueryDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const { filename, body, contentType } = await this.reports.exportCsv(userId, query);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  }
}
```

`ReportQueryDto` es el DTO derivado de Zod con un wrapper de class-validator (o el `ZodValidationPipe` de NestJS con `z.coerce.date()` para query params).

### Validation pipe

Usa el `ZodValidationPipe` existente (introducido en M5 para transactions). Cada query DTO se anota con `@ZodSchema(reportQuerySchema)` o similar. El cap de rango (>365 días) se enforce dentro de `reportQuerySchema.parse()` con un `.refine()` que tira `ZodError` mapeado a 400.

### Error mapping

- `ZodError` → 400 (manejado por `ZodValidationPipe`).
- Violación del cap de rango → 400 con `{ code: 'RANGE_EXCEEDED', message: 'Range > 365 days', ... }`.
- Auth missing/inválida → 401 (manejado por `JwtAuthGuard`).
- Falla del test de aislamiento cross-user → 500 (esto sería un bug).

## Composición de la página

### Server component: `apps/web/app/[locale]/(app)/reports/page.tsx`

```tsx
import { getTranslations } from 'next-intl/server';
import { ReportsWorkspace } from '@features/reports/client/reports-workspace';

export default async function ReportsPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'ReportsPage' });
  return (
    <main>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      <ReportsWorkspace locale={params.locale} />
    </main>
  );
}
```

### Client component: `<ReportsWorkspace />`

```tsx
'use client';

export function ReportsWorkspace({ locale }: { locale: string }) {
  const [fromDate, setFromDate] = useState('2026-07-01');
  const [toDate, setToDate] = useState('2026-08-01');
  const [bucket, setBucket] = useState<'week' | 'month'>('month');
  const [currencyCode, setCurrencyCode] = useState<string | undefined>(undefined);

  const query = useMemo(() => ({ fromDate, toDate, currencyCode }), [fromDate, toDate, currencyCode]);
  const periodQuery = useMemo(() => ({ ...query, bucket }), [query, bucket]);

  const summary = useReportsSummary(query);
  const breakdown = useReportsByCategory(query);
  const period = useReportsByPeriod(periodQuery);

  if (summary.error || breakdown.error || period.error) {
    return <ReportsErrorState onRetry={...} />;
  }
  if (!summary.data || !breakdown.data || !period.data) {
    return <ReportsLoadingState />;
  }

  // Empty state
  if (summary.data.transactionCount === 0) {
    return <ReportsEmptyState locale={locale} />;
  }

  // Validation error (e.g., range > 365 días)
  if (summary.data.invalidRange) {
    return <ReportsValidationErrorState range={...} />;
  }

  return (
    <div className="grid gap-4">
      {summary.data.fxFreshness === 'stale' && <FxStalenessBanner />}
      <MonthlySummaryCard data={summary.data} />
      <CategoryBreakdownTable data={breakdown.data} />
      <PeriodComparisonPanel data={period.data} />
      <ExportCsvButton query={query} />
    </div>
  );
}
```

## BDD bridge

Mirror del patrón slice-8 auth exactamente:

- `libs/features/reports/docs/reports.feature` — escenarios Gherkin mapeados a S1-S20 del spec.
- `libs/features/reports/docs/step-defs/realm.steps.ts` — binding `@features/reports` vía import con quoted-prefix (el truco de slice-8).
- `libs/features/reports/docs/step-defs/{summary,breakdown,comparison,export,auth}.steps.ts` — steps domain-specific.
- `libs/features/reports/docs/support/world.ts` — tipo `World` compartido que lleva `userId`, `lastResponse`, fixtures.
- `libs/features/reports/docs/support/fixture-loader.ts` — siembra el Postgres de test con 5 transactions para un usuario autenticado.

El `cucumber.json` config (a nivel slice-8) se extiende para agregar `libs/features/reports/docs/**/*.feature` al glob existente de `features`.

## Integración de Recharts

- Agregar `recharts: ^2.x` a `apps/web/package.json` `dependencies`.
- Tree-shake imports: solo `BarChart`, `Bar`, `LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `CartesianGrid`, `ResponsiveContainer`.
- Wrap los componentes de chart en la directiva `'use client'` (Recharts es client-only).
- Sin import global de CSS necesario para el slice.

## Observability

- Reusar el wiring `apps/api/src/modules/metrics/` existente de M5.
- Agregar counter `reports_requests_total{endpoint, status}` e histogram `reports_request_duration_seconds{endpoint}` vía el exporter Prometheus de `@nestjs/terminus` existente.
- Sin nuevos dashboards en este slice; el dashboard M5 ya tiene un panel `reports_*` scaffolded pero vacío.

## Risks (recap, mitigación en §Risks del proposal)

- FX staleness → campo `fxFreshness` + banner UI.
- CSV injection → serializer guard + unit test.
- Performance para rangos grandes → cap de 365 días + counter de observability.
- Recharts SSR/hydration → wrapper `'use client'`.
- Drift DST en period comparison → ventana basada en duración (NO mes-calendario).
- Bundle weight → tree-shake imports; track bundle size en apply.

## Migration plan

Ninguna. Slice read-only.

## Next phase

`sdd-tasks` — romper el diseño en work units revisables, cada task atómica y testeable, con forecast de líneas cambiadas para el Review Workload Guard.

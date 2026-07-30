# Design — module-6-reports (Reports & Analytics)

> **Author**: Sebastián Illa
> **Created**: 2026-07-29
> **Status**: draft
> **Phase**: technical design answering the proposal + spec
> **Source**: `openspec/changes/module-6-reports/{proposal,specs/reports/spec}.md`

## File layout

```
libs/features/reports/
├── package.json                                # workspace package, name @features/reports
├── tsconfig.json                               # extends ../../tsconfig.base.json
├── vitest.config.ts                            # extends slice-8 happy-dom pool
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
│   │   │   │   ├── reports.repository.ts       # port: ReportsRepository (read-only aggregation seam)
│   │   │   │   └── reports.repository.token.ts # TSyringe-style token (or NestJS @Inject)
│   │   │   ├── services/
│   │   │   │   ├── time-bucket.service.ts      # pure: Transaction[] + bucket → Bucket[]
│   │   │   │   ├── reports.service.ts          # orchestrates: repo + FX + time-bucket → ReportsSummary/Category/Period
│   │   │   │   └── csv-serializer.ts           # pure: rows → CSV string with BOM + CRLF + injection guard
│   │   │   └── types.ts                        # Re-export types from shared/schemas
│   │   ├── infrastructure/
│   │   │   └── adapters/
│   │   │       └── prisma-reports.repository.ts # impl using PrismaTransactionRepository + PrismaCategoryRepository
│   │   ├── http/
│   │   │   ├── reports.controller.ts           # NestJS controller, 4 endpoints
│   │   │   ├── reports.module.ts               # NestJS module wiring
│   │   │   └── decorators/
│   │   │       └── user-id.decorator.ts        # @UserId() — pulls userId from request.user
│   │   └── __tests__/
│   │       ├── time-bucket.service.test.ts     # unit
│   │       ├── reports.service.test.ts         # unit (mocked repo + FX)
│   │       ├── csv-serializer.test.ts          # unit (incl. injection guard)
│   │       ├── reports.controller.test.ts      # integration (NestJS Test module)
│   │       └── prisma-reports.repository.integration.test.ts  # integration (real Postgres test DB)
│   ├── client/
│   │   ├── reports-workspace.tsx               # container: holds filter state, mounts 4 cards
│   │   ├── reports-filter-bar.tsx              # date presets + custom range + bucket + apply
│   │   ├── monthly-summary-card.tsx            # uses Recharts BarChart
│   │   ├── category-breakdown-table.tsx        # uses shadcn Table
│   │   ├── period-comparison-panel.tsx         # uses Recharts LineChart + delta header
│   │   ├── export-csv-button.tsx               # two buttons: summary / transactions
│   │   ├── fx-staleness-banner.tsx             # shown when response.fxFreshness === 'stale'
│   │   ├── reports-empty-state.tsx             # empty + CTA to /[locale]/transactions/new
│   │   ├── reports-error-state.tsx             # error with retry button
│   │   ├── reports-loading-state.tsx           # skeleton
│   │   ├── hooks/
│   │   │   ├── use-reports-summary.ts          # SWR-lite (or RQ-lite) client fetch
│   │   │   ├── use-reports-by-category.ts
│   │   │   ├── use-reports-by-period.ts
│   │   │   └── use-reports-csv.ts              # downloads via fetch + Blob
│   │   ├── api/
│   │   │   └── reports-api.ts                  # typed fetchers; the client-side counterpart of the Zod schemas
│   │   └── __tests__/
│   │       ├── monthly-summary-card.test.tsx   # 5-state coverage
│   │       ├── category-breakdown-table.test.tsx
│   │       ├── period-comparison-panel.test.tsx
│   │       ├── export-csv-button.test.tsx
│   │       ├── reports-filter-bar.test.tsx
│   │       └── reports-workspace.test.tsx
│   └── docs/
│       ├── reports.feature                     # BDD scenarios S1-S20 mapped to Given-When-Then
│       ├── step-defs/
│       │   ├── realm.steps.ts                  # @features/reports binding (mirror slice-8 auth pattern)
│       │   ├── summary.steps.ts                # When user requests /api/reports/summary
│       │   ├── breakdown.steps.ts              # When user requests /api/reports/by-category
│       │   ├── comparison.steps.ts             # When user requests /api/reports/by-period
│       │   ├── export.steps.ts                 # When user exports CSV
│       │   └── auth.steps.ts                   # Given an authenticated user
│       └── support/
│           ├── world.ts                        # shared World type
│           └── fixture-loader.ts               # seeds transactions for scenarios
└── apps/api/src/modules/reports/
├── reports.controller.ts                       # thin passthrough to @features/reports/server
├── reports.module.ts                           # imports ReportsModule from server, registers controller
└── __tests__/
└── reports.e2e.test.ts                         # supertest + NestJS

apps/web/app/[locale]/(app)/reports/
└── page.tsx                                    # server component, renders ReportsWorkspace

apps/web/messages/
├── en/reports.json                             # next-intl catalog
└── es/reports.json

openspec/specs/reports/
├── spec.md                                     # canonical capability spec
└── tests/                                      # capability test plan (linked from spec)

Documents-es/openspec/specs/reports/
└── spec.md                                     # Spanish mirror
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

The port is **deliberately narrow** — just enough data for the `ReportsService` to do its work. No filtering, no aggregation; that's the service's job. This keeps the impl swappable (Prisma adapter for prod, in-memory for tests).

### Domain service: `TimeBucketService`

Pure function. No I/O. No Prisma. No clock dependency (takes `now: Date` as a parameter for testability).

```ts
export type Bucket = 'week' | 'month';

export interface BucketSeriesPoint {
  readonly label: string;             // '2026-W27' or '2026-07'
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

- `bucket=week` uses ISO-8601 week numbering (Mon-Sun).
- `bucket=month` uses calendar months in the user's locale timezone (the server assumes UTC for simplicity; the client renders the user's locale on top).
- Inverted ranges: returns `[]`.
- Empty range: returns `[]`.

### Domain service: `ReportsService`

Composes `ReportsRepository` + `TotalsService` (from `@features/transactions`) + `FxRateProvider` + `TimeBucketService`.

```ts
export const reportsService = {
  async getSummary(userId: UserId, range: ReportQuery, currencyCode?: CurrencyCode): Promise<ReportsSummary>,
  async getByCategory(userId: UserId, range: ReportQuery, currencyCode?: CurrencyCode): Promise<readonly CategoryBreakdownReport[]>,
  async getByPeriod(userId: UserId, range: ReportQuery, bucket: Bucket, currencyCode?: CurrencyCode): Promise<PeriodComparisonReport>,
  async exportCsv(userId: UserId, range: ReportQuery, detail: 'summary' | 'transactions', currencyCode?: CurrencyCode): Promise<{ filename: string; body: string; contentType: 'text/csv' }>,
};
```

Internals:

1. `getSummary` calls `repo.findForUserInRange(userId, range)`, runs each through `fxRateProvider.convertTo(amount, currencyCode)` (parallel with bounded concurrency), aggregates via `TotalsService.forUser`, returns `ReportsSummary` with `fxFreshness` set to `'stale'` if any rate older than 24h.
2. `getByCategory` similar, calls `TotalsService.perCategory`, computes `share` as `categoryTotal.abs() / totalExpense.abs()`.
3. `getByPeriod`:
   - Compute comparison window: `comparisonFrom = fromDate - duration`, `comparisonTo = fromDate`, where `duration = toDate - fromDate` in days. Explicitly NOT calendar-month to avoid DST drift.
   - Fetch both ranges from `repo`.
   - Bucketize both via `timeBucketService.bucketize`.
   - Compute delta between current and previous totals.
   - Returns `PeriodComparisonReport`.
4. `exportCsv` delegates to `csvSerializer.serialize(rows, columns)` with appropriate columns per `detail` mode.

### Domain: `csvSerializer`

Pure function. No I/O. Testable with `expect(csv).toBe(...)`.

```ts
export const csvSerializer = {
  serialize(rows: readonly Record<string, string | number>[], columns: readonly string[]): string,
};
```

Implementation notes:

- Prefix UTF-8 BOM (`\uFEFF`).
- CRLF line endings (`\r\n`).
- CSV injection guard: any cell string starting with `=`, `+`, `-`, `@` gets a single-quote prefix. Numeric cells pass through.
- Cells containing `,`, `"`, `\r`, `\n` are wrapped in `"..."` with embedded `"` doubled.

### NestJS module: `ReportsModule`

`apps/api/src/modules/reports/reports.module.ts`

```ts
@Module({
  imports: [
    TransactionsModule,        // for TotalsService, FxRateProvider, CategoryRepository, CurrencyRepository
    AuthModule,                 // for JwtAuthGuard, user resolution
    PrismaModule,               // for PrismaService
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

The controller at `apps/api/src/modules/reports/reports.controller.ts` is a thin pass-through to `ReportsService` methods, after extracting `userId` from the request via `@UserId()` decorator.

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

`ReportQueryDto` is the Zod-derived DTO with class-validator-class wrapper (or NestJS's ZodValidationPipe with `z.coerce.date()` for query params).

### Validation pipe

Uses the existing `ZodValidationPipe` (introduced in M5 for transactions). Each query DTO is annotated with `@ZodSchema(reportQuerySchema)` or similar. Range cap (>365 days) is enforced inside `reportQuerySchema.parse()` with a `.refine()` that throws `ZodError` mapped to 400.

### Error mapping

- `ZodError` → 400 (handled by `ZodValidationPipe`).
- Range cap violation → 400 with `{ code: 'RANGE_EXCEEDED', message: 'Range > 365 days', ... }`.
- Missing/invalid auth → 401 (handled by `JwtAuthGuard`).
- Cross-user isolation test failure → 500 (this would be a bug).

## Page composition

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

  // Validation error (e.g., range > 365 days)
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

Mirror the slice-8 auth pattern exactly:

- `libs/features/reports/docs/reports.feature` — Gherkin scenarios mapping to S1-S20 from the spec.
- `libs/features/reports/docs/step-defs/realm.steps.ts` — `@features/reports` binding via quoted-prefix import (the slice-8 trick).
- `libs/features/reports/docs/step-defs/{summary,breakdown,comparison,export,auth}.steps.ts` — domain-specific steps.
- `libs/features/reports/docs/support/world.ts` — shared `World` type carrying `userId`, `lastResponse`, fixtures.
- `libs/features/reports/docs/support/fixture-loader.ts` — seeds the test Postgres with 5 transactions for an authenticated user.

The `cucumber.json` config (slice-8 level) is extended to add `libs/features/reports/docs/**/*.feature` to the existing `features` glob.

## Recharts integration

- Add `recharts: ^2.x` to `apps/web/package.json` `dependencies`.
- Tree-shake imports: only `BarChart`, `Bar`, `LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `CartesianGrid`, `ResponsiveContainer`.
- Wrap chart components in `'use client'` directive (Recharts is client-only).
- No global CSS import needed for the slice.

## Observability

- Reuse the existing `apps/api/src/modules/metrics/` wiring from M5.
- Add counter `reports_requests_total{endpoint, status}` and histogram `reports_request_duration_seconds{endpoint}` via the existing `@nestjs/terminus` Prometheus exporter.
- No new dashboards in this slice; the M5 dashboard already has a `reports_*` panel scaffolded but empty.

## Risks (recap, mitigation in §Risks of proposal)

- FX staleness → `fxFreshness` field + UI banner.
- CSV injection → serializer guard + unit test.
- Performance for large ranges → 365-day cap + observability counter.
- Recharts SSR/hydration → `'use client'` wrapper.
- DST drift in period comparison → duration-based window (NOT calendar-month).
- Bundle weight → tree-shake imports; track bundle size in apply.

## Migration plan

None. Read-only slice.

## Next phase

`sdd-tasks` — break the design into reviewable work units, with each task atomic and testable, and forecast changed lines for the Review Workload Guard.

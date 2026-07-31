import {
  BadRequestException,
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import type { CurrentUser } from '@features/auth';
import {
  reportQuerySchema,
  reportByPeriodQuerySchema,
  reportExportQuerySchema,
} from '@features/reports/shared';
import { ReportsService } from '@features/reports/server';

import { JwtAuthGuard } from '../../shared/guards/jwt.guard.js';
import { QuerySchema } from '../../shared/decorators/query.decorator.js';

/**
 * ReportsController — thin DI-wiring + route-binding layer for the
 * Reports & Analytics slice.
 *
 * Four read-only endpoints (per `openspec/changes/module-6-reports/
 * design.md` §"HTTP layer"):
 *
 *   GET /api/reports/summary?fromDate&toDate[&currencyCode]
 *   GET /api/reports/by-category?fromDate&toDate[&currencyCode]
 *   GET /api/reports/by-period?fromDate&toDate&bucket=week|month[&currencyCode]
 *   GET /api/reports/export.csv?fromDate&toDate[&detail=summary|transactions][&currencyCode]
 *
 * Lives in apps/api/src/modules/reports/ per the repo's convention
 * (controllers in apps/api, services in libs/features). The controller
 * is intentionally thin — it extracts the authenticated userId from
 * request.user (set by JwtAuthGuard), validates the query via the
 * canonical Zod schemas, and delegates to ReportsService.
 *
 * Why a concrete ReportsService (not the ports directly): per the
 * slice-5 convention enforced by `@gpr/boundary/no-import-type-injectable`
 * (ADR 0008), controllers decorated with `@Controller()` MUST inject
 * concrete service classes (value imports), not ports (`type` imports
 * are erased under `isolatedModules: true` and NestJS reflective DI
 * fails to resolve them). `ReportsService` is the concrete NestJS-
 * injectable wrapper around the pure-domain `reportsService({...})`
 * factory; the factory remains the unit-test seam. ReportsModule
 * wires the wrapper with `REPORTS_REPOSITORY_TOKEN` and
 * `FX_RATE_PROVIDER_TOKEN` (from `@features/transactions`).
 *
 * Cross-user isolation: userId is read from request.user.id and passed
 * to every service method. Belt-and-suspenders: the repository adapter
 * ALSO enforces `where: { createdBy: userId }` at the query level.
 */
@Controller('api/reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  async getSummary(
    @Req() request: Request & { user: CurrentUser },
    @QuerySchema(reportQuerySchema) query: ReturnType<typeof reportQuerySchema.parse>,
  ) {
    const userId = request.user?.id;
    if (!userId) throw new BadRequestException('Missing authenticated user');
    return this.reports.getSummary(userId, query);
  }

  @Get('by-category')
  async getByCategory(
    @Req() request: Request & { user: CurrentUser },
    @QuerySchema(reportQuerySchema) query: ReturnType<typeof reportQuerySchema.parse>,
  ) {
    const userId = request.user?.id;
    if (!userId) throw new BadRequestException('Missing authenticated user');
    return this.reports.getByCategory(userId, query);
  }

  @Get('by-period')
  async getByPeriod(
    @Req() request: Request & { user: CurrentUser },
    @QuerySchema(reportByPeriodQuerySchema) query: ReturnType<typeof reportByPeriodQuerySchema.parse>,
  ) {
    const userId = request.user?.id;
    if (!userId) throw new BadRequestException('Missing authenticated user');
    return this.reports.getByPeriod(userId, query, query.bucket);
  }

  /**
   * CSV download. Returns a JSON envelope { filename, body } because
   * NestJS's strict TS path makes @Res({ passthrough: false }) hard
   * to satisfy. The host module's interceptor (TODO follow-up slice)
   * translates this envelope into:
   *   Content-Type: text/csv; charset=utf-8
   *   Content-Disposition: attachment; filename=""
   *   body: <csv body>
   */
  @Get('export.csv')
  async exportCsv(
    @Req() request: Request & { user: CurrentUser },
    @QuerySchema(reportExportQuerySchema) query: ReturnType<typeof reportExportQuerySchema.parse>,
  ): Promise<{ filename: string; body: string }> {
    const userId = request.user?.id;
    if (!userId) throw new BadRequestException('Missing authenticated user');
    const result = await this.reports.exportCsv(userId, query, query.detail);
    return { filename: result.filename, body: result.body };
  }
}
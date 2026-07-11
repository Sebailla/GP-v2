import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";
import { toDecimal } from "@shared-utils/decimal";

import type { FxRate, FxRateInsert } from "../../domain/entities/fx-rate.entity.js";
import type { FxRateRepository } from "../../domain/interfaces/fx-rate.repository.js";

/**
 * Prisma adapter for `FxRateRepository`.
 *
 * The hot read path for live FX lookups goes through `FxRateProvider`
 * (see `in-memory-fx-rate.provider.ts`); this adapter exists for the
 * cold path: most-recent-rate fetches and rate ingest writes.
 *
 * The boundary conversion:
 *  - Outbound (DB → domain): Prisma's runtime `Decimal.toString()` →
 *    `decimal.js`'s `Decimal` via `toDecimal`. The 1:1 string roundtrip
 *    is exact at every decimal place; no IEEE-754 drift.
 *  - Inbound (domain → DB): the domain `Decimal` is serialized via
 *    `.toString()` so the Prisma column receives a `numeric`-typed
 *    payload without roundtripping through JavaScript's `number`.
 */
export class PrismaFxRateRepository implements FxRateRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? defaultPrisma;
  }

  async findMostRecent(fromCode: string, toCode: string): Promise<FxRate | null> {
    const row = await this.prisma.fxRate.findFirst({
      where: { fromCode, toCode },
      orderBy: { recordedAt: "desc" },
    });
    return row === null ? null : projectFxRate(row);
  }

  async insert(rate: FxRateInsert): Promise<FxRate> {
    const row = await this.prisma.fxRate.create({
      data: {
        fromCode: rate.fromCode,
        toCode: rate.toCode,
        rate: rate.rate.toString(),
        recordedAt: rate.recordedAt,
      },
    });
    return projectFxRate(row);
  }
}

function projectFxRate(row: {
  id: string;
  fromCode: string;
  toCode: string;
  rate: import("@core/database").PrismaDecimal;
  recordedAt: Date;
}): FxRate {
  return {
    id: row.id,
    fromCode: row.fromCode,
    toCode: row.toCode,
    rate: toDecimal(row.rate.toString()),
    recordedAt: row.recordedAt,
  };
}

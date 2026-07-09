import { prisma as defaultPrisma } from "@core/database";
import type { PrismaClient } from "@core/database";

import type { Currency } from "../../domain/entities/currency.entity.js";
import type { CurrencyRepository } from "../../domain/interfaces/currency.repository.js";

/**
 * Prisma adapter for `CurrencyRepository`.
 *
 * Currencies are reference data seeded at startup (USD/ARS/EUR); there is
 * no create / update / delete on this port. The adapter is constructed
 * lazily with an injected `PrismaClient` (or the `@core/database`
 * singleton by default) so the test suite can substitute a
 * `vi.mock("@core/database")`-style fake.
 */
export class PrismaCurrencyRepository implements CurrencyRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? defaultPrisma;
  }

  async findByCode(code: string): Promise<Currency | null> {
    const row = await this.prisma.currency.findUnique({ where: { code } });
    return row === null ? null : projectCurrency(row);
  }

  async list(): Promise<Currency[]> {
    const rows = await this.prisma.currency.findMany({
      orderBy: { code: "asc" },
    });
    return rows.map(projectCurrency);
  }
}

/** Minimal projection: every column on `Currency` maps straight across. */
function projectCurrency(row: {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  createdAt: Date;
}): Currency {
  return {
    code: row.code,
    name: row.name,
    symbol: row.symbol,
    decimals: row.decimals,
    createdAt: row.createdAt,
  };
}

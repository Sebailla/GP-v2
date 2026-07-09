import {
	prisma as defaultPrisma,
	TransactionIsolationLevel,
} from "@core/database";
import type { PrismaClient } from "@core/database";

import type {
	UnitOfWork,
	UnitOfWorkContext,
} from "../../domain/interfaces/unit-of-work.js";

/**
 * Prisma-backed implementation of `UnitOfWork`.
 *
 * Runs the callback inside a SERIALIZABLE `$transaction` so the
 * participating repositories see the same transactional client
 * throughout. SERIALIZABLE is the strictest isolation level in
 * Postgres; it eliminates the read-then-update TOCTOU window that
 * a REPEATABLE-READ or READ-COMMITTED level would expose.
 *
 * On `fn` resolve, the transaction commits. On `fn` throw, the
 * transaction rolls back. The unit of work never exposes the
 * transactional client to the domain layer — the adapter binds
 * the `tx` field of the `UnitOfWorkContext` to a Prisma
 * `TransactionClient` and the repositories forward it through
 * their optional `tx` parameter.
 */
export class PrismaUnitOfWork implements UnitOfWork {
	private readonly prisma: PrismaClient;

	constructor(prisma?: PrismaClient) {
		this.prisma = prisma ?? defaultPrisma;
	}

	async run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
		return await this.prisma.$transaction(
			async (tx) => {
				return await fn({ tx });
			},
			{
				isolationLevel: TransactionIsolationLevel.Serializable,
				maxWait: 5_000,
				timeout: 10_000,
			},
		);
	}
}

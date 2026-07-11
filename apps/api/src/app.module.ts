import { Module } from "@nestjs/common";

import { AuthModule } from "./modules/auth/auth.module.js";
import { TransactionsModule } from "./modules/transactions/transactions.module.js";

/**
 * Slice 1 ships an empty AppModule. Feature modules (auth in slice 3,
 * transactions in slice 5) are imported here as they land.
 *
 * This module intentionally contains zero business code - it is the
 * NestJS container's composition root. Slice 3 batch 6 (T3.6) wires
 * the AuthModule (thin NestJS wrapper around @features/auth/server).
 * Slice 5 PR #3 (T5.11) wires the TransactionsModule (REST surface
 * for /transactions + /categories; see design §5.3).
 */
@Module({
  imports: [AuthModule, TransactionsModule],
})
export class AppModule {}

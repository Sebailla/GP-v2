import { TRANSACTIONS_THRESHOLD_EXCEEDED } from "@core/events";
import type { Decimal } from "@shared-utils/decimal";

import type { Transaction } from "../entities/transaction.entity.js";
import { DEFAULT_THRESHOLD_AMOUNT } from "../../constants.js";
import type { TransactionsEventDispatcher } from "../../events.js";

/**
 * Threshold configuration. The slice default is
 * `DEFAULT_THRESHOLD_AMOUNT` (1000.00) — production deployments
 * override per `Category.threshold` once that field lands (slice
 * 6+). Today the threshold is global; the service accepts the
 * threshold as a constructor argument so the controller (or
 * caller) can wire it from configuration.
 */
export interface ThresholdConfig {
  /** Absolute amount (in the transaction's currency) above which the service dispatches the event. */
  readonly amount: Decimal;
}

/**
 * Domain service for `transactions.threshold.exceeded`.
 *
 * The service evaluates a single transaction against a configured
 * threshold and dispatches the event when the absolute amount
 * exceeds the threshold. The dispatch is informational — the
 * service does NOT block the write (the controller runs the
 * service AFTER `TransactionService.create` succeeds; the
 * `transactions.threshold.exceeded` event is for downstream
 * subscribers: notification, audit, slice-6+ dashboard).
 *
 * The `evaluate` method returns `true` if the threshold was
 * crossed (so the caller can log/audit; the service itself only
 * dispatches the event).
 */
export class ThresholdService {
  constructor(
    private readonly config: ThresholdConfig,
    private readonly events: TransactionsEventDispatcher,
  ) {}

  /**
   * Evaluate a single transaction. Dispatches
   * `transactions.threshold.exceeded` if `transaction.amount >=
   * config.amount`. Returns `true` when the threshold is crossed,
   * `false` otherwise.
   */
  async evaluate(transaction: Transaction): Promise<boolean> {
    if (transaction.amount.lt(this.config.amount)) {
      return false;
    }
    await this.events({
      name: TRANSACTIONS_THRESHOLD_EXCEEDED,
      payload: {
        userId: transaction.createdBy,
        categoryId: transaction.categoryId,
        threshold: this.config.amount.toString(),
        total: transaction.amount.toString(),
        observedAt: new Date(),
      },
      occurredAt: new Date(),
    });
    return true;
  }
}

/**
 * Re-exported for the controller wiring. Lets the controller do:
 *
 *   new ThresholdService({ amount: DEFAULT_THRESHOLD_AMOUNT }, events);
 *
 * without a second import. The runtime value is a `string` (the
 * `Decimal` constant stores its string repr), and `ThresholdConfig.amount`
 * accepts the `Decimal` type — callers that need a real `Decimal`
 * instance can call `toDecimal(DEFAULT_THRESHOLD_AMOUNT)`.
 */
export { DEFAULT_THRESHOLD_AMOUNT };

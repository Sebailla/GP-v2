/**
 * Domain port for a Unit of Work boundary.
 *
 * The transactions server's create / update / softDelete orchestration
 * is not yet atomic across the three writes (`txRepo.create`, `auditLogRepo.append`,
 * `idempotencyRepo.create`). A failure between the row-persist and the cache-write
 * leaves the DB with a row but no idempotency cache; a retry with the same
 * `Idempotency-Key` then misses the cache and re-runs the create path → duplicate
 * transaction (R3-002 BLOCKER).
 *
 * The fix: wrap the three writes in a single transactional boundary. The port
 * is a thin abstraction over the underlying transactional client (`prisma.$transaction`
 * for the Prisma adapter, but ports downstream could swap to a `BEGIN/COMMIT`
 * SQL boundary without domain code changes).
 *
 * **Why a port, not a direct Prisma transaction call?** The transactional
 * client type leaks the storage adapter into the domain layer (the `tx`
 * handle is a `Prisma.TransactionClient`-shaped interface). Hiding the
 * transactional boundary behind a port lets the domain run an atomic
 * orchestrator without coupling to the SQL flavor.
 */
export interface UnitOfWork {
  /**
   * Execute `fn` inside a single transactional boundary. The function
   * receives a `UnitOfWorkContext` that the adapter binds to the
   * transactional client. Commits on resolve; rolls back on throw.
   *
   * The function MUST NOT commit or roll back the boundary itself —
   * the unit of work owns the lifecycle. Compositional units of work
   * (nested boundaries) are explicitly out of scope.
   */
  run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T>;
}

/**
 * Context passed to the unit-of-work callback. The `tx` is the
 * transactional client (Prisma `TransactionClient` in the default
 * adapter). The shape is intentionally narrow — the repositories
 * that participate in the unit of work accept it via their
 * optional `tx` parameter and forward it to the underlying call.
 */
export interface UnitOfWorkContext {
  /**
   * Opaque transactional client. The adapter binds this to its
   * underlying storage handle (Prisma `TransactionClient` today;
   * a future SQL `BEGIN/COMMIT` boundary would expose a different
   * shape here).
   */
  readonly tx: unknown;
}

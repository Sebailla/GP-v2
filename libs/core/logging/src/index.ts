export { createLogger } from "./logger.js";
export type { LoggerEnv } from "./logger.js";
export { redactedPaths } from "./redaction.js";

/**
 * Minimal subset of the pino `Logger` interface consumed by domain
 * adapters. Re-exported here so consumers don't need a direct
 * dependency on `pino` (which is a transitive of @core/logging).
 */
export interface Logger {
  readonly level: string;
  readonly child: (bindings: Record<string, unknown>) => Logger;
  fatal: (objOrMsg: unknown, msg?: string, ...args: unknown[]) => void;
  error: (objOrMsg: unknown, msg?: string, ...args: unknown[]) => void;
  warn: (objOrMsg: unknown, msg?: string, ...args: unknown[]) => void;
  info: (objOrMsg: unknown, msg?: string, ...args: unknown[]) => void;
  debug: (objOrMsg: unknown, msg?: string, ...args: unknown[]) => void;
  trace: (objOrMsg: unknown, msg?: string, ...args: unknown[]) => void;
}
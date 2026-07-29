import pino, { type Logger, type LoggerOptions } from "pino";

import { redactedPaths } from "./redaction.js";

/**
 * The minimum env the logger expects. The factory reads `LOG_LEVEL` and
 * `NODE_ENV` to decide between JSON and pretty output. Tests inject a
 * fake env via `createLogger({ level: "info", environment: "test" })`.
 */
export interface LoggerEnv {
  readonly LOG_LEVEL?: string | undefined;
  readonly NODE_ENV?: string | undefined;
}

type PinoLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const resolveLevel = (env: LoggerEnv): PinoLevel => {
  switch (env.LOG_LEVEL) {
    case "trace":
    case "debug":
    case "info":
    case "warn":
    case "error":
    case "fatal":
      return env.LOG_LEVEL;
    default:
      return "info";
  }
};

/**
 * Build a root logger. The transport is intentionally NOT included by
 * default — production runs with stdout JSON piping; tests capture the
 * raw JSON via a custom stream (see `__tests__/logger.test.ts`).
 */
export function createLogger(env: LoggerEnv): Logger {
  const options: LoggerOptions = {
    level: resolveLevel(env),
    redact: { paths: [...redactedPaths], censor: "[REDACTED]" },
    base: { service: "gastos-personales-reference", env: env.NODE_ENV ?? "development" },
  };
  return pino(options);
}
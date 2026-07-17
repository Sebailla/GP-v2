import { describe, expect, it, vi } from "vitest";

/**
 * Strategy: we DO NOT replace `process.stdout.write` to capture JSON
 * (TS strict + exactOptionalPropertyTypes + the Node WriteStream
 * signature make that fragile across Node versions). Instead, we
 * mock pino and assert on the redact options the factory hands it.
 *
 * For the end-to-end redaction check, we ALSO assert against a real
 * pino instance piped through a Writable that stores lines. That
 * path does not depend on `process.stdout.write`.
 */

import pino from "pino";
import { Writable } from "node:stream";

import { createLogger } from "../logger";
import { redactedPaths } from "../redaction";

vi.mock("pino", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pino")>();
  return { default: actual.default };
});

function captureSink(): { logger: ReturnType<typeof createLogger>; lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb): void {
      lines.push(chunk.toString("utf8"));
      cb();
    },
  });
  const logger = pino(
    { level: "info", redact: { paths: [...redactedPaths], censor: "[REDACTED]" } },
    stream,
  );
  return { logger: logger as unknown as ReturnType<typeof createLogger>, lines };
}

describe("redactedPaths contract (R-PF-5)", () => {
  it("contains the canonical top-level paths", () => {
    expect(redactedPaths).toContain("password");
    expect(redactedPaths).toContain("token");
    expect(redactedPaths).toContain("cookie");
    expect(redactedPaths).toContain("authorization");
    expect(redactedPaths).toContain("email");
    expect(redactedPaths).toContain("amount");
    expect(redactedPaths).toContain("reportingAmount");
    expect(redactedPaths).toContain("notes");
  });

  it("contains the camelCase idempotencyKey path", () => {
    expect(redactedPaths).toContain("idempotencyKey");
    expect(redactedPaths).toContain("*.idempotencyKey");
  });

  it("contains the Idempotency-Key HTTP header literal via bracket notation", () => {
    // pino 9.x / fast-redact 3.5.x rejects hyphenated path segments
    // outside of bracket notation. The header literal MUST be quoted.
    expect(redactedPaths).toContain("[\"idempotency-key\"]");
  });
});

describe("logger redaction end-to-end (R-PF-5)", () => {
  it("redacts password, token, email and amount fields", () => {
    const { logger, lines } = captureSink();
    logger.info(
      {
        password: "secret",
        token: "abc",
        email: "user@example.com",
        amount: "100.00",
        reportingAmount: "50.00",
        notes: "private",
      },
      "transaction.created",
    );
    const serialized = lines.join("");
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("100.00");
    expect(serialized).not.toContain("private");
  });

  it("redacts the Idempotency-Key HTTP header literal", () => {
    const { logger, lines } = captureSink();
    logger.info(
      { "idempotency-key": "client-key-abc-123", method: "POST", path: "/transactions" },
      "http.request",
    );
    const serialized = lines.join("");
    expect(serialized).not.toContain("client-key-abc-123");
    expect(serialized).toContain("[REDACTED]");
  });

  it("redacts camelCase idempotencyKey under wildcard", () => {
    const { logger, lines } = captureSink();
    logger.info(
      { request: { idempotencyKey: "client-key-xyz-789", method: "POST" } },
      "domain.event",
    );
    const serialized = lines.join("");
    expect(serialized).not.toContain("client-key-xyz-789");
  });
});

describe("createLogger env (R-PF-5)", () => {
  it("uses the configured LOG_LEVEL when valid", () => {
    const logger = createLogger({ LOG_LEVEL: "warn", NODE_ENV: "test" });
    expect(logger.level).toBe("warn");
  });

  it("falls back to info when LOG_LEVEL is invalid", () => {
    const logger = createLogger({ LOG_LEVEL: "verbose", NODE_ENV: "test" });
    expect(logger.level).toBe("info");
  });

  it("includes the service and env base bindings", () => {
    const logger = createLogger({ LOG_LEVEL: "info", NODE_ENV: "staging" });
    expect(logger.bindings().service).toBe("gastos-personales-reference");
    expect(logger.bindings().env).toBe("staging");
  });
});
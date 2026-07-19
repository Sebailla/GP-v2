import "reflect-metadata";

import { beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { Env } from "@core/config";

import { ConsoleMailAdapter } from "../console-mail.adapter";
import { GmailMailAdapter } from "../gmail-mail.adapter";
import { MAIL_ADAPTER, MailModule, selectMailAdapter } from "../mail.module";

/**
 * D3 (Mail binding) — RED \u2192 GREEN contract.
 *
 * The binding rules live in `selectMailAdapter(env)` — a pure
 * function that takes an Env snapshot and returns the bound
 * MailAdapter. The Nest factory in MailModule delegates to it.
 *
 * Tests use `selectMailAdapter` with synthetic Env records to
 * drive each spec scenario without mutating the @core/config
 * singleton (which is frozen at first parse).
 *
 * A second `describe` boots an actual MailModule under Test
 * and asserts the useFactory resolves the same adapters as
 * the pure function under the runtime env.
 */

const baseEnv: Env = {
  DATABASE_URL: "postgresql://placeholder@localhost:5432/db",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_SECRET: "test-secret-at-least-32-characters-long-for-hkdf",
  JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
  COOKIE_SECRET: "test-cookie-secret-at-least-32-characters-long",
  PUBLIC_WEB_URL: "http://localhost:3000",
  PUBLIC_API_URL: "http://localhost:3001",
  API_URL: "http://localhost:3001",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  WEB_ORIGIN: "http://localhost:3000",
  // Production-only fields stubbed for shape parity.
  BACKUP_DSN: "s3://placeholder",
  METRICS_TOKEN: "metrics-token-at-least-16",
  STATUS_DETAIL_TOKEN: "status-detail-token-at-least-16",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token-at-least-16-chars",
  LOG_LEVEL: "info",
  PORT: 3001,
  // M3 (module-3-superadmin) — admin surface kill-switch. Default `true`
  // keeps the existing dev / test behavior; the controller reads this
  // and 404s every admin route when it flips to `false`.
  ADMIN_ENABLED: true,
  NODE_ENV: "development",
};

describe("selectMailAdapter \u2014 D3 precedence (pure function)", () => {
  it("production + no MAIL_DSN + Gmail env present \u2192 GmailMailAdapter", () => {
    const result = selectMailAdapter({
      ...baseEnv,
      NODE_ENV: "production",
      MAIL_DSN: undefined,
      GMAIL_USER: "alerts@example.com",
      GMAIL_APP_PASSWORD: "abcdefghijklmnop",
    });
    expect(result).toBeInstanceOf(GmailMailAdapter);
  });

  it("production + MAIL_DSN set \u2192 ConsoleMailAdapter (D3 kill-switch wins)", () => {
    const result = selectMailAdapter({
      ...baseEnv,
      NODE_ENV: "production",
      MAIL_DSN: "smtp://user:pass@smtp.gmail.com:587",
      GMAIL_USER: undefined,
      GMAIL_APP_PASSWORD: undefined,
    });
    expect(result).toBeInstanceOf(ConsoleMailAdapter);
  });

  it("development or test + no MAIL_DSN \u2192 ConsoleMailAdapter", () => {
    const result = selectMailAdapter({
      ...baseEnv,
      NODE_ENV: "test",
      MAIL_DSN: undefined,
      GMAIL_USER: undefined,
      GMAIL_APP_PASSWORD: undefined,
    });
    expect(result).toBeInstanceOf(ConsoleMailAdapter);
  });

  it("development with Gmail env present \u2192 ConsoleMailAdapter (NODE_ENV gate)", () => {
    // Even if a developer accidentally sets GMAIL_USER + password
    // locally, the binding stays Console. Gmail transport only
    // activates in production (D7 + D3 combined gate).
    const result = selectMailAdapter({
      ...baseEnv,
      NODE_ENV: "development",
      MAIL_DSN: undefined,
      GMAIL_USER: "alerts@example.com",
      GMAIL_APP_PASSWORD: "abcdefghijklmnop",
    });
    expect(result).toBeInstanceOf(ConsoleMailAdapter);
  });

  it("production + no MAIL_DSN + Gmail env missing \u2192 ConsoleMailAdapter (D7 fail-safe)", () => {
    // Schema fails-fast at boot, but defense in depth: if a runtime
    // somehow bypasses the schema check, the binding still falls
    // back to Console rather than wiring a Gmail adapter with
    // empty credentials.
    const result = selectMailAdapter({
      ...baseEnv,
      NODE_ENV: "production",
      MAIL_DSN: undefined,
      GMAIL_USER: undefined,
      GMAIL_APP_PASSWORD: undefined,
    });
    expect(result).toBeInstanceOf(ConsoleMailAdapter);
  });

  it("production + MAIL_DSN set wins over Gmail env (D3 takes priority)", () => {
    // Even with both MAIL_DSN and Gmail env set, the MAIL_DSN
    // kill-switch path is the binding. This protects an operator
    // who flips MAIL_DSN for an emergency rollback without having
    // to also clear the Gmail vars.
    const result = selectMailAdapter({
      ...baseEnv,
      NODE_ENV: "production",
      MAIL_DSN: "smtp://user:pass@smtp.gmail.com:587",
      GMAIL_USER: "alerts@example.com",
      GMAIL_APP_PASSWORD: "abcdefghijklmnop",
    });
    expect(result).toBeInstanceOf(ConsoleMailAdapter);
  });
});

describe("MailModule \u2014 Nest factory wires selectMailAdapter", () => {
  beforeEach(async () => {
    // Each test gets a fresh MailModule instance (Nest testing
    // module compiles per-test). The `env` singleton is loaded
    // once with apps/api/test/setup-env.ts (NODE_ENV=test, etc.).
    // The pure selectMailAdapter tests above already cover the
    // rule matrix; here we assert only the wiring.
  });

  it("MailModule.useFactory binds ConsoleMailAdapter under the test env", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MailModule],
    }).compile();

    const adapter = moduleRef.get(MAIL_ADAPTER);
    // The setup-env seeds NODE_ENV=test without MAIL_DSN or Gmail
    // env \u2192 D3 selects ConsoleMailAdapter.
    expect(adapter).toBeInstanceOf(ConsoleMailAdapter);
    expect(adapter).not.toBeInstanceOf(GmailMailAdapter);
  });
});

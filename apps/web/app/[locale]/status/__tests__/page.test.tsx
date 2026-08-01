import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@core/config/web", () => ({
  env: {
    API_URL: "http://api.test",
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test@localhost/db",
    NEXTAUTH_URL: "http://localhost:3000",
    NEXTAUTH_SECRET: "x".repeat(32),
    JWT_SECRET: "x".repeat(32),
    COOKIE_SECRET: "x".repeat(32),
    PUBLIC_WEB_URL: "http://localhost:3000",
    PUBLIC_API_URL: "http://api.test",
    WEB_ORIGIN: "http://localhost:3000",
    PORT: 3001,
  },
}));

vi.mock("@/lib/status-client", () => ({
  fetchStatus: vi.fn().mockResolvedValue({
    environment: "staging",
    version: "1.1.1",
    commit: "abc1234",
    uptimeSeconds: 123,
    publicUrl: { web: "https://web.example", api: "https://api.example" },
    lastBackupAt: "2026-07-15T03:00:00.000Z",
    lastBackupStatus: "ok",
    rateLimitStore: "upstash",
    mailAdapter: "smtp-gmail",
  }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => (key: string) => `${namespace}.${key}`),
  setRequestLocale: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
  setRequestLocale: vi.fn(),
}));

import { render, screen, cleanup } from "@testing-library/react";

import StatusPage from "../page";

describe("StatusPage (R-PF-10)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the environment label", async () => {
    const jsx = await StatusPage({ params: Promise.resolve({ locale: "en" }) });
    render(jsx);
    expect(screen.getByTestId("status-environment")).toHaveTextContent("staging");
  });

  it("renders the API commit SHA", async () => {
    const jsx = await StatusPage({ params: Promise.resolve({ locale: "en" }) });
    render(jsx);
    expect(screen.getByTestId("status-commit")).toHaveTextContent("abc1234");
  });

  it("renders the last backup timestamp", async () => {
    const jsx = await StatusPage({ params: Promise.resolve({ locale: "en" }) });
    render(jsx);
    expect(screen.getByTestId("status-last-backup")).toHaveTextContent("2026-07-15");
  });
});

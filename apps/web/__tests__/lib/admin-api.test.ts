import { afterEach, describe, expect, it, vi } from "vitest";

import {
  changeAdminUserRole,
  listAdminSessions,
  listAdminUsers,
  revokeAdminSession,
  revokeAllAdminSessions,
} from "../../lib/admin-api";

const TOKEN = "signed-admin-token";
const USER_ID = "12345678-1234-1234-8234-123456789012";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin API authorization", () => {
  it("sends Authorization: Bearer header on every wrapper call", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: `authjs.session-token=${encodeURIComponent(TOKEN)}`,
    });
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(
        new Response(url.includes("/users/") && url.endsWith("/role") ? JSON.stringify({}) : JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await listAdminUsers();
    await changeAdminUserRole(USER_ID, { role: "ADMIN" });
    await listAdminSessions({ userId: USER_ID });
    await revokeAdminSession("session-1");
    await revokeAllAdminSessions(USER_ID);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [, init] of fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit]>) {
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    }
  });
});

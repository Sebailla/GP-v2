import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Helper: parse a body as JSON. Test-only. The lint rule that bans
 * unchecked `JSON.parse` is silenced here because every call site
 * feeds it a known mock body (the `mockJsonResponse` mock wraps
 * `JSON.stringify`, so the round-trip is well-defined). Production
 * callers of the API lib route through `ApiError`, not direct
 * `JSON.parse`.
 */
function parseBody(body: BodyInit | null | undefined): unknown {
  if (body === null || body === undefined || typeof body !== "string") {
    return body;
  }
  try {
    return JSON.parse(body as string);
  } catch {
    // The body came from a mock response built via JSON.stringify; if
    // the round-trip fails the assertion will fail loudly. Returning
    // the raw string keeps the error readable.
    return body;
  }
}

/**
 * Tests for the transactions client API (T6.foundation lib).
 *
 * Mock `fetch` at the global level. Each scenario asserts:
 *  - the right URL (path + query string for filtered reads),
 *  - the right method (POST/PATCH/DELETE carry the body's verb),
 *  - the right headers (POST carries an `Idempotency-Key`),
 *  - the right body shape (POST/PATCH stringify the input),
 *  - the right error shape (4xx/5xx throw `ApiError` with status + code).
 *
 * The suite also asserts the Idempotency-Key header is generated
 * per call (so the server's `IdempotencyService` cannot dedup
 * across separate form submissions).
 */

import {
  ApiError as _ApiError,
  createCategory,
  createTransaction,
  getTransaction,
  listCategories,
  listTransactions,
  softDeleteCategory,
  softDeleteTransaction,
  updateCategory,
  updateTransaction,
} from "../../lib/transactions-api.js";

const BASE = "http://localhost:3001";

function fakeTransaction() {
  return {
    amount: "100.00",
    currencyCode: "USD",
    kind: "expense" as const,
    categoryId: "ckl5g8z3a0001abcd1234ef",
    notes: "lunch",
    occurredAt: new Date("2026-06-01T12:00:00.000Z"),
  };
}

function fakeCategory() {
  return {
    name: "Groceries",
    slug: "groceries",
    kind: "expense" as const,
  };
}

function mockJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockEmptyResponse(status: number): Response {
  return new Response(null, { status });
}

describe("transactions client API", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listTransactions", () => {
    it("issues GET /transactions with the filter as query string", async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(200, { items: [], nextCursor: null }));

      await listTransactions({
        fromDate: new Date("2026-01-01T00:00:00.000Z"),
        pageSize: 20,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/transactions?fromDate=2026-01-01&pageSize=20`);
      expect(init.method).toBeUndefined();
      expect(init.credentials).toBe("include");
    });

    it("omits undefined filter fields from the query string", async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(200, { items: [], nextCursor: null }));
      await listTransactions({ pageSize: 20 });
      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toBe(`${BASE}/transactions?pageSize=20`);
    });
  });

  describe("getTransaction", () => {
    it("issues GET /transactions/:id", async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(200, { id: "txn-1" }));
      await getTransaction("txn-1");
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/transactions/txn-1`);
      expect(init.method).toBeUndefined();
    });
  });

  describe("createTransaction", () => {
    it("issues POST /transactions with an Idempotency-Key header", async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(201, { id: "txn-new" }));
      await createTransaction(fakeTransaction());
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/transactions`);
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("stringifies the body as JSON", async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(201, {}));
      const input = fakeTransaction();
      await createTransaction(input);
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(parseBody(init.body)).toMatchObject({
        currencyCode: "USD",
        kind: "expense",
      });
    });

    it("generates a fresh Idempotency-Key per call (no de-dup across retries)", async () => {
      // `mockResolvedValue` returns the same Response for every
      // call, which would double-consume the body. Use
      // `mockImplementation` to return a fresh response per call.
      fetchSpy.mockImplementation(async () => mockJsonResponse(201, {}));
      await createTransaction(fakeTransaction());
      await createTransaction(fakeTransaction());
      const k1 = (fetchSpy.mock.calls[0] as [string, RequestInit])[1].headers as Record<
        string,
        string
      >;
      const k2 = (fetchSpy.mock.calls[1] as [string, RequestInit])[1].headers as Record<
        string,
        string
      >;
      expect(k1["Idempotency-Key"]).not.toBe(k2["Idempotency-Key"]);
    });
  });

  describe("updateTransaction", () => {
    it("issues PATCH /transactions/:id with the body stringified", async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(200, { id: "txn-1" }));
      await updateTransaction("txn-1", { notes: "updated" });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/transactions/txn-1`);
      expect(init.method).toBe("PATCH");
      expect(parseBody(init.body)).toEqual({ notes: "updated" });
    });
  });

  describe("softDeleteTransaction", () => {
    it("issues DELETE /transactions/:id and returns void on 204", async () => {
      fetchSpy.mockResolvedValueOnce(mockEmptyResponse(204));
      const result = await softDeleteTransaction("txn-1");
      expect(result).toBeUndefined();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/transactions/txn-1`);
      expect(init.method).toBe("DELETE");
    });
  });

  describe("categories", () => {
    it("listCategories: GET /categories", async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(200, []));
      await listCategories();
      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toBe(`${BASE}/categories`);
    });

    it("createCategory: POST /categories with body", async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(201, {}));
      await createCategory(fakeCategory());
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/categories`);
      expect(init.method).toBe("POST");
      expect(parseBody(init.body)).toMatchObject({ name: "Groceries" });
    });

    it("updateCategory: PATCH /categories/:id", async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(200, {}));
      await updateCategory("cat-1", { name: "Restaurants" });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/categories/cat-1`);
      expect(init.method).toBe("PATCH");
    });

    it("softDeleteCategory: DELETE /categories/:id and returns void on 204", async () => {
      fetchSpy.mockResolvedValueOnce(mockEmptyResponse(204));
      const result = await softDeleteCategory("cat-1");
      expect(result).toBeUndefined();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/categories/cat-1`);
      expect(init.method).toBe("DELETE");
    });
  });

  describe("error handling", () => {
    it("throws ApiError on 4xx with status + code + message", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse(404, { error: "TRANSACTION_NOT_FOUND", message: "not found" }),
      );
      await expect(getTransaction("missing")).rejects.toMatchObject({
        name: "ApiError",
        status: 404,
        code: "TRANSACTION_NOT_FOUND",
        message: "not found",
      });
    });

    it("falls back to UNKNOWN code when the body is not JSON", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("not-json-body", { status: 500 }));
      await expect(getTransaction("any")).rejects.toMatchObject({
        name: "ApiError",
        status: 500,
        code: "UNKNOWN",
      });
    });
  });
});

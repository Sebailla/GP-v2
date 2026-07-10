/**
 * transactions client API — slice 6 (T6.foundation, lib layer).
 *
 * Typed fetch wrappers for the transactions + categories server
 * endpoints (apps/api, slice 5 PR #30 close-out). Used by:
 *  - TransactionsList (T6.4)
 *  - CreateTransactionForm (T6.5) and EditTransactionForm (T6.6)
 *  - CategoryManager (T6.7)
 *
 * **Auth.** `credentials: "include"` sends the `authjs.session-token`
 * cookie automatically (the browser carries the cookie the (app)
 * layout's session guard reads). The cookie's `httpOnly` flag is
 * irrelevant to the JS fetch surface; the Set-Cookie happens
 * server-side on sign-in.
 *
 * **Idempotency-Key.** Generated client-side as a UUID v4 on every
 * POST. The server's `IdempotencyService` (slice 5 / v1.1.0)
 * validates the header per D-TX-1. A retry of the same form
 * submission (e.g. a user double-clicks the create button) sends
 * the same UUID; the server returns the cached response.
 *
 * **Error model.** Non-2xx responses throw an `ApiError` whose
 * `.status` + `.code` are the JSON body parsed from the server.
 * The server's `ErrorResponseSchema` (apps/api/src/shared/contracts/
 * error-response.ts, slice 5 close-out) returns
 * `{ error, message }`. Component callers destructure via the
 * `t("transactions.new.error.${error}")` lookup.
 *
 * **Base URL.** `NEXT_PUBLIC_API_URL` env. The Next.js
 * `NEXT_PUBLIC_*` prefix means the value is inlined at build time
 * (so this module must not be evaluated server-side without
 * the env set). For the dev `pnpm --filter web dev` flow the env
 * is `http://localhost:3001` (set in apps/web/.env.local).
 *
 * **Why this file lives in apps/web (not libs/features/transactions/).**
 * The "no cross-module import" ESLint rule (slice 1 / T1.3) keeps
 * server-side code out of client bundles. The transactions
 * server lib (libs/features/transactions/server) is gated to
 * Node.js. The client API lib is a *client* surface (it depends
 * on `fetch` + `crypto.randomUUID` + `process.env` at the
 * call-site, all of which are browser-only). Keeping it in
 * apps/web/lib alongside auth.ts + useAuthApiPost.ts makes the
 * client boundary explicit and avoids the cross-module import
 * the server lib's `dist` export would otherwise require.
 */

import type {
  CreateCategoryInput,
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateCategoryInput,
  UpdateTransactionInput,
} from "@features/transactions/shared/schemas";

/**
 * Response shapes. The transactions server's wire payloads (the
 * `Transaction`, `Category`, etc. entities projected to JSON) are
 * declared here rather than imported from the server barrel
 * because:
 *  - The server barrel is gated to Node.js (Prisma client +
 *    domain interfaces). Importing it into apps/web would pull
 *    Node-only modules into the client bundle.
 *  - The wire format and the server-side domain entity are
 *    intentionally decoupled. The server projects to JSON at
 *    the controller boundary; the client consumes JSON. A
 *    client-side type definition is the correct place to
 *    document the wire contract.
 *
 * Keep these in lockstep with `apps/api/src/modules/transactions/
 *    transactions.controller.ts` (the projection happens in
 *    `projectTransaction(...)`).
 */

export interface TransactionResponse {
  readonly id: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly kind: "income" | "expense";
  readonly reportingAmount: string | null;
  readonly reportingCurrencyCode: string | null;
  readonly fxRateId: string | null;
  readonly categoryId: string;
  readonly notes: string | null;
  readonly occurredAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface CategoryResponse {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly kind: "income" | "expense";
  readonly updatedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Stripped-down transaction for list endpoints (no notes / audit fields). */
export interface TransactionListItemResponse {
  readonly id: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly kind: "income" | "expense";
  readonly reportingAmount: string | null;
  readonly reportingCurrencyCode: string | null;
  readonly fxRateId: string | null;
  readonly categoryId: string;
  readonly occurredAt: string;
}

/** Base URL for the API server. Resolved at build time via Next.js. */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: BodyInit | object } = {},
): Promise<T> {
  const { body, headers, ...rest } = init;
  const isPlain = body !== null && typeof body === "object";
  const fetchInit: RequestInit = {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...((isPlain ? {} : (headers as Record<string, string> | undefined)) ?? {}),
      ...((headers as Record<string, string> | undefined) ?? {}),
    },
  };
  if (isPlain) {
    fetchInit.body = JSON.stringify(body);
  } else if (body !== undefined) {
    fetchInit.body = body as BodyInit;
  }
  const res = await fetch(`${BASE}${path}`, fetchInit);
  // Read the body once: either the success path returns it parsed, or
  // the error path uses it for the error envelope. Two reads of the
  // same Response throw `InvalidStateError: Body has already been
  // used` in happy-dom (and at runtime in some browsers).
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  const data = (text.length > 0 ? safeJsonParse(text) : {}) as {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "UNKNOWN", data.message ?? res.statusText);
  }
  return data as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function qs(
  filter: Record<string, string | number | Date | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined) continue;
    if (v instanceof Date) {
      // Date-only convention for fromDate / toDate (the server's
      // listSchema parses either YYYY-MM-DD or full ISO; the date
      // form is what the server returns in cursor pagination).
      sp.set(k, v.toISOString().slice(0, 10));
      continue;
    }
    sp.set(k, String(v));
  }
  return sp.toString();
}

/** Generate a v4 UUID. Wrapped to keep the call site clean. */
function newIdempotencyKey(): string {
  // crypto.randomUUID is supported on every modern browser and the
  // edge runtime; slice 5's IdempotencyService validates the v4 format
  // (regex). Falls back to a Math.random-based string in non-https
  // test environments where crypto is unavailable.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ===== Transactions =====

export interface TransactionsPage {
  readonly items: ReadonlyArray<TransactionListItemResponse>;
  readonly nextCursor: string | null;
}

export function listTransactions(
  filter: Partial<ListTransactionsQuery> = {},
): Promise<TransactionsPage> {
  return request<TransactionsPage>(
    `/transactions?${qs(filter as Record<string, string | number | Date | undefined>)}`,
  );
}

export function getTransaction(id: string): Promise<TransactionResponse> {
  return request<TransactionResponse>(`/transactions/${id}`);
}

export function createTransaction(input: CreateTransactionInput): Promise<TransactionResponse> {
  return request<TransactionResponse>("/transactions", {
    method: "POST",
    body: input,
    headers: { "Idempotency-Key": newIdempotencyKey() },
  });
}

export function updateTransaction(
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionResponse> {
  return request<TransactionResponse>(`/transactions/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export function softDeleteTransaction(id: string): Promise<void> {
  return request<void>(`/transactions/${id}`, { method: "DELETE" });
}

// ===== Categories =====

export function listCategories(): Promise<ReadonlyArray<CategoryResponse>> {
  return request<ReadonlyArray<CategoryResponse>>("/categories");
}

export function createCategory(input: CreateCategoryInput): Promise<CategoryResponse> {
  return request<CategoryResponse>("/categories", {
    method: "POST",
    body: input,
  });
}

export function updateCategory(id: string, input: UpdateCategoryInput): Promise<CategoryResponse> {
  return request<CategoryResponse>(`/categories/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export function softDeleteCategory(id: string): Promise<void> {
  return request<void>(`/categories/${id}`, { method: "DELETE" });
}

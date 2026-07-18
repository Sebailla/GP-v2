/**
 * apps/web/lib/admin-api.ts — M3 Phase 4 (PR #4).
 *
 * Typed fetch wrappers for the admin endpoints (slice 5 / API PR #3):
 *  - GET    /admin/users?limit=&offset=
 *  - POST   /admin/users/:userId/role  body: { role }
 *  - GET    /admin/sessions?userId=
 *  - DELETE /admin/sessions/:sessionId
 *  - DELETE /admin/sessions/user/:userId
 *
 * Pattern follows `apps/web/lib/transactions-api.ts`:
 *  - `credentials: "include"` carries the session cookie.
 *  - Non-2xx responses throw an `ApiError` with the server's
 *    `{ error, message }` body parsed.
 *  - `NEXT_PUBLIC_API_URL` env is the base URL (set in
 *    apps/web/.env.local for dev = http://localhost:3001).
 *
 * Wire-format types are declared here (not imported from the
 * server barrel) so the client bundle stays free of Prisma +
 * Node-only modules per the slice-1 server/client split.
 *
 * Schema parity: the request bodies / query params go through
 * Zod via `@features/auth/shared/schemas` so a client-side
 * typo gets the same error as the server (see Phase 4 RED
 * tests — `admin.users.page.test.tsx` and
 * `admin.sessions.page.test.tsx`).
 */

import { z } from "zod";

import {
  ChangeRoleBodySchema,
  ListSessionsQuerySchema,
  ListUsersQuerySchema,
  type ChangeRoleBody,
  type ListSessionsQuery,
  type ListUsersQuery,
} from "@features/auth/shared/schemas";

export { ChangeRoleBodySchema, ListSessionsQuerySchema, ListUsersQuerySchema };
export type { ChangeRoleBody, ListSessionsQuery, ListUsersQuery };

/**
 * Response shapes — verbatim projections from
 * `apps/api/src/modules/auth/admin.controller.ts`.
 */

export interface AdminUserResponse {
  readonly id: string;
  readonly email: string;
  readonly role: "USER" | "ADMIN";
  readonly createdAt: string;
}

export interface AdminSessionResponse {
  readonly id: string;
  readonly userId: string;
  readonly createdAt: string;
  readonly lastActiveAt: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function apiBase(): string {
  // `NEXT_PUBLIC_*` is inlined at build time; defaults to the dev
  // API port (apps/api runs on 3001) so the e2e + dev harness works.
  const raw = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
  return raw.replace(/\/$/, "");
}

function readSessionToken(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = "authjs.session-token=";
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix));
  return cookie === undefined ? null : decodeURIComponent(cookie.slice(prefix.length));
}

function authHeader(): Record<string, string> {
  const token = readSessionToken();
  return {
    "Content-Type": "application/json",
    ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
  };
}

async function parseErrorBody(response: Response): Promise<{ code: string; message: string }> {
  try {
    const json = (await response.json()) as { error?: unknown; message?: unknown };
    return {
      code: typeof json.error === "string" ? json.error : "UNKNOWN",
      message: typeof json.message === "string" ? json.message : response.statusText,
    };
  } catch {
    return { code: "UNKNOWN", message: response.statusText };
  }
}

/**
 * GET /admin/users?limit=&offset=
 */
export async function listAdminUsers(
  query: Partial<ListUsersQuery> = {},
): Promise<AdminUserResponse[]> {
  const parsed = ListUsersQuerySchema.parse(query);
  const url = new URL(`${apiBase()}/admin/users`);
  url.searchParams.set("limit", String(parsed.limit));
  url.searchParams.set("offset", String(parsed.offset));
  const res = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: authHeader(),
  });
  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as AdminUserResponse[];
}

/**
 * POST /admin/users/:userId/role
 */
export async function changeAdminUserRole(
  userId: string,
  body: ChangeRoleBody,
): Promise<AdminUserResponse> {
  const parsed = ChangeRoleBodySchema.parse(body);
  const res = await fetch(`${apiBase()}/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "POST",
    credentials: "include",
    headers: authHeader(),
    body: JSON.stringify(parsed),
  });
  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as AdminUserResponse;
}

/**
 * GET /admin/sessions?userId=
 */
export async function listAdminSessions(
  query: ListSessionsQuery,
): Promise<AdminSessionResponse[]> {
  const parsed = ListSessionsQuerySchema.parse(query);
  const url = new URL(`${apiBase()}/admin/sessions`);
  url.searchParams.set("userId", parsed.userId);
  const res = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: authHeader(),
  });
  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as AdminSessionResponse[];
}

/**
 * DELETE /admin/sessions/:sessionId
 */
export async function revokeAdminSession(sessionId: string): Promise<void> {
  const res = await fetch(`${apiBase()}/admin/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    credentials: "include",
    headers: authHeader(),
  });
  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ApiError(res.status, code, message);
  }
}

/**
 * DELETE /admin/sessions/user/:userId
 */
export async function revokeAllAdminSessions(userId: string): Promise<void> {
  const res = await fetch(
    `${apiBase()}/admin/sessions/user/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: authHeader(),
    },
  );
  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ApiError(res.status, code, message);
  }
}

// Re-export `z` so tests can use the same validator without
// pulling zod directly. Saves a transitive import per test file.
export { z };

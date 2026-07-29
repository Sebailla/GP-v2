import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { SessionsTable } from "../../../components/admin/SessionsTable";

/**
 * TDD contract for the admin sessions page — M3 Phase 4 (PR #4,
 * tasks 4.3 + 4.4 + 4.5 + 4.8).
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §5 (HTTP
 * contract) + tasks.md 4.3:
 *
 * The page `/[locale]/(app)/admin/sessions` is a Server Component
 * that renders `SessionsTable` (client). The SessionsTable owns
 * the userId input + the 5 form states:
 *  - **loading**: list fetch in flight
 *  - **error**: list fetch rejected
 *  - **success-empty**: response was `[]`
 *  - **success-non-empty**: response had at least one row
 *  - **validation-error**: userId input is missing/invalid
 *
 * The SessionsTable also owns the revoke buttons:
 *  - per-row "revoke" → DELETE /admin/sessions/:sessionId
 *  - bulk "revoke all" → DELETE /admin/sessions/user/:userId
 *
 * Triangulated behaviors (task 4.8):
 *  - empty state shows helpful copy
 *  - successful single revoke shows the localized confirmation
 *  - successful bulk revoke shows the localized confirmation
 */

vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

const mockList = vi.fn();
const mockRevokeOne = vi.fn();
const mockRevokeAll = vi.fn();

vi.mock("../../../lib/admin-api", async () => {
  // Partial mock: import the real module and override only the
  // fetch fns. The real Zod schemas flow through untouched so the
  // SessionsTable's `safeParse` calls work against the canonical
  // contract.
  const actual = await vi.importActual<
    typeof import("../../../lib/admin-api")
  >("../../../lib/admin-api");
  return {
    ...actual,
    listAdminSessions: (...args: unknown[]) => mockList(...args),
    revokeAdminSession: (...args: unknown[]) => mockRevokeOne(...args),
    revokeAllAdminSessions: (...args: unknown[]) => mockRevokeAll(...args),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/en/admin/sessions",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const SESSIONS_FIXTURE = [
  {
    id: "session-1",
    userId: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActiveAt: "2026-01-02T00:00:00.000Z",
    userAgent: "Mozilla/5.0",
    ipAddress: "10.0.0.1",
  },
  {
    id: "session-2",
    userId: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-01-02T00:00:00.000Z",
    lastActiveAt: "2026-01-03T00:00:00.000Z",
    userAgent: "Mozilla/5.0",
    ipAddress: "10.0.0.2",
  },
];

const USER_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mockList.mockReset();
  mockRevokeOne.mockReset();
  mockRevokeAll.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("SessionsTable — 5 form states (admin.sessions)", () => {
  it("renders the validation-error state when the userId is empty on submit", async () => {
    const user = userEvent.setup();
    render(<SessionsTable />);
    // Click the load button without entering a userId.
    const loadBtn = screen.getByRole("button", { name: "admin.sessions.load" });
    await user.click(loadBtn);
    expect(await screen.findByText("admin.sessions.validationError")).toBeInTheDocument();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("renders the loading state after a valid userId is submitted", async () => {
    const user = userEvent.setup();
    mockList.mockImplementation(() => new Promise(() => undefined));
    render(<SessionsTable />);
    const input = screen.getByLabelText("admin.sessions.userIdLabel");
    await user.type(input, USER_ID);
    const loadBtn = screen.getByRole("button", { name: "admin.sessions.load" });
    await user.click(loadBtn);
    expect(await screen.findByText("admin.sessions.loading")).toBeInTheDocument();
  });

  it("renders the error state with retry when the fetch rejects", async () => {
    const user = userEvent.setup();
    mockList.mockRejectedValueOnce(new Error("403 forbidden"));
    render(<SessionsTable />);
    const input = screen.getByLabelText("admin.sessions.userIdLabel");
    await user.type(input, USER_ID);
    await user.click(screen.getByRole("button", { name: "admin.sessions.load" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // The mock translator returns the i18n key unchanged — the
    // {message} placeholder is NOT interpolated by the mock.
    expect(screen.getByText("admin.sessions.error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "admin.sessions.retry" })).toBeInTheDocument();
  });

  it("renders the empty state with helpful copy when the response is []", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce([]);
    render(<SessionsTable />);
    const input = screen.getByLabelText("admin.sessions.userIdLabel");
    await user.type(input, USER_ID);
    await user.click(screen.getByRole("button", { name: "admin.sessions.load" }));
    expect(await screen.findByText("admin.sessions.empty")).toBeInTheDocument();
  });

  it("renders the success state with the sessions table when the response is non-empty", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(SESSIONS_FIXTURE);
    render(<SessionsTable />);
    const input = screen.getByLabelText("admin.sessions.userIdLabel");
    await user.type(input, USER_ID);
    await user.click(screen.getByRole("button", { name: "admin.sessions.load" }));
    expect(await screen.findByText("session-1")).toBeInTheDocument();
    expect(screen.getByText("session-2")).toBeInTheDocument();
  });
});

describe("SessionsTable — revoke buttons (single + all)", () => {
  it("calls DELETE /admin/sessions/:id when a single revoke is clicked", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(SESSIONS_FIXTURE);
    mockRevokeOne.mockResolvedValueOnce(undefined);
    render(<SessionsTable />);
    const input = screen.getByLabelText("admin.sessions.userIdLabel");
    await user.type(input, USER_ID);
    await user.click(screen.getByRole("button", { name: "admin.sessions.load" }));
    await screen.findByText("session-1");
    const revokeButtons = screen.getAllByRole("button", {
      name: "admin.sessions.revoke",
    });
    expect(revokeButtons.length).toBe(2);
    const firstRevoke = revokeButtons[0]!;
    await user.click(firstRevoke);
    await waitFor(() => {
      expect(mockRevokeOne).toHaveBeenCalledWith("session-1");
    });
  });

  it("calls DELETE /admin/sessions/user/:userId when the bulk revoke button is clicked", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(SESSIONS_FIXTURE);
    mockRevokeAll.mockResolvedValueOnce(undefined);
    render(<SessionsTable />);
    const input = screen.getByLabelText("admin.sessions.userIdLabel");
    await user.type(input, USER_ID);
    await user.click(screen.getByRole("button", { name: "admin.sessions.load" }));
    await screen.findByText("session-1");
    const bulkBtn = screen.getByRole("button", { name: "admin.sessions.revokeAll" });
    await user.click(bulkBtn);
    await waitFor(() => {
      expect(mockRevokeAll).toHaveBeenCalledWith(USER_ID);
    });
  });

  it("shows the localized confirmation when a single revoke succeeds (triangulated happy path)", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(SESSIONS_FIXTURE);
    mockRevokeOne.mockResolvedValueOnce(undefined);
    render(<SessionsTable />);
    const input = screen.getByLabelText("admin.sessions.userIdLabel");
    await user.type(input, USER_ID);
    await user.click(screen.getByRole("button", { name: "admin.sessions.load" }));
    await screen.findByText("session-1");
    const revokeButtons = screen.getAllByRole("button", {
      name: "admin.sessions.revoke",
    });
    const firstRevoke = revokeButtons[0]!;
    await user.click(firstRevoke);
    expect(await screen.findByText("admin.sessions.revokeSuccess")).toBeInTheDocument();
  });

  it("shows the localized confirmation when the bulk revoke succeeds (triangulated happy path)", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(SESSIONS_FIXTURE);
    mockRevokeAll.mockResolvedValueOnce(undefined);
    render(<SessionsTable />);
    const input = screen.getByLabelText("admin.sessions.userIdLabel");
    await user.type(input, USER_ID);
    await user.click(screen.getByRole("button", { name: "admin.sessions.load" }));
    await screen.findByText("session-1");
    await user.click(screen.getByRole("button", { name: "admin.sessions.revokeAll" }));
    expect(await screen.findByText("admin.sessions.revokeAllSuccess")).toBeInTheDocument();
  });
});

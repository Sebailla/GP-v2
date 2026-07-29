import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { UsersTable } from "../../../components/admin/UsersTable";
import { AdminNav } from "../../../components/admin/AdminNav";

/**
 * TDD contract for the admin users page — M3 Phase 4 (PR #4,
 * tasks 4.3 + 4.4 + 4.5 + 4.8).
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §2 D6 +
 * `openspec/specs/nextauth-web-routes/spec.md` Admin Route Guard:
 *
 * The page `/[locale]/(app)/admin/users` is a Server Component
 * that renders `AdminNav` + `UsersTable`. The UsersTable is the
 * data-bearing client component — it owns the 5 form states per
 * AGENTS.md §9:
 *  - **loading**: initial fetch in flight
 *  - **error**: fetch rejected
 *  - **success-empty**: response was `[]`
 *  - **success-non-empty**: response had at least one row
 *  - **validation-error**: role-change form fails Zod
 *
 * The role-change form (success state after submit) and the
 * empty-state with a CTA + helpful copy are the two
 * triangulated paths in task 4.8.
 *
 * Strategy: mock `next-intl` (returns key-scoped string),
 * mock `@/lib/admin-api`, render the UsersTable with controlled
 * fetch mock responses, then assert the DOM.
 */

// Mock `next-intl` (client translator). The same trick as the
// sign-in test (slice 4) — the rendered tree shows the i18n
// keys so the test is locale-agnostic.
vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

// Mock the admin API surface. The mock is wired per-test in
// `beforeEach` so each scenario can pin a specific response
// shape (loading / error / empty / success).
const mockList = vi.fn();
const mockChangeRole = vi.fn();

vi.mock("../../../lib/admin-api", async () => {
  // Partial mock: real module + fetch overrides.
  const actual = await vi.importActual<
    typeof import("../../../lib/admin-api")
  >("../../../lib/admin-api");
  return {
    ...actual,
    listAdminUsers: (...args: unknown[]) => mockList(...args),
    changeAdminUserRole: (...args: unknown[]) => mockChangeRole(...args),
  };
});

// Mock `next/navigation` for any router calls in the test
// (the admin pages don't currently use it but the global
// setup covers any future `router.push` for redirecting after
// a successful role change).
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/en/admin/users",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const USERS_PAGE_FIXTURE = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: "alice@example.com",
    role: "USER" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    email: "bob@example.com",
    role: "ADMIN" as const,
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

beforeEach(() => {
  mockList.mockReset();
  mockChangeRole.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("UsersTable — 5 form states (admin.users)", () => {
  it("renders the loading state on initial fetch", () => {
    mockList.mockImplementation(() => new Promise(() => undefined));
    render(<UsersTable />);
    // loading copy uses the admin.users.loading key
    expect(screen.getByText("admin.users.loading")).toBeInTheDocument();
  });

  it("renders the error state with retry when the fetch rejects", async () => {
    mockList.mockRejectedValueOnce(new Error("network down"));
    render(<UsersTable />);
    // The error banner surfaces the i18n key (mock translator does
    // not interpolate the {message} placeholder). The actual
    // runtime rendering uses the real next-intl provider which
    // DOES interpolate — the test asserts on the key to keep the
    // mock surface minimal.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("admin.users.error")).toBeInTheDocument();
    // Retry button is keyed admin.users.retry.
    expect(screen.getByRole("button", { name: "admin.users.retry" })).toBeInTheDocument();
  });

  it("renders the empty state with helpful copy when the response is []", async () => {
    mockList.mockResolvedValueOnce([]);
    render(<UsersTable />);
    // Empty copy: admin.users.empty + admin.users.emptyHelp.
    await waitFor(() => {
      expect(screen.getByText("admin.users.empty")).toBeInTheDocument();
    });
    expect(screen.getByText("admin.users.emptyHelp")).toBeInTheDocument();
  });

  it("renders the success state with the users table when the response is non-empty", async () => {
    mockList.mockResolvedValueOnce(USERS_PAGE_FIXTURE);
    render(<UsersTable />);
    // The first row's email shows in a table cell.
    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    // Column headers from admin.users.columns.*
    expect(screen.getByText("admin.users.columns.email")).toBeInTheDocument();
    expect(screen.getByText("admin.users.columns.role")).toBeInTheDocument();
    expect(screen.getByText("admin.users.columns.createdAt")).toBeInTheDocument();
  });

  it("calls changeAdminUserRole and shows a localized confirmation when the submit button is clicked (triangulated happy path)", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(USERS_PAGE_FIXTURE);
    mockChangeRole.mockResolvedValueOnce({
      ...USERS_PAGE_FIXTURE[0],
      role: "ADMIN" as const,
    });
    render(<UsersTable />);
    expect(await screen.findByText("alice@example.com")).toBeInTheDocument();
    // Find Alice's row. The role-change submit button has
    // accessible name `admin.users.roleChange.submit`; the
    // Radix Select trigger has a different accessible name.
    const submitButtons = screen.getAllByRole("button", {
      name: "admin.users.roleChange.submit",
    });
    expect(submitButtons.length).toBeGreaterThanOrEqual(1);
    const firstSubmit = submitButtons[0]!;
    await user.click(firstSubmit);
    await waitFor(() => {
      expect(mockChangeRole).toHaveBeenCalled();
    });
    expect(
      await screen.findByText("admin.users.roleChange.success"),
    ).toBeInTheDocument();
  });

  it("surfaces a server-error message when the API rejects the role change", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(USERS_PAGE_FIXTURE);
    mockChangeRole.mockRejectedValueOnce(new Error("server error"));
    render(<UsersTable />);
    expect(await screen.findByText("alice@example.com")).toBeInTheDocument();
    const submitButtons = screen.getAllByRole("button", {
      name: "admin.users.roleChange.submit",
    });
    const firstSubmit = submitButtons[0]!;
    await user.click(firstSubmit);
    // After the API rejects, the component falls back to the
    // page-level error state with the i18n key + an alert role.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("admin.users.error")).toBeInTheDocument();
  });
});

describe("AdminNav — top-level nav for admin pages", () => {
  it("renders the three nav links (users, sessions, back-to-app)", () => {
    render(<AdminNav active="users" locale="en" />);
    expect(screen.getByText("admin.nav.users")).toBeInTheDocument();
    expect(screen.getByText("admin.nav.sessions")).toBeInTheDocument();
    expect(screen.getByText("admin.nav.back")).toBeInTheDocument();
  });

  it("marks the active tab with aria-current='page' when active='users'", () => {
    render(<AdminNav active="users" locale="en" />);
    const usersLink = screen.getByText("admin.nav.users").closest("a");
    expect(usersLink).not.toBeNull();
    expect(usersLink!.getAttribute("aria-current")).toBe("page");
  });

  it("does NOT mark the sessions tab as active when active='users'", () => {
    render(<AdminNav active="users" locale="en" />);
    const sessionsLink = screen.getByText("admin.nav.sessions").closest("a");
    expect(sessionsLink).not.toBeNull();
    expect(sessionsLink!.getAttribute("aria-current")).toBeNull();
  });
});

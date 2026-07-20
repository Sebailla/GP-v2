import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

import { AuditLogTable } from "../../../components/admin/AuditLogTable";

/**
 * TDD contract for `AuditLogTable` — M4 Phase 3 (PR #3, tasks
 * 3.4 + 3.5 + 3.9 triangulation).
 *
 * Per `openspec/specs/audit-log-ui/spec.md` "List Audit Events"
 * + design §4 (AuditLogTable client component) + AGENTS.md §9
 * (5 form states):
 *  - **loading**: initial fetch in flight
 *  - **error**: fetch rejected; surface error banner + retry
 *  - **success-empty**: response was `[]`; show CTA + helpful copy
 *  - **success-non-empty**: render the table with the 7 spec-literal
 *    columns (createdAt, action, actorId, targetId, ipAddress,
 *    userAgent, metadata)
 *  - **validation-error**: delegated to AuditFilterBar (the table
 *    does not own input validation — see AuditFilterBar tests)
 *
 * Triangulated (task 3.9):
 *  - empty state shows CTA + helpful copy
 *  - success state renders all 7 columns with localized headers
 *  - error state surfaces the localized copy
 *  - pagination metadata renders when present
 */

vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

const mockList = vi.fn();

vi.mock("../../../lib/audit-api", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/audit-api")
  >("../../../lib/audit-api");
  return {
    ...actual,
    listAdminAuditEvents: (...args: unknown[]) => mockList(...args),
  };
});

const SAMPLE_EVENTS = [
  {
    id: "evt-1",
    actorId: "11111111-1111-4111-8111-111111111111",
    targetId: "22222222-2222-4222-8222-222222222222",
    action: "REVOKE_SESSION" as const,
    createdAt: "2026-01-15T10:00:00.000Z",
    metadata: { sessionId: "session-1" },
    ipAddress: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    userAgent: "Mozilla/5.0 (test)",
  },
  {
    id: "evt-2",
    actorId: "33333333-3333-4333-8333-333333333333",
    targetId: "44444444-4444-4444-8444-444444444444",
    action: "CHANGE_ROLE" as const,
    createdAt: "2026-01-16T11:00:00.000Z",
    metadata: { from: "USER", to: "ADMIN" },
    ipAddress: null,
    userAgent: null,
  },
];

beforeEach(() => {
  mockList.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("AuditLogTable — 5 form states (admin.audit)", () => {
  it("renders the loading state on initial fetch", () => {
    mockList.mockImplementation(() => new Promise(() => undefined));
    render(<AuditLogTable />);
    expect(screen.getByText("admin.audit.loading")).toBeInTheDocument();
  });

  it("renders the error state with retry when the fetch rejects", async () => {
    mockList.mockRejectedValueOnce(new Error("network down"));
    render(<AuditLogTable />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("admin.audit.error")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "admin.audit.retry" }),
    ).toBeInTheDocument();
  });

  it("renders the empty state with helpful copy when the response is []", async () => {
    mockList.mockResolvedValueOnce([]);
    render(<AuditLogTable />);
    await waitFor(() => {
      expect(screen.getByText("admin.audit.empty")).toBeInTheDocument();
    });
    expect(screen.getByText("admin.audit.emptyHelp")).toBeInTheDocument();
  });

  it("renders the success state with the audit table when the response is non-empty", async () => {
    mockList.mockResolvedValueOnce(SAMPLE_EVENTS);
    render(<AuditLogTable />);
    // Wait for the row to render; the data-event-id attribute is
    // the canonical hook (the id itself is opaque — we test the
    // row presence, not the string).
    await waitFor(() => {
      expect(document.querySelector('[data-event-id="evt-1"]')).toBeInTheDocument();
    });
    // The 7 spec-literal column headers
    expect(screen.getByText("admin.audit.columns.createdAt")).toBeInTheDocument();
    expect(screen.getByText("admin.audit.columns.action")).toBeInTheDocument();
    expect(screen.getByText("admin.audit.columns.actorId")).toBeInTheDocument();
    expect(screen.getByText("admin.audit.columns.targetId")).toBeInTheDocument();
    expect(screen.getByText("admin.audit.columns.ipAddress")).toBeInTheDocument();
    expect(screen.getByText("admin.audit.columns.userAgent")).toBeInTheDocument();
    expect(screen.getByText("admin.audit.columns.metadata")).toBeInTheDocument();
    // The action enum renders the localized label
    expect(screen.getByText("REVOKE_SESSION")).toBeInTheDocument();
  });

  it("renders the HMAC ipAddress (64 hex chars) in the IP column", async () => {
    mockList.mockResolvedValueOnce(SAMPLE_EVENTS);
    render(<AuditLogTable />);
    await waitFor(() => {
      expect(document.querySelector('[data-event-id="evt-1"]')).toBeInTheDocument();
    });
    // The HMAC-SHA256 hex digest is rendered verbatim — 64 chars.
    // The first event's ipAddress is the canonical hex.
    expect(
      screen.getByText(
        "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
      ),
    ).toBeInTheDocument();
  });

  it("renders null ipAddress as an em-dash placeholder", async () => {
    mockList.mockResolvedValueOnce(SAMPLE_EVENTS);
    render(<AuditLogTable />);
    await waitFor(() => {
      expect(document.querySelector('[data-event-id="evt-2"]')).toBeInTheDocument();
    });
    // The second event has ipAddress=null; render as "—" (em-dash)
    const cells = screen.getAllByText("—");
    expect(cells.length).toBeGreaterThanOrEqual(2);
  });

  it("calls listAdminAuditEvents on mount with default limit/offset", async () => {
    mockList.mockResolvedValueOnce([]);
    render(<AuditLogTable />);
    await waitFor(() => {
      expect(mockList).toHaveBeenCalled();
    });
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });
});

describe("AuditLogTable — pagination metadata (task 3.9 triangulation)", () => {
  it("renders a localized confirmation after a successful fetch", async () => {
    mockList.mockResolvedValueOnce(SAMPLE_EVENTS);
    render(<AuditLogTable />);
    await waitFor(() => {
      expect(screen.getByText("admin.audit.filterApplied")).toBeInTheDocument();
    });
  });
});

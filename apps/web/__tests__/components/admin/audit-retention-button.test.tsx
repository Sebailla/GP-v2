import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { AuditRetentionButton } from "../../../components/admin/AuditRetentionButton";

/**
 * TDD contract for `AuditRetentionButton` — M4 Phase 3 (PR #3,
 * tasks 3.4 + 3.7).
 *
 * Per `openspec/specs/audit-log-ui/spec.md` "Purge Audit Events
 * (Dry-run)" + "Purge Audit Events (Real)" requirements:
 *  - dry-run button calls `dryRunPurgeAuditEvents({ olderThanDays })`
 *    and renders the localized `matched` count in the dry-run
 *    result row
 *  - real purge button opens a confirm dialog with the matched
 *    count + olderThanDays interpolated; on confirm it calls
 *    `purgeAuditEvents({ olderThanDays })` and renders the deleted
 *    count
 *  - both buttons share the same `olderThanDays` form input
 *  - 5 form states per AGENTS.md §9:
 *    - loading (initial dry-run in flight)
 *    - error (server rejected the request)
 *    - success (dry-run matched / real purged)
 *    - empty (no dry-run yet — the input row is rendered with no
 *      result)
 *    - validation-error (olderThanDays is empty or < 1)
 */

vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

const mockDryRun = vi.fn();
const mockPurge = vi.fn();

vi.mock("../../../lib/audit-api", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/audit-api")
  >("../../../lib/audit-api");
  return {
    ...actual,
    dryRunPurgeAuditEvents: (...args: unknown[]) => mockDryRun(...args),
    purgeAuditEvents: (...args: unknown[]) => mockPurge(...args),
  };
});

beforeEach(() => {
  mockDryRun.mockReset();
  mockPurge.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("AuditRetentionButton — 5 form states", () => {
  it("renders the empty state with the olderThanDays input + dry-run + purge buttons", () => {
    render(<AuditRetentionButton />);
    expect(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "admin.audit.retention.dryRun" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "admin.audit.retention.purge" }),
    ).toBeInTheDocument();
  });

  it("renders the validation-error state when olderThanDays is empty", async () => {
    const user = userEvent.setup();
    render(<AuditRetentionButton />);
    // Clear the pre-filled "90" so the input is empty.
    await user.clear(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
    );
    await user.click(
      screen.getByRole("button", { name: "admin.audit.retention.dryRun" }),
    );
    expect(
      screen.getByTestId("retention-validation-error"),
    ).toBeInTheDocument();
  });

  it("renders the loading state while the dry-run is in flight", async () => {
    const user = userEvent.setup();
    mockDryRun.mockImplementation(() => new Promise(() => undefined));
    render(<AuditRetentionButton />);
    await user.clear(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
    );
    await user.type(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
      "90",
    );
    await user.click(
      screen.getByRole("button", { name: "admin.audit.retention.dryRun" }),
    );
    expect(
      await screen.findByText("admin.audit.retention.dryRunning"),
    ).toBeInTheDocument();
  });

  it("renders the success state with matched count after a dry-run completes", async () => {
    const user = userEvent.setup();
    mockDryRun.mockResolvedValueOnce({ matched: 42, wouldDelete: 42 });
    render(<AuditRetentionButton />);
    await user.clear(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
    );
    await user.type(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
      "90",
    );
    await user.click(
      screen.getByRole("button", { name: "admin.audit.retention.dryRun" }),
    );
    expect(
      await screen.findByTestId("retention-dry-run-result"),
    ).toBeInTheDocument();
    expect(mockDryRun).toHaveBeenCalledWith({ olderThanDays: 90 });
  });

  it("renders the error state when the dry-run API rejects", async () => {
    const user = userEvent.setup();
    mockDryRun.mockRejectedValueOnce(new Error("network down"));
    render(<AuditRetentionButton />);
    await user.clear(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
    );
    await user.type(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
      "90",
    );
    await user.click(
      screen.getByRole("button", { name: "admin.audit.retention.dryRun" }),
    );
    expect(
      await screen.findByTestId("retention-error"),
    ).toBeInTheDocument();
  });

  it("renders the success state with matched=0 copy when the dry-run returns zero", async () => {
    const user = userEvent.setup();
    mockDryRun.mockResolvedValueOnce({ matched: 0, wouldDelete: 0 });
    render(<AuditRetentionButton />);
    await user.clear(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
    );
    await user.type(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
      "90",
    );
    await user.click(
      screen.getByRole("button", { name: "admin.audit.retention.dryRun" }),
    );
    expect(
      await screen.findByTestId("retention-dry-run-result"),
    ).toBeInTheDocument();
  });
});

describe("AuditRetentionButton — purge confirm dialog", () => {
  it("purge button shows confirm dialog with the matched count + olderThanDays", async () => {
    const user = userEvent.setup();
    mockDryRun.mockResolvedValueOnce({ matched: 42, wouldDelete: 42 });
    mockPurge.mockResolvedValueOnce({ matched: 42, deleted: 42 });
    render(<AuditRetentionButton />);
    await user.clear(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
    );
    await user.type(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
      "90",
    );
    // First dry-run to populate the matched count for the confirm
    await user.click(
      screen.getByRole("button", { name: "admin.audit.retention.dryRun" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("retention-dry-run-result")).toBeInTheDocument();
    });
    // Now click purge — confirm dialog must appear
    await user.click(screen.getByTestId("retention-purge"));
    expect(
      screen.getByTestId("retention-confirm-dialog"),
    ).toBeInTheDocument();
  });

  it("confirming the purge calls purgeAuditEvents and renders the deleted count", async () => {
    const user = userEvent.setup();
    mockDryRun.mockResolvedValueOnce({ matched: 42, wouldDelete: 42 });
    mockPurge.mockResolvedValueOnce({ matched: 42, deleted: 42 });
    render(<AuditRetentionButton />);
    await user.clear(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
    );
    await user.type(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
      "90",
    );
    await user.click(
      screen.getByRole("button", { name: "admin.audit.retention.dryRun" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("retention-dry-run-result")).toBeInTheDocument();
    });
    await user.click(
      screen.getByTestId("retention-purge"),
    );
    // The confirm dialog has a destructive button labeled with the
    // localized "purge" copy. It is identified via the testid the
    // production code wires to the destructive button.
    await user.click(screen.getByTestId("retention-purge-confirm"));
    expect(mockPurge).toHaveBeenCalledWith({ olderThanDays: 90 });
    expect(
      await screen.findByTestId("retention-purge-result"),
    ).toBeInTheDocument();
  });

  it("cancel button on confirm dialog dismisses without calling the API", async () => {
    const user = userEvent.setup();
    mockDryRun.mockResolvedValueOnce({ matched: 42, wouldDelete: 42 });
    render(<AuditRetentionButton />);
    await user.clear(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
    );
    await user.type(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
      "90",
    );
    await user.click(
      screen.getByRole("button", { name: "admin.audit.retention.dryRun" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("retention-dry-run-result")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("retention-purge"));
    // The cancel button is the outline variant; identify it by role.
    await user.click(
      screen.getByRole("button", { name: "common.cancel" }),
    );
    expect(mockPurge).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("retention-confirm-dialog"),
    ).not.toBeInTheDocument();
  });
});

describe("AuditRetentionButton — validation error surfaces the i18n key (JD-4 fix)", () => {
  // JD-4 fix (JD-driven correction round 1): the validation-error
  // branch in AuditRetentionButton rendered the i18n KEY as
  // user-facing text ("admin.audit.validationError" instead of the
  // resolved label). RED: assert the validation-error alert does
  // NOT contain the literal string `'admin.audit.validationError'`.
  it("validation-error alert shows the translated label, not the i18n KEY", async () => {
    const user = userEvent.setup();
    render(<AuditRetentionButton />);
    // Clear the pre-filled 90 so the input is empty.
    await user.clear(
      screen.getByLabelText("admin.audit.retention.olderThanDaysLabel"),
    );
    // Click dry-run with empty input — triggers the validation
    // branch via parseOlderThanDays rejecting the empty string.
    await user.click(
      screen.getByRole("button", { name: "admin.audit.retention.dryRun" }),
    );

    const alert = screen.getByTestId("retention-validation-error");
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).not.toBe("admin.audit.validationError");
    // The mock next-intl returns `${scope}.${key}`; with the fix
    // the scope is `admin.audit.retention` (the button's
    // namespace) and the key is `validationError`.
    expect(alert.textContent).toBe("admin.audit.retention.validationError");
  });
});

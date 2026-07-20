import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { AuditFilterBar } from "../../../components/admin/AuditFilterBar";

/**
 * TDD contract for `AuditFilterBar` — M4 Phase 3 (PR #3, tasks
 * 3.4 + 3.6).
 *
 * Per `openspec/specs/audit-log-ui/spec.md` "List Audit Events"
 * + design §5 (HTTP contract: 7 query params) + design §4
 * (file changes: AuditFilterBar with 4 filter inputs + pagination):
 *  - 4 filter inputs: actorId, targetId, action (select), since
 *    (date), until (date)
 *  - submit button calls `onApply(values)` with the current values
 *  - reset button calls `onReset()` to clear the form
 *  - Validation: at least one filter value OR a pagination change
 *    is required (empty submission triggers the validation-error
 *    branch and surfaces the localized copy)
 *
 * The component owns NO fetch logic — it surfaces values via
 * callbacks (`onApply`, `onReset`, `onPageChange`). The parent
 * page (`/admin/audit/page.tsx`) decides what URL to push.
 */

vi.mock("next-intl", () => ({
  useTranslations: (scope: string) => (key: string) => `${scope}.${key}`,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

const baseProps = {
  initialFilters: {
    actorId: "",
    targetId: "",
    action: "",
    since: "",
    until: "",
  },
  initialOffset: 0,
  initialLimit: 50,
  pageSize: 50,
  totalPages: 1,
  onApply: vi.fn(),
  onReset: vi.fn(),
  onPageChange: vi.fn(),
};

describe("AuditFilterBar — inputs render + bind to values", () => {
  it("renders all 4 filter inputs (actorId, targetId, action, since, until)", () => {
    render(<AuditFilterBar {...baseProps} />);
    expect(screen.getByLabelText("admin.audit.filters.actorIdLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("admin.audit.filters.targetIdLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("admin.audit.filters.actionLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("admin.audit.filters.sinceLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("admin.audit.filters.untilLabel")).toBeInTheDocument();
  });

  it("initial values flow into the inputs", () => {
    render(
      <AuditFilterBar
        {...baseProps}
        initialFilters={{
          actorId: "11111111-1111-4111-8111-111111111111",
          targetId: "22222222-2222-4222-8222-222222222222",
          action: "REVOKE_SESSION",
          since: "2026-01-01",
          until: "2026-02-01",
        }}
      />,
    );
    expect(
      (screen.getByLabelText("admin.audit.filters.actorIdLabel") as HTMLInputElement).value,
    ).toBe("11111111-1111-4111-8111-111111111111");
    expect(
      (screen.getByLabelText("admin.audit.filters.targetIdLabel") as HTMLInputElement).value,
    ).toBe("22222222-2222-4222-8222-222222222222");
    // The Radix Select trigger renders the selected value as visible
    // text (not via input.value); assert on the rendered text node
    // so the test survives a future refactor to a different select
    // primitive.
    const actionTrigger = screen.getByLabelText("admin.audit.filters.actionLabel");
    expect(actionTrigger).toHaveTextContent("REVOKE_SESSION");
    expect(
      (screen.getByLabelText("admin.audit.filters.sinceLabel") as HTMLInputElement).value,
    ).toBe("2026-01-01");
    expect(
      (screen.getByLabelText("admin.audit.filters.untilLabel") as HTMLInputElement).value,
    ).toBe("2026-02-01");
  });
});

describe("AuditFilterBar — submit triggers fetch (URL params encoded)", () => {
  it("Apply button calls onApply with the current filter values", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<AuditFilterBar {...baseProps} onApply={onApply} />);

    await user.type(
      screen.getByLabelText("admin.audit.filters.actorIdLabel"),
      "11111111-1111-4111-8111-111111111111",
    );
    await user.click(
      screen.getByRole("button", { name: "admin.audit.filters.apply" }),
    );

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "11111111-1111-4111-8111-111111111111",
        targetId: "",
        action: "",
        since: "",
        until: "",
      }),
    );
  });

  it("Reset button calls onReset to clear all filters", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<AuditFilterBar {...baseProps} onReset={onReset} />);

    await user.click(
      screen.getByRole("button", { name: "admin.audit.filters.reset" }),
    );

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("AuditFilterBar — pagination controls", () => {
  it("Next button calls onPageChange with next offset", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <AuditFilterBar
        {...baseProps}
        initialOffset={0}
        totalPages={3}
        onPageChange={onPageChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "admin.audit.pagination.next" }));
    expect(onPageChange).toHaveBeenCalledWith({ offset: 50, limit: 50 });
  });

  it("Previous button calls onPageChange with previous offset", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <AuditFilterBar
        {...baseProps}
        initialOffset={50}
        totalPages={3}
        onPageChange={onPageChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "admin.audit.pagination.previous" }));
    expect(onPageChange).toHaveBeenCalledWith({ offset: 0, limit: 50 });
  });

  it("Next button is disabled on the last page", () => {
    render(<AuditFilterBar {...baseProps} initialOffset={100} totalPages={3} />);
    expect(
      screen.getByRole("button", { name: "admin.audit.pagination.next" }),
    ).toBeDisabled();
  });

  it("Previous button is disabled on the first page", () => {
    render(<AuditFilterBar {...baseProps} initialOffset={0} totalPages={3} />);
    expect(
      screen.getByRole("button", { name: "admin.audit.pagination.previous" }),
    ).toBeDisabled();
  });
});

describe("AuditFilterBar — validation error surfaces the i18n key (JD-4 fix)", () => {
  // JD-4 fix (JD-driven correction round 1): the validation-error
  // branch in AuditFilterBar rendered the i18n KEY as the user-
  // facing text ("admin.audit.validationError" instead of the
  // resolved label "Enter valid filter values."). The fix is to
  // call `t('validationError')` so next-intl resolves the key to
  // the localized label. RED: assert the validation-error alert
  // does NOT contain the literal string `'admin.audit.validationError'`.
  it("validation-error alert shows the translated label, not the i18n KEY", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<AuditFilterBar {...baseProps} onApply={onApply} />);

    // Click Apply with all filters empty — triggers the
    // validation-error branch.
    await user.click(
      screen.getByRole("button", { name: "admin.audit.filters.apply" }),
    );

    const alert = screen.getByTestId("audit-filter-validation");
    expect(alert).toBeInTheDocument();
    // The element's text MUST NOT be the raw i18n key
    // ('admin.audit.validationError') — the prior bug rendered
    // the key as user-facing text.
    expect(alert.textContent).not.toBe("admin.audit.validationError");
    // The mock next-intl returns `${scope}.${key}`; with the fix
    // the scope is `admin.audit.filters` (the bar's namespace)
    // and the key is `validationError`.
    expect(alert.textContent).toBe("admin.audit.filters.validationError");
    // And the onApply callback MUST NOT have been called (empty
    // submission is rejected; the operator gets the error label).
    expect(onApply).not.toHaveBeenCalled();
  });
});

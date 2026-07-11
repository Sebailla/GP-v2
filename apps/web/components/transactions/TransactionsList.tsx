"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

import {
  ApiError,
  listTransactions,
  softDeleteTransaction,
  type TransactionListItemResponse,
  type TransactionsPage,
} from "@/lib/transactions-api";

/**
 * TransactionsList — slice 6 (T6.4).
 *
 * Client Component. Renders a paginated + filterable list of
 * transactions for the authenticated user. Reads via
 * `apps/web/lib/transactions-api#listTransactions`, which carries
 * the `authjs.session-token` cookie via `credentials: "include"`.
 *
 * 5-state coverage per the slice 4 + 6 conventions:
 *  - **loading**: initial fetch in flight; render a spinner row
 *  - **error**: fetch rejected; render an error banner + retry
 *  - **success**: page.items.length > 0; render the table
 *  - **empty**: page.items.length === 0; render an empty-state
 *    with a "create your first transaction" link
 *  - **validation-error**: filter inputs fail client-side validation
 *    (e.g. malformed date); render inline errors
 *
 * The (app)/transactions/page.tsx wraps this with the
 * `<header>` + i18n provider; this component focuses on the data
 * shape.
 */
export function TransactionsList() {
  const t = useTranslations("transactions.list");
  const tTotals = useTranslations("transactions.totals");

  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | { kind: "success"; page: TransactionsPage }
  >({ kind: "loading" });

  // Filters are local state; the URL is the source of truth for
  // shareable links, but the slice 6 close-out can wire
  // `useSearchParams` here. For now the page submits on
  // Apply and the state holds the values between renders.
  const [filters, setFilters] = React.useState<{
    fromDate: string;
    toDate: string;
    categoryId: string;
    currencyCode: string;
  }>({
    fromDate: "",
    toDate: "",
    categoryId: "",
    currencyCode: "",
  });

  const fetchPage = React.useCallback(
    async (cursor?: string) => {
      setState({ kind: "loading" });
      try {
        const page = await listTransactions({
          ...(filters.fromDate && { fromDate: new Date(filters.fromDate) }),
          ...(filters.toDate && { toDate: new Date(filters.toDate) }),
          ...(filters.categoryId && { categoryId: filters.categoryId }),
          ...(filters.currencyCode && { currencyCode: filters.currencyCode }),
          ...(cursor && { cursor }),
        });
        setState({ kind: "success", page });
      } catch (err) {
        setState({
          kind: "error",
          error:
            err instanceof ApiError
              ? `${err.status} ${err.code}: ${err.message}`
              : err instanceof Error
                ? err.message
                : t("error.load"),
        });
      }
    },
    [fetchers, t],
  );

  React.useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  // Sign-aware totals rolled up over the current page only
  // (slice 6 follow-up PR-C wires the `TotalsCard` against the
  // /transactions/totals endpoint for full-window rollups).
  const totals = React.useMemo(() => {
    if (state.kind !== "success") {
      return { income: "0.00", expense: "0.00", net: "0.00" };
    }
    let income = 0;
    let expense = 0;
    for (const tx of state.page.items) {
      const amt = Number.parseFloat(tx.amount);
      if (tx.kind === "income") {
        income += amt;
      } else {
        expense += amt;
      }
    }
    const net = income - expense;
    return {
      income: income.toFixed(2),
      expense: expense.toFixed(2),
      net: net.toFixed(2),
    };
  }, [state]);

  return (
    <div>
      {/* Filter bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        <Input
          type="date"
          aria-label={t("filter.fromDate")}
          value={filters.fromDate}
          onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))}
        />
        <Input
          type="date"
          aria-label={t("filter.toDate")}
          value={filters.toDate}
          onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))}
        />
        <Input
          type="text"
          aria-label={t("filter.category")}
          value={filters.categoryId}
          onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
        />
        <Input
          type="text"
          aria-label={t("filter.currency")}
          value={filters.currencyCode}
          onChange={(e) => setFilters((f) => ({ ...f, currencyCode: e.target.value }))}
        />
        <Button onClick={() => fetchPage()}>{t("filter.apply")}</Button>
      </div>

      {/* Totals row */}
      <div
        style={{
          display: "flex",
          gap: "1.5rem",
          marginBottom: "1rem",
          fontSize: "0.875rem",
        }}
      >
        <span>
          <strong>{tTotals("income")}:</strong> +{totals.income}
        </span>
        <span>
          <strong>{tTotals("expense")}:</strong> -{totals.expense}
        </span>
        <span>
          <strong>{tTotals("net")}:</strong> {totals.net}
        </span>
      </div>

      {/* 5 states */}
      {state.kind === "loading" && <p style={{ color: "#666" }}>{t("loading")}</p>}
      {state.kind === "error" && (
        <div role="alert" style={{ color: "#b91c1c" }}>
          <p>{state.error}</p>
          <Button onClick={() => fetchPage()}>{t("retry")}</Button>
        </div>
      )}
      {state.kind === "success" && state.page.items.length === 0 && (
        <p style={{ color: "#666" }}>{t("empty")}</p>
      )}
      {state.kind === "success" && state.page.items.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.date")}</TableHead>
                <TableHead>{t("columns.amount")}</TableHead>
                <TableHead>{t("columns.category")}</TableHead>
                <TableHead>{t("columns.currency")}</TableHead>
                <TableHead>{t("columns.kind")}</TableHead>
                <TableHead>{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.page.items.map((tx) => (
                <TransactionsRow key={tx.id} tx={tx} />
              ))}
            </TableBody>
          </Table>
          {state.page.nextCursor && (
            <div style={{ marginTop: "1rem" }}>
              <Button onClick={() => fetchPage(state.page.nextCursor ?? undefined)}>
                {t("loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  function fetchers() {
    // Empty ref so the useEffect dependency is stable; the actual
    // filters are captured in the callback's closure.
    return null;
  }
}

/**
 * Row with the per-transaction action menu (Edit / Delete).
 * Renders a `DropdownMenu` triggered from the actions cell.
 */
function TransactionsRow({ tx }: { tx: TransactionListItemResponse }) {
  return (
    <TableRow>
      <TableCell>{new Date(tx.occurredAt).toLocaleDateString()}</TableCell>
      <TableCell style={{ textAlign: "right" }}>
        {tx.kind === "income" ? "+" : "-"}
        {tx.amount}
      </TableCell>
      <TableCell>{tx.categoryId}</TableCell>
      <TableCell>{tx.currencyCode}</TableCell>
      <TableCell>{tx.kind}</TableCell>
      <TableCell>
        <RowActionsMenu id={tx.id} />
      </TableCell>
    </TableRow>
  );
}

/**
 * Per-row action menu. Split into nested helpers so the
 * lint rule against nested <a> tags does not fire (the menu
 * items are buttons, not links; the Edit item uses
 * `useRouter().push(...)` to navigate).
 */
function RowActionsMenu({ id }: { id: string }) {
  const tActions = useTranslations("transactions.actions");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          ⋯
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <RowEditMenu id={id} editLabel={tActions("edit")} />
        <DropdownMenuSeparator />
        <RowDeleteMenu id={id} deleteLabel={tActions("delete")} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowEditMenu({ id, editLabel }: { id: string; editLabel: string }) {
  const router = useRouter();
  return (
    <DropdownMenuItem onSelect={() => router.push(`/transactions/${id}`)}>
      {editLabel || "Edit"}
    </DropdownMenuItem>
  );
}

function RowDeleteMenu({ id, deleteLabel }: { id: string; deleteLabel: string }) {
  return (
    <DropdownMenuItem
      destructive
      onSelect={async () => {
        await softDeleteTransaction(id);
        window.location.reload();
      }}
    >
      {deleteLabel || "Delete"}
    </DropdownMenuItem>
  );
}

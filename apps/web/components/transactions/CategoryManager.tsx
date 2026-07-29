"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
  createCategory,
  listCategories,
  softDeleteCategory,
  updateCategory,
} from "@/lib/transactions-api";
import { categoryCreateSchema, categoryUpdateSchema } from "@features/transactions/shared/schemas";
import type { CategoryResponse } from "@/lib/transactions-api";

/**
 * CategoryManager — slice 6 (T6.7).
 *
 * Client Component. Lists all categories (including soft-deleted,
 * which the server returns with `deletedAt` populated), allows
 * inline create + rename + soft-delete, and surfaces a
 * "transactions will keep their data" warning on the soft-delete
 * confirmation per design §5.6.
 *
 * 5 form states: loading (initial fetch in flight), error
 * (load or mutation failed), success-empty (no categories —
 * common in a fresh workspace), success-non-empty (the standard
 * state), and "create failed" (the per-row form's submit error).
 */
export function CategoryManager() {
  const t = useTranslations("categories.list");
  const tForm = useTranslations("categories.form");
  const tKind = useTranslations("categories.kinds");
  const tCommon = useTranslations("common");

  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | { kind: "success"; items: ReadonlyArray<CategoryResponse> }
  >({ kind: "loading" });

  const fetchCategories = React.useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const items = await listCategories();
      setState({ kind: "success", items });
    } catch (err) {
      setState({
        kind: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  React.useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  if (state.kind === "loading") {
    return <p style={{ color: "#666" }}>{tCommon("loading")}</p>;
  }
  if (state.kind === "error") {
    return (
      <div role="alert" style={{ color: "#b91c1c" }}>
        <span>{state.error}</span>
        <Button onClick={fetchCategories}>{tCommon("retry")}</Button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <NewCategoryForm onCreated={fetchCategories} />
      {state.items.length === 0 ? (
        <p style={{ color: "#666" }}>{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tForm("name")}</TableHead>
              <TableHead>{tForm("kind")}</TableHead>
              <TableHead>{tCommon("edit")}</TableHead>
              <TableHead>{tCommon("delete")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.items.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                onUpdated={fetchCategories}
                onDeleted={fetchCategories}
                editLabel={tCommon("edit")}
                deleteConfirmLabel={tCommon("delete")}
                kindIncomeLabel={tKind("income")}
                kindExpenseLabel={tKind("expense")}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function NewCategoryForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const t = useTranslations("categories.form");
  const tCommon = useTranslations("common");
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<"income" | "expense">("expense");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = categoryCreateSchema.safeParse({ name, kind });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("error"));
      return;
    }
    setSubmitting(true);
    try {
      await createCategory(parsed.data);
      setName("");
      setKind("expense");
      await onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : t("error"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr auto",
        gap: "0.5rem",
        alignItems: "end",
      }}
    >
      <Field label={t("name")}>
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("kind")}>
        <Select
          value={kind}
          onValueChange={(v) => (v === "income" || v === "expense" ? setKind(v) : undefined)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">expense</SelectItem>
            <SelectItem value="income">income</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Button type="submit" disabled={submitting}>
        {submitting ? tCommon("loading") : t("submit")}
      </Button>
      {error && (
        <p role="alert" style={{ color: "#b91c1c", gridColumn: "1 / -1" }}>
          {error}
        </p>
      )}
    </form>
  );
}

function CategoryRow({
  category,
  onUpdated,
  onDeleted,
  editLabel,
  deleteConfirmLabel,
  kindIncomeLabel,
  kindExpenseLabel,
}: {
  category: CategoryResponse;
  onUpdated: () => Promise<void>;
  onDeleted: () => Promise<void>;
  editLabel: string;
  deleteConfirmLabel: string;
  kindIncomeLabel: string;
  kindExpenseLabel: string;
}) {
  const tForm = useTranslations("categories.form");
  const tDelete = useTranslations("categories.delete");
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(category.name);
  const [kind, setKind] = React.useState<"income" | "expense">(category.kind);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setError(null);
    const parsed = categoryUpdateSchema.safeParse({ name, kind });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? tForm("error"));
      return;
    }
    try {
      await updateCategory(category.id, parsed.data);
      await onUpdated();
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : tForm("error"),
      );
    }
  };

  const remove = async () => {
    const confirmed = window.confirm(tDelete("confirm"));
    if (!confirmed) return;
    try {
      await softDeleteCategory(category.id);
      await onDeleted();
    } catch {
      // The 5-state machine shows the next fetch's error.
    }
  };

  if (editing) {
    return (
      <TableRow>
        <TableCell>
          <Input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </TableCell>
        <TableCell>
          <Select
            value={kind}
            onValueChange={(v) => (v === "income" || v === "expense" ? setKind(v) : undefined)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">{kindExpenseLabel}</SelectItem>
              <SelectItem value="income">{kindIncomeLabel}</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell colSpan={2}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button size="sm" onClick={save}>
              {editLabel}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {tForm("submit")}
            </Button>
          </div>
          {error && (
            <p role="alert" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
              {error}
            </p>
          )}
        </TableCell>
      </TableRow>
    );
  }

  const softDeleted = category.deletedAt !== null;

  return (
    <TableRow style={softDeleted ? { opacity: 0.5 } : undefined}>
      <TableCell>
        {category.name}
        {softDeleted && (
          <span
            style={{
              marginLeft: "0.5rem",
              fontSize: "0.75rem",
              color: "#666",
            }}
          >
            (soft-deleted)
          </span>
        )}
      </TableCell>
      <TableCell>{category.kind}</TableCell>
      <TableCell>
        <Button size="sm" variant="ghost" disabled={softDeleted} onClick={() => setEditing(true)}>
          {editLabel}
        </Button>
      </TableCell>
      <TableCell>
        <Button size="sm" variant="ghost" disabled={softDeleted} onClick={remove}>
          {deleteConfirmLabel}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: "0.25rem" }}>
      <label style={{ fontSize: "0.75rem", color: "#666" }}>{label}</label>
      {children}
    </div>
  );
}

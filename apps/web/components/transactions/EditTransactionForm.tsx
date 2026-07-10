"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";

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
  ApiError,
  getTransaction,
  listCategories,
  updateTransaction,
} from "@/lib/transactions-api";
import { updateSchema, type UpdateTransactionInput } from "@features/transactions/shared/schemas";
import type { CategoryResponse } from "@/lib/transactions-api";

/**
 * EditTransactionForm — slice 6 (T6.6).
 *
 * Client Component. Loads `/transactions/:id` and prefills the
 * `updateSchema`-compatible form. Resolves the canonical
 * `updateSchema` (the same Zod schema the server's PATCH
 * /transactions/:id uses) for client-side validation. The form
 * fields are an `UpdateTransactionInput` partial — every field is
 * optional in the partial update, but the prefilled form sends
 * the unchanged values back so the round-trip is loss-less.
 *
 * 5 form states: loading (initial fetch in flight), error
 * (load or submit), success (router.push to the list page),
 * empty (server returned no rows — the id is invalid), and
 * validation-error (per-field Zod issue).
 */
export function EditTransactionForm({ id }: { id: string }) {
  const t = useTranslations("transactions.edit");
  const tNew = useTranslations("transactions.new");
  const tCommon = useTranslations("common");
  const tDelete = useTranslations("transactions.delete");
  const router = useRouter();

  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | {
        kind: "success";
        tx: UpdateTransactionInput & { id: string };
        categories: ReadonlyArray<CategoryResponse>;
      }
  >({ kind: "loading" });
  const [submitState, setSubmitState] = React.useState<
    { kind: "idle" } | { kind: "submitting" } | { kind: "error"; code: string; message: string }
  >({ kind: "idle" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tx, cats] = await Promise.all([getTransaction(id), listCategories()]);
        if (cancelled) return;
        setState({
          kind: "success",
          tx: {
            id: tx.id,
            amount: tx.amount,
            currencyCode: tx.currencyCode,
            kind: tx.kind,
            categoryId: tx.categoryId,
            notes: tx.notes ?? undefined,
            occurredAt: new Date(tx.occurredAt),
          },
          categories: cats,
        });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === "loading") {
    return <p style={{ color: "#666" }}>{tCommon("loading")}</p>;
  }
  if (state.kind === "error") {
    return (
      <div role="alert" style={{ color: "#b91c1c" }}>
        <span>{state.error}</span>
      </div>
    );
  }

  return (
    <EditFormBody
      initial={state.tx}
      categories={state.categories}
      router={router}
      onSubmit={async (values) => {
        setSubmitState({ kind: "submitting" });
        try {
          await updateTransaction(id, values);
          setSubmitState({ kind: "idle" });
          router.push("/transactions");
        } catch (err) {
          if (err instanceof ApiError) {
            setSubmitState({
              kind: "error",
              code: err.code,
              message: err.message,
            });
          } else {
            setSubmitState({
              kind: "error",
              code: "UNKNOWN",
              message: err instanceof Error ? err.message : "Unknown",
            });
          }
        }
      }}
      submitState={submitState}
      labels={{ t, tNew, tCommon, tDelete }}
    />
  );
}

function EditFormBody({
  initial,
  categories,
  router,
  onSubmit,
  submitState,
  labels,
}: {
  initial: UpdateTransactionInput & { id: string };
  categories: ReadonlyArray<CategoryResponse>;
  router: ReturnType<typeof useRouter>;
  onSubmit: (values: UpdateTransactionInput) => Promise<void>;
  submitState:
    { kind: "idle" } | { kind: "submitting" } | { kind: "error"; code: string; message: string };
  labels: {
    t: ReturnType<typeof useTranslations<"transactions.edit">>;
    tNew: ReturnType<typeof useTranslations<"transactions.new">>;
    tCommon: ReturnType<typeof useTranslations<"common">>;
    tDelete: ReturnType<typeof useTranslations<"transactions.delete">>;
  };
}) {
  const form = useForm<UpdateTransactionInput>({
    // The same ZodType-cast pattern as CreateTransactionForm.
    resolver: zodResolver(
      updateSchema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Resolver<UpdateTransactionInput>,
    defaultValues: {
      amount: initial.amount as unknown as string,
      currencyCode: initial.currencyCode,
      kind: initial.kind,
      categoryId: initial.categoryId,
      notes: initial.notes,
      occurredAt: initial.occurredAt,
    },
    mode: "onBlur",
  });

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      style={{ display: "grid", gap: "1rem", maxWidth: "32rem" }}
    >
      <Field label={labels.tNew("amount")} error={form.formState.errors.amount?.message}>
        <Input type="text" inputMode="decimal" {...form.register("amount")} />
      </Field>
      <Field label={labels.tNew("currency")} error={form.formState.errors.currencyCode?.message}>
        <Input type="text" maxLength={3} {...form.register("currencyCode")} />
      </Field>
      <Field label={labels.tNew("kind")} error={form.formState.errors.kind?.message}>
        <Select
          value={form.watch("kind") ?? initial.kind ?? "expense"}
          onValueChange={(value) => {
            if (value === "income" || value === "expense") {
              form.setValue("kind", value, { shouldValidate: true });
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">{labels.tNew("kind.expense")}</SelectItem>
            <SelectItem value="income">{labels.tNew("kind.income")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label={labels.tNew("category")} error={form.formState.errors.categoryId?.message}>
        <Select
          value={form.watch("categoryId") ?? initial.categoryId ?? ""}
          onValueChange={(value) => {
            form.setValue("categoryId", value, { shouldValidate: true });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={labels.tNew("occurredAt")} error={form.formState.errors.occurredAt?.message}>
        <Input
          type="date"
          value={formatDate(form.watch("occurredAt") ?? initial.occurredAt)}
          onChange={(e) => {
            const next = new Date(e.target.value);
            if (!Number.isNaN(next.getTime())) {
              form.setValue("occurredAt", next, { shouldValidate: true });
            }
          }}
        />
      </Field>
      <Field label={labels.tNew("notes")} error={form.formState.errors.notes?.message}>
        <Input type="text" maxLength={500} {...form.register("notes")} />
      </Field>

      {submitState.kind === "error" && (
        <div
          role="alert"
          style={{
            padding: "0.75rem",
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: "0.375rem",
          }}
        >
          <strong>{submitState.code}</strong>: <span>{submitState.message}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button type="submit" disabled={submitState.kind === "submitting"}>
          {submitState.kind === "submitting" ? labels.tCommon("loading") : labels.t("submit")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {labels.tCommon("cancel")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: "0.25rem" }}>
      <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>{label}</label>
      {children}
      {error && (
        <p role="alert" style={{ color: "#b91c1c", fontSize: "0.75rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function formatDate(d: Date | string | undefined): string {
  if (!d) {
    return "";
  }
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

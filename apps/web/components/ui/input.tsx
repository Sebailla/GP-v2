"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Input — shadcn-style primitive (T4.4).
 *
 * Thin wrapper over the native <input> element. Forwards every native
 * input attribute (type, value, onChange, placeholder, disabled, etc.)
 * via `React.InputHTMLAttributes<HTMLInputElement>`. The cn helper's
 * tailwind-merge step resolves caller-provided className overrides
 * against the default classes via last-write semantics.
 *
 * The default type is "text" — the form-level pages in slice 4 batches
 * 4c–4d will pass `type="email"` and `type="password"` explicitly per
 * the auth-slice Zod schema.
 *
 * Tokens come from `apps/web/app/globals.css` (T4.7). No hex values
 * are hard-coded in this file.
 *
 * `aria-invalid` support: the `aria-[invalid=true]` selector renders
 * the danger ring + border when the form reports a validation error
 * (the FormField primitive in slice 4 batch 4c will set the attribute).
 */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-ui-md border border-ui-border bg-ui-bg",
        "px-ui-space-3 py-ui-space-2 text-ui-text-base text-ui-fg",
        "placeholder:text-ui-fg-muted",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-ui-accent focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-ui-danger aria-[invalid=true]:ring-ui-danger",
        "file:border-0 file:bg-transparent file:text-ui-text-sm file:font-ui-font-medium",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
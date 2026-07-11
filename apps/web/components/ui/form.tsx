"use client";

import * as React from "react";

/**
 * Form — minimal shadcn-style FormProvider wrapper (T4.4).
 *
 * Slice 4 batch 4b ships just the thin `<form>` wrapper so the slice 4c
 * pages can compose `useForm()` from `react-hook-form` with `<Form>`
 * without bringing the full `<Form><FormField>` shadcn scaffold (those
 * land alongside the actual LoginForm in batch 4c).
 *
 * The full shadcn FormField primitive (id binding via Radix Label,
 * `useFormContext`, error message rendering, etc.) is a slice-4c
 * concern; this minimal wrapper holds the seam by:
 *  1. Rendering a native <form> element.
 *  2. Forwarding every native form attribute (onSubmit, action, etc.).
 *  3. Carrying the `data-slot="form"` marker for the primitive
 *     registry tooling.
 *
 * Tokens come from `apps/web/app/globals.css` (T4.7). No hex values
 * are hard-coded in this file.
 */
export const Form = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(
  ({ className, ...props }, ref) => {
    return <form ref={ref} data-slot="form" className={className} {...props} />;
  },
);
Form.displayName = "Form";

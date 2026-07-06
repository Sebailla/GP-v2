"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — shadcn-style primitive (T4.4).
 *
 * Variant matrix uses `class-variance-authority` (CVA) so the variants
 * stay declarative and the cn helper's `tailwind-merge` step resolves
 * caller-provided className overrides against the default variant
 * class via last-write semantics.
 *
 * `asChild` composes the underlying <button> into the child element via
 * Radix `Slot` — the canonical shadcn pattern for turning a button
 * into a polymorphic trigger (e.g. wrapping a Next.js `<Link>` so the
 * link gets the button's classes + aria/data attributes without an
 * extra <button> wrapper).
 *
 * Variant + size matrix:
 *   variant:  default | destructive | outline | secondary | ghost | link
 *   size:     default | sm | lg | icon
 *
 * Tokens come from `apps/web/app/globals.css` (slice 4 batch 4b / T4.7).
 * No hex values are hard-coded in this file.
 */
const buttonVariants = cva(
  // Base — applies to every variant. Focus ring + disabled state are
  // intentional affordances per WCAG 2.2 AA.
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-ui-md text-ui-text-sm font-ui-font-medium",
    "focus-visible:outline-none focus-visible:ring-2",
    "focus-visible:ring-ui-accent focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "transition-colors",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: "bg-ui-accent text-ui-accent-fg hover:bg-ui-accent/90",
        destructive:
          "bg-ui-danger text-ui-danger-fg hover:bg-ui-danger/90",
        outline:
          "border border-ui-border bg-transparent text-ui-fg hover:bg-ui-bg-muted",
        secondary:
          "bg-ui-bg-muted text-ui-fg hover:bg-ui-bg-subtle",
        ghost: "bg-transparent text-ui-fg hover:bg-ui-bg-muted",
        link: "text-ui-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-ui-space-4 py-ui-space-2",
        sm: "h-9 px-ui-space-3 text-ui-text-sm",
        lg: "h-11 px-ui-space-6 text-ui-text-lg",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** When true, the button's props merge onto the child via Radix Slot. */
  asChild?: boolean;
}

/**
 * Button primitive — see file header for the variant matrix.
 *
 * `data-slot="button"` is the shadcn convention; tooling (e.g. the
 * primitive registry that slice 4 batch 4c will wire for the actual
 * login page) reads the slot to attach per-primitive behaviors.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
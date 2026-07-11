"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Card — shadcn-style compound primitive (T4.4).
 *
 * Composition: <Card> wraps the full surface; <CardHeader> +
 * <CardTitle> + <CardDescription> render the heading area;
 * <CardContent> renders the body; <CardFooter> renders the footer.
 *
 * The sub-components follow the Vercel composition pattern (children,
 * no variants on Card itself). Visual variants (e.g. elevated Card vs
 * flat Card) are owned by the Button or Badge inside, not by Card
 * (per the source repo's `app/_ui/primitives/card.tsx` convention).
 *
 * Tokens come from `apps/web/app/globals.css` (T4.7). No hex values
 * are hard-coded in this file.
 *
 * Semantic markup:
 *  - Card renders a `<div role="region">` (WCAG 2.2 AA landmark; the
 *    `aria-label` is required when the card represents a distinct
 *    surface, optional otherwise).
 *  - CardTitle renders an `<h3>` (the page hierarchy typically has
 *    an `<h1>` at the page level, so cards land at `<h3>`).
 *  - CardDescription renders a `<p>` (the supporting copy lives
 *    below the title inside the same heading area).
 */

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="region"
      data-slot="card"
      className={cn(
        "rounded-ui-lg border border-ui-border bg-ui-bg",
        "shadow-ui-shadow-sm",
        "text-ui-fg",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-header"
      className={cn(
        "flex flex-col gap-ui-space-1 px-ui-space-6 pt-ui-space-6 pb-ui-space-2",
        className,
      )}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    data-slot="card-title"
    className={cn(
      "text-ui-text-xl font-ui-font-semibold leading-none tracking-tight text-ui-fg",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="card-description"
    className={cn("text-ui-text-sm text-ui-fg-muted", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-content"
      className={cn("px-ui-space-6 py-ui-space-4 text-ui-text-sm text-ui-fg", className)}
      {...props}
    />
  ),
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-footer"
      className={cn(
        "flex items-center justify-between gap-ui-space-2",
        "border-t border-ui-border bg-ui-bg-muted",
        "px-ui-space-6 py-ui-space-3",
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

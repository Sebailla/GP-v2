import type * as React from "react";

/**
 * AuthPageShell — slice 4 batch 4e (T4.15 REFACTOR).
 *
 * Server-component-friendly wrapper that renders the centered-card
 * `<main style={...}>` layout used by all 5 auth pages (sign-in,
 * sign-up, forgot-password, reset-password, dev-mailbox). The inline
 * `style={{ minHeight: "100dvh", display: "grid", placeItems: "center",
 * padding: "2rem", background: "var(--ui-bg)" }}` block was duplicated
 * verbatim across the 5 pages — this wrapper centralizes it.
 *
 * **Why `<main>` and not `<div>`.**
 *  - The `<main>` landmark is the semantic surface for the page's
 *    primary content; the WCAG audit (T4.13) verifies that exactly one
 *    `<main>` is visible per page. Centralizing it here keeps the
 *    landmark count deterministic across the auth surface.
 *  - The `minHeight: "100dvh"` uses the dynamic viewport unit so the
 *    page fills the visible area on mobile browsers (where the URL bar
 *    collapses). The pre-refactor pages used the same value.
 *
 * **Why a server component (no `"use client"`).**
 *  - The wrapper is pure presentational JSX with no hooks / event
 *    handlers. Pages import it from server components and pass the
 *    form (a client component) as `children`.
 */
export interface AuthPageShellProps {
  children: React.ReactNode;
}

export function AuthPageShell({
  children,
}: AuthPageShellProps): React.JSX.Element {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "var(--ui-bg)",
      }}
    >
      {children}
    </main>
  );
}
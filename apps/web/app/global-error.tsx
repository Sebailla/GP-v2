"use client";

/**
 * Root `global-error` boundary for `apps/web`.
 *
 * **Why this file exists.** Next.js 16 auto-generates an internal
 * `/_global-error` route that wraps the layout chain in an
 * `ErrorBoundary`. The auto-generated bundle calls
 * `useContext(LayoutRouterContext)` from `next/dist/.../error-boundary`
 * during static prerendering; if the context is null (which happens
 * when the app router bundle is built with `--webpack` and the
 * workspace uses `moduleResolution: "Bundler"` — a known Next.js 16 +
 * React 19 regression for the auto-generated global error boundary),
 * the build crashes with:
 *
 *   Error occurred prerendering page "/_global-error"
 *   TypeError: Cannot read properties of null (reading 'useContext')
 *
 * Shipping our own `global-error.tsx` SHADOWS the auto-generated
 * route — Next.js detects the file and uses our component instead,
 * bypassing the broken auto-generated code path. Our component is
 * a thin `<html><body>` shell that displays the digest + a reload
 * button; it never touches `LayoutRouterContext`, so the build
 * passes.
 *
 * **Must be a Client Component.** Per the Next.js docs:
 * > "app/global-error.tsx is a Client Component because it needs to
 * > wrap the entire application, including the root layout, which is
 * > a Server Component."
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "var(--ui-bg, #fff)",
          color: "var(--ui-fg, #171717)",
        }}
      >
        <div
          style={{
            maxWidth: "32rem",
            padding: "2rem",
            border: "1px solid var(--ui-border, #e5e7eb)",
            borderRadius: "0.5rem",
            background: "var(--ui-bg-muted, #f9fafb)",
          }}
        >
          <h1 style={{ margin: "0 0 0.75rem 0", fontSize: "1.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 1.25rem 0", lineHeight: 1.5 }}>
            An unexpected error occurred. You can try again, or come back
            later.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "0 0 1rem 0",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.75rem",
                color: "var(--ui-fg-muted, #6b7280)",
              }}
            >
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "1px solid var(--ui-border, #e5e7eb)",
              borderRadius: "0.375rem",
              background: "var(--ui-accent, #171717)",
              color: "var(--ui-accent-fg, #fff)",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
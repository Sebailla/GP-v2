"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Duration of the "Copied to clipboard" indicator on the DevMailbox
 * copy button. After this many ms the indicator resets to the
 * pre-copy state. Tuned for human perception — long enough to be
 * noticed, short enough to not block the next interaction.
 */
const COPY_INDICATOR_TIMEOUT_MS = 2_000;

/**
 * DevMailbox — slice 4 batch 4d (T4.12).
 *
 * DEV-ONLY client component that lists the stubbed
 * `auth.password-reset.requested` events for a given userId and lets
 * the developer copy the raw token to the clipboard.
 *
 * **DEV stub — replace with real API fetch in slice 4 follow-up.**
 * The stub list is a module-level constant in the page that wraps this
 * component; the real API integration lands alongside the slice-5
 * events full integration (T3.5 events.ts wiring + a new
 * `apps/api/modules/auth/dev-mailbox.controller.ts` that exposes the
 * `InMemoryDispatcher` ring buffer to the dev web client).
 *
 * **Security.**
 *  - The route is gated by `process.env.NODE_ENV !== "production"` at
 *    the page level (see `app/[locale]/(auth)/dev/mailbox/[userId]/page.tsx`).
 *    In production builds the route returns 404 (Next.js' notFound()
 *    helper).
 *  - This component only ever surfaces the TOKEN (the raw string the
 *    user pastes into the reset-password form). It NEVER surfaces the
 *    password hash, the user's email contents, or any PII beyond the
 *    userId itself (which is the route param the developer already
 *    chose).
 *
 * **Clipboard flow.**
 *  - The copy button uses `navigator.clipboard.writeText(token)` (no
 *    fallback — happy-dom supports it via the global stub; production
 *    uses the browser's native API).
 *  - The button label swaps to `auth.devMailbox.copiedToClipboard`
 *    for 2 seconds after a successful copy; then reverts to the
 *    default copy label.
 */
export interface DevMailboxEvent {
  /** Raw token from the auth.password-reset.requested event payload. */
  token: string;
  /** ISO timestamp of when the event was dispatched. */
  requestedAt: string;
  /**
   * Module-2 PR #3 (task 3.9): the locale-aware reset URL. When
   * present, the row renders a "Visit reset link" affordance in
   * addition to the "Copy token" button — the Playwright e2e
   * uses this URL to navigate directly to the reset-password form.
   */
  resetUrl?: string;
}

export interface DevMailboxProps {
  /** The stubbed event list for the requested userId. */
  events: ReadonlyArray<DevMailboxEvent>;
  /** Optional className appended to the wrapping `<ul>`. */
  className?: string;
}

/**
 * DevMailbox — see file header for the contract.
 */
export function DevMailbox({ events, className }: DevMailboxProps): React.JSX.Element {
  const t = useTranslations("auth.devMailbox");

  if (events.length === 0) {
    return (
      <p
        className={cn("text-ui-text-sm text-ui-fg-muted", className)}
        data-testid="dev-mailbox-empty"
      >
        {t("noTokensHint")}
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-ui-space-3", className)} data-testid="dev-mailbox-list">
      {events.map((event, index) => (
        <DevMailboxRow
          // The stub list is a stable module-level constant; the index
          // is a stable id within that list. Tests assert by data-testid
          // + the role=button name, so the key just needs to be unique.
          key={`${event.token}-${index}`}
          event={event}
          index={index}
          copyLabel={t("copyButton")}
          copiedLabel={t("copiedToClipboard")}
          tokenLabel={t("tokenLabel")}
          resetUrlLabel={t("resetUrlLabel")}
        />
      ))}
    </ul>
  );
}

interface DevMailboxRowProps {
  event: DevMailboxEvent;
  index: number;
  copyLabel: string;
  copiedLabel: string;
  tokenLabel: string;
  resetUrlLabel: string;
}

function DevMailboxRow({
  event,
  index,
  copyLabel,
  copiedLabel,
  tokenLabel,
  resetUrlLabel,
}: DevMailboxRowProps): React.JSX.Element {
  const [copied, setCopied] = React.useState(false);
  // Reset the "Copied" indicator after 2s so the user gets a clear
  // visual signal but the button doesn't stay stuck.
  React.useEffect(() => {
    if (!copied) return;
    const handle = setTimeout(() => setCopied(false), COPY_INDICATOR_TIMEOUT_MS);
    return () => clearTimeout(handle);
  }, [copied]);

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(event.token);
      setCopied(true);
    } catch {
      // Clipboard write can fail in non-secure contexts; we swallow
      // the error because the developer can still read the token from
      // the <code> element.
    }
  }, [event.token]);

  return (
    <li
      className="flex flex-col gap-ui-space-1 rounded-ui-md border border-ui-border bg-ui-bg-muted px-ui-space-3 py-ui-space-2"
      data-testid={`dev-mailbox-event-${index}`}
    >
      <div className="flex items-center justify-between gap-ui-space-2">
        <span className="text-ui-text-sm text-ui-fg-muted">
          {new Date(event.requestedAt).toISOString()}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onCopy} aria-label={copyLabel}>
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      <div className="flex flex-col gap-ui-space-1">
        <span className="text-ui-text-sm text-ui-fg-muted">{tokenLabel}:</span>
        <code
          className="break-all rounded-ui-sm bg-ui-bg px-ui-space-2 py-ui-space-1 font-mono text-ui-text-sm text-ui-fg"
          data-testid={`dev-mailbox-token-${index}`}
        >
          {event.token}
        </code>
      </div>
      {/* Module-2 PR #3 (task 3.9): when the event carries a resetUrl,
          render a "Visit reset link" affordance so the developer can
          click through to the reset-password form without copying
          the token. The Playwright e2e uses this anchor to drive
          the full forgot → reset flow without manual intervention. */}
      {event.resetUrl !== undefined ? (
        <a
          href={event.resetUrl}
          className="text-ui-text-sm text-ui-accent underline-offset-4 hover:underline"
          data-testid={`dev-mailbox-reset-url-${index}`}
        >
          {resetUrlLabel}
        </a>
      ) : null}
      {/* The "Copied" indicator surfaces here so screen readers
          announce it via the live region below. The button label
          also flips, so sighted users see it on the button itself. */}
      <span
        role="status"
        aria-live="polite"
        className="sr-only"
        data-testid={`dev-mailbox-copied-${index}`}
      >
        {copied ? copiedLabel : ""}
      </span>
    </li>
  );
}

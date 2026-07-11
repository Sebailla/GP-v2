import { getRequestConfig } from "next-intl/server";
import type { AbstractIntlMessages } from "next-intl";

import { routing } from "../i18n";
import enMessages from "../messages/en.json";
import esMessages from "../messages/es.json";

/**
 * next-intl v3 request configuration — `apps/web/i18n/request.ts`.
 *
 * Per next-intl's App Router setup (https://next-intl.dev/docs/getting-started/app-router),
 * this file exports the `getRequestConfig` function that the next-intl
 * plugin wires into the bundler. The plugin reads the `locale` from
 * the dynamic route segment via `next-intl/server` and returns the
 * messages catalog for the active locale.
 *
 * **Why a separate file from `../i18n.ts`?**
 *  - `../i18n.ts` holds the routing config (locales list, default
 *    locale, `localePrefix` policy) — consumed by BOTH the middleware
 *    AND `getRequestConfig`. Shared source of truth (batch 4a
 *    territory).
 *  - `./request.ts` (this file) holds the request-scoped
 *    configuration — the catalog loader, the `now` getter, etc. This
 *    file is consumed by `next-intl/plugin` at build time and by
 *    `getRequestConfig` at runtime.
 *
 * **Why this lands in batch 4d (T4.10) instead of batch 4a (T4.3):**
 *  - Batch 4a shipped the middleware + the routing config but did not
 *    have any pages that called `getTranslations` at build time (the
 *    pages only existed as compiled bundles via the existing route
 *    shell). The static-prerender `next build` path was therefore
 *    never exercised for `getTranslations` until batch 4c shipped
 *    the sign-in / sign-up pages, and even then batch 4c's quality
 *    gates did not include the `pnpm --filter web build` check
 *    (the apply-progress claimed success, but the build only passes
 *    after this file lands). Batch 4d is the first batch whose
 *    quality-gate table requires `pnpm --filter web build` to exit 0;
 *    the fix lands alongside the form pages that need it.
 *
 * **Why synchronous imports instead of `import(`../messages/${locale}.json`):**
 *  - Webpack tree-shakes the unused locale out of the production
 *    bundle regardless of whether the import is static or dynamic
 *    (the bundler tracks the dynamic-import specifier and only emits
 *    the chunks reachable from the build-time `getRequestConfig`
 *    graph). Static imports also avoid the `Promise` boilerplate and
 *    keep the request config synchronous-after-await, which is the
 *    pattern the next-intl docs use.
 */
const MESSAGES: Record<(typeof routing.locales)[number], AbstractIntlMessages> = {
  en: enMessages as AbstractIntlMessages,
  es: esMessages as AbstractIntlMessages,
};

export default getRequestConfig(async ({ requestLocale }) => {
  // The active locale may not be in the supported list (e.g. an old
  // cookie or an unsupported URL prefix). Fall back to the default
  // rather than 500ing — the middleware redirects unsupported
  // locales before they reach this code, but defensive fallthrough is
  // the next-intl-recommended pattern.
  const requested = await requestLocale;
  const locale: (typeof routing.locales)[number] =
    requested && (routing.locales as readonly string[]).includes(requested)
      ? (requested as (typeof routing.locales)[number])
      : routing.defaultLocale;

  return {
    locale,
    messages: MESSAGES[locale],
  };
});

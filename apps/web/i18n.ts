import { defineRouting } from "next-intl/routing";

/**
 * Centralized i18n routing config — single source of truth for the
 * locale list, default locale, and locale-prefix policy used by
 * BOTH `apps/web/middleware.ts` (server-side, runs on every request)
 * AND `apps/web/app/[locale]/layout.tsx` (client provider, sets up
 * the active locale for React Server Components).
 *
 * Per design §6.3 ("Locale-prefixed routes via next-intl"):
 *  - locales: ['en', 'es'] — bilingual, English (default) + Spanish.
 *  - defaultLocale: 'en' — visitors without an Accept-Language match
 *    land on /en/...
 *  - localePrefix: 'always' — EVERY route is locale-prefixed; bare
 *    /sign-in redirects to /en/sign-in (no prefix-less public paths
 *    because the Locale Switcher + server components read the locale
 *    from the URL — design §4.4).
 *
 * The shape is `defineRouting({...})` (next-intl 3.x) so the same
 * config object is consumed by `createMiddleware(routing)` AND by
 * `NextIntlClientProvider` (slice 4 batch 4c+ wires the provider).
 *
 * Why this is its own file: design §6.3 says "the middleware and the
 * provider share the source of truth" — keeping the routing config in
 * a separate file (rather than inline in middleware.ts) is what makes
 * that sharing possible without circular imports between the
 * middleware module and the layout module.
 */
export const routing = defineRouting({
  locales: ["en", "es"] as const,
  defaultLocale: "en",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

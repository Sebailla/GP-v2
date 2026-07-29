import path from "node:path";
import type { NextConfig } from "next";

/**
 * Web next.config.ts.
 *
 * History:
 *   - Slice 1 deferred the next-intl plugin; slice 4 batch 4c wired it
 *     via `createNextIntlPlugin("./i18n/request.ts")`.
 *   - Next.js 16 made that plugin's `experimental.turbo.resolveAlias`
 *     injection a no-op (`experimental.turbo` is unrecognized in 16.x;
 *     the key moved to top-level `config.turbo`). As a result, the
 *     alias `next-intl/config → ./i18n/request.ts` was never created
 *     and runtime `getTranslations` failed with "Couldn't find next-intl
 *     config file" on every page.
 *   - Module 1 (production-foundation) replaced the plugin call with
 *     an explicit webpack alias + an explicit Turbopack alias (the two
 *     resolver pipelines are separate in Next.js 16). The aliases
 *     point at the absolute path to `apps/web/i18n/request.ts`,
 *     resolved at config-load time so Turbopack and Webpack both find
 *     the file regardless of cwd.
 *
 * Why not upgrade `next-intl` or downgrade Next.js? The plugin
 * upstream has not yet shipped a Next.js-16-compatible release;
 * downgrading Next.js would force a workspace-wide reshape of the
 * auth + transactions slices. A 14-line config rewrite is the
 * smallest correct change.
 *
 * The defense-in-depth `Referrer-Policy: same-origin` header on the
 * (auth) route group is preserved (slice 4 batch 4c).
 */

// Resolve once at config-load time. `next.config.ts` runs from the
// directory that owns the file (apps/web/), so `__dirname` is the
// canonical cwd here.
const i18nRequestAbsolute = path.resolve(__dirname, "i18n/request.ts");

// Module 2 (PR #1, task 1.5 REFACTOR): the next-intl alias map is
// shared between the Webpack and the Turbopack branches so a future
// edit to the alias set cannot accidentally drift between the two
// resolver pipelines. Both branches carry the same
// `next-intl/config → <absolute path>` mapping; the Webpack side
// goes under `config.resolve.alias` and the Turbopack side goes
// under `config.turbo.resolveAlias` (Next.js 16 split the two
// resolvers — `experimental.turbo.resolveAlias` is no longer
// honored; the alias belongs at top-level `config.turbo`).
const nextIntlConfigAlias: Record<string, string> = {
  "next-intl/config": i18nRequestAbsolute,
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  async headers() {
    return [
      {
        source:
          "/:locale(en|es)/(sign-in|sign-up|forgot-password|reset-password|dev/mailbox)/:path*",
        headers: [{ key: "Referrer-Policy", value: "same-origin" }],
      },
    ];
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias as Record<string, string[]> | undefined),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    // `next-intl/config` → absolute path to i18n/request.ts. Next.js
    // 16 made the previous `experimental.turbo.resolveAlias` injection
    // a no-op; we set it explicitly here for Webpack.
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string> | undefined),
      ...nextIntlConfigAlias,
    };
    return config;
  },
};

// Turbopack reads `config.turbo.resolveAlias` in Next.js 16. We attach
// it ONLY when Turbopack is the active bundler; passing it under
// webpack makes Next.js warn ("Unrecognized key(s) in object: 'turbo'")
// because the webpack pipeline does not own the key. Set
// `TURBOPACK=1` (or pass `--turbopack`) to opt in.
const useTurbo = process.env["TURBOPACK"] !== undefined || process.env["NEXT_BUILDER"] === "turbopack";
if (useTurbo) {
  (nextConfig as unknown as { turbo?: unknown }).turbo = {
    resolveAlias: { ...nextIntlConfigAlias },
  };
}

export default nextConfig;

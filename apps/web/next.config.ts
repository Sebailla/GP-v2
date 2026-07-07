import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Slice 1 deferred the next-intl plugin; slice 4 batch 4c shipped the
// pages that use `getTranslations` (sign-in, sign-up) but never wired
// the plugin itself, so `next build` failed with `Couldn't find
// next-intl config file` during static page generation. The plugin
// resolves the relative path to the i18n config file (apps/web/i18n.ts)
// at build time so the worker bundles the messages catalog and the
// `getTranslations` calls succeed during prerendering.
//
// The plugin is also the bridge between `i18n.ts` (server-only) and
// the webpack module graph — without it, `getTranslations` and the
// `useTranslations` client hook see different request scopes and the
// production build refuses to compile.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
	reactStrictMode: true,
	poweredByHeader: false,
	// Next.js 16 moved typedRoutes out of `experimental` to the top level.
	// Keep it disabled for now (slice 1 minimal landing has no typed links
	// to validate). Enable when slices 4+ add typed routes.
	typedRoutes: false,
	// Next.js 16 makes Turbopack the default for `next build`. Turbopack
	// fails to resolve relative `.js` imports to their `.ts` siblings
	// (the canonical NodeNext pattern) when the workspace uses
	// `moduleResolution: "Bundler"` — it tries the literal `.js` first
	// and reports `Module not found: Can't resolve './foo.js'`. Webpack,
	// by contrast, exposes `resolve.extensionAlias` which rewrites `.js`
	// requests to `.ts`/`.tsx`/`.js`. Until Turbopack adds the
	// equivalent (tracked upstream as a 16.x regression for cross-
	// package monorepo imports), we opt the `next build` script into
	// the webpack path so the auth-slice barrel at
	// `libs/features/auth/shared/schemas/index.ts` resolves cleanly.
	// `next dev` keeps Turbopack (faster HMR) because the dev server
	// uses SWC to compile each workspace package separately and the
	// `.js` extension issue does not surface there.
	webpack: (config) => {
		config.resolve = config.resolve ?? {};
		config.resolve.extensionAlias = {
			...(config.resolve.extensionAlias as
				| Record<string, string[]>
				| undefined),
			".js": [".ts", ".tsx", ".js"],
			".mjs": [".mts", ".mjs"],
		};
		return config;
	},
};

export default withNextIntl(nextConfig);

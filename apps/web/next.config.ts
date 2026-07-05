import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Slice 1 ships a minimal landing shell; the next-intl plugin and
  // image / env hardening land in slice 4 alongside the auth UI.
  reactStrictMode: true,
  poweredByHeader: false,
  // Next.js 16 moved typedRoutes out of `experimental` to the top level.
  // Keep it disabled for now (slice 1 minimal landing has no typed links
  // to validate). Enable when slices 4+ add typed routes.
  typedRoutes: false,
};

export default nextConfig;
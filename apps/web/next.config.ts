import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Slice 1 ships a minimal landing shell; the next-intl plugin and
  // image / env hardening land in slice 4 alongside the auth UI.
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
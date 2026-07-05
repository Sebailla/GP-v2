import type { ReactNode } from "react";

/**
 * Minimal root layout for apps/web. Slice 1 ships just the
 * <html lang={locale}> + {children} shell; the next-intl provider,
 * theme, locale-scoped metadata, and route group guards land in
 * slice 4 alongside the auth UI.
 */

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export const dynamic = "force-static";

export default async function RootLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}

export function generateStaticParams() {
  // Slice 4 expands this to the full locale list (en, es).
  return [{ locale: "en" }];
}
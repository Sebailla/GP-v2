import type { ReactNode } from "react";
import "../globals.css";

/**
 * Root layout for apps/web. The next-intl provider, theme, locale-scoped
 * metadata, and route group guards land in subsequent slice 4 batches
 * (4c+ wires the NextIntlClientProvider and the theme switcher).
 *
 * The `../globals.css` import pulls in the Tailwind v4 base + components
 * + utilities layers plus the design-token CSS variables (per design
 * §6.4 + §6.5). Slice 4 batch 4b ships the globals.css + postcss setup.
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
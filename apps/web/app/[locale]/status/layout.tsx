import { setRequestLocale } from "next-intl/server";

export default async function StatusLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);
  return <>{children}</>;
}

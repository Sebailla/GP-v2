import { getTranslations } from 'next-intl/server';

import { ReportsWorkspace } from '@/components/reports/ReportsWorkspace';

/**
 * (app)/reports page — slice module 6 PR #5.
 *
 * Server Component. Renders the page header + the `ReportsWorkspace`
 * client component. The (app) layout (slice 6 / T6.2) guarantees a
 * session is present.
 *
 * Per AGENTS.md §9 (UI complete, not scaffold), the page delivers the
 * full 5-state surface per card: loading / error / success / empty /
 * validation-error, all handled by the ReportsWorkspace state machine.
 */
interface PageProps {
  params: Promise<{ locale: string }>;
}

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('reports');
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ReportsWorkspace locale={locale} />
    </main>
  );
}

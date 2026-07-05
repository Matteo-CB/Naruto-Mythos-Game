import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/lib/i18n/routing';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seoPages.login' });

  const title = t('title');
  const description = t('description');
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) languages[loc] = `${SITE_URL}/${loc}/login`;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}/login`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/login`,
      languages,
    },
    openGraph: {
      title,
      description,
    },
    robots: { index: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

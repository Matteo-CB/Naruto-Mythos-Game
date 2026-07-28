import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/lib/i18n/routing';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seoPages.register' });

  const title = t('title');
  const description = t('description');
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) languages[loc] = `${SITE_URL}/${loc}/register`;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}/register`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/register`,
      languages,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/register`,
      images: [{ url: `${SITE_URL}/images/design/naruto.png`, width: 1200, height: 630, alt: t('ogAlt') }],
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

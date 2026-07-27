import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/lib/i18n/routing';
import { getSiteFacts } from '@/lib/seo/siteFacts';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seoPages.collection' });

  const { cardCount } = getSiteFacts();
  const title = t('title', { cardCount });
  const description = t('description', { cardCount });
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) languages[loc] = `${SITE_URL}/${loc}/collection`;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}/collection`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/collection`,
      languages,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/collection`,
      images: [{ url: '/images/og-image.webp', width: 1200, height: 630, alt: t('ogAlt') }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

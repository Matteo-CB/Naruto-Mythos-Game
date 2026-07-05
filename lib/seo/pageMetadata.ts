import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/lib/i18n/routing';

const SITE_URL = 'https://narutomythosgame.com';

export async function buildPageMetadata(locale: string, path: string, namespace: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: `seoPages.${namespace}` });

  const title = t('title');
  const description = t('description');
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) languages[loc] = `${SITE_URL}/${loc}${path}`;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}${path}`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}${path}`,
      languages,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}${path}`,
      images: [{ url: '/images/og-image.webp', width: 1200, height: 630, alt: t('ogAlt') }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

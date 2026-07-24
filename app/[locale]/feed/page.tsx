import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/lib/i18n/routing';
import { FeedClient } from './FeedClient';

const SITE_URL = 'https://narutomythosgame.com';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seoPages.feed' });

  const url = `${SITE_URL}/${locale}/feed`;
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) languages[loc] = `${SITE_URL}/${loc}/feed`;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}/feed`;

  const title = t('title');
  const description = t('description');

  return {
    title,
    description,
    alternates: { canonical: url, languages },
    openGraph: { title, description, url, images: [{ url: `${SITE_URL}/images/og-image.webp` }] },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function FeedPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'seoPages.feed' });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('title'),
    description: t('description'),
    url: `${SITE_URL}/${locale}/feed`,
    isPartOf: { '@type': 'WebSite', name: 'Naruto Mythos TCG', url: SITE_URL },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Suspense fallback={null}>
        <FeedClient />
      </Suspense>
    </>
  );
}

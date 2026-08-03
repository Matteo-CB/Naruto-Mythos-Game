import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/lib/i18n/routing';
import { SocialClient } from './SocialClient';

const SITE_URL = 'https://narutomythosgame.com';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seoPages.social' });

  const url = `${SITE_URL}/${locale}/social`;
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) languages[loc] = `${SITE_URL}/${loc}/social`;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}/social`;

  const title = t('title');
  const description = t('description');

  return {
    title,
    description,
    alternates: { canonical: url, languages },
    openGraph: {
      title,
      description,
      url,
      images: [{ url: `${SITE_URL}/images/og-image.webp?v=3`, width: 1200, height: 630, alt: t('ogAlt') }],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function SocialPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'seoPages.social' });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('title'),
    description: t('description'),
    url: `${SITE_URL}/${locale}/social`,
    isPartOf: { '@type': 'WebSite', name: 'Naruto Mythos TCG', url: SITE_URL },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SocialClient />
    </>
  );
}

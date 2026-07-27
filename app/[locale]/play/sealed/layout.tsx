import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/lib/i18n/routing';
import { getSiteFacts } from '@/lib/seo/siteFacts';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seoPages.playSealed' });

  const title = t('title');
  const description = t('description', { boosterCount: getSiteFacts().boosterCount });
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) languages[loc] = `${SITE_URL}/${loc}/play/sealed`;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}/play/sealed`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/play/sealed`,
      languages,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/play/sealed`,
      images: [{ url: '/images/og-image.webp', width: 1200, height: 630, alt: title }],
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

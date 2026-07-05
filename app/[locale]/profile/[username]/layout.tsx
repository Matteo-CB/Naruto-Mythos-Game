import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/lib/i18n/routing';

const SITE_URL = 'https://narutomythosgame.com';

type Props = { params: Promise<{ locale: string; username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, username } = await params;
  const decodedName = decodeURIComponent(username);
  const t = await getTranslations({ locale, namespace: 'seoPages.profile' });

  const title = t('title', { name: decodedName });
  const description = t('description', { name: decodedName });
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) languages[loc] = `${SITE_URL}/${loc}/profile/${username}`;
  languages['x-default'] = `${SITE_URL}/${routing.defaultLocale}/profile/${username}`;

  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: `${SITE_URL}/${locale}/profile/${username}`,
      languages,
    },
    openGraph: { title, description },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

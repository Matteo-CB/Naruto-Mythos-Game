import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Mode Draft - Ouvrez des Boosters | Naruto Mythos TCG'
    : 'Draft Mode - Open Boosters | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Ouvrez 6 boosters, construisez un deck et affrontez un adversaire dans le mode Draft du Naruto Mythos TCG.'
    : 'Open 6 boosters, build a deck and battle an opponent in the Naruto Mythos TCG Draft mode.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/play/draft`,
      languages: { en: `${SITE_URL}/en/play/draft`, fr: `${SITE_URL}/fr/play/draft` },
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/play/draft`,
      images: [{ url: '/images/og-image.webp', width: 1200, height: 630, alt: title }],
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

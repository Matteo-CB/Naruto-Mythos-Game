import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Mode Scelle - Ouvrez des Boosters | Naruto Mythos TCG'
    : 'Sealed Mode - Open Boosters | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Ouvrez 6 boosters, construisez un deck et affrontez un adversaire dans le mode Scelle du Naruto Mythos TCG.'
    : 'Open 6 boosters, build a deck and battle an opponent in the Naruto Mythos TCG Sealed mode.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/play/sealed`,
      languages: { en: `${SITE_URL}/en/play/sealed`, fr: `${SITE_URL}/fr/play/sealed` },
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

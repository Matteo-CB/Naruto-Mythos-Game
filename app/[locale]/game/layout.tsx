import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const SITE_URL = 'https://narutomythosgame.com';

  return {
    title: locale === 'fr' ? 'Partie - Naruto Mythos TCG' : 'Game - Naruto Mythos TCG',
    description: 'Naruto Mythos TCG game board',
    alternates: {
      canonical: `${SITE_URL}/${locale}/game`,
      languages: { en: `${SITE_URL}/en/game`, fr: `${SITE_URL}/fr/game` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Partie - Naruto Mythos TCG' : 'Game - Naruto Mythos TCG',
      description: 'Naruto Mythos TCG game board',
    },
    robots: { index: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

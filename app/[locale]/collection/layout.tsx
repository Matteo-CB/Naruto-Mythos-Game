import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const SITE_URL = 'https://narutomythosgame.com';

  return {
    title: locale === 'fr' ? 'Collection de Cartes - Naruto Mythos TCG' : 'Card Collection - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Parcourez toutes les cartes Naruto Mythos TCG. Filtrez par rarete, village, mot-cle. Consultez l\'art, les stats et les effets des 186 cartes.'
      : 'Browse all Naruto Mythos TCG cards. Filter by rarity, village, keyword. View card art, stats, and effects for all 186 cards.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/collection`,
      languages: { en: `${SITE_URL}/en/collection`, fr: `${SITE_URL}/fr/collection` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Collection de Cartes - Naruto Mythos TCG' : 'Card Collection - Naruto Mythos TCG',
      description: locale === 'fr'
        ? 'Parcourez toutes les cartes Naruto Mythos TCG. Filtrez par rarete, village, mot-cle. Consultez l\'art, les stats et les effets des 186 cartes.'
        : 'Browse all Naruto Mythos TCG cards. Filter by rarity, village, keyword. View card art, stats, and effects for all 186 cards.',
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

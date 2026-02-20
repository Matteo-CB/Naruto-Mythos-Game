import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Constructeur de Deck Naruto - Creez votre Strategie | Naruto Mythos TCG'
    : 'Naruto Deck Builder - Create Your Strategy | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Construisez le deck parfait dans le Naruto Mythos TCG avec notre constructeur de deck interactif. Choisissez parmi 66 cartes jouables illustrees, selectionnez 3 cartes mission et validez votre composition (minimum 30 cartes personnage, maximum 2 copies par version). Glissez-deposez ou cliquez pour ajouter des cartes, filtrez par rarete et village, previsualisant chaque carte en temps reel. Sauvegardez vos decks en ligne et chargez-les pour jouer contre l\'IA ou en multijoueur. Creez des strategies avec des cartes Leaf Village, Sand Village, Akatsuki et plus encore.'
    : 'Build the perfect deck in Naruto Mythos TCG with our interactive deck builder. Choose from 66 illustrated playable cards, select 3 mission cards, and validate your composition (minimum 30 character cards, maximum 2 copies per version). Drag-and-drop or click to add cards, filter by rarity and village, and preview every card in real-time. Save your decks online and load them to play against AI or in multiplayer. Craft strategies with Leaf Village, Sand Village, Akatsuki, and more cards.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/deck-builder`,
      languages: { en: `${SITE_URL}/en/deck-builder`, fr: `${SITE_URL}/fr/deck-builder` },
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/deck-builder`,
      images: [{ url: '/images/og-image.webp', width: 1200, height: 630, alt: locale === 'fr' ? 'Constructeur de deck Naruto Mythos TCG' : 'Naruto Mythos TCG Deck Builder' }],
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

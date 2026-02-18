import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const SITE_URL = 'https://narutomythosgame.com';

  return {
    title: locale === 'fr' ? 'Constructeur de Deck - Naruto Mythos TCG' : 'Deck Builder - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Construisez et sauvegardez vos decks Naruto Mythos TCG. Choisissez parmi 66 cartes jouables, selectionnez 3 missions et validez votre deck.'
      : 'Build and save your Naruto Mythos TCG decks. Choose from 66 playable cards, select 3 missions, and validate your deck for competitive play.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/deck-builder`,
      languages: { en: `${SITE_URL}/en/deck-builder`, fr: `${SITE_URL}/fr/deck-builder` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Constructeur de Deck - Naruto Mythos TCG' : 'Deck Builder - Naruto Mythos TCG',
      description: locale === 'fr'
        ? 'Construisez et sauvegardez vos decks Naruto Mythos TCG. Choisissez parmi 66 cartes jouables, selectionnez 3 missions et validez votre deck.'
        : 'Build and save your Naruto Mythos TCG decks. Choose from 66 playable cards, select 3 missions, and validate your deck for competitive play.',
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

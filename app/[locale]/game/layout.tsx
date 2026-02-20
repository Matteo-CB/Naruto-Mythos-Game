import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Plateau de Jeu - Partie en Cours | Naruto Mythos TCG'
    : 'Game Board - Match in Progress | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Plateau de jeu interactif du Naruto Mythos TCG. Jouez vos cartes personnage sur les missions, gerez votre chakra, activez les effets MAIN, UPGRADE, AMBUSH et SCORE, et remportez les missions pour marquer des points. Interface immersive avec animations cinematiques et apercu des cartes en temps reel.'
    : 'Interactive Naruto Mythos TCG game board. Play your character cards on missions, manage your chakra, activate MAIN, UPGRADE, AMBUSH, and SCORE effects, and win missions to score points. Immersive interface with cinematic animations and real-time card previews.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/game`,
      languages: { en: `${SITE_URL}/en/game`, fr: `${SITE_URL}/fr/game` },
    },
    openGraph: {
      title,
      description,
    },
    robots: { index: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

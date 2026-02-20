import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Classement ELO des Joueurs - Top Joueurs Competitifs | Naruto Mythos TCG'
    : 'Player ELO Rankings - Top Competitive Players | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Consultez le classement ELO officiel du Naruto Mythos TCG en temps reel. Decouvrez les meilleurs joueurs competitifs avec leurs statistiques detaillees : score ELO, nombre de victoires, defaites et egalites, ratio de victoire et historique de performances. Suivez votre progression dans le classement mondial, comparez vos resultats avec les top joueurs et grimpez les echelons grace aux matchs classes en multijoueur. Le systeme de classement ELO utilise un facteur K adaptatif pour un matchmaking equilibre et competitif.'
    : 'View the official Naruto Mythos TCG ELO rankings updated in real-time. Discover the top competitive players with detailed statistics: ELO score, wins, losses, draws, win ratio, and performance history. Track your progress in the global rankings, compare your results with top players, and climb the ladder through ranked multiplayer matches. The ELO ranking system uses an adaptive K-factor for balanced and competitive matchmaking.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/leaderboard`,
      languages: { en: `${SITE_URL}/en/leaderboard`, fr: `${SITE_URL}/fr/leaderboard` },
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/leaderboard`,
      images: [{ url: '/images/og-image.webp', width: 1200, height: 630, alt: locale === 'fr' ? 'Classement ELO Naruto Mythos TCG' : 'Naruto Mythos TCG ELO Rankings' }],
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

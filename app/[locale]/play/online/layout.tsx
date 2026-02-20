import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Jouer en Ligne - Multijoueur Temps Reel | Naruto Mythos TCG'
    : 'Play Online - Real-Time Multiplayer | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Jouez au Naruto Mythos TCG en ligne contre d\'autres joueurs du monde entier en temps reel. Creez un salon prive avec un code a 6 caracteres pour jouer avec vos amis ou utilisez le matchmaking public pour trouver un adversaire a votre niveau. Competez en matchs classes pour gagner des points ELO et grimper le classement mondial. Chaque action est validee par le serveur pour une experience de jeu equitable et securisee. Defiez la communaute, ameliorez votre strategie et devenez le meilleur joueur de cartes Naruto Shippuden.'
    : 'Play Naruto Mythos TCG online against other players from around the world in real-time. Create a private room with a 6-character code to play with friends or use public matchmaking to find an opponent at your skill level. Compete in ranked matches to earn ELO points and climb the global leaderboard. Every action is server-validated for a fair and secure gaming experience. Challenge the community, improve your strategy, and become the best Naruto Shippuden card game player.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/play/online`,
      languages: { en: `${SITE_URL}/en/play/online`, fr: `${SITE_URL}/fr/play/online` },
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/play/online`,
      images: [{ url: '/images/og-image.webp', width: 1200, height: 630, alt: locale === 'fr' ? 'Jouer en ligne - Naruto Mythos TCG' : 'Play Online - Naruto Mythos TCG' }],
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

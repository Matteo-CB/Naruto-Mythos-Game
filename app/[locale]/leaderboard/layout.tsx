import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const SITE_URL = 'https://narutomythosgame.com';

  return {
    title: locale === 'fr' ? 'Classement ELO - Naruto Mythos TCG' : 'ELO Leaderboard - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Decouvrez les meilleurs joueurs Naruto Mythos TCG. Classement ELO, victoires/defaites et rankings competitifs en temps reel.'
      : 'See the top-ranked Naruto Mythos TCG players. ELO ratings, win/loss records, and competitive rankings updated in real-time.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/leaderboard`,
      languages: { en: `${SITE_URL}/en/leaderboard`, fr: `${SITE_URL}/fr/leaderboard` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Classement ELO - Naruto Mythos TCG' : 'ELO Leaderboard - Naruto Mythos TCG',
      description: locale === 'fr'
        ? 'Decouvrez les meilleurs joueurs Naruto Mythos TCG. Classement ELO, victoires/defaites et rankings competitifs en temps reel.'
        : 'See the top-ranked Naruto Mythos TCG players. ELO ratings, win/loss records, and competitive rankings updated in real-time.',
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

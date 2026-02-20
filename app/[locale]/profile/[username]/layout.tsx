import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

type Props = { params: Promise<{ locale: string; username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, username } = await params;
  const decodedName = decodeURIComponent(username);

  const title = locale === 'fr'
    ? `Profil de ${decodedName} - Statistiques et Classement | Naruto Mythos TCG`
    : `${decodedName}'s Profile - Stats and Ranking | Naruto Mythos TCG`;

  const description = locale === 'fr'
    ? `Consultez le profil de ${decodedName} sur Naruto Mythos TCG. Statistiques de jeu detaillees, score ELO, nombre de victoires, defaites et egalites, historique des parties recentes, performances en multijoueur et progression dans le classement mondial.`
    : `View ${decodedName}'s profile on Naruto Mythos TCG. Detailed game statistics, ELO score, wins, losses, draws, recent match history, multiplayer performance, and global ranking progression.`;

  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: `${SITE_URL}/${locale}/profile/${username}`,
      languages: {
        en: `${SITE_URL}/en/profile/${username}`,
        fr: `${SITE_URL}/fr/profile/${username}`,
      },
    },
    openGraph: { title, description },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

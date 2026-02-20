import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Connexion - Accedez a votre Compte | Naruto Mythos TCG'
    : 'Sign In - Access Your Account | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Connectez-vous a votre compte Naruto Mythos TCG pour acceder au multijoueur en ligne, sauvegarder et charger vos decks personnalises, consulter votre classement ELO, votre historique de matchs et votre liste d\'amis. Rejoignez la communaute de joueurs et competez dans les matchs classes.'
    : 'Sign in to your Naruto Mythos TCG account to access online multiplayer, save and load your custom decks, check your ELO ranking, match history, and friends list. Join the player community and compete in ranked matches.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/login`,
      languages: { en: `${SITE_URL}/en/login`, fr: `${SITE_URL}/fr/login` },
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

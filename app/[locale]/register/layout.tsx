import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Creer un Compte Gratuit - Inscription | Naruto Mythos TCG'
    : 'Create Free Account - Register | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Creez votre compte Naruto Mythos TCG gratuitement en quelques secondes. Accedez au multijoueur en ligne, sauvegardez vos decks, participez aux matchs classes ELO, ajoutez des amis et grimpez le classement mondial. Inscription rapide et gratuite pour commencer a jouer au jeu de cartes Naruto Shippuden en ligne.'
    : 'Create your Naruto Mythos TCG account for free in seconds. Access online multiplayer, save your decks, compete in ELO ranked matches, add friends, and climb the global leaderboard. Quick and free registration to start playing the Naruto Shippuden card game online.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/register`,
      languages: { en: `${SITE_URL}/en/register`, fr: `${SITE_URL}/fr/register` },
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/register`,
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

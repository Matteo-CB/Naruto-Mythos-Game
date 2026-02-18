import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const SITE_URL = 'https://narutomythosgame.com';

  return {
    title: locale === 'fr' ? 'Creer un Compte - Naruto Mythos TCG' : 'Create Account - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Creez votre compte Naruto Mythos TCG gratuit. Jouez en ligne, construisez des decks, participez aux matchs classes et grimpez le classement.'
      : 'Create your free Naruto Mythos TCG account. Play online, build decks, compete in ranked matches and climb the leaderboard.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/register`,
      languages: { en: `${SITE_URL}/en/register`, fr: `${SITE_URL}/fr/register` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Creer un Compte - Naruto Mythos TCG' : 'Create Account - Naruto Mythos TCG',
      description: locale === 'fr'
        ? 'Creez votre compte Naruto Mythos TCG gratuit. Jouez en ligne, construisez des decks, participez aux matchs classes et grimpez le classement.'
        : 'Create your free Naruto Mythos TCG account. Play online, build decks, compete in ranked matches and climb the leaderboard.',
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

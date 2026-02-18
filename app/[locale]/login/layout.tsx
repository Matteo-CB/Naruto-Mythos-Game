import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const SITE_URL = 'https://narutomythosgame.com';

  return {
    title: locale === 'fr' ? 'Connexion - Naruto Mythos TCG' : 'Sign In - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Connectez-vous a votre compte Naruto Mythos TCG pour jouer en ligne, sauvegarder vos decks et suivre votre classement ELO.'
      : 'Sign in to your Naruto Mythos TCG account to play online, save decks, and track your ELO ranking.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/login`,
      languages: { en: `${SITE_URL}/en/login`, fr: `${SITE_URL}/fr/login` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Connexion - Naruto Mythos TCG' : 'Sign In - Naruto Mythos TCG',
      description: locale === 'fr'
        ? 'Connectez-vous a votre compte Naruto Mythos TCG pour jouer en ligne, sauvegarder vos decks et suivre votre classement ELO.'
        : 'Sign in to your Naruto Mythos TCG account to play online, save decks, and track your ELO ranking.',
    },
    robots: { index: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

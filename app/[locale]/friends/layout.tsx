import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const SITE_URL = 'https://narutomythosgame.com';

  return {
    title: locale === 'fr' ? 'Amis - Naruto Mythos TCG' : 'Friends - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Gerez votre liste d\'amis, envoyez des demandes et defiez d\'autres joueurs au Naruto Mythos TCG.'
      : 'Manage your friends list, send friend requests, and challenge other players to matches in Naruto Mythos TCG.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/friends`,
      languages: { en: `${SITE_URL}/en/friends`, fr: `${SITE_URL}/fr/friends` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Amis - Naruto Mythos TCG' : 'Friends - Naruto Mythos TCG',
      description: locale === 'fr'
        ? 'Gerez votre liste d\'amis, envoyez des demandes et defiez d\'autres joueurs au Naruto Mythos TCG.'
        : 'Manage your friends list, send friend requests, and challenge other players to matches in Naruto Mythos TCG.',
    },
    robots: { index: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

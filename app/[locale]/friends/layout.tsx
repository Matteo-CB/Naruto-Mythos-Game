import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Liste d\'Amis - Gerez vos Contacts | Naruto Mythos TCG'
    : 'Friends List - Manage Your Contacts | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Gerez votre liste d\'amis sur Naruto Mythos TCG. Envoyez et acceptez des demandes d\'amis, consultez les profils de vos contacts, defiez-les en partie privee et suivez leur activite en ligne. Construisez votre communaute de joueurs Naruto Shippuden.'
    : 'Manage your friends list on Naruto Mythos TCG. Send and accept friend requests, view your contacts\' profiles, challenge them to private matches, and track their online activity. Build your Naruto Shippuden player community.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/friends`,
      languages: { en: `${SITE_URL}/en/friends`, fr: `${SITE_URL}/fr/friends` },
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

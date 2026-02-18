import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return {
    title: locale === 'fr' ? 'Signaler un Bug - Naruto Mythos TCG' : 'Report a Bug - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Signalez un bug ou un probleme rencontre dans Naruto Mythos TCG. Aidez-nous a ameliorer le jeu.'
      : 'Report a bug or issue you encountered in Naruto Mythos TCG. Help us improve the game.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/bug-report`,
      languages: { en: `${SITE_URL}/en/bug-report`, fr: `${SITE_URL}/fr/bug-report` },
    },
    robots: { index: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

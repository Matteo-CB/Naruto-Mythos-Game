import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const SITE_URL = 'https://narutomythosgame.com';

  return {
    title: locale === 'fr' ? 'Quiz - Naruto Mythos TCG' : 'Quiz - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Testez vos connaissances sur le Naruto Mythos TCG. Plusieurs niveaux de difficulte, suivi des scores et classement mondial.'
      : 'Test your knowledge of Naruto Mythos TCG. Multiple difficulty levels, score tracking, and a global leaderboard.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/quiz`,
      languages: { en: `${SITE_URL}/en/quiz`, fr: `${SITE_URL}/fr/quiz` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Quiz - Naruto Mythos TCG' : 'Quiz - Naruto Mythos TCG',
      description: locale === 'fr'
        ? 'Testez vos connaissances sur le Naruto Mythos TCG. Plusieurs niveaux de difficulte, suivi des scores et classement mondial.'
        : 'Test your knowledge of Naruto Mythos TCG. Multiple difficulty levels, score tracking, and a global leaderboard.',
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

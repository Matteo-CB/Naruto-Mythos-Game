import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Quiz Naruto - Testez vos Connaissances | Naruto Mythos TCG'
    : 'Naruto Quiz - Test Your Knowledge | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Testez vos connaissances sur le Naruto Mythos TCG avec notre quiz interactif. Plusieurs categories de questions : regles du jeu, effets des cartes, statistiques des personnages, strategies avancees et mecaniques de combat. Suivez votre score en temps reel, comparez vos resultats sur le classement mondial et ameliorez votre maitrise du jeu. Ideal pour apprendre les regles tout en s\'amusant et se preparer aux matchs competitifs. Quiz disponible en francais et en anglais.'
    : 'Test your knowledge of Naruto Mythos TCG with our interactive quiz. Multiple question categories: game rules, card effects, character stats, advanced strategies, and combat mechanics. Track your score in real-time, compare your results on the global leaderboard, and improve your mastery of the game. Perfect for learning the rules while having fun and preparing for competitive matches. Quiz available in English and French.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/quiz`,
      languages: { en: `${SITE_URL}/en/quiz`, fr: `${SITE_URL}/fr/quiz` },
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/quiz`,
      images: [{ url: '/images/og-image.webp', width: 1200, height: 630, alt: locale === 'fr' ? 'Quiz Naruto Mythos TCG' : 'Naruto Mythos TCG Quiz' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

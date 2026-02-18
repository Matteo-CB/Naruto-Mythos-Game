import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const SITE_URL = 'https://narutomythosgame.com';

  return {
    title: locale === 'fr' ? 'Jouer contre l\'IA - Naruto Mythos TCG' : 'Play vs AI - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Affrontez l\'IA au Naruto Mythos TCG. Quatre niveaux de difficulte de Facile a Expert. Choisissez votre deck et testez votre strategie.'
      : 'Challenge the AI in Naruto Mythos TCG. Four difficulty levels from Easy to Expert. Choose your deck and test your strategy.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/play/ai`,
      languages: { en: `${SITE_URL}/en/play/ai`, fr: `${SITE_URL}/fr/play/ai` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Jouer contre l\'IA - Naruto Mythos TCG' : 'Play vs AI - Naruto Mythos TCG',
      description: locale === 'fr'
        ? 'Affrontez l\'IA au Naruto Mythos TCG. Quatre niveaux de difficulte de Facile a Expert. Choisissez votre deck et testez votre strategie.'
        : 'Challenge the AI in Naruto Mythos TCG. Four difficulty levels from Easy to Expert. Choose your deck and test your strategy.',
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

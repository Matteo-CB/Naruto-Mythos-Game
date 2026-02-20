import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Jouer contre l\'IA - 4 Niveaux de Difficulte | Naruto Mythos TCG'
    : 'Play vs AI - 4 Difficulty Levels | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Affrontez l\'intelligence artificielle du Naruto Mythos TCG sur 4 niveaux de difficulte. Mode Facile pour apprendre les bases, Medium pour une strategie equilibree, Difficile avec minimax et gestion optimale du chakra, et Expert avec evaluation avancee des effets SCORE, planification multi-tours et analyse probabiliste des cartes cachees. Choisissez votre deck personnalise et lancez une partie solo instantanement. Parfait pour s\'entrainer avant les matchs classes en ligne ou pour decouvrir le jeu de cartes Naruto Shippuden.'
    : 'Challenge the Naruto Mythos TCG artificial intelligence across 4 difficulty levels. Easy mode to learn the basics, Medium for balanced strategy, Hard with minimax and optimal chakra management, and Expert with advanced SCORE effect evaluation, multi-turn planning, and hidden card probability analysis. Choose your custom deck and launch a solo game instantly. Perfect for training before ranked online matches or discovering the Naruto Shippuden card game.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/play/ai`,
      languages: { en: `${SITE_URL}/en/play/ai`, fr: `${SITE_URL}/fr/play/ai` },
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/play/ai`,
      images: [{ url: '/images/og-image.webp', width: 1200, height: 630, alt: locale === 'fr' ? 'Jouer contre l\'IA - Naruto Mythos TCG' : 'Play vs AI - Naruto Mythos TCG' }],
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

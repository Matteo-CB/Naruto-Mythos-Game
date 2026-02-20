import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Signaler un Bug - Aidez-nous a Ameliorer | Naruto Mythos TCG'
    : 'Report a Bug - Help Us Improve | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Signalez un bug, un probleme technique ou une erreur de gameplay dans le Naruto Mythos TCG. Votre signalement aide notre equipe a ameliorer le jeu de cartes et l\'experience de tous les joueurs. Decrivez le probleme rencontre et nous le corrigerons rapidement.'
    : 'Report a bug, technical issue, or gameplay error in Naruto Mythos TCG. Your report helps our team improve the card game and the experience for all players. Describe the issue you encountered and we will fix it promptly.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/bug-report`,
      languages: { en: `${SITE_URL}/en/bug-report`, fr: `${SITE_URL}/fr/bug-report` },
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

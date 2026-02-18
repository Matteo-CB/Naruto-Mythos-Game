import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const SITE_URL = 'https://narutomythosgame.com';

  return {
    title: locale === 'fr' ? 'Jouer en Ligne - Naruto Mythos TCG' : 'Play Online - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Jouez au Naruto Mythos TCG en ligne contre d\'autres joueurs. Creez ou rejoignez des salons, competez en matchs classes et gagnez des points ELO.'
      : 'Play Naruto Mythos TCG online against other players. Create or join rooms, compete in ranked matches, and earn ELO points.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/play/online`,
      languages: { en: `${SITE_URL}/en/play/online`, fr: `${SITE_URL}/fr/play/online` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Jouer en Ligne - Naruto Mythos TCG' : 'Play Online - Naruto Mythos TCG',
      description: locale === 'fr'
        ? 'Jouez au Naruto Mythos TCG en ligne contre d\'autres joueurs. Creez ou rejoignez des salons, competez en matchs classes et gagnez des points ELO.'
        : 'Play Naruto Mythos TCG online against other players. Create or join rooms, compete in ranked matches, and earn ELO points.',
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

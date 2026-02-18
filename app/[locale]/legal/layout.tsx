import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const SITE_URL = 'https://narutomythosgame.com';

  return {
    title: locale === 'fr' ? 'Mentions Legales - Naruto Mythos TCG' : 'Legal Notice - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Informations legales, mentions de propriete intellectuelle et conditions d\'utilisation du Naruto Mythos TCG.'
      : 'Legal information, intellectual property notice, and terms of use for Naruto Mythos TCG.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/legal`,
      languages: { en: `${SITE_URL}/en/legal`, fr: `${SITE_URL}/fr/legal` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Mentions Legales - Naruto Mythos TCG' : 'Legal Notice - Naruto Mythos TCG',
      description: locale === 'fr'
        ? 'Informations legales, mentions de propriete intellectuelle et conditions d\'utilisation du Naruto Mythos TCG.'
        : 'Legal information, intellectual property notice, and terms of use for Naruto Mythos TCG.',
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

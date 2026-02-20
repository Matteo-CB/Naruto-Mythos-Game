import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Mentions Legales et Conditions d\'Utilisation | Naruto Mythos TCG'
    : 'Legal Notice and Terms of Use | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Mentions legales, politique de confidentialite, conditions d\'utilisation et informations sur la propriete intellectuelle du Naruto Mythos TCG. Projet fan-made non affilie a Masashi Kishimoto, Shueisha ou Studio Pierrot. Developpe par HiddenLab.'
    : 'Legal notice, privacy policy, terms of use, and intellectual property information for Naruto Mythos TCG. Fan-made project not affiliated with Masashi Kishimoto, Shueisha, or Studio Pierrot. Developed by HiddenLab.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/legal`,
      languages: { en: `${SITE_URL}/en/legal`, fr: `${SITE_URL}/fr/legal` },
    },
    openGraph: {
      title,
      description,
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

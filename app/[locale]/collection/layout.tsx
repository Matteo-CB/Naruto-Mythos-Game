import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Collection de Cartes Naruto - Toutes les 186 Cartes | Naruto Mythos TCG'
    : 'Naruto Card Collection - All 186 Cards | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Explorez la collection complete des 186 cartes du Naruto Mythos TCG. Parcourez les cartes Common, Uncommon, Rare, Rare Art, Secret et Mythos. Filtrez par rarete, village (Konoha, Suna, Oto, Akatsuki), mot-cle (Sannin, Team 7, Invocation) et type de personnage. Consultez les illustrations officielles, les statistiques de chakra et puissance, et les effets detailles de chaque carte. Decouvrez des personnages iconiques comme Naruto Uzumaki, Sasuke Uchiha, Kakashi Hatake, Itachi, Gaara, Sakura Haruno, Jiraiya, Orochimaru et Tsunade dans cette encyclopedie de cartes Naruto Shippuden gratuite.'
    : 'Explore the complete collection of all 186 Naruto Mythos TCG cards. Browse Common, Uncommon, Rare, Rare Art, Secret, and Mythos rarity cards. Filter by rarity, village (Leaf, Sand, Sound, Akatsuki), keyword (Sannin, Team 7, Summon), and character type. View official card artwork, chakra cost and power stats, and detailed effect descriptions for every card. Discover iconic characters like Naruto Uzumaki, Sasuke Uchiha, Kakashi Hatake, Itachi, Gaara, Sakura Haruno, Jiraiya, Orochimaru, and Tsunade in this free Naruto Shippuden card encyclopedia.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/collection`,
      languages: { en: `${SITE_URL}/en/collection`, fr: `${SITE_URL}/fr/collection` },
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/collection`,
      images: [{ url: '/images/og-image.webp', width: 1200, height: 630, alt: locale === 'fr' ? 'Collection de cartes Naruto Mythos TCG' : 'Naruto Mythos TCG Card Collection' }],
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

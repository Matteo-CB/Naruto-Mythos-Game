import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

const FAQ_EN = [
  { q: 'How many cards do I need to build a deck?', a: 'You need a minimum of 30 character cards plus exactly 3 mission cards.' },
  { q: 'How many turns does a game last?', a: 'A game lasts exactly 4 turns. Each turn has 4 phases: Start, Action, Mission, and End.' },
  { q: 'What is the Edge token?', a: 'The Edge token determines who plays first in the Action Phase and who wins ties during the Mission Phase. The first player to pass gains the Edge token.' },
  { q: 'How do hidden characters work?', a: 'Hidden characters are played face-down for 1 chakra. They have 0 power for scoring. You can reveal them later by paying their full chakra cost, triggering MAIN and AMBUSH effects.' },
  { q: 'What is a character upgrade?', a: 'You can play a higher-cost version of the same character over an existing one, paying only the cost difference. This triggers MAIN and UPGRADE effects.' },
  { q: 'How are missions scored?', a: 'During the Mission Phase, each mission is evaluated. The player with more total power wins the mission and earns its points (base + rank bonus). Ties go to the Edge token holder.' },
  { q: 'What card rarities exist in Naruto Mythos TCG?', a: 'There are 7 rarities: Common (C), Uncommon (UC), Rare (R), Rare Art (RA), Secret (S), Mythos (M), and Legendary. Each rarity has unique artwork and increasingly powerful effects.' },
  { q: 'How does the ELO ranking system work?', a: 'The ELO system rates players based on competitive match results. Win against higher-rated players to gain more points. The system uses an adaptive K-factor (32 below 2000 ELO, 16 above) for balanced progression.' },
];

const FAQ_FR = [
  { q: 'Combien de cartes faut-il pour construire un deck ?', a: 'Il faut un minimum de 30 cartes personnage plus exactement 3 cartes mission.' },
  { q: 'Combien de tours dure une partie ?', a: 'Une partie dure exactement 4 tours. Chaque tour comporte 4 phases : Debut, Action, Mission et Fin.' },
  { q: "Qu'est-ce que le jeton Edge ?", a: "Le jeton Edge determine qui joue en premier pendant la Phase d'Action et qui gagne les egalites pendant la Phase de Mission. Le premier joueur a passer obtient le jeton Edge." },
  { q: 'Comment fonctionnent les personnages caches ?', a: "Les personnages caches sont joues face cachee pour 1 chakra. Ils ont 0 puissance pour le score. Vous pouvez les reveler plus tard en payant leur cout complet en chakra, declenchant les effets MAIN et AMBUSH." },
  { q: "Qu'est-ce qu'une evolution de personnage ?", a: "Vous pouvez jouer une version plus couteuse du meme personnage par-dessus un existant, en ne payant que la difference de cout. Cela declenche les effets MAIN et UPGRADE." },
  { q: 'Comment les missions sont-elles evaluees ?', a: "Pendant la Phase de Mission, chaque mission est evaluee. Le joueur avec le plus de puissance totale remporte la mission et gagne ses points (base + bonus de rang). Les egalites vont au detenteur du jeton Edge." },
  { q: 'Quelles raretes de cartes existent dans Naruto Mythos TCG ?', a: "Il existe 7 raretes : Commune (C), Peu Commune (UC), Rare (R), Rare Art (RA), Secrete (S), Mythos (M) et Legendaire. Chaque rarete possede des illustrations uniques et des effets de plus en plus puissants." },
  { q: 'Comment fonctionne le systeme de classement ELO ?', a: "Le systeme ELO evalue les joueurs en fonction des resultats de matchs competitifs. Gagnez contre des joueurs mieux classes pour obtenir plus de points. Le systeme utilise un facteur K adaptatif (32 en dessous de 2000 ELO, 16 au-dessus) pour une progression equilibree." },
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === 'fr'
    ? 'Apprendre les Regles - Tutoriel Complet | Naruto Mythos TCG'
    : 'Learn the Rules - Complete Tutorial | Naruto Mythos TCG';

  const description = locale === 'fr'
    ? 'Maitrisez les regles du Naruto Mythos TCG avec notre tutoriel interactif complet. Apprenez les 4 phases de jeu (Debut, Action, Mission, Fin), les types d\'effets de cartes (MAIN, UPGRADE, AMBUSH, SCORE), le systeme de chakra et de puissance, les mecaniques de personnages caches, les evolutions de personnage et les strategies avancees. Comprenez le jeton Edge, le scoring des missions de rang D a A, la construction de deck et les tactiques de bluff. Guide complet pour debutants et joueurs avances du jeu de cartes Naruto Shippuden.'
    : 'Master Naruto Mythos TCG rules with our complete interactive tutorial. Learn the 4 game phases (Start, Action, Mission, End), card effect types (MAIN, UPGRADE, AMBUSH, SCORE), the chakra and power system, hidden character mechanics, character upgrades, and advanced strategies. Understand the Edge token, mission scoring from D to A rank, deck building, and bluffing tactics. Complete guide for beginners and advanced players of the Naruto Shippuden card game.';

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/learn`,
      languages: { en: `${SITE_URL}/en/learn`, fr: `${SITE_URL}/fr/learn` },
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${locale}/learn`,
      images: [{ url: '/images/og-image.webp', width: 1200, height: 630, alt: locale === 'fr' ? 'Apprendre les regles - Naruto Mythos TCG' : 'Learn the Rules - Naruto Mythos TCG' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  return (
    <>
      <FAQJsonLd params={params} />
      {children}
    </>
  );
}

async function FAQJsonLd({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const faqs = locale === 'fr' ? FAQ_FR : FAQ_EN;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

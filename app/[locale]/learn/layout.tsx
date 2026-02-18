import type { Metadata } from 'next';

const SITE_URL = 'https://narutomythosgame.com';

const FAQ_EN = [
  { q: 'How many cards do I need to build a deck?', a: 'You need a minimum of 30 character cards plus exactly 3 mission cards.' },
  { q: 'How many turns does a game last?', a: 'A game lasts exactly 4 turns. Each turn has 4 phases: Start, Action, Mission, and End.' },
  { q: 'What is the Edge token?', a: 'The Edge token determines who plays first in the Action Phase and who wins ties during the Mission Phase. The first player to pass gains the Edge token.' },
  { q: 'How do hidden characters work?', a: 'Hidden characters are played face-down for 1 chakra. They have 0 power for scoring. You can reveal them later by paying their full chakra cost, triggering MAIN and AMBUSH effects.' },
  { q: 'What is a character upgrade?', a: 'You can play a higher-cost version of the same character over an existing one, paying only the cost difference. This triggers MAIN and UPGRADE effects.' },
  { q: 'How are missions scored?', a: 'During the Mission Phase, each mission is evaluated. The player with more total power wins the mission and earns its points (base + rank bonus). Ties go to the Edge token holder.' },
];

const FAQ_FR = [
  { q: 'Combien de cartes faut-il pour construire un deck ?', a: 'Il faut un minimum de 30 cartes personnage plus exactement 3 cartes mission.' },
  { q: 'Combien de tours dure une partie ?', a: 'Une partie dure exactement 4 tours. Chaque tour comporte 4 phases : Debut, Action, Mission et Fin.' },
  { q: "Qu'est-ce que le jeton Edge ?", a: "Le jeton Edge determine qui joue en premier pendant la Phase d'Action et qui gagne les egalites pendant la Phase de Mission. Le premier joueur a passer obtient le jeton Edge." },
  { q: 'Comment fonctionnent les personnages caches ?', a: "Les personnages caches sont joues face cachee pour 1 chakra. Ils ont 0 puissance pour le score. Vous pouvez les reveler plus tard en payant leur cout complet en chakra, declenchant les effets MAIN et AMBUSH." },
  { q: "Qu'est-ce qu'une evolution de personnage ?", a: "Vous pouvez jouer une version plus couteuse du meme personnage par-dessus un existant, en ne payant que la difference de cout. Cela declenche les effets MAIN et UPGRADE." },
  { q: 'Comment les missions sont-elles evaluees ?', a: "Pendant la Phase de Mission, chaque mission est evaluee. Le joueur avec le plus de puissance totale remporte la mission et gagne ses points (base + bonus de rang). Les egalites vont au detenteur du jeton Edge." },
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return {
    title: locale === 'fr' ? 'Apprendre les Regles - Naruto Mythos TCG' : 'Learn the Rules - Naruto Mythos TCG',
    description: locale === 'fr'
      ? 'Maitrisez les regles du Naruto Mythos TCG avec des lecons interactives. Comprenez les phases, types de cartes, effets, missions et strategies.'
      : 'Master Naruto Mythos TCG rules with interactive lessons. Understand phases, card types, effects, missions, and advanced strategies.',
    alternates: {
      canonical: `${SITE_URL}/${locale}/learn`,
      languages: { en: `${SITE_URL}/en/learn`, fr: `${SITE_URL}/fr/learn` },
    },
    openGraph: {
      title: locale === 'fr' ? 'Apprendre les Regles - Naruto Mythos TCG' : 'Learn the Rules - Naruto Mythos TCG',
      description: locale === 'fr'
        ? 'Maitrisez les regles du Naruto Mythos TCG avec des lecons interactives. Comprenez les phases, types de cartes, effets, missions et strategies.'
        : 'Master Naruto Mythos TCG rules with interactive lessons. Understand phases, card types, effects, missions, and advanced strategies.',
    },
  };
}

export default function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  // We need to resolve params synchronously for layout — use a server component approach
  // The FAQ JSON-LD is rendered here so it's available to search engines
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

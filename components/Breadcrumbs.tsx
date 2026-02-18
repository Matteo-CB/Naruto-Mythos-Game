'use client';

import { usePathname } from 'next/navigation';

const SITE_URL = 'https://narutomythosgame.com';

const PAGE_NAMES: Record<string, Record<string, string>> = {
  collection: { en: 'Card Collection', fr: 'Collection de Cartes' },
  'deck-builder': { en: 'Deck Builder', fr: 'Constructeur de Deck' },
  learn: { en: 'Learn the Rules', fr: 'Apprendre les Regles' },
  quiz: { en: 'Quiz', fr: 'Quiz' },
  leaderboard: { en: 'ELO Leaderboard', fr: 'Classement ELO' },
  login: { en: 'Sign In', fr: 'Connexion' },
  register: { en: 'Create Account', fr: 'Creer un Compte' },
  legal: { en: 'Legal Notice', fr: 'Mentions Legales' },
  friends: { en: 'Friends', fr: 'Amis' },
  'bug-report': { en: 'Report a Bug', fr: 'Signaler un Bug' },
};

const PLAY_NAMES: Record<string, Record<string, string>> = {
  ai: { en: 'Play vs AI', fr: "Jouer contre l'IA" },
  online: { en: 'Play Online', fr: 'Jouer en Ligne' },
};

export function BreadcrumbJsonLd() {
  const pathname = usePathname();
  if (!pathname) return null;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const locale = segments[0];
  if (locale !== 'en' && locale !== 'fr') return null;

  const items: Array<{ name: string; url: string }> = [
    { name: 'Naruto Mythos TCG', url: `${SITE_URL}/${locale}` },
  ];

  const pageSlug = segments[1];

  if (pageSlug === 'play' && segments[2]) {
    const playType = segments[2];
    items.push({
      name: PLAY_NAMES[playType]?.[locale] || playType,
      url: `${SITE_URL}/${locale}/play/${playType}`,
    });
  } else if (PAGE_NAMES[pageSlug]) {
    items.push({
      name: PAGE_NAMES[pageSlug][locale] || pageSlug,
      url: `${SITE_URL}/${locale}/${pageSlug}`,
    });
  } else {
    return null;
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

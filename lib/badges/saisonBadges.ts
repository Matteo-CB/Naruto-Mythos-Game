export const SAISON_ARCHIVEE = 'KS';

export interface PalierDeBadge {
  badge: string;
  rangMax: number;
}

export const PALIERS_DE_BADGE: readonly PalierDeBadge[] = [
  { badge: 'top-1', rangMax: 1 },
  { badge: 'top-10', rangMax: 10 },
  { badge: 'top-50', rangMax: 50 },
  { badge: 'top-100', rangMax: 100 },
  { badge: 'top-200', rangMax: 200 },
];

export const RANG_MAXIMUM_RECOMPENSE = PALIERS_DE_BADGE[PALIERS_DE_BADGE.length - 1].rangMax;

export const BADGE_VAINQUEUR_DE_TOURNOI = 'tournament-winner';

export const BADGES_DE_RECOMPENSE: readonly string[] = [BADGE_VAINQUEUR_DE_TOURNOI];

export const DOSSIER_DES_RECOMPENSES = 'awards';

const FORME_DUN_BADGE_DE_PALIER = /^tier-(\d+)$/;

export function estUnBadgeDePalier(badge: string): boolean {
  return FORME_DUN_BADGE_DE_PALIER.test(badge);
}

export function palierDuBadge(badge: string): number | null {
  const trouve = FORME_DUN_BADGE_DE_PALIER.exec(badge);
  return trouve ? Number(trouve[1]) : null;
}

export function badgeDuPalier(tier: number): string {
  return `tier-${tier}`;
}

export function badgePourLeRang(rang: number): string | null {
  if (!Number.isFinite(rang) || rang < 1) return null;
  for (const palier of PALIERS_DE_BADGE) {
    if (rang <= palier.rangMax) return palier.badge;
  }
  return null;
}

export function estUnBadgeDeSaison(badge: string): boolean {
  return PALIERS_DE_BADGE.some((p) => p.badge === badge);
}

export function estUnBadgeDeRecompense(badge: string): boolean {
  return BADGES_DE_RECOMPENSE.includes(badge);
}

export function estUnBadgeConnu(badge: string): boolean {
  return estUnBadgeDeSaison(badge) || estUnBadgeDeRecompense(badge) || estUnBadgeDePalier(badge);
}

export function imageDuBadge(seasonId: string, badge: string): string {
  if (estUnBadgeDePalier(badge)) return `/images/battlepass/${seasonId}/${badge}.webp`;
  const dossier = estUnBadgeDeRecompense(badge) ? DOSSIER_DES_RECOMPENSES : seasonId;
  return `/images/badges/${dossier}/${badge}.webp`;
}

export interface BadgeDeSaison {
  seasonId: string;
  badge: string | null;
  league?: string | null;
  rank: number;
  elo: number;
}

export function trieLesBadges(badges: readonly BadgeDeSaison[]): BadgeDeSaison[] {
  return [...badges].sort((a, b) => (a.rank - b.rank) || a.seasonId.localeCompare(b.seasonId));
}

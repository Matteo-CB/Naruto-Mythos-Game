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
];

export const RANG_MAXIMUM_RECOMPENSE = PALIERS_DE_BADGE[PALIERS_DE_BADGE.length - 1].rangMax;

export function badgePourLeRang(rang: number): string | null {
  if (!Number.isFinite(rang) || rang < 1) return null;
  for (const palier of PALIERS_DE_BADGE) {
    if (rang <= palier.rangMax) return palier.badge;
  }
  return null;
}

export function estUnBadgeConnu(badge: string): boolean {
  return PALIERS_DE_BADGE.some((p) => p.badge === badge);
}

export function imageDuBadge(seasonId: string, badge: string): string {
  return `/images/badges/${seasonId}/${badge}.webp`;
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

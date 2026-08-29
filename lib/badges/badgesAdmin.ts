import { BADGES_DE_RECOMPENSE, PALIERS_DE_BADGE, SAISON_ARCHIVEE } from './saisonBadges';

export interface BadgeOfferAdmin {
  seasonId: string;
  badge: string;
  league: string | null;
  rank: number;
  elo: number;
}

export function badgesDeSaisonPourAdmin(seasonId: string = SAISON_ARCHIVEE): BadgeOfferAdmin[] {
  return PALIERS_DE_BADGE.map((palier) => ({
    seasonId,
    badge: palier.badge,
    league: null,
    rank: 0,
    elo: 0,
  }));
}

export function badgesDeRecompensePourAdmin(): Array<{ badge: string }> {
  return BADGES_DE_RECOMPENSE.map((badge) => ({ badge }));
}

export function fusionneLesBadges<T extends { badge: string | null }>(
  possedes: readonly T[],
  offerts: readonly T[],
): T[] {
  const vus = new Set(possedes.map((b) => b.badge));
  return [...possedes, ...offerts.filter((b) => !vus.has(b.badge))];
}

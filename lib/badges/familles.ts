import {
  BADGES_DE_RECOMPENSE,
  PALIERS_DE_BADGE,
  SAISON_ARCHIVEE,
  badgeDuPalier,
  estUnBadgeDePalier,
  estUnBadgeDeRecompense,
  estUnBadgeDeSaison,
} from './saisonBadges';
import { paliersIllustres } from '@/lib/battlepass/iconesDePalier';
import { SEASON_SET_ID } from '@/lib/battlepass/season';
import { formatBadgeChoisi } from './badgeChoisi';

export type FamilleDeBadge = 'saison' | 'recompense' | 'palier';

export const FAMILLES_DE_BADGE: readonly FamilleDeBadge[] = ['saison', 'recompense', 'palier'];

export interface BadgeExistant {
  famille: FamilleDeBadge;
  seasonId: string | null;
  badge: string;
  valeur: string;
}

export function familleDuBadge(badge: string): FamilleDeBadge | null {
  if (estUnBadgeDeSaison(badge)) return 'saison';
  if (estUnBadgeDeRecompense(badge)) return 'recompense';
  if (estUnBadgeDePalier(badge)) return 'palier';
  return null;
}

export function badgesDeSaisonExistants(seasonId: string = SAISON_ARCHIVEE): BadgeExistant[] {
  return PALIERS_DE_BADGE.map((p) => ({
    famille: 'saison' as const,
    seasonId,
    badge: p.badge,
    valeur: formatBadgeChoisi(seasonId, p.badge),
  }));
}

export function badgesDeRecompenseExistants(): BadgeExistant[] {
  return BADGES_DE_RECOMPENSE.map((badge) => ({
    famille: 'recompense' as const,
    seasonId: null,
    badge,
    valeur: formatBadgeChoisi(null, badge),
  }));
}

export function badgesDePalierExistants(setId: string = SEASON_SET_ID): BadgeExistant[] {
  return paliersIllustres(setId).map((tier) => ({
    famille: 'palier' as const,
    seasonId: setId,
    badge: badgeDuPalier(tier),
    valeur: formatBadgeChoisi(setId, badgeDuPalier(tier)),
  }));
}

export function tousLesBadgesExistants(): BadgeExistant[] {
  return [
    ...badgesDeSaisonExistants(),
    ...badgesDeRecompenseExistants(),
    ...badgesDePalierExistants(),
  ];
}

export function badgesDePalierAtteints(
  battlepassTier: number,
  setId: string = SEASON_SET_ID,
): BadgeExistant[] {
  return badgesDePalierExistants(setId).filter((b) => {
    const tier = Number(b.badge.replace('tier-', ''));
    return Number.isFinite(tier) && battlepassTier >= tier;
  });
}

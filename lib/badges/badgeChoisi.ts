import { estUnBadgeDeRecompense, estUnBadgeDeSaison } from './saisonBadges';

export interface BadgeChoisi {
  seasonId: string | null;
  badge: string;
}

export function formatBadgeChoisi(seasonId: string | null, badge: string): string {
  return seasonId ? `${seasonId}:${badge}` : badge;
}

export function parseBadgeChoisi(valeur: string | null | undefined): BadgeChoisi | null {
  if (typeof valeur !== 'string' || valeur.length === 0) return null;

  if (!valeur.includes(':')) {
    return estUnBadgeDeRecompense(valeur) ? { seasonId: null, badge: valeur } : null;
  }

  const parties = valeur.split(':');
  if (parties.length !== 2) return null;
  const [seasonId, badge] = parties;
  if (!/^[A-Z]{2,4}$/.test(seasonId)) return null;
  if (!estUnBadgeDeSaison(badge)) return null;
  return { seasonId, badge };
}

export function estUnChoixValide(valeur: string | null | undefined): boolean {
  return parseBadgeChoisi(valeur) !== null;
}

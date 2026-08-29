import { estUnBadgeConnu } from './saisonBadges';

export interface BadgeChoisi {
  seasonId: string;
  badge: string;
}

export function formatBadgeChoisi(seasonId: string, badge: string): string {
  return `${seasonId}:${badge}`;
}

export function parseBadgeChoisi(valeur: string | null | undefined): BadgeChoisi | null {
  if (typeof valeur !== 'string') return null;
  const parties = valeur.split(':');
  if (parties.length !== 2) return null;
  const [seasonId, badge] = parties;
  if (!/^[A-Z]{2,4}$/.test(seasonId)) return null;
  if (!estUnBadgeConnu(badge)) return null;
  return { seasonId, badge };
}

export function estUnChoixValide(valeur: string | null | undefined): boolean {
  return parseBadgeChoisi(valeur) !== null;
}

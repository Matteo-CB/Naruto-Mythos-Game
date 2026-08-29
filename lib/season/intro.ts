import { SAISON_ARCHIVEE } from '@/lib/badges/saisonBadges';

export const DATE_DE_DEPLOIEMENT = new Date('2026-08-29T16:00:00.000Z');

export const PAGES_DE_LINTRO = ['highlander', 'badges', 'saison', 'elo'] as const;

export type PageDeLintro = (typeof PAGES_DE_LINTRO)[number];

export interface BadgeGagneDeLaSaison {
  seasonId: string;
  badge: string;
  rank: number;
}

export interface DonneesDeLintro {
  seasonId: string;
  badges: BadgeGagneDeLaSaison[];
  ancienElo: number | null;
  nouvelElo: number;
  ligue: string;
  niveau: number;
}

export function compteDejaInscrit(createdAt: Date | string | null | undefined): boolean {
  if (!createdAt) return false;
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < DATE_DE_DEPLOIEMENT.getTime();
}

export function pagesAAfficher(donnees: DonneesDeLintro): PageDeLintro[] {
  return PAGES_DE_LINTRO.filter((page) => page !== 'saison' || donnees.badges.length > 0);
}

export function introADejaEteVue(seenAt: Date | string | null | undefined): boolean {
  return !!seenAt;
}

export function doitVoirLintro(
  createdAt: Date | string | null | undefined,
  seenAt: Date | string | null | undefined,
): boolean {
  return compteDejaInscrit(createdAt) && !introADejaEteVue(seenAt);
}

export const SAISON_DE_LINTRO = SAISON_ARCHIVEE;

import { prisma } from '@/lib/db/prisma';
import { BADGE_VAINQUEUR_DE_TOURNOI, estUnBadgeDeRecompense } from './saisonBadges';

export async function decerneUnBadge(
  userId: string | null | undefined,
  badge: string,
  source?: string | null,
): Promise<boolean> {
  if (!userId || !estUnBadgeDeRecompense(badge)) return false;
  try {
    const cle = source ?? 'global';
    await prisma.playerBadge.upsert({
      where: { userId_badge_source: { userId, badge, source: cle } },
      create: { userId, badge, source: cle },
      update: {},
    });
    return true;
  } catch (err) {
    console.error('[Badges] award failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function decerneLeBadgeDeTournoi(
  userId: string | null | undefined,
  tournamentId: string,
): Promise<boolean> {
  return decerneUnBadge(userId, BADGE_VAINQUEUR_DE_TOURNOI, tournamentId);
}

export async function badgesDeRecompenseDe(userId: string): Promise<string[]> {
  try {
    const lignes = await prisma.playerBadge.findMany({
      where: { userId },
      select: { badge: true },
      distinct: ['badge'],
    });
    return lignes.map((l) => l.badge).filter(estUnBadgeDeRecompense);
  } catch {
    return [];
  }
}

export async function possedeLeBadge(userId: string, badge: string): Promise<boolean> {
  if (!estUnBadgeDeRecompense(badge)) return false;
  const ligne = await prisma.playerBadge.findFirst({
    where: { userId, badge },
    select: { id: true },
  });
  return !!ligne;
}

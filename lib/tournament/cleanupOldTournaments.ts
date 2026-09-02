import { prisma } from '@/lib/db/prisma';
import { graverAvantPurge } from '@/lib/tournament/nwlTiers';

export const TOURNAMENT_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface CleanupOldTournamentsResult {
  deleted: number;
  byStatus: Record<string, number>;
  classementsGraves: number;
}

export async function cleanupOldTournaments(now: number = Date.now()): Promise<CleanupOldTournamentsResult> {
  const cutoff = new Date(now - TOURNAMENT_RETENTION_MS);

  const candidates = await prisma.tournament.findMany({
    where: {
      OR: [
        { status: 'completed', completedAt: { lt: cutoff } },
        { status: 'cancelled', completedAt: { lt: cutoff } },
        { status: 'cancelled', completedAt: null, createdAt: { lt: cutoff }, scheduledStartAt: null },
        { status: 'cancelled', completedAt: null, scheduledStartAt: { lt: cutoff } },
        {
          status: 'pending',
          createdAt: { lt: cutoff },
          scheduledStartAt: null,
        },
        {
          status: 'pending',
          scheduledStartAt: { lt: cutoff, not: null },
        },
        { status: 'in_progress', startedAt: { lt: cutoff } },
      ],
    },
    select: { id: true, status: true },
  });

  if (candidates.length === 0) {
    return { deleted: 0, byStatus: {}, classementsGraves: 0 };
  }

  const byStatus: Record<string, number> = {};
  for (const c of candidates) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  }

  const ids = candidates.map((c) => c.id);

  let classementsGraves = 0;
  try {
    classementsGraves = await graverAvantPurge(ids);
  } catch (err) {
    console.error('[Cleanup] gravure des classements partenaires impossible, purge annulee:', err instanceof Error ? err.message : err);
    return { deleted: 0, byStatus: {}, classementsGraves: 0 };
  }

  const [, , result] = await prisma.$transaction([
    prisma.tournamentMatch.deleteMany({ where: { tournamentId: { in: ids } } }),
    prisma.tournamentParticipant.deleteMany({ where: { tournamentId: { in: ids } } }),
    prisma.tournament.deleteMany({ where: { id: { in: ids } } }),
  ]);

  return { deleted: result.count, byStatus, classementsGraves };
}

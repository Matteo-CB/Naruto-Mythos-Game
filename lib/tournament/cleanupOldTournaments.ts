import { prisma } from '@/lib/db/prisma';

export const TOURNAMENT_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface CleanupOldTournamentsResult {
  deleted: number;
  byStatus: Record<string, number>;
}

export async function cleanupOldTournaments(now: number = Date.now()): Promise<CleanupOldTournamentsResult> {
  const cutoff = new Date(now - TOURNAMENT_RETENTION_MS);
  const nowDate = new Date(now);

  const candidates = await prisma.tournament.findMany({
    where: {
      OR: [
        { status: 'completed', completedAt: { lt: cutoff } },
        { status: 'cancelled', createdAt: { lt: cutoff } },
        {
          status: 'pending',
          createdAt: { lt: cutoff },
          OR: [
            { scheduledStartAt: null },
            { scheduledStartAt: { lt: nowDate } },
          ],
        },
        { status: 'in_progress', createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true, status: true },
  });

  if (candidates.length === 0) {
    return { deleted: 0, byStatus: {} };
  }

  const byStatus: Record<string, number> = {};
  for (const c of candidates) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  }

  const ids = candidates.map((c) => c.id);
  const result = await prisma.tournament.deleteMany({ where: { id: { in: ids } } });

  return { deleted: result.count, byStatus };
}
